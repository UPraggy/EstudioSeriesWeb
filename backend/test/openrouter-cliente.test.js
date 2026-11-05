// Cliente HTTP: repetição com espera, POST pago sem repetição em 5xx, timeout, erros em português e a chave nunca vaza.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const nodeUtil = require('util');
const { criarCliente } = require('../src/openrouter/cliente');
const { ErroOpenRouter, limparSegredos } = require('../src/openrouter/erros');
const aj = require('./fixtures/openrouter-ajuda');

const semEspera = () => {
    const esperas = [];
    const dormir = async (ms) => { esperas.push(ms); };
    dormir.esperas = esperas;
    return dormir;
};

test('GET repete em 429 (respeita Retry-After) e em 5xx até dar certo', async () => {
    const dormir = semEspera();
    const respostas = [
        { status: 429, json: { error: { code: 429, message: 'devagar' } }, headers: { 'retry-after': '2' } },
        { status: 503, json: { error: { code: 503, message: 'fora' } } },
        { status: 200, json: { data: [] } },
    ];
    const fetch = aj.criarFetchFalso(() => respostas.shift());
    const c = criarCliente({ fetch, chave: aj.CHAVE_TESTE, dormir, esperaBaseMs: 100 });
    const r = await c.pedirJson('GET', '/videos/models');
    assert.deepStrictEqual(r, { data: [] });
    assert.strictEqual(fetch.chamadas.length, 3);
    assert.deepStrictEqual(dormir.esperas, [2000, 200]);
    assert.strictEqual(fetch.chamadas[0].headers.Authorization, `Bearer ${aj.CHAVE_TESTE}`);
    assert.strictEqual(fetch.chamadas[0].url, 'https://openrouter.ai/api/v1/videos/models');
});

test('POST pago NÃO repete em 500 (pode ter criado o job), mas repete em 429', async () => {
    const f500 = aj.criarFetchFalso(() => ({ status: 500, json: { error: { code: 500, message: 'Internal Server Error' } } }));
    const c = criarCliente({ fetch: f500, chave: aj.CHAVE_TESTE, dormir: semEspera() });
    await assert.rejects(c.pedirJson('POST', '/videos', { corpo: { model: 'x' } }), (e) => e instanceof ErroOpenRouter && e.status === 500 && /Falha no OpenRouter/.test(e.message));
    assert.strictEqual(f500.chamadas.length, 1);

    const seq = [{ status: 429, json: { error: { message: 'rate' } } }, { status: 202, json: { id: 'gen-vid-1', status: 'pending' } }];
    const f429 = aj.criarFetchFalso(() => seq.shift());
    const c2 = criarCliente({ fetch: f429, chave: aj.CHAVE_TESTE, dormir: semEspera() });
    const r = await c2.pedirJson('POST', '/videos', { corpo: { model: 'x' } });
    assert.strictEqual(r.id, 'gen-vid-1');
    assert.strictEqual(f429.chamadas.length, 2);
    assert.deepStrictEqual(f429.chamadas[0].corpo, { model: 'x' });
});

test('erros em português (402, 401, 400 com detalhe) sem a chave', async () => {
    const casos = [
        [402, /Sem crédito suficiente no OpenRouter \(402\)/],
        [401, /Chave do OpenRouter inválida ou ausente/],
        [400, /recusou o pedido \(400\): duration must be one of/],
    ];
    for (const [status, re] of casos) {
        const fetch = aj.criarFetchFalso(() => ({ status, json: { error: { code: status, message: `duration must be one of [4,6,8]; key=${aj.CHAVE_TESTE}` } } }));
        const c = criarCliente({ fetch, chave: aj.CHAVE_TESTE, dormir: semEspera() });
        const e = await c.pedirJson('POST', '/videos', { corpo: {} }).catch((x) => x);
        assert.ok(e instanceof ErroOpenRouter);
        assert.match(e.message, re);
        assert.ok(!e.message.includes(aj.CHAVE_TESTE), e.message);
        assert.ok(!nodeUtil.inspect(e).includes(aj.CHAVE_TESTE));
    }
});

