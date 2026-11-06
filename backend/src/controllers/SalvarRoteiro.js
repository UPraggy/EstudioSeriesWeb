// POST /SalvarRoteiro { serie, n, roteiro, guardarAnterior?, apagarDerivados? } — valida (duração, planos 2–10 s,
// falas, A ≠ B...) e só então grava. Inválido → 400 com { Error, erros, avisos }. Cria o episódio se ainda não existir.
// guardarAnterior: true (salvar um roteiro AJUSTADO por cima do salvo): confere o novo antes; se passar, o roteiro
// atual (e, com apagarDerivados = true, falas, áudio, edição, legendas e montagem) vai para episodios/epNN/_versoes/
// pelo mesmo caminho do "Refazer roteiro" (tipo "antesDeAjuste", voltável em "Versões do roteiro"); depois grava o novo.
// Resposta: { roteiro, avisos, versaoGuardada? } ou { Error }.
const episodios = require('../series/episodios');
const lixeira = require('../series/lixeira');
const { entrada, responderErro } = require('../series/http');

const sim = (v) => v === true || v === 'true' || v === '1' || v === 1;

exports.REST = async (req, res) => {
    try {
        const { serie, n, roteiro, guardarAnterior, apagarDerivados } = entrada(req);
        if (!roteiro || typeof roteiro !== 'object') return res.status(400).json({ Error: 'Envie o roteiro (campo "roteiro").' });
        const num = n !== undefined ? n : roteiro.n;
        let guardada = null;
        if (sim(guardarAnterior) && await episodios.lerRoteiro(serie, num).catch(() => null)) {
            await episodios.conferirRoteiro(serie, num, roteiro); // nada sai do lugar se o novo não passa
            guardada = await lixeira.refazerRoteiro(serie, num, {
                apagarDerivados: apagarDerivados === undefined ? true : sim(apagarDerivados),
                tipo: 'antesDeAjuste',
            });
        }
        const r = await episodios.salvarRoteiro(serie, num, roteiro);
        if (guardada) {
            r.versaoGuardada = guardada.versao;
            r.avisos = [...(r.avisos || []), ...(guardada.avisos || [])];
        }
        return res.json(r);
    } catch (error) {
        return responderErro(res, error);
    }
};
