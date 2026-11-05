// Parse robusto do JSON do LLM, sempre com a lista do que foi consertado.
const test = require('node:test');
const assert = require('node:assert');
const { extrairJson } = require('../src/showrunner/json');

test('JSON limpo passa sem consertos', () => {
    const r = extrairJson('{"a":1}');
    assert.deepStrictEqual(r, { ok: true, valor: { a: 1 }, consertos: [] });
});

test('cerca ```json e texto em volta', () => {
    const r = extrairJson('Claro! Aqui está:\n```json\n{"titulo":"Farol"}\n```\nQualquer coisa me avise.');
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.valor.titulo, 'Farol');
    assert.ok(r.consertos.some((c) => /cerca/.test(c)));
});

test('texto antes e depois sem cerca', () => {
    const r = extrairJson('Segue o roteiro {"n":1,"planos":[{"n":1}]} fim.');
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.valor.planos[0].n, 1);
    assert.ok(r.consertos.some((c) => /fora do JSON/.test(c)));
});

test('vírgula sobrando, comentários, aspas tipográficas e quebra de linha crua', () => {
    const bruto = '{\n  // comentário\n  "a": [1, 2, ],\n  /* bloco */ "b": “olá”,\n  "c": "linha 1\nlinha 2",\n}';
    const r = extrairJson(bruto);
    assert.strictEqual(r.ok, true);
    assert.deepStrictEqual(r.valor, { a: [1, 2], b: 'olá', c: 'linha 1\nlinha 2' });
    assert.ok(r.consertos.some((c) => /consertado/.test(c)));
});

test('URL dentro de string não vira comentário', () => {
    const r = extrairJson('{"url":"https://exemplo.com/x", "n": 2,}');
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.valor.url, 'https://exemplo.com/x');
});

test('JSON cortado no meio é fechado e avisa', () => {
    const r = extrairJson('{"planos":[{"n":1,"prompt":"ok"},{"n":2,"prompt":"cort');
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.cortado, true);
    assert.strictEqual(r.valor.planos[0].prompt, 'ok');
    assert.ok(r.consertos.some((c) => /cortado/.test(c)));
});

test('bloco <think> é removido', () => {
    const r = extrairJson('<think>pensando {"x":0}</think>{"y":1}');
    assert.deepStrictEqual(r.valor, { y: 1 });
});

test('sem JSON nenhum: erro claro', () => {
    const r = extrairJson('não consigo ajudar com isso');
    assert.strictEqual(r.ok, false);
    assert.match(r.erro, /não devolveu um JSON válido/);
    assert.strictEqual(extrairJson('').ok, false);
});

test('objeto já parseado passa direto', () => {
    assert.deepStrictEqual(extrairJson({ a: 1 }).valor, { a: 1 });
});
