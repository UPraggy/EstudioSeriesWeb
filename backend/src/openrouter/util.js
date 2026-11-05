// Utilitários do cliente OpenRouter: JSON estável, hash, arquivos atômicos, travas, dinheiro.
const crypto = require('crypto');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

function dormir(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

// JSON com chaves ordenadas (o mesmo objeto sempre gera o mesmo texto).
function jsonEstavel(valor) {
    if (valor === undefined) return 'null';
    if (valor === null || typeof valor !== 'object') return JSON.stringify(valor);
    if (Array.isArray(valor)) return `[${valor.map(jsonEstavel).join(',')}]`;
    const chaves = Object.keys(valor).filter((k) => valor[k] !== undefined).sort();
    return `{${chaves.map((k) => `${JSON.stringify(k)}:${jsonEstavel(valor[k])}`).join(',')}}`;
}

function hashCanonico(valor) {
    return crypto.createHash('sha1').update(jsonEstavel(valor)).digest('hex');
}

async function sha1Arquivo(caminho) {
    const h = crypto.createHash('sha1');
    await new Promise((resolve, reject) => {
        fs.createReadStream(caminho).on('data', (d) => h.update(d)).on('end', resolve).on('error', reject);
    });
    return h.digest('hex');
}

async function lerJson(arquivo, padrao = null) {
    try {
        return JSON.parse(await fsp.readFile(arquivo, 'utf8'));
    } catch (e) {
        if (e.code === 'ENOENT') return padrao;
        throw new Error(`Não consegui ler ${path.basename(arquivo)}: ${e.message}`);
    }
}

// Grava em arquivo temporário e renomeia (nunca deixa JSON pela metade).
async function escreverJsonAtomico(arquivo, obj) {
    await fsp.mkdir(path.dirname(arquivo), { recursive: true });
    const tmp = `${arquivo}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    await fsp.writeFile(tmp, `${JSON.stringify(obj, null, 2)}\n`, 'utf8');
    for (let tentativa = 1; ; tentativa++) {
        try {
            await fsp.rename(tmp, arquivo);
            return;
        } catch (e) {
            // No Windows o antivírus pode segurar o arquivo por instantes.
            if (tentativa >= 5 || !['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) {
                await fsp.rm(tmp, { force: true });
                throw e;
            }
            await dormir(50 * tentativa);
        }
    }
}

// Trava por chave (ex.: caminho do jobs.json): executa uma operação por vez.
const travas = new Map();
function emSerie(chave, fn) {
    const anterior = travas.get(chave) || Promise.resolve();
    const atual = anterior.then(fn, fn);
    const guarda = atual.catch(() => {});
    travas.set(chave, guarda);
    guarda.then(() => { if (travas.get(chave) === guarda) travas.delete(chave); });
    return atual;
}

// 6 casas: texto custa frações de centavo (US$ 0,00002) e não pode virar zero.
function arredondarUsd(v) {
    return Math.round(Number(v) * 1e6) / 1e6;
}

// US$ 0,24 · US$ 0,0031 (valores pequenos com mais casas)
function formatarUsd(v) {
    const n = Number(v) || 0;
    const casas = n !== 0 && Math.abs(n) < 0.01 ? 4 : 2;
    return `US$ ${n.toFixed(casas).replace('.', ',')}`;
}

const MIME = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
    '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
};
function mimeDe(caminho) {
    return MIME[path.extname(caminho).toLowerCase()] || 'application/octet-stream';
}
function extensaoDeMime(mime) {
    const achado = Object.entries(MIME).find(([, m]) => m === mime);
    return achado ? (achado[0] === '.jpeg' ? '.jpg' : achado[0]) : '.png';
}

async function dataUrlDeArquivo(caminho) {
    const buf = await fsp.readFile(caminho);
    return `data:${mimeDe(caminho)};base64,${buf.toString('base64')}`;
}

function ehUrl(v) {
    return typeof v === 'string' && /^https?:\/\//i.test(v);
}

module.exports = {
    dormir, jsonEstavel, hashCanonico, sha1Arquivo, lerJson, escreverJsonAtomico, emSerie,
    arredondarUsd, formatarUsd, mimeDe, extensaoDeMime, dataUrlDeArquivo, ehUrl,
};
