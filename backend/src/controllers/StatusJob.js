// POST /StatusJob { jobId, serie? } — consulta o job (GET grátis), baixa o resultado quando pronto e registra o custo real.
const servico = require('../openrouter/servico');
const { limparSegredos } = require('../openrouter/erros');

exports.REST = async (req, res) => {
    try {
        const { jobId, serie } = req.body || {};
        return res.json(await servico.statusJob({ jobId, serie }));
    } catch (error) {
        const msg = limparSegredos(error.message);
        console.error('Error:', msg);
        res.status(500).json({ Error: msg });
    }
};
