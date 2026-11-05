// MÃ­dia da Mesa: tira de miniaturas por clipe, forma de onda (picos em JSON) e quadro em t (png).
// Tudo com cache em <sÃ©rie>/.cache/ (chave = arquivo + tamanho + data), servido pela rota /Midia.
const fsp = require('fs/promises');
const path = require('path');
const U = require('./util');

const PICOS_POR_S = 100;
const TAXA_ONDA = 8000;

async function chaveDe(abs, extra) {
    const st = await fsp.stat(abs).catch(() => null);
    if (!st) throw U.erro(`Arquivo nÃ£o encontrado: ${path.basename(abs)}`, 404);
    return U.sha(`${abs}|${st.size}|${st.mtimeMs}|${extra}`);
}

function pastaCache(serie, sub) {
    return path.join(U.pastasSerie(serie).cache, sub);
}

/**
 * Tira de miniaturas (uma imagem com N quadros lado a lado, altura fixa) de um vÃ­deo ou imagem.
 * â†’ { arquivo (relativo Ã  sÃ©rie), n, larguraQuadro, alturaQuadro, duracaoS }
 */
async function miniaturas({ serie, caminho, n, altura = 96 }) {
    const pastaSerie = U.pastasSerie(serie).pastaSerie;
    const abs = U.absolutoNaSerie(pastaSerie, caminho);
    const alt = Math.max(32, Math.min(240, Math.round(Number(altura) || 96)));
    if (U.ehImagem(abs)) {
        const info = await U.infoMidia(abs);
        const larg = Math.round((alt * (info.largura || 9)) / (info.altura || 16));
        return { arquivo: caminho, n: 1, larguraQuadro: larg, alturaQuadro: alt, duracaoS: 0, imagem: true };
    }
    const info = await U.infoMidia(abs);
    if (!info.temVideo) throw U.erro('Este arquivo nÃ£o tem vÃ­deo.');
    const dur = Math.max(0.1, info.duracaoS);
    const qtd = Math.max(2, Math.min(60, Math.round(Number(n) || Math.ceil(dur * 2))));
    const larg = Math.round((alt * (info.largura || 9)) / (info.altura || 16) / 2) * 2;
    const chave = await chaveDe(abs, `mini|${qtd}|${alt}`);
    const pasta = pastaCache(serie, 'miniaturas');
    const saida = path.join(pasta, `${chave}.jpg`);
    if (!U.existe(saida)) {
        await fsp.mkdir(pasta, { recursive: true });
        const tmp = `${saida}.${process.pid}.tmp.jpg`;
        // um quadro no meio de cada fatia de tempo
        await U.rodarFfmpeg(['-y', '-i', abs, '-vf', `fps=${qtd}/${dur.toFixed(3)},scale=${larg}:${alt},tile=${qtd}x1`,
            '-frames:v', '1', '-q:v', '4', tmp]);
        await fsp.rename(tmp, saida).catch(async () => { await fsp.rm(tmp, { force: true }); });
    }
    return { arquivo: U.relativoNaSerie(pastaSerie, saida), n: qtd, larguraQuadro: larg, alturaQuadro: alt, duracaoS: dur };
}

// Picos (0â€“1) a cada 1/100 s, de qualquer arquivo com Ã¡udio (wav, mp3, mp4).
function picosDePcm(buf, porS = PICOS_POR_S, taxa = TAXA_ONDA) {
    const amostras = Math.floor(buf.length / 2);
    const passo = Math.max(1, Math.round(taxa / porS));
    const picos = [];
    for (let i = 0; i < amostras; i += passo) {
        let max = 0;
        const fim = Math.min(amostras, i + passo);
        for (let k = i; k < fim; k++) {
            const v = Math.abs(buf.readInt16LE(k * 2));
            if (v > max) max = v;
        }
        picos.push(Math.round((max / 32768) * 1000) / 1000);
    }
    return picos;
}

async function onda({ serie, caminho }) {
    const pastaSerie = U.pastasSerie(serie).pastaSerie;
    const abs = U.absolutoNaSerie(pastaSerie, caminho);
    const chave = await chaveDe(abs, `onda|${PICOS_POR_S}`);
    const pasta = pastaCache(serie, 'ondas');
    const arq = path.join(pasta, `${chave}.json`);
    const cache = await U.lerJson(arq, null);
    if (cache) return cache;
    const info = await U.infoMidia(abs);
    if (!info.temAudio) return { duracaoS: info.duracaoS, porSegundo: PICOS_POR_S, picos: [], semAudio: true };
    const pcm = await U.rodarFfmpeg(['-i', abs, '-vn', '-ac', '1', '-ar', String(TAXA_ONDA), '-f', 's16le', '-acodec', 'pcm_s16le', 'pipe:1'], { saidaBinaria: true });
    const picos = picosDePcm(pcm);
    // normaliza pelo maior pico (a forma fica legÃ­vel mesmo em fala baixa), guardando o pico real
    const maior = Math.max(0.0001, ...picos);
    const r = { duracaoS: info.duracaoS, porSegundo: PICOS_POR_S, picoReal: maior, picos: picos.map((p) => Math.round((p / maior) * 1000) / 1000) };
    await fsp.mkdir(pasta, { recursive: true });
    await U.gravarJson(arq, r);
    return r;
}

/**
 * Quadro do arquivo no tempo tS (do prÃ³prio arquivo) â†’ png.
 * saida (absoluto) opcional; sem ela vai para o cache. Imagem: devolve a prÃ³pria imagem.
 */
async function extrairQuadro({ serie, caminho, tS = 0, saida = null, largura = null }) {
    const pastaSerie = U.pastasSerie(serie).pastaSerie;
    const abs = U.absolutoNaSerie(pastaSerie, caminho);
    if (U.ehImagem(abs)) {
        if (!saida) return { arquivo: caminho, tS: 0 };
        await fsp.mkdir(path.dirname(saida), { recursive: true });
        await U.rodarFfmpeg(['-y', '-i', abs, '-frames:v', '1', saida]);
        return { arquivo: U.relativoNaSerie(pastaSerie, saida), tS: 0 };
    }
    const info = await U.infoMidia(abs);
    const t = Math.max(0, Math.min(Number(tS) || 0, Math.max(0, info.duracaoS - 0.05)));
    let destino = saida;
    if (!destino) {
        const chave = await chaveDe(abs, `quadro|${t.toFixed(3)}|${largura || ''}`);
        destino = path.join(pastaCache(serie, 'quadros'), `${chave}.png`);
        if (U.existe(destino)) return { arquivo: U.relativoNaSerie(pastaSerie, destino), tS: U.arred(t) };
    }
    await fsp.mkdir(path.dirname(destino), { recursive: true });
    const vf = largura ? ['-vf', `scale=${Math.round(largura)}:-2`] : [];
    await U.rodarFfmpeg(['-y', '-ss', t.toFixed(3), '-i', abs, '-frames:v', '1', ...vf, destino]);
    if (!U.existe(destino)) {
        // perto do fim alguns arquivos nÃ£o devolvem quadro com -ss antes do -i: tenta decodificando atÃ© lÃ¡
        await U.rodarFfmpeg(['-y', '-i', abs, '-ss', Math.max(0, t - 0.1).toFixed(3), '-frames:v', '1', ...vf, destino]);
    }
    return { arquivo: U.relativoNaSerie(pastaSerie, destino), tS: U.arred(t) };
}

module.exports = { miniaturas, onda, extrairQuadro, picosDePcm, PICOS_POR_S };
