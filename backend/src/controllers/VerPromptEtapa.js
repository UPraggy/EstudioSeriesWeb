// POST /VerPromptEtapa { etapa, serieId?, contexto?, modelo? } — o prompt EXATO de uma etapa do showrunner
// (ideias | biblia | roteiro | decupagem | atualizarMundo) sem chamar a IA: { sistema, usuario, promptCompleto,
// modelo, maxTokens, formato, mensagens }. Mesmo "contexto" do ShowrunnerEtapa. Custo 0.
const externo = require('../externo');
const { entrada, responderErro } = require('../series/http');

exports.REST = async (req, res) => {
    try {
        const { etapa, serieId, contexto, modelo } = entrada(req);
        return res.json(await externo.verPromptEtapa({ etapa, serieId, contexto: contexto || {}, modelo }));
    } catch (error) {
        return responderErro(res, error);
    }
};
