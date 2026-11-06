// DO ROTEIRO AO VÍDEO (pedido do Rafael, 06/11/2026: "não ficou claro onde gero o vídeo").
//  - estadoProducao: o estado REAL de cada etapa do episódio (roteiro, falas, decupagem, quadros-chave, vídeos,
//    montagem, votação), lido dos arquivos. Só leitura, grátis. A Sala e a Mesa calculam o "Próximo passo" disto.
//  - salvarDecupagem: grava o planos.json aprovado (sem perder takes já feitos) e leva prompt/modelo/âncoras de cada
//    plano para a edição (os tempos da edição ficam: quem manda neles é a narração).
//  - cotarLoteVideo / gerarLoteVideo: "Gerar vídeo dos N planos" com UMA confirmação. Cada plano vira um pedido do
//    plano INTEIRO (mesmo caminho do "regerar trecho": cotação com token, job gravado antes de pagar, take aparado
//    que entra na edição). Duração pedida = menor aceita pelo modelo ≥ plano; depois apara. O take também entra no
//    planos.json (takes + takeEscolhido), para sobreviver a uma "edição inicial" refeita.
const fs = require('fs');
const path = require('path');
const U = require('./util');
const E = require('./edicao');

const pad2 = (n) => String(n).padStart(2, '0');
const doEpisodio = (epId, rel) => (rel && !String(rel).startsWith('episodios/') ? `episodios/${epId}/${rel}` : rel);
const noEpisodio = (epId, rel) => String(rel || '').replace(new RegExp(`^episodios/${epId}/`), '');

// ---------------------------------------------------------------- estado
function estadoDosVideos(c, edicao, mesa, planosDoc, roteiro) {
    const extras = new Map(((planosDoc && planosDoc.planos) || []).map((p) => [p.n, p]));
    const regs = (mesa && mesa.regeracoes) || [];
    const base = edicao ? E.limitesPlanos(edicao) : ((roteiro && roteiro.planos) || []).map((p) => ({ n: p.n, deS: Number(p.deS), ateS: Number(p.ateS) }));
    const planosEd = new Map(((edicao && edicao.planos) || []).map((p) => [p.n, p]));
    const planosRot = new Map(((roteiro && roteiro.planos) || []).map((p) => [p.n, p]));
    return base.map((l) => {
        const segs = ((edicao && edicao.faixas && edicao.faixas.video) || []).filter((v) => v.plano === l.n && v.arquivo);
        const doTake = segs.find((v) => v.origem === 'take' || v.take);
        const doAcervo = segs.find((v) => v.origem === 'acervo');
        const ex = extras.get(l.n) || {};
        const takeEscolhido = ex.takeEscolhido && (ex.takes || []).find((t) => t.id === ex.takeEscolhido && t.status === 'pronto');
        const meus = regs.filter((r) => r.plano === l.n && r.faixa === 'video');
        const gerando = meus.find((r) => r.status === 'gerando');
        const ultimo = meus.filter((r) => r.status !== 'cotado').at(-1);
        const p = planosEd.get(l.n) || planosRot.get(l.n) || {};
        const fonte = doTake ? 'take' : takeEscolhido && !edicao ? 'take' : doAcervo ? 'acervo' : null;
        return {
            n: l.n, tipo: p.tipo || 'video_ia', deS: U.arred(l.deS), ateS: U.arred(l.ateS), duracaoS: U.arred(l.ateS - l.deS),
            fonte, take: doTake ? doTake.take || null : takeEscolhido ? takeEscolhido.id : null,
            // pronto = take gerado/anexado; plano "reaproveitar" com clipe do acervo também conta
            pronto: fonte === 'take' || (fonte === 'acervo' && p.tipo === 'reaproveitar'),
            gerando: gerando ? { id: gerando.id, etapa: gerando.etapa || 'gerando', iniciadoEm: gerando.iniciadoEm || null } : null,
            falhou: ultimo && ultimo.status === 'falhou' && !doTake ? (ultimo.erro || 'falhou') : null,
            quadroChave: Boolean((p.quadroChave && (p.quadroChave.arquivo || p.quadroChave.caminho)) && fs.existsSync(path.join(c.pastaSerie, doEpisodio(c.epId, p.quadroChave.arquivo || p.quadroChave.caminho)))),
            decupado: Boolean(ex.prompt || (ex.tipo && ex.tipo !== 'video_ia')),
            prompt: String(p.prompt || p.visual || ''), modelo: p.modelo || null,
        };
    });
}

