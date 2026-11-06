// Quadros-chave em lote: prompt do quadro, referências das fichas e recusa sem token (sem rede).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { pastaTemporaria, apagar } = require('./series-ajuda');
const Q = require('../src/edicao/quadrosLote');

test('promptDoQuadro: pede um still do primeiro quadro, com a aparência das fichas', () => {
    const p = Q.promptDoQuadro({ prompt: 'Mara at the radio, profile', ancoras: ['mara'] }, { mara: { nome: 'Mara', ancora: 'green raincoat' } });
    assert.match(p, /FIRST FRAME/);
    assert.match(p, /Mara at the radio/);
    assert.match(p, /Mara: green raincoat/);
    assert.match(p, /9:16/);
});

test('referenciaDaFicha: só a imagem canônica que existe no disco', () => {
    const raiz = pastaTemporaria();
    try {
        fs.mkdirSync(path.join(raiz, 'elenco', 'mara', 'ref'), { recursive: true });
        fs.writeFileSync(path.join(raiz, 'elenco', 'mara', 'ref', 'frente.png'), 'x');
        assert.strictEqual(Q.referenciaDaFicha(raiz, { id: 'mara', tipo: 'personagem', canonica: 'ref/frente.png' }), 'elenco/mara/ref/frente.png');
        assert.strictEqual(Q.referenciaDaFicha(raiz, { id: 'mara', tipo: 'personagem', canonica: 'ref/sumiu.png' }), null);
        assert.strictEqual(Q.referenciaDaFicha(raiz, { id: 'x', tipo: 'local' }), null);
    } finally {
        apagar(raiz);
    }
});

test('gerarQuadrosLote recusa sem token (nada pago sem confirmar)', async () => {
    await assert.rejects(Q.gerarQuadrosLote({ serie: 's', ep: 1, confirmacoes: [] }), /Confirme a cotação/);
    await assert.rejects(Q.gerarQuadrosLote({ serie: 's', ep: 1, confirmacoes: [{ plano: 1, pedido: {} }] }), /token/);
});
