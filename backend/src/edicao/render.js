// MONTAGEM do episódio a partir do edicao.json.
//
// Dois caminhos:
//  1. "ffmpeg" (PADRÃO, o mais fiel à Mesa): corta cada segmento de vídeo no ponto exato (entradaS/duracaoS),
//     usa os MESMOS wav tratados das falas nos MESMOS inícios absolutos, mixa com o módulo de áudio (som dos
//     clipes + cama de ambiente com ducking, master -14 LUFS) e grava por cima um ASS com a legenda (módulo de
//     áudio, zona segura), o texto de tela e os cartões A/B — as mesmas fontes que a prévia da Mesa usa.
//  2. "narrador" (motor NarradorVideo por subprocesso): traduz a edição para um projeto do motor (uma cena por
//     plano; clipes com ini/dur; falas com "atraso" pelos inícios absolutos; títulos e cartões na zona segura) e
//     roda narrar.py. O motor sintetiza a voz de novo (sem o tratamento por fala), estica a cena pela fala e não
//     grava a legenda: serve para quem quer os títulos animados do motor.
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { spawn } = require('child_process');
const U = require('./util');
const E = require('./edicao');
const legendasMod = require('../audio/legendas');

const estados = new Map(); // `${serie}|${epId}` → status
const FONTES = [
    { arquivo: 'LeagueGothic-Regular.otf', familia: 'League Gothic' },
    { arquivo: 'BarlowCondensed-Bold.ttf', familia: 'Barlow Condensed' },
];
const OSSO = '#EFE7D6';
const AMBAR = '#FFB547';

const pastaNarrador = () => process.env.NARRADOR_DIR || 'E:\\projects\\ClaudeCode\\ClaudCodeCodes\\NarradorVideo';

// Copia as fontes do motor (licença OFL) para uma pasta (render: fontsdir do libass; Mesa: @font-face via /Midia).
async function garantirFontes(pasta) {
    await fsp.mkdir(pasta, { recursive: true });
    const copiadas = [];
    for (const f of FONTES) {
        const origem = path.join(pastaNarrador(), 'fontes', f.arquivo);
        const destino = path.join(pasta, f.arquivo);
        if (!U.existe(destino) && U.existe(origem)) await fsp.copyFile(origem, destino);
        if (U.existe(destino)) copiadas.push({ ...f, destino });
    }
    return copiadas;
}

async function fontesDaSerie(serie) {
    const { pastaSerie, cache } = U.pastasSerie(serie);
    const lista = await garantirFontes(path.join(cache, 'fontes'));
    return lista.map((f) => ({ familia: f.familia, arquivo: U.relativoNaSerie(pastaSerie, f.destino) }));
}

// ---------------------------------------------------------------- ASS (legenda + texto de tela + cartões A/B)
const corAss = (hex, alfa = '00') => legendasMod.corAss(hex, alfa);
const corInline = (hex) => `&H${corAss(hex).slice(4)}&`;
const tAss = (s) => legendasMod.tempoAss(Math.max(0, s));
const esc = (t) => String(t || '').replace(/\\/g, '/').replace(/\{/g, '(').replace(/\}/g, ')').replace(/\r?\n/g, ' ');

// Geometria compartilhada com a prévia da Mesa (frontend/src/components/mesa/mesaUtil.js usa os mesmos números).
const GEOMETRIA = {
    zona: { xMin: 65, xMax: 888, yMin: 290, yMax: 1248 },
    margemL: 85,
    margemR: 212,
    tela: { topo: 330, tamanho: 104, fonte: 'League Gothic', espacamento: 2 },
    // cartão A/B: caixa escura com borda âmbar, coluna da letra, divisória, título e detalhe (como o do motor)
    cartao: { yA: 700, yB: 930, altura: 190, colunaLetra: 140, fonte: 'Barlow Condensed', tamanhoLetra: 150, tamanhoTitulo: 64, tamanhoSub: 42 },
};

