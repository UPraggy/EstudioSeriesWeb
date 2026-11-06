// Texto em alto nível: completarJSON (chat completions com response_format JSON e usage.cost no livro).
const catalogo = require('./catalogo');
const orcamento = require('./orcamento');
const util = require('./util');
const { ErroValidacao, ErroOpenRouter } = require('./erros');
const registro = require('../log/registro');

function textoDoConteudo(conteudo) {
    if (typeof conteudo === 'string') return conteudo;
    if (Array.isArray(conteudo)) return conteudo.map((p) => (typeof p === 'string' ? p : (p && p.text) || '')).join('');
    return '';
}

// Tira cercas ```json e acha o JSON no texto.
function extrairJson(texto) {
    const t = String(texto || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    try {
        return JSON.parse(t);
    } catch {
        const ini = t.search(/[[{]/);
        const fim = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
        if (ini >= 0 && fim > ini) {
            try {
                return JSON.parse(t.slice(ini, fim + 1));
            } catch { /* cai no erro abaixo */ }
        }
        throw new ErroOpenRouter(`A IA não devolveu um JSON válido (início: "${t.slice(0, 120)}").`);
    }
}

/**
 * completarJSON(opcoes, ctx)
 * opcoes: { modelo, mensagens | (sistema + prompt), schema, nomeSchema, estrito=true, maxTokens=4000, temperatura,
 *           ep, etapa, ref, respostaSimulada, timeoutMs }
 * ctx: { cliente, raiz, livro, tetos, jobs?, serie? }
 * → { dados, custoUsd, previstoUsd, uso, modelo, id, simulado }
 */
async function completarJSON(opcoes = {}, ctx) {
    const fim = registro.cronometro();
    const base = { area: 'openrouter', serie: ctx && ctx.serie, ep: opcoes.ep };
    try {
        const r = await completarJSONSemRegistro(opcoes, ctx);
        const real = !r.simulado && r.custoUsd !== null && r.custoUsd !== undefined ? r.custoUsd : (!r.simulado ? r.previstoUsd : undefined);
        registro.registrar({
            ...base, evento: 'texto', ms: fim(), custoUsd: real,
            msg: `IA de texto respondeu (${r.modelo})${r.simulado ? ' [simulado]' : ''}`,
            dados: { modelo: r.modelo, etapa: opcoes.etapa, previstoUsd: r.previstoUsd, custoConfirmado: r.custoUsd !== null && r.custoUsd !== undefined, entrada: r.uso && r.uso.entrada, saida: r.uso && r.uso.saida, simulado: r.simulado },
        });
        return r;
    } catch (e) {
        registro.registrar({
            ...base, nivel: 'erro', evento: 'texto-falhou', ms: fim(), msg: `IA de texto falhou (${opcoes.modelo || '?'}): ${e && e.message}`,
            dados: { modelo: opcoes.modelo, etapa: opcoes.etapa, status: e && e.status }, erro: e,
        });
        throw e;
    }
}

async function completarJSONSemRegistro(opcoes = {}, ctx) {
    const { modelo, schema, nomeSchema = 'resposta', estrito = true, maxTokens = 4000, temperatura, ep = null, etapa, ref } = opcoes;
    if (!modelo) throw new ErroValidacao('Informe o modelo de texto.');
    const mensagens = opcoes.mensagens || [
        ...(opcoes.sistema ? [{ role: 'system', content: opcoes.sistema }] : []),
        ...(opcoes.prompt ? [{ role: 'user', content: opcoes.prompt }] : []),
    ];
    if (!mensagens.length) throw new ErroValidacao('Informe as mensagens (ou sistema + prompt).');
    const simulado = ctx.cliente.simulado === true;
    if (simulado && opcoes.respostaSimulada !== undefined) {
        return { dados: opcoes.respostaSimulada, custoUsd: 0, previstoUsd: 0, uso: null, modelo, id: null, simulado: true };
    }

    const cat = await catalogo.carregarCatalogoTexto({ cliente: ctx.cliente, raiz: ctx.raiz });
    const m = catalogo.acharModelo(cat.modelos, modelo, 'texto');
    const tokensEntrada = Math.ceil((JSON.stringify(mensagens).length + (schema ? JSON.stringify(schema).length : 0)) / 3.5);
    const previsto = catalogo.precoTexto(m, { tokensEntrada, tokensSaidaMax: maxTokens }).usd;
    const pendentes = ctx.jobs ? await ctx.jobs.comprometido({ ep }) : {};
    await orcamento.verificar(previsto, { tetos: ctx.tetos || {}, livro: ctx.livro, ep, pendentes });

    const corpo = {
        model: modelo,
        messages: mensagens,
        max_completion_tokens: maxTokens,
        response_format: schema
            ? { type: 'json_schema', json_schema: { name: nomeSchema, strict: estrito, schema } }
            : { type: 'json_object' },
        provider: { require_parameters: true },
    };
    if (temperatura !== undefined && temperatura !== null) corpo.temperature = temperatura;

    const r = await ctx.cliente.pedirJson('POST', '/chat/completions', { corpo, repetir: 'so429', timeoutMs: opcoes.timeoutMs || 180000 });
    if (r && r.error) throw new ErroOpenRouter(`O OpenRouter devolveu erro: ${(r.error && r.error.message) || r.error}`);
    const custo = r && r.usage && typeof r.usage.cost === 'number' ? r.usage.cost : null;
    // Já foi pago: registra antes de validar a resposta.
    const valor = custo !== null ? custo : previsto;
    if (ctx.livro && !simulado && valor > 0) {
        await ctx.livro.registrar({
            em: new Date().toISOString(), serie: ctx.serie ?? null, ep, etapa: etapa || 'texto', tipo: 'texto', modelo,
            previstoUsd: previsto, realUsd: util.arredondarUsd(valor), jobId: (r && r.id) || null, ref: ref || null,
            ...(custo === null ? { realEstimado: true } : {}),
        });
    }
    const escolha = r && Array.isArray(r.choices) ? r.choices[0] : null;
    if (!escolha || !escolha.message) throw new ErroOpenRouter('O OpenRouter não devolveu resposta de texto.');
    if (escolha.finish_reason === 'length') {
        // cortado = quem chamou pode tentar de novo com mais tokens (o showrunner faz isso sozinho); o custo já foi registrado
        throw new ErroOpenRouter(`A resposta foi cortada no limite de ${maxTokens} tokens.`, { cortado: true, maxTokens, custoUsd: valor });
    }
    const dados = extrairJson(textoDoConteudo(escolha.message.content));
    const u = (r && r.usage) || {};
    return {
        dados,
        custoUsd: custo,
        previstoUsd: previsto,
        uso: { entrada: u.prompt_tokens ?? null, saida: u.completion_tokens ?? null },
        modelo: (r && r.model) || modelo,
        id: (r && r.id) || null,
        simulado,
    };
}

module.exports = { completarJSON, extrairJson };
