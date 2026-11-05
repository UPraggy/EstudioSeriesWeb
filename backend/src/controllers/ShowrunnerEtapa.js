// POST /ShowrunnerEtapa — executa uma etapa do showrunner (ideias | biblia | roteiro | decupagem | atualizarMundo).
// Não grava nada: devolve a PROPOSTA (com erros, avisos e consertos) para o Rafael aprovar.
// Corpo: { etapa, serieId?, contexto: {...}, modelo?, maxTentativas?, tetoUsd? }
// Com serieId, a memória da série entra sozinha (montarContexto). Caminho de pasta só vem do serieId.
const { executarEtapa, exigirChamarLLM } = require('../showrunner');
const { caminhoSerie } = require('../memoria');

function criarREST({ chamarLLM } = {}) {
    return async (req, res) => {
        try {
            const { etapa, serieId, contexto = {}, modelo, maxTentativas, tetoUsd } = req.body || {};
            if (!etapa) return res.status(400).json({ Error: 'Informe "etapa".' });
            const ctx = { ...contexto };
            delete ctx.pasta;
            if (ctx.serie && typeof ctx.serie === 'object') ctx.serie = { ...ctx.serie, pasta: undefined };
            if (serieId) ctx.pasta = caminhoSerie(serieId);
            const llm = chamarLLM || exigirChamarLLM({ serie: serieId || null, ep: ctx.ep ?? null, etapa: `showrunner:${etapa}` });
            const r = await executarEtapa(etapa, ctx, { chamarLLM: llm, modelo, maxTentativas, tetoUsd });
            return res.json(r);
        } catch (error) {
            console.error('Error:', error.message);
            res.status(500).json({ Error: error.message });
        }
    };
}

exports.criarREST = criarREST;
exports.REST = criarREST();
