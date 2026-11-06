// POST /RestaurarVersaoRoteiro { serie, ep, versao } — volta o episódio para uma versão guardada do roteiro.
// ANTES guarda a versão atual (roteiro, falas, áudio, edição, legendas, montagem e a memória que veio dela) numa
// pasta nova de episodios/epNN/_versoes/: nada é sobrescrito sem guardar. Depois devolve os arquivos e a memória da
// versão escolhida. Takes/quadros pagos não mudam. Recusa (409) com geração paga, regeração ou montagem rodando.
// Resposta: { ok: true, restaurada, guardada, trazidos, guardados, preservados, episodio, memoria, avisos } ou { Error }.
const lixeira = require('../series/lixeira');
const { entrada, responderErro } = require('../series/http');

exports.REST = async (req, res) => {
    try {
        const d = entrada(req);
        const ep = d.ep ?? d.n;
        if (!d.serie) return res.status(400).json({ Error: 'Informe a série (campo "serie").' });
        if (ep === undefined || ep === null || ep === '') return res.status(400).json({ Error: 'Informe o episódio (campo "ep").' });
        if (!d.versao) return res.status(400).json({ Error: 'Informe a versão (campo "versao", o nome da pasta em _versoes).' });
        return res.json(await lixeira.restaurarVersaoRoteiro(d.serie, ep, d.versao));
    } catch (error) {
        return responderErro(res, error);
    }
};