test('falha de rede: mensagem limpa; POST fica marcado como incerto; certificado do Avast dá a dica', async () => {
    const erroRede = new TypeError('fetch failed');
    erroRede.cause = Object.assign(new Error(`connect ECONNRESET Authorization: Bearer ${aj.CHAVE_TESTE}`), { code: 'ECONNRESET' });
    const fetch = aj.criarFetchFalso(() => { throw erroRede; });
    const c = criarCliente({ fetch, chave: aj.CHAVE_TESTE, dormir: semEspera(), tentativas: 2 });
    const log = await aj.capturarConsole(async () => {
        const e = await c.pedirJson('POST', '/videos', { corpo: {} }).catch((x) => x);
        console.error('Error:', e.message);
        assert.strictEqual(e.incerto, true);
        assert.match(e.message, /Falha de rede.*ECONNRESET.*pode ter chegado/);
    });
    assert.ok(!log.includes(aj.CHAVE_TESTE));
    assert.strictEqual(fetch.chamadas.length, 1, 'POST não repete em erro de rede');

    const erroCert = new TypeError('fetch failed');
    erroCert.cause = Object.assign(new Error('unable to get local issuer certificate'), { code: 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY' });
    const c2 = criarCliente({ fetch: aj.criarFetchFalso(() => { throw erroCert; }), chave: aj.CHAVE_TESTE, dormir: semEspera(), tentativas: 1 });
    await assert.rejects(c2.pedirJson('GET', '/key'), /NODE_EXTRA_CA_CERTS/);
});

test('timeout aborta a chamada', async () => {
    const fetch = aj.criarFetchFalso((req) => new Promise((resolve, reject) => {
        req.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    }));
    const c = criarCliente({ fetch, chave: aj.CHAVE_TESTE, dormir: semEspera(), tentativas: 1, timeoutMs: 30 });
    await assert.rejects(c.pedirJson('GET', '/key'), /não respondeu em 0 s/);
});

test('sem chave: erro claro e nenhuma chamada', async () => {
    const fetch = aj.criarFetchFalso(() => ({ json: {} }));
    const c = criarCliente({ fetch, chave: '' });
    assert.strictEqual(c.temChave, false);
    await assert.rejects(c.pedirJson('GET', '/key'), /Sem chave do OpenRouter no ambiente/);
    assert.strictEqual(fetch.chamadas.length, 0);
});

test('baixar grava o arquivo; a chave só vai para a API do OpenRouter', async () => {
    const pasta = aj.pastaTemp('baixar-');
    const fetch = aj.criarFetchFalso(() => ({ bytes: Buffer.from('mp4-falso') }));
    const c = criarCliente({ fetch, chave: aj.CHAVE_TESTE, dormir: semEspera() });
    const destino = path.join(pasta, 'sub', 'v.mp4');
    const r = await c.baixar('/videos/gen-vid-1/content?index=0', destino);
    assert.strictEqual(r.bytes, 9);
    assert.strictEqual(fs.readFileSync(destino, 'utf8'), 'mp4-falso');
    assert.ok(!fs.existsSync(`${destino}.parcial`));
    assert.strictEqual(fetch.chamadas[0].headers.Authorization, `Bearer ${aj.CHAVE_TESTE}`);
    await c.baixar('https://storage.exemplo.com/v.mp4', path.join(pasta, 'b.mp4'));
    assert.strictEqual(fetch.chamadas[1].headers.Authorization, undefined);
});

test('o objeto do cliente não expõe a chave (JSON e inspect)', () => {
    const c = criarCliente({ fetch: async () => new Response('{}'), chave: aj.CHAVE_TESTE });
    assert.ok(!JSON.stringify(c).includes(aj.CHAVE_TESTE));
    assert.ok(!nodeUtil.inspect(c, { depth: 5, showHidden: true }).includes(aj.CHAVE_TESTE));
});

test('limparSegredos remove chave do ambiente e qualquer sk-or-…', () => {
    const t = limparSegredos(`a ${aj.CHAVE_TESTE} b sk-or-v1-abcdef123456 c Bearer xyz.123`, [aj.CHAVE_TESTE]);
    assert.ok(!t.includes('sk-or-'));
    assert.ok(!t.includes('xyz.123'));
});
