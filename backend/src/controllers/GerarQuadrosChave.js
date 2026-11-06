// POST /GerarQuadrosChave { serie, ep, confirmacoes: [{ plano, pedido, token }] } — PAGO: gera os quadros-chave
// cotados (só com o token de cada cotação) e registra cada um no plano (edição + planos.json).
const { gerarQuadrosLote } = require('../edicao/quadrosLote');
const { entrada, responderErro } = require('../series/http');

exports.REST = async (req, res) => {
    try {
        const { serie, ep, confirmacoes } = entrada(req);
        if (!serie || !ep) return res.status(400).json({ Error: 'Informe serie e ep.' });
        const r = await gerarQuadrosLote({ serie, ep, confirmacoes });
        console.log(`[quadros] ${serie} ep${ep}: ${r.feitos.length} de ${r.total} gerados${r.erro ? ` (parou: ${r.erro})` : ''}`);
        return res.json(r);
    } catch (error) {
        return responderErro(res, error);
    }
};
