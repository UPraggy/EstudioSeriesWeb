// TRATAMENTO de áudio: cadeias ffmpeg por intenção, loudness por fala, EQ de diálogo, ducking,
// cama de ambiente e master final (-14 LUFS / -1,5 dBTP, padrão Shorts).
// As cadeias saem como TEXTO (para o motor/projeto.json) e há funções que rodam o ffmpeg num arquivo.
// Números: docs/AUDIO.md e docs/PESQUISA-2026-11-04.md §3 (passa-alta 80 Hz, realce 2–4 kHz, ducking 6–12 dB,
// ataque 30–80 ms, release 250–700 ms, ambiente com corte em 1–3 kHz).
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { INTENCOES } = require('./parametros');

const MASTER_PADRAO = { I: -14, TP: -1.5, LRA: 11 };
const ALVO_FALA_LUFS = -16; // cada fala é igualada aqui (± o volume da intenção) antes da mixagem
const LIMITE_FALA = 0.891; // -1 dBFS de pico por fala

// ---------- cadeias (texto) ----------
function cadeiaIntencao(intencao, motor = 'edge') {
    const I = INTENCOES.intencoes[intencao];
    if (!I) throw new Error(`Intenção desconhecida: ${intencao}`);
    void motor; // o filtro é o mesmo nos dois motores; tom/velocidade é que mudam de unidade
    return I.filtro || '';
}

// EQ leve de diálogo: tira o grave que embola (passa-alta 80 Hz), alivia 250 Hz, presença em 3 kHz, de-esser leve.
function cadeiaDialogo({ passaAlta = 80, embolar = -2, presenca = 2, deesser = 0.3 } = {}) {
    const partes = [`highpass=f=${passaAlta}`];
    if (embolar) partes.push(`equalizer=f=250:t=q:w=1.0:g=${embolar}`);
    if (presenca) partes.push(`equalizer=f=3000:t=q:w=1.4:g=${presenca}`);
    if (deesser) partes.push(`deesser=i=${deesser}`);
    return partes.join(',');
}

// Filtro completo de uma fala para o motor (narrar.py aplica "filtro" e depois o volume).
function cadeiaFalaMotor(intencao, motor = 'edge', opcoesDialogo) {
    return [cadeiaIntencao(intencao, motor), cadeiaDialogo(opcoesDialogo)].filter(Boolean).join(',');
}

const ganhoDb = (volume) => 20 * Math.log10(Math.max(0.01, Number(volume) || 1));
const fmt = (n, c = 2) => String(Math.round(n * 10 ** c) / 10 ** c);

function cadeiaGanho(db) {
    return `volume=${fmt(db)}dB,alimiter=limit=${LIMITE_FALA}:attack=5:release=50:level=0`;
}

// Ducking: o fundo (clipe/ambiente) abaixa quando a voz fala. Com a voz em ~-16 LUFS e limiar 0,02,
// razão 3 dá ~8–10 dB de redução (faixa 6–12 dB); ataque 40 ms, release 450 ms.
function cadeiaDucking({ razao = 3, limiar = 0.02, ataqueMs = 40, releaseMs = 450 } = {}) {
    return `sidechaincompress=threshold=${limiar}:ratio=${razao}:attack=${ataqueMs}:release=${releaseMs}`;
}

// Corte de 1–3 kHz no fundo para abrir espaço para a voz.
const cadeiaCorteFundo = (g = -4) => `equalizer=f=2000:t=q:w=1.0:g=${g}`;

// Cama de ambiente sintética (a mesma do motor: ruído marrom grave, "mar/vento").
function cadeiaAmbiente({ volume = 0.12, duracaoS = 60 } = {}) {
    return `anoisesrc=c=brown:r=44100:a=1:d=${fmt(duracaoS, 3)},lowpass=f=380,tremolo=f=0.12:d=0.5,volume=${volume}`;
}

function cadeiaMaster({ I, TP, LRA } = {}) {
    const m = { ...MASTER_PADRAO, ...(I !== undefined ? { I } : {}), ...(TP !== undefined ? { TP } : {}), ...(LRA !== undefined ? { LRA } : {}) };
    return `loudnorm=I=${m.I}:TP=${m.TP}:LRA=${m.LRA}`;
}

