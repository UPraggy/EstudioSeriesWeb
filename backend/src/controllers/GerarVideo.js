// POST /GerarVideo { serie?, pedido, token, aguardar? } — PAGO: só roda com o token do CotarGeracao para o mesmo pedido.
// Abre o job (gravado em jobs.json antes e logo depois do POST) e devolve o jobId; acompanhe com /StatusJob.
const servico = require('../openrouter/servico');
const { limparSegredos } = require('../openrouter/erros');

exports.REST = async (req, res) => {
    try {
        const { serie, pedido, token, aguardar } = req.body || {};
        return res.json(await servico.gerar({ tipo: 'video', serie, pedido, token, aguardar: aguardar === true }));
    } catch (error) {
        const msg = limparSegredos(error.message);
        console.error('Error:', msg);
        res.status(500).json({ Error: msg });
    }
};