function linhaEstilo(nome, { fonte, tamanho, cor, contorno = 3, sombra = 2, negrito = false, alinhamento = 8, margemV = 0, borda = 1, corContorno = '#000000', alfaContorno = '00', espacamento = 0 }) {
    return [
        `Style: ${nome}`, fonte, tamanho, corAss(cor), corAss('#FFFFFF'), corAss(corContorno, alfaContorno), corAss('#000000', '90'),
        negrito ? -1 : 0, 0, 0, 0, 100, 100, espacamento, 0, borda, contorno, sombra, alinhamento, GEOMETRIA.margemL, GEOMETRIA.margemR, margemV, 1,
    ].join(',');
}

/** ASS completo da edição (1080×1920). Pura: testável. */
function montarAss(doc) {
    const G = GEOMETRIA;
    const blocos = (doc.legenda || []).map((b) => ({ quem: b.quem, cor: b.cor || OSSO, linhas: b.linhas || [], palavras: [], ini: b.ini, fim: b.fim }));
    let ass = legendasMod.gerarAss(blocos, { modo: 'frase', largura: doc.largura || 1080, altura: doc.altura || 1920 });
    ass = ass.replace('WrapStyle: 2', 'WrapStyle: 1');
    const estilos = [
        linhaEstilo('Tela', { fonte: G.tela.fonte, tamanho: G.tela.tamanho, cor: OSSO, contorno: 4, sombra: 3, alinhamento: 8, margemV: G.tela.topo, espacamento: G.tela.espacamento }),
        linhaEstilo('Cartao', { fonte: G.cartao.fonte, tamanho: G.cartao.tamanhoTitulo, cor: OSSO, negrito: true, contorno: 0, sombra: 0, alinhamento: 4 }),
    ];
    const eventos = [];
    for (const t of doc.faixas.texto || []) {
        if (!String(t.texto || '').trim()) continue;
        eventos.push(`Dialogue: 1,${tAss(t.inicioS)},${tAss(t.inicioS + t.duracaoS)},Tela,,0,0,0,,{\\fad(180,180)}${esc(String(t.texto).toUpperCase())}`);
    }
    const C = G.cartao;
    const x0 = G.margemL;
    const larg = (doc.largura || 1080) - G.margemR - G.margemL;
    const xTexto = x0 + C.colunaLetra + 25;
    const margemDir = (doc.largura || 1080) - (x0 + larg) + 24;
    for (const ab of doc.faixas.ab || []) {
        const fim = tAss(ab.inicioS + ab.duracaoS);
        [['A', ab.A, C.yA, 0], ['B', ab.B, C.yB, 0.25]].forEach(([letra, op, yc, atraso]) => {
            if (!op) return;
            const ini = tAss(ab.inicioS + atraso);
            const topo = yc - C.altura / 2;
            const fx = '\\fad(220,0)\\bord0\\shad0';
            // caixa (desenho vetorial: uma caixa só, com borda âmbar)
            eventos.push(`Dialogue: 2,${ini},${fim},Cartao,,0,0,0,,{\\an7\\pos(${x0},${topo})\\p1\\fad(220,0)\\bord3\\shad0\\1c${corInline('#0A0E14')}\\1a&H24&\\3c${corInline(AMBAR)}\\3a&H00&}m 0 0 l ${larg} 0 ${larg} ${C.altura} 0 ${C.altura}{\\p0}`);
            // divisória
            eventos.push(`Dialogue: 3,${ini},${fim},Cartao,,0,0,0,,{\\an7\\pos(${x0 + C.colunaLetra},${yc - 62})\\p1${fx}\\1c${corInline(AMBAR)}\\1a&H90&}m 0 0 l 3 0 3 124 0 124{\\p0}`);
            // letra
            eventos.push(`Dialogue: 4,${ini},${fim},Cartao,,0,0,0,,{\\an5\\pos(${x0 + C.colunaLetra / 2},${yc + 4})${fx}\\fnLeague Gothic\\b0\\fs${C.tamanhoLetra}\\1c${corInline(AMBAR)}}${letra}`);
            // título + detalhe (quebra dentro da coluna de texto)
            const sub = op.detalhe ? `\\N{\\b0\\fs${C.tamanhoSub}\\1c${corInline('#D9D2C2')}}${esc(op.detalhe)}` : '';
            eventos.push(`Dialogue: 4,${ini},${fim},Cartao,,${xTexto},${margemDir},0,,{\\an4\\pos(${xTexto},${yc})${fx}\\fn${C.fonte}\\b1\\fs${C.tamanhoTitulo}\\1c${corInline(OSSO)}}${esc(op.texto)}${sub}`);
        });
    }
    const [cab, evs] = ass.split('\n[Events]\n');
    return `${cab.trimEnd()}\n${estilos.join('\n')}\n\n[Events]\n${evs.trimEnd()}\n${eventos.join('\n')}\n`;
}

