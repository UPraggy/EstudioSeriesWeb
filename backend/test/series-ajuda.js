// Ajudantes dos testes de séries (não é teste: não termina em .test.js).
const fs = require('fs');
const os = require('os');
const path = require('path');

// PNG 1x1 de verdade (assinatura válida).
const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

function pastaTemporaria(prefixo = 'estudio-teste-') {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefixo));
}

function apagar(pasta) {
    fs.rmSync(pasta, { recursive: true, force: true });
}

// Grava um PNG (variacao muda o conteúdo, para ter hashes diferentes).
function criarPng(pasta, nome, variacao = '') {
    const caminho = path.join(pasta, nome);
    fs.writeFileSync(caminho, Buffer.concat([PNG_1PX, Buffer.from(variacao)]));
    return caminho;
}

// Roteiro válido de 60 s (8 planos) no formato do CONTRATOS.
function roteiroValido(extra = {}) {
    const tempos = [[0, 5], [5, 13], [13, 21], [21, 28], [28, 38], [38, 47], [47, 54], [54, 60]];
    return {
        versao: 1,
        n: 1,
        titulo: 'Sete Quilômetros',
        objetivo: 'Apresentar a protagonista.',
        resumo: 'Resumo curto.',
        gancho: 'Sete quilômetros de mar.',
        duracaoAlvoS: 60,
        planos: tempos.map(([de, ate], i) => ({
            n: i + 1,
            deS: de,
            ateS: ate,
            tipo: i === 1 || i === 7 ? 'apresentador' : 'video_ia',
            local: 'farol',
            elenco: i === 1 || i === 7 ? ['narrador'] : ['mara'],
            objetos: [],
            visual: 'Farol à noite.',
            tela: '',
            falas: [{ quem: i % 2 ? 'mara' : 'narrador', texto: 'Uma fala curta e clara.', via: i % 2 ? 'em_cena' : 'narracao' }],
        })),
        escolhas: {
            A: { texto: 'ACENDER O FAROL', detalhe: 'guia o irmão', consequencia: '' },
            B: { texto: 'DEIXAR APAGADO', detalhe: 'protege a ilhota', consequencia: '' },
        },
        cta: 'Comente A ou B.',
        aprovado: null,
        ...extra,
    };
}

module.exports = { PNG_1PX, pastaTemporaria, apagar, criarPng, roteiroValido };
