// Livro de custos da série: <serie>/custos.jsonl, uma linha JSON por chamada paga, só acrescenta.
// Interface combinada com o cliente do OpenRouter (backend/src/openrouter):
//   const livro = criarLivroCustos(raizSerie);
//   livro.registrar({ serie, ep, etapa, tipo, modelo, previstoUsd, realUsd, jobId, ref })  // síncrono; põe "em" se faltar
//   await livro.total({ ep })   // soma realUsd (ou previstoUsd quando realUsd falta)
//   await livro.listar()        // todas as linhas (linhas corrompidas são ignoradas)
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

function ehNumero(v) {
    return typeof v === 'number' && Number.isFinite(v);
}

// Aceita 1, "1" ou "ep01".
function numeroEp(ep) {
    if (ep === undefined || ep === null || ep === '') return null;
    if (typeof ep === 'number') return ep;
    const m = String(ep).match(/\d+/);
    return m ? Number(m[0]) : null;
}

function criarLivroCustos(raizSerie) {
    if (typeof raizSerie !== 'string' || !raizSerie.trim()) throw new Error('criarLivroCustos: informe a pasta da série.');
    const arquivo = path.join(raizSerie, 'custos.jsonl');

    // Síncrono de propósito: a linha fica no disco antes de qualquer outra coisa acontecer.
    function registrar(linha) {
        if (!linha || typeof linha !== 'object' || Array.isArray(linha)) throw new Error('Linha de custo inválida: precisa ser um objeto.');
        const registro = linha.em ? { ...linha } : { em: new Date().toISOString(), ...linha };
        fs.mkdirSync(raizSerie, { recursive: true });
        // Se a última linha ficou sem "\n" (gravação interrompida), começa numa linha nova.
        let prefixo = '';
        try {
            const st = fs.statSync(arquivo);
            if (st.size > 0) {
                const fd = fs.openSync(arquivo, 'r');
                try {
                    const ultimo = Buffer.alloc(1);
                    fs.readSync(fd, ultimo, 0, 1, st.size - 1);
                    if (ultimo[0] !== 0x0a) prefixo = '\n';
                } finally {
                    fs.closeSync(fd);
                }
            }
        } catch (e) {
            if (e.code !== 'ENOENT') throw e;
        }
        fs.appendFileSync(arquivo, `${prefixo}${JSON.stringify(registro)}\n`, 'utf8');
        return registro;
    }

    async function listar() {
        let texto;
        try {
            texto = await fsp.readFile(arquivo, 'utf8');
        } catch (e) {
            if (e.code === 'ENOENT') return [];
            throw e;
        }
        const linhas = [];
        for (const bruta of texto.replace(/^﻿/, '').split(/\r?\n/)) {
            if (!bruta.trim()) continue;
            try {
                const obj = JSON.parse(bruta);
                if (obj && typeof obj === 'object' && !Array.isArray(obj)) linhas.push(obj);
            } catch {
                // linha corrompida: ignorada (o arquivo nunca é reescrito)
            }
        }
        return linhas;
    }

    async function total({ ep } = {}) {
        const alvo = numeroEp(ep);
        let soma = 0;
        for (const l of await listar()) {
            if (alvo !== null && numeroEp(l.ep) !== alvo) continue;
            if (ehNumero(l.realUsd)) soma += l.realUsd;
            else if (ehNumero(l.previstoUsd)) soma += l.previstoUsd;
        }
        return Math.round(soma * 1e6) / 1e6;
    }

    return { arquivo, registrar, total, listar };
}

module.exports = { criarLivroCustos };
