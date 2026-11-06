// POST /CotarQuadrosChave { serie, ep, planos? } — cota um quadro-chave por plano (padrão: os que não têm), com as
// imagens canônicas do elenco e do local como referência. Não gasta nada; devolve os tokens para GerarQuadrosChave.
const { cotarQuadrosLote } = require('../edicao/quadrosLote');
const { entrada, responderErro } = require('../series/http');

exports.REST = async (req, res) => {
    try {
        const { serie, ep, planos } = entrada(req);
        if (!serie || !ep) return res.status(400).json({ Error: 'Informe serie e ep.' });
        return res.json(await cotarQuadrosLote({ serie, ep, planos }));
    } catch (error) {
        return responderErro(res, error);
    }
};
