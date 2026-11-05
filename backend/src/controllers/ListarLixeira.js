// GET /ListarLixeira — o que está na lixeira do Estúdio (<ESTUDIO_DADOS>/_lixeira), do mais novo ao mais velho.
// Resposta: { itens: [ { item, tipo: serie|episodio, serie, titulo, tituloSerie, ep, apagadoEm, arquivos, tamanhoMb, gastoUsd, origem } ] }.
const lixeira = require('../series/lixeira');
const { responderErro } = require('../series/http');

exports.REST = async (req, res) => {
    try {
        return res.json({ itens: await lixeira.listarLixeira() });
    } catch (error) {
        return responderErro(res, error);
    }
};
