// POST /MemoriaSemear — primeira memória a partir da bíblia aprovada (fatos ep00, estado inicial, glossário).
// Corpo: { serieId, aprovar? } — sem aprovar só devolve (e guarda) a proposta.
const { semearDaBiblia, caminhoSerie } = require('../memoria');

exports.REST = async (req, res) => {
    try {
        const { serieId, aprovar } = req.body || {};
        if (!serieId) return res.status(400).json({ Error: 'Informe "serieId".' });
        return res.json(semearDaBiblia(caminhoSerie(serieId), { aprovar: aprovar === true }));
    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ Error: error.message });
    }
};
