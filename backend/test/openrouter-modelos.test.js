// Modelos da série: resumo do catálogo de texto e validação por papel (sem rede: catálogos injetados).
const test = require('node:test');
const assert = require('node:assert');
const { validarModelos, resumoTexto } = require('../src/openrouter/modelos');

const CAT = {
    texto: { modelos: [{ id: 'openai/gpt-6-luna' }, { id: 'anthropic/fable-5-1' }] },
    imagem: { modelos: [{ id: 'google/gemini-3.1-flash-image' }, { id: 'bytedance-seed/seedream-4.5' }] },
    video: { modelos: [{ id: 'google/veo-3.1-lite' }, { id: 'bytedance/seedance-1-5-pro' }, { id: 'heygen/avatar-iv' }] },
};

test('resumoTexto: só modelos de texto com saída estruturada, com preço por milhão de tokens', () => {
    const r = resumoTexto([
        { id: 'a/texto', name: 'A', architecture: { output_modalities: ['text'] }, supported_parameters: ['structured_outputs'], pricing: { prompt: '0.0000002', completion: '0.0000006' }, context_length: 1000 },
        { id: 'b/sem-json', architecture: { output_modalities: ['text'] }, supported_parameters: [] },
        { id: 'c/imagem', architecture: { output_modalities: ['image'] }, supported_parameters: ['structured_outputs'] },
    ]);
    assert.deepStrictEqual(r.map((m) => m.id), ['a/texto']);
    assert.strictEqual(r[0].entradaUsdMilhao, 0.2);
    assert.strictEqual(r[0].saidaUsdMilhao, 0.6);
});

test('validarModelos: aceita ids do catálogo do papel e recusa o resto', async () => {
    const ok = await validarModelos({ texto: 'anthropic/fable-5-1', videoFinal: 'bytedance/seedance-1-5-pro' }, { catalogos: CAT });
    assert.deepStrictEqual(ok.modelos, { texto: 'anthropic/fable-5-1', videoFinal: 'bytedance/seedance-1-5-pro' });
    assert.deepStrictEqual(ok.avisos, []);
    await assert.rejects(validarModelos({ imagem: 'google/veo-3.1-lite' }, { catalogos: CAT }), /não está no catálogo de imagem/);
    await assert.rejects(validarModelos({ musica: 'x/y' }, { catalogos: CAT }), /Papéis desconhecidos/);
    await assert.rejects(validarModelos({ texto: '../../fora' }, { catalogos: CAT }), /id de modelo inválido/);
    await assert.rejects(validarModelos(null, { catalogos: CAT }), /Envie os modelos/);
});

test('validarModelos: catálogo fora do ar grava pelo formato do id, com aviso', async () => {
    const r = await validarModelos({ imagem: 'novo/modelo-1' }, { catalogos: { ...CAT, imagem: { modelos: [] } } });
    assert.strictEqual(r.modelos.imagem, 'novo/modelo-1');
    assert.match(r.avisos[0], /catálogo indisponível/);
});