// ---------------------------------------------------------------- plano de render (puro)
/**
 * O que entra no render: pedaços de vídeo (com buracos pretos), falas (wav + início + corte), som dos clipes
 * (segmentos não mudos) e ambiente. Caminhos ainda relativos à série.
 */
function planoDeRender(doc) {
    const D = U.arred(doc.duracaoS);
    const pedacos = E.linhaDeVideo(doc, D);
    const falas = E.FAIXAS_AUDIO.flatMap((f) => doc.faixas[f] || [])
        .filter((i) => i.arquivo && !i.mudo && i.duracaoS > 0.01 && i.inicioS < D)
        .map((i) => ({
            id: i.id, arquivo: i.arquivo, inicioS: i.inicioS, duracaoS: U.arred(Math.min(i.duracaoS, D - i.inicioS)), entradaS: Number(i.entradaS) || 0,
            aparar: (Number(i.entradaS) || 0) > 0.005 || (i.duracaoArquivoS && i.duracaoS < i.duracaoArquivoS - 0.01) || i.inicioS + i.duracaoS > D,
        }));
    const somClipes = pedacos.filter((p) => p.arquivo && !p.mudo && !U.ehImagem(p.arquivo) && (Number(p.volume) || 0) > 0)
        .map((p) => ({ arquivo: p.arquivo, inicioS: p.inicioS, duracaoS: p.duracaoS, entradaS: p.entradaS, volume: Number(p.volume) }));
    const amb = (doc.faixas.ambiente || []).find((a) => !a.mudo && Number(a.volume) > 0);
    const ambiente = !amb ? null : amb.tipo === 'arquivo' && amb.arquivo ? { arquivo: amb.arquivo, volume: Number(amb.volume) } : Number(amb.volume);
    return { duracaoS: D, pedacos, falas, somClipes, ambiente };
}

function filtroVideo(pedacos, { largura = 1080, altura = 1920, fps = 24, ass = 'mesa.ass' } = {}) {
    const entradas = [];
    const partes = [];
    let k = 0;
    pedacos.forEach((p, i) => {
        const d = p.duracaoS.toFixed(3);
        const norm = `scale=${largura}:${altura}:force_original_aspect_ratio=increase,crop=${largura}:${altura},setsar=1,fps=${fps},trim=duration=${d},setpts=PTS-STARTPTS,format=yuv420p`;
        if (!p.arquivo) {
            partes.push(`color=c=black:s=${largura}x${altura}:r=${fps}:d=${d},format=yuv420p,setsar=1[p${i}]`);
            return;
        }
        if (U.ehImagem(p.arquivo)) entradas.push('-loop', '1', '-framerate', String(fps), '-t', d, '-i', p.abs || p.arquivo);
        else entradas.push('-ss', (Number(p.entradaS) || 0).toFixed(3), '-t', (p.duracaoS + 0.1).toFixed(3), '-i', p.abs || p.arquivo);
        partes.push(`[${k}:v]${norm}[p${i}]`);
        k += 1;
    });
    partes.push(`${pedacos.map((_, i) => `[p${i}]`).join('')}concat=n=${pedacos.length}:v=1:a=0[base]`);
    partes.push(ass ? `[base]ass=${ass}:fontsdir=fontes[v]` : '[base]null[v]');
    return { entradas, filtro: partes.join(';'), nEntradas: k };
}

