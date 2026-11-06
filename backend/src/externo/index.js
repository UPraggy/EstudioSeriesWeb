// Gerado fora do Estúdio: ver o pedido/prompt sem gastar e anexar o resultado de outra plataforma (custo 0).
const anexos = require('./anexos');
const showrunner = require('./showrunner');
const { verPedido } = require('../openrouter/pedidoVisivel');

module.exports = { ...anexos, ...showrunner, verPedido };
