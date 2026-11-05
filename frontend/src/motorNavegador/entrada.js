// Entrada do pacote "backend no navegador" (empacotado pelo esbuild em vite-plugin-motor.js).
// Usa os MESMOS controllers do backend (backend/src/controllersMapa.js), com:
//   fs/fs.promises → sistema de arquivos virtual (vfs.js) sobre um armazém do navegador;
//   path, crypto, os, stream, child_process → substitutos em ponte/;
//   process e Buffer → versões próprias (injetadas), com ESTUDIO_DADOS=/dados.
// A tela nunca importa este arquivo direto: passa por ./cliente.js (carrega sob demanda).
import { vfs, processo, DADOS, aoErroGravar } from './estado.js';
import { Buffer } from './buffer.js';
import amostras from 'estudio:amostras';
import mapa from '../../../backend/src/controllersMapa.js';
import midia from '../../../backend/src/controllers/Midia.js';
import midiaSimples from '../../../backend/src/controllers/MidiaSimples.js';

const { controllers, controllersGet } = mapa;

const TIPOS = {
    '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
    '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.json': 'application/json',
    '.srt': 'text/plain; charset=utf-8', '.ass': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
    '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff2': 'font/woff2', '.woff': 'font/woff',
};

// Rotas que dependem de ffmpeg/Python (voz, QA, mixagem, miniaturas, quadro, montagem). No navegador elas respondem
// com erro claro até as etapas 5–7 de docs/PUBLICAR-SEM-BACKEND.md. A tela usa a lista para avisar antes.
export const ROTAS_SO_NO_PC = [
    'GerarFalas', 'OuvirFala', 'TestarPronuncia', 'MixarAudio', 'RegerarFala',
    'MiniaturasClipe', 'OndaAudio', 'ExtrairQuadro', 'RenderizarEpisodio',
];

let iniciado = null;

/**
 * iniciar({ armazem, aoProgresso }) → { arquivos, precarregados, armazem }
 * Monta o armazém em /dados, cria /tmp (só memória) e embute as amostras do modo simulado.
 */
export function iniciar({ armazem, aoProgresso } = {}) {
    if (iniciado) return iniciado;
    iniciado = (async () => {
        if (!armazem) throw new Error('Sem armazém para o motor do navegador.');
        for (const [nome, b64] of Object.entries(amostras)) {
            vfs.embutir(`/app/backend/src/openrouter/amostras/${nome}`, Buffer.from(b64, 'base64'));
        }
        vfs.fs.mkdirSync('/tmp', { recursive: true });
        const r = await vfs.montar(DADOS, armazem, { aoProgresso });
        vfs.fs.mkdirSync(`${DADOS}/series`, { recursive: true });
        await vfs.liberar();
        return { ...r, armazem: { tipo: armazem.tipo, nome: armazem.nome } };
    })();
    iniciado.catch(() => { iniciado = null; });
    return iniciado;
}

// Chave do OpenRouter só na memória do motor (quem decide lembrar ou não é chave.js, na tela).
export function definirChave(chave) {
    if (chave) processo.env.OPENROUTER_API_KEY = String(chave).trim();
    else delete processo.env.OPENROUTER_API_KEY;
}

export function definirSimulado(ligado) {
    if (ligado) processo.env.ESTUDIO_SIMULADO = '1';
    else delete processo.env.ESTUDIO_SIMULADO;
}

export function situacao() {
    return {
        temChave: Boolean(processo.env.OPENROUTER_API_KEY),
        simuladoForcado: processo.env.ESTUDIO_SIMULADO === '1',
        vfs: vfs.estado(),
    };
}

export { aoErroGravar };

// Pedido e resposta falsos com a mesma cara do Express (req.query, req.body, res.status().json()).
function criarResposta(resolver) {
    const res = {
        statusCode: 200,
        cabecalhos: {},
        headersSent: false,
        status(n) { res.statusCode = n; return res; },
        setHeader(k, v) { res.cabecalhos[String(k).toLowerCase()] = v; return res; },
        set(k, v) { return res.setHeader(k, v); },
        type(t) { return res.setHeader('content-type', t); },
        json(corpo) { res.headersSent = true; resolver({ status: res.statusCode, corpo }); return res; },
        send(corpo) { res.headersSent = true; resolver({ status: res.statusCode, corpo }); return res; },
        end() { res.headersSent = true; resolver({ status: res.statusCode, corpo: null }); return res; },
        sendFile(arquivo) { res.headersSent = true; resolver({ status: res.statusCode, corpo: { arquivo } }); return res; },
    };
    return res;
}

/**
 * chamar('GET'|'POST', 'NomeRota', { query, body }) → { status, corpo }
 * O corpo passa por JSON (igual à rede: datas viram texto, nada da memória do motor vaza por referência).
 * Só responde depois que tudo o que a rota escreveu foi gravado no armazém.
 */
export async function chamar(metodo, rota, { query = {}, body = {} } = {}) {
    if (!iniciado) throw new Error('O motor do navegador ainda não foi iniciado.');
    await iniciado;
    const tabela = metodo === 'GET' ? controllersGet : controllers;
    const c = Object.prototype.hasOwnProperty.call(tabela, rota) ? tabela[rota] : null;
    if (!c) return { status: 404, corpo: { Error: `Rota ${metodo} /${rota} não existe.` } };
    const req = {
        method: metodo,
        query: Object.fromEntries(Object.entries(query || {}).map(([k, v]) => [k, v === undefined || v === null ? '' : String(v)])),
        body: JSON.parse(JSON.stringify(body || {})),
        headers: {},
        params: {},
        get: () => undefined,
    };
    const resultado = await new Promise((resolver) => {
        const res = criarResposta(resolver);
        Promise.resolve()
            .then(() => c.REST(req, res))
            .then(() => { if (!res.headersSent) resolver({ status: 204, corpo: null }); })
            .catch((e) => resolver({ status: e.status || 500, corpo: { Error: e.message } }));
    });
    const erros = await vfs.liberar();
    let corpo = resultado.corpo === undefined ? null : JSON.parse(JSON.stringify(resultado.corpo));
    if (erros.length && !(corpo && corpo.Error)) {
        corpo = { Error: `A operação foi feita, mas parte não foi gravada no armazenamento do navegador: ${erros.join(' | ')}` };
        return { status: 500, corpo };
    }
    return { status: resultado.status, corpo };
}

/**
 * lerMidia('Midia'|'MidiaSimples', query) → { blob, tipo }
 * Mesmas regras do backend (caminho preso dentro da série / da geração simples).
 */
export async function lerMidia(rota, query = {}) {
    await iniciado;
    const alvo = rota === 'MidiaSimples' ? midiaSimples.resolver(query.id, query.caminho) : midia.resolver(query.serie, query.caminho);
    const st = vfs.fs.statSync(alvo, { throwIfNoEntry: false });
    if (!st || !st.isFile()) throw Object.assign(new Error('Arquivo não encontrado.'), { status: 404 });
    const ext = alvo.slice(alvo.lastIndexOf('.')).toLowerCase();
    return { blob: await vfs.lerBlob(alvo), tipo: TIPOS[ext] || 'application/octet-stream' };
}

export async function liberar() {
    return vfs.liberar();
}

// Exportar/inspecionar (testes e tela de Configurações).
export const fsMotor = vfs.fs;
