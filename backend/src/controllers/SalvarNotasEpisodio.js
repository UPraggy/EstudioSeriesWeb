// POST /SalvarNotasEpisodio { serie, ep, observacoes } — grava as observações do roteiro do episódio
// (o que quer na história, tom, o que evitar). Entram como contexto.instrucoes em todo pedido de roteiro.
// Texto vazio limpa. Não chama a IA. Resposta: { ok: true, notas } ou { Error }.
const notas = require('../series/notas');
const { entrada, responderErro } = require('../series/http');

exports.REST = async (req, res) => {
    try {
        const d = entrada(req);
        const ep = d.ep ?? d.n;
        if (!d.serie) return res.status(400).json({ Error: 'Informe a série (campo "serie").' });
        if (ep === undefined || ep === null || ep === '') return res.status(400).json({ Error: 'Informe o episódio (campo "ep").' });
        if (d.observacoes === undefined) return res.status(400).json({ Error: 'Envie as observações (campo "observacoes").' });
        return res.json({ ok: true, notas: await notas.salvarObservacoes(d.serie, ep, d.observacoes) });
    } catch (error) {
        return responderErro(res, error);
    }
};
