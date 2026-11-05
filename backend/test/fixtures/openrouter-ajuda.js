// Ajudantes dos testes do cliente OpenRouter: fetch falso (sem rede), pastas temporárias, livro em memória.
const fs = require('fs');
const os = require('os');
const path = require('path');

const PASTA = __dirname;
const CHAVE_TESTE = 'sk-or-v1-TESTE0123456789abcdefSEGREDOnaoVAZAR';

// Pastas temporárias dos testes do OpenRouter (apagadas quando o processo do teste termina).
const criadas = [];
process.on('exit', () => {
    for (const p of criadas) {
        try { fs.rmSync(p, { recursive: true, force: true }); } catch { /* o Windows pode segurar um arquivo: fica no %TEMP% */ }
    }
});
function pastaTemp(prefixo = '') {
    const p = fs.mkdtempSync(path.join(os.tmpdir(), `estudio-or-${prefixo}`));
    criadas.push(p);
    return p;
}

function lerFixture(nome) {
    return JSON.parse(fs.readFileSync(path.join(PASTA, nome), 'utf8'));
}

function modeloVideo(id) {
    const m = lerFixture('videos-models.json').data.find((x) => x.id === id);
    if (!m) throw new Error(`fixture sem ${id}`);
    return m;
}

// Semeia o cache de catálogo numa raiz temporária (para não precisar de GET).
function semearCatalogo(raiz) {
    const pasta = path.join(raiz, 'catalogo');
    fs.mkdirSync(path.join(pasta, 'imagens-endpoints'), { recursive: true });
    const agora = new Date().toISOString();
    const gravar = (arq, dados) => fs.writeFileSync(path.join(pasta, arq), JSON.stringify({ versao: 1, baixadoEm: agora, dados }));
    gravar('videos.json', lerFixture('videos-models.json'));
    gravar('imagens.json', lerFixture('imagens-models.json'));
    gravar('modelos.json', lerFixture('modelos-texto.json'));
    gravar(path.join('imagens-endpoints', 'google__gemini-3.1-flash-image.json'), lerFixture('endpoints-gemini-3.1-flash-image.json'));
    gravar(path.join('imagens-endpoints', 'bytedance-seed__seedream-4.5.json'), lerFixture('endpoints-seedream-4.5.json'));
}

/**
 * fetch falso: handler({ url, metodo, headers, corpo, signal }) → { status, json?, texto?, bytes?, headers? }
 * (ou lança). Guarda as chamadas em fetch.chamadas.
 */
function criarFetchFalso(handler) {
    const chamadas = [];
    async function fetchFalso(url, init = {}) {
        const req = {
            url: String(url),
            metodo: init.method || 'GET',
            headers: init.headers || {},
            corpo: init.body ? JSON.parse(init.body) : undefined,
            signal: init.signal,
        };
        chamadas.push(req);
        const r = await handler(req, chamadas.length);
        const status = r.status || 200;
        const headers = r.headers || {};
        if (r.bytes) return new Response(r.bytes, { status, headers });
        if (r.json !== undefined) return new Response(JSON.stringify(r.json), { status, headers: { 'content-type': 'application/json', ...headers } });
        return new Response(r.texto || '', { status, headers });
    }
    fetchFalso.chamadas = chamadas;
    return fetchFalso;
}

function livroMemoria() {
    const linhas = [];
    return {
        linhas,
        registrar(l) { linhas.push(l); },
        async total({ ep } = {}) {
            return linhas.filter((l) => ep === undefined || ep === null || l.ep === ep).reduce((s, l) => s + (l.realUsd ?? l.previstoUsd), 0);
        },
    };
}

// Captura console.log/error/warn durante fn (para provar que a chave não vaza em log).
async function capturarConsole(fn) {
    const saida = [];
    const orig = { log: console.log, error: console.error, warn: console.warn };
    for (const k of Object.keys(orig)) console[k] = (...a) => saida.push(a.map(String).join(' '));
    try {
        await fn();
    } finally {
        Object.assign(console, orig);
    }
    return saida.join('\n');
}

const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

module.exports = { CHAVE_TESTE, PNG_1PX, pastaTemp, lerFixture, modeloVideo, semearCatalogo, criarFetchFalso, livroMemoria, capturarConsole };
