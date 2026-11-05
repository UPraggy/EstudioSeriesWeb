// POST /MemoriaVerificar — confere um roteiro contra a memória (contradições de continuidade).
// Corpo: { serieId, ep, roteiro? (padrão: episodios/epNN/roteiro.json), usarLLM?, modelo? }
const { verificarContinuidade, caminhoSerie, carregarSerie } = require('../memoria');
const { exigirChamarLLM } = require('../showrunner');

function criarREST({ chamarLLM } = {}) {
    return async (req, res) => {
        try {
            const { serieId, ep, roteiro, usarLLM, modelo } = req.body || {};
            if (!serieId) return res.status(400).json({ Error: 'Informe "serieId".' });
            const serie = carregarSerie(caminhoSerie(serieId));
            const r = roteiro || serie.episodios?.[Number(ep)]?.roteiro;
            if (!r) return res.status(400).json({ Error: `Sem roteiro do episódio ${ep}.` });
            const out = await verificarContinuidade(r, serie, {
                ep, modelo, chamarLLM: usarLLM ? (chamarLLM || exigirChamarLLM({ serie: serieId, ep: ep ?? r.n, etapa: 'memoria:verificar' })) : undefined,
            });
            return res.json(out);
        } catch (error) {
            console.error('Error:', error.message);
            res.status(500).json({ Error: error.message });
        }
    };
}

exports.criarREST = criarREST;
exports.REST = criarREST();
