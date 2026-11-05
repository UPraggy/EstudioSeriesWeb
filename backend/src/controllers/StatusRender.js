// GET /StatusRender?serie=&ep= — andamento da montagem (etapa, %, saída, erro).
const { responder, exigir } = require('../edicao/http');
const render = require('../edicao/render');

exports.REST = responder(async (d) => {
    exigir(d, 'serie', 'ep');
    return render.statusRender(d.serie, d.ep);
});
