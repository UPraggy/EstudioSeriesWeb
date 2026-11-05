// LEGENDAS (SRT e ASS) a partir dos tempos das palavras do próprio TTS (sem Whisper).
// Blocos de até 2 linhas × ~32 caracteres, 1–4,5 s, quebra na pontuação, cor por personagem,
// posição dentro da ZONA SEGURA do 9:16 e modo "palavra a palavra" (destaque na palavra falada).
// Zona segura (união Shorts + TikTok + Reels, 1080×1920): x 65–888, y 290–1248 — docs/PESQUISA-2026-11-04.md §2
// (Revid: Shorts topo 288/base 672/dir. 192; TikTok base 440–480/dir. 140–150; Reels 14% topo/35% base/6% lados).
const fs = require('fs');
const path = require('path');
const { normalizarPalavra } = require('./parametros');
const cfg = require('./config');

const PADRAO = {
    largura: 1080,
    altura: 1920,
    zonaSegura: { xMin: 65, xMax: 888, yMin: 290, yMax: 1248 },
    folgaPx: 20, // folga dentro da zona segura
    baseLegendaY: 1240, // pesquisa: legenda em y ≈ 1050–1240
    posicao: 'baixo', // baixo | centro | alto
    maxCaracteres: 32,
    maxLinhas: 2,
    minS: 1.0,
    maxS: 4.5,
    pausaQuebraS: 0.8, // silêncio maior que isto fecha o bloco
    permanenciaS: 0.3, // o último bloco da fala fica um pouco depois da última palavra
    fonte: 'Arial',
    tamanhoFonte: 50,
    negrito: true,
    contorno: 4,
    sombra: 1.5,
    cores: {
        narrador: '#EFE7D6', // osso
        mara: '#FFB547', // âmbar
        davi: '#9AD8F2', // azul-frio
        alerta: '#FF8F87', // vermelho-claro (voz de rádio/alerta)
        radio: '#FF8F87', // fala de rádio de quem não tem cor própria
    },
    coresExtras: ['#B8E6B0', '#D7C4F5', '#F5C4DE', '#F2E394', '#C9E3F0'],
    corDestaque: '#FFFFFF', // palavra falada no modo "palavra"
    alfaApagada: '80', // palavras que ainda vão ser ditas (modo "palavra"), hex 00–FF
    corSrt: false, // <font color> no SRT (nem todo player mostra)
};

function opcoesCompletas(o = {}) {
    return {
        ...PADRAO,
        ...o,
        zonaSegura: { ...PADRAO.zonaSegura, ...(o.zonaSegura || {}) },
        cores: { ...PADRAO.cores, ...(o.cores || {}) },
    };
}

// ---------- medidas ----------
// Larguras (em "em") da Arial Bold, para estimar se a linha cabe na zona segura.
const LARG = {
    ' ': 0.278, i: 0.278, j: 0.278, l: 0.278, I: 0.278, '.': 0.278, ',': 0.278, "'": 0.238, '|': 0.28,
    f: 0.333, t: 0.333, '!': 0.333, ':': 0.333, ';': 0.333, '-': 0.333, '(': 0.333, ')': 0.333,
    r: 0.389, '"': 0.474, z: 0.5, J: 0.556, m: 0.889, w: 0.778, M: 0.833, W: 0.944, '?': 0.611, '…': 1.0,
    '—': 1.0, '–': 0.556, '«': 0.556, '»': 0.556,
};
function larguraCaractere(ch) {
    if (LARG[ch] !== undefined) return LARG[ch];
    const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (LARG[base] !== undefined) return LARG[base];
    if (/[0-9]/.test(base)) return 0.556;
    if (/[a-z]/.test(base)) return /[bdghnopqu]/.test(base) ? 0.611 : 0.556;
    if (/[A-Z]/.test(base)) return /[GOQ]/.test(base) ? 0.778 : /[EFLPSTZ]/.test(base) ? 0.667 : 0.722;
    return 0.6;
}
const larguraTexto = (texto, tamanho) => [...String(texto)].reduce((s, ch) => s + larguraCaractere(ch), 0) * tamanho;

