// Geração simples (avulsa): <ESTUDIO_DADOS>\geracao-simples\<id>\pedido.json (CONTRATOS) + anexos copiados.
const crypto = require('crypto');
const fsp = require('fs/promises');
const path = require('path');
const { ErroValidacao } = require('./erros');
const util = require('./util');

const RE_ID = /^\d{4}-\d{2}-\d{2}-\d{4}-[0-9a-f]{4}$/;
const PAPEIS_IMAGEM = ['primeiro_quadro', 'ultimo_quadro', 'referencia'];
const LIMITE_BYTES = 50 * 1024 * 1024;

function gerarId(agora = new Date()) {
    const p = (n) => String(n).padStart(2, '0');
    return `${agora.getFullYear()}-${p(agora.getMonth() + 1)}-${p(agora.getDate())}-${p(agora.getHours())}${p(agora.getMinutes())}-${crypto.randomBytes(2).toString('hex')}`;
}

function pastaDe(raiz, id) {
    if (!RE_ID.test(String(id))) throw new ErroValidacao(`Id de geração simples inválido: ${id}`);
    return path.join(raiz, 'geracao-simples', id);
}

function nomeSeguro(nome, i) {
    const base = path.basename(String(nome)).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '-').slice(-80) || 'anexo';
    return `${String(i + 1).padStart(2, '0')}-${base}`;
}

async function copiarAnexos(anexos, pastaAnexos) {
    const saida = [];
    for (const [i, a] of (anexos || []).entries()) {
        const n = i + 1;
        const tipo = a && a.tipo;
        if (!['imagem', 'video', 'texto'].includes(tipo)) throw new ErroValidacao(`Anexo ${n}: tipo deve ser imagem, video ou texto.`);
        if (tipo === 'video' || a.papel === 'video_entrada') {
            throw new ErroValidacao(`Anexo ${n}: vídeo de entrada ainda não é suportado (o formato no OpenRouter não está confirmado; ver API.md).`);
        }
        const papel = tipo === 'texto' ? (a.papel || 'referencia') : a.papel;
        if (tipo === 'imagem' && !PAPEIS_IMAGEM.includes(papel)) {
            throw new ErroValidacao(`Anexo ${n}: papel deve ser ${PAPEIS_IMAGEM.join(', ')}.`);
        }
        await fsp.mkdir(pastaAnexos, { recursive: true });
        let nome;
        if (a.caminho) {
            let st;
            try {
                st = await fsp.stat(a.caminho);
            } catch {
                throw new ErroValidacao(`Anexo ${n}: arquivo não encontrado (${a.caminho}).`);
            }
            if (!st.isFile()) throw new ErroValidacao(`Anexo ${n}: não é um arquivo (${a.caminho}).`);
            if (st.size > LIMITE_BYTES) throw new ErroValidacao(`Anexo ${n}: maior que 50 MB.`);
            nome = nomeSeguro(a.nome || a.caminho, i);
            await fsp.copyFile(a.caminho, path.join(pastaAnexos, nome));
        } else if (typeof a.base64 === 'string' && a.base64) {
            const buf = Buffer.from(a.base64.replace(/^data:[^,]*,/, ''), 'base64');
            if (!buf.length) throw new ErroValidacao(`Anexo ${n}: base64 vazio.`);
            if (buf.length > LIMITE_BYTES) throw new ErroValidacao(`Anexo ${n}: maior que 50 MB.`);
            nome = nomeSeguro(a.nome || (tipo === 'texto' ? 'texto.txt' : 'imagem.png'), i);
            await fsp.writeFile(path.join(pastaAnexos, nome), buf);
        } else if (tipo === 'texto' && typeof a.texto === 'string') {
            nome = nomeSeguro(a.nome || 'texto.txt', i);
            await fsp.writeFile(path.join(pastaAnexos, nome), a.texto, 'utf8');
        } else {
            throw new ErroValidacao(`Anexo ${n}: mande "caminho" (arquivo local) ou "base64".`);
        }
        saida.push({ tipo, arquivo: `anexos/${nome}`, papel });
    }
    return saida;
}

/**
 * criar(raiz, corpo) → { id, pasta, pj }  (pedido.json gravado; anexos copiados)
 * corpo: { tipo: 'video'|'imagem', texto, anexos: [{ tipo, papel, caminho | base64 + nome | texto }],
 *          modelo, duracaoS, proporcao, resolucao, audio }
 */
