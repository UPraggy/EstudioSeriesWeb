// Utilidades da Mesa (edição): caminhos do episódio, JSON, números e ffmpeg/ffprobe com progresso.
// Caminhos de mídia dentro do edicao.json são RELATIVOS À PASTA DA SÉRIE (igual ao falas.json, ao jobs.json e à
// rota /Midia), por exemplo "acervo/x.mp4" ou "episodios/ep01/takes/p05/take_02.mp4".
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const armazem = require('../series/armazem');

const FPS_PADRAO = 24;

function erro(mensagem, status = 400, extra = {}) {
    return armazem.erro(mensagem, status, extra);
}

function numeroEp(ep) {
    const s = String(ep ?? '').trim().toLowerCase();
    const m = /^(?:ep)?0*(\d{1,3})$/.exec(s);
    const n = m ? Number(m[1]) : NaN;
    if (!Number.isInteger(n) || n < 1 || n > 999) throw erro(`Episódio inválido: ${ep}`);
    return n;
}

const idEp = (ep) => `ep${String(numeroEp(ep)).padStart(2, '0')}`;

// Pastas e arquivos de um episódio (valida o id da série: nada sai de <ESTUDIO_DADOS>/series/<id>).
function caminhos(serie, ep) {
    const pastaSerie = armazem.pastaSerie(serie);
    const epId = idEp(ep);
    const pastaEp = path.join(pastaSerie, 'episodios', epId);
    const interna = path.join(pastaEp, '.edicao');
    return {
        serie,
        n: numeroEp(ep),
        epId,
        pastaSerie,
        pastaEp,
        edicao: path.join(pastaEp, 'edicao.json'),
        mesa: path.join(pastaEp, 'mesa.json'),
        roteiro: path.join(pastaEp, 'roteiro.json'),
        falas: path.join(pastaEp, 'falas.json'),
        planos: path.join(pastaEp, 'planos.json'),
        interna,
        historico: path.join(interna, 'historico'),
        estadoHistorico: path.join(interna, 'historico.json'),
        saida: path.join(pastaEp, 'saida'),
        cache: path.join(pastaSerie, '.cache'),
    };
}

// Só a série (miniaturas, ondas e quadros não dependem do episódio).
function pastasSerie(serie) {
    const pastaSerie = armazem.pastaSerie(serie);
    return { pastaSerie, cache: path.join(pastaSerie, '.cache') };
}

// Caminho relativo à série (com "/") → absoluto, sem sair da pasta da série.
function absolutoNaSerie(pastaSerie, relativo) {
    if (!relativo || typeof relativo !== 'string') throw erro('Caminho de mídia vazio.');
    const alvo = path.resolve(pastaSerie, relativo);
    if (!armazem.dentroDe(pastaSerie, alvo) || alvo === path.resolve(pastaSerie)) throw erro(`Caminho fora da série: ${relativo}`);
    return alvo;
}

const relativoNaSerie = (pastaSerie, abs) => path.relative(pastaSerie, abs).split(path.sep).join('/');

async function lerJson(arquivo, padrao = null) {
    try {
        return JSON.parse((await fsp.readFile(arquivo, 'utf8')).replace(/^﻿/, ''));
    } catch (e) {
        if (e.code === 'ENOENT') return padrao;
        throw erro(`Não consegui ler ${path.basename(arquivo)}: ${e.message}`, 500);
    }
}

async function gravarJson(arquivo, dados, { pastaSerie } = {}) {
    if (pastaSerie) return armazem.gravarNaSerie(pastaSerie, arquivo, dados);
    return armazem.escreverJsonAtomico(arquivo, dados);
}

const comTrava = (chave, fn) => armazem.comTrava(chave, fn);

const arred = (n, casas = 3) => Math.round(Number(n) * 10 ** casas) / 10 ** casas;
const noQuadro = (s, fps = FPS_PADRAO) => Math.round(Number(s) * fps) / fps;
const novoId = (prefixo) => `${prefixo}${Date.now().toString(36)}${crypto.randomBytes(2).toString('hex')}`;
const sha = (texto) => crypto.createHash('sha1').update(String(texto)).digest('hex').slice(0, 16);

// Normaliza palavras para comparar (sem acento, minúsculas).
function palavrasDe(texto) {
    return String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
        .split(/[^a-z0-9]+/).filter((p) => p.length >= 4);
}

