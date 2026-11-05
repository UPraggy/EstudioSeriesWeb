// POST /MemoriaConsolidar — depois da votação real, propõe a atualização da memória do episódio.
// 1ª chamada (aprovar ausente): gera a proposta e guarda em memoria/propostas/epNN.json (não é canônica).
// 2ª chamada { aprovar: true }: grava a proposta guardada (ou a `proposta` editada que vier no corpo).
// Corpo: { serieId, ep, aprovar?, proposta?, usarLLM?, modelo? }
const { consolidarEpisodio, caminhoSerie, lerProposta } = require('../memoria');
const { exigirChamarLLM } = require('../showrunner');

function criarREST({ chamarLLM } = {}) {
    return async (req, res) => {
        try {
            const { serieId, ep, aprovar, proposta, usarLLM, modelo } = req.body || {};
            if (!serieId || ep == null) return res.status(400).json({ Error: 'Informe "serieId" e "ep".' });
            const pasta = caminhoSerie(serieId);
            if (aprovar === true) {
                const p = proposta || lerProposta(pasta, ep);
                if (!p) return res.status(400).json({ Error: 'Não há proposta para aprovar: gere a proposta antes.' });
                return res.json(await consolidarEpisodio(pasta, ep, { aprovar: true, proposta: p }));
            }
            const r = await consolidarEpisodio(pasta, ep, {
                chamarLLM: usarLLM ? (chamarLLM || exigirChamarLLM({ serie: serieId, ep, etapa: 'memoria:consolidar' })) : undefined, modelo,
            });
            return res.json(r);
        } catch (error) {
            console.error('Error:', error.message);
            res.status(500).json({ Error: error.message });
        }
    };
}

exports.criarREST = criarREST;
exports.REST = criarREST();
