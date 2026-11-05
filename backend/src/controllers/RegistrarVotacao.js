// POST /RegistrarVotacao { serie, n, A, B, fonte: manual|youtube } — resultado REAL (nunca inventado).
// Calcula vencedora/empate, grava votacao.json e atualiza biblia.escolhas.
const episodios = require('../series/episodios');
const { entrada, responderErro } = require('../series/http');

exports.REST = async (req, res) => {
    try {
        const { serie, n, A, B, fonte } = entrada(req);
        return res.json(await episodios.registrarVotacao(serie, n, { A, B, fonte }));
    } catch (error) {
        return responderErro(res, error);
    }
};