/**
 * estadoProducao(serie, ep) → tudo o que a tela precisa para dizer "o que falta" (sem rede, sem custo).
 */
async function estadoProducao(serie, ep) {
    const c = U.caminhos(serie, ep);
    const serieDados = await U.lerJson(path.join(c.pastaSerie, 'serie.json'), null);
    if (!serieDados) throw U.erro(`Série não encontrada: ${serie}.`, 404);
    const entrada = (serieDados.episodios || []).find((e) => e.n === c.n) || null;
    if (!entrada && !fs.existsSync(c.pastaEp)) throw U.erro(`Episódio ${c.n} não encontrado.`, 404);
    const [roteiro, falasDoc, edicao, mesa, planosDoc, votacao] = await Promise.all([
        U.lerJson(c.roteiro, null), U.lerJson(c.falas, null), U.lerJson(c.edicao, null), E.lerMesa(serie, ep),
        U.lerJson(c.planos, null), U.lerJson(path.join(c.pastaEp, 'votacao.json'), null),
    ]);
    const render = await require('./render').statusRender(serie, ep).catch(() => ({ status: 'nenhum' }));
    let vozes = null;
    try { vozes = await require('../audio/vozesFalas').conferirVozes(serie, ep); } catch (e) { vozes = { mudancas: [], erros: [e.message] }; }

    const duracaoAlvoS = Number((entrada && entrada.duracaoAlvoS) || (roteiro && roteiro.duracaoAlvoS) || serieDados.duracaoAlvoS || 60);
    const fimRoteiro = roteiro && Array.isArray(roteiro.planos) ? roteiro.planos.reduce((m, p) => Math.max(m, Number(p.ateS) || 0), 0) : 0;
    const itensFala = edicao ? ['narracao', 'falas'].flatMap((f) => (edicao.faixas && edicao.faixas[f]) || []) : ((falasDoc && falasDoc.falas) || []);
    const videos = estadoDosVideos(c, edicao, mesa, planosDoc, roteiro);
    const nPlanos = roteiro && Array.isArray(roteiro.planos) ? roteiro.planos.length : 0;
    const decupados = planosDoc && Array.isArray(planosDoc.planos) && roteiro
        ? roteiro.planos.filter((rp) => planosDoc.planos.some((p) => p.n === rp.n)).length : 0;
    const semEscolha = entrada && typeof entrada.semEscolha === 'boolean' ? entrada.semEscolha : roteiro ? roteiro.escolhas === null : duracaoAlvoS < 20;
    return {
        serie, ep: c.n, epId: c.epId, titulo: (roteiro && roteiro.titulo) || (entrada && entrada.titulo) || '',
        status: (entrada && entrada.status) || 'roteiro',
        duracaoAlvoS, semEscolha,
        modelos: { videoFinal: (serieDados.modelos && serieDados.modelos.videoFinal) || null, videoRascunho: (serieDados.modelos && serieDados.modelos.videoRascunho) || null },
        orcamento: serieDados.orcamento || {},
        roteiro: roteiro ? {
            existe: true, aprovado: roteiro.aprovado === true, planos: nPlanos, duracaoAlvoS: roteiro.duracaoAlvoS ?? null,
            duracaoPlanosS: U.arred(fimRoteiro, 1),
            foraDaDuracao: Math.abs(fimRoteiro - duracaoAlvoS) > Math.max(0.5, Math.min(3, duracaoAlvoS * 0.1)),
        } : { existe: false, aprovado: false, planos: 0 },
        falas: {
            existe: Boolean(falasDoc), total: itensFala.length,
            prontas: itensFala.filter((f) => f.arquivo && (f.status === 'pronta' || f.status === undefined)).length,
            estimadas: Boolean(edicao && edicao.origem && edicao.origem.falas === 'estimadas'),
            vozesMudaram: (vozes && vozes.mudancas) || [], errosVoz: (vozes && vozes.erros) || [],
        },
        decupagem: { existe: Boolean(planosDoc), decupados, total: nPlanos, faltam: roteiro ? roteiro.planos.filter((rp) => !(planosDoc && (planosDoc.planos || []).some((p) => p.n === rp.n))).map((p) => p.n) : [] },
        quadros: { com: videos.filter((v) => v.quadroChave).length, total: videos.length },
        videos: {
            total: videos.length, prontos: videos.filter((v) => v.pronto).length, comTake: videos.filter((v) => v.fonte === 'take').length,
            gerando: videos.filter((v) => v.gerando).length, planos: videos,
        },
        edicao: edicao ? { existe: true, revisao: edicao.revisao, duracaoS: U.arred(Number(edicao.duracaoS) || 0, 2), duracaoAlvoS: edicao.duracaoAlvoS ?? null } : { existe: false },
        render: { status: render.status || 'nenhum', saida: render.status === 'pronto' ? render.saida || null : null, duracaoS: render.duracaoS ?? null, pct: render.pct ?? null, erro: render.erro || null },
        votacao: { semEscolha, registrada: Boolean(votacao), vencedora: votacao ? votacao.vencedora : null },
    };
}

