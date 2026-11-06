// GET /ListarVersoesRoteiro { serie, ep } — SÓ LEITURA: as versões guardadas do roteiro do episódio
// (episodios/epNN/_versoes/<data>/), da mais nova para a mais velha, com título, duração, o que cada uma tem
// (roteiro, falas, áudio, edição, legendas, montagem) e a memória guardada junto. Traz também o que impede voltar
// agora (bloqueios), para a tela desligar o botão.
// Resposta: { serie, episodio, versoes: [...], pasta, bloqueios: [], avisos: [] } ou { Error }.
const lixeira = require('../series/lixeira');
const { entrada, responderErro } = require('../series/http');

exports.REST = async (req, res) => {
    try {
        const d = entrada(req);
        const ep = d.ep ?? d.n;
        if (!d.serie) return res.status(400).json({ Error: 'Informe a série (campo "serie").' });
        if (ep === undefined || ep === null || ep === '') return res.status(400).json({ Error: 'Informe o episódio (campo "ep").' });
        return res.json(await lixeira.listarVersoesRoteiro(d.serie, ep));
    } catch (error) {
        return responderErro(res, error);
    }
};
