// Parse robusto do JSON que vem do LLM: tira cercas ```json, texto em volta, comentários, vírgula sobrando,
// aspas tipográficas, quebra de linha crua dentro de string e, em último caso, fecha JSON cortado.
// Sempre devolve a lista do que foi consertado.

// Primeiro bloco {...} ou [...] balanceado (respeitando strings).
function primeiroBloco(texto) {
    const ini = texto.search(/[{[]/);
    if (ini < 0) return null;
    const pilha = [];
    let emString = false;
    let escape = false;
    for (let i = ini; i < texto.length; i++) {
        const c = texto[i];
        if (emString) {
            if (escape) escape = false;
            else if (c === '\\') escape = true;
            else if (c === '"') emString = false;
            continue;
        }
        if (c === '"') emString = true;
        else if (c === '{' || c === '[') pilha.push(c);
        else if (c === '}' || c === ']') {
            pilha.pop();
            if (!pilha.length) return texto.slice(ini, i + 1);
        }
    }
    return texto.slice(ini); // não fechou: provavelmente cortado
}

// Passada única fora/dentro de string: comentários, aspas tipográficas, vírgula antes de } ou ], controles crus.
function reparar(texto) {
    let out = '';
    let emString = false;
    let escape = false;
    for (let i = 0; i < texto.length; i++) {
        const c = texto[i];
        if (emString) {
            if (escape) { out += c; escape = false; continue; }
            if (c === '\\') { out += c; escape = true; continue; }
            if (c === '"' || c === '”') { out += '"'; emString = false; continue; }
            if (c === '\n') { out += '\\n'; continue; }
            if (c === '\r') continue;
            if (c === '\t') { out += '\\t'; continue; }
            out += c;
            continue;
        }
        if (c === '"' || c === '“' || c === '”') { out += '"'; emString = true; continue; }
        if (c === '/' && texto[i + 1] === '/') { while (i < texto.length && texto[i] !== '\n') i++; out += '\n'; continue; }
        if (c === '/' && texto[i + 1] === '*') { const fim = texto.indexOf('*/', i + 2); i = fim < 0 ? texto.length : fim + 1; continue; }
        if (c === '}' || c === ']') out = out.replace(/,\s*$/, '');
        out += c;
    }
    return out;
}

// Fecha string/arrays/objetos abertos de um JSON cortado no meio (perde o último item incompleto).
function fecharCortado(texto) {
    const pilha = [];
    let emString = false;
    let escape = false;
    let ultimoSeguro = 0; // posição logo após o último valor completo no nível atual
    for (let i = 0; i < texto.length; i++) {
        const c = texto[i];
        if (emString) {
            if (escape) escape = false;
            else if (c === '\\') escape = true;
            else if (c === '"') emString = false;
            continue;
        }
        if (c === '"') emString = true;
        else if (c === '{' || c === '[') pilha.push(c === '{' ? '}' : ']');
        else if (c === '}' || c === ']') { pilha.pop(); ultimoSeguro = i + 1; }
        else if (c === ',') ultimoSeguro = i;
    }
    if (!pilha.length && !emString) return texto;
    // corta o item incompleto e recalcula a pilha até ali
    let base = texto.slice(0, ultimoSeguro).replace(/[,:\s]+$/, '');
    const p2 = [];
    let s2 = false;
    let e2 = false;
    for (const c of base) {
        if (s2) { if (e2) e2 = false; else if (c === '\\') e2 = true; else if (c === '"') s2 = false; continue; }
        if (c === '"') s2 = true;
        else if (c === '{' || c === '[') p2.push(c === '{' ? '}' : ']');
        else if (c === '}' || c === ']') p2.pop();
    }
    if (s2) base += '"';
    return base + p2.reverse().join('');
}

function tentar(t) {
    try {
        return { ok: true, valor: JSON.parse(t) };
    } catch (e) {
        return { ok: false, erro: e.message };
    }
}

/**
 * @param texto resposta do LLM (string) ou objeto já parseado
 * @returns {{ok: boolean, valor?: any, consertos: string[], erro?: string}}
 */
function extrairJson(texto) {
    const consertos = [];
    if (texto && typeof texto === 'object') return { ok: true, valor: texto, consertos };
    let t = String(texto ?? '').replace(/^﻿/, '').trim();
    if (!t) return { ok: false, consertos, erro: 'Resposta vazia da IA.' };

    if (/<think>[\s\S]*?<\/think>/i.test(t)) {
        t = t.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        consertos.push('removido bloco de raciocínio <think>');
    }
    const cerca = t.match(/```(?:json|JSON)?\s*([\s\S]*?)(?:```|$)/);
    if (cerca && t.includes('```')) {
        t = cerca[1].trim();
        consertos.push('removida a cerca de código ```json');
    }
    let r = tentar(t);
    if (r.ok) return { ok: true, valor: r.valor, consertos };

    const bloco = primeiroBloco(t);
    if (bloco && bloco !== t) {
        t = bloco;
        consertos.push('ignorado o texto fora do JSON');
        r = tentar(t);
        if (r.ok) return { ok: true, valor: r.valor, consertos };
    }

    const reparado = reparar(t);
    r = tentar(reparado);
    if (r.ok) {
        consertos.push('JSON consertado (comentários, vírgula sobrando, aspas tipográficas ou quebra de linha em texto)');
        return { ok: true, valor: r.valor, consertos };
    }

    const fechado = fecharCortado(reparado);
    r = tentar(fechado);
    if (r.ok) {
        consertos.push('JSON veio cortado: fechado automaticamente (o último item incompleto foi descartado — confira se falta algo)');
        return { ok: true, valor: r.valor, consertos, cortado: true };
    }
    return { ok: false, consertos, erro: `A IA não devolveu um JSON válido (${r.erro}).` };
}

module.exports = { extrairJson, primeiroBloco, reparar, fecharCortado };
