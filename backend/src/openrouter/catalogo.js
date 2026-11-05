// Catálogos do OpenRouter (vídeo, imagem, texto) com cache em <ESTUDIO_DADOS>\catalogo\ e cálculo de preço.
const path = require('path');
const { raizDados } = require('./ambiente');
const { ErroValidacao, ErroPreco } = require('./erros');
const util = require('./util');

const VALIDADE_MS = 24 * 60 * 60 * 1000;
const AVISO_TOKEN = 'Preço por token: largura × altura × 24 × segundos ÷ 1024 (ESTIMATIVA; o custo real vem em usage.cost).';

// ---------- cache genérico ----------
async function carregarComCache({ cliente, arquivo, caminhoApi, maxIdadeMs = VALIDADE_MS, forcar = false, agora = Date.now, validar }) {
    const cache = await util.lerJson(arquivo, null);
    const idade = cache && cache.baixadoEm ? agora() - Date.parse(cache.baixadoEm) : Infinity;
    if (cache && !forcar && idade < maxIdadeMs) {
        return { baixadoEm: cache.baixadoEm, dados: cache.dados, deCache: true, arquivo };
    }
    try {
        const dados = await cliente.pedirJson('GET', caminhoApi);
        if (validar && !validar(dados)) throw new Error(`resposta inesperada de ${caminhoApi}`);
        const baixadoEm = new Date(agora()).toISOString();
        // O modo simulado serve um retrato antigo: não grava por cima do cache real.
        if (!cliente.simulado) await util.escreverJsonAtomico(arquivo, { versao: 1, baixadoEm, fonte: 'openrouter', dados });
        return { baixadoEm, dados, deCache: false, arquivo, simulado: cliente.simulado === true };
    } catch (e) {
        if (cache) {
            return { baixadoEm: cache.baixadoEm, dados: cache.dados, deCache: true, arquivo, aviso: `Catálogo de ${cache.baixadoEm} (não consegui atualizar: ${e.message})` };
        }
        throw e;
    }
}

const temLista = (d) => d && Array.isArray(d.data);

async function carregarCatalogoVideo({ cliente, raiz = raizDados(), ...resto } = {}) {
    const r = await carregarComCache({ cliente, arquivo: path.join(raiz, 'catalogo', 'videos.json'), caminhoApi: '/videos/models', validar: temLista, ...resto });
    return { ...r, modelos: r.dados.data };
}

async function carregarCatalogoImagem({ cliente, raiz = raizDados(), ...resto } = {}) {
    const r = await carregarComCache({ cliente, arquivo: path.join(raiz, 'catalogo', 'imagens.json'), caminhoApi: '/images/models', validar: temLista, ...resto });
    return { ...r, modelos: r.dados.data };
}

async function carregarEndpointsImagem({ cliente, raiz = raizDados(), id, ...resto }) {
    if (!/^[\w.-]+\/[\w.:-]+$/.test(String(id))) throw new ErroValidacao(`Modelo de imagem inválido: ${id}`);
    const arquivo = path.join(raiz, 'catalogo', 'imagens-endpoints', `${id.replace('/', '__')}.json`);
    const r = await carregarComCache({ cliente, arquivo, caminhoApi: `/images/models/${id}/endpoints`, validar: (d) => d && Array.isArray(d.endpoints), ...resto });
    return { ...r, endpoints: r.dados.endpoints };
}

async function carregarCatalogoTexto({ cliente, raiz = raizDados(), ...resto } = {}) {
    const r = await carregarComCache({ cliente, arquivo: path.join(raiz, 'catalogo', 'modelos.json'), caminhoApi: '/models', validar: temLista, ...resto });
    return { ...r, modelos: r.dados.data };
}

function acharModelo(modelos, id, tipo = 'vídeo') {
    const m = (modelos || []).find((x) => x.id === id);
    if (!m) throw new ErroValidacao(`O modelo ${id} não está no catálogo de ${tipo} do OpenRouter.`);
    return m;
}

// ---------- vídeo: dimensões, validação e preço ----------
const LADO_CURTO = { '360p': 360, '480p': 480, '720p': 720, '768p': 768, '1080p': 1080, '1k': 1024, '2k': 1440, '4k': 2160 };

