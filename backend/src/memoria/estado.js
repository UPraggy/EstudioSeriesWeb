// estado.json = o mundo AGORA (fim do último episódio consolidado).
// Aqui: estado inicial a partir da bíblia, descrição em texto e diferença entre dois estados.
const { normalizar, clonar, lista, epTag } = require('./util');

const FORA_DO_MUNDO = new Set(['narrador', 'alerta']); // apresentador e vozes de sistema não estão "no mundo"

function ehApresentador(ficha) {
    return Boolean(ficha && (ficha.apresentador || FORA_DO_MUNDO.has(ficha.id)));
}

// Texto livre ("porta do cais") -> id de local ("porta"), se der para reconhecer.
function resolverLocal(texto, locais) {
    if (texto == null || texto === '') return null;
    const ids = Object.keys(locais || {});
    if (ids.includes(texto)) return texto;
    const t = normalizar(texto);
    const palavras = new Set(t.split(/[^a-z0-9]+/).filter(Boolean));
    for (const id of ids) if (palavras.has(normalizar(id))) return id;
    for (const id of ids) {
        const nome = normalizar(locais[id].nome || '');
        if (nome && (nome.includes(t) || t.includes(nome))) return id;
    }
    return String(texto);
}

// Estado do mundo antes do Ep. 1, montado da bíblia + fichas (usado quando ainda não há estado.json).
function estadoInicial(serie) {
    const b = serie.biblia || {};
    const locais = serie.fichas?.locais || {};
    const estado = {
        versao: 1, atualizadoAte: 'ep00', personagens: {}, objetos: {}, locais: {}, recursos: clonar(b.recursos || {}),
        segredos: [], misteriosAbertos: [...lista(b.misterios)], escolhas: [], consequenciasPendentes: [],
    };
    const fichasElenco = serie.fichas?.elenco || {};
    const personagensBiblia = lista(b.personagens);
    const ids = new Set([...Object.keys(fichasElenco), ...personagensBiblia.map((p) => p.id).filter(Boolean)]);
    for (const id of ids) {
        const ficha = fichasElenco[id] || {};
        if (ehApresentador(ficha) || FORA_DO_MUNDO.has(id)) continue;
        const pb = personagensBiblia.find((p) => p.id === id) || {};
        estado.personagens[id] = {
            nome: ficha.nome || pb.nome || id,
            onde: resolverLocal(pb.onde ?? null, locais),
            vivo: pb.vivo !== false,
            condicao: pb.estado || pb.condicao || 'sem ferimentos',
            ferimentos: lista(pb.ferimentos),
            estadoFicha: ficha.estadoAtual || 'padrao',
            carrega: lista(pb.carrega),
            sabe: lista(pb.sabe),
        };
    }
    const objFichas = serie.fichas?.objetos || {};
    for (const o of lista(b.objetos)) {
        if (!o || !o.id) continue;
        const f = objFichas[o.id] || {};
        estado.objetos[o.id] = {
            nome: f.nome || o.nome || o.id,
            onde: resolverLocal(o.onde ?? f.onde ?? null, locais),
            estado: o.estado || null,
            comQuem: o.comQuem || null,
            fixo: Boolean(o.fixo ?? f.fixo),
        };
    }
    const seg = b.segredos || {};
    lista(seg.publico || b.segredos_publico).forEach((texto, i) => estado.segredos.push({ id: `publico-${i + 1}`, texto, sabem: [], publicoSabe: true }));
    lista(seg.personagens).forEach((texto, i) => estado.segredos.push({ id: `personagem-${i + 1}`, texto, sabem: [], publicoSabe: false }));
    for (const e of lista(b.escolhas)) {
        if (e && (e.vencedora === 'A' || e.vencedora === 'B')) {
            estado.escolhas.push({ ep: e.ep, vencedora: e.vencedora, texto: e[e.vencedora], votos: e.votos || null });
        }
    }
    return estado;
}

function nomeLocal(id, serie) {
    if (!id) return 'lugar desconhecido';
    const f = serie?.fichas?.locais?.[id];
    return f?.nome ? `${f.nome} (${id})` : id;
}

