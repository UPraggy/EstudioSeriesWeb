// Operações usadas pelos controllers (finas e testáveis sem HTTP).
const path = require('path');
const fsp = require('fs/promises');
const { obterCliente, obterContexto } = require('./contexto');
const { raizDados, temChave } = require('./ambiente');
const catalogo = require('./catalogo');
const orcamento = require('./orcamento');
const video = require('./video');
const imagem = require('./imagem');
const simples = require('./geracaoSimples');
const util = require('./util');
const { ErroValidacao } = require('./erros');
const registro = require('../log/registro');

// Registro da cotação (não gasta: o previsto vai em dados, nunca em custoUsd) e das recusas antes de pagar.
function logCotacao({ tipo, serie, pedido, cot, ms, simples }) {
    registro.registrar({
        area: 'openrouter', evento: 'cotacao', serie, ep: pedido && pedido.ep, ms,
        msg: `Cotação de ${tipo}: previsto US$ ${cot.custoPrevistoUsd} (${cot.modelo || (pedido && pedido.modelo) || '?'})`,
        dados: {
            tipo, modelo: cot.modelo || (pedido && pedido.modelo), previstoUsd: cot.custoPrevistoUsd, estimativa: Boolean(cot.estimativa),
            duracaoS: pedido && pedido.duracaoS, resolucao: pedido && pedido.resolucao, audio: pedido && pedido.audio, simples,
        },
    });
}
function logRecusa(evento, { tipo, serie, pedido, ms, simples }, e) {
    registro.registrar({
        nivel: 'aviso', area: 'openrouter', evento, serie, ep: pedido && pedido.ep, ms,
        msg: `${evento === 'cotacao-falhou' ? 'Cotação' : 'Geração'} de ${tipo || '?'} recusada: ${e && e.message}`,
        dados: { tipo, modelo: pedido && pedido.modelo, simples, motivo: e && e.motivo, limite: e && e.limite }, erro: e,
    });
}

const MODULOS = {
    video: { normalizar: video.normalizarPedidoVideo, cotar: video.cotarVideo, gerar: video.gerarVideo },
    imagem: { normalizar: imagem.normalizarPedidoImagem, cotar: imagem.cotarImagem, gerar: imagem.gerarImagem },
};
function modulo(tipo) {
    const m = MODULOS[tipo || 'video'];
    if (!m) throw new ErroValidacao(`Tipo de geração desconhecido: ${tipo} (use video ou imagem).`);
    return m;
}

// O que pode ir para a interface (nunca URLs assinadas nem segredos).
function vistaJob(j) {
    if (!j) return null;
    const campos = ['jobId', 'tipo', 'modelo', 'status', 'statusApi', 'destino', 'arquivos', 'criadoEm', 'concluidoEm', 'atualizadoEm',
        'previstoUsd', 'custoUsd', 'custoConfirmado', 'erro', 'erroDownload', 'ep', 'etapa', 'ref', 'simulado'];
    const v = {};
    for (const c of campos) if (j[c] !== undefined) v[c] = j[c];
    return v;
}

// ---------- catálogo e saldo ----------
function opcaoPadrao(lista, preferida) {
    if (!Array.isArray(lista) || !lista.length) return undefined;
    return lista.includes(preferida) ? preferida : lista[0];
}

async function catalogoVideoResumo({ forcar = false } = {}) {
    const cliente = obterCliente();
    const cat = await catalogo.carregarCatalogoVideo({ cliente, raiz: raizDados(), forcar });
    const modelos = cat.modelos.map((m) => {
        const duracoes = m.supported_durations ? [...m.supported_durations].sort((a, b) => a - b) : null;
        const duracaoS = duracoes ? (duracoes.includes(8) ? 8 : duracoes[duracoes.length - 1]) : 8;
        const resolucao = opcaoPadrao(m.supported_resolutions, '720p');
        const proporcao = opcaoPadrao(m.supported_aspect_ratios, '9:16');
        let precoExemplo;
        try {
            const sem = catalogo.precoVideo(m, { duracaoS, resolucao, proporcao, audio: false });
            const com = m.generate_audio === true ? catalogo.precoVideo(m, { duracaoS, resolucao, proporcao, audio: true }) : null;
            precoExemplo = { duracaoS, resolucao: resolucao || null, proporcao: proporcao || null, semAudioUsd: sem.usd, comAudioUsd: com ? com.usd : null, estimativa: sem.estimativa };
        } catch (e) {
            precoExemplo = { erro: e.message };
        }
        return {
            id: m.id,
            nome: m.name,
            duracoes,
            resolucoes: m.supported_resolutions || null,
            proporcoes: m.supported_aspect_ratios || null,
            quadros: m.supported_frame_images || [],
            audio: m.generate_audio === true,
            seed: m.seed === true,
            pricingSkus: m.pricing_skus || {},
            precoExemplo,
        };
    });
    return { baixadoEm: cat.baixadoEm, deCache: cat.deCache, aviso: cat.aviso || null, simulado: cliente.simulado === true, modelos };
}

