// POST /RefazerRoteiro { serie, ep, duracaoAlvoS?, semEscolha?, apagarDerivados = true } — refaz o roteiro do zero.
// Guarda roteiro.json (e, com apagarDerivados, falas, áudio das falas, edição, legendas e montagem) em
// episodios/epNN/_versoes/<AAAA-MM-DD_HHmmss>/ e volta o episódio para "roteiro" (pode trocar a duração e o
// "sem votação"). Takes de vídeo/imagem pagos (takes/, quadros/, planos.json, mesa.json) NUNCA saem do lugar.
// Recusa (409) com geração paga em andamento ou montagem rodando. Não chama a IA: o roteiro novo sai pelo
// ShowrunnerEtapa (com a confirmação de custo da tela).
// Resposta: { ok: true, versao, movidos, preservados, episodio, avisos } ou { Error }.
const lixeira = require('../series/lixeira');
const { entrada, responderErro } = require('../series/http');

exports.REST = async (req, res) => {
    try {
        const d = entrada(req);
        const ep = d.ep ?? d.n;
        if (!d.serie) return res.status(400).json({ Error: 'Informe a série (campo "serie").' });
        if (ep === undefined || ep === null || ep === '') return res.status(400).json({ Error: 'Informe o episódio (campo "ep").' });
        const { duracaoAlvoS, semEscolha, apagarDerivados } = d;
        return res.json(await lixeira.refazerRoteiro(d.serie, ep, { duracaoAlvoS, semEscolha, apagarDerivados }));
    } catch (error) {
        return responderErro(res, error);
    }
};
