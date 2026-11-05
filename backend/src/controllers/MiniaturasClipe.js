// GET /MiniaturasClipe?serie=&caminho=&n=&altura= — tira de quadros do clipe (jpg em <série>/.cache/miniaturas).
// A imagem sai pela rota /Midia com o "arquivo" devolvido.
const { responder, exigir } = require('../edicao/http');
const midia = require('../edicao/midia');

exports.REST = responder(async (d) => {
    exigir(d, 'serie', 'caminho');
    return midia.miniaturas({ serie: d.serie, caminho: d.caminho, n: d.n, altura: d.altura });
});
