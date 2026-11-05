// MODO SIMULADO (ESTUDIO_SIMULADO=1): fluxo inteiro sem rede e sem custo, com `simulado: true`.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const aj = require('./fixtures/openrouter-ajuda');

const RAIZ = aj.pastaTemp('sim-');
process.env.ESTUDIO_DADOS = RAIZ;
process.env.ESTUDIO_SIMULADO = '1';
process.env.ASE_OPENROUTER_KEY = aj.CHAVE_TESTE; // mesmo com chave, o simulado vence

let chamadasRede = 0;
globalThis.fetch = async () => { chamadasRede++; throw new Error('o modo simulado não pode usar a rede'); };

const servico = require('../src/openrouter/servico');
const or = require('../src/openrouter');

test('vídeo simulado: cota pelo catálogo, gera, "conclui" na consulta e copia o vídeo de exemplo', async () => {
    const pedido = { modelo: 'google/veo-3.1-lite', prompt: 'farol à noite', duracaoS: 8, resolucao: '720p', proporcao: '9:16', destino: 'teste/v.mp4' };
    const cot = await servico.cotarGeracao({ tipo: 'video', pedido });
    assert.strictEqual(cot.custoPrevistoUsd, 0.24);
    assert.strictEqual(cot.simulado, true);
    const g = await servico.gerar({ tipo: 'video', pedido, token: cot.token });
    assert.strictEqual(g.simulado, true);
    assert.strictEqual(g.novo, true);
    assert.match(g.job.jobId, /^sim-vid-/);
    const s = await servico.statusJob({ jobId: g.job.jobId });
    assert.strictEqual(s.job.status, 'pronto');
    assert.strictEqual(s.job.custoUsd, 0);
    assert.strictEqual(s.job.simulado, true);
    const arq = path.join(RAIZ, 'geracao-simples', 'teste', 'v.mp4');
    assert.ok(fs.statSync(arq).size > 1000);
    assert.ok(!fs.existsSync(path.join(RAIZ, 'geracao-simples', 'custos.jsonl')), 'simulado não entra no livro');
    assert.ok(!fs.existsSync(path.join(RAIZ, 'catalogo', 'videos.json')), 'retrato do simulado não vira cache real');
    assert.strictEqual(chamadasRede, 0);
});

test('imagem simulada numa série: tetos do serie.json valem; gera PNG de exemplo', async () => {
    const base = path.join(RAIZ, 'series', 'teste-sim');
    fs.mkdirSync(base, { recursive: true });
    fs.writeFileSync(path.join(base, 'serie.json'), JSON.stringify({ versao: 1, id: 'teste-sim', orcamento: { tetoPlanoUsd: 0.03, tetoEpisodioUsd: 4, tetoSerieUsd: 40 } }));
    const pedido = { modelo: 'bytedance-seed/seedream-4.5', prompt: 'Mara de frente', destino: 'elenco/mara/ref/frente.png' };
    await assert.rejects(servico.cotarGeracao({ tipo: 'imagem', serie: 'teste-sim', pedido }), /teto por plano \(US\$ 0,03\)/);
    fs.writeFileSync(path.join(base, 'serie.json'), JSON.stringify({ versao: 1, id: 'teste-sim', orcamento: { tetoPlanoUsd: 1, tetoEpisodioUsd: 4, tetoSerieUsd: 40 } }));
    const cot = await servico.cotarGeracao({ tipo: 'imagem', serie: 'teste-sim', pedido });
    assert.strictEqual(cot.custoPrevistoUsd, 0.04);
    // token de vídeo/outra série não serve
    await assert.rejects(servico.gerar({ tipo: 'imagem', pedido, token: cot.token }), /outro pedido/);
    const cot2 = await servico.cotarGeracao({ tipo: 'imagem', serie: 'teste-sim', pedido });
    const g = await servico.gerar({ tipo: 'imagem', serie: 'teste-sim', pedido, token: cot2.token });
    assert.strictEqual(g.job.status, 'pronto');
    assert.deepStrictEqual(g.arquivos, ['elenco/mara/ref/frente.png']);
    assert.ok(fs.existsSync(path.join(base, 'elenco', 'mara', 'ref', 'frente.png')));
    assert.ok(!fs.existsSync(path.join(base, 'custos.jsonl')));
    assert.strictEqual(chamadasRede, 0);
});

test('texto simulado: JSON de exemplo a partir do schema (ou a resposta simulada dada)', async () => {
    const ctx = await or.obterContexto({});
    const schema = { type: 'object', properties: { titulo: { type: 'string' }, planos: { type: 'array', items: { type: 'object', properties: { n: { type: 'integer' }, tipo: { enum: ['video_ia', 'grafico'] } } } } } };
    const r = await or.completarJSON({ modelo: 'openai/gpt-6-luna', prompt: 'roteiro', schema }, ctx);
    assert.strictEqual(r.simulado, true);
    assert.deepStrictEqual(r.dados, { titulo: '(simulado)', planos: [{ n: 1, tipo: 'video_ia' }] });
    const r2 = await or.completarJSON({ modelo: 'openai/gpt-6-luna', prompt: 'x', respostaSimulada: { ok: 1 } }, ctx);
    assert.deepStrictEqual(r2.dados, { ok: 1 });
    assert.strictEqual(chamadasRede, 0);
});

test('saldo e catálogo no simulado não usam a rede', async () => {
    const s = await servico.saldo();
    assert.strictEqual(s.simulado, true);
    const c = await servico.catalogoVideoResumo();
    const veo = c.modelos.find((m) => m.id === 'google/veo-3.1-lite');
    assert.deepStrictEqual([veo.precoExemplo.semAudioUsd, veo.precoExemplo.comAudioUsd], [0.24, 0.4]);
    assert.ok(!JSON.stringify({ s, c }).includes(aj.CHAVE_TESTE));
    assert.strictEqual(chamadasRede, 0);
});
