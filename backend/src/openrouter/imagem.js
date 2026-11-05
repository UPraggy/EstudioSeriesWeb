// Imagem em alto nível (POST /images é síncrono): cotar e gerar, com registro em jobs.json
// para nunca pagar 2x o mesmo pedido.
// pedido: { modelo, prompt, resolucao ('1K'), proporcao ('9:16'), n, seed, referencias: [], destino, ep, etapa, ref }
const fsp = require('fs/promises');
const path = require('path');
const catalogo = require('./catalogo');
const orcamento = require('./orcamento');
const arquivos = require('./arquivos');
const util = require('./util');
const { ErroValidacao, ErroConfirmacao, ErroOpenRouter, ErroJob } = require('./erros');

async function normalizarPedidoImagem(pedido = {}, ctx) {
    return {
        tipo: 'imagem',
        modelo: pedido.modelo,
        prompt: pedido.prompt || '',
        resolucao: pedido.resolucao || null,
        proporcao: pedido.proporcao || null,
        n: pedido.n === undefined ? 1 : Number(pedido.n),
        seed: pedido.seed === undefined || pedido.seed === null ? null : Number(pedido.seed),
        referencias: await Promise.all((pedido.referencias || []).map((r) => arquivos.referenciaParaHash(r, ctx.base))),
        destino: pedido.destino ? arquivos.relativoOuAbsoluto(ctx.base, path.resolve(ctx.base, pedido.destino)) : null,
        ep: pedido.ep === undefined ? null : pedido.ep,
        etapa: pedido.etapa || null,
        ref: pedido.ref || null,
    };
}

async function prepararImagem(pedido, ctx) {
    if (!pedido || !pedido.modelo) throw new ErroValidacao('Informe o modelo de imagem.');
    if (!pedido.prompt) throw new ErroValidacao('Informe o prompt da imagem.');
    const cat = await catalogo.carregarCatalogoImagem({ cliente: ctx.cliente, raiz: ctx.raiz });
    const modelo = catalogo.acharModelo(cat.modelos, pedido.modelo, 'imagem');
    const v = catalogo.validarImagem(modelo, pedido);
    const eps = await catalogo.carregarEndpointsImagem({ cliente: ctx.cliente, raiz: ctx.raiz, id: modelo.id });
    const preco = catalogo.precoImagem(eps.endpoints, { resolucao: v.resolucao, n: v.n, referencias: v.nRefs });
    const pendentes = ctx.jobs ? await ctx.jobs.comprometido({ ep: pedido.ep }) : {};
    const orc = await orcamento.verificar(preco.usd, { tetos: ctx.tetos || {}, livro: ctx.livro, ep: pedido.ep ?? null, pendentes });
    const cot = {
        tipo: 'imagem',
        modelo: modelo.id,
        nomeModelo: modelo.name,
        custoPrevistoUsd: preco.usd,
        estimativa: preco.estimativa,
        detalhe: preco.detalhe,
        avisos: [...preco.avisos, ...(cat.aviso ? [cat.aviso] : [])],
        parametros: { resolucao: v.resolucao || null, proporcao: v.proporcao || null, n: v.n, referencias: v.nRefs },
        orcamento: orc,
        simulado: ctx.cliente.simulado === true,
    };
    return { cot, modelo, v };
}

async function cotarImagem(pedido, ctx) {
    return (await prepararImagem(pedido, ctx)).cot;
}

// Grava as imagens (base64) ao lado do destino, com a extensão do tipo devolvido.
async function gravarImagens(itens, destinoAbs, base) {
    const saida = [];
    const semExt = destinoAbs.slice(0, destinoAbs.length - path.extname(destinoAbs).length);
    await fsp.mkdir(path.dirname(destinoAbs), { recursive: true });
    for (const [i, item] of itens.entries()) {
        if (!item || !item.b64_json) throw new Error(`a imagem ${i + 1} veio sem conteúdo`);
        const ext = item.media_type ? util.extensaoDeMime(item.media_type) : (path.extname(destinoAbs) || '.png');
        const alvo = itens.length === 1 ? `${semExt}${ext}` : `${semExt}-${i + 1}${ext}`;
        const tmp = `${alvo}.parcial`;
        await fsp.writeFile(tmp, Buffer.from(item.b64_json, 'base64'));
        await fsp.rename(tmp, alvo);
        saida.push(arquivos.relativoOuAbsoluto(base, alvo));
    }
    return saida;
}

/**
 * gerarImagem(pedido, ctx, { custoConfirmadoUsd }) → { job, novo, arquivos, custoPrevistoUsd, simulado }
 */
async function gerarImagem(pedido, ctx, { custoConfirmadoUsd = null } = {}) {
    if (!pedido || !pedido.destino) throw new ErroValidacao('Informe o destino da imagem (ex.: elenco/mara/ref/padrao-frente.png).');
    const { cot, modelo, v } = await prepararImagem(pedido, ctx);
    if (custoConfirmadoUsd !== null && cot.custoPrevistoUsd > Number(custoConfirmadoUsd) + 1e-9) {
        throw new ErroConfirmacao(`O preço mudou de ${util.formatarUsd(custoConfirmadoUsd)} para ${util.formatarUsd(cot.custoPrevistoUsd)} desde a cotação. Cote de novo.`);
    }
    const pedidoHash = util.hashCanonico(await normalizarPedidoImagem(pedido, ctx));
    const { job, novo } = await ctx.jobs.abrir({
        pedidoHash,
        tipo: 'imagem',
        modelo: modelo.id,
        destino: pedido.destino,
        previstoUsd: cot.custoPrevistoUsd,
        ep: pedido.ep ?? null,
        etapa: pedido.etapa || 'elenco',
        ref: pedido.ref || null,
        simulado: ctx.cliente.simulado === true,
    }, async () => {
        const corpo = { model: modelo.id, prompt: pedido.prompt };
        if (v.n > 1) corpo.n = v.n;
        if (v.resolucao) corpo.resolution = v.resolucao;
        if (v.proporcao) corpo.aspect_ratio = v.proporcao;
        if (pedido.seed !== undefined && pedido.seed !== null) corpo.seed = Number(pedido.seed);
        const refs = pedido.referencias || [];
        if (refs.length) corpo.input_references = await Promise.all(refs.map(async (r) => arquivos.itemImagem(await arquivos.urlParaEnvio(r, ctx.base))));
        const r = await ctx.cliente.pedirJson('POST', '/images', { corpo, repetir: 'so429', timeoutMs: 180000 });
        const itens = (r && r.data) || [];
        if (!itens.length) throw new ErroOpenRouter('O OpenRouter não devolveu nenhuma imagem (pode ter sido barrada pela moderação).');
        let gravados;
        try {
            gravados = await gravarImagens(itens, ctx.jobs.destinoAbsoluto(pedido.destino), ctx.base);
        } catch (e) {
            // Já foi pago: não deixar repetir sem conferir.
            throw new ErroJob(`A imagem foi gerada (e cobrada) mas não consegui gravar: ${e.message}`, { incerto: true });
        }
        return {
            id: `img-${pedidoHash.slice(0, 12)}-${Date.now().toString(36)}`,
            status: 'completed',
            pronto: true,
            usage: r.usage,
            extra: { arquivos: gravados },
        };
    });
    return { job, novo, arquivos: job.arquivos || [], custoPrevistoUsd: cot.custoPrevistoUsd, simulado: ctx.cliente.simulado === true };
}

module.exports = { normalizarPedidoImagem, cotarImagem, gerarImagem };
