// POST /EdicaoInicial { serie, ep, gerarFalas?, forcar? } — monta a edição "narração primeiro" a partir do roteiro
// e do falas.json (gerarFalas=true gera as falas pelo módulo de áudio — TTS grátis; sem falas, estima pelo texto).
// forcar=true refaz por cima (a versão anterior fica no histórico: dá para desfazer).
const { responder, exigir } = require('../edicao/http');
const E = require('../edicao/edicao');

exports.REST = responder(async (d) => {
    exigir(d, 'serie', 'ep');
    return E.edicaoInicial(d.serie, d.ep, { gerarFalas: d.gerarFalas === true || d.gerarFalas === 'true', forcar: d.forcar === true || d.forcar === 'true' });
});
