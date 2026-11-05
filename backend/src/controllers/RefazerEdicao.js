// POST /RefazerEdicao { serie, ep } — avança uma versão no histórico do servidor (Ctrl+Shift+Z da Mesa).
const { responder, exigir } = require('../edicao/http');
const E = require('../edicao/edicao');

exports.REST = responder(async (d) => {
    exigir(d, 'serie', 'ep');
    return E.refazerEdicao(d.serie, d.ep);
});