const numOuNulo = (v) => (typeof v === 'number' && Number.isFinite(v) ? util.arredondarUsd(v) : null);

// Só números de saldo/limite (o `label` do /key traz parte da chave: nunca sai daqui).
async function saldo() {
    const fim = registro.cronometro();
    try {
        const r = await saldoSemRegistro();
        registro.registrar({
            area: 'openrouter', evento: 'saldo', ms: fim(),
            msg: r.simulado ? 'Saldo não consultado (modo simulado)'
                : `Saldo lido: ${r.conta ? `US$ ${r.conta.saldoUsd} na conta` : r.limiteRestanteUsd !== null ? `US$ ${r.limiteRestanteUsd} de limite restante` : 'sem limite definido'}`,
            dados: {
                simulado: r.simulado, saldoUsd: r.conta ? r.conta.saldoUsd : null, creditosUsd: r.conta ? r.conta.creditosUsd : null,
                usadoUsd: r.conta ? r.conta.usadoUsd : null, limiteUsd: r.limiteUsd, limiteRestanteUsd: r.limiteRestanteUsd,
                usoHojeUsd: r.usoHojeUsd, usoMesUsd: r.usoMesUsd,
            },
        });
        return r;
    } catch (e) {
        registro.registrar({ nivel: 'erro', area: 'openrouter', evento: 'saldo-falhou', ms: fim(), msg: `Não consegui ler o saldo: ${e && e.message}`, erro: e });
        throw e;
    }
}

async function saldoSemRegistro() {
    const cliente = obterCliente();
    if (cliente.simulado) {
        return { simulado: true, chaveConfigurada: temChave(), limiteUsd: null, limiteRestanteUsd: null, usoUsd: null, conta: null, avisos: ['Modo simulado: saldo não consultado.'] };
    }
    const k = await cliente.pedirJson('GET', '/key');
    const d = (k && k.data) || {};
    const r = {
        simulado: false,
        chaveConfigurada: true,
        limiteUsd: numOuNulo(d.limit),
        limiteRestanteUsd: numOuNulo(d.limit_remaining),
        renovacaoLimite: typeof d.limit_reset === 'string' ? d.limit_reset : null,
        usoUsd: numOuNulo(d.usage),
        usoHojeUsd: numOuNulo(d.usage_daily),
        usoSemanaUsd: numOuNulo(d.usage_weekly),
        usoMesUsd: numOuNulo(d.usage_monthly),
        contaGratuita: d.is_free_tier === true,
        conta: null,
        avisos: [],
    };
    try {
        const c = await cliente.pedirJson('GET', '/credits');
        const cd = (c && c.data) || {};
        if (typeof cd.total_credits === 'number' && typeof cd.total_usage === 'number') {
            r.conta = { creditosUsd: numOuNulo(cd.total_credits), usadoUsd: numOuNulo(cd.total_usage), saldoUsd: util.arredondarUsd(cd.total_credits - cd.total_usage) };
        }
    } catch (e) {
        r.avisos.push(e.status === 403
            ? 'O saldo da conta (/credits) exige chave de gerenciamento: mostrando só o limite desta chave.'
            : `Não consegui ler o saldo da conta: ${e.message}`);
    }
    return r;
}

// ---------- cotar / gerar (série ou avulso) ----------
async function chaveConfirmacao(tipo, ctx, pedido, extra = {}) {
    return { tipo, serie: ctx.serie || null, ...extra, pedido: await modulo(tipo).normalizar(pedido, ctx) };
}

async function cotarGeracao({ tipo = 'video', serie = null, pedido } = {}) {
    if (!pedido) throw new ErroValidacao('Mande o pedido.');
    const fim = registro.cronometro();
    try {
        const ctx = await obterContexto({ serie });
        const chave = await chaveConfirmacao(tipo, ctx, pedido);
        const cot = await orcamento.cotar(chave, () => modulo(tipo).cotar(pedido, ctx));
        logCotacao({ tipo, serie, pedido, cot, ms: fim() });
        return cot;
    } catch (e) {
        logRecusa('cotacao-falhou', { tipo, serie, pedido, ms: fim() }, e);
        throw e;
    }
}

