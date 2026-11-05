// GET|POST /LerEpisodio { serie, n } — entrada do serie.json + roteiro, planos e votação (null quando ainda não existem).
const episodios = require('../series/episodios');
const { entrada, responderErro } = require('../series/http');

exports.REST = async (req, res) => {
    try {
        const { serie, n } = entrada(req);
        return res.json({ episodio: await episodios.lerEpisodio(serie, n) });
    } catch (error) {
        return responderErro(res, error);
    }
};
