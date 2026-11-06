// POST /SalvarDecupagem { serie, ep, decupagem: { planos: [...] } } — grava o planos.json aprovado (o resultado da
// etapa "decupagem" do showrunner ou colado de fora), sem perder takes já feitos, e leva prompt/modelo/âncoras para a
// edição (os tempos não mudam). → { ok, planos, avisos, edicao?, historico? } · 400 com "erros" se não passar.
const { responder, exigir } = require('../edicao/http');
const { salvarDecupagem } = require('../edicao/producao');

exports.REST = responder(async (d) => {
    exigir(d, 'serie', 'ep', 'decupagem');
    return salvarDecupagem({ serie: d.serie, ep: d.ep, decupagem: d.decupagem });
});
