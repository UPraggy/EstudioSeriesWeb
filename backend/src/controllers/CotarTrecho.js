// POST /CotarTrecho { serie, ep, deS, ateS, instrucao, modelo?, resolucao? } — NÃO gasta nada.
// Um pedido por plano do trecho: primeiro/último quadro do take atual, menor duração aceita ≥ trecho, custo e token.
const { responder, exigir } = require('../edicao/http');
const trecho = require('../edicao/trecho');

exports.REST = responder(async (d) => {
    exigir(d, 'serie', 'ep', 'deS', 'ateS');
    return trecho.cotarTrecho({ serie: d.serie, ep: d.ep, deS: Number(d.deS), ateS: Number(d.ateS), instrucao: d.instrucao || '', modelo: d.modelo || null, resolucao: d.resolucao || null });
});