// ---------------------------------------------------------------- tradução para o motor NarradorVideo (pura)
/**
 * traduzirParaMotor(doc, { pastaSerie, serie, nome }) → projeto.json do narrar.py
 * Uma cena por plano: "clipes" com ini/dur dos segmentos (mudo quando for o caso), "cortar"+"minimo" = duração
 * do plano, "falas" (uma por frase) com "atraso" calculado pelos inícios absolutos (o motor começa a voz da cena
 * em 0,25 s), "titulos" com o texto de tela e os cartões A/B dentro da zona segura.
 */
function traduzirParaMotor(doc, { pastaSerie, serie = {}, nome } = {}) {
    const abs = (rel) => (pastaSerie ? path.join(pastaSerie, rel) : rel);
    const H = doc.altura || 1920;
    const pedacos = E.linhaDeVideo(doc);
    const falas = [...(doc.faixas.narracao || []), ...(doc.faixas.falas || [])].filter((f) => !f.mudo && f.texto).sort((a, b) => a.inicioS - b.inicioS);
    const amb = (doc.faixas.ambiente || []).find((a) => a.tipo === 'sintetico' && Number(a.volume) > 0);
    const cenas = [];
    const avisos = [];
    const limites = E.limitesPlanos(doc).filter((l) => l.ateS - l.deS > 0.05);
    limites.forEach((l, k) => {
        const fimCena = k < limites.length - 1 ? Math.max(l.ateS, limites[k + 1].deS) : Math.max(l.ateS, doc.duracaoS);
        const durCena = U.arred(fimCena - l.deS);
        const segs = pedacos.filter((p) => p.arquivo && p.inicioS >= l.deS - 0.01 && p.inicioS < fimCena - 0.01);
        const clipes = segs.map((s) => (U.ehImagem(s.arquivo)
            ? { img: abs(s.arquivo), dur: s.duracaoS }
            : { v: abs(s.arquivo), ini: U.arred(s.entradaS), dur: s.duracaoS, ...(s.mudo ? { mudo: true } : {}) }));
        const daCena = falas.filter((f) => f.inicioS >= l.deS - 0.01 && f.inicioS < fimCena - 0.01);
        const mFalas = [];
        let fimAnterior = null;
        for (const f of daCena) {
            const frases = (f.frases && f.frases.length ? f.frases : [{ texto: f.texto, pausaDepoisS: 0 }]);
            frases.forEach((fr, j) => {
                const base = { voz: f.voz || f.quem, texto: fr.texto };
                if (f.tom) base.tom = f.tom;
                if (f.velocidade) base.velocidade = f.velocidade;
                if (f.volume !== null && f.volume !== undefined) base.volume = f.volume;
                if (f.filtro) base.filtro = f.filtro;
                if (j === 0) {
                    const atraso = fimAnterior === null ? f.inicioS - l.deS - 0.25 : f.inicioS - fimAnterior;
                    mFalas.push({ ...base, pausa: 0, atraso: U.arred(Math.max(0, atraso)) });
                } else {
                    mFalas.push({ ...base, pausa: U.arred(Number(frases[j - 1].pausaDepoisS) || 0), atraso: 0 });
                }
            });
            fimAnterior = f.inicioS + f.duracaoS;
        }
        const titulos = [];
        for (const t of doc.faixas.texto || []) {
            if (t.inicioS < l.deS - 0.01 || t.inicioS >= fimCena - 0.01 || !String(t.texto || '').trim()) continue;
            titulos.push({
                tipo: 'texto', texto: String(t.texto).toUpperCase(), quando: U.arred(t.inicioS - l.deS), fim: U.arred(t.inicioS + t.duracaoS - l.deS),
                x: 0.5, y: U.arred((GEOMETRIA.tela.topo + 60) / H, 4), tamanho: 96, cor: OSSO, anim: 'fade', largura_max: 0.72,
            });
        }
        for (const ab of doc.faixas.ab || []) {
            if (ab.inicioS >= fimCena - 0.01 || ab.inicioS + ab.duracaoS <= l.deS + 0.01) continue;
            const quando = U.arred(Math.max(0, ab.inicioS - l.deS));
            // o cartão do motor (titulos.py) é mais alto que o da Mesa (~260 px com 2 linhas de detalhe): mais espaço entre A e B
            if (ab.A) titulos.push({ tipo: 'cartao', letra: 'A', titulo: ab.A.texto, sub: ab.A.detalhe || '', x: 0.5, y: U.arred(640 / 1920, 4), quando });
            if (ab.B) titulos.push({ tipo: 'cartao', letra: 'B', titulo: ab.B.texto, sub: ab.B.detalhe || '', x: 0.5, y: U.arred(960 / 1920, 4), quando: U.arred(quando + 0.25) });
        }
        if (!clipes.length) { avisos.push(`Plano ${l.n} sem vídeo: ficou fora do projeto do motor.`); return; }
        const cena = { plano: l.n, clipes, cortar: true, minimo: durCena };
        if (segs.every((s) => s.mudo)) cena.audio_original = false;
        if (mFalas.length) cena.falas = mFalas;
        if (titulos.length) cena.titulos = titulos;
        cenas.push(cena);
    });
    return {
        nome: nome || `estudio-${doc.serie || 'serie'}-ep${String(doc.ep || 1).padStart(2, '0')}`,
        largura: doc.largura || 1080,
        altura: H,
        fps: doc.fps || 24,
        vozes: serie.vozes || {},
        tons: serie.tons || {},
        ...(serie.pronuncia ? { pronuncia: serie.pronuncia } : {}),
        ...(serie.pronuncia_piper ? { pronuncia_piper: serie.pronuncia_piper } : {}),
        manter_audio_original: true,
        volume_original: 1.0,
        volume_voz: 1.6,
        folga_apos_fala: 0,
        pausa_falas: 0,
        normalizar: true,
        ...(amb ? { ambiente: Number(amb.volume) } : {}),
        ...(avisos.length ? { avisos } : {}),
        cenas,
    };
}