// Tudo como texto, para o módulo de montagem levar ao projeto.json do motor.
function exportarCadeias() {
    const intencoes = {};
    for (const id of Object.keys(INTENCOES.intencoes)) {
        intencoes[id] = { filtro: cadeiaIntencao(id), filtroComDialogo: cadeiaFalaMotor(id) };
    }
    return {
        intencoes,
        dialogo: cadeiaDialogo(),
        ducking: cadeiaDucking(),
        corteFundo: cadeiaCorteFundo(),
        ambiente: cadeiaAmbiente(),
        master: cadeiaMaster(),
        alvoFalaLufs: ALVO_FALA_LUFS,
        master_alvo: MASTER_PADRAO,
    };
}

// ---------- ffmpeg ----------
function rodarFfmpeg(args, { timeoutMs = 600000 } = {}) {
    return new Promise((resolve, reject) => {
        const proc = spawn(process.env.FFMPEG || 'ffmpeg', ['-hide_banner', '-nostdin', ...args], { windowsHide: true });
        const erros = [];
        const relogio = setTimeout(() => {
            proc.kill();
            reject(new Error('ffmpeg demorou demais'));
        }, timeoutMs);
        proc.stderr.on('data', (d) => erros.push(d));
        proc.stdout.on('data', () => {});
        proc.on('error', (e) => {
            clearTimeout(relogio);
            reject(new Error(`ffmpeg não encontrado: ${e.message}`));
        });
        proc.on('close', (codigo) => {
            clearTimeout(relogio);
            const stderr = Buffer.concat(erros).toString('utf8');
            if (codigo) return reject(new Error(`ERRO ffmpeg: ${stderr.slice(-1500)}`));
            resolve({ stderr });
        });
    });
}

function duracaoArquivo(arquivo) {
    return new Promise((resolve, reject) => {
        const proc = spawn(process.env.FFPROBE || 'ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', arquivo], { windowsHide: true });
        let out = '';
        proc.stdout.on('data', (d) => { out += d; });
        proc.on('error', (e) => reject(e));
        proc.on('close', (c) => (c ? reject(new Error(`ffprobe falhou em ${arquivo}`)) : resolve(Number(out.trim()))));
    });
}

function codecSaida(saida) {
    const ext = path.extname(saida).toLowerCase();
    if (ext === '.wav') return ['-c:a', 'pcm_s16le'];
    if (ext === '.mp3') return ['-c:a', 'libmp3lame', '-b:a', '192k'];
    return ['-c:a', 'aac', '-b:a', '192k'];
}

// Roda uma cadeia (-af) num arquivo: a função genérica do tratamento.
async function aplicarCadeia(entrada, saida, cadeia, { canais = 1, taxa = 44100 } = {}) {
    fs.mkdirSync(path.dirname(saida), { recursive: true });
    const af = cadeia ? ['-af', cadeia] : [];
    await rodarFfmpeg(['-y', '-i', entrada, ...af, '-ac', String(canais), '-ar', String(taxa), ...codecSaida(saida), saida]);
    return saida;
}

function lerJsonLoudnorm(stderr) {
    const blocos = stderr.match(/\{[^{}]*"input_i"[^{}]*\}/g);
    if (!blocos) throw new Error('loudnorm não devolveu a medição');
    const j = JSON.parse(blocos.at(-1));
    const n = (v) => (v === undefined ? NaN : Number(v));
    return {
        I: n(j.input_i), TP: n(j.input_tp), LRA: n(j.input_lra), thresh: n(j.input_thresh), offset: n(j.target_offset),
        saidaI: n(j.output_i), saidaTP: n(j.output_tp), tipo: j.normalization_type,
    };
}

// Mede o loudness (LUFS integrado, pico verdadeiro) depois de uma cadeia opcional.
async function medirLoudness(arquivo, cadeiaAntes = '', alvo = MASTER_PADRAO) {
    const af = [cadeiaAntes, `loudnorm=I=${alvo.I}:TP=${alvo.TP}:LRA=${alvo.LRA}:print_format=json`].filter(Boolean).join(',');
    const { stderr } = await rodarFfmpeg(['-i', arquivo, '-af', af, '-f', 'null', '-']);
    return lerJsonLoudnorm(stderr);
}

async function volumeMedio(arquivo, cadeiaAntes = '') {
    const af = [cadeiaAntes, 'volumedetect'].filter(Boolean).join(',');
    const { stderr } = await rodarFfmpeg(['-i', arquivo, '-af', af, '-f', 'null', '-']);
    const m = stderr.match(/mean_volume:\s*(-?[\d.]+|-inf) dB/);
    return m ? Number(m[1]) : NaN;
}

