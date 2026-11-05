// Ponte para o cliente REAL do OpenRouter (backend/src/openrouter, feito em outro módulo).
// O showrunner e a memória nunca chamam a rede sozinhos: recebem `chamarLLM` injetado.
// Assinatura usada aqui: async (mensagens, { modelo, maxTokens, json: true }) => ({ conteudo, custoUsd })
// - se o módulo exportar `chamarLLM`, usa direto;
// - senão, adapta `completarJSON` + `obterContexto` (que já aplicam teto, livro de custos e modo simulado).
function carregarModulo() {
    try {
        return require('../openrouter');
    } catch (e) {
        if (e.code === 'MODULE_NOT_FOUND' && /openrouter/.test(String(e.message).split('\n')[0])) return null;
        throw e;
    }
}

/**
 * @param op { serie (id da série, para o teto e o custos.jsonl), ep, etapa }
 * @returns função chamarLLM ou null se o cliente não estiver disponível
 */
function obterChamarLLM(op = {}) {
    const mod = carregarModulo();
    if (!mod) return null;
    if (typeof mod.chamarLLM === 'function') return mod.chamarLLM;
    if (typeof mod.completarJSON === 'function' && typeof mod.obterContexto === 'function') {
        return async (mensagens, { modelo, maxTokens } = {}) => {
            const ctx = await mod.obterContexto({ serie: op.serie || null });
            const r = await mod.completarJSON({
                modelo, mensagens, maxTokens, ep: op.ep ?? null, etapa: op.etapa || 'showrunner',
            }, ctx);
            return { conteudo: r.dados, custoUsd: r.custoUsd ?? r.previstoUsd ?? 0 };
        };
    }
    return null;
}

function exigirChamarLLM(op = {}) {
    const f = obterChamarLLM(op);
    if (!f) throw new Error('O cliente do OpenRouter (backend/src/openrouter) não está disponível (sem chamarLLM nem completarJSON).');
    return f;
}

module.exports = { obterChamarLLM, exigirChamarLLM };
