// Funções puras da Mesa (linha do tempo, tempos, cores, geometria da prévia).
// As operações de faixa espelham backend/src/edicao/edicao.js (mesmas regras: sobrescrever, dividir, recortar).
import GlobalVar from '../subComponents/GlobalVar';

export const FAIXAS = ['video', 'narracao', 'falas', 'efeitos', 'ambiente', 'texto', 'ab'];
export const FAIXAS_AUDIO = ['narracao', 'falas', 'efeitos'];
const EPS = 1e-6;

export const arred = (n, c = 3) => Math.round(Number(n) * 10 ** c) / 10 ** c;
export const noQuadro = (s, fps = 24) => Math.round(Number(s) * fps) / fps;
export const fimDe = (i) => (Number(i.inicioS) || 0) + (Number(i.duracaoS) || 0);
export const limitar = (v, a, b) => Math.max(a, Math.min(b, v));
let contador = 0;
export const novoId = (p = 'i') => `${p}${Date.now().toString(36)}${(contador++).toString(36)}`;

// 00:12,3
export function fmtTempo(s, casas = 1) {
    const v = Math.max(0, Number(s) || 0);
    const m = Math.floor(v / 60);
    const r = (v - m * 60).toFixed(casas).padStart(casas ? 3 + casas : 2, '0').replace('.', ',');
    return `${String(m).padStart(2, '0')}:${r}`;
}
// 00:12:05 (minutos:segundos:quadros)
export function fmtTimecode(s, fps = 24) {
    const total = Math.max(0, Math.round((Number(s) || 0) * fps));
    const q = total % fps;
    const seg = Math.floor(total / fps);
    return `${String(Math.floor(seg / 60)).padStart(2, '0')}:${String(seg % 60).padStart(2, '0')}:${String(q).padStart(2, '0')}`;
}
export const fmtS = (s, c = 1) => `${(Number(s) || 0).toFixed(c).replace('.', ',')} s`;
export const fmtUsd = (v) => {
    const n = Number(v) || 0;
    return `US$ ${n.toFixed(n !== 0 && Math.abs(n) < 0.01 ? 4 : 2).replace('.', ',')}`;
};

export function midiaUrl(serie, caminho) {
    if (!caminho) return '';
    return `${GlobalVar.serverBase}/Midia?${new URLSearchParams({ serie, caminho })}`;
}

export const nomeArquivo = (c) => String(c || '').split('/').pop().replace(/_[0-9a-f]{8}(?=\.\w+$)/, '').replace(/\.\w+$/, '').replace(/_/g, ' ');
export const ehImagem = (a) => /\.(png|jpe?g|webp)$/i.test(String(a || ''));

