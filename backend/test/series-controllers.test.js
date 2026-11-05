// Testa os controllers de séries num app Express local (o routes.js é registrado à parte).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const express = require('express');
const { pastaTemporaria, apagar, criarPng, roteiroValido, PNG_1PX } = require('./series-ajuda');

const POST = ['CriarSerie', 'SalvarFicha', 'AdicionarReferencia', 'DefinirCanonica', 'SalvarRoteiro', 'RegistrarVotacao', 'LerSerie', 'LerEpisodio'];
const GET = ['ListarSeries', 'LerSerie', 'LerEpisodio'];

let raiz;
let fora;
let servidor;
let base;
let antes;

test.before(async () => {
    raiz = pastaTemporaria();
    fora = pastaTemporaria('estudio-origem-');
    antes = process.env.ESTUDIO_DADOS;
    process.env.ESTUDIO_DADOS = raiz; // nunca a raiz real
    const app = express();
    app.use(express.json({ limit: '100mb' }));
    for (const nome of POST) app.post(`/${nome}`, require(`../src/controllers/${nome}`).REST);
    for (const nome of GET) app.get(`/${nome}`, require(`../src/controllers/${nome}`).REST);
    servidor = app.listen(0, '127.0.0.1');
    await new Promise((r) => servidor.once('listening', r));
    base = `http://127.0.0.1:${servidor.address().port}`;
});

test.after(() => {
    servidor.close();
    if (antes === undefined) delete process.env.ESTUDIO_DADOS;
    else process.env.ESTUDIO_DADOS = antes;
    apagar(raiz);
    apagar(fora);
});

async function post(rota, corpo) {
    const r = await fetch(`${base}/${rota}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    return { status: r.status, json: await r.json() };
}

async function get(rota, query = '') {
    const r = await fetch(`${base}/${rota}${query}`);
    return { status: r.status, json: await r.json() };
}

test('fluxo completo pelos controllers', async () => {
    let r = await get('ListarSeries');
    assert.deepStrictEqual(r.json, { series: [] });

    r = await post('CriarSerie', { titulo: 'O Último Farol', genero: 'Sobrevivência', ideia: 'Uma ilhota.' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.serie.id, 'o-ultimo-farol');
    assert.ok(fs.existsSync(path.join(raiz, 'series', 'o-ultimo-farol', 'serie.json')));

    r = await post('CriarSerie', { titulo: 'O ultimo farol' });
    assert.strictEqual(r.status, 409);
    assert.match(r.json.Error, /já existe/);

    r = await post('SalvarFicha', { serie: 'o-ultimo-farol', tipo: 'elenco', ficha: { id: 'mara', nome: 'Mara', ancora: 'mulher', voz: 'pt-BR-ThalitaMultilingualNeural' } });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.ficha.tipo, 'personagem');
    await post('SalvarFicha', { serie: 'o-ultimo-farol', tipo: 'elenco', ficha: { id: 'narrador', nome: 'O Narrador', ancora: 'homem' } });

    r = await post('AdicionarReferencia', { serie: 'o-ultimo-farol', tipo: 'elenco', id: 'mara', caminhoArquivo: criarPng(fora, 'mara.png'), candidata: true });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.caminho, 'ref/candidatas/mara.png');

    r = await post('AdicionarReferencia', { serie: 'o-ultimo-farol', tipo: 'elenco', id: 'mara', vista: 'perfil', arquivo: { nome: 'perfil.png', base64: Buffer.concat([PNG_1PX, Buffer.from('p')]).toString('base64') } });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.caminho, 'ref/padrao-perfil.png');

    r = await post('DefinirCanonica', { serie: 'o-ultimo-farol', tipo: 'elenco', id: 'mara', caminho: 'ref/candidatas/mara.png' });
    assert.strictEqual(r.json.ficha.canonica, 'ref/candidatas/mara.png');

    r = await post('SalvarRoteiro', { serie: 'o-ultimo-farol', n: 1, roteiro: roteiroValido() });
    assert.strictEqual(r.status, 200);
    assert.ok(Array.isArray(r.json.avisos));

    const ruim = roteiroValido();
    ruim.escolhas.B.texto = ruim.escolhas.A.texto;
    r = await post('SalvarRoteiro', { serie: 'o-ultimo-farol', n: 1, roteiro: ruim });
    assert.strictEqual(r.status, 400);
    assert.ok(r.json.erros.some((e) => e.includes('A e B são iguais')));

    r = await get('LerEpisodio', '?serie=o-ultimo-farol&n=1');
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.episodio.roteiro.escolhas.B.texto, 'DEIXAR APAGADO');

    r = await post('RegistrarVotacao', { serie: 'o-ultimo-farol', n: 1, A: 40, B: 12, fonte: 'manual' });
    assert.strictEqual(r.json.votacao.vencedora, 'A');

    r = await post('RegistrarVotacao', { serie: 'o-ultimo-farol', n: 1, A: 40 });
    assert.strictEqual(r.status, 400);

    r = await get('LerSerie', '?serie=o-ultimo-farol');
    assert.strictEqual(r.json.serie.episodios.length, 1);
    assert.deepStrictEqual(r.json.elenco.map((f) => f.id), ['mara', 'narrador']);
    assert.strictEqual(r.json.biblia.escolhas[0].vencedora, 'A');
    assert.strictEqual(r.json.custos.gastoUsd, 0);

    r = await get('ListarSeries');
    assert.strictEqual(r.json.series.length, 1);
});

test('controllers recusam path traversal', async () => {
    let r = await get('LerSerie', `?serie=${encodeURIComponent('../../Windows')}`);
    assert.strictEqual(r.status, 400);
    r = await post('SalvarFicha', { serie: 'o-ultimo-farol', tipo: 'elenco', ficha: { id: '../../fora', nome: 'X' } });
    assert.strictEqual(r.status, 400);
    r = await post('SalvarFicha', { serie: 'o-ultimo-farol', tipo: '../elenco', ficha: { id: 'x', nome: 'X' } });
    assert.strictEqual(r.status, 400);
    r = await post('DefinirCanonica', { serie: 'o-ultimo-farol', tipo: 'elenco', id: 'mara', caminho: '../../serie.json' });
    assert.strictEqual(r.status, 400);
    r = await post('DefinirCanonica', { serie: 'o-ultimo-farol', tipo: 'elenco', id: 'mara', caminho: 'C:\\Windows\\win.ini' });
    assert.strictEqual(r.status, 400);
    r = await post('AdicionarReferencia', { serie: 'o-ultimo-farol', tipo: 'elenco', id: 'mara', caminhoArquivo: 'relativo.png' });
    assert.strictEqual(r.status, 400);
    const naoImagem = path.join(fora, 'senhas.png');
    fs.writeFileSync(naoImagem, 'nada de imagem');
    r = await post('AdicionarReferencia', { serie: 'o-ultimo-farol', tipo: 'elenco', id: 'mara', caminhoArquivo: naoImagem });
    assert.strictEqual(r.status, 400);
    r = await get('LerEpisodio', '?serie=o-ultimo-farol&n=..%2F..');
    assert.strictEqual(r.status, 400);
    // nada foi criado fora da pasta da série
    assert.deepStrictEqual(fs.readdirSync(path.join(raiz, 'series')), ['o-ultimo-farol']);
});
