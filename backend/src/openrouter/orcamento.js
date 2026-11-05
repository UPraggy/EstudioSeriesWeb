// Orçamento (tetos por plano/episódio/série) e CONFIRMAÇÃO EM DOIS PASSOS:
// cotar(pedido) → { custoPrevistoUsd, token }; executar(pedido, token, rodar) só roda se o token for deste pedido.
// É assim que a interface garante "nada pago sem clique".
const crypto = require('crypto');
const { ErroOrcamento, ErroConfirmacao } = require('./erros');
const util = require('./util');

const EPS = 1e-9;
const fmt = util.formatarUsd;

function numeroOuNulo(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

/**
 * verificar(previstoUsd, { tetos: { plano, episodio, serie }, livro, ep, pendentes: { episodioUsd, serieUsd } })
 * livro = { registrar(linha), async total({ ep }) } (interface combinada com o núcleo de séries).
 * `pendentes` = custo previsto de jobs ainda em andamento (ainda não estão no livro).
 * Lança ErroOrcamento com mensagem clara; devolve o resumo quando cabe.
 */
async function verificar(previstoUsd, { tetos = {}, livro = null, ep = null, pendentes = {} } = {}) {
    const p = Number(previstoUsd);
    if (!Number.isFinite(p) || p < 0) throw new ErroOrcamento(`Custo previsto inválido: ${previstoUsd}`);
    const tetoPlano = numeroOuNulo(tetos.plano);
    const tetoEp = numeroOuNulo(tetos.episodio);
    const tetoSerie = numeroOuNulo(tetos.serie);
    const resumo = { ok: true, previstoUsd: util.arredondarUsd(p), tetos: { plano: tetoPlano, episodio: tetoEp, serie: tetoSerie } };

    if (tetoPlano !== null && p > tetoPlano + EPS) {
        throw new ErroOrcamento(`Custo previsto ${fmt(p)} passa do teto por plano (${fmt(tetoPlano)}).`, { limite: 'plano', previstoUsd: p, tetoUsd: tetoPlano });
    }
    const precisaLivro = (tetoEp !== null && ep !== null && ep !== undefined) || tetoSerie !== null;
    if (precisaLivro && (!livro || typeof livro.total !== 'function')) {
        throw new ErroOrcamento('Sem o livro de custos (custos.jsonl) não dá para conferir o teto do episódio/série.', { limite: 'livro' });
    }

    if (tetoEp !== null && ep !== null && ep !== undefined) {
        const gasto = (Number(await livro.total({ ep })) || 0) + (Number(pendentes.episodioUsd) || 0);
        resumo.gastoEpisodioUsd = util.arredondarUsd(gasto);
        resumo.sobraEpisodioUsd = util.arredondarUsd(Math.max(0, tetoEp - gasto - p));
        if (gasto + p > tetoEp + EPS) {
            throw new ErroOrcamento(
                `Episódio ${ep}: já gasto/reservado ${fmt(gasto)} + previsto ${fmt(p)} = ${fmt(gasto + p)}, passa do teto do episódio (${fmt(tetoEp)}). Sobra ${fmt(Math.max(0, tetoEp - gasto))}.`,
                { limite: 'episodio', previstoUsd: p, gastoUsd: gasto, tetoUsd: tetoEp },
            );
        }
    }
    if (tetoSerie !== null) {
        const gasto = (Number(await livro.total({})) || 0) + (Number(pendentes.serieUsd) || 0);
        resumo.gastoSerieUsd = util.arredondarUsd(gasto);
        resumo.sobraSerieUsd = util.arredondarUsd(Math.max(0, tetoSerie - gasto - p));
        if (gasto + p > tetoSerie + EPS) {
            throw new ErroOrcamento(
                `Série: já gasto/reservado ${fmt(gasto)} + previsto ${fmt(p)} = ${fmt(gasto + p)}, passa do teto da série (${fmt(tetoSerie)}). Sobra ${fmt(Math.max(0, tetoSerie - gasto))}.`,
                { limite: 'serie', previstoUsd: p, gastoUsd: gasto, tetoUsd: tetoSerie },
            );
        }
    }
    return resumo;
}

// ---------- confirmação em dois passos ----------
const b64url = (buf) => Buffer.from(buf).toString('base64url');

/**
 * criarConfirmador({ segredo, validadeMs = 10 min, agora })
 *  - cotar(pedido, estimar) → { ...estimativa, custoPrevistoUsd, token, expiraEm, pedidoHash }
 *  - conferir(pedido, token) → dados do token (lança ErroConfirmacao)
 *  - executar(pedido, token, rodar) → rodar(pedido, { custoPrevistoUsd, pedidoHash }); token de uso único.
 * O segredo fica só em memória: reiniciar o servidor invalida as confirmações abertas.
 */
function criarConfirmador({ segredo = crypto.randomBytes(32), validadeMs = 10 * 60 * 1000, agora = Date.now } = {}) {
    const usados = new Map(); // nonce → expira

    const assinar = (corpo) => crypto.createHmac('sha256', segredo).update(corpo).digest();
    const hashPedido = (pedido) => util.hashCanonico(pedido);

    function limparUsados() {
        const t = agora();
        for (const [n, exp] of usados) if (exp < t) usados.delete(n);
    }

    async function cotar(pedido, estimar) {
        if (typeof estimar !== 'function') throw new TypeError('cotar(pedido, estimar): estimar precisa ser uma função');
        const estimativa = await estimar(pedido);
        const custo = Number(estimativa && estimativa.custoPrevistoUsd);
        if (!Number.isFinite(custo) || custo < 0) throw new ErroConfirmacao('Não consegui prever o custo deste pedido.');
        const dados = { h: hashPedido(pedido), c: util.arredondarUsd(custo), e: agora() + validadeMs, n: crypto.randomBytes(9).toString('hex') };
        const corpo = b64url(JSON.stringify(dados));
        const token = `${corpo}.${b64url(assinar(corpo))}`;
        return { ...estimativa, custoPrevistoUsd: dados.c, token, expiraEm: new Date(dados.e).toISOString(), pedidoHash: dados.h };
    }

    function conferir(pedido, token) {
        const invalido = () => new ErroConfirmacao('Confirmação inválida: cote o custo de novo antes de gerar.', { motivo: 'invalido' });
        if (typeof token !== 'string' || !token.includes('.')) throw invalido();
        const [corpo, assinatura] = token.split('.');
        const esperado = assinar(corpo);
        let recebido;
        try {
            recebido = Buffer.from(assinatura, 'base64url');
        } catch {
            throw invalido();
        }
        if (recebido.length !== esperado.length || !crypto.timingSafeEqual(recebido, esperado)) throw invalido();
        let dados;
        try {
            dados = JSON.parse(Buffer.from(corpo, 'base64url').toString('utf8'));
        } catch {
            throw invalido();
        }
        if (!(dados.e > agora())) {
            throw new ErroConfirmacao('A confirmação expirou (vale 10 min). Cote de novo.', { motivo: 'expirado' });
        }
        if (dados.h !== hashPedido(pedido)) {
            throw new ErroConfirmacao('Esta confirmação é de outro pedido. Cote este pedido antes de gerar.', { motivo: 'outro_pedido' });
        }
        if (usados.has(dados.n)) {
            throw new ErroConfirmacao('Esta confirmação já foi usada. Cote de novo para gerar outra vez.', { motivo: 'usado' });
        }
        return { pedidoHash: dados.h, custoPrevistoUsd: dados.c, expira: dados.e, nonce: dados.n };
    }

    async function executar(pedido, token, rodar) {
        const ok = conferir(pedido, token);
        limparUsados();
        usados.set(ok.nonce, ok.expira); // queima antes de rodar: clique duplo não paga 2x
        return rodar(pedido, { custoPrevistoUsd: ok.custoPrevistoUsd, pedidoHash: ok.pedidoHash });
    }

    return { cotar, conferir, executar, hashPedido };
}

// Confirmador único do processo (usado pelos controllers).
const padrao = criarConfirmador();

module.exports = {
    verificar,
    criarConfirmador,
    cotar: (pedido, estimar) => padrao.cotar(pedido, estimar),
    conferir: (pedido, token) => padrao.conferir(pedido, token),
    executar: (pedido, token, rodar) => padrao.executar(pedido, token, rodar),
    hashPedido: (pedido) => padrao.hashPedido(pedido),
    ErroOrcamento,
    ErroConfirmacao,
};
