// POST /AprovarBiblia { serie, proposta } — grava a bíblia proposta pelo showrunner (etapa "biblia") que o Rafael aprovou.
// proposta = o "resultado" da etapa: { biblia, elenco: [...], locais: [...] }. Valida de novo, grava a bíblia
// (mantendo escolhas/votos que já existam), cria as fichas de elenco e locais que ainda não existem
// (nunca sobrescreve uma ficha) e avança a etapa da série para "roteiro". Não gasta nada.
const armazem = require('../series/armazem');
const fichas = require('../series/fichas');
const V = require('../showrunner/validar');
const { entrada, responderErro } = require('../series/http');

exports.REST = async (req, res) => {
    try {
        const { serie, proposta } = entrada(req);
        if (!serie) return res.status(400).json({ Error: 'Informe a série (campo "serie").' });
        if (!proposta || typeof proposta !== 'object') return res.status(400).json({ Error: 'Envie a proposta da bíblia (campo "proposta").' });
        await armazem.exigirSerie(serie);
        const v = V.validarBiblia(proposta, {});
        if (v.erros.length) return res.status(400).json({ Error: `A proposta tem problemas: ${v.erros.join(' ')}`, erros: v.erros });
        const nova = v.valor.biblia;
        const avisos = [...v.avisos];

        const biblia = await armazem.atualizarBiblia(serie, (b) => {
            const escolhas = Array.isArray(b.escolhas) ? b.escolhas : [];
            return { ...b, ...nova, escolhas };
        });

        const criadas = { elenco: [], locais: [] };
        for (const [tipo, itens] of [['elenco', v.valor.elenco], ['locais', v.valor.locais]]) {
            for (const item of itens || []) {
                if (!item || !(item.nome || item.id)) continue;
                const dados = { id: item.id || undefined, nome: item.nome || item.id, papel: item.papel || '', ancora: item.ancora || '' };
                if (item.ancoraEn) dados.ancoraEn = item.ancoraEn;
                if (tipo === 'elenco' && item.vozSugerida) dados.voz = item.vozSugerida;
                try {
                    const f = await fichas.criarFicha(serie, tipo, dados);
                    criadas[tipo].push(f.id);
                } catch (e) {
                    if (e.status === 409) continue; // já existe: a ficha do Rafael vale mais que a da IA
                    avisos.push(`Não criei a ficha de ${item.nome || item.id} (${tipo}): ${e.message}`);
                }
            }
        }

        const s = await armazem.atualizarSerie(serie, (x) => {
            if (['ideia', 'biblia'].includes(x.etapa)) x.etapa = 'roteiro';
            return x;
        });
        console.log(`[biblia] ${serie}: aprovada (${criadas.elenco.length} fichas de elenco, ${criadas.locais.length} de locais)`);
        return res.json({ ok: true, biblia, criadas, etapa: s.etapa, avisos, consertos: v.consertos });
    } catch (error) {
        return responderErro(res, error);
    }
};
