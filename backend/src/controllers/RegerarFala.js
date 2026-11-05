// POST /RegerarFala { serie, ep, id, intencao?, tom?, velocidade?, volume?, texto?, textoFalado? }
// Regera só aquela fala (mesma voz) pelo módulo de áudio; a faixa se ajusta (falas seguintes do plano andam junto)
// e a legenda acompanha. TTS grátis: não passa por cotação.
const { responder, exigir } = require('../edicao/http');
const trecho = require('../edicao/trecho');

exports.REST = responder(async (d) => {
    exigir(d, 'serie', 'ep', 'id');
    return trecho.regerarFala({
        serie: d.serie, ep: d.ep, id: d.id, intencao: d.intencao, tom: d.tom, velocidade: d.velocidade, volume: d.volume,
        texto: d.texto, textoFalado: d.textoFalado,
    });
});
