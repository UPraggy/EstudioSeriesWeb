// Substitutos do motor do navegador (Buffer, path, crypto) comparados com os módulos de verdade do Node.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');

const PASTA = path.join(__dirname, '..', '..', 'frontend', 'src', 'motorNavegador');
const carregar = (nome) => import(pathToFileURL(path.join(PASTA, nome)).href);

test('Buffer: codificações batem com o Node', async () => {
    const { Buffer: B } = await carregar('buffer.js');
    const textos = ['', 'a', 'olá, Mara!', 'çãõé — “aspas” 🎬', 'x'.repeat(70000)];
    for (const t of textos) {
        const nosso = B.from(t);
        const node = Buffer.from(t);
        assert.equal(nosso.length, node.length);
        for (const enc of ['utf8', 'base64', 'base64url', 'hex', 'latin1']) {
            assert.equal(nosso.toString(enc), node.toString(enc), `${enc} de ${t.slice(0, 10)}`);
        }
        assert.equal(B.from(node.toString('base64'), 'base64').toString(), t);
        assert.equal(B.from(node.toString('base64url'), 'base64url').toString(), t);
        assert.equal(B.from(node.toString('hex'), 'hex').toString(), t);
    }
    const png = B.from([0x89, 0x50, 0x4e, 0x47]);
    assert.ok(png.subarray(0, 2) instanceof B);
    assert.ok(png.subarray(0, 4).equals(B.from([0x89, 0x50, 0x4e, 0x47])));
    assert.equal(B.concat([B.from('ab'), B.from('cd')]).toString(), 'abcd');
    assert.equal(B.alloc(3).length, 3);
    assert.equal(B.from([0x34, 0x12]).readInt16LE(0), 0x1234);
    assert.equal(B.byteLength('ç'), 2);
    assert.ok(B.isBuffer(B.alloc(1)));
    assert.equal(JSON.stringify(B.from('ab')), JSON.stringify(Buffer.from('ab')));
});

test('path: mesmas respostas do path.posix do Node', async () => {
    const { default: p } = await carregar('caminho.js');
    const casos = [
        ['join', ['/dados', 'series', 'farol', '../x.json']],
        ['join', ['a', '', 'b/']],
        ['join', ['/dados/', './series']],
        ['resolve', ['/dados', 'series', 'a.json']],
        ['resolve', ['/dados', '/outro', 'b']],
        ['resolve', ['/dados/series/', '..', '..', '..', 'x']],
        ['dirname', ['/dados/series/a.json']],
        ['dirname', ['/dados']],
        ['dirname', ['a.json']],
        ['basename', ['/dados/series/a.json']],
        ['basename', ['/dados/series/a.json', '.json']],
        ['extname', ['/dados/a.tar.gz']],
        ['extname', ['/dados/.oculto']],
        ['extname', ['/dados/sem']],
        ['relative', ['/dados/series', '/dados/series/farol/x.json']],
        ['relative', ['/dados/series/farol', '/dados/lixeira']],
        ['normalize', ['/dados//series/./a/../b']],
        ['isAbsolute', ['/dados']],
        ['isAbsolute', ['dados']],
    ];
    for (const [f, args] of casos) assert.deepEqual(p[f](...args), path.posix[f](...args), `${f}(${args.join(', ')})`);
    assert.deepEqual(p.parse('/dados/series/a.json'), path.posix.parse('/dados/series/a.json'));
    assert.equal(p.join('series\\farol', 'a.json'), 'series/farol/a.json');
    assert.equal(p.sep, '/');
});

test('crypto: SHA-1, SHA-256 e HMAC iguais aos do Node', async () => {
    const c = await carregar('cripto.js');
    const entradas = ['', 'abc', 'olá 🎬', 'x'.repeat(55), 'y'.repeat(56), 'z'.repeat(64), 'w'.repeat(1000)];
    for (const e of entradas) {
        for (const alg of ['sha1', 'sha256']) {
            assert.equal(c.createHash(alg).update(e).digest('hex'), crypto.createHash(alg).update(e).digest('hex'), `${alg} de ${e.length}`);
        }
        const chaves = ['k', crypto.randomBytes(32), 'c'.repeat(100)];
        for (const k of chaves) {
            assert.equal(c.createHmac('sha256', k).update(e).digest('base64url'), crypto.createHmac('sha256', k).update(e).digest('base64url'));
        }
    }
    const partes = c.createHash('sha1').update('ab').update(Buffer.from('cd')).digest('hex');
    assert.equal(partes, crypto.createHash('sha1').update('abcd').digest('hex'));
    assert.equal(c.randomBytes(9).toString('hex').length, 18);
    assert.ok(c.timingSafeEqual(Buffer.from('ab'), Buffer.from('ab')));
    assert.ok(!c.timingSafeEqual(Buffer.from('ab'), Buffer.from('ac')));
    assert.match(c.randomUUID(), /^[0-9a-f-]{36}$/);
});
