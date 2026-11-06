// AprovarBiblia e SalvarIdeiaSerie pelos controllers (pasta temporária, sem rede).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { pastaTemporaria, apagar } = require('./series-ajuda');

const RAIZ = pastaTemporaria('estudio-biblia-');
process.env.ESTUDIO_DADOS = RAIZ;
const armazem = require('../src/series/armazem');
const aprovar = require('../src/controllers/AprovarBiblia');
const ideia = require('../src/controllers/SalvarIdeiaSerie');

function chamar(ctrl, body) {
    return new Promise((ok) => {
        const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(j) { ok({ status: this.statusCode, j }); } };
        ctrl.REST({ body, query: {} }, res);
    });
}
const proposta = () => ({
    biblia: {
        premissa: 'Mara vive sozinha num farol a sete quilômetros da costa quando os mortos se levantam.',
        regras: ['Os infectados seguem a luz', 'Água doce é rara', 'O rádio só funciona à noite'],
        temporada: Array.from({ length: 10 }, (_, i) => ({ n: i + 1, titulo: `Ep ${i + 1}`, fase: '', resumo: 'x' })),
        escolhas: [{ ep: 1, vencedora: 'A', votos: { A: 9, B: 1 } }],
    },
    elenco: [{ id: 'mara', nome: 'Mara', papel: 'protagonista', ancora: 'mulher de 40 anos, capa amarela' }],
    locais: [{ id: 'farol', nome: 'Farol', ancora: 'farol branco numa ilhota' }],
});

test.after(() => apagar(RAIZ));

test('AprovarBiblia grava a bíblia, cria fichas que faltam (sem sobrescrever) e avança a etapa', async () => {
    await armazem.criarSerie({ titulo: 'Teste Farol', ideia: 'curta' }, { raiz: RAIZ });
    const r = await chamar(aprovar, { serie: 'teste-farol', proposta: proposta() });
    assert.strictEqual(r.status, 200, JSON.stringify(r.j));
    assert.match(r.j.biblia.premissa, /Mara vive sozinha/);
    assert.deepStrictEqual(r.j.biblia.escolhas, [], 'votação inventada pela IA não entra');
    assert.deepStrictEqual(r.j.criadas, { elenco: ['mara'], locais: ['farol'] });
    assert.strictEqual(r.j.etapa, 'roteiro');
    assert.ok(fs.existsSync(path.join(RAIZ, 'series', 'teste-farol', 'elenco', 'mara', 'ficha.json')));
    const de2 = await chamar(aprovar, { serie: 'teste-farol', proposta: proposta() });
    assert.deepStrictEqual(de2.j.criadas, { elenco: [], locais: [] }, 'segunda vez não recria nem sobrescreve');
});

test('AprovarBiblia recusa proposta com problemas', async () => {
    const p = proposta();
    p.biblia.premissa = '';
    const r = await chamar(aprovar, { serie: 'teste-farol', proposta: p });
    assert.strictEqual(r.status, 400);
    assert.match(r.j.Error, /premissa/);
});

test('SalvarIdeiaSerie aceita texto longo e recusa vazio', async () => {
    const longa = 'Crie uma série. '.repeat(300);
    const r = await chamar(ideia, { serie: 'teste-farol', ideia: longa });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.j.ideia.length, longa.trim().length);
    assert.strictEqual((await chamar(ideia, { serie: 'teste-farol', ideia: '  ' })).status, 400);
});
