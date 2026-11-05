// GET|POST /LerSerie { serie } — serie.json, bíblia, fichas (elenco, locais, objetos) e total gasto.
const armazem = require('../series/armazem');
const fichas = require('../series/fichas');
const { criarLivroCustos } = require('../series/custos');
const { entrada, responderErro } = require('../series/http');

exports.REST = async (req, res) => {
    try {
        const dados = entrada(req);
        const id = dados.serie || dados.id;
        if (!id) return res.status(400).json({ Error: 'Informe a série (campo "serie").' });
        const serie = await armazem.lerSerie(id);
        const [biblia, elenco, locais, objetos] = await Promise.all([
            armazem.lerBiblia(id),
            fichas.listarFichas(id, 'elenco'),
            fichas.listarFichas(id, 'locais'),
            fichas.listarFichas(id, 'objetos'),
        ]);
        const gastoUsd = await criarLivroCustos(armazem.pastaSerie(id)).total();
        return res.json({ serie, biblia, elenco, locais, objetos, custos: { gastoUsd } });
    } catch (error) {
        return responderErro(res, error);
    }
};