// ---------------------------------------------------------------- decupagem
/**
 * salvarDecupagem({ serie, ep, decupagem }) — decupagem = o resultado da etapa "decupagem" ({ planos: [...] }).
 * Takes e take escolhido que o planos.json já tinha ficam. A edição recebe prompt, modelo, âncoras e o caminho do
 * quadro-chave (se o arquivo existir); tempos e vídeos da edição não mudam.
 */
async function salvarDecupagem({ serie, ep, decupagem } = {}) {
    const episodios = require('../series/episodios');
    const c = U.caminhos(serie, ep);
    const lista = Array.isArray(decupagem) ? decupagem : decupagem && Array.isArray(decupagem.planos) ? decupagem.planos : null;
    if (!lista || !lista.length) throw U.erro('Mande a decupagem ({ planos: [...] }).');
    const roteiro = await U.lerJson(c.roteiro, null);
    if (!roteiro) throw U.erro('Este episódio ainda não tem roteiro.', 404);
    const atual = await U.lerJson(c.planos, null);
    const antigos = new Map(((atual && atual.planos) || []).map((p) => [p.n, p]));
    const permitidos = new Set(['n', 'tipo', 'duracaoS', 'prompt', 'promptPartes', 'descricaoPt', 'ancoras', 'quadroChave', 'quadroFinal', 'modelo', 'resolucao', 'audio', 'custoPrevistoUsd', 'dependeDe']);
    const ns = new Set(roteiro.planos.map((p) => p.n));
    const planos = lista.filter((p) => p && ns.has(Number(p.n))).map((p) => {
        const limpo = Object.fromEntries(Object.entries(p).filter(([k]) => permitidos.has(k)));
        limpo.n = Number(p.n);
        const velho = antigos.get(limpo.n) || {};
        return { ...limpo, takes: Array.isArray(velho.takes) ? velho.takes : [], takeEscolhido: velho.takeEscolhido ?? null };
    }).sort((a, b) => a.n - b.n);
    if (!planos.length) throw U.erro('Nenhum plano da decupagem bate com o roteiro.');
    const r = await episodios.salvarPlanos(serie, c.n, { planos });
    const doc = await E.lerEdicao(serie, ep);
    let edicao = null;
    if (doc) {
        edicao = await E.atualizarEdicao(serie, ep, (d) => {
            for (const p of d.planos || []) {
                const x = planos.find((y) => y.n === p.n);
                if (!x) continue;
                if (x.prompt) p.prompt = x.prompt;
                if (x.descricaoPt) p.descricaoPt = x.descricaoPt;
                if (x.modelo) p.modelo = x.modelo;
                if (x.resolucao) p.resolucao = x.resolucao;
                if (Array.isArray(x.ancoras) && x.ancoras.length) p.ancoras = x.ancoras;
                const q = x.quadroChave && x.quadroChave.caminho;
                if (q && !p.quadroChave && fs.existsSync(path.join(c.pastaEp, q))) p.quadroChave = { arquivo: doEpisodio(c.epId, q), origem: x.quadroChave.origem || 'ref' };
            }
            return d;
        });
    }
    return { ok: true, planos: r.planos, avisos: r.avisos, edicao: edicao ? edicao.edicao : null, historico: edicao ? edicao.historico : null };
}

