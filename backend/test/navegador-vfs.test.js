// Sistema de arquivos virtual do motor do navegador, com o armazém em memória (o mesmo código roda com OPFS/pasta real).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const PASTA = path.join(__dirname, '..', '..', 'frontend', 'src', 'motorNavegador');
const carregar = (nome) => import(pathToFileURL(path.join(PASTA, nome)).href);

async function novo(arquivosIniciais = {}) {
    const { criarVfs, LIMITE_MEMORIA } = await carregar('vfs.js');
    const { armazemMemoria } = await carregar('armazens.js');
    const armazem = armazemMemoria();
    for (const [c, v] of Object.entries(arquivosIniciais)) await armazem.gravar(c, typeof v === 'string' ? new TextEncoder().encode(v) : v);
    const vfs = criarVfs();
    await vfs.montar('/dados', armazem);
    return { vfs, fs: vfs.fs, fsp: vfs.fsp, armazem, LIMITE_MEMORIA };
}

const texto = (armazem, c) => new TextDecoder().decode(armazem.arquivos.get(c).dados);

test('montar carrega o índice e o conteúdo dos JSON; leitura síncrona funciona', async () => {
    const { fs } = await novo({ 'series/farol/serie.json': '{"id":"farol"}', 'series/farol/memoria/fatos.jsonl': '{"a":1}\n' });
    assert.ok(fs.existsSync('/dados/series/farol'));
    assert.ok(fs.statSync('/dados/series').isDirectory());
    assert.deepEqual(fs.readdirSync('/dados/series/farol'), ['memoria', 'serie.json']);
    assert.equal(JSON.parse(fs.readFileSync('/dados/series/farol/serie.json', 'utf8')).id, 'farol');
    const d = fs.readdirSync('/dados/series/farol', { withFileTypes: true });
    assert.ok(d.find((x) => x.name === 'memoria').isDirectory());
    assert.equal(fs.statSync('/dados/series/farol/serie.json').size, 14);
});

test('escrita vai para a memória na hora e para o armazém depois de liberar()', async () => {
    const { fs, armazem, vfs } = await novo();
    fs.mkdirSync('/dados/series/nova/elenco', { recursive: true });
    fs.writeFileSync('/dados/series/nova/serie.json', JSON.stringify({ id: 'nova' }));
    assert.equal(fs.readFileSync('/dados/series/nova/serie.json', 'utf8'), '{"id":"nova"}');
    assert.deepEqual(await vfs.liberar(), []);
    assert.equal(texto(armazem, 'series/nova/serie.json'), '{"id":"nova"}');
    assert.ok(armazem.pastas.has('series/nova/elenco'));
});

test('erros com code de Node (ENOENT, EEXIST, ENOTEMPTY)', async () => {
    const { fs, fsp } = await novo({ 'a/b.json': '{}' });
    assert.throws(() => fs.readFileSync('/dados/nao/existe.json'), { code: 'ENOENT' });
    await assert.rejects(fsp.readFile('/dados/x.json'), { code: 'ENOENT' });
    assert.throws(() => fs.mkdirSync('/dados/a'), { code: 'EEXIST' });
    assert.throws(() => fs.writeFileSync('/dados/sem/pai.json', '{}'), { code: 'ENOENT' });
    assert.throws(() => fs.rmdirSync('/dados/a'), { code: 'ENOTEMPTY' });
    assert.throws(() => fs.writeFileSync('/dados/a/b.json', 'x', { flag: 'wx' }), { code: 'EEXIST' });
    assert.equal(fs.statSync('/dados/x', { throwIfNoEntry: false }), undefined);
});

test('gravação atômica (tmp + rename) e appendFile no JSONL', async () => {
    const { fs, fsp, vfs, armazem } = await novo({ 's/serie.json': '{"v":1}', 's/fatos.jsonl': '{"n":1}\n' });
    fs.writeFileSync('/dados/s/serie.json.123.tmp', '{"v":2}');
    fs.renameSync('/dados/s/serie.json.123.tmp', '/dados/s/serie.json');
    await fsp.appendFile('/dados/s/fatos.jsonl', '{"n":2}\n');
    assert.equal(fs.readFileSync('/dados/s/serie.json', 'utf8'), '{"v":2}');
    await vfs.liberar();
    assert.equal(texto(armazem, 's/serie.json'), '{"v":2}');
    assert.ok(!armazem.arquivos.has('s/serie.json.123.tmp'));
    assert.equal(texto(armazem, 's/fatos.jsonl'), '{"n":1}\n{"n":2}\n');
    // último byte (custos.js lê assim para saber se precisa de \n)
    const fd = fs.openSync('/dados/s/fatos.jsonl', 'r');
    const b = Buffer.alloc(1);
    fs.readSync(fd, b, 0, 1, fs.statSync('/dados/s/fatos.jsonl').size - 1);
    fs.closeSync(fd);
    assert.equal(b.toString(), '\n');
});

