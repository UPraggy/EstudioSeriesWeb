// POST /CotarGeracaoSimples { tipo?: 'video'|'imagem', texto, anexos: [{ tipo, papel, caminho | base64 + nome | texto }],
//                            modelo, duracaoS, proporcao, resolucao, audio }
// Cria <ESTUDIO_DADOS>\geracao-simples\<id>\ (pedido.json + anexos copiados) e devolve { id, custoPrevistoUsd, token }.
const servico = require('../openrouter/servico');
const { limparSegredos } = require('../openrouter/erros');

exports.REST = async (req, res) => {
    try {
        return res.json(await servico.cotarSimples(req.body || {}));
    } catch (error) {
        const msg = limparSegredos(error.message);
        console.error('Error:', msg);
        res.status(500).json({ Error: msg });
    }
};