// ---------- ffmpeg / ffprobe ----------
const FFMPEG = () => process.env.FFMPEG || 'ffmpeg';
const FFPROBE = () => process.env.FFPROBE || 'ffprobe';

/**
 * rodarFfmpeg(args, { cwd, aoProgresso(segundos), timeoutMs, saidaBinaria })
 * Com aoProgresso, acrescenta "-progress pipe:1" e chama com o tempo já processado (s).
 * Com saidaBinaria, devolve o stdout em Buffer (ex.: PCM para a forma de onda).
 */
function rodarFfmpeg(args, { cwd, aoProgresso, timeoutMs = 15 * 60 * 1000, saidaBinaria = false } = {}) {
    return new Promise((resolve, reject) => {
        const extra = aoProgresso ? ['-progress', 'pipe:1', '-nostats'] : [];
        const proc = spawn(FFMPEG(), ['-hide_banner', '-nostdin', '-loglevel', 'error', ...extra, ...args], { cwd, windowsHide: true });
        const erros = [];
        const saida = [];
        let resto = '';
        const relogio = setTimeout(() => { proc.kill(); reject(erro('ffmpeg demorou demais e foi interrompido.', 500)); }, timeoutMs);
        proc.stderr.on('data', (d) => { erros.push(d); if (erros.length > 200) erros.shift(); });
        proc.stdout.on('data', (d) => {
            if (saidaBinaria) { saida.push(d); return; }
            if (!aoProgresso) return;
            resto += d.toString('utf8');
            const linhas = resto.split(/\r?\n/);
            resto = linhas.pop();
            for (const l of linhas) {
                const m = /^out_time_(?:us|ms)=(\d+)/.exec(l);
                if (m) aoProgresso(Number(m[1]) / 1e6);
            }
        });
        proc.on('error', (e) => { clearTimeout(relogio); reject(erro(`ffmpeg não encontrado: ${e.message}`, 500)); });
        proc.on('close', (codigo) => {
            clearTimeout(relogio);
            if (codigo) return reject(erro(`ERRO ffmpeg: ${Buffer.concat(erros).toString('utf8').slice(-1500)}`, 500));
            resolve(saidaBinaria ? Buffer.concat(saida) : { stderr: Buffer.concat(erros).toString('utf8') });
        });
    });
}

function ffprobeJson(arquivo) {
    return new Promise((resolve, reject) => {
        const proc = spawn(FFPROBE(), ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height,r_frame_rate',
            '-of', 'json', arquivo], { windowsHide: true });
        let out = '';
        proc.stdout.on('data', (d) => { out += d; });
        proc.on('error', (e) => reject(erro(`ffprobe não encontrado: ${e.message}`, 500)));
        proc.on('close', (c) => {
            if (c) return reject(erro(`ffprobe falhou em ${path.basename(arquivo)}`, 500));
            try { resolve(JSON.parse(out)); } catch { reject(erro('ffprobe devolveu JSON inválido', 500)); }
        });
    });
}

// { duracaoS, largura, altura, temVideo, temAudio } com cache por arquivo+mtime (na memória).
const cacheInfo = new Map();
async function infoMidia(arquivo) {
    const st = await fsp.stat(arquivo).catch(() => null);
    if (!st) throw erro(`Arquivo não encontrado: ${path.basename(arquivo)}`, 404);
    const chave = `${arquivo}|${st.mtimeMs}|${st.size}`;
    if (cacheInfo.has(chave)) return cacheInfo.get(chave);
    const j = await ffprobeJson(arquivo);
    const streams = j.streams || [];
    const v = streams.find((s) => s.codec_type === 'video');
    const info = {
        duracaoS: arred(Number(j.format && j.format.duration) || 0),
        largura: v ? Number(v.width) || null : null,
        altura: v ? Number(v.height) || null : null,
        temVideo: Boolean(v),
        temAudio: streams.some((s) => s.codec_type === 'audio'),
    };
    cacheInfo.set(chave, info);
    return info;
}

const ehImagem = (arq) => /\.(png|jpe?g|webp)$/i.test(String(arq || ''));
const existe = (arq) => fs.existsSync(arq);

module.exports = {
    FPS_PADRAO, erro, numeroEp, idEp, caminhos, pastasSerie, absolutoNaSerie, relativoNaSerie, lerJson, gravarJson, comTrava,
    arred, noQuadro, novoId, sha, palavrasDe, rodarFfmpeg, ffprobeJson, infoMidia, ehImagem, existe,
};
