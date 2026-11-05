// Utilidades da memória da série (sem dependências externas).
const fs = require('fs');
const path = require('path');

// "Ação!" -> "acao!" (minúsculas, sem acento) — para comparar textos.
function normalizar(texto) {
    return String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// Slug de id: minúsculas, sem acento, hífens.
function slug(texto) {
    return normalizar(texto).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

// 'ep01' | 1 | '1' | 'ep01/p05' | 'biblia' -> número do episódio (bíblia = 0). Desconhecido -> null.
function epNum(valor) {
    if (typeof valor === 'number' && Number.isFinite(valor)) return valor;
    if (valor == null) return null;
    const s = normalizar(valor).trim();
    if (s === 'biblia') return 0;
    const m = s.match(/^(?:ep)?\s*(\d+)/);
    return m ? Number(m[1]) : null;
}

// 1 -> 'ep01'
function epTag(valor) {
    const n = epNum(valor);
    if (n == null) throw new Error(`Episódio inválido: ${valor}`);
    return 'ep' + String(n).padStart(2, '0');
}

function contarPalavras(texto) {
    return String(texto ?? '').trim().split(/\s+/).filter((p) => /[\p{L}\p{N}]/u.test(p)).length;
}

function lerJson(caminho, padrao = null) {
    let bruto;
    try {
        bruto = fs.readFileSync(caminho, 'utf8');
    } catch (e) {
        if (e.code === 'ENOENT') return padrao;
        throw e;
    }
    try {
        return JSON.parse(bruto.replace(/^﻿/, ''));
    } catch (e) {
        throw new Error(`JSON inválido em ${caminho}: ${e.message}`);
    }
}

function lerTexto(caminho, padrao = null) {
    try {
        return fs.readFileSync(caminho, 'utf8').replace(/^﻿/, '');
    } catch (e) {
        if (e.code === 'ENOENT') return padrao;
        throw e;
    }
}

// Gravação atômica: escreve num temporário e renomeia (nunca deixa arquivo pela metade).
function gravarTexto(caminho, texto) {
    fs.mkdirSync(path.dirname(caminho), { recursive: true });
    const tmp = `${caminho}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, texto, 'utf8');
    fs.renameSync(tmp, caminho);
}

function gravarJson(caminho, obj) {
    gravarTexto(caminho, JSON.stringify(obj, null, 2) + '\n');
}

// JSONL: uma linha por objeto. Linha quebrada não derruba a leitura (vai para `erros`).
function lerJsonl(caminho) {
    const texto = lerTexto(caminho, '');
    const itens = [];
    const erros = [];
    texto.split(/\r?\n/).forEach((linha, i) => {
        const t = linha.trim();
        if (!t) return;
        try {
            itens.push(JSON.parse(t));
        } catch (e) {
            erros.push(`linha ${i + 1}: ${e.message}`);
        }
    });
    return { itens, erros };
}

// Só acrescenta (nunca reescreve): garante quebra de linha antes, se alguém editou à mão.
function acrescentarJsonl(caminho, objetos) {
    if (!objetos || !objetos.length) return;
    fs.mkdirSync(path.dirname(caminho), { recursive: true });
    let prefixo = '';
    try {
        const st = fs.statSync(caminho);
        if (st.size > 0) {
            const fd = fs.openSync(caminho, 'r');
            const b = Buffer.alloc(1);
            fs.readSync(fd, b, 0, 1, st.size - 1);
            fs.closeSync(fd);
            if (b.toString() !== '\n') prefixo = '\n';
        }
    } catch (e) {
        if (e.code !== 'ENOENT') throw e;
    }
    fs.appendFileSync(caminho, prefixo + objetos.map((o) => JSON.stringify(o)).join('\n') + '\n', 'utf8');
}

function clonar(obj) {
    return obj == null ? obj : JSON.parse(JSON.stringify(obj));
}

function lista(v) {
    if (v == null || v === '') return [];
    return Array.isArray(v) ? v : [v];
}

// Corta texto longo para caber numa linha de resumo.
function encurtar(texto, max = 80) {
    const t = String(texto ?? '').replace(/\s+/g, ' ').trim();
    return t.length <= max ? t : t.slice(0, max - 1) + '…';
}

function paraPosix(p) {
    return String(p).split(path.sep).join('/');
}

module.exports = {
    normalizar, slug, epNum, epTag, contarPalavras,
    lerJson, lerTexto, gravarTexto, gravarJson, lerJsonl, acrescentarJsonl,
    clonar, lista, encurtar, paraPosix,
};
