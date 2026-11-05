// POST /CriarSerie { titulo, genero, ideia } — cria a pasta completa da série (nunca sobrescreve: 409 se já existe).
const armazem = require('../series/armazem');
const { entrada, responderErro } = require('../series/http');

exports.REST = async (req, res) => {
    try {
        const { titulo, genero, ideia } = entrada(req);
        const serie = await armazem.criarSerie({ titulo, genero, ideia });
        return res.json({ serie });
    } catch (error) {
        return responderErro(res, error);
    }
};
