// POST /SalvarModelos { serie, modelos: { texto?, imagem?, videoRascunho?, videoFinal?, apresentador? } }
// Troca os modelos da série (serie.json → modelos). Cada id é conferido no catálogo do OpenRouter do tipo do papel.
// Não gasta nada; as próximas gerações usam o modelo novo (as cotações mostram o preço novo antes de pagar).
const armazem = require('../series/armazem');
const { validarModelos } = require('../openrouter/modelos');
const { entrada, responderErro } = require('../series/http');

exports.REST = async (req, res) => {
    try {
        const { serie, modelos: pedido } = entrada(req);
        if (!serie) return res.status(400).json({ Error: 'Informe a série (campo "serie").' });
        await armazem.exigirSerie(serie);
        const { modelos, avisos } = await validarModelos(pedido);
        let antes = {};
        const s = await armazem.atualizarSerie(serie, (x) => {
            antes = { ...(x.modelos || {}) };
            x.modelos = { ...(x.modelos || {}), ...modelos };
            return x;
        });
        const mudou = Object.keys(modelos).filter((k) => antes[k] !== modelos[k]).map((k) => ({ papel: k, de: antes[k] || null, para: modelos[k] }));
        console.log(`[modelos] ${serie}: ${mudou.map((m) => `${m.papel} ${m.de} → ${m.para}`).join('; ') || 'sem mudança'}`);
        return res.json({ ok: true, modelos: s.modelos, mudou, avisos });
    } catch (error) {
        if (error.name === 'ErroValidacao' && !error.status) error.status = 400;
        return responderErro(res, error);
    }
};
