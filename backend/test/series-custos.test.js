const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { criarLivroCustos } = require('../src/series/custos');
const { pastaTemporaria, apagar } = require('./series-ajuda');

let pasta;
test.beforeEach(() => { pasta = pastaTemporaria(); });
test.afterEach(() => apagar(pasta));

test('sem arquivo: listar vazio e total 0', async () => {
    const livro = criarLivroCustos(pasta);
    assert.deepStrictEqual(await livro.listar(), []);
    assert.strictEqual(await livro.total(), 0);
});

test('registrar acrescenta uma linha JSON e põe "em" quando falta', async () => {
    const livro = criarLivroCustos(pasta);
    const r = livro.registrar({ serie: 'farol', ep: 1, etapa: 'geracao', tipo: 'video', modelo: 'google/veo-3.1-lite', previstoUsd: 0.24, realUsd: 0.24, jobId: 'j1', ref: 'p03/take_01' });
    assert.match(r.em, /^\d{4}-\d{2}-\d{2}T/);
    assert.strictEqual(Object.keys(r)[0], 'em');
    livro.registrar({ em: '2026-11-04T12:00:00Z', serie: 'farol', ep: 2, previstoUsd: 0.1 });
    const linhas = fs.readFileSync(path.join(pasta, 'custos.jsonl'), 'utf8').trim().split('\n');
    assert.strictEqual(linhas.length, 2);
    assert.strictEqual(JSON.parse(linhas[1]).em, '2026-11-04T12:00:00Z');
    assert.throws(() => livro.registrar(null), /objeto/);
    assert.throws(() => livro.registrar([1]), /objeto/);
});

test('total soma realUsd, ou previstoUsd quando realUsd falta; filtra por episódio', async () => {
    const livro = criarLivroCustos(pasta);
    livro.registrar({ ep: 1, previstoUsd: 0.24, realUsd: 0.2 });
    livro.registrar({ ep: 1, previstoUsd: 0.09 });
    livro.registrar({ ep: 2, previstoUsd: 0.5, realUsd: 0.1 });
    livro.registrar({ ep: 2, realUsd: 'não é número', previstoUsd: 0.3 });
    assert.strictEqual(await livro.total(), 0.69); // 0,2 + 0,09 + 0,1 + 0,3
    assert.strictEqual(await livro.total({ ep: 1 }), 0.29);
    assert.strictEqual(await livro.total({ ep: '2' }), 0.4);
    assert.strictEqual(await livro.total({ ep: 'ep01' }), 0.29);
    assert.strictEqual(await livro.total({ ep: 9 }), 0);
    assert.strictEqual((await livro.listar()).length, 4);
});

test('linha corrompida é ignorada e a próxima começa numa linha nova', async () => {
    const arquivo = path.join(pasta, 'custos.jsonl');
    fs.writeFileSync(arquivo, '{"ep":1,"realUsd":0.5}\n{"ep":1,"realUs');
    const livro = criarLivroCustos(pasta);
    livro.registrar({ ep: 1, realUsd: 0.25 });
    const linhas = await livro.listar();
    assert.strictEqual(linhas.length, 2);
    assert.strictEqual(await livro.total(), 0.75);
});

test('cria a pasta se ela ainda não existe', () => {
    const livro = criarLivroCustos(path.join(pasta, 'nova', 'serie'));
    livro.registrar({ ep: 1, realUsd: 0.01 });
    assert.ok(fs.existsSync(path.join(pasta, 'nova', 'serie', 'custos.jsonl')));
    assert.throws(() => criarLivroCustos(''), /pasta/);
});