function geometria(o) {
    const z = o.zonaSegura;
    const margemL = z.xMin + o.folgaPx;
    const margemR = o.largura - z.xMax + o.folgaPx;
    const larguraMax = o.largura - margemL - margemR;
    const alturaLinha = Math.round(o.tamanhoFonte * 1.2 + o.contorno);
    const blocoAltura = alturaLinha * o.maxLinhas;
    let alinhamento = 2;
    let margemV = o.altura - Math.min(o.baseLegendaY, z.yMax - 4);
    let pos = null;
    if (o.posicao === 'alto') {
        alinhamento = 8;
        margemV = z.yMin + o.folgaPx;
    } else if (o.posicao === 'centro') {
        alinhamento = 5;
        pos = { x: Math.round((margemL + o.largura - margemR) / 2), y: Math.round((z.yMin + z.yMax) / 2) };
    }
    // caixa ocupada pelo bloco (2 linhas) — usada nos testes da zona segura
    let topo;
    if (alinhamento === 2) topo = o.altura - margemV - blocoAltura;
    else if (alinhamento === 8) topo = margemV;
    else topo = pos.y - blocoAltura / 2;
    return { margemL, margemR, margemV, larguraMax, alturaLinha, alinhamento, pos, caixa: { x0: margemL, x1: o.largura - margemR, y0: topo, y1: topo + blocoAltura } };
}

function cabeNaLinha(texto, o, g) {
    return texto.length <= o.maxCaracteres && larguraTexto(texto, o.tamanhoFonte) <= g.larguraMax;
}