// ---------------------------------------------------------------- execução
function chave(serie, ep) { return `${serie}|${U.idEp(ep)}`; }

async function gravarStatus(c, st) {
    estados.set(chave(c.serie, c.n), st);
    await fsp.mkdir(c.saida, { recursive: true });
    await U.gravarJson(path.join(c.saida, 'render.json'), st).catch(() => {});
}

async function statusRender(serie, ep) {
    const c = U.caminhos(serie, ep);
    const st = estados.get(chave(serie, ep)) || (await U.lerJson(path.join(c.saida, 'render.json'), null));
    if (!st) return { status: 'nenhum' };
    if (st.status === 'montando' && !estados.has(chave(serie, ep))) return { ...st, status: 'interrompido', etapa: 'o servidor reiniciou durante a montagem' };
    return st;
}

async function montarComFfmpeg(c, doc, st, atualizar) {
    const plano = planoDeRender(doc);
    const D = plano.duracaoS;
    if (!plano.pedacos.some((p) => p.arquivo)) throw U.erro('A faixa de vídeo está vazia.');
    const tmp = path.join(c.saida, '.tmp');
    await fsp.rm(tmp, { recursive: true, force: true });
    await fsp.mkdir(tmp, { recursive: true });
    const abs = (rel) => U.absolutoNaSerie(c.pastaSerie, rel);
    const tratamento = require('../audio/tratamento');

    // 1) áudio: falas no tempo, som dos clipes, ambiente, ducking e master
    await atualizar({ etapa: 'mixando o áudio', pct: 3 });
    const falas = [];
    for (const f of plano.falas) {
        const a = abs(f.arquivo);
        if (!U.existe(a)) { st.avisos.push(`Fala ${f.id}: arquivo não encontrado (${f.arquivo}).`); continue; }
        let arquivo = a;
        if (f.aparar) {
            arquivo = path.join(tmp, `fala-${f.id}.wav`);
            await U.rodarFfmpeg(['-y', '-ss', f.entradaS.toFixed(3), '-t', f.duracaoS.toFixed(3), '-i', a, '-ac', '1', '-ar', '44100', '-c:a', 'pcm_s16le', arquivo]);
        }
        falas.push({ arquivo, inicioS: f.inicioS, duracaoS: f.duracaoS });
    }
    let clipe = null;
    const comSom = [];
    for (const s of plano.somClipes) {
        const a = abs(s.arquivo);
        if (U.existe(a) && (await U.infoMidia(a)).temAudio) comSom.push({ ...s, a });
    }
    if (comSom.length) {
        const ent = [];
        const fil = [];
        comSom.forEach((s, i) => {
            ent.push('-ss', s.entradaS.toFixed(3), '-t', s.duracaoS.toFixed(3), '-i', s.a);
            fil.push(`[${i}:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=mono,atrim=0:${s.duracaoS.toFixed(3)},asetpts=PTS-STARTPTS,volume=${s.volume},adelay=${Math.round(s.inicioS * 1000)}:all=1[c${i}]`);
        });
        fil.push(`${comSom.map((_, i) => `[c${i}]`).join('')}amix=inputs=${comSom.length}:normalize=0:duration=longest,apad=whole_dur=${D.toFixed(3)},atrim=0:${D.toFixed(3)}[s]`);
        const arq = path.join(tmp, 'som-clipes.wav');
        await U.rodarFfmpeg(['-y', ...ent, '-filter_complex', fil.join(';'), '-map', '[s]', '-ac', '1', '-ar', '44100', '-c:a', 'pcm_s16le', arq]);
        clipe = { arquivo: arq, volume: 1 };
    }
    const ambiente = plano.ambiente && typeof plano.ambiente === 'object' ? { arquivo: abs(plano.ambiente.arquivo), volume: plano.ambiente.volume } : plano.ambiente;
    const audioWav = path.join(tmp, 'audio.wav');
    if (falas.length || clipe || ambiente) {
        await tratamento.mixarEpisodio({ falas, duracaoS: D, clipe, ambiente, saida: audioWav });
    } else {
        await U.rodarFfmpeg(['-y', '-f', 'lavfi', '-i', `anullsrc=r=44100:cl=stereo`, '-t', D.toFixed(3), audioWav]);
    }
    await atualizar({ etapa: 'gravando a legenda e os títulos', pct: 25 });

    // 2) legenda + texto de tela + cartões (ASS) e fontes
    await fsp.writeFile(path.join(tmp, 'mesa.ass'), `\uFEFF${montarAss(doc)}`, 'utf8');
    await garantirFontes(path.join(tmp, 'fontes'));

    // 3) vídeo: segmentos no ponto exato + ASS + áudio
    const pedacos = plano.pedacos.map((p) => (p.arquivo ? { ...p, abs: abs(p.arquivo) } : p));
    for (const p of pedacos) if (p.abs && !U.existe(p.abs)) throw U.erro(`Vídeo não encontrado: ${p.arquivo}`, 404);
    const v = filtroVideo(pedacos, { largura: doc.largura || 1080, altura: doc.altura || 1920, fps: doc.fps || 24 });
    const nome = `${c.epId}.mp4`;
    const saida = path.join(c.saida, nome);
    const parcial = path.join(c.saida, `${c.epId}.parcial.mp4`);
    await atualizar({ etapa: 'montando o vídeo', pct: 28 });
    await U.rodarFfmpeg(['-y', ...v.entradas, '-i', audioWav, '-filter_complex', v.filtro,
        '-map', '[v]', '-map', `${v.nEntradas}:a`, '-c:v', 'libx264', '-preset', 'faster', '-crf', '20', '-pix_fmt', 'yuv420p',
        '-r', String(doc.fps || 24), '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-t', D.toFixed(3), '-movflags', '+faststart', parcial], {
        cwd: tmp,
        aoProgresso: (s) => { atualizar({ pct: Math.min(99, Math.round(28 + (71 * s) / D)) }, true); },
    });
    await fsp.rm(saida, { force: true });
    await fsp.rename(parcial, saida);
    await fsp.rm(tmp, { recursive: true, force: true }).catch(() => {});
    return saida;
}

