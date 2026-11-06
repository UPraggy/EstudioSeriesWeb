const test = require('node:test');
const assert = require('node:assert');
const app = require('../src/index');

test('GET /Saude responde e nunca devolve a chave', async () => {
    const servidor = app.listen(0, '127.0.0.1');
    await new Promise((r) => servidor.once('listening', r));
    try {
        const { port } = servidor.address();
        const r = await fetch(`http://127.0.0.1:${port}/Saude`);
        const j = await r.json();
        assert.strictEqual(j.ok, true);
        assert.strictEqual(typeof j.chaveOpenRouter, 'boolean');
        const texto = JSON.stringify(j);
        for (const v of [process.env.ASE_OPENROUTER_KEY, process.env.OPENROUTER_API_KEY].filter(Boolean)) {
            assert.ok(!texto.includes(v));
        }
    } finally {
        servidor.close();
    }
});

test('CORS do motor híbrido: libera a máquina e o site do Pages, recusa outras origens, responde ao pré-voo de rede local', async () => {
    const servidor = app.listen(0, '127.0.0.1');
    await new Promise((r) => servidor.once('listening', r));
    try {
        const { port } = servidor.address();
        const url = `http://127.0.0.1:${port}/api/Saude`;
        const de = async (origin) => (await fetch(url, { headers: { Origin: origin } })).headers.get('access-control-allow-origin');
        assert.strictEqual(await de('https://upraggy.github.io'), 'https://upraggy.github.io');
        assert.strictEqual(await de('https://series.rafaelmr.com.br'), 'https://series.rafaelmr.com.br');
        assert.strictEqual(await de('http://series.rafaelmr.com.br'), null); // só o https
        assert.strictEqual(await de('http://127.0.0.1:5196'), 'http://127.0.0.1:5196');
        assert.strictEqual(await de('https://site-qualquer.example'), null);
        const pre = await fetch(url, {
            method: 'OPTIONS',
            headers: { Origin: 'https://upraggy.github.io', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Private-Network': 'true' },
        });
        assert.strictEqual(pre.headers.get('access-control-allow-private-network'), 'true');
        const estranho = await fetch(url, {
            method: 'OPTIONS',
            headers: { Origin: 'https://site-qualquer.example', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Private-Network': 'true' },
        });
        assert.strictEqual(estranho.headers.get('access-control-allow-private-network'), null);
    } finally {
        servidor.close();
    }
});
