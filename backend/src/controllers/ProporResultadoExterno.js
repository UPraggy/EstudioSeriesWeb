// POST /ProporResultadoExterno { etapa, serieId?, contexto?, texto } — a resposta gerada FORA (JSON ou texto com
// JSON dentro) passa pelo MESMO caminho da etapa (extrairJson, validar/consertar, continuidade), sem custo, e volta
// como uma proposta normal do ShowrunnerEtapa (+ origem: "externo"). O roteiro entra no histórico do episódio
// (notas.json, origem "externo"). Nada é gravado além disso: a bíblia continua no "Aprovar e salvar bíblia".
// Registro: área "showrunner", evento "resultado-externo".
const externo = require('../externo');
const { entrada, responderErro } = require('../series/http');

exports.REST = async (req, res) => {
    try {
        const { etapa, serieId, contexto, texto } = entrada(req);
        return res.json(await externo.proporResultadoExterno({ etapa, serieId, contexto: contexto || {}, texto }));
    } catch (error) {
        return responderErro(res, error);
    }
};