function normRes(resolucao) {
    return resolucao ? String(resolucao).trim().toLowerCase() : '';
}

function parProporcao(proporcao) {
    const [a, b] = String(proporcao || '9:16').split(':').map(Number);
    if (!(a > 0 && b > 0)) throw new ErroValidacao(`Proporção inválida: ${proporcao}`);
    return [a, b];
}

// Largura × altura em pixels para a resolução + proporção (usa supported_sizes quando o modelo lista).
function dimensoes(modelo, resolucao, proporcao = '9:16') {
    const lado = LADO_CURTO[normRes(resolucao)];
    if (!lado) throw new ErroValidacao(`Resolução desconhecida para calcular o tamanho: ${resolucao}`);
    const [a, b] = parProporcao(proporcao);
    const alvo = a / b;
    const tamanhos = (modelo && modelo.supported_sizes) || [];
    for (const s of tamanhos) {
        const [w, h] = String(s).split('x').map(Number);
        if (Math.min(w, h) === lado && Math.abs(w / h - alvo) / alvo < 0.02) return { largura: w, altura: h };
    }
    const par = (x) => Math.round(x / 2) * 2;
    if (a === b) return { largura: lado, altura: lado };
    return a < b ? { largura: lado, altura: par((lado * b) / a) } : { largura: par((lado * a) / b), altura: lado };
}

/**
 * Valida o pedido contra o catálogo e devolve os valores efetivos (com padrões).
 * pedido: { duracaoS, resolucao, proporcao, audio, quadros: { primeiro, ultimo }, referencias: [] }
 */
function validarVideo(modelo, pedido = {}) {
    const problemas = [];
    const lista = (v) => (Array.isArray(v) ? v : null);
    const duracoes = lista(modelo.supported_durations);
    const resolucoes = lista(modelo.supported_resolutions);
    const proporcoes = lista(modelo.supported_aspect_ratios);
    const quadrosOk = lista(modelo.supported_frame_images) || [];

    let duracaoS = pedido.duracaoS === undefined || pedido.duracaoS === null ? undefined : Number(pedido.duracaoS);
    if (duracaoS === undefined) {
        if (duracoes) problemas.push(`informe a duração (aceita: ${[...duracoes].sort((x, y) => x - y).join(', ')} s)`);
    } else if (!Number.isInteger(duracaoS) || duracaoS < 1) {
        problemas.push(`duração inválida: ${pedido.duracaoS}`);
    } else if (duracoes && !duracoes.includes(duracaoS)) {
        problemas.push(`duração de ${duracaoS} s não suportada (aceita: ${[...duracoes].sort((x, y) => x - y).join(', ')} s)`);
    }

    let resolucao = pedido.resolucao || undefined;
    if (!resolucao && resolucoes) resolucao = resolucoes.includes('720p') ? '720p' : resolucoes[0];
    if (resolucao && resolucoes && !resolucoes.includes(resolucao)) {
        problemas.push(`resolução ${resolucao} não suportada (aceita: ${resolucoes.join(', ')})`);
    }

    let proporcao = pedido.proporcao || undefined;
    if (!proporcao && proporcoes) proporcao = proporcoes.includes('9:16') ? '9:16' : proporcoes[0];
    if (proporcao && proporcoes && !proporcoes.includes(proporcao)) {
        problemas.push(`proporção ${proporcao} não suportada (aceita: ${proporcoes.join(', ')})`);
    }

    const audio = pedido.audio === true;
    if (audio && modelo.generate_audio !== true) problemas.push('este modelo não gera áudio');

    const quadros = pedido.quadros || {};
    if (quadros.primeiro && !quadrosOk.includes('first_frame')) problemas.push('este modelo não aceita primeiro quadro');
    if (quadros.ultimo && !quadrosOk.includes('last_frame')) problemas.push('este modelo não aceita último quadro');
    const nQuadros = (quadros.primeiro ? 1 : 0) + (quadros.ultimo ? 1 : 0);
    const nRefs = Array.isArray(pedido.referencias) ? pedido.referencias.length : 0;
    if (nQuadros && nRefs) {
        problemas.push('mande quadro OU referências: com os dois o OpenRouter usa só o quadro (imagem→vídeo) e as referências podem ser ignoradas');
    }
    if (pedido.videoEntrada) problemas.push('vídeo de entrada ainda não é suportado (formato não confirmado na doc; ver API.md)');

    if (problemas.length) throw new ErroValidacao(`Pedido inválido para ${modelo.id}: ${problemas.join('; ')}.`);
    return { duracaoS, resolucao, proporcao, audio, nQuadros, nRefs, modo: nQuadros ? 'imagem' : 'texto' };
}

