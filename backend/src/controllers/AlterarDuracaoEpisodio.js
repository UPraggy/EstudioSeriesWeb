// POST /AlterarDuracaoEpisodio { serie, ep, duracaoAlvoS, semEscolha? } — troca a duração-alvo de um episódio criado
// (serie.json → episodios[].duracaoAlvoS, 1 a 600 s). Grátis e não mexe no roteiro: a tela oferece em seguida
// "Ajustar o roteiro para N s" (revisão do ShowrunnerEtapa com a duração nova) ou "Refazer roteiro do zero".
// Resposta: { ok, episodio, antes: { duracaoAlvoS, semEscolha }, roteiro: { duracaoAlvoS, duracaoPlanosS, planos, aprovado } | null,
//             precisaAjustar, avisos } ou { Error }.
const episodios = require('../series/episodios');
const { entrada, responderErro } = require('../series/http');
const registro = require('../log/registro');

exports.REST = async (req, res) => {
    try {
        const { serie, ep, n, duracaoAlvoS, semEscolha } = entrada(req);
        if (!serie) return res.status(400).json({ Error: 'Informe a série (campo "serie").' });
        const num = ep ?? n;
        if (num === undefined || num === null || num === '') return res.status(400).json({ Error: 'Informe o episódio (campo "ep").' });
        const sem = semEscolha === undefined || semEscolha === null || semEscolha === '' ? undefined : semEscolha === true || semEscolha === 'true';
        const r = await episodios.alterarDuracao(serie, String(num).replace(/^ep/i, ''), { duracaoAlvoS, semEscolha: sem });
        registro.registrar({
            area: 'serie', evento: 'duracao-episodio', serie, ep: r.episodio.n,
            msg: `Duração do Ep. ${r.episodio.n}: ${r.antes.duracaoAlvoS} s → ${r.episodio.duracaoAlvoS} s${r.precisaAjustar ? ' (roteiro a ajustar)' : ''}`,
            dados: { antes: r.antes, depois: { duracaoAlvoS: r.episodio.duracaoAlvoS, semEscolha: r.episodio.semEscolha }, precisaAjustar: r.precisaAjustar },
        });
        return res.json({ ok: true, ...r });
    } catch (error) {
        return responderErro(res, error);
    }
};
