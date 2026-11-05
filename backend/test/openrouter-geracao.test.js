// gerarVideo / gerarImagem / completarJSON com o cliente REAL e fetch falso (nenhuma rede, nenhum gasto).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { criarCliente } = require('../src/openrouter/cliente');
const { criarJobs } = require('../src/openrouter/jobs');
const { criarLivroJsonl } = require('../src/openrouter/livro');
const video = require('../src/openrouter/video');
const imagem = require('../src/openrouter/imagem');
const texto = require('../src/openrouter/texto');
const { ErroOrcamento } = require('../src/openrouter/erros');
const aj = require('./fixtures/openrouter-ajuda');

function montarCtx(handler, { tetos = { plano: 1, episodio: 4, serie: 40 } } = {}) {
    const raiz = aj.pastaTemp('ger-');
    aj.semearCatalogo(raiz);
    const base = path.join(raiz, 'series', 'o-ultimo-farol');
    fs.mkdirSync(path.join(base, 'episodios', 'ep01', 'quadros'), { recursive: true });
    fs.writeFileSync(path.join(base, 'episodios', 'ep01', 'quadros', 'p03.png'), aj.PNG_1PX);
    const fetch = aj.criarFetchFalso(handler);
    const cliente = criarCliente({ fetch, chave: aj.CHAVE_TESTE, dormir: async () => {} });
    const livro = criarLivroJsonl(path.join(base, 'custos.jsonl'));
    const jobs = criarJobs({ base, cliente, livro, serie: 'o-ultimo-farol', dormir: async () => {} });
    return { fetch, ctx: { raiz, base, cliente, livro, jobs, tetos, serie: 'o-ultimo-farol' } };
}

const pedidoVideo = {
    modelo: 'google/veo-3.1-lite',
    prompt: 'Sala de controle do farol, rádio chiando, noite.',
    duracaoS: 8,
    resolucao: '720p',
    proporcao: '9:16',
    audio: false,
    quadros: { primeiro: 'episodios/ep01/quadros/p03.png' },
    destino: 'episodios/ep01/takes/p03/take_01.mp4',
    ep: 1,
    ref: 'p03/take_01',
};

