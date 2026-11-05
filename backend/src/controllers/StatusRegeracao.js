// GET /StatusRegeracao?serie=&ep= — regerações do episódio (cotado/gerando/pronto/falhou), takes e a revisão atual
// da edição (quando muda, a Mesa recarrega). Retoma o acompanhamento das que ficaram no meio.
const { responder, exigir } = require('../edicao/http');
const trecho = require('../edicao/trecho');

exports.REST = responder(async (d) => {
    exigir(d, 'serie', 'ep');
    return trecho.statusRegeracoes(d.serie, d.ep);
});
