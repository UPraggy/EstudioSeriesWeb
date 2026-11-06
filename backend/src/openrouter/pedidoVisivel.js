// "Ver pedido": monta o que IRIA para o OpenRouter (POST /images ou /videos) sem cotar, sem token e sem gastar.
// Serve para o Rafael ler o prompt, copiar tudo e levar as imagens de referência para outra plataforma
// (Midjourney, Runway, Kling, Flow...). As imagens NÃO vão em base64: cada uma aparece como "<arquivo: caminho>"
// no corpo e na lista `arquivos` (caminho relativo à base: pasta da série ou geracao-simples), para ver e baixar.
const fs = require('fs');
const path = require('path');
const { ErroValidacao } = require('./erros');
const util = require('./util');

const ENDPOINT = { imagem: 'https://openrouter.ai/api/v1/images', video: 'https://openrouter.ai/api/v1/videos' };

// Caminho de arquivo do pedido → relativo à base, sem sair dela (URL e data URL passam como estão).
function arquivoDoPedido(valor, base) {
    if (!valor) return null;
    const v = String(valor);
    if (util.ehUrl(v)) return { url: v, caminho: null, existe: true };
    if (/^data:/i.test(v)) return { url: null, caminho: null, dataUrl: true, existe: true };
    if (path.isAbsolute(v) || v.split(/[\\/]/).includes('..')) throw new ErroValidacao(`Caminho inválido no pedido: ${v}`);
    const abs = path.resolve(base, v);
    const rel = path.relative(base, abs);
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw new ErroValidacao(`Caminho fora da pasta: ${v}`);
    return { url: null, caminho: rel.split(path.sep).join('/'), existe: fs.existsSync(abs) };
}

function marcador(a) {
    if (!a) return null;
    if (a.url) return a.url;
    if (a.dataUrl) return '<imagem enviada em data URL>';
    return `<arquivo: ${a.caminho}>`;
}

/**
 * verPedido({ tipo, pedido, base }) → { tipo, endpoint, modelo, prompt, parametros, arquivos, corpo, gasto: 0 }
 * pedido: o mesmo objeto do CotarGeracao (imagem: referencias; vídeo: quadros.primeiro/ultimo + referencias).
 */
function verPedido({ tipo = 'video', pedido, base } = {}) {
    if (!['video', 'imagem'].includes(tipo)) throw new ErroValidacao('Tipo deve ser video ou imagem.');
    if (!pedido || typeof pedido !== 'object') throw new ErroValidacao('Mande o pedido.');
    if (!base) throw new ErroValidacao('Falta a pasta base do pedido.');
    const arquivos = [];
    const corpo = { model: pedido.modelo || null };
    if (pedido.prompt) corpo.prompt = String(pedido.prompt);
    const parametros = {};
    if (tipo === 'imagem') {
        if (pedido.resolucao) { corpo.resolution = pedido.resolucao; parametros.resolucao = pedido.resolucao; }
        if (pedido.proporcao) { corpo.aspect_ratio = pedido.proporcao; parametros.proporcao = pedido.proporcao; }
        const n = pedido.n === undefined ? 1 : Number(pedido.n);
        if (n > 1) corpo.n = n;
        parametros.n = n;
    } else {
        if (pedido.duracaoS) { corpo.duration = Number(pedido.duracaoS); parametros.duracaoS = Number(pedido.duracaoS); }
        if (pedido.resolucao) { corpo.resolution = pedido.resolucao; parametros.resolucao = pedido.resolucao; }
        if (pedido.proporcao) { corpo.aspect_ratio = pedido.proporcao; parametros.proporcao = pedido.proporcao; }
        corpo.generate_audio = pedido.audio === true;
        parametros.audio = pedido.audio === true;
        const q = pedido.quadros || {};
        const frames = [];
        for (const [papel, tipoQuadro] of [['primeiro', 'first_frame'], ['ultimo', 'last_frame']]) {
            const a = arquivoDoPedido(q[papel], base);
            if (!a) continue;
            arquivos.push({ papel: papel === 'primeiro' ? 'primeiro_quadro' : 'ultimo_quadro', ...a });
            frames.push({ type: 'image_url', image_url: { url: marcador(a) }, frame_type: tipoQuadro });
        }
        if (frames.length) corpo.frame_images = frames;
    }
    if (pedido.seed !== undefined && pedido.seed !== null) { corpo.seed = Number(pedido.seed); parametros.seed = Number(pedido.seed); }
    const refs = (pedido.referencias || []).map((r) => arquivoDoPedido(r, base)).filter(Boolean);
    for (const a of refs) arquivos.push({ papel: 'referencia', ...a });
    if (refs.length) corpo.input_references = refs.map((a) => ({ type: 'image_url', image_url: { url: marcador(a) } }));
    return {
        tipo,
        endpoint: ENDPOINT[tipo],
        modelo: pedido.modelo || null,
        prompt: String(pedido.prompt || ''),
        parametros,
        arquivos,
        destino: pedido.destino || null,
        corpo,
        gasto: 0,
        nota: 'Só leitura: nada foi cotado nem pago. As imagens vão em base64 na chamada real; aqui aparecem pelo caminho.',
    };
}

module.exports = { verPedido, arquivoDoPedido, ENDPOINT };