// Loudness por fala, em 2 passadas e ganho LINEAR (não esmaga a dinâmica da voz):
// EQ de diálogo → mede → volume = alvo - medido → limitador de pico em -1 dBFS.
// O alvo já inclui o volume da intenção: -16 LUFS + 20·log10(volume) (sussurro 0,7 ≈ -19 LUFS; grito 1,25 ≈ -14).
async function normalizarFala(entrada, saida, { alvoLufs = ALVO_FALA_LUFS, volume = 1, eq = true, opcoesDialogo } = {}) {
    const cadeiaEq = eq ? cadeiaDialogo(opcoesDialogo) : '';
    const alvo = alvoLufs + ganhoDb(volume);
    let medido = NaN;
    try {
        medido = (await medirLoudness(entrada, cadeiaEq)).I;
    } catch { /* fala curta demais para o loudnorm: cai no volume médio */ }
    if (!Number.isFinite(medido)) medido = await volumeMedio(entrada, cadeiaEq);
    const ganho = Number.isFinite(medido) ? Math.max(-30, Math.min(24, alvo - medido)) : 0;
    const cadeia = [cadeiaEq, cadeiaGanho(ganho)].filter(Boolean).join(',');
    await aplicarCadeia(entrada, saida, cadeia);
    return { saida, medidoLufs: Number.isFinite(medido) ? Math.round(medido * 10) / 10 : null, alvoLufs: Math.round(alvo * 10) / 10, ganhoDb: Math.round(ganho * 10) / 10, cadeia };
}

// Master em 2 passadas (loudnorm linear quando possível): -14 LUFS integrado, pico verdadeiro -1,5 dBTP.
async function masterizar(entrada, saida, alvo = {}) {
    const m = { ...MASTER_PADRAO, ...alvo };
    const p1 = await medirLoudness(entrada, '', m);
    const ln = `loudnorm=I=${m.I}:TP=${m.TP}:LRA=${m.LRA}:measured_I=${p1.I}:measured_TP=${p1.TP}:measured_LRA=${p1.LRA}`
        + `:measured_thresh=${p1.thresh}:offset=${p1.offset}:linear=true:print_format=json`;
    fs.mkdirSync(path.dirname(saida), { recursive: true });
    const { stderr } = await rodarFfmpeg(['-y', '-i', entrada, '-af', ln, '-ar', '44100', '-ac', '2', ...codecSaida(saida), saida]);
    const p2 = lerJsonLoudnorm(stderr);
    return { saida, antes: { I: p1.I, TP: p1.TP, LRA: p1.LRA }, depois: { I: p2.saidaI, TP: p2.saidaTP }, tipo: p2.tipo, cadeia: cadeiaMaster(m) };
}

