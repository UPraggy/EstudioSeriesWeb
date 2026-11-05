// POST /DefinirCanonica { serie, tipo, id, caminho } — escolhe a imagem canônica (caminho relativo à ficha,
// ex.: "ref/candidatas/mara-sala.jpg"). Recusa caminho absoluto ou com "..".
const fichas = require('../series/fichas');
const { entrada, responderErro } = require('../series/http');

exports.REST = async (req, res) => {
    try {
        const { serie, tipo, id, caminho } = entrada(req);
        const ficha = await fichas.definirCanonica(serie, tipo, id, caminho);
        return res.json({ ficha });
    } catch (error) {
        return responderErro(res, error);
    }
};