/**
 * Preço previsto de um vídeo a partir de pricing_skus.
 * opcoes: { duracaoS, resolucao, audio, proporcao, largura, altura, modo: 'texto'|'imagem', quadros, referencias }
 * → { usd, estimativa, sku, detalhe: [{ item, usd }], avisos }
 */
function precoVideo(modelo, opcoes = {}) {
    const skus = modelo.pricing_skus || {};
    const num = (k) => (k && skus[k] !== undefined && skus[k] !== null && Number.isFinite(Number(skus[k])) ? Number(skus[k]) : undefined);
    const primeiro = (lista) => lista.filter(Boolean).find((k) => num(k) !== undefined);
    const res = normRes(opcoes.resolucao);
    const comRes = (k) => (res ? `${k}_${res}` : null);
    const audio = opcoes.audio === true;
    const modo = opcoes.modo === 'imagem' ? 'image_to_video' : 'text_to_video';
    const outroModo = modo === 'image_to_video' ? 'text_to_video' : 'image_to_video';
    const duracaoS = Number(opcoes.duracaoS);
    const quadros = Number(opcoes.quadros) || 0;
    const referencias = Number(opcoes.referencias) || 0;
    const detalhe = [];
    const avisos = [];
    let estimativa = false;
    let total = 0;
    let sku;

    if (!(duracaoS > 0)) throw new ErroPreco(`Informe a duração para calcular o preço de ${modelo.id}.`);

    // 1) US$ por segundo
    const candDolar = audio
        ? [comRes('duration_seconds_with_audio'), 'duration_seconds_with_audio', comRes(`${modo}_duration_seconds`), comRes('duration_seconds'), `${modo}_duration_seconds`, 'duration_seconds']
        : [comRes('duration_seconds_without_audio'), comRes(`${modo}_duration_seconds`), comRes('duration_seconds'), 'duration_seconds_without_audio', `${modo}_duration_seconds`, 'duration_seconds'];
    sku = primeiro(candDolar);
    if (!sku && primeiro([comRes(`${outroModo}_duration_seconds`), `${outroModo}_duration_seconds`])) {
        sku = primeiro([comRes(`${outroModo}_duration_seconds`), `${outroModo}_duration_seconds`]);
        avisos.push(`Sem preço para ${modo === 'image_to_video' ? 'imagem→vídeo' : 'texto→vídeo'} nesta resolução: usei o do outro modo.`);
    }
    if (sku) {
        const porS = num(sku);
        total = porS * duracaoS;
        detalhe.push({ item: `${duracaoS} s × US$ ${porS}/s`, sku, usd: util.arredondarUsd(total) });
    }

    // 2) centavos por segundo
    if (!sku) {
        sku = primeiro([comRes('cents_per_video_output_second'), comRes('cents_per_second_output'), 'cents_per_video_output_second', 'cents_per_second_output']);
        if (sku) {
            const porS = num(sku) / 100;
            total = porS * duracaoS;
            detalhe.push({ item: `${duracaoS} s × ${num(sku)} centavos/s`, sku, usd: util.arredondarUsd(total) });
        }
    }

    // 3) tokens de vídeo (estimativa)
    if (!sku) {
        const cand = [];
        if (opcoes.videoEntrada) cand.push(res ? `video_tokens_${res}_with_video_input` : null, 'video_tokens_with_video_input');
        if (!audio) cand.push(res ? `video_tokens_${res}_without_audio` : null);
        cand.push(comRes('video_tokens'));
        if (!audio) cand.push('video_tokens_without_audio');
        cand.push('video_tokens');
        sku = primeiro(cand);
        if (sku) {
            let { largura, altura } = opcoes;
            if (!(largura > 0 && altura > 0)) ({ largura, altura } = dimensoes(modelo, opcoes.resolucao, opcoes.proporcao));
            const tokens = (largura * altura * 24 * duracaoS) / 1024;
            total = tokens * num(sku);
            estimativa = true;
            avisos.push(AVISO_TOKEN);
            detalhe.push({ item: `${Math.round(tokens)} tokens (${largura}×${altura}, ${duracaoS} s) × US$ ${num(sku)}`, sku, usd: util.arredondarUsd(total) });
        }
    }

    if (!sku) {
        throw new ErroPreco(`Não sei calcular o preço de ${modelo.id} (skus: ${Object.keys(skus).join(', ') || 'nenhum'}). Escolha outro modelo.`);
    }

    // extras por imagem de entrada
    const centImg = num('cents_per_image_input');
    if (centImg && quadros + referencias > 0) {
        const v = (centImg / 100) * (quadros + referencias);
        total += v;
        detalhe.push({ item: `${quadros + referencias} imagem(ns) de entrada × ${centImg} centavos`, sku: 'cents_per_image_input', usd: util.arredondarUsd(v) });
    }
    const refSku = primeiro(['reference_input_images', 'reference_images']);
    if (refSku && referencias > 0) {
        const v = num(refSku) * referencias;
        total += v;
        detalhe.push({ item: `${referencias} referência(s) × US$ ${num(refSku)}`, sku: refSku, usd: util.arredondarUsd(v) });
    }

    const minimo = num('minimum_cents_per_generation');
    if (minimo && total < minimo / 100) {
        detalhe.push({ item: `mínimo por geração (${minimo} centavos)`, sku: 'minimum_cents_per_generation', usd: util.arredondarUsd(minimo / 100 - total) });
        total = minimo / 100;
    }

    return { usd: util.arredondarUsd(total), estimativa, sku, detalhe, avisos };
}