// Uma linha por personagem/objeto (para entrar no pacote do LLM e poder ser cortada uma a uma).
function linhaPersonagem(id, p, serie) {
    if (!p) return `- ${id}: sem estado registrado`;
    const partes = [`- ${p.nome || id} (${id}): ${p.vivo === false ? 'MORTO' : 'vivo'}`];
    if (p.onde) partes.push(`em ${nomeLocal(p.onde, serie)}`);
    if (p.condicao) partes.push(p.condicao);
    const fer = lista(p.ferimentos).map((f) => (typeof f === 'string' ? f : [f.onde, f.descricao].filter(Boolean).join(': '))).filter(Boolean);
    if (fer.length) partes.push(`ferimentos: ${fer.join('; ')}`);
    if (lista(p.carrega).length) partes.push(`carrega: ${lista(p.carrega).join(', ')}`);
    if (lista(p.sabe).length) partes.push(`sabe: ${lista(p.sabe).join('; ')}`);
    return partes.join(' · ');
}

function linhaObjeto(id, o, serie) {
    if (!o) return `- ${id}: sem estado registrado`;
    const partes = [`- ${o.nome || id} (${id}): ${o.comQuem ? `com ${o.comQuem}` : `em ${nomeLocal(o.onde, serie)}`}`];
    if (o.estado) partes.push(o.estado);
    if (o.fixo) partes.push('fixo (não sai do lugar)');
    return partes.join(' · ');
}

function linhasRecursos(estado) {
    return Object.entries(estado?.recursos || {}).map(([k, v]) => `- ${k}: ${v}`);
}

// Diferenças legíveis entre dois estados (para o Rafael aprovar a consolidação).
function diferencas(antes, depois) {
    const out = [];
    const a = antes || {};
    const d = depois || {};
    const ids = new Set([...Object.keys(a.personagens || {}), ...Object.keys(d.personagens || {})]);
    for (const id of ids) {
        const x = a.personagens?.[id];
        const y = d.personagens?.[id];
        if (!x && y) { out.push(`personagem novo: ${y.nome || id}`); continue; }
        if (x && !y) { out.push(`personagem removido do estado: ${x.nome || id}`); continue; }
        for (const campo of ['onde', 'vivo', 'condicao', 'estadoFicha']) {
            if (JSON.stringify(x[campo]) !== JSON.stringify(y[campo])) out.push(`${y.nome || id} · ${campo}: ${fmt(x[campo])} → ${fmt(y[campo])}`);
        }
        for (const campo of ['ferimentos', 'carrega', 'sabe']) {
            if (JSON.stringify(x[campo] || []) !== JSON.stringify(y[campo] || [])) out.push(`${y.nome || id} · ${campo}: ${fmt(x[campo])} → ${fmt(y[campo])}`);
        }
    }
    const objs = new Set([...Object.keys(a.objetos || {}), ...Object.keys(d.objetos || {})]);
    for (const id of objs) {
        const x = a.objetos?.[id];
        const y = d.objetos?.[id];
        if (!x && y) { out.push(`objeto novo: ${y.nome || id} em ${fmt(y.onde)}`); continue; }
        if (x && !y) continue;
        for (const campo of ['onde', 'estado', 'comQuem']) {
            if (JSON.stringify(x[campo]) !== JSON.stringify(y[campo])) out.push(`${y.nome || id} · ${campo}: ${fmt(x[campo])} → ${fmt(y[campo])}`);
        }
    }
    for (const k of new Set([...Object.keys(a.recursos || {}), ...Object.keys(d.recursos || {})])) {
        if (a.recursos?.[k] !== d.recursos?.[k]) out.push(`recurso ${k}: ${fmt(a.recursos?.[k])} → ${fmt(d.recursos?.[k])}`);
    }
    const ea = (a.escolhas || []).length;
    for (const e of (d.escolhas || []).slice(ea)) out.push(`escolha do Ep. ${e.ep}: ${e.vencedora}${e.texto ? ` (${e.texto})` : ''}`);
    return out;
}

function fmt(v) {
    if (v == null || v === '') return '—';
    if (Array.isArray(v)) return v.length ? v.map((x) => (typeof x === 'object' ? JSON.stringify(x) : x)).join(', ') : '—';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
}

function estadoOuInicial(serie) {
    return serie.memoria?.estado || estadoInicial(serie);
}

function tagAtualizado(estado) {
    try {
        return epTag(estado?.atualizadoAte ?? 0);
    } catch {
        return 'ep00';
    }
}

module.exports = {
    FORA_DO_MUNDO, ehApresentador, resolverLocal, estadoInicial, estadoOuInicial, nomeLocal,
    linhaPersonagem, linhaObjeto, linhasRecursos, diferencas, tagAtualizado,
};
