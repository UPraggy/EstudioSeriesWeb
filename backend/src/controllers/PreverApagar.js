// GET|POST /PreverApagar { serie, ep?, acao? } — SÓ LEITURA: o que acontece antes de apagar ou refazer, para a tela
// ser honesta (episódios, takes, takes pagos, gasto registrado, tamanho) e o que impede agora (bloqueios).
//   acao "serie" (padrão sem ep) · "episodio" (padrão com ep) · "roteiro" (refazer o roteiro do zero; apagarDerivados?)
// Resposta: { acao, serie, ..., bloqueios: [], avisos: [] } ou { Error }.
const lixeira = require('../series/lixeira');
const { entrada, responderErro } = require('../series/http');

exports.REST = async (req, res) => {
    try {
        const d = entrada(req);
        const ep = d.ep ?? d.n;
        const temEp = !(ep === undefined || ep === null || ep === '');
        const acao = d.acao || (temEp ? 'episodio' : 'serie');
        if (!d.serie) return res.status(400).json({ Error: 'Informe a série (campo "serie").' });
        if (acao === 'serie') return res.json(await lixeira.preverApagarSerie(d.serie));
        if (!temEp) return res.status(400).json({ Error: 'Informe o episódio (campo "ep").' });
        if (acao === 'episodio') return res.json(await lixeira.preverApagarEpisodio(d.serie, ep));
        if (acao === 'roteiro') return res.json(await lixeira.preverRefazerRoteiro(d.serie, ep, { apagarDerivados: d.apagarDerivados }));
        return res.status(400).json({ Error: 'Ação inválida: use "serie", "episodio" ou "roteiro".' });
    } catch (error) {
        return responderErro(res, error);
    }
};