async function gerar({ tipo = 'video', serie = null, pedido, token, aguardar = false } = {}) {
    if (!pedido) throw new ErroValidacao('Mande o pedido.');
    const fim = registro.cronometro();
    try {
        const ctx = await obterContexto({ serie });
        const chave = await chaveConfirmacao(tipo, ctx, pedido);
        const r = await orcamento.executar(chave, token, (_p, { custoPrevistoUsd }) => modulo(tipo).gerar(pedido, ctx, { custoConfirmadoUsd: custoPrevistoUsd, aguardar }));
        return { ...r, job: vistaJob(r.job) };
    } catch (e) {
        logRecusa('geracao-falhou', { tipo, serie, pedido, ms: fim() }, e);
        throw e;
    }
}

async function statusJob({ jobId, serie = null } = {}) {
    if (!jobId) throw new ErroValidacao('Informe o jobId.');
    const ctx = await obterContexto({ serie });
    const job = await ctx.jobs.consultar(jobId);
    if (!serie) await simples.atualizarResultado(ctx.raiz, job);
    return { job: vistaJob(job), simulado: ctx.simulado };
}

async function retomar({ serie = null, aguardar = false } = {}) {
    const ctx = await obterContexto({ serie });
    const r = await ctx.jobs.retomarPendentes({ aguardar });
    if (!serie) for (const j of [...r.consultados, ...r.incertos]) await simples.atualizarResultado(ctx.raiz, j).catch(() => null);
    return { consultados: r.consultados.map(vistaJob), incertos: r.incertos.map(vistaJob), erros: r.erros, simulado: ctx.simulado };
}

// ---------- geração simples ----------
async function cotarSimples(corpo = {}) {
    const ctx = await obterContexto({});
    const { id, pasta, pj } = await simples.criar(ctx.raiz, corpo);
    try {
        const { tipo, pedido } = await simples.pedidoDeGeracao(pj, pasta);
        const chave = await chaveConfirmacao(tipo, ctx, pedido, { simples: id });
        const cot = await orcamento.cotar(chave, () => modulo(tipo).cotar(pedido, ctx));
        logCotacao({ tipo, serie: null, pedido, cot, simples: id });
        pj.custoPrevistoUsd = cot.custoPrevistoUsd;
        await simples.salvar(ctx.raiz, pj);
        // o pedido completo (prompt, modelo, parâmetros, quadros/referências) para "Copiar" e levar para fora
        let pedidoVisto = null;
        try { pedidoVisto = require('./pedidoVisivel').verPedido({ tipo, pedido, base: ctx.base }); } catch { pedidoVisto = null; }
        return { id, pasta, ...cot, pedidoVisto };
    } catch (e) {
        logRecusa('cotacao-falhou', { tipo: corpo.tipo, serie: null, pedido: corpo, simples: id }, e);
        await fsp.rm(pasta, { recursive: true, force: true }).catch(() => {});
        throw e;
    }
}

async function gerarSimples({ id, token, aguardar = false } = {}) {
    const ctx = await obterContexto({});
    const { pasta, pj } = await simples.ler(ctx.raiz, id);
    const { tipo, pedido } = await simples.pedidoDeGeracao(pj, pasta);
    const chave = await chaveConfirmacao(tipo, ctx, pedido, { simples: id });
    let r;
    try {
        r = await orcamento.executar(chave, token, (_p, { custoPrevistoUsd }) => modulo(tipo).gerar(pedido, ctx, { custoConfirmadoUsd: custoPrevistoUsd, aguardar }));
    } catch (e) {
        logRecusa('geracao-falhou', { tipo, serie: null, pedido, simples: id }, e);
        throw e;
    }
    let job = r.job;
    // No simulado o "job" termina na primeira consulta: já entrega o resultado.
    if (ctx.simulado && job.status === 'pendente') job = await ctx.jobs.consultar(job.jobId);
    const atualizado = await simples.atualizarResultado(ctx.raiz, job);
    return { id, job: vistaJob(job), novo: r.novo, simulado: ctx.simulado, pedido: atualizado || pj, pasta: path.join(ctx.raiz, 'geracao-simples', id) };
}

module.exports = { catalogoVideoResumo, saldo, cotarGeracao, gerar, statusJob, retomar, cotarSimples, gerarSimples, vistaJob };
