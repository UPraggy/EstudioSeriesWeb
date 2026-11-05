// POST /CotarGeracao { tipo: 'video'|'imagem', serie?, pedido } — custo previsto + teto + token de confirmação (10 min).
// Não gasta nada. O token só vale para ESTE pedido (GerarVideo/GerarImagem exigem o token).
const servico = require('../openrouter/servico');
const { limparSegredos } = require('../openrouter/erros');

exports.REST = async (req, res) => {
    try {
        const { tipo, serie, pedido } = req.body || {};
        return res.json(await servico.cotarGeracao({ tipo, serie, pedido }));
    } catch (error) {
        const msg = limparSegredos(error.message);
        console.error('Error:', msg);
        res.status(500).json({ Error: msg });
    }
};
