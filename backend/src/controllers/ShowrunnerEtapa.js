// POST /ShowrunnerEtapa — executa uma etapa do showrunner (ideias | biblia | roteiro | decupagem | atualizarMundo).
// Não grava o roteiro: devolve a PROPOSTA (com erros, avisos e consertos) para o Rafael aprovar.
// Corpo: { etapa, serieId?, contexto: {...}, modelo?, maxTentativas?, tetoUsd? }
// Roteiro: contexto.instrucoes (observações), contexto.roteiroBase + contexto.ajustes (revisão), contexto.baseVersao.
// Com serieId, a proposta de roteiro entra no histórico do episódio e a resposta traz `historico` ({ id, versao, ... }).
// Com serieId, a memória da série entra sozinha (montarContexto). Caminho de pasta só vem do serieId.
const { executarEtapa, exigirChamarLLM } = require('../showrunner');
const { caminhoSerie } = require('../memoria');
const notas = require('../series/notas');

// Toda proposta de roteiro (paga) entra no histórico do episódio (episodios/epNN/notas.json): ver, comparar e
// "Usar esta" na tela. Falhar aqui nunca derruba a resposta: vira aviso.
async function guardarNoHistorico(serieId, ctx, r) {
    if (!r || (!r.resultado && !(Number(r.custoUsd) > 0))) return;
    const revisao = Boolean(typeof ctx.ajustes === 'string' && ctx.ajustes.trim());
    try {
        r.historico = await notas.registrarProposta(serieId, ctx.ep, {
            tipo: revisao ? 'ajuste' : 'escrever',
            base: ctx.roteiroBase ? 'proposta' : 'salvo',
            baseVersao: Number.isInteger(ctx.baseVersao) ? ctx.baseVersao : undefined,
            observacoes: typeof ctx.instrucoes === 'string' ? ctx.instrucoes : '',
            ajustes: revisao ? ctx.ajustes.trim() : '',
            duracaoAlvoS: ctx.duracaoAlvoS ?? (r.resultado && r.resultado.duracaoAlvoS),
            semEscolha: ctx.semEscolha,
            custoUsd: r.custoUsd, modelo: r.modelo, ok: r.ok, erros: r.erros, resultado: r.resultado,
        });
    } catch (e) {
        r.avisos = [...(r.avisos || []), `Não guardei esta proposta no histórico do episódio: ${e.message}`];
    }
}

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
            if (etapa === 'roteiro' && serieId) await guardarNoHistorico(serieId, ctx, r);
            return res.json(r);
        } catch (error) {
            console.error('Error:', error.message);
            res.status(500).json({ Error: error.message });
        }
    };
}

exports.criarREST = criarREST;
exports.REST = criarREST();
