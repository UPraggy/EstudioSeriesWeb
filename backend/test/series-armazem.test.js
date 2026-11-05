const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const armazem = require('../src/series/armazem');
const { pastaTemporaria, apagar } = require('./series-ajuda');

let raiz;
test.beforeEach(() => { raiz = pastaTemporaria(); });
test.afterEach(() => apagar(raiz));

test('slug: minúsculas, sem acento, com hífens', () => {
    assert.strictEqual(armazem.slug('O Último Farol'), 'o-ultimo-farol');
    assert.strictEqual(armazem.slug('  Ação & Reação!! 2 '), 'acao-reacao-2');
    assert.strictEqual(armazem.slug('../../etc'), 'etc');
    assert.strictEqual(armazem.slug('???'), '');
});

test('criarSerie monta a pasta completa do CONTRATOS', async () => {
    const s = await armazem.criarSerie({ titulo: 'O Último Farol', genero: 'Sobrevivência', ideia: 'Uma ilhota.' }, { raiz });
    assert.strictEqual(s.id, 'o-ultimo-farol');
    const pasta = path.join(raiz, 'series', 'o-ultimo-farol');
    for (const sub of ['elenco', 'locais', 'objetos', 'episodios']) assert.ok(fs.statSync(path.join(pasta, sub)).isDirectory(), sub);
    const serie = JSON.parse(fs.readFileSync(path.join(pasta, 'serie.json'), 'utf8'));
    assert.strictEqual(serie.versao, 1);
    assert.strictEqual(serie.idioma, 'pt-BR');
    assert.deepStrictEqual(serie.formato, { largura: 1080, altura: 1920, proporcao: '9:16' });
    assert.strictEqual(serie.duracaoAlvoS, 60);
    assert.deepStrictEqual(serie.episodios, []);
    const biblia = JSON.parse(fs.readFileSync(path.join(pasta, 'biblia.json'), 'utf8'));
    assert.deepStrictEqual(biblia.escolhas, []);
    assert.deepStrictEqual(biblia.segredos, { personagens: [], publico: [] });
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(pasta, 'jobs.json'), 'utf8')), { versao: 1, jobs: [] });
    assert.strictEqual(fs.readFileSync(path.join(pasta, 'custos.jsonl'), 'utf8'), '');
    // nada de pasta temporária sobrando
    assert.deepStrictEqual(fs.readdirSync(path.join(raiz, 'series')), ['o-ultimo-farol']);
});

test('criarSerie nunca sobrescreve uma série existente (409)', async () => {
    await armazem.criarSerie({ titulo: 'Farol' }, { raiz });
    const caminho = path.join(raiz, 'series', 'farol', 'serie.json');
    const antes = fs.readFileSync(caminho, 'utf8');
    await assert.rejects(armazem.criarSerie({ titulo: 'FAROL' }, { raiz }), (e) => e.status === 409 && /já existe/.test(e.message));
    assert.strictEqual(fs.readFileSync(caminho, 'utf8'), antes);
});

test('criarSerie recusa título vazio', async () => {
    await assert.rejects(armazem.criarSerie({ titulo: '  ' }, { raiz }), /título/);
    await assert.rejects(armazem.criarSerie({ titulo: '!!!' }, { raiz }), /letras ou números/);
});

test('listarSeries devolve o resumo e ignora pastas estranhas', async () => {
    assert.deepStrictEqual(await armazem.listarSeries({ raiz }), []);
    await armazem.criarSerie({ titulo: 'Zebra' }, { raiz });
    await armazem.criarSerie({ titulo: 'Árvore' }, { raiz });
    fs.mkdirSync(path.join(raiz, 'series', '.criando-lixo'));
    fs.mkdirSync(path.join(raiz, 'series', 'sem-json'));
    const lista = await armazem.listarSeries({ raiz });
    assert.deepStrictEqual(lista.map((s) => s.id), ['arvore', 'zebra']);
    assert.strictEqual(lista[0].titulo, 'Árvore');
    assert.strictEqual(lista[0].episodios, 0);
});

test('salvarSerie grava atômico e guarda o anterior em .bak/', async () => {
    const s = await armazem.criarSerie({ titulo: 'Farol' }, { raiz });
    await armazem.salvarSerie('farol', { ...s, genero: 'Terror' }, { raiz });
    const pasta = path.join(raiz, 'series', 'farol');
    assert.strictEqual((await armazem.lerSerie('farol', { raiz })).genero, 'Terror');
    const baks = fs.readdirSync(path.join(pasta, '.bak'));
    assert.strictEqual(baks.length, 1);
    assert.match(baks[0], /^serie\.json\..*\.bak$/);
    assert.strictEqual(JSON.parse(fs.readFileSync(path.join(pasta, '.bak', baks[0]), 'utf8')).genero, '');
    assert.ok(!fs.readdirSync(pasta).some((n) => n.endsWith('.tmp')), 'sem arquivo temporário');
    // conteúdo idêntico: não grava de novo nem cria backup
    await armazem.salvarSerie('farol', { ...s, genero: 'Terror' }, { raiz });
    assert.strictEqual(fs.readdirSync(path.join(pasta, '.bak')).length, 1);
});

test('salvarSerie valida antes de gravar', async () => {
    const s = await armazem.criarSerie({ titulo: 'Farol' }, { raiz });
    await assert.rejects(armazem.salvarSerie('farol', { ...s, etapa: 'pronta' }, { raiz }), (e) => e.status === 400 && e.erros.length > 0);
    await assert.rejects(armazem.salvarSerie('farol', { ...s, id: 'outra' }, { raiz }), /não bate/);
    assert.strictEqual((await armazem.lerSerie('farol', { raiz })).etapa, 'ideia');
});

test('atualizações simultâneas do serie.json não se perdem (trava)', async () => {
    await armazem.criarSerie({ titulo: 'Farol' }, { raiz });
    await Promise.all(Array.from({ length: 12 }, (_, i) => armazem.atualizarSerie('farol', (s) => {
        s.episodios.push({ n: i + 1, id: `ep${String(i + 1).padStart(2, '0')}`, titulo: '', status: 'roteiro' });
        return s;
    }, { raiz })));
    assert.strictEqual((await armazem.lerSerie('farol', { raiz })).episodios.length, 12);
});

test('ids com ".." ou barras são recusados (path traversal)', async () => {
    for (const ruim of ['..', '../fora', 'a/b', 'a\\b', 'C:\\Windows', '', 'MAIUSCULA']) {
        await assert.rejects(armazem.lerSerie(ruim, { raiz }), (e) => e.status === 400, ruim);
    }
    assert.throws(() => armazem.resolverDentro(raiz, '../x.json'), /recusado/);
    assert.throws(() => armazem.resolverDentro(raiz, 'C:\\x.json'), /recusado/);
    assert.strictEqual(armazem.resolverDentro(raiz, 'a/b.json'), path.join(raiz, 'a', 'b.json'));
});

test('lerSerie de série inexistente dá 404', async () => {
    await assert.rejects(armazem.lerSerie('nao-existe', { raiz }), (e) => e.status === 404);
});

test('raiz vem de ESTUDIO_DADOS quando não é injetada', () => {
    const antes = process.env.ESTUDIO_DADOS;
    process.env.ESTUDIO_DADOS = raiz;
    try {
        assert.strictEqual(armazem.pastaSerie('x'), path.join(raiz, 'series', 'x'));
    } finally {
        if (antes === undefined) delete process.env.ESTUDIO_DADOS;
        else process.env.ESTUDIO_DADOS = antes;
    }
});
