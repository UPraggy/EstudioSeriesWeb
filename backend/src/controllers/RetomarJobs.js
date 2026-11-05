// POST /RetomarJobs { serie? } — depois de reiniciar: consulta os jobs pendentes (GET grátis) e marca envios
// interrompidos como "incerto" (conferir no painel do OpenRouter antes de repetir).
const servico = require('../openrouter/servico');
const { limparSegredos } = require('../openrouter/erros');

exports.REST = async (req, res) => {
    try {
        const { serie } = req.body || {};
        return res.json(await servico.retomar({ serie }));
    } catch (error) {
        const msg = limparSegredos(error.message);
        console.error('Error:', msg);
        res.status(500).json({ Error: msg });
    }
};
