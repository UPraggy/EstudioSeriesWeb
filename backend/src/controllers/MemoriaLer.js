// GET /MemoriaLer?serieId=...&ep=... — memória da série: fatos vigentes (no início do ep, ou agora), estado, resumos e glossário.
const { carregarMemoria, caminhoSerie, fatosVigentes } = require('../memoria');

exports.REST = async (req, res) => {
    try {
        const { serieId, ep } = req.query || {};
        if (!serieId) return res.status(400).json({ Error: 'Informe "serieId".' });
        const m = carregarMemoria(caminhoSerie(String(serieId)));
        return res.json({
            fatosVigentes: fatosVigentes(m.fatos, ep != null && ep !== '' ? ep : null),
            totalFatos: m.fatos.length,
            errosFatos: m.errosFatos,
            estado: m.estado,
            resumos: m.resumos,
            glossario: m.glossario,
        });
    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ Error: error.message });
    }
};