// ---------- imagem ----------
// Tokens por imagem de saída (Gemini 3.x Flash Image), pela tabela de preços do Google: ESTIMATIVA.
const TOKENS_IMAGEM = { '512': 747, '1K': 1120, '2K': 1680, '4K': 2520 };

function validarImagem(modelo, pedido = {}) {
    const sp = modelo.supported_parameters || {};
    const problemas = [];
    const enumDe = (p) => (sp[p] && sp[p].type === 'enum' ? sp[p].values : null);
    const resolucoes = enumDe('resolution');
    const proporcoes = enumDe('aspect_ratio');
    let resolucao = pedido.resolucao || undefined;
    if (!resolucao && resolucoes) resolucao = resolucoes.includes('1K') ? '1K' : resolucoes[0];
    if (resolucao && resolucoes && !resolucoes.includes(resolucao)) problemas.push(`resolução ${resolucao} não suportada (aceita: ${resolucoes.join(', ')})`);
    let proporcao = pedido.proporcao || undefined;
    if (!proporcao && proporcoes) proporcao = proporcoes.includes('9:16') ? '9:16' : proporcoes[0];
    if (proporcao && proporcoes && !proporcoes.includes(proporcao)) problemas.push(`proporção ${proporcao} não suportada (aceita: ${proporcoes.join(', ')})`);
    const n = pedido.n === undefined ? 1 : Number(pedido.n);
    const faixaN = sp.n && sp.n.type === 'range' ? sp.n : null;
    if (!Number.isInteger(n) || n < 1 || (faixaN && (n < faixaN.min || n > faixaN.max))) {
        problemas.push(`quantidade de imagens ${pedido.n} fora do aceito${faixaN ? ` (${faixaN.min}–${faixaN.max})` : ''}`);
    }
    const nRefs = Array.isArray(pedido.referencias) ? pedido.referencias.length : 0;
    const faixaR = sp.input_references && sp.input_references.type === 'range' ? sp.input_references : null;
    if (nRefs && faixaR && nRefs > faixaR.max) problemas.push(`no máximo ${faixaR.max} referências (mandou ${nRefs})`);
    if (nRefs && !faixaR && !(modelo.architecture && (modelo.architecture.input_modalities || []).includes('image'))) {
        problemas.push('este modelo não aceita imagens de referência');
    }
    if (problemas.length) throw new ErroValidacao(`Pedido inválido para ${modelo.id}: ${problemas.join('; ')}.`);
    return { resolucao, proporcao, n, nRefs };
}

