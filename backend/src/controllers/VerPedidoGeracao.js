// POST /VerPedidoGeracao { tipo: 'imagem'|'video', serie, pedido } — monta o pedido que IRIA para o OpenRouter
// (prompt, modelo, proporção/resolução/duração, quadros e referências) SEM cotar nem gastar. As imagens aparecem
// pelo caminho (relativo à série) para ver e baixar na tela. Mesmo "pedido" do CotarGeracao.
const armazem = require('../series/armazem');
const { verPedido } = require('../externo');
const { entrada, responderErro } = require('../series/http');

exports.REST = async (req, res) => {
    try {
        const { tipo, serie, pedido } = entrada(req);
        if (!serie) return res.status(400).json({ Error: 'Informe a série (campo "serie").' });
        const base = await armazem.exigirSerie(serie);
        return res.json(verPedido({ tipo: tipo || 'video', pedido, base }));
    } catch (error) {
        if (error && error.name === 'ErroValidacao' && !error.status) error.status = 400;
        return responderErro(res, error);
    }
};
