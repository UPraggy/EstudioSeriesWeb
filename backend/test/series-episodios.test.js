const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const armazem = require('../src/series/armazem');
const fichas = require('../src/series/fichas');
const episodios = require('../src/series/episodios');
const { pastaTemporaria, apagar, roteiroValido } = require('./series-ajuda');

let raiz;
let op;
test.beforeEach(async () => {
    raiz = pastaTemporaria();
    op = { raiz };
    await armazem.criarSerie({ titulo: 'Farol' }, op);
    await fichas.criarFicha('farol', 'elenco', { nome: 'Mara', ancora: 'mulher' }, op);
    await fichas.criarFicha('farol', 'elenco', { id: 'narrador', nome: 'O Narrador', ancora: 'homem' }, op);
});
test.afterEach(() => apagar(raiz));

test('criarEpisodio cria a pasta epNN e registra no serie.json (sem duplicar)', async () => {
    const e = await episodios.criarEpisodio('farol', 1, 'Sete Quilômetros', op);
    assert.deepStrictEqual(e, { n: 1, id: 'ep01', titulo: 'Sete Quilômetros', status: 'roteiro' });
    assert.ok(fs.statSync(path.join(raiz, 'series', 'farol', 'episodios', 'ep01')).isDirectory());
    await assert.rejects(episodios.criarEpisodio('farol', 1, 'De novo', op), (x) => x.status === 409);
    assert.strictEqual((await armazem.lerSerie('farol', op)).episodios.length, 1);
    await assert.rejects(episodios.criarEpisodio('farol', 0, 'x', op), /inválido/);
    await assert.rejects(episodios.criarEpisodio('farol', '1/../..', 'x', op), /inválido/);
});

test('criarEpisodio aceita duração livre, número automático e episódio curto sem votação', async () => {
    const a = await episodios.criarEpisodio('farol', undefined, 'Teste', op, { duracaoAlvoS: '5' });
    assert.deepStrictEqual(a, { n: 1, id: 'ep01', titulo: 'Teste', status: 'roteiro', duracaoAlvoS: 5, semEscolha: true });
    const b = await episodios.criarEpisodio('farol', null, 'Longo', op, { duracaoAlvoS: 90 });
    assert.strictEqual(b.n, 2);
    assert.strictEqual(b.semEscolha, false);
    const c = await episodios.criarEpisodio('farol', 7, 'Curto com voto', op, { duracaoAlvoS: 15, semEscolha: false });
    assert.strictEqual(c.semEscolha, false);
    await assert.rejects(episodios.criarEpisodio('farol', 8, 'x', op, { duracaoAlvoS: 0 }), /Duração inválida/);
    await assert.rejects(episodios.criarEpisodio('farol', 8, 'x', op, { duracaoAlvoS: 9999 }), /Duração inválida/);
});

test('salvarRoteiro de 5 s: um plano, "escolhas": null, duração do episódio e bíblia intacta', async () => {
    await episodios.criarEpisodio('farol', 1, 'Teste', op, { duracaoAlvoS: 5 });
    const curto = roteiroValido();
    delete curto.duracaoAlvoS;
    curto.planos = [{ ...curto.planos[0], n: 1, deS: 0, ateS: 5, falas: [{ quem: 'narrador', texto: 'Sete quilômetros de mar.', via: 'narracao' }] }];
    curto.escolhas = null;
    curto.cta = '';
    const { roteiro } = await episodios.salvarRoteiro('farol', 1, curto, op);
    assert.strictEqual(roteiro.duracaoAlvoS, 5);
    assert.strictEqual(roteiro.escolhas, null);
    const biblia = await armazem.lerBiblia('farol', op);
    assert.deepStrictEqual(biblia.escolhas || [], []);
    // 6 s num alvo de 5 s passa da tolerância proporcional (±0,5 s)
    const longo = { ...curto, planos: [{ ...curto.planos[0], ateS: 6 }] };
    await assert.rejects(episodios.salvarRoteiro('farol', 1, longo, op), (e) => e.status === 400 && e.erros.some((x) => x.includes('±0,5') || x.includes('±0.5')));
});

test('salvarRoteiro valida antes, grava e põe a escolha A/B na bíblia', async () => {
    await episodios.criarEpisodio('farol', 1, 'Sete Quilômetros', op);
    const { roteiro, avisos } = await episodios.salvarRoteiro('farol', 1, roteiroValido(), op);
    assert.strictEqual(roteiro.n, 1);
    assert.ok(Array.isArray(avisos));
    const lido = await episodios.lerRoteiro('farol', 1, op);
    assert.strictEqual(lido.titulo, 'Sete Quilômetros');
    const biblia = await armazem.lerBiblia('farol', op);
    assert.deepStrictEqual(biblia.escolhas, [{ ep: 1, A: 'ACENDER O FAROL', B: 'DEIXAR APAGADO', vencedora: null, votos: { A: 0, B: 0 } }]);
});

