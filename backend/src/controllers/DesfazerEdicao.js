// POST /DesfazerEdicao { serie, ep } — volta uma versão no histórico do servidor (Ctrl+Z da Mesa).
const { responder, exigir } = require('../edicao/http');
const E = require('../edicao/edicao');

exports.REST = responder(async (d) => {
    exigir(d, 'serie', 'ep');
    return E.desfazerEdicao(d.serie, d.ep);
});