// ---------------------------------------------------------------- lote de vídeo
// Menor duração aceita ≥ plano; plano maior que o máximo do modelo: pede o máximo e segura o último quadro no fim.
function duracaoDoPlano(modelo, planoS) {
    const lista = Array.isArray(modelo && modelo.supported_durations) ? [...modelo.supported_durations].map(Number).sort((a, b) => a - b) : null;
    if (!lista || !lista.length) return { duracaoPedidaS: Math.max(1, Math.ceil(planoS - 1e-6)), ajuste: 'aparar', curto: false };
    const d = lista.find((x) => x >= planoS - 1e-6);
    if (d === undefined) return { duracaoPedidaS: lista.at(-1), ajuste: 'segurar', curto: true };
    return { duracaoPedidaS: d, ajuste: d > planoS + 1e-4 ? 'aparar' : 'exato', curto: false };
}

function escolherModeloPlano({ pedido, plano, serieDados, modelos, comQuadro }) {
    const serve = (id) => {
        const m = modelos.find((x) => x.id === id);
        if (!m) return false;
        const prop = m.supported_aspect_ratios || [];
        if (prop.length && !prop.includes('9:16')) return false;
        return !comQuadro || (m.supported_frame_images || []).includes('first_frame');
    };
    if (pedido) return pedido;
    const s = (serieDados && serieDados.modelos) || {};
    for (const id of [plano && plano.modelo, s.videoFinal, s.videoRascunho]) if (id && serve(id)) return id;
    // o modelo da série não aceita o quadro-chave: usa o da série mesmo (sem o quadro) antes de trocar de modelo
    for (const id of [plano && plano.modelo, s.videoFinal, s.videoRascunho]) if (id && modelos.some((m) => m.id === id)) return id;
    const qualquer = modelos.find((m) => (m.supported_aspect_ratios || []).includes('9:16'));
    if (!qualquer) throw U.erro('Nenhum modelo de vídeo do catálogo gera 9:16.');
    return qualquer.id;
}

/**
 * cotarLoteVideo({ serie, ep, planos?: [n], modelo? }) → { cotacoes: [...], totalUsd, simulado, teto, avisos }
 * Sem `planos`: todos os que ainda não têm vídeo pronto. Não gasta nada; cada cotação traz o token (10 min).
 */
