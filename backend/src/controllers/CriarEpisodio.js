// POST /CriarEpisodio { serie, n?, titulo?, duracaoAlvoS?, semEscolha? } — episódio novo com duração LIVRE (1 a 600 s).
// n ausente = próximo número. Abaixo de 20 s não há votação A/B (a não ser que semEscolha venha false).
// Resposta: { ok: true, episodio: { n, id, titulo, status, duracaoAlvoS, semEscolha } } ou { Error }.
const episodios = require('../series/episodios');
const { entrada, responderErro } = require('../series/http');

exports.REST = async (req, res) => {
    try {
        const { serie, n, titulo, duracaoAlvoS, semEscolha } = entrada(req);
        if (!serie) return res.status(400).json({ Error: 'Informe a série (campo "serie").' });
        const episodio = await episodios.criarEpisodio(serie, n, titulo, {}, { duracaoAlvoS, semEscolha });
        return res.json({ ok: true, episodio });
    } catch (error) {
        return responderErro(res, error);
    }
};
