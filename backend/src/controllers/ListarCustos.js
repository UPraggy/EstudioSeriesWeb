// GET /ListarCustos[?serie=<id>] — lançamentos do custos.jsonl da série (ou da geração simples, sem "serie"),
// do mais recente para o mais antigo, com totais por etapa e por episódio. Só leitura.
const path = require('path');
const armazem = require('../series/armazem');
const { criarLivroCustos } = require('../series/custos');
const { entrada, responderErro } = require('../series/http');

const ehNumero = (v) => typeof v === 'number' && Number.isFinite(v);
const arredondar = (v) => Math.round(v * 1e6) / 1e6;

// Mesmo critério do livro: vale o real; sem real, o previsto.
function valorDa(linha) {
    if (ehNumero(linha.realUsd)) return linha.realUsd;
    if (ehNumero(linha.previstoUsd)) return linha.previstoUsd;
    return 0;
}

exports.REST = async (req, res) => {
    try {
        const { serie } = entrada(req);
        const pasta = serie ? await armazem.exigirSerie(String(serie)) : path.join(armazem.raizDados(), 'geracao-simples');
        const linhas = await criarLivroCustos(pasta).listar();
        let totalUsd = 0;
        const porEtapa = {};
        const porEp = {};
        for (const l of linhas) {
            const v = valorDa(l);
            totalUsd += v;
            const etapa = l.etapa || 'sem etapa';
            porEtapa[etapa] = arredondar((porEtapa[etapa] || 0) + v);
            if (l.ep !== undefined && l.ep !== null && l.ep !== '') {
                const ep = String(l.ep);
                porEp[ep] = arredondar((porEp[ep] || 0) + v);
            }
        }
        return res.json({
            origem: serie ? String(serie) : 'geracao-simples',
            linhas: linhas.slice().reverse().slice(0, 500),
            quantidade: linhas.length,
            totalUsd: arredondar(totalUsd),
            porEtapa,
            porEp,
        });
    } catch (error) {
        return responderErro(res, error);
    }
};
