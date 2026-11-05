// Preço e validação pelo catálogo REAL de vídeo (fixture baixada em 04/11/2026) + cache do catálogo.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const catalogo = require('../src/openrouter/catalogo');
const { ErroPreco, ErroValidacao } = require('../src/openrouter/erros');
const { criarCliente } = require('../src/openrouter/cliente');
const aj = require('./fixtures/openrouter-ajuda');

const perto = (a, b, tol = 1e-4) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b}`);

test('Veo 3.1 Lite 8 s 720p: sem áudio US$ 0,24 e com áudio US$ 0,40', () => {
    const m = aj.modeloVideo('google/veo-3.1-lite');
    const sem = catalogo.precoVideo(m, { duracaoS: 8, resolucao: '720p', proporcao: '9:16', audio: false });
    const com = catalogo.precoVideo(m, { duracaoS: 8, resolucao: '720p', proporcao: '9:16', audio: true });
    assert.strictEqual(sem.usd, 0.24);
    assert.strictEqual(com.usd, 0.40);
    assert.strictEqual(sem.estimativa, false);
    assert.strictEqual(sem.sku, 'duration_seconds_without_audio_720p');
    // 1080p cai na chave sem resolução
    assert.strictEqual(catalogo.precoVideo(m, { duracaoS: 8, resolucao: '1080p', audio: false }).usd, 0.40);
});

test('Grok Imagine 1.5 Lite 8 s 480p = US$ 0,16 (centavos por segundo) e +1 centavo por imagem de entrada', () => {
    const m = aj.modeloVideo('x-ai/grok-imagine-video-1.5-lite');
    assert.strictEqual(catalogo.precoVideo(m, { duracaoS: 8, resolucao: '480p' }).usd, 0.16);
    assert.strictEqual(catalogo.precoVideo(m, { duracaoS: 8, resolucao: '720p' }).usd, 0.24);
    assert.strictEqual(catalogo.precoVideo(m, { duracaoS: 8, resolucao: '480p', modo: 'imagem', quadros: 1 }).usd, 0.17);
});

test('Seedance 1.5 Pro por token é ESTIMATIVA (largura × altura × 24 × s ÷ 1024)', () => {
    const m = aj.modeloVideo('bytedance/seedance-1-5-pro');
    const p480 = catalogo.precoVideo(m, { duracaoS: 8, resolucao: '480p', proporcao: '9:16', audio: false });
    perto(p480.usd, (480 * 854 * 24 * 8 / 1024) * 0.0000012);
    assert.strictEqual(p480.estimativa, true);
    assert.ok(p480.avisos.some((a) => a.includes('ESTIMATIVA')));
    const p720a = catalogo.precoVideo(m, { duracaoS: 8, resolucao: '720p', proporcao: '9:16', audio: true });
    perto(p720a.usd, (720 * 1280 * 24 * 8 / 1024) * 0.0000024);
    // largura/altura explícitas vencem
    perto(catalogo.precoVideo(m, { duracaoS: 4, largura: 1000, altura: 1000 }).usd, (1000 * 1000 * 24 * 4 / 1024) * 0.0000012);
});

test('Kling 3.0 Std: com áudio usa duration_seconds_with_audio; sem áudio usa o preço do modo', () => {
    const m = aj.modeloVideo('kwaivgi/kling-v3.0-std');
    perto(catalogo.precoVideo(m, { duracaoS: 8, resolucao: '720p', audio: true }).usd, 1.008);
    perto(catalogo.precoVideo(m, { duracaoS: 8, resolucao: '720p', audio: false }).usd, 0.672);
    assert.strictEqual(catalogo.precoVideo(m, { duracaoS: 8, resolucao: '720p', modo: 'imagem' }).sku, 'image_to_video_duration_seconds_720p');
});

test('mínimo por geração, referências pagas e preço desconhecido', () => {
    const aleph = aj.modeloVideo('runway/aleph-2');
    const p = catalogo.precoVideo(aleph, { duracaoS: 1 });
    assert.strictEqual(p.usd, 0.56);
    assert.ok(p.detalhe.some((d) => d.sku === 'minimum_cents_per_generation'));
    const hailuo = aj.modeloVideo('minimax/hailuo-3');
    perto(catalogo.precoVideo(hailuo, { duracaoS: 6, resolucao: '2K', referencias: 2 }).usd, 6 * 0.13 + 2 * 0.04);
    assert.strictEqual(catalogo.precoVideo(aj.modeloVideo('heygen/avatar-iv'), { duracaoS: 10, resolucao: '720p' }).usd, 0.5);
    assert.throws(() => catalogo.precoVideo(aj.modeloVideo('black-forest-labs/flux-video-upscale'), { duracaoS: 5 }), ErroPreco);
    assert.throws(() => catalogo.precoVideo(aj.modeloVideo('google/veo-3.1-lite'), { resolucao: '720p' }), ErroPreco);
});

test('dimensões: usa supported_sizes quando existe', () => {
    assert.deepStrictEqual(catalogo.dimensoes(aj.modeloVideo('bytedance/seedance-1-5-pro'), '480p', '9:16'), { largura: 480, altura: 854 });
    assert.deepStrictEqual(catalogo.dimensoes(aj.modeloVideo('google/veo-3.1-lite'), '720p', '9:16'), { largura: 720, altura: 1280 });
    assert.deepStrictEqual(catalogo.dimensoes(null, '1080p', '16:9'), { largura: 1920, altura: 1080 });
    assert.deepStrictEqual(catalogo.dimensoes(null, '480p', '9:16'), { largura: 480, altura: 854 });
});

test('validarVideo: duração, resolução, áudio, quadros e quadro + referência', () => {
    const veo = aj.modeloVideo('google/veo-3.1-lite');
    assert.throws(() => catalogo.validarVideo(veo, { duracaoS: 7 }), (e) => e instanceof ErroValidacao && /4, 6, 8/.test(e.message));
    assert.throws(() => catalogo.validarVideo(veo, { duracaoS: 8, resolucao: '480p' }), /480p não suportada/);
    assert.throws(() => catalogo.validarVideo(veo, { duracaoS: 8, quadros: { primeiro: 'a.png' }, referencias: ['b.png'] }), /quadro OU referências/);
    const ok = catalogo.validarVideo(veo, { duracaoS: 8, quadros: { primeiro: 'a.png', ultimo: 'b.png' } });
    assert.deepStrictEqual([ok.resolucao, ok.proporcao, ok.audio, ok.modo, ok.nQuadros], ['720p', '9:16', false, 'imagem', 2]);
    const grok = aj.modeloVideo('x-ai/grok-imagine-video-1.5-lite');
    assert.throws(() => catalogo.validarVideo(grok, { duracaoS: 8, audio: true }), /não gera áudio/);
    assert.throws(() => catalogo.validarVideo(grok, { duracaoS: 8, quadros: { ultimo: 'b.png' } }), /último quadro/);
    assert.throws(() => catalogo.validarVideo(veo, { duracaoS: 8, videoEntrada: true }), /vídeo de entrada/);
});

test('imagem: Seedream 4.5 US$ 0,04; Nano Banana 2 por token (endpoint mais caro) é estimativa', () => {
    const seed = aj.lerFixture('endpoints-seedream-4.5.json').endpoints;
    const p = catalogo.precoImagem(seed, { resolucao: '1K', n: 1, referencias: 3 });
    assert.strictEqual(p.usd, 0.04);
    assert.strictEqual(p.estimativa, false);
    assert.strictEqual(catalogo.precoImagem(seed, { resolucao: '2K', n: 3 }).usd, 0.12);
    const gem = aj.lerFixture('endpoints-gemini-3.1-flash-image.json').endpoints;
    const g = catalogo.precoImagem(gem, { resolucao: '1K' });
    perto(g.usd, 1120 * 0.000066);
    assert.strictEqual(g.estimativa, true);
    const modelos = aj.lerFixture('imagens-models.json').data;
    const nano = catalogo.acharModelo(modelos, 'google/gemini-3.1-flash-image', 'imagem');
    assert.throws(() => catalogo.validarImagem(nano, { n: 2 }), /quantidade/);
    assert.throws(() => catalogo.validarImagem(nano, { referencias: new Array(15).fill('x.png') }), /máximo 14/);
    assert.deepStrictEqual(catalogo.validarImagem(nano, {}), { resolucao: '1K', proporcao: '9:16', n: 1, nRefs: 0 });
    assert.throws(() => catalogo.acharModelo(modelos, 'nao/existe', 'imagem'), /não está no catálogo/);
});

test('texto: previsto pelo máximo de saída', () => {
    const luna = aj.lerFixture('modelos-texto.json').data.find((m) => m.id === 'openai/gpt-6-luna');
    const p = catalogo.precoTexto(luna, { tokensEntrada: 1000, tokensSaidaMax: 4000 });
    perto(p.usd, 1000 * Number(luna.pricing.prompt) + 4000 * Number(luna.pricing.completion));
});

test('cache do catálogo: baixa uma vez, reaproveita, força, e cai no cache velho se a rede falhar', async () => {
    const raiz = aj.pastaTemp('cat-');
    let falhar = false;
    const fetch = aj.criarFetchFalso((req) => {
        if (falhar) throw new TypeError('fetch failed');
        assert.ok(req.url.endsWith('/videos/models'));
        return { json: aj.lerFixture('videos-models.json') };
    });
    let t = Date.parse('2026-11-04T12:00:00Z');
    const cliente = criarCliente({ fetch, chave: aj.CHAVE_TESTE, tentativas: 1, dormir: async () => {} });
    const r1 = await catalogo.carregarCatalogoVideo({ cliente, raiz, agora: () => t });
    assert.strictEqual(r1.deCache, false);
    assert.strictEqual(r1.modelos.length, 31);
    const gravado = JSON.parse(fs.readFileSync(path.join(raiz, 'catalogo', 'videos.json'), 'utf8'));
    assert.strictEqual(gravado.baixadoEm, '2026-11-04T12:00:00.000Z');
    const r2 = await catalogo.carregarCatalogoVideo({ cliente, raiz, agora: () => t });
    assert.strictEqual(r2.deCache, true);
    assert.strictEqual(fetch.chamadas.length, 1);
    await catalogo.carregarCatalogoVideo({ cliente, raiz, agora: () => t, forcar: true });
    assert.strictEqual(fetch.chamadas.length, 2);
    t += 25 * 3600 * 1000; // passou de 24 h
    falhar = true;
    const r3 = await catalogo.carregarCatalogoVideo({ cliente, raiz, agora: () => t });
    assert.strictEqual(r3.deCache, true);
    assert.match(r3.aviso, /não consegui atualizar/);
    await assert.rejects(catalogo.carregarCatalogoVideo({ cliente, raiz: aj.pastaTemp('cat-vazio-'), agora: () => t }), /Falha de rede/);
});
