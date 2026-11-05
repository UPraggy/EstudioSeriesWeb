const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const armazem = require('../src/series/armazem');
const fichas = require('../src/series/fichas');
const { pastaTemporaria, apagar, criarPng } = require('./series-ajuda');

let raiz;
let fora;
let op;
test.beforeEach(async () => {
    raiz = pastaTemporaria();
    fora = pastaTemporaria('estudio-origem-');
    op = { raiz };
    await armazem.criarSerie({ titulo: 'Farol' }, op);
});
test.afterEach(() => { apagar(raiz); apagar(fora); });

const pastaMara = () => path.join(raiz, 'series', 'farol', 'elenco', 'mara');

test('criar, ler e salvar ficha de personagem', async () => {
    const f = await fichas.criarFicha('farol', 'elenco', { nome: 'Mara', ancora: 'mulher de ~30 anos', voz: 'pt-BR-ThalitaMultilingualNeural' }, op);
    assert.strictEqual(f.id, 'mara');
    assert.strictEqual(f.tipo, 'personagem');
    assert.strictEqual(f.tom, '+0Hz');
    assert.strictEqual(f.estadoAtual, 'padrao');
    assert.ok(fs.statSync(path.join(pastaMara(), 'ref')).isDirectory());
    await assert.rejects(fichas.criarFicha('farol', 'elenco', { nome: 'Mara' }, op), (e) => e.status === 409);

    const { ficha } = await fichas.salvarFicha('farol', 'elenco', { ...f, papel: 'Protagonista' }, op);
    assert.strictEqual(ficha.papel, 'Protagonista');
    assert.strictEqual((await fichas.lerFicha('farol', 'elenco', 'mara', op)).papel, 'Protagonista');
    assert.strictEqual(fs.readdirSync(path.join(raiz, 'series', 'farol', '.bak', 'elenco', 'mara')).length, 1);
});

test('objeto e local usam o mesmo formato (objeto tem "onde", sem voz)', async () => {
    const o = await fichas.criarFicha('farol', 'objetos', { id: 'barra', nome: 'Barra de metal', onde: 'porta do cais' }, op);
    assert.strictEqual(o.tipo, 'objeto');
    assert.strictEqual(o.onde, 'porta do cais');
    assert.ok(!('voz' in o));
    const l = await fichas.criarFicha('farol', 'locais', { id: 'sala', nome: 'Sala de controle' }, op);
    assert.strictEqual(l.tipo, 'local');
    assert.deepStrictEqual((await fichas.listarFichas('farol', 'locais', op)).map((x) => x.id), ['sala']);
});

test('salvarFicha recusa voz fora da lista recomendada', async () => {
    await assert.rejects(
        fichas.salvarFicha('farol', 'elenco', { id: 'davi', nome: 'Davi', voz: 'pt-BR-AntonioNeural' }, op),
        (e) => e.status === 400 && e.erros.some((x) => x.includes('lista recomendada')),
    );
});

test('adicionarReferencia COPIA a imagem para ref/ e atualiza a ficha (sem duplicar)', async () => {
    await fichas.criarFicha('farol', 'elenco', { nome: 'Mara' }, op);
    const origem = criarPng(fora, 'rosto.png');
    const r = await fichas.adicionarReferencia('farol', 'elenco', 'mara', origem, { ...op, vista: 'frente' });
    assert.strictEqual(r.caminho, 'ref/padrao-frente.png');
    assert.strictEqual(r.copiado, true);
    assert.ok(fs.existsSync(origem), 'o original continua lá');
    assert.ok(fs.existsSync(path.join(pastaMara(), 'ref', 'padrao-frente.png')));
    assert.strictEqual(r.ficha.estados[0].refs.frente, 'ref/padrao-frente.png');

    const r2 = await fichas.adicionarReferencia('farol', 'elenco', 'mara', origem, { ...op, vista: 'frente' });
    assert.strictEqual(r2.copiado, false);
    assert.deepStrictEqual(fs.readdirSync(path.join(pastaMara(), 'ref')).filter((n) => n.endsWith('.png')), ['padrao-frente.png']);

    // outra imagem na mesma vista: não apaga a anterior, cria -2 e aponta para ela
    const r3 = await fichas.adicionarReferencia('farol', 'elenco', 'mara', criarPng(fora, 'outro.png', 'v2'), { ...op, vista: 'frente' });
    assert.strictEqual(r3.caminho, 'ref/padrao-frente-2.png');
    assert.ok(fs.existsSync(path.join(pastaMara(), 'ref', 'padrao-frente.png')));

    // estado novo é criado na ficha
    const r4 = await fichas.adicionarReferencia('farol', 'elenco', 'mara', criarPng(fora, 'ferida.png', 'v3'), { ...op, estado: 'ferida', vista: 'perfil' });
    assert.strictEqual(r4.ficha.estados.find((e) => e.id === 'ferida').refs.perfil, 'ref/ferida-perfil.png');
});

test('candidatas vão para ref/candidatas/ e definirCanonica escolhe uma', async () => {
    await fichas.criarFicha('farol', 'elenco', { nome: 'Mara' }, op);
    for (const nome of ['mara.png', 'mara-sala.png']) {
        await fichas.adicionarReferencia('farol', 'elenco', 'mara', criarPng(fora, nome, nome), { ...op, candidata: true });
    }
    await fichas.adicionarReferencia('farol', 'elenco', 'mara', path.join(fora, 'mara.png'), { ...op, candidata: true });
    const f = await fichas.lerFicha('farol', 'elenco', 'mara', op);
    assert.deepStrictEqual(f.candidatas.map((c) => c.caminho), ['ref/candidatas/mara.png', 'ref/candidatas/mara-sala.png']);
    assert.strictEqual(f.canonica, null);

    const c = await fichas.definirCanonica('farol', 'elenco', 'mara', 'ref/candidatas/mara-sala.png', op);
    assert.strictEqual(c.canonica, 'ref/candidatas/mara-sala.png');
    await assert.rejects(fichas.definirCanonica('farol', 'elenco', 'mara', '../../serie.json', op), /recusado/);
    await assert.rejects(fichas.definirCanonica('farol', 'elenco', 'mara', 'ref/nao-existe.png', op), (e) => e.status === 404);
});

test('adicionarReferencia recusa o que não é imagem de verdade', async () => {
    await fichas.criarFicha('farol', 'elenco', { nome: 'Mara' }, op);
    const texto = path.join(fora, 'segredo.txt');
    fs.writeFileSync(texto, 'chave=123');
    await assert.rejects(fichas.adicionarReferencia('farol', 'elenco', 'mara', texto, op), /Só imagens/);
    const disfarçado = path.join(fora, 'segredo.png');
    fs.writeFileSync(disfarçado, 'chave=123');
    await assert.rejects(fichas.adicionarReferencia('farol', 'elenco', 'mara', disfarçado, op), /não parece uma imagem/);
    assert.ok(!fs.existsSync(path.join(pastaMara(), 'ref', 'padrao-frente.png')));
});

test('tipo e id inválidos são recusados', async () => {
    await assert.rejects(fichas.lerFicha('farol', 'bichos', 'x', op), /Tipo de ficha inválido/);
    await assert.rejects(fichas.lerFicha('farol', 'elenco', '../../serie', op), (e) => e.status === 400);
    await assert.rejects(fichas.lerFicha('farol', 'elenco', 'ninguem', op), (e) => e.status === 404);
});
