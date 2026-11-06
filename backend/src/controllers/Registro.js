// GET /Registro { dia?, nivel?, area?, serie?, busca?, limite?, antesDe? } — eventos do registro (logs/registro-*.jsonl),
// mais recentes primeiro, paginado ("carregar mais" = mandar antesDe = proximoAntesDe da página anterior).
// nivel/area/serie aceitam vários separados por vírgula. Só leitura.
const { lerRegistro } = require('../log/leitor');
const { entrada, responderErro } = require('../series/http');

exports.REST = async (req, res) => {
    try {
        const { dia, nivel, area, serie, busca, limite, antesDe } = entrada(req);
        return res.json(lerRegistro({ dia, nivel, area, serie, busca, limite, antesDe }));
    } catch (error) {
        return responderErro(res, error);
    }
};