async function cotarLoteVideo({ serie, ep, planos: pedidos = null, modelo = null } = {}) {
    const or = require('../openrouter');
    const servico = require('../openrouter/servico');
    const trecho = require('./trecho');
    const c = U.caminhos(serie, ep);
    const doc = await E.lerEdicao(serie, ep);
    if (!doc) throw U.erro('Este episódio ainda não tem edição: gere as falas e monte a edição na Mesa antes (os tempos dos planos vêm da narração).', 409);
    const estado = await estadoProducao(serie, ep);
    const lista = Array.isArray(pedidos) && pedidos.length
        ? estado.videos.planos.filter((v) => pedidos.map(Number).includes(v.n))
        : estado.videos.planos.filter((v) => !v.pronto && !v.gerando);
    if (!lista.length) throw U.erro('Nenhum plano para gerar: todos já têm vídeo (escolha um plano para gerar de novo).');
    const ocupados = lista.filter((v) => v.gerando);
    if (ocupados.length) throw U.erro(`O plano ${ocupados.map((v) => v.n).join(', ')} já está gerando: espere terminar.`, 409);

    const serieDados = await U.lerJson(path.join(c.pastaSerie, 'serie.json'), {});
    const ctx = await or.obterContexto({ serie });
    const cat = await or.catalogo.carregarCatalogoVideo({ cliente: ctx.cliente, raiz: ctx.raiz });
    const fichas = await E.fichasPorId(c.pastaSerie);
    const mesa = await E.lerMesa(serie, ep);
    const planosDoc = await U.lerJson(c.planos, null);
    const avisosGerais = [];
    if (!planosDoc) avisosGerais.push('Sem decupagem: o pedido usa a descrição do roteiro (em português). Decupar antes deixa o prompt mais preciso (câmera, ação, estilo).');
    const cotacoes = [];
    for (const v of lista) {
        const plano = (doc.planos || []).find((p) => p.n === v.n) || { n: v.n };
        const quadro = plano.quadroChave && plano.quadroChave.arquivo && fs.existsSync(path.join(c.pastaSerie, plano.quadroChave.arquivo)) ? plano.quadroChave.arquivo : null;
        const modeloId = escolherModeloPlano({ pedido: modelo, plano, serieDados, modelos: cat.modelos, comQuadro: Boolean(quadro) });
        const m = or.catalogo.acharModelo(cat.modelos, modeloId, 'vídeo');
        const aceita = m.supported_frame_images || [];
        const len = U.arred(v.ateS - v.deS);
        const dur = duracaoDoPlano(m, len);
        const avisos = [];
        if (dur.curto) avisos.push(`O plano tem ${String(U.arred(len, 1)).replace('.', ',')} s e o ${m.name || m.id} gera no máximo ${dur.duracaoPedidaS} s: o último quadro fica parado no fim (ou divida o plano na Mesa).`);
        else if (dur.ajuste === 'aparar') avisos.push(`O modelo gera ${dur.duracaoPedidaS} s: o clipe é aparado para ${String(len).replace('.', ',')} s.`);
        const usarQuadro = quadro && aceita.includes('first_frame');
        if (quadro && !usarQuadro) avisos.push(`${m.name || m.id} não aceita primeiro quadro: o quadro-chave do plano fica de fora.`);
        if (v.fonte === 'take') avisos.push('Este plano já tem um take: o novo entra no lugar (o antigo continua na lista de takes).');
        const id = U.novoId('r');
        const pasta = `episodios/${c.epId}/takes/p${pad2(v.n)}`;
        let nomes = [];
        try { nomes = fs.readdirSync(path.join(c.pastaSerie, pasta)); } catch { nomes = []; }
        const reservados = mesa.regeracoes.filter((r) => r.plano === v.n && ['cotado', 'gerando'].includes(r.status)).map((r) => r.take && r.take.id);
        const extras = (((planosDoc && planosDoc.planos) || []).find((p) => p.n === v.n) || {}).takes || [];
        const takeId = trecho.proximoTake(nomes, [...((mesa.takes || {})[v.n] || []), ...extras], reservados);
        const resolucoes = m.supported_resolutions || [];
        const proporcoes = m.supported_aspect_ratios || [];
        const pedido = {
            modelo: m.id,
            prompt: trecho.montarPrompt(plano, fichas, ''),
            duracaoS: dur.duracaoPedidaS,
            resolucao: plano.resolucao && resolucoes.includes(plano.resolucao) ? plano.resolucao : resolucoes.length ? (resolucoes.includes('720p') ? '720p' : resolucoes[0]) : null,
            proporcao: proporcoes.length ? (proporcoes.includes('9:16') ? '9:16' : null) : null,
            audio: false,
            quadros: { primeiro: usarQuadro ? quadro : null, ultimo: null },
            destino: `${pasta}/${takeId}.bruto.mp4`,
            ep: c.n,
            etapa: 'geracao',
            ref: `p${pad2(v.n)}/${takeId}`,
        };
        if (proporcoes.length && !pedido.proporcao) throw U.erro(`${m.name || m.id} não gera vídeo vertical 9:16: escolha outro modelo.`);
        const cot = await servico.cotarGeracao({ tipo: 'video', serie, pedido });
        const fase = m.id === (serieDados.modelos && serieDados.modelos.videoRascunho) && m.id !== (serieDados.modelos && serieDados.modelos.videoFinal) ? 'rascunho' : 'final';
        const registro = {
            id, faixa: 'video', status: 'cotado', lote: true, fase, plano: v.n, deS: v.deS, ateS: v.ateS, duracaoS: len,
            duracaoPedidaS: dur.duracaoPedidaS, ajuste: dur.ajuste, fator: U.arred(dur.duracaoPedidaS / len, 4), instrucao: '', modelo: m.id, nomeModelo: m.name,
            prompt: pedido.prompt, quadros: { primeiro: pedido.quadros.primeiro, ultimo: null }, pedido, custoPrevistoUsd: cot.custoPrevistoUsd,
            estimativa: Boolean(cot.estimativa), simulado: Boolean(cot.simulado), criadoEm: new Date().toISOString(),
            take: { id: takeId, arquivo: `${pasta}/${takeId}.mp4`, bruto: pedido.destino },
        };
        cotacoes.push({ ...registro, token: cot.token, expiraEm: cot.expiraEm, orcamento: cot.orcamento, detalhe: cot.detalhe, avisos: [...avisos, ...(cot.avisos || [])] });
    }
    const limite = Date.now() - 30 * 60 * 1000;
    await E.atualizarMesa(serie, ep, (m) => {
        m.regeracoes = m.regeracoes.filter((r) => r.status !== 'cotado' || Date.parse(r.criadoEm) > limite);
        for (const x of cotacoes) {
            const { token, expiraEm, orcamento, detalhe, avisos, ...reg } = x;
            m.regeracoes.push(reg);
        }
    });
    const totalUsd = Math.round(cotacoes.reduce((s, x) => s + x.custoPrevistoUsd, 0) * 1e6) / 1e6;
    const teto = tetoDoLote(cotacoes, totalUsd);
    return { cotacoes, totalUsd, simulado: cotacoes.some((x) => x.simulado), teto, avisos: avisosGerais };
}