// ---------- mixagem do episódio ----------
// falas: [{ arquivo, inicioS }] (já tratadas); clipe: { arquivo, volume } (som do vídeo, opcional);
// ambiente: número (cama sintética, volume) | { arquivo, volume } (cama gravada em loop) | null.
// Devolve os argumentos do ffmpeg (sem a saída) e o filter_complex — função pura, testável.
function montarMixagem({ falas = [], duracaoS, clipe = null, ambiente = null, ducking = {}, corteFundo = true }) {
    if (!falas.length && !clipe && !ambiente) throw new Error('Nada para mixar: sem falas, clipe ou ambiente');
    const fimFalas = Math.max(0, ...falas.map((f) => (f.inicioS || 0) + (f.duracaoS || 0)));
    const D = Math.max(Number(duracaoS) || 0, fimFalas + 0.5);
    const entradas = [];
    const partes = [];
    const MONO = 'aresample=44100,aformat=sample_fmts=fltp:channel_layouts=mono';

    falas.forEach((f, i) => {
        entradas.push('-i', f.arquivo);
        const ms = Math.max(0, Math.round((f.inicioS || 0) * 1000));
        partes.push(`[${i}:a]${MONO},adelay=${ms}:all=1[f${i}]`);
    });
    let voz = null;
    if (falas.length === 1) {
        partes.push(`[f0]apad=whole_dur=${fmt(D, 3)},atrim=0:${fmt(D, 3)}[voz]`);
        voz = '[voz]';
    } else if (falas.length > 1) {
        partes.push(`${falas.map((_, i) => `[f${i}]`).join('')}amix=inputs=${falas.length}:normalize=0:duration=longest,apad=whole_dur=${fmt(D, 3)},atrim=0:${fmt(D, 3)}[voz]`);
        voz = '[voz]';
    }

    const fundos = [];
    let k = falas.length;
    if (clipe && clipe.arquivo) {
        entradas.push('-i', clipe.arquivo);
        partes.push(`[${k}:a]${MONO},volume=${clipe.volume ?? 1},apad=whole_dur=${fmt(D, 3)},atrim=0:${fmt(D, 3)}[clipe]`);
        fundos.push('[clipe]');
        k++;
    }
    if (typeof ambiente === 'number' && ambiente > 0) {
        partes.push(`${cadeiaAmbiente({ volume: ambiente, duracaoS: D })},aformat=sample_fmts=fltp:channel_layouts=mono[amb]`);
        fundos.push('[amb]');
    } else if (ambiente && ambiente.arquivo) {
        entradas.push('-stream_loop', '-1', '-i', ambiente.arquivo);
        partes.push(`[${k}:a]${MONO},volume=${ambiente.volume ?? 0.3},atrim=0:${fmt(D, 3)}[amb]`);
        fundos.push('[amb]');
        k++;
    }

    let fundo = null;
    if (fundos.length === 1) fundo = fundos[0];
    else if (fundos.length > 1) {
        partes.push(`${fundos.join('')}amix=inputs=${fundos.length}:normalize=0:duration=first[fundo]`);
        fundo = '[fundo]';
    }
    if (fundo && corteFundo) {
        partes.push(`${fundo}${cadeiaCorteFundo()}[fundoeq]`);
        fundo = '[fundoeq]';
    }

    if (voz && fundo) {
        partes.push(`${voz}asplit=2[vozA][vozK]`);
        partes.push(`${fundo}[vozK]${cadeiaDucking(ducking)}[fundoD]`);
        partes.push('[vozA][fundoD]amix=inputs=2:normalize=0:duration=first,aformat=channel_layouts=stereo[saida]');
    } else {
        partes.push(`${voz || fundo}aformat=channel_layouts=stereo[saida]`);
    }
    return { entradas, filtro: partes.join(';'), mapa: '[saida]', duracaoS: Math.round(D * 1000) / 1000 };
}

// Mixa e masteriza: falas + clipe/ambiente (com ducking) → master -14 LUFS / -1,5 dBTP.
async function mixarEpisodio(opcoes) {
    const registro = require('../log/registro');
    const fim = registro.cronometro();
    const base = { area: 'audio', dados: { falas: (opcoes.falas || []).length, clipe: Boolean(opcoes.clipe), ambiente: Boolean(opcoes.ambiente), master: opcoes.master !== false } };
    try {
        const r = await mixarEpisodioSemRegistro(opcoes);
        const depois = r.depois || {};
        registro.registrar({
            ...base, evento: 'tratamento', ms: fim(),
            msg: `Áudio mixado e masterizado: ${r.duracaoS} s${depois.I != null ? `, ${depois.I} LUFS` : ''}`,
            dados: { ...base.dados, duracaoS: r.duracaoS, lufs: depois.I, picoDb: depois.TP },
        });
        return r;
    } catch (e) {
        registro.registrar({ ...base, nivel: 'erro', evento: 'tratamento-falhou', ms: fim(), msg: `Mixagem do áudio falhou: ${e.message}`, erro: e });
        throw e;
    }
}

async function mixarEpisodioSemRegistro(opcoes) {
    const { saida, master = true, alvo } = opcoes;
    const m = montarMixagem(opcoes);
    fs.mkdirSync(path.dirname(saida), { recursive: true });
    const bruto = master ? saida.replace(/(\.[^.]+)?$/, '.mix.wav') : saida;
    await rodarFfmpeg(['-y', ...m.entradas, '-filter_complex', m.filtro, '-map', m.mapa, '-t', fmt(m.duracaoS, 3),
        '-ar', '44100', ...codecSaida(bruto), bruto]);
    if (!master) return { saida, duracaoS: m.duracaoS, filtro: m.filtro };
    const r = await masterizar(bruto, saida, alvo);
    fs.rmSync(bruto, { force: true });
    return { ...r, duracaoS: m.duracaoS, filtro: m.filtro };
}

module.exports = {
    MASTER_PADRAO, ALVO_FALA_LUFS,
    cadeiaIntencao, cadeiaDialogo, cadeiaFalaMotor, cadeiaGanho, cadeiaDucking, cadeiaCorteFundo, cadeiaAmbiente,
    cadeiaMaster, exportarCadeias, ganhoDb,
    rodarFfmpeg, duracaoArquivo, aplicarCadeia, medirLoudness, normalizarFala, masterizar, montarMixagem, mixarEpisodio,
};