async function montarComMotor(c, doc, st, atualizar) {
    const cfgAudio = require('../audio/config');
    const serieDados = await U.lerJson(path.join(c.pastaSerie, 'serie.json'), {});
    const projeto = traduzirParaMotor(doc, { pastaSerie: c.pastaSerie, serie: serieDados });
    const arqProjeto = path.join(c.saida, 'projeto-motor.json');
    await fsp.mkdir(c.saida, { recursive: true });
    await U.gravarJson(arqProjeto, projeto);
    await atualizar({ etapa: 'motor NarradorVideo: gerando falas e cenas', pct: 5 });
    const n = projeto.cenas.length;
    const final = await new Promise((resolve, reject) => {
        const proc = spawn(cfgAudio.pythonMotor(), [path.join(pastaNarrador(), 'narrar.py'), arqProjeto], { cwd: pastaNarrador(), env: cfgAudio.ambientePython(), windowsHide: true });
        let resto = '';
        const log = [];
        let pronto = null;
        proc.stdout.on('data', (d) => {
            resto += d.toString('utf8');
            const linhas = resto.split(/\r?\n/);
            resto = linhas.pop();
            for (const l of linhas) {
                log.push(l);
                const m = /^cena (\d+):/.exec(l);
                if (m) atualizar({ pct: Math.min(95, Math.round(5 + (85 * Number(m[1])) / n)), etapa: `motor: cena ${m[1]} de ${n}` }, true);
                const p = /^PRONTO: (.+?) \(/.exec(l);
                if (p) pronto = p[1].trim();
            }
        });
        proc.stderr.on('data', (d) => log.push(d.toString('utf8')));
        proc.on('error', (e) => reject(U.erro(`Falha ao iniciar o motor: ${e.message}`, 500)));
        proc.on('close', (codigo) => {
            if (codigo || !pronto) return reject(U.erro(`O motor falhou: ${log.join('\n').slice(-1200)}`, 500));
            resolve(pronto);
        });
    });
    const saida = path.join(c.saida, `${c.epId}-motor.mp4`);
    await fsp.copyFile(final, saida);
    return saida;
}

/**
 * renderizar({ serie, ep, motor }) — começa a montagem e devolve o status na hora (consulte StatusRender).
 */
async function renderizar({ serie, ep, motor = 'ffmpeg' } = {}) {
    const c = U.caminhos(serie, ep);
    const k = chave(serie, ep);
    const atual = estados.get(k);
    if (atual && atual.status === 'montando') return atual;
    const doc = await E.lerEdicao(serie, ep);
    if (!doc) throw U.erro('Este episódio ainda não tem edição.', 404);
    if (!['ffmpeg', 'narrador'].includes(motor)) throw U.erro('Motor inválido: use "ffmpeg" ou "narrador".');
    const st = {
        serie, ep: c.n, motor, revisao: doc.revisao, status: 'montando', etapa: 'preparando', pct: 0,
        iniciadoEm: new Date().toISOString(), avisos: [], saida: null, erro: null,
    };
    let ultimoGravado = 0;
    const atualizar = async (campos, leve = false) => {
        Object.assign(st, campos);
        estados.set(k, st);
        if (!leve || Date.now() - ultimoGravado > 1500) { ultimoGravado = Date.now(); await gravarStatus(c, st); }
    };
    await gravarStatus(c, st);
    (async () => {
        try {
            const inicio = Date.now();
            const saida = motor === 'narrador' ? await montarComMotor(c, doc, st, atualizar) : await montarComFfmpeg(c, doc, st, atualizar);
            const info = await U.infoMidia(saida);
            await atualizar({
                status: 'pronto', etapa: 'pronto', pct: 100, saida: U.relativoNaSerie(c.pastaSerie, saida), duracaoS: info.duracaoS,
                tamanhoMb: Math.round((fs.statSync(saida).size / 1048576) * 10) / 10, levouS: Math.round((Date.now() - inicio) / 100) / 10,
                concluidoEm: new Date().toISOString(),
            });
        } catch (e) {
            await atualizar({ status: 'falhou', etapa: 'falhou', erro: e.message, concluidoEm: new Date().toISOString() });
        }
    })();
    return st;
}

module.exports = {
    GEOMETRIA, FONTES, garantirFontes, fontesDaSerie, montarAss, planoDeRender, filtroVideo, traduzirParaMotor,
    renderizar, statusRender,
};
