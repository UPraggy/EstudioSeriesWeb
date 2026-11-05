// POST /ExtrairQuadro { serie, caminho, tS, largura? } — quadro do arquivo no tempo tS (png em <série>/.cache/quadros).
const { responder, exigir } = require('../edicao/http');
const midia = require('../edicao/midia');

exports.REST = responder(async (d) => {
    exigir(d, 'serie', 'caminho');
    return midia.extrairQuadro({ serie: d.serie, caminho: d.caminho, tS: Number(d.tS) || 0, largura: d.largura ? Number(d.largura) : null });
});
