// POST /ApagarEpisodio { serie, ep } — move episodios/epNN para a lixeira (<ESTUDIO_DADOS>/_lixeira/...), tira a
// entrada do serie.json e a escolha A/B (sem votos) da biblia.escolhas. Nada é destruído (dá para restaurar).
// Recusa (409) com votação registrada, geração paga em andamento ou montagem rodando.
// Resposta: { ok: true, lixeira, item, episodio: { n, titulo }, avisos } ou { Error }.
const lixeira = require('../series/lixeira');
const { entrada, responderErro } = require('../series/http');

exports.REST = async (req, res) => {
    try {
        const d = entrada(req);
        const ep = d.ep ?? d.n;
        if (!d.serie) return res.status(400).json({ Error: 'Informe a série (campo "serie").' });
        if (ep === undefined || ep === null || ep === '') return res.status(400).json({ Error: 'Informe o episódio (campo "ep").' });
        return res.json(await lixeira.apagarEpisodio(d.serie, ep));
    } catch (error) {
        return responderErro(res, error);
    }
};
