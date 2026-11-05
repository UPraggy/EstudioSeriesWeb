// Vídeo em alto nível: cotar (catálogo + preço + teto) e gerar (job persistido, sem pagar 2x).
// pedido: { modelo, prompt, duracaoS, resolucao, proporcao, audio, seed,
//           quadros: { primeiro, ultimo }, referencias: [], destino, ep, etapa, ref }
// Caminhos locais são relativos à pasta base do contexto (série ou geracao-simples).
const path = require('path');
const catalogo = require('./catalogo');
const orcamento = require('./orcamento');
const arquivos = require('./arquivos');
const util = require('./util');
const { ErroValidacao, ErroConfirmacao } = require('./erros');

async function normalizarPedidoVideo(pedido = {}, ctx) {
    const q = pedido.quadros || {};
    return {
        tipo: 'video',
        modelo: pedido.modelo,
        prompt: pedido.prompt || '',
        duracaoS: pedido.duracaoS === undefined || pedido.duracaoS === null ? null : Number(pedido.duracaoS),
        resolucao: pedido.resolucao || null,
        proporcao: pedido.proporcao || null,
        audio: pedido.audio === true,
        seed: pedido.seed === undefined || pedido.seed === null ? null : Number(pedido.seed),
        quadros: {
            primeiro: await arquivos.referenciaParaHash(q.primeiro, ctx.base),
            ultimo: await arquivos.referenciaParaHash(q.ultimo, ctx.base),
        },
        referencias: await Promise.all((pedido.referencias || []).map((r) => arquivos.referenciaParaHash(r, ctx.base))),
        destino: pedido.destino ? arquivos.relativoOuAbsoluto(ctx.base, path.resolve(ctx.base, pedido.destino)) : null,
        ep: pedido.ep === undefined ? null : pedido.ep,
        etapa: pedido.etapa || null,
        ref: pedido.ref || null,
    };
}

async function prepararVideo(pedido, ctx) {
    if (!pedido || !pedido.modelo) throw new ErroValidacao('Informe o modelo de vídeo.');
    if (!pedido.prompt && !(pedido.quadros && pedido.quadros.primeiro)) throw new ErroValidacao('Informe o prompt do vídeo.');
    const cat = await catalogo.carregarCatalogoVideo({ cliente: ctx.cliente, raiz: ctx.raiz });
    const modelo = catalogo.acharModelo(cat.modelos, pedido.modelo, 'vídeo');
    const v = catalogo.validarVideo(modelo, pedido);
    const preco = catalogo.precoVideo(modelo, { ...v, quadros: v.nQuadros, referencias: v.nRefs });
    const pendentes = ctx.jobs ? await ctx.jobs.comprometido({ ep: pedido.ep }) : {};
    const orc = await orcamento.verificar(preco.usd, { tetos: ctx.tetos || {}, livro: ctx.livro, ep: pedido.ep ?? null, pendentes });
    const cot = {
        tipo: 'video',
        modelo: modelo.id,
        nomeModelo: modelo.name,
        custoPrevistoUsd: preco.usd,
        estimativa: preco.estimativa,
        detalhe: preco.detalhe,
        avisos: [...preco.avisos, ...(cat.aviso ? [cat.aviso] : [])],
        parametros: { duracaoS: v.duracaoS, resolucao: v.resolucao || null, proporcao: v.proporcao || null, audio: v.audio, modo: v.modo },
        orcamento: orc,
        simulado: ctx.cliente.simulado === true,
    };
    return { cot, modelo, v };
}

async function cotarVideo(pedido, ctx) {
    return (await prepararVideo(pedido, ctx)).cot;
}

async function montarCorpoVideo(pedido, modelo, v, base) {
    const corpo = { model: modelo.id };
    if (pedido.prompt) corpo.prompt = pedido.prompt;
    if (v.duracaoS) corpo.duration = v.duracaoS;
    if (v.resolucao) corpo.resolution = v.resolucao;
    if (v.proporcao) corpo.aspect_ratio = v.proporcao;
    // O padrão da API é COM áudio nos modelos que geram áudio: sempre explícito.
    if (modelo.generate_audio === true) corpo.generate_audio = v.audio;
    if (pedido.seed !== undefined && pedido.seed !== null && modelo.seed) corpo.seed = Number(pedido.seed);
    const q = pedido.quadros || {};
    const frames = [];
    if (q.primeiro) frames.push({ ...arquivos.itemImagem(await arquivos.urlParaEnvio(q.primeiro, base)), frame_type: 'first_frame' });
    if (q.ultimo) frames.push({ ...arquivos.itemImagem(await arquivos.urlParaEnvio(q.ultimo, base)), frame_type: 'last_frame' });
    if (frames.length) corpo.frame_images = frames;
    const refs = pedido.referencias || [];
    if (refs.length) corpo.input_references = await Promise.all(refs.map(async (r) => arquivos.itemImagem(await arquivos.urlParaEnvio(r, base))));
    return corpo;
}

/**
 * gerarVideo(pedido, ctx, { custoConfirmadoUsd, aguardar, limiteMs })
 * ctx: { cliente, raiz, base, jobs, livro, tetos } (ver contexto.js)
 * → { job, novo, custoPrevistoUsd, simulado }
 */
async function gerarVideo(pedido, ctx, { custoConfirmadoUsd = null, aguardar = false, limiteMs } = {}) {
    if (!pedido || !pedido.destino) throw new ErroValidacao('Informe o destino do vídeo (ex.: episodios/ep01/takes/p03/take_01.mp4).');
    const { cot, modelo, v } = await prepararVideo(pedido, ctx);
    if (custoConfirmadoUsd !== null && cot.custoPrevistoUsd > Number(custoConfirmadoUsd) + 1e-9) {
        throw new ErroConfirmacao(`O preço mudou de ${util.formatarUsd(custoConfirmadoUsd)} para ${util.formatarUsd(cot.custoPrevistoUsd)} desde a cotação. Cote de novo.`);
    }
    const pedidoHash = util.hashCanonico(await normalizarPedidoVideo(pedido, ctx));
    const { job, novo } = await ctx.jobs.abrir({
        pedidoHash,
        tipo: 'video',
        modelo: modelo.id,
        destino: pedido.destino,
        previstoUsd: cot.custoPrevistoUsd,
        ep: pedido.ep ?? null,
        etapa: pedido.etapa || 'geracao',
        ref: pedido.ref || null,
        simulado: ctx.cliente.simulado === true,
    }, async () => {
        const corpo = await montarCorpoVideo(pedido, modelo, v, ctx.base);
        const r = await ctx.cliente.pedirJson('POST', '/videos', { corpo, repetir: 'so429', timeoutMs: 120000 });
        return { id: r && r.id, status: r && r.status };
    });
    let final = job;
    if (aguardar && job.status === 'pendente') final = await ctx.jobs.acompanhar(job.jobId, { limiteMs });
    return { job: final, novo, custoPrevistoUsd: cot.custoPrevistoUsd, simulado: ctx.cliente.simulado === true };
}

module.exports = { normalizarPedidoVideo, cotarVideo, gerarVideo, montarCorpoVideo };
