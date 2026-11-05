// GET /LerEdicao?serie=&ep=  — edição do episódio (ou null) + contexto da Mesa: série, roteiro, acervo (clipes,
// elenco, locais, objetos), takes e regerações (mesa.json), histórico (desfazer/refazer) e as fontes da prévia.
const { responder, exigir } = require('../edicao/http');
const E = require('../edicao/edicao');
const trecho = require('../edicao/trecho');
const render = require('../edicao/render');

exports.REST = responder(async (d) => {
    exigir(d, 'serie', 'ep');
    const contexto = await E.contextoMesa(d.serie, d.ep);
    const st = await trecho.statusRegeracoes(d.serie, d.ep); // retoma regerações que ficaram no meio
    return {
        edicao: await E.lerEdicao(d.serie, d.ep),
        historico: await E.historico(d.serie, d.ep),
        ...contexto,
        mesa: { regeracoes: st.regeracoes, takes: st.takes },
        fontes: await render.fontesDaSerie(d.serie).catch(() => []),
        render: await render.statusRender(d.serie, d.ep).catch(() => ({ status: 'nenhum' })),
    };
});
