// POST /SalvarIdeiaSerie { serie, ideia } — troca a ideia da série (o texto livre que o showrunner usa para a bíblia).
// Até 20 000 caracteres (cabe um prompt inteiro). Não gasta nada.
const armazem = require('../series/armazem');
const { entrada, responderErro } = require('../series/http');

const MAX = 20000;

exports.REST = async (req, res) => {
    try {
        const { serie, ideia } = entrada(req);
        if (!serie) return res.status(400).json({ Error: 'Informe a série (campo "serie").' });
        const texto = String(ideia ?? '').trim();
        if (!texto) return res.status(400).json({ Error: 'A ideia não pode ficar vazia.' });
        if (texto.length > MAX) return res.status(400).json({ Error: `A ideia passou de ${MAX} caracteres (${texto.length}).` });
        const s = await armazem.atualizarSerie(serie, (x) => { x.ideia = texto; return x; });
        console.log(`[serie] ${serie}: ideia atualizada (${texto.length} caracteres)`);
        return res.json({ ok: true, ideia: s.ideia });
    } catch (error) {
        return responderErro(res, error);
    }
};
