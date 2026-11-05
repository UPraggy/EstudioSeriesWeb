// POST /RestaurarDaLixeira { item } — devolve uma série ou um episódio da lixeira para onde estava (nunca
// sobrescreve: recusa com 409 se já existir uma série/episódio no lugar). O episódio volta para o serie.json
// (e a escolha A/B para a bíblia). Resposta: { ok: true, tipo, serie, ep?, titulo } ou { Error }.
const lixeira = require('../series/lixeira');
const { entrada, responderErro } = require('../series/http');

exports.REST = async (req, res) => {
    try {
        const { item } = entrada(req);
        if (!item) return res.status(400).json({ Error: 'Informe o item da lixeira (campo "item").' });
        return res.json(await lixeira.restaurarDaLixeira(item));
    } catch (error) {
        return responderErro(res, error);
    }
};
