// POST /SalvarEdicao { serie, ep, edicao, revisaoBase } — grava o edicao.json (backup + versão no histórico).
// revisaoBase diferente da gravada (uma regeração terminou, outra aba) → 409: recarregue com LerEdicao.
const { responder, exigir } = require('../edicao/http');
const E = require('../edicao/edicao');

exports.REST = responder(async (d) => {
    exigir(d, 'serie', 'ep', 'edicao');
    return E.salvarEdicao(d.serie, d.ep, d.edicao, { revisaoBase: d.revisaoBase });
});
