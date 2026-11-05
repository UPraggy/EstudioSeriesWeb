// POST /ApagarSerie { serie, confirmacao } — "apagar" nunca destrói: a pasta inteira da série vai para
// <ESTUDIO_DADOS>/_lixeira/<AAAA-MM-DD_HHmmss>-<serie>/ com um motivo.json (dá para restaurar).
// Só apaga se "confirmacao" for exatamente o título da série. Recusa (409) com geração paga em andamento ou
// montagem rodando. Resposta: { ok: true, lixeira, item, motivo } ou { Error }.
const lixeira = require('../series/lixeira');
const { entrada, responderErro } = require('../series/http');

exports.REST = async (req, res) => {
    try {
        const { serie, confirmacao } = entrada(req);
        if (!serie) return res.status(400).json({ Error: 'Informe a série (campo "serie").' });
        return res.json(await lixeira.apagarSerie(serie, confirmacao));
    } catch (error) {
        return responderErro(res, error);
    }
};