test('gerarVideo: corpo certo (áudio explícito, quadro em data URL), job único, download e custo real no livro', async () => {
    const { fetch, ctx } = montarCtx((req) => {
        if (req.metodo === 'POST' && req.url.endsWith('/videos')) return { status: 202, json: { id: 'gen-vid-1793-AAAAAAAAAAAAAAAAAAAA', polling_url: '/api/v1/videos/gen-vid-1793-AAAAAAAAAAAAAAAAAAAA', status: 'pending' } };
        if (req.metodo === 'GET' && /\/videos\/gen-vid-[^/]+$/.test(req.url)) return { json: { id: 'gen-vid-1793-AAAAAAAAAAAAAAAAAAAA', status: 'completed', unsigned_urls: ['https://openrouter.ai/api/v1/videos/gen-vid-1793-AAAAAAAAAAAAAAAAAAAA/content?index=0'], usage: { cost: 0.24, is_byok: false } } };
        if (req.metodo === 'GET' && req.url.includes('/content')) return { bytes: Buffer.from('MP4') };
        throw new Error(`inesperado ${req.metodo} ${req.url}`);
    });
    const cot = await video.cotarVideo(pedidoVideo, ctx);
    assert.strictEqual(cot.custoPrevistoUsd, 0.24);
    assert.strictEqual(fetch.chamadas.length, 0, 'cotar não chama a rede (catálogo em cache)');

    const r = await video.gerarVideo(pedidoVideo, ctx, { custoConfirmadoUsd: 0.24 });
    assert.strictEqual(r.novo, true);
    assert.strictEqual(r.job.status, 'pendente');
    const post = fetch.chamadas.find((c) => c.metodo === 'POST');
    assert.strictEqual(post.corpo.model, 'google/veo-3.1-lite');
    assert.strictEqual(post.corpo.duration, 8);
    assert.strictEqual(post.corpo.resolution, '720p');
    assert.strictEqual(post.corpo.aspect_ratio, '9:16');
    assert.strictEqual(post.corpo.generate_audio, false, 'áudio sempre explícito (o padrão da API é true)');
    assert.strictEqual(post.corpo.frame_images[0].frame_type, 'first_frame');
    assert.match(post.corpo.frame_images[0].image_url.url, /^data:image\/png;base64,/);
    assert.strictEqual(post.corpo.input_references, undefined);

    // mesmo pedido de novo: nada é pago 2x
    const r2 = await video.gerarVideo({ ...pedidoVideo }, ctx, { custoConfirmadoUsd: 0.24 });
    assert.strictEqual(r2.novo, false);
    assert.strictEqual(fetch.chamadas.filter((c) => c.metodo === 'POST').length, 1);

    const j = await ctx.jobs.consultar(r.job.jobId);
    assert.strictEqual(j.status, 'pronto');
    assert.strictEqual(fs.readFileSync(path.join(ctx.base, pedidoVideo.destino), 'utf8'), 'MP4');
    const linhas = fs.readFileSync(path.join(ctx.base, 'custos.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    assert.strictEqual(linhas.length, 1);
    assert.deepStrictEqual(Object.keys(linhas[0]), ['em', 'serie', 'ep', 'etapa', 'tipo', 'modelo', 'previstoUsd', 'realUsd', 'jobId', 'ref']);
    assert.strictEqual(linhas[0].realUsd, 0.24);
    // trocar a imagem do quadro muda o pedido (abre outro job)
    fs.writeFileSync(path.join(ctx.base, 'episodios', 'ep01', 'quadros', 'p03.png'), Buffer.concat([aj.PNG_1PX, Buffer.from([0])]));
    const r3 = await video.gerarVideo(pedidoVideo, ctx);
    assert.strictEqual(r3.novo, true);
});

test('gerarVideo: teto estourado não chama a rede; preço maior que o confirmado é recusado', async () => {
    const { fetch, ctx } = montarCtx(() => { throw new Error('não devia chamar'); }, { tetos: { plano: 0.2 } });
    await assert.rejects(video.gerarVideo(pedidoVideo, ctx), (e) => e instanceof ErroOrcamento && /teto por plano/.test(e.message));
    const { ctx: ctx2 } = montarCtx(() => { throw new Error('não devia chamar'); });
    await assert.rejects(video.gerarVideo({ ...pedidoVideo, audio: true }, ctx2, { custoConfirmadoUsd: 0.24 }), /preço mudou de US\$ 0,24 para US\$ 0,40/);
    assert.strictEqual(fetch.chamadas.length, 0);
});

test('gerarImagem: referências em data URL, arquivo gravado, custo do usage no livro, sem pagar 2x', async () => {
    const png = aj.PNG_1PX.toString('base64');
    const { fetch, ctx } = montarCtx((req) => {
        assert.strictEqual(req.url, 'https://openrouter.ai/api/v1/images');
        return { json: { created: 1, data: [{ b64_json: png, media_type: 'image/png' }], usage: { cost: 0.039 } } };
    });
    const pedido = {
        modelo: 'bytedance-seed/seedream-4.5', prompt: 'Mara de frente, corpo inteiro', resolucao: '2K', proporcao: '9:16',
        referencias: ['episodios/ep01/quadros/p03.png'], destino: 'elenco/mara/ref/padrao-frente.png', etapa: 'elenco', ref: 'mara/padrao-frente',
    };
    const cot = await imagem.cotarImagem(pedido, ctx);
    assert.strictEqual(cot.custoPrevistoUsd, 0.04);
    const r = await imagem.gerarImagem(pedido, ctx, { custoConfirmadoUsd: 0.04 });
    assert.strictEqual(r.job.status, 'pronto');
    assert.deepStrictEqual(r.arquivos, ['elenco/mara/ref/padrao-frente.png']);
    assert.ok(fs.readFileSync(path.join(ctx.base, 'elenco', 'mara', 'ref', 'padrao-frente.png')).equals(aj.PNG_1PX));
    const corpo = fetch.chamadas[0].corpo;
    assert.deepStrictEqual([corpo.model, corpo.resolution, corpo.aspect_ratio], ['bytedance-seed/seedream-4.5', '2K', '9:16']);
    assert.match(corpo.input_references[0].image_url.url, /^data:image\/png;base64,/);
    const r2 = await imagem.gerarImagem(pedido, ctx);
    assert.strictEqual(r2.novo, false);
    assert.strictEqual(fetch.chamadas.length, 1);
    const linhas = fs.readFileSync(path.join(ctx.base, 'custos.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    assert.deepStrictEqual(linhas.map((l) => [l.tipo, l.realUsd, l.previstoUsd, l.etapa]), [['imagem', 0.039, 0.04, 'elenco']]);
});

test('completarJSON: response_format json_schema, usage.cost no livro, JSON com cerca', async () => {
    const { fetch, ctx } = montarCtx((req) => {
        assert.strictEqual(req.url, 'https://openrouter.ai/api/v1/chat/completions');
        return { json: { id: 'gen-1', model: 'openai/gpt-6-luna', choices: [{ finish_reason: 'stop', message: { content: '```json\n{"titulo":"Sete Quilômetros"}\n```' } }], usage: { prompt_tokens: 50, completion_tokens: 10, cost: 0.00002 } } };
    });
    const schema = { type: 'object', properties: { titulo: { type: 'string' } }, required: ['titulo'], additionalProperties: false };
    const r = await texto.completarJSON({ modelo: 'openai/gpt-6-luna', sistema: 'Você é roteirista.', prompt: 'Título do ep 1', schema, nomeSchema: 'titulo', maxTokens: 500, ep: 1, etapa: 'roteiro' }, ctx);
    assert.deepStrictEqual(r.dados, { titulo: 'Sete Quilômetros' });
    assert.strictEqual(r.custoUsd, 0.00002);
    const corpo = fetch.chamadas[0].corpo;
    assert.deepStrictEqual(corpo.response_format, { type: 'json_schema', json_schema: { name: 'titulo', strict: true, schema } });
    assert.deepStrictEqual(corpo.provider, { require_parameters: true });
    assert.strictEqual(corpo.max_completion_tokens, 500);
    const linhas = fs.readFileSync(path.join(ctx.base, 'custos.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    assert.deepStrictEqual(linhas.map((l) => [l.tipo, l.realUsd, l.etapa, l.ep]), [['texto', 0.00002, 'roteiro', 1]]);
});

test('completarJSON: resposta cortada (length) vira erro claro, mas o custo fica registrado', async () => {
    const { ctx } = montarCtx(() => ({ json: { id: 'gen-2', choices: [{ finish_reason: 'length', message: { content: '{"a":' } }], usage: { cost: 0.0001 } } }));
    await assert.rejects(texto.completarJSON({ modelo: 'openai/gpt-6-luna', prompt: 'x', maxTokens: 10 }, ctx), /cortada no limite de 10 tokens/);
    assert.strictEqual(await ctx.livro.total({}), 0.0001);
});

test('a chave nunca aparece nos arquivos gravados nem nos logs', async () => {
    const { ctx } = montarCtx((req) => {
        if (req.metodo === 'POST') return { status: 402, json: { error: { code: 402, message: `Insufficient credits for ${aj.CHAVE_TESTE}` } } };
        throw new Error('inesperado');
    });
    const log = await aj.capturarConsole(async () => {
        const e = await video.gerarVideo(pedidoVideo, ctx).catch((x) => x);
        console.error('Error:', e.message);
        assert.match(e.message, /Sem crédito suficiente/);
    });
    assert.ok(!log.includes(aj.CHAVE_TESTE));
    const jobsTxt = fs.readFileSync(path.join(ctx.base, 'jobs.json'), 'utf8');
    assert.ok(!jobsTxt.includes(aj.CHAVE_TESTE));
    assert.match(jobsTxt, /"status": "falhou"/);
});