test('arquivo grande fica preguiçoso: leitura assíncrona e Blob funcionam, síncrona avisa', async () => {
    const grande = new Uint8Array(5 * 1024 * 1024).map((_, i) => i % 251);
    const { fs, fsp, vfs } = await novo({ 'series/f/clipes/c1.mp4': grande });
    assert.equal(fs.statSync('/dados/series/f/clipes/c1.mp4').size, grande.length);
    assert.throws(() => fs.readFileSync('/dados/series/f/clipes/c1.mp4'), { code: 'EAGAIN' });
    const lido = await fsp.readFile('/dados/series/f/clipes/c1.mp4');
    assert.equal(lido.length, grande.length);
    assert.equal(lido[1000], grande[1000]);
    const blob = await vfs.lerBlob('/dados/series/f/clipes/c1.mp4');
    assert.equal(blob.size, grande.length);
    const fh = await fsp.open('/dados/series/f/clipes/c1.mp4', 'r');
    const cab = Buffer.alloc(12);
    const { bytesRead } = await fh.read(cab, 0, 12, 0);
    await fh.close();
    assert.equal(bytesRead, 12);
    assert.equal(cab[5], grande[5]);
});

test('renomear pasta com arquivo grande (lixeira) e depois de novo: conteúdo não se perde', async () => {
    const grande = new Uint8Array(3 * 1024 * 1024).fill(7);
    const { fs, vfs, armazem } = await novo({ 'series/f/serie.json': '{"id":"f"}', 'series/f/clipes/c1.mp4': grande });
    fs.mkdirSync('/dados/lixeira/1', { recursive: true });
    fs.renameSync('/dados/series/f', '/dados/lixeira/1/f');
    fs.renameSync('/dados/lixeira/1/f', '/dados/lixeira/1/g');
    assert.ok(!fs.existsSync('/dados/series/f'));
    assert.deepEqual(await vfs.liberar(), []);
    assert.ok(!armazem.arquivos.has('series/f/clipes/c1.mp4'));
    assert.equal(armazem.arquivos.get('lixeira/1/g/clipes/c1.mp4').dados.length, grande.length);
    assert.equal(texto(armazem, 'lixeira/1/g/serie.json'), '{"id":"f"}');
    // restaurar
    fs.renameSync('/dados/lixeira/1/g', '/dados/series/f');
    await vfs.liberar();
    assert.equal(armazem.arquivos.get('series/f/clipes/c1.mp4').dados[0], 7);
    assert.equal((await vfs.lerBlob('/dados/series/f/clipes/c1.mp4')).size, grande.length);
});

test('copyFile (com COPYFILE_EXCL), rm recursivo e escrita grande sai da memória depois de gravada', async () => {
    const { fs, fsp, vfs, armazem, LIMITE_MEMORIA } = await novo({ 'a/x.json': '[1]' });
    await fsp.copyFile('/dados/a/x.json', '/dados/a/y.json');
    await assert.rejects(fsp.copyFile('/dados/a/x.json', '/dados/a/y.json', fs.constants.COPYFILE_EXCL), { code: 'EEXIST' });
    const grande = Buffer.alloc(LIMITE_MEMORIA + 10, 1);
    await fsp.writeFile('/dados/a/video.mp4', grande);
    await vfs.liberar();
    assert.equal(vfs.estado().bytesMemoria < LIMITE_MEMORIA, true);
    assert.equal((await fsp.readFile('/dados/a/video.mp4')).length, grande.length);
    await fsp.copyFile('/dados/a/video.mp4', '/dados/a/copia.mp4');
    fs.rmSync('/dados/a/x.json');
    await vfs.liberar();
    assert.equal(armazem.arquivos.get('a/copia.mp4').dados.length, grande.length);
    assert.equal(texto(armazem, 'a/y.json'), '[1]');
    fs.rmSync('/dados/a', { recursive: true, force: true });
    fs.rmSync('/dados/nao-existe', { force: true });
    await vfs.liberar();
    assert.equal([...armazem.arquivos.keys()].length, 0);
});

test('createWriteStream (download do vídeo) grava no fim', async () => {
    const { fs, vfs, armazem } = await novo();
    fs.mkdirSync('/dados/v', { recursive: true });
    const ws = fs.createWriteStream('/dados/v/ep.mp4.parcial');
    const fim = new Promise((ok) => ws.on('finish', ok));
    ws.write(Buffer.from('abc'));
    ws.end(Buffer.from('def'));
    await fim;
    await vfs.fsp.rename('/dados/v/ep.mp4.parcial', '/dados/v/ep.mp4');
    await vfs.liberar();
    assert.equal(texto(armazem, 'v/ep.mp4'), 'abcdef');
});

test('caminhos fora da montagem ficam só na memória (/tmp) e embutidos são só leitura do site', async () => {
    const { fs, vfs, armazem } = await novo();
    fs.mkdirSync('/tmp', { recursive: true });
    fs.writeFileSync('/tmp/ref.png', 'x');
    vfs.embutir('/app/amostras/simulado.png', new Uint8Array([1, 2, 3]));
    assert.equal(fs.readFileSync('/app/amostras/simulado.png').length, 3);
    fs.copyFileSync('/tmp/ref.png', '/dados/ref.png');
    await vfs.liberar();
    assert.deepEqual([...armazem.arquivos.keys()], ['ref.png']);
});

test('erro do armazém aparece no liberar() (não some em silêncio)', async () => {
    const { criarVfs } = await carregar('vfs.js');
    const { armazemMemoria } = await carregar('armazens.js');
    const armazem = armazemMemoria();
    armazem.gravar = async () => { throw new Error('disco cheio'); };
    const vfs = criarVfs();
    await vfs.montar('/dados', armazem);
    vfs.fs.writeFileSync('/dados/a.json', '{}');
    const erros = await vfs.liberar();
    assert.equal(erros.length, 1);
    assert.match(erros[0], /disco cheio/);
    assert.equal(vfs.fs.readFileSync('/dados/a.json', 'utf8'), '{}');
});
