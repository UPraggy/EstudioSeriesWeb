// GET /ListarSeries — séries em <ESTUDIO_DADOS>/series (resumo de cada uma).
const armazem = require('../series/armazem');
const { responderErro } = require('../series/http');

exports.REST = async (req, res) => {
    try {
        return res.json({ series: await armazem.listarSeries() });
    } catch (error) {
        return responderErro(res, error);
    }
};
