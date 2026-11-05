// POST /GerarGeracaoSimples { id, token, aguardar? } — PAGO: gera a geração simples cotada (token do CotarGeracaoSimples).
// Vídeo: abre o job e grava pedido.json.resultado { status: 'pendente' } (acompanhe com /StatusJob { jobId }).
const servico = require('../openrouter/servico');
const { limparSegredos } = require('../openrouter/erros');

exports.REST = async (req, res) => {
    try {
        const { id, token, aguardar } = req.body || {};
        return res.json(await servico.gerarSimples({ id, token, aguardar: aguardar === true }));
    } catch (error) {
        const msg = limparSegredos(error.message);
        console.error('Error:', msg);
        res.status(500).json({ Error: msg });
    }
};
