// POST /GerarVideoPlanos { serie, ep, confirmacoes: [{ id, token }] } — PAGO: só com os tokens do CotarVideoPlanos.
// Confere a soma contra o teto antes do primeiro job; cada plano abre um job (gravado em jobs.json antes de pagar) e
// é acompanhado no servidor. Acompanhe por GET /StatusRegeracao (ou /EstadoProducao). Pronto = take novo do plano,
// aparado, na edição e no planos.json (takeEscolhido). → { regeracoes: [...] }
const { responder, exigir } = require('../edicao/http');
const { gerarLoteVideo } = require('../edicao/producao');

exports.REST = responder(async (d) => {
    exigir(d, 'serie', 'ep', 'confirmacoes');
    return gerarLoteVideo({ serie: d.serie, ep: d.ep, confirmacoes: d.confirmacoes });
});
