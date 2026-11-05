// POST /GerarImagem { serie?, pedido, token } — PAGO: só roda com o token do CotarGeracao (tipo 'imagem') do mesmo pedido.
const servico = require('../openrouter/servico');
const { limparSegredos } = require('../openrouter/erros');

exports.REST = async (req, res) => {
    try {
        const { serie, pedido, token } = req.body || {};
        return res.json(await servico.gerar({ tipo: 'imagem', serie, pedido, token }));
    } catch (error) {
        const msg = limparSegredos(error.message);
        console.error('Error:', msg);
        res.status(500).json({ Error: msg });
    }
};
