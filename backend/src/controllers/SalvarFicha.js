// POST /SalvarFicha { serie, tipo: elenco|locais|objetos, ficha } — cria ou substitui a ficha (valida; backup do anterior).
const fichas = require('../series/fichas');
const { entrada, responderErro } = require('../series/http');

exports.REST = async (req, res) => {
    try {
        const { serie, tipo, ficha } = entrada(req);
        if (!ficha || typeof ficha !== 'object') return res.status(400).json({ Error: 'Envie a ficha (campo "ficha").' });
        const r = await fichas.salvarFicha(serie, tipo, ficha);
        return res.json(r);
    } catch (error) {
        return responderErro(res, error);
    }
};
