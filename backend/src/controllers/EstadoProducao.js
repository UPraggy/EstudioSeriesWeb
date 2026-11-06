// GET|POST /EstadoProducao { serie, ep } — só leitura, grátis: o estado REAL de cada etapa do episódio (roteiro,
// falas e vozes, decupagem, quadros-chave, vídeo de cada plano, montagem, votação). A Sala e a Mesa calculam o
// "Próximo passo" com isto (frontend: sala/serieUtil.js → etapasProducao).
const { responder, exigir } = require('../edicao/http');
const { estadoProducao } = require('../edicao/producao');

exports.REST = responder(async (d) => {
    exigir(d, 'serie', 'ep');
    return estadoProducao(d.serie, d.ep);
});