test('salvarRoteiro recusa roteiro inválido e não grava nada', async () => {
    const ruim = roteiroValido();
    ruim.planos[0].falas[0].quem = 'fantasma';
    await assert.rejects(episodios.salvarRoteiro('farol', 1, ruim, op), (e) => e.status === 400 && e.erros.some((x) => x.includes('fantasma')));
    assert.ok(!fs.existsSync(path.join(raiz, 'series', 'farol', 'episodios', 'ep01', 'roteiro.json')));
    await assert.rejects(episodios.salvarRoteiro('farol', 2, roteiroValido(), op), /episódio 1, não do 2/);
});

test('salvarRoteiro cria o episódio quando ele ainda não existe', async () => {
    await episodios.salvarRoteiro('farol', 3, roteiroValido({ n: 3, titulo: 'Diesel' }), op);
    const s = await armazem.lerSerie('farol', op);
    assert.deepStrictEqual(s.episodios, [{ n: 3, id: 'ep03', titulo: 'Diesel', status: 'roteiro', duracaoAlvoS: 60, semEscolha: false }]);
    const ep = await episodios.lerEpisodio('farol', 3, op);
    assert.strictEqual(ep.roteiro.titulo, 'Diesel');
    assert.strictEqual(ep.planos, null);
    assert.strictEqual(ep.votacao, null);
});

test('registrarVotacao calcula vencedora/empate e atualiza a bíblia', async () => {
    await episodios.salvarRoteiro('farol', 1, roteiroValido(), op);
    const { votacao, escolha } = await episodios.registrarVotacao('farol', 1, { A: 12, B: 30, fonte: 'youtube' }, op);
    assert.strictEqual(votacao.vencedora, 'B');
    assert.strictEqual(votacao.fonte, 'youtube');
    assert.deepStrictEqual(escolha.votos, { A: 12, B: 30 });
    const gravada = JSON.parse(fs.readFileSync(path.join(raiz, 'series', 'farol', 'episodios', 'ep01', 'votacao.json'), 'utf8'));
    assert.strictEqual(gravada.vencedora, 'B');
    assert.strictEqual(gravada.ep, 1);

    const empate = await episodios.registrarVotacao('farol', 1, { A: '7', B: '7' }, op);
    assert.strictEqual(empate.votacao.vencedora, 'empate');
    assert.strictEqual(empate.votacao.fonte, 'manual');
    const biblia = await armazem.lerBiblia('farol', op);
    assert.strictEqual(biblia.escolhas.length, 1);
    assert.strictEqual(biblia.escolhas[0].vencedora, 'empate');
    assert.strictEqual(biblia.escolhas[0].A, 'ACENDER O FAROL');
});

test('registrarVotacao nunca inventa: exige os dois números reais', async () => {
    await episodios.salvarRoteiro('farol', 1, roteiroValido(), op);
    await assert.rejects(episodios.registrarVotacao('farol', 1, { A: 5 }, op), /votos de B/);
    await assert.rejects(episodios.registrarVotacao('farol', 1, { A: -1, B: 2 }, op), /votos de A/);
    await assert.rejects(episodios.registrarVotacao('farol', 1, { A: 1.5, B: 2 }, op), /votos de A/);
    await assert.rejects(episodios.registrarVotacao('farol', 1, { A: 0, B: 0 }, op), /Sem votos/);
    await assert.rejects(episodios.registrarVotacao('farol', 1, { A: 1, B: 2, fonte: 'chute' }, op), /Fonte/);
    await assert.rejects(episodios.registrarVotacao('farol', 9, { A: 1, B: 2 }, op), (e) => e.status === 404);
    assert.strictEqual((await episodios.lerEpisodio('farol', 1, op)).votacao, null);
});

test('salvarPlanos valida o planos.json', async () => {
    await episodios.criarEpisodio('farol', 1, 'x', op);
    const doc = { versao: 1, planos: [{ n: 1, tipo: 'video_ia', duracaoS: 8, prompt: 'farol', ancoras: ['farol'], quadroChave: null, modelo: 'google/veo-3.1-lite', custoPrevistoUsd: 0.24, dependeDe: [], takes: [], takeEscolhido: null }] };
    const r = await episodios.salvarPlanos('farol', 1, doc, op);
    assert.strictEqual(r.planos.planos.length, 1);
    doc.planos[0].duracaoS = 30;
    await assert.rejects(episodios.salvarPlanos('farol', 1, doc, op), (e) => e.status === 400);
});
