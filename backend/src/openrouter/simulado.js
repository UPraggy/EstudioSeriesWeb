// MODO SIMULADO: cliente falso com a mesma interface do cliente real (pedirJson/baixar), sem rede e sem custo.
// Ativo quando ESTUDIO_SIMULADO=1 ou sem chave. Serve catálogos do retrato em amostras/ e devolve
// resultados falsos (vídeo/imagem de exemplo, JSON gerado do schema) com usage.cost = 0.
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
let contadorVideo = 0;
const { ErroOpenRouter } = require('./erros');

const AMOSTRAS = path.join(__dirname, 'amostras');

// Gera um exemplo mínimo que respeita um JSON Schema simples (objetos, listas, enums, tipos básicos).
function exemploDoSchema(schema, profundidade = 0) {
    if (!schema || typeof schema !== 'object' || profundidade > 8) return null;
    if (schema.const !== undefined) return schema.const;
    if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0];
    if (schema.default !== undefined) return schema.default;
    const variantes = schema.anyOf || schema.oneOf;
    if (Array.isArray(variantes) && variantes.length) {
        const naoNulo = variantes.find((v) => v.type !== 'null') || variantes[0];
        return exemploDoSchema(naoNulo, profundidade + 1);
    }
    let tipo = schema.type;
    if (Array.isArray(tipo)) tipo = tipo.find((t) => t !== 'null') || tipo[0];
    if (!tipo && schema.properties) tipo = 'object';
    switch (tipo) {
        case 'object': {
            const obj = {};
            for (const [k, sub] of Object.entries(schema.properties || {})) obj[k] = exemploDoSchema(sub, profundidade + 1);
            return obj;
        }
        case 'array': {
            const n = Math.max(1, Number(schema.minItems) || 1);
            return Array.from({ length: n }, () => exemploDoSchema(schema.items || {}, profundidade + 1));
        }
        case 'string': return '(simulado)';
        case 'integer': return Number.isFinite(schema.minimum) ? schema.minimum : 1;
        case 'number': return Number.isFinite(schema.minimum) ? schema.minimum : 1;
        case 'boolean': return false;
        case 'null': return null;
        default: return null;
    }
}

async function lerAmostraJson(nome) {
    try {
        return JSON.parse(await fsp.readFile(path.join(AMOSTRAS, nome), 'utf8'));
    } catch {
        throw new ErroOpenRouter(`Modo simulado: não há amostra ${nome}.`, { status: 404 });
    }
}

/**
 * criarClienteSimulado({ pastaAmostras }) → { simulado: true, pedirJson, baixar, chamadas }
 * `chamadas` registra o que seria enviado (útil para testes e para mostrar o corpo do pedido).
 */
function criarClienteSimulado({ pastaAmostras = AMOSTRAS } = {}) {
    const chamadas = [];
    const amostra = (n) => path.join(pastaAmostras, n);

    async function pedirJson(metodo, caminho, { corpo } = {}) {
        const rota = String(caminho).replace(/^https?:\/\/[^/]+\/api\/v1/, '').split('?')[0];
        chamadas.push({ metodo, rota, corpo });
        if (metodo === 'GET') {
            if (rota === '/videos/models') return lerAmostraJson('videos-models.json');
            if (rota === '/images/models') return lerAmostraJson('imagens-models.json');
            if (rota === '/models') return lerAmostraJson('modelos-texto.json');
            const ep = rota.match(/^\/images\/models\/([^/]+)\/([^/]+)\/endpoints$/);
            if (ep) return lerAmostraJson(`endpoints-${ep[1]}__${ep[2]}.json`);
            const vid = rota.match(/^\/videos\/([^/]+)$/);
            if (vid) {
                const id = decodeURIComponent(vid[1]);
                return { id, polling_url: `/api/v1/videos/${id}`, status: 'completed', unsigned_urls: [`https://openrouter.ai/api/v1/videos/${id}/content?index=0`], usage: { cost: 0, is_byok: false } };
            }
            if (rota === '/key') return { data: { limit: null, limit_remaining: null, limit_reset: null, usage: 0, usage_daily: 0, usage_weekly: 0, usage_monthly: 0, is_free_tier: false } };
            if (rota === '/credits') return { data: { total_credits: 0, total_usage: 0 } };
        }
        if (metodo === 'POST') {
            const hash = crypto.createHash('sha1').update(JSON.stringify(corpo || {})).digest('hex').slice(0, 20);
            if (rota === '/videos') {
                // id único por pedido enviado (como o OpenRouter de verdade): o mesmo corpo enviado de novo (outro take do
                // mesmo plano) não pode cair no job antigo, que já baixou para outro destino
                const id = `sim-vid-${hash}-${(++contadorVideo).toString(36)}${Date.now().toString(36).slice(-4)}`;
                return { id, polling_url: `/api/v1/videos/${id}`, status: 'pending' };
            }
            if (rota === '/images') {
                const png = await fsp.readFile(amostra('simulado.png'));
                const n = Math.max(1, Number(corpo && corpo.n) || 1);
                return {
                    created: Math.floor(Date.now() / 1000),
                    data: Array.from({ length: n }, () => ({ b64_json: png.toString('base64'), media_type: 'image/png' })),
                    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, cost: 0 },
                };
            }
            if (rota === '/chat/completions') {
                const rf = corpo && corpo.response_format;
                const schema = rf && rf.json_schema && rf.json_schema.schema;
                const conteudo = schema ? exemploDoSchema(schema) : { simulado: true };
                return {
                    id: `sim-gen-${hash}`,
                    model: corpo && corpo.model,
                    choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(conteudo) } }],
                    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, cost: 0 },
                };
            }
        }
        throw new ErroOpenRouter(`Modo simulado: rota não simulada (${metodo} ${rota}).`, { status: 404 });
    }

    async function baixar(alvo, destino) {
        chamadas.push({ metodo: 'GET', rota: String(alvo).replace(/^https?:\/\/[^/]+\/api\/v1/, ''), baixar: true });
        await fsp.mkdir(path.dirname(destino), { recursive: true });
        await fsp.copyFile(amostra('simulado.mp4'), destino);
        const { size } = await fsp.stat(destino);
        return { bytes: size, destino };
    }

    return { simulado: true, temChave: false, base: 'simulado', pedirJson, baixar, chamadas, toJSON() { return { simulado: true }; } };
}

module.exports = { criarClienteSimulado, exemploDoSchema, AMOSTRAS };
