// POST /SalvarRoteiro { serie, n, roteiro } — valida (60 s ±3, planos 2–10 s, falas, A ≠ B...) e só então grava.
// Inválido → 400 com { Error, erros, avisos }. Cria o episódio se ainda não existir.
const episodios = require('../series/episodios');
const { entrada, responderErro } = require('../series/http');

exports.REST = async (req, res) => {
    try {
        const { serie, n, roteiro } = entrada(req);
        if (!roteiro || typeof roteiro !== 'object') return res.status(400).json({ Error: 'Envie o roteiro (campo "roteiro").' });
        const r = await episodios.salvarRoteiro(serie, n !== undefined ? n : roteiro.n, roteiro);
        return res.json(r);
    } catch (error) {
        return responderErro(res, error);
    }
};