// ---------- cores por personagem (as mesmas das legendas, em tom apagado na interface) ----------
const CORES = { narrador: '#E3DCCB', mara: '#E3A94B', davi: '#7FB3D5', alerta: '#E07A6E', radio: '#E07A6E' };
const EXTRAS = ['#9FBF96', '#B9A7D9', '#D9A7C2', '#CFC27A', '#9CC4D6'];
export function corDe(quem) {
    const q = String(quem || '').toLowerCase();
    if (CORES[q]) return CORES[q];
    let h = 0;
    for (const ch of q) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return EXTRAS[h % EXTRAS.length];
}
export function rgba(hex, a) {
    const m = String(hex).replace('#', '').match(/^(..)(..)(..)$/);
    if (!m) return `rgba(200,200,200,${a})`;
    return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${a})`;
}
export const NOMES = { narrador: 'Narrador', mara: 'Mara', davi: 'Davi', alerta: 'Alerta' };
export const nomeDe = (quem) => NOMES[String(quem || '').toLowerCase()] || (quem ? quem[0].toUpperCase() + quem.slice(1) : '—');

// ---------- geometria da prévia (1080×1920; igual a backend/src/edicao/render.js GEOMETRIA) ----------
export const GEOM = {
    largura: 1080,
    altura: 1920,
    zona: { xMin: 65, xMax: 888, yMin: 290, yMax: 1248 },
    margemL: 85,
    margemR: 212,
    legenda: { base: 1240, tamanho: 50, contorno: 4 },
    tela: { topo: 330, tamanho: 104 },
    cartao: { yA: 700, yB: 930, altura: 190, colunaLetra: 140, letra: 150, titulo: 64, sub: 42 },
};

// ---------- faixas ----------
export function lanesDe(doc) {
    const quem = [];
    for (const f of doc.faixas.falas || []) if (!quem.includes(f.quem)) quem.push(f.quem);
    return [
        { id: 'video', faixa: 'video', nome: 'Vídeo', alto: 56 },
        { id: 'narracao', faixa: 'narracao', nome: 'Narração', alto: 36, cor: corDe('narrador') },
        ...quem.map((q) => ({ id: `falas:${q}`, faixa: 'falas', quem: q, nome: nomeDe(q), alto: 28, cor: corDe(q) })),
        { id: 'efeitos', faixa: 'efeitos', nome: 'Rádio / efeito', alto: 24, cor: corDe('radio') },
        { id: 'ambiente', faixa: 'ambiente', nome: 'Ambiente', alto: 22, cor: '#8B9A88' },
        { id: 'texto', faixa: 'texto', nome: 'Texto de tela', alto: 22 },
        { id: 'legenda', faixa: 'legenda', nome: 'Legenda', alto: 22 },
        { id: 'ab', faixa: 'ab', nome: 'A / B', alto: 22, cor: '#E7B95F' },
    ];
}

export function itensDaLane(doc, lane) {
    if (lane.faixa === 'legenda') return (doc.legenda || []).map((b) => ({ ...b, inicioS: b.ini, duracaoS: b.fim - b.ini }));
    const lista = doc.faixas[lane.faixa] || [];
    return lane.quem ? lista.filter((i) => i.quem === lane.quem) : lista;
}

export function acharItem(doc, sel) {
    if (!sel) return null;
    if (sel.faixa === 'legenda') return (doc.legenda || []).find((b) => b.id === sel.id) || null;
    return (doc.faixas[sel.faixa] || []).find((i) => i.id === sel.id) || null;
}

export function limitesPlanos(doc) {
    const lim = new Map();
    for (const p of doc.planos || []) lim.set(p.n, { n: p.n, deS: Number(p.deS), ateS: Number(p.ateS) });
    const por = new Map();
    for (const v of doc.faixas.video || []) {
        if (v.plano === undefined || v.plano === null) continue;
        const l = por.get(v.plano) || { n: v.plano, deS: Infinity, ateS: -Infinity };
        l.deS = Math.min(l.deS, v.inicioS);
        l.ateS = Math.max(l.ateS, fimDe(v));
        por.set(v.plano, l);
    }
    for (const [n, l] of por) lim.set(n, { n, deS: arred(l.deS), ateS: arred(l.ateS) });
    return [...lim.values()].sort((a, b) => a.deS - b.deS || a.n - b.n);
}

export function planoNoTempo(doc, t) {
    const l = limitesPlanos(doc);
    return (l.find((p) => t >= p.deS - EPS && t < p.ateS - EPS) || l.at(-1) || { n: null }).n;
}

export function dividirItem(item, t, idDepois) {
    const ini = Number(item.inicioS);
    const fim = fimDe(item);
    if (!(t > ini + EPS && t < fim - EPS)) return [item];
    const a = { ...item, duracaoS: arred(t - ini) };
    const b = { ...item, id: idDepois || novoId(String(item.id || 'i').slice(0, 1)), inicioS: arred(t), duracaoS: arred(fim - t) };
    if (item.entradaS !== undefined && item.entradaS !== null) b.entradaS = arred(Number(item.entradaS) + (t - ini));
    return [a, b];
}

export function recortarFaixa(itens, de, ate) {
    const saida = [];
    for (const it of itens) {
        if (fimDe(it) <= de + EPS || Number(it.inicioS) >= ate - EPS) { saida.push(it); continue; }
        let p = [it].flatMap((x) => dividirItem(x, de, novoId('v'))).flatMap((x) => dividirItem(x, ate, novoId('v')));
        p = p.filter((x) => {
            const meio = (Number(x.inicioS) + fimDe(x)) / 2;
            return !(meio > de && meio < ate);
        });
        saida.push(...p);
    }
    return saida.sort((a, b) => a.inicioS - b.inicioS);
}

// Sobrescreve o vídeo embaixo do item (modo "overwrite" de editor de vídeo).
export function sobrescreverVideo(video, item) {
    const resto = recortarFaixa(video.filter((v) => v.id !== item.id), item.inicioS, fimDe(item));
    return [...resto, item].sort((a, b) => a.inicioS - b.inicioS);
}

export function linhaDeVideo(doc, duracaoS = doc.duracaoS) {
    const segs = [...(doc.faixas.video || [])].filter((s) => s.duracaoS > EPS)
        .map((s, i) => ({ s, i })).sort((a, b) => a.s.inicioS - b.s.inicioS || a.i - b.i).map((x) => x.s);
    let pintado = [];
    for (const s of segs) {
        pintado = recortarFaixa(pintado, Number(s.inicioS), fimDe(s));
        pintado.push({ ...s, entradaS: Number(s.entradaS) || 0 });
        pintado.sort((a, b) => a.inicioS - b.inicioS);
    }
    const out = [];
    let t = 0;
    for (const p of pintado) {
        const ini = Math.max(Number(p.inicioS), t);
        const fim = Math.min(fimDe(p), duracaoS);
        if (fim - ini <= 0.01) continue;
        if (ini - t > 0.01) out.push({ arquivo: null, inicioS: t, duracaoS: ini - t, entradaS: 0 });
        out.push({ ...p, inicioS: ini, duracaoS: fim - ini, entradaS: p.entradaS + (ini - Number(p.inicioS)) });
        t = fim;
    }
    if (duracaoS - t > 0.01) out.push({ arquivo: null, inicioS: t, duracaoS: duracaoS - t, entradaS: 0 });
    return out;
}

export function duracaoDoc(doc) {
    const fim = Math.max(0, ...['video', 'narracao', 'falas', 'efeitos', 'texto', 'ab'].flatMap((f) => (doc.faixas[f] || []).map(fimDe)));
    return arred(fim || doc.duracaoS || 0);
}

// Duração-alvo do episódio: LIVRE (5 s, 60 s, 3 min...). Vem do roteiro (a edição grava duracaoAlvoS);
// sem ela, o fim do último plano; sem planos, a duração real. Nunca um 60 fixo.
export function alvoDe(doc) {
    if (!doc) return 1;
    const a = Number(doc.duracaoAlvoS);
    if (a > 0) return a;
    const p = Math.max(0, ...(doc.planos || []).map((x) => Number(x.ateS) || 0));
    return p > 0 ? p : Math.max(1, duracaoDoc(doc));
}

// Etapas de uma regeração de trecho (para o acompanhamento): enviado → gerando → aparando → pronto.
export const ETAPAS_REGERACAO = ['Enviado', 'Gerando', 'Aparando', 'Pronto'];
export function passoRegeracao(r) {
    if (!r) return 0;
    if (r.status === 'pronto') return 3;
    const e = String(r.etapa || '');
    if (/aparando/.test(e)) return 2;
    if (/gerando|baixando/.test(e)) return 1;
    return 0;
}

// Pontos do imã: bordas dos itens, limites dos planos, começo de cada palavra falada, 0 e o fim.
export function pontosIma(doc, excluirId = null, cursor = null) {
    const p = new Set([0, duracaoDoc(doc)]);
    if (cursor !== null) p.add(cursor);
    for (const l of limitesPlanos(doc)) { p.add(l.deS); p.add(l.ateS); }
    for (const f of FAIXAS) {
        for (const it of doc.faixas[f] || []) {
            if (it.id === excluirId) continue;
            p.add(Number(it.inicioS));
            p.add(fimDe(it));
            if (FAIXAS_AUDIO.includes(f) && Array.isArray(it.palavras)) {
                const base = Number(it.inicioS) - (Number(it.entradaS) || 0);
                for (const w of it.palavras) {
                    const t = base + Number(w.t);
                    if (t >= Number(it.inicioS) - EPS && t <= fimDe(it) + EPS) p.add(arred(t));
                }
            }
        }
    }
    return [...p].sort((a, b) => a - b);
}

export function imantar(t, pontos, tolS) {
    let melhor = null;
    for (const x of pontos) {
        const d = Math.abs(x - t);
        if (d <= tolS && (melhor === null || d < Math.abs(melhor - t))) melhor = x;
    }
    return melhor;
}

// Tempo absoluto de cada palavra de uma fala (para o inspetor e o imã).
export function palavrasAbsolutas(it) {
    const base = Number(it.inicioS) - (Number(it.entradaS) || 0);
    const textos = String(it.texto || '').split(/\s+/).filter(Boolean);
    const pal = it.palavras || [];
    return pal.map((w, i) => ({ texto: textos.length === pal.length ? textos[i] : w.p, t: arred(base + Number(w.t)) }))
        .filter((w) => w.t >= Number(it.inicioS) - EPS && w.t <= fimDe(it) + EPS);
}

// A legenda anda com a fala movida e é cortada quando a fala é aparada.
export function acompanharLegenda(legenda, item, antes) {
    // a legenda presa ao "zero" do arquivo de áudio: mover muda esse zero; aparar o começo não
    const zero = (x) => Number(x.inicioS) - (Number(x.entradaS) || 0);
    const delta = zero(item) - zero(antes);
    const ini = Number(item.inicioS);
    const fim = fimDe(item) + 0.35;
    return (legenda || []).map((b) => {
        if (b.item !== item.id) return b;
        const nb = { ...b, ini: arred(b.ini + delta, 2), fim: arred(b.fim + delta, 2) };
        if (nb.fim <= ini + 0.05 || nb.ini >= fim - 0.05) return null;
        return { ...nb, ini: Math.max(nb.ini, arred(ini, 2)), fim: Math.min(nb.fim, arred(fim, 2)) };
    }).filter(Boolean);
}

export const legendaNoTempo = (doc, t) => (doc.legenda || []).find((b) => t >= b.ini && t < b.fim) || null;
export const textoNoTempo = (doc, t) => (doc.faixas.texto || []).filter((x) => t >= x.inicioS && t < fimDe(x));
export const abNoTempo = (doc, t) => (doc.faixas.ab || []).find((x) => t >= x.inicioS && t < fimDe(x)) || null;

// Clona o documento (as edições nunca mexem no objeto atual: desfazer local e salvar dependem disso).
export const clonar = (o) => JSON.parse(JSON.stringify(o));
