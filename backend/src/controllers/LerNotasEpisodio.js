// GET|POST /LerNotasEpisodio { serie, ep } — observações do roteiro e histórico de propostas do episódio
// (episodios/epNN/notas.json; vazio se ainda não existe). `resumido=1` tira o roteiro de cada proposta.
// Resposta: { notas: { ep, versao, observacoes, observacoesEm, historico: [...] } } ou { Error }.
const notas = require('../series/notas');
const { entrada, responderErro } = require('../series/http');

exports.REST = async (req, res) => {
    try {
        const d = entrada(req);
        const ep = d.ep ?? d.n;
        if (!d.serie) return res.status(400).json({ Error: 'Informe a série (campo "serie").' });
        if (ep === undefined || ep === null || ep === '') return res.status(400).json({ Error: 'Informe o episódio (campo "ep").' });
        const lidas = await notas.lerNotas(d.serie, ep);
        if (d.resumido === true || d.resumido === '1' || d.resumido === 'true') {
            lidas.historico = lidas.historico.map(({ resultado, ...h }) => ({ ...h, temRoteiro: Boolean(resultado && Array.isArray(resultado.planos)) }));
        }
        return res.json({ notas: lidas });
    } catch (error) {
        return responderErro(res, error);
    }
};