// Cada cotação confere o teto sozinha; o LOTE soma: gasto do episódio/série + total do lote não pode passar.
function tetoDoLote(cotacoes, totalUsd) {
    const o = (cotacoes[0] && cotacoes[0].orcamento) || {};
    const tetos = o.tetos || {};
    const r = { totalUsd, tetos, gastoEpisodioUsd: o.gastoEpisodioUsd ?? null, gastoSerieUsd: o.gastoSerieUsd ?? null, passa: null };
    if (Number.isFinite(tetos.episodio) && Number.isFinite(o.gastoEpisodioUsd) && o.gastoEpisodioUsd + totalUsd > tetos.episodio + 1e-9) {
        r.passa = `O lote (${U.arred(totalUsd, 4)} US$) + o já gasto no episódio (${U.arred(o.gastoEpisodioUsd, 4)} US$) passa do teto do episódio (${tetos.episodio} US$). Gere menos planos de uma vez ou aumente o teto.`;
    } else if (Number.isFinite(tetos.serie) && Number.isFinite(o.gastoSerieUsd) && o.gastoSerieUsd + totalUsd > tetos.serie + 1e-9) {
        r.passa = `O lote (${U.arred(totalUsd, 4)} US$) + o já gasto na série (${U.arred(o.gastoSerieUsd, 4)} US$) passa do teto da série (${tetos.serie} US$).`;
    }
    return r;
}

