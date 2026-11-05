// POST /RegerarTrecho { serie, ep, confirmacoes: [ { id, token } ] } — gera SÓ com o token da cotação (o clique de
// confirmação do custo). Acompanha o job sozinho; ao terminar apara, grava o take novo e troca só aquele pedaço.
// Consulte o andamento em StatusRegeracao.
const { responder, exigir } = require('../edicao/http');
const trecho = require('../edicao/trecho');

exports.REST = responder(async (d) => {
    exigir(d, 'serie', 'ep', 'confirmacoes');
    return trecho.regerarTrecho({ serie: d.serie, ep: d.ep, confirmacoes: d.confirmacoes });
});