const PONTUACAO_LINHA = /[.!?…,;:—–]["'»”)\]]*$/;
const PALAVRA_FRACA = /^(a|o|as|os|um|uma|de|da|do|das|dos|em|na|no|nas|nos|e|que|por|pra|para|com|se|ao|à|num|numa|sem)$/i;

// Quebra as palavras em até maxLinhas linhas que cabem; null se não couber.
function quebrarLinhas(palavras, o, g) {
    const texto = palavras.join(' ');
    if (cabeNaLinha(texto, o, g)) return [texto];
    if (o.maxLinhas < 2 || palavras.length < 2) return null;
    let melhor = null;
    for (let k = 1; k < palavras.length; k++) {
        const l1 = palavras.slice(0, k).join(' ');
        const l2 = palavras.slice(k).join(' ');
        if (!cabeNaLinha(l1, o, g) || !cabeNaLinha(l2, o, g)) continue;
        const w1 = larguraTexto(l1, o.tamanhoFonte);
        const w2 = larguraTexto(l2, o.tamanhoFonte);
        let custo = Math.abs(w1 - w2);
        if (PONTUACAO_LINHA.test(palavras[k - 1])) custo -= g.larguraMax * 0.25; // prefere quebrar na pontuação
        if (PALAVRA_FRACA.test(palavras[k - 1])) custo += g.larguraMax * 0.3; // não termina linha em "da", "no", "e"...
        if (w1 > w2) custo += g.larguraMax * 0.02; // linha de cima levemente menor (pirâmide)
        if (!melhor || custo < melhor.custo) melhor = { custo, linhas: [l1, l2] };
    }
    return melhor ? melhor.linhas : null;
}

// ---------- tempos das palavras ----------
// Casa as palavras do texto EXIBIDO com as palavras do TTS (o dicionário pode ter trocado a grafia, números viram
// extenso): mesma contagem → por índice; senão maior subsequência comum e o resto interpolado pelo tamanho.
function alinharPalavras(textoExibido, palavrasTts = [], duracaoS = 0) {
    const tokens = String(textoExibido || '').split(/\s+/).filter(Boolean);
    const nT = tokens.map(normalizarPalavra);
    const nP = palavrasTts.map((w) => normalizarPalavra(w.p));
    const tempos = new Array(tokens.length).fill(null);
    if (!tokens.length) return [];
    const fimFala = duracaoS > 0 ? duracaoS : (palavrasTts.at(-1)?.t || 0) + 0.6;

    if (nP.length === nT.length) {
        palavrasTts.forEach((w, i) => { tempos[i] = w.t; });
    } else if (nP.length) {
        const dp = Array.from({ length: nT.length + 1 }, () => new Array(nP.length + 1).fill(0));
        for (let i = nT.length - 1; i >= 0; i--) {
            for (let j = nP.length - 1; j >= 0; j--) {
                dp[i][j] = nT[i] && nT[i] === nP[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
            }
        }
        let i = 0;
        let j = 0;
        while (i < nT.length && j < nP.length) {
            if (nT[i] && nT[i] === nP[j]) { tempos[i] = palavrasTts[j].t; i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++;
        }
    }

    // preenche os buracos entre âncoras, proporcional ao tamanho da palavra
    const peso = (k) => Math.max(1, nT[k].length) + 1;
    let k = 0;
    while (k < tokens.length) {
        if (tempos[k] !== null) { k++; continue; }
        const ini = k;
        while (k < tokens.length && tempos[k] === null) k++;
        const antes = ini > 0 ? tempos[ini - 1] : null;
        const depois = k < tokens.length ? tempos[k] : null;
        const t0 = antes !== null ? antes + 0.12 + 0.06 * nT[ini - 1].length : (palavrasTts[0]?.t ?? 0.05);
        const t1 = depois !== null ? depois : Math.max(t0 + 0.2, fimFala - 0.15);
        const total = Array.from({ length: k - ini }, (_, q) => peso(ini + q)).reduce((a, b) => a + b, 0);
        let acc = 0;
        for (let q = ini; q < k; q++) {
            tempos[q] = t0 + (t1 - t0) * (acc / total);
            acc += peso(q);
        }
    }
    for (let q = 1; q < tempos.length; q++) if (tempos[q] < tempos[q - 1]) tempos[q] = tempos[q - 1];

    return tokens.map((texto, q) => {
        const ini = tempos[q];
        const estimativa = 0.25 + 0.09 * Math.max(1, nT[q].length);
        const prox = q + 1 < tokens.length ? tempos[q + 1] : null;
        let fim = prox !== null && prox - ini <= estimativa * 1.6 ? prox : ini + estimativa;
        if (prox === null) fim = Math.min(fimFala, ini + estimativa * 1.4);
        if (prox !== null) fim = Math.min(fim, prox);
        return { texto, ini, fim: Math.max(fim, ini + 0.08) };
    });
}

// ---------- blocos ----------
function corDaFala(fala, o) {
    const quem = String(fala.quem || '').toLowerCase();
    if (o.cores[quem]) return o.cores[quem];
    if (fala.intencao === 'radio' || fala.via === 'radio') return o.cores.radio;
    let h = 0;
    for (const ch of quem) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return o.coresExtras[h % o.coresExtras.length];
}

const FIM_FRASE = /(\.\.\.|…|[.!?])["'»”)\]]*$/;
const PAUSA_CURTA = /[,;:—–]["'»”)\]]*$/;
// palavras que não devem terminar um bloco (artigos, preposições, conjunções curtas)
const FRACAS = new Set(['a', 'o', 'as', 'os', 'um', 'uma', 'de', 'da', 'do', 'das', 'dos', 'em', 'na', 'no', 'nas', 'nos',
    'e', 'que', 'por', 'pra', 'para', 'com', 'se', 'ao', 'à', 'num', 'numa', 'sem', 'mas', 'nem', 'ou']);

function blocosDaFala(fala, o, g) {
    const tokens = alinharPalavras(fala.textoExibido, fala.palavras || [], fala.duracaoS || 0)
        .map((t) => ({ ...t, ini: (fala.inicioS || 0) + t.ini, fim: (fala.inicioS || 0) + t.fim }));
    const capacidade = o.maxCaracteres * o.maxLinhas;
    const blocos = [];
    let atual = [];
    const emitir = (lista) => {
        const palavras = lista.map((t) => t.texto);
        const linhas = quebrarLinhas(palavras, o, g) || [palavras.join(' ')];
        blocos.push({ quem: fala.quem, falaId: fala.id, intencao: fala.intencao, via: fala.via, cor: corDaFala(fala, o), linhas, palavras: lista, ini: lista[0].ini, fim: lista.at(-1).fim });
    };
    const fechar = () => {
        if (atual.length) emitir(atual);
        atual = [];
    };
    // Bloco cheio no meio da frase: corta na última pontuação do bloco (ou antes de uma palavra fraca)
    // e leva o resto para o próximo bloco — nunca "Farol da | Ponta Norte".
    const fecharCheio = () => {
        let corte = -1;
        for (let k = atual.length - 2; k >= 1; k--) if (PAUSA_CURTA.test(atual[k].texto) || FIM_FRASE.test(atual[k].texto)) { corte = k; break; }
        if (corte < 0) {
            let k = atual.length - 1;
            while (k >= 2 && FRACAS.has(normalizarPalavra(atual[k].texto))) k--;
            if (k < atual.length - 1) corte = k;
        }
        if (corte < 0) return fechar();
        emitir(atual.slice(0, corte + 1));
        atual = atual.slice(corte + 1);
    };
    tokens.forEach((tok, i) => {
        if (atual.length) {
            const silencio = tok.ini - atual.at(-1).fim > o.pausaQuebraS;
            if (silencio) fechar();
        }
        if (atual.length) {
            const naoCabe = !quebrarLinhas([...atual.map((t) => t.texto), tok.texto], o, g);
            const longo = tok.fim - atual[0].ini > o.maxS;
            if (naoCabe || longo) fecharCheio();
            if (atual.length && (!quebrarLinhas([...atual.map((t) => t.texto), tok.texto], o, g) || tok.fim - atual[0].ini > o.maxS)) fechar();
        }
        atual.push(tok);
        if (i === tokens.length - 1) return;
        const chars = atual.map((t) => t.texto).join(' ').length;
        const dur = tok.fim - atual[0].ini;
        if (FIM_FRASE.test(tok.texto) && (chars >= 10 || dur >= o.minS)) fechar();
        else if (PAUSA_CURTA.test(tok.texto) && chars >= capacidade * 0.4) fechar();
    });
    fechar();
    if (blocos.length) blocos.at(-1).ultimoDaFala = true;
    return blocos;
}

// Ajusta durações: mínimo 1 s, máximo 4,5 s, sem sobrepor o próximo (empurra o início do próximo se preciso).
function ajustarDuracoes(blocos, o) {
    blocos.sort((a, b) => a.ini - b.ini);
    for (let i = 0; i < blocos.length; i++) {
        const b = blocos[i];
        const prox = blocos[i + 1];
        if (b.ultimoDaFala) b.fim += o.permanenciaS;
        if (b.fim - b.ini < o.minS) b.fim = b.ini + o.minS;
        if (b.fim - b.ini > o.maxS) b.fim = b.ini + o.maxS;
        if (prox && b.fim > prox.ini) {
            if (prox.ini - b.ini >= o.minS) b.fim = prox.ini;
            else {
                b.fim = b.ini + o.minS;
                prox.ini = b.fim;
                if (prox.fim < prox.ini) prox.fim = prox.ini;
            }
        }
        b.ini = Math.round(b.ini * 100) / 100;
        b.fim = Math.round(b.fim * 100) / 100;
    }
    return blocos;
}

function montarBlocos(falas, opcoes = {}) {
    const o = opcoesCompletas(opcoes);
    const g = geometria(o);
    const blocos = falas.filter((f) => f.textoExibido && (f.status === undefined || f.status === 'pronta'))
        .flatMap((f) => blocosDaFala(f, o, g));
    return ajustarDuracoes(blocos, o);
}

// ---------- formatos ----------
function tempoSrt(s) {
    const ms = Math.max(0, Math.round(s * 1000));
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const seg = Math.floor((ms % 60000) / 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(seg).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
}

function tempoAss(s) {
    const cs = Math.max(0, Math.round(s * 100));
    const h = Math.floor(cs / 360000);
    const m = Math.floor((cs % 360000) / 6000);
    const seg = Math.floor((cs % 6000) / 100);
    return `${h}:${String(m).padStart(2, '0')}:${String(seg).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
}

// '#RRGGBB' → '&H00BBGGRR' (formato de cor do ASS)
function corAss(hex, alfa = '00') {
    const m = String(hex).replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
    if (!m) throw new Error(`Cor inválida: ${hex}`);
    return `&H${alfa}${m[3]}${m[2]}${m[1]}`.toUpperCase();
}
const corAssInline = (hex) => `${corAss(hex).slice(0, 2)}${corAss(hex).slice(4)}&`; // &HBBGGRR&

const escaparAss = (t) => String(t).replace(/\\/g, '/').replace(/\{/g, '(').replace(/\}/g, ')').replace(/\r?\n/g, ' ');
const nomeEstilo = (quem) => String(quem || 'fala').replace(/[^A-Za-z0-9_]/g, '_') || 'fala';

function gerarSrt(blocos, opcoes = {}) {
    const o = opcoesCompletas(opcoes);
    return blocos.map((b, i) => {
        let texto = b.linhas.join('\n');
        if (o.corSrt) texto = `<font color="${b.cor}">${texto}</font>`;
        return `${i + 1}\n${tempoSrt(b.ini)} --> ${tempoSrt(b.fim)}\n${texto}\n`;
    }).join('\n');
}

function textoPalavraAtiva(b, ativa, o) {
    // mesmas linhas em todos os eventos do bloco (só muda cor/alfa): a legenda não "pula"
    const destaque = corAssInline(o.corDestaque);
    const base = corAssInline(b.cor);
    const apag = `&H${o.alfaApagada.toUpperCase()}&`;
    let idx = 0;
    return b.linhas.map((linha) => linha.split(' ').map((palavra) => {
        const k = idx++;
        const p = escaparAss(palavra);
        if (k === ativa) return `{\\1c${destaque}}${p}{\\1c${base}}`;
        if (k > ativa) return `{\\1a${apag}\\3a${apag}}${p}{\\1a&H00&\\3a&H00&}`;
        return p;
    }).join(' ')).join('\\N');
}

function gerarAss(blocos, opcoes = {}) {
    const o = opcoesCompletas(opcoes);
    const g = geometria(o);
    const modo = o.modo === 'palavra' ? 'palavra' : 'frase';
    const estilos = new Map();
    for (const b of blocos) if (!estilos.has(nomeEstilo(b.quem))) estilos.set(nomeEstilo(b.quem), b.cor);
    if (!estilos.size) estilos.set('narrador', o.cores.narrador);

    const linhaEstilo = (nome, cor) => [
        `Style: ${nome}`, o.fonte, o.tamanhoFonte, corAss(cor), corAss('#FFFFFF'), corAss('#000000'), corAss('#000000', '80'),
        o.negrito ? -1 : 0, 0, 0, 0, 100, 100, 0, 0, 1, o.contorno, o.sombra, g.alinhamento, g.margemL, g.margemR, g.margemV, 1,
    ].join(',');

    const pos = g.pos ? `{\\pos(${g.pos.x},${g.pos.y})}` : '';
    const eventos = [];
    for (const b of blocos) {
        const estilo = nomeEstilo(b.quem);
        if (modo === 'frase') {
            eventos.push(`Dialogue: 0,${tempoAss(b.ini)},${tempoAss(b.fim)},${estilo},${estilo},0,0,0,,${pos}${b.linhas.map(escaparAss).join('\\N')}`);
            continue;
        }
        const n = b.palavras.length;
        for (let k = 0; k < n; k++) {
            const ini = k === 0 ? b.ini : Math.min(Math.max(b.palavras[k].ini, b.ini), b.fim);
            const fim = k === n - 1 ? b.fim : Math.min(Math.max(b.palavras[k + 1].ini, b.ini), b.fim);
            if (Math.round(fim * 100) <= Math.round(ini * 100)) continue;
            eventos.push(`Dialogue: 0,${tempoAss(ini)},${tempoAss(fim)},${estilo},${estilo},0,0,0,,${pos}${textoPalavraAtiva(b, k, o)}`);
        }
    }

    return [
        '[Script Info]',
        '; Estúdio de Séries — legendas pelos tempos do TTS (zona segura: docs/PESQUISA-2026-11-04.md §2)',
        'ScriptType: v4.00+',
        `PlayResX: ${o.largura}`,
        `PlayResY: ${o.altura}`,
        'WrapStyle: 2',
        'ScaledBorderAndShadow: yes',
        'YCbCr Matrix: TV.709',
        '',
        '[V4+ Styles]',
        'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
        ...[...estilos].map(([nome, cor]) => linhaEstilo(nome, cor)),
        '',
        '[Events]',
        'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
        ...eventos,
        '',
    ].join('\n');
}

// Lê falas.json do episódio e grava legendas.srt + legendas.ass (+ legendas-palavra.ass com modo "palavra").
function gerarLegendasEpisodio(serie, episodio, opcoes = {}) {
    const pastaEp = cfg.pastaEpisodio(serie, episodio);
    const arqFalas = path.join(pastaEp, 'falas.json');
    if (!fs.existsSync(arqFalas)) throw new Error(`falas.json não encontrado: gere as falas primeiro (${arqFalas})`);
    const { falas = [] } = cfg.lerJson(arqFalas);
    const blocos = montarBlocos(falas, opcoes);
    const modo = opcoes.modo || 'frase';
    const arquivos = {};
    const gravar = (nome, conteudo) => {
        const arq = path.join(pastaEp, nome);
        fs.writeFileSync(arq, `﻿${conteudo}`, 'utf8'); // BOM: players do Windows reconhecem os acentos
        arquivos[nome] = arq;
    };
    gravar('legendas.srt', gerarSrt(blocos, opcoes));
    gravar('legendas.ass', gerarAss(blocos, { ...opcoes, modo: 'frase' }));
    if (modo === 'palavra' || modo === 'ambos') gravar('legendas-palavra.ass', gerarAss(blocos, { ...opcoes, modo: 'palavra' }));
    return { arquivos, blocos: blocos.length, geometria: geometria(opcoesCompletas(opcoes)) };
}

module.exports = {
    PADRAO, opcoesCompletas, geometria, larguraTexto, quebrarLinhas, alinharPalavras, corDaFala, corAss,
    montarBlocos, gerarSrt, gerarAss, gerarLegendasEpisodio, tempoSrt, tempoAss,
};
