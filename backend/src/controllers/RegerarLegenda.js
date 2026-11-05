// POST /RegerarLegenda { serie, ep, deS?, ateS? } — recalcula a legenda das falas do trecho (desfaz edições manuais
// dos blocos e acerta depois de mover/aparar falas). Entra no histórico.
const { responder, exigir } = require('../edicao/http');
const trecho = require('../edicao/trecho');

exports.REST = responder(async (d) => {
    exigir(d, 'serie', 'ep');
    return trecho.regerarLegenda({ serie: d.serie, ep: d.ep, deS: d.deS === undefined ? 0 : Number(d.deS), ateS: d.ateS === undefined ? Infinity : Number(d.ateS) });
});
