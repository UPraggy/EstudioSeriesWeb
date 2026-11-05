// GET /OndaAudio?serie=&caminho= — forma de onda: picos 0–1 a cada 1/100 s (wav, mp3 ou o som de um mp4).
const { responder, exigir } = require('../edicao/http');
const midia = require('../edicao/midia');

exports.REST = responder(async (d) => {
    exigir(d, 'serie', 'caminho');
    return midia.onda({ serie: d.serie, caminho: d.caminho });
});