/**
 * gerarLoteVideo({ serie, ep, confirmacoes: [{ id, token }] }) — PAGO: só com os tokens da cotação.
 * Confere a soma contra o teto ANTES de abrir o primeiro job (nunca deixa o lote pela metade por causa do teto).
 */
async function gerarLoteVideo({ serie, ep, confirmacoes = [] } = {}) {
    const trecho = require('./trecho');
    if (!Array.isArray(confirmacoes) || !confirmacoes.length) throw U.erro('Confirme a cotação antes de gerar (falta o token).');
    const mesa = await E.lerMesa(serie, ep);
    const recs = confirmacoes.map(({ id }) => mesa.regeracoes.find((r) => r.id === id));
    if (recs.some((r) => !r)) throw U.erro('Cotação não encontrada: cote de novo.', 404);
    if (recs.some((r) => !r.lote)) throw U.erro('Esta cotação não é do lote de vídeo dos planos.', 400);
    if (confirmacoes.some((x) => !x.token)) throw U.erro('Falta o token de confirmação: nada é gerado sem confirmar o custo.');
    const total = recs.reduce((s, r) => s + (Number(r.custoPrevistoUsd) || 0), 0);
    const or = require('../openrouter');
    const ctx = await or.obterContexto({ serie });
    const c = U.caminhos(serie, ep);
    const pend = ctx.jobs ? await ctx.jobs.comprometido({ ep: c.n }) : {};
    const tetos = ctx.tetos || {};
    if (Number.isFinite(Number(tetos.episodio)) && ctx.livro) {
        const gasto = (Number(await ctx.livro.total({ ep: c.n })) || 0) + (Number(pend.episodioUsd) || 0);
        if (gasto + total > Number(tetos.episodio) + 1e-9) throw U.erro(`O lote passa do teto do episódio: já gasto/reservado US$ ${U.arred(gasto, 4)} + lote US$ ${U.arred(total, 4)} > US$ ${tetos.episodio}. Nada foi gerado.`, 409);
    }
    if (Number.isFinite(Number(tetos.serie)) && ctx.livro) {
        const gasto = (Number(await ctx.livro.total({})) || 0) + (Number(pend.serieUsd) || 0);
        if (gasto + total > Number(tetos.serie) + 1e-9) throw U.erro(`O lote passa do teto da série: já gasto/reservado US$ ${U.arred(gasto, 4)} + lote US$ ${U.arred(total, 4)} > US$ ${tetos.serie}. Nada foi gerado.`, 409);
    }
    return trecho.regerarTrecho({ serie, ep, confirmacoes });
}

// Depois que um take do lote fica pronto: entra no planos.json (takes + takeEscolhido). Sem planos.json, fica só no
// mesa.json e na edição (o aviso da tela pede a decupagem).
async function registrarTakeNoPlano(serie, ep, take, { escolher = true, jobId = null, fase = 'final' } = {}) {
    const c = U.caminhos(serie, ep);
    return U.comTrava(c.planos, async () => {
        const doc = await U.lerJson(c.planos, null);
        if (!doc || !Array.isArray(doc.planos)) return false;
        const p = doc.planos.find((x) => x.n === take.plano);
        if (!p) return false;
        p.takes = Array.isArray(p.takes) ? p.takes.filter((t) => t.id !== take.id) : [];
        p.takes.push({
            id: take.id, fase, caminho: noEpisodio(c.epId, take.arquivo), jobId, modelo: take.modelo || null,
            custoUsd: Number.isFinite(Number(take.custoUsd)) && take.custoUsd !== null ? Number(take.custoUsd) : null, status: 'pronto',
            criadoEm: take.criadoEm || new Date().toISOString(), ...(take.simulado ? { simulado: true } : {}),
        });
        if (escolher) p.takeEscolhido = take.id;
        await U.gravarJson(c.planos, doc, { pastaSerie: c.pastaSerie });
        return true;
    });
}

module.exports = { estadoProducao, salvarDecupagem, cotarLoteVideo, gerarLoteVideo, registrarTakeNoPlano, duracaoDoPlano, escolherModeloPlano, tetoDoLote };