async function criar(raiz, corpo = {}) {
    if (!corpo.modelo) throw new ErroValidacao('Informe o modelo.');
    if (!corpo.texto && !(corpo.anexos || []).length) throw new ErroValidacao('Escreva o texto do pedido (ou anexe algo).');
    const tipo = corpo.tipo === 'imagem' ? 'imagem' : 'video';
    const id = gerarId();
    const pasta = pastaDe(raiz, id);
    await fsp.mkdir(pasta, { recursive: true });
    try {
        const anexos = await copiarAnexos(corpo.anexos, path.join(pasta, 'anexos'));
        const pj = {
            versao: 1,
            id,
            tipo,
            texto: corpo.texto || '',
            anexos,
            modelo: corpo.modelo,
            ...(tipo === 'video' ? { duracaoS: corpo.duracaoS === undefined ? null : Number(corpo.duracaoS) } : {}),
            proporcao: corpo.proporcao || '9:16',
            resolucao: corpo.resolucao || null,
            ...(tipo === 'video' ? { audio: corpo.audio === true } : {}),
            custoPrevistoUsd: null,
            resultado: null,
            criadoEm: new Date().toISOString(),
        };
        await util.escreverJsonAtomico(path.join(pasta, 'pedido.json'), pj);
        return { id, pasta, pj };
    } catch (e) {
        await fsp.rm(pasta, { recursive: true, force: true }).catch(() => {});
        throw e;
    }
}

async function ler(raiz, id) {
    const pasta = pastaDe(raiz, id);
    const pj = await util.lerJson(path.join(pasta, 'pedido.json'), null);
    if (!pj) throw new ErroValidacao(`Geração simples ${id} não encontrada.`);
    return { pasta, pj };
}

async function salvar(raiz, pj) {
    await util.escreverJsonAtomico(path.join(pastaDe(raiz, pj.id), 'pedido.json'), pj);
}

// pedido.json → pedido de geração (caminhos relativos à pasta geracao-simples, que é a base do contexto).
async function pedidoDeGeracao(pj, pasta) {
    const rel = (a) => `${pj.id}/${a.arquivo}`;
    const textos = [];
    for (const a of pj.anexos || []) {
        if (a.tipo === 'texto') textos.push((await fsp.readFile(path.join(pasta, a.arquivo), 'utf8')).trim());
    }
    const prompt = [pj.texto, ...textos].filter(Boolean).join('\n\n');
    const imagens = (pj.anexos || []).filter((a) => a.tipo === 'imagem');
    const comum = { modelo: pj.modelo, prompt, proporcao: pj.proporcao || undefined, resolucao: pj.resolucao || undefined, etapa: 'geracao-simples', ref: `simples/${pj.id}` };
    if (pj.tipo === 'imagem') {
        return { tipo: 'imagem', pedido: { ...comum, referencias: imagens.map(rel), destino: `${pj.id}/resultado.png` } };
    }
    const primeiro = imagens.find((a) => a.papel === 'primeiro_quadro');
    const ultimo = imagens.find((a) => a.papel === 'ultimo_quadro');
    return {
        tipo: 'video',
        pedido: {
            ...comum,
            duracaoS: pj.duracaoS === null ? undefined : pj.duracaoS,
            audio: pj.audio === true,
            quadros: { primeiro: primeiro ? rel(primeiro) : undefined, ultimo: ultimo ? rel(ultimo) : undefined },
            referencias: imagens.filter((a) => a.papel === 'referencia').map(rel),
            destino: `${pj.id}/resultado.mp4`,
        },
    };
}

const STATUS_RESULTADO = { pronto: 'pronto', falhou: 'falhou', incerto: 'falhou' };

// Atualiza pedido.json.resultado a partir do job (destino "<id>/resultado.*").
async function atualizarResultado(raiz, job) {
    const m = job && typeof job.destino === 'string' && job.destino.match(/^(\d{4}-\d{2}-\d{2}-\d{4}-[0-9a-f]{4})\/resultado\.\w+$/);
    if (!m) return null;
    const { pj } = await ler(raiz, m[1]);
    const arquivo = (job.arquivos && job.arquivos[0]) || job.destino;
    pj.resultado = {
        caminho: arquivo.replace(`${m[1]}/`, ''),
        custoUsd: job.status === 'pronto' ? (job.custoUsd ?? null) : null,
        status: STATUS_RESULTADO[job.status] || 'pendente',
        jobId: job.jobId,
        ...(job.erro ? { erro: job.erro } : {}),
        ...(job.simulado ? { simulado: true } : {}),
    };
    await salvar(raiz, pj);
    return pj;
}

module.exports = { gerarId, pastaDe, criar, ler, salvar, pedidoDeGeracao, atualizarResultado, RE_ID };
