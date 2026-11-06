// POST /CotarVideoPlanos { serie, ep, planos?: [n], modelo? } — "Gerar vídeo dos N planos": UMA cotação somando os
// planos (sem `planos`: os que ainda não têm vídeo). Não gasta nada. Cada plano é um pedido do plano inteiro (duração =
// menor aceita pelo modelo ≥ plano, depois apara; quadro-chave como 1º quadro quando o modelo aceita).
// → { cotacoes: [{ id, plano, deS, ateS, duracaoS, duracaoPedidaS, ajuste, modelo, prompt, quadros, custoPrevistoUsd, token, avisos }],
//     totalUsd, simulado, teto: { passa: texto|null, ... }, avisos }
const { responder, exigir } = require('../edicao/http');
const { cotarLoteVideo } = require('../edicao/producao');

exports.REST = responder(async (d) => {
    exigir(d, 'serie', 'ep');
    const planos = Array.isArray(d.planos) ? d.planos : typeof d.planos === 'string' && d.planos ? d.planos.split(',').map(Number) : null;
    return cotarLoteVideo({ serie: d.serie, ep: d.ep, planos, modelo: d.modelo || null });
});
