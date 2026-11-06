// Modelos da série (serie.json → modelos): catálogo resumido por papel e validação antes de gravar.
// Papéis: texto (showrunner e memória), imagem (fichas e quadro-chave), videoRascunho, videoFinal, apresentador.
const catalogo = require('./catalogo');
const { obterCliente } = require('./contexto');
const { raizDados } = require('./ambiente');
const servico = require('./servico');
const { ErroValidacao } = require('./erros');

const PAPEIS = {
    texto: { rotulo: 'Texto', tipo: 'texto' },
    imagem: { rotulo: 'Imagem', tipo: 'imagem' },
    videoRascunho: { rotulo: 'Vídeo rascunho', tipo: 'video' },
    videoFinal: { rotulo: 'Vídeo final', tipo: 'video' },
    apresentador: { rotulo: 'Apresentador', tipo: 'video' },
};
const RE_ID = /^[\w.-]+\/[\w.:-]+$/;
const porMilhao = (v) => (Number.isFinite(Number(v)) ? Math.round(Number(v) * 1e6 * 1000) / 1000 : null);

// Texto: só quem devolve texto e aceita saída estruturada (o showrunner usa json_schema estrito).
function resumoTexto(lista) {
    return lista
        .filter((m) => (m.architecture?.output_modalities || []).join() === 'text' && (m.supported_parameters || []).includes('structured_outputs'))
        .map((m) => ({
            id: m.id,
            nome: m.name,
            contexto: m.context_length || null,
            entradaUsdMilhao: porMilhao(m.pricing?.prompt),
            saidaUsdMilhao: porMilhao(m.pricing?.completion),
        }))
        .sort((a, b) => a.id.localeCompare(b.id));
}

// Imagem: o catálogo traz supported_parameters como objeto ({ aspect_ratio, input_references: {min,max}, ... }).
function resumoImagem(lista) {
    return lista.map((m) => {
        const p = m.supported_parameters && typeof m.supported_parameters === 'object' ? m.supported_parameters : {};
        const refs = p.input_references && Number.isFinite(Number(p.input_references.max)) ? Number(p.input_references.max) : 0;
        const proporcoes = p.aspect_ratio && Array.isArray(p.aspect_ratio.values) ? p.aspect_ratio.values : null;
        return {
            id: m.id,
            nome: m.name,
            referencias: refs || ((m.architecture?.input_modalities || []).includes('image') ? 1 : 0),
            vertical: proporcoes ? proporcoes.includes('9:16') : null,
        };
    }).sort((a, b) => a.id.localeCompare(b.id));
}

async function carregar(fn, cliente, forcar) {
    try {
        const r = await fn({ cliente, raiz: raizDados(), forcar });
        return { modelos: r.modelos, baixadoEm: r.baixadoEm, aviso: r.aviso || null };
    } catch (e) {
        return { modelos: [], baixadoEm: null, aviso: `Catálogo indisponível: ${e.message}` };
    }
}

async function catalogoModelos({ forcar = false } = {}) {
    const cliente = obterCliente();
    const [texto, imagem, video] = await Promise.all([
        carregar(catalogo.carregarCatalogoTexto, cliente, forcar),
        carregar(catalogo.carregarCatalogoImagem, cliente, forcar),
        servico.catalogoVideoResumo({ forcar }).catch((e) => ({ modelos: [], aviso: `Catálogo indisponível: ${e.message}` })),
    ]);
    return {
        papeis: Object.entries(PAPEIS).map(([id, p]) => ({ id, ...p })),
        texto: { modelos: resumoTexto(texto.modelos), baixadoEm: texto.baixadoEm, aviso: texto.aviso },
        imagem: { modelos: resumoImagem(imagem.modelos), baixadoEm: imagem.baixadoEm, aviso: imagem.aviso },
        video: { modelos: [...(video.modelos || [])].sort((a, b) => a.id.localeCompare(b.id)), baixadoEm: video.baixadoEm || null, aviso: video.aviso || null },
        simulado: cliente.simulado === true,
    };
}

/**
 * Confere os modelos pedidos contra o catálogo do tipo de cada papel.
 * Devolve { modelos (só os papéis enviados), avisos }. Catálogo fora do ar → aceita pelo formato do id, com aviso.
 */
async function validarModelos(pedido, { catalogos } = {}) {
    if (!pedido || typeof pedido !== 'object' || Array.isArray(pedido)) throw new ErroValidacao('Envie os modelos (objeto "modelos").');
    const desconhecidos = Object.keys(pedido).filter((k) => !PAPEIS[k]);
    if (desconhecidos.length) throw new ErroValidacao(`Papéis desconhecidos: ${desconhecidos.join(', ')} (use ${Object.keys(PAPEIS).join(', ')}).`);
    const cat = catalogos || await catalogoModelos();
    const avisos = [];
    const modelos = {};
    for (const [papel, valor] of Object.entries(pedido)) {
        const id = String(valor || '').trim();
        if (!RE_ID.test(id)) throw new ErroValidacao(`${PAPEIS[papel].rotulo}: id de modelo inválido ("${id}"). Formato: fornecedor/modelo.`);
        const lista = cat[PAPEIS[papel].tipo]?.modelos || [];
        if (!lista.length) avisos.push(`${PAPEIS[papel].rotulo}: catálogo indisponível; ${id} gravado sem conferir.`);
        else if (!lista.some((m) => m.id === id)) {
            throw new ErroValidacao(`${PAPEIS[papel].rotulo}: ${id} não está no catálogo de ${PAPEIS[papel].tipo} do OpenRouter${papel === 'texto' ? ' (ou não aceita saída estruturada)' : ''}.`);
        }
        modelos[papel] = id;
    }
    return { modelos, avisos };
}

module.exports = { PAPEIS, catalogoModelos, validarModelos, resumoTexto };