// Preço previsto de imagem: usa o endpoint MAIS CARO (o roteamento pode escolher qualquer um).
function precoImagem(endpoints, { resolucao, n = 1, referencias = 0 } = {}) {
    if (!Array.isArray(endpoints) || !endpoints.length) throw new ErroPreco('O modelo de imagem não tem preço publicado.');
    let melhor = null;
    for (const ep of endpoints) {
        let total = 0;
        let estimativa = false;
        const detalhe = [];
        const avisos = [];
        let temSaida = false;
        for (const p of ep.pricing || []) {
            const custo = Number(p.cost_usd);
            if (!Number.isFinite(custo)) continue;
            if (p.billable === 'output_image' && p.unit === 'image') {
                temSaida = true;
                total += custo * n;
                detalhe.push({ item: `${n} imagem(ns) × US$ ${custo}`, sku: `${ep.provider_slug}:output_image`, usd: util.arredondarUsd(custo * n) });
            } else if (p.billable === 'output_image' && p.unit === 'token') {
                temSaida = true;
                const tokens = TOKENS_IMAGEM[resolucao] || TOKENS_IMAGEM['1K'];
                total += tokens * custo * n;
                estimativa = true;
                avisos.push(`Preço por token de imagem: ~${tokens} tokens por imagem ${resolucao || '1K'} (ESTIMATIVA; o custo real vem em usage.cost).`);
                detalhe.push({ item: `${n} × ~${tokens} tokens × US$ ${custo}`, sku: `${ep.provider_slug}:output_image`, usd: util.arredondarUsd(tokens * custo * n) });
            } else if (p.billable === 'input_image' && p.unit === 'image' && referencias > 0 && custo > 0) {
                total += custo * referencias;
                detalhe.push({ item: `${referencias} referência(s) × US$ ${custo}`, sku: `${ep.provider_slug}:input_image`, usd: util.arredondarUsd(custo * referencias) });
            }
        }
        if (!temSaida) continue;
        if (!melhor || total > melhor.total) melhor = { total, estimativa, detalhe, avisos, provedor: ep.provider_name };
    }
    if (!melhor) throw new ErroPreco('Não sei calcular o preço deste modelo de imagem (sem preço por imagem de saída).');
    return { usd: util.arredondarUsd(melhor.total), estimativa: melhor.estimativa, detalhe: melhor.detalhe, avisos: melhor.avisos, provedor: melhor.provedor };
}

// ---------- texto ----------
function precoTexto(modelo, { tokensEntrada = 0, tokensSaidaMax = 0 } = {}) {
    const p = modelo.pricing || {};
    const entrada = Number(p.prompt) || 0;
    const saida = Number(p.completion) || 0;
    const usd = tokensEntrada * entrada + tokensSaidaMax * saida;
    return {
        usd: util.arredondarUsd(Math.max(usd, usd > 0 ? 0.0001 : 0)),
        estimativa: true,
        detalhe: [
            { item: `~${tokensEntrada} tokens de entrada × US$ ${entrada}`, usd: util.arredondarUsd(tokensEntrada * entrada) },
            { item: `até ${tokensSaidaMax} tokens de saída × US$ ${saida}`, usd: util.arredondarUsd(tokensSaidaMax * saida) },
        ],
        avisos: ['Texto: previsto pelo máximo de tokens de saída (o real costuma ser menor).'],
    };
}

module.exports = {
    VALIDADE_MS, TOKENS_IMAGEM,
    carregarComCache, carregarCatalogoVideo, carregarCatalogoImagem, carregarEndpointsImagem, carregarCatalogoTexto,
    acharModelo, dimensoes, validarVideo, precoVideo, validarImagem, precoImagem, precoTexto,
};
