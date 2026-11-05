// POST /MemoriaContexto — mostra o pacote que iria para o OpenRouter (prévia, sem chamar nada).
// Corpo: { serieId, finalidade, ep?, plano?, limiteCaracteres?, maxImagens?, dataUrl? (padrão false: imagens como "arquivo:<caminho>") }
const { montarContexto, caminhoSerie } = require('../memoria');

exports.REST = async (req, res) => {
    try {
        const { serieId, finalidade, ep, plano, limiteCaracteres, maxImagens, dataUrl } = req.body || {};
        if (!serieId || !finalidade) return res.status(400).json({ Error: 'Informe "serieId" e "finalidade".' });
        const pacote = await montarContexto(caminhoSerie(serieId), finalidade, {
            ep, plano, limiteCaracteres, maxImagens, dataUrl: dataUrl === true,
        });
        return res.json(pacote);
    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ Error: error.message });
    }
};
