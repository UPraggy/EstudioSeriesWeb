// Cliente HTTP do OpenRouter: chave do ambiente, timeout, repetição com espera em 429/5xx,
// erros em português sem vazar a chave. `fetch` injetável para testes.
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const { lerChave } = require('./ambiente');
const { ErroOpenRouter, limparSegredos } = require('./erros');
const util = require('./util');
const registro = require('../log/registro');

const BASE = 'https://openrouter.ai/api/v1';
const TRANSITORIOS = new Set([408, 425, 429, 500, 502, 503, 504, 524, 529]);
const CA_AVAST = 'E:\\AutoShortEditorDados\\ferramentas\\ca-com-avast.pem';

/**
 * criarCliente({ fetch, chave, base, timeoutMs, tentativas, esperaBaseMs, esperaMaxMs, dormir })
 * A chave fica só no fechamento (closure): o objeto devolvido não a expõe.
 *
 * pedirJson(metodo, caminho, { corpo, repetir, timeoutMs }) → JSON da resposta
 *   repetir: 'sempre' (padrão do GET: rede + 408/429/5xx) · 'so429' (padrão do POST: pedido pago nunca é
 *   repetido em 5xx/timeout, porque o job pode ter sido criado) · 'nunca'.
 * baixar(url, destino, { timeoutMs }) → { bytes, destino } (só manda a chave para URLs do próprio OpenRouter)
 */
function criarCliente(opcoes = {}) {
    const fetchFn = opcoes.fetch || globalThis.fetch;
    const chave = opcoes.chave !== undefined ? opcoes.chave : lerChave();
    const base = (opcoes.base || BASE).replace(/\/+$/, '');
    const timeoutPadrao = opcoes.timeoutMs ?? 60000;
    const tentativas = Math.max(1, opcoes.tentativas ?? 4);
    const esperaBaseMs = opcoes.esperaBaseMs ?? 1000;
    const esperaMaxMs = opcoes.esperaMaxMs ?? 30000;
    const dormir = opcoes.dormir || util.dormir;
    const limpar = (t) => limparSegredos(t, [chave]);

    function urlDe(caminho) {
        return util.ehUrl(caminho) ? caminho : `${base}${caminho.startsWith('/') ? '' : '/'}${caminho}`;
    }

    // A chave só vai para a própria API do OpenRouter.
    function podeAutenticar(url) {
        return url.startsWith(`${base}/`) || url.startsWith('https://openrouter.ai/api/');
    }

    function cabecalhos(url, temCorpo) {
        const h = { Accept: 'application/json', 'HTTP-Referer': 'http://127.0.0.1:4190', 'X-Title': 'Estudio de Series' };
        if (temCorpo) h['Content-Type'] = 'application/json';
        if (podeAutenticar(url)) {
            if (!chave) {
                throw new ErroOpenRouter('Sem chave do OpenRouter no ambiente (ASE_OPENROUTER_KEY ou OPENROUTER_API_KEY).', { status: 401 });
            }
            h.Authorization = `Bearer ${chave}`;
        }
        return h;
    }

    function esperaPara(n, resposta) {
        const ra = resposta && resposta.headers && resposta.headers.get && resposta.headers.get('retry-after');
        const s = Number(ra);
        if (ra && Number.isFinite(s) && s >= 0) return Math.min(s * 1000, 60000);
        return Math.min(esperaBaseMs * 2 ** (n - 1), esperaMaxMs);
    }

    function erroDeRede(e, metodo, url, timeoutMs) {
        const codigo = (e && e.cause && e.cause.code) || (e && e.code) || '';
        const ehTimeout = e && (e.name === 'AbortError' || e.name === 'TimeoutError');
        const pago = metodo !== 'GET';
        const rota = url.replace(base, '');
        let msg;
        if (ehTimeout) {
            msg = `O OpenRouter não respondeu em ${Math.round(timeoutMs / 1000)} s (${metodo} ${rota}).`;
        } else if (/CERT|SELF_SIGNED|UNABLE_TO_GET_ISSUER|UNABLE_TO_VERIFY/i.test(`${codigo} ${e && e.cause && e.cause.message}`)) {
            msg = `Falha de certificado ao falar com o OpenRouter (${codigo}). O Avast reassina o TLS: inicie o servidor com NODE_EXTRA_CA_CERTS=${CA_AVAST}.`;
        } else {
            msg = `Falha de rede ao falar com o OpenRouter (${metodo} ${rota}${codigo ? `, ${codigo}` : ''}).`;
        }
        if (pago) msg += ' O pedido pode ter chegado: confira antes de repetir.';
        return new ErroOpenRouter(limpar(msg), { status: 0, codigo: codigo || (ehTimeout ? 'TIMEOUT' : 'REDE'), incerto: pago });
    }

    function erroHttp(status, texto) {
        let detalhe = '';
        try {
            const j = JSON.parse(texto);
            const er = j && j.error;
            if (er) {
                detalhe = typeof er === 'string' ? er : (er.message || '');
                const raw = er.metadata && (er.metadata.raw || er.metadata.provider_name);
                if (raw && typeof raw === 'string' && !detalhe.includes(raw)) detalhe += ` (${raw})`;
            }
        } catch {
            detalhe = texto || '';
        }
        detalhe = limpar(String(detalhe).replace(/\s+/g, ' ').trim()).slice(0, 500);
        const sufixo = detalhe ? `: ${detalhe}` : '.';
        const mensagens = {
            400: `O OpenRouter recusou o pedido (400)${sufixo}`,
            401: 'Chave do OpenRouter inválida ou ausente (401).',
            402: `Sem crédito suficiente no OpenRouter (402)${sufixo}`,
            403: `Sem permissão para esta operação no OpenRouter (403)${sufixo}`,
            404: `Não encontrado no OpenRouter (404)${sufixo}`,
            408: 'O OpenRouter demorou demais para responder (408).',
            413: 'Pedido grande demais para o OpenRouter (413): reduza as imagens anexadas.',
            429: 'Limite de requisições do OpenRouter atingido (429). Tente de novo em instantes.',
        };
        const msg = mensagens[status] || (status >= 500
            ? `Falha no OpenRouter ou no provedor (${status})${sufixo}`
            : `Erro do OpenRouter (${status})${sufixo}`);
        return new ErroOpenRouter(msg, { status });
    }

    function deveRepetir(modo, status) {
        if (modo === 'nunca') return false;
        if (modo === 'so429') return status === 429;
        return TRANSITORIOS.has(status);
    }

    // Registro: só método, caminho (sem query) e status — nunca cabeçalhos, chave nem corpo.
    const rotaLog = (url) => limpar(url.replace(base, '').split('?')[0]).slice(0, 120);
    function logApi(nivel, evento, metodo, url, msg, dados = {}) {
        registro.registrar({ nivel, area: 'openrouter', evento, msg, dados: { metodo, rota: rotaLog(url), ...dados } });
    }

    async function chamar(metodo, url, { corpo, repetir, timeoutMs }) {
        const modo = repetir || (metodo === 'GET' ? 'sempre' : 'so429');
        const h = cabecalhos(url, corpo !== undefined);
        for (let n = 1; ; n++) {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), timeoutMs);
            let resposta;
            try {
                resposta = await fetchFn(url, {
                    method: metodo,
                    headers: h,
                    body: corpo === undefined ? undefined : JSON.stringify(corpo),
                    signal: ctrl.signal,
                });
            } catch (e) {
                clearTimeout(timer);
                if (modo === 'sempre' && n < tentativas) {
                    logApi('aviso', 'repetindo', metodo, url, `Falha de rede com o OpenRouter: tentativa ${n + 1} de ${tentativas}`, { tentativa: n });
                    await dormir(esperaPara(n));
                    continue;
                }
                const er = erroDeRede(e, metodo, url, timeoutMs);
                logApi('erro', 'erro-api', metodo, url, er.message, { codigo: er.codigo, incerto: er.incerto });
                throw er;
            }
            if (resposta.ok) return { resposta, timer };
            clearTimeout(timer);
            const texto = await resposta.text().catch(() => '');
            if (deveRepetir(modo, resposta.status) && n < tentativas) {
                logApi('aviso', 'repetindo', metodo, url, `OpenRouter respondeu ${resposta.status}: tentativa ${n + 1} de ${tentativas}`, { status: resposta.status, tentativa: n });
                await dormir(esperaPara(n, resposta));
                continue;
            }
            const er = erroHttp(resposta.status, texto);
            logApi(resposta.status >= 500 || resposta.status === 401 || resposta.status === 402 ? 'erro' : 'aviso', 'erro-api', metodo, url, er.message, { status: resposta.status });
            throw er;
        }
    }

    async function pedirJson(metodo, caminho, { corpo, repetir, timeoutMs = timeoutPadrao } = {}) {
        const url = urlDe(caminho);
        const { resposta, timer } = await chamar(metodo, url, { corpo, repetir, timeoutMs });
        try {
            const texto = await resposta.text();
            try {
                return texto ? JSON.parse(texto) : {};
            } catch {
                throw new ErroOpenRouter(`Resposta inválida do OpenRouter (${metodo} ${url.replace(base, '')}).`, { status: resposta.status });
            }
        } catch (e) {
            if (e instanceof ErroOpenRouter) throw e;
            throw erroDeRede(e, metodo, url, timeoutMs);
        } finally {
            clearTimeout(timer);
        }
    }

    async function baixar(alvo, destino, { timeoutMs = 10 * 60 * 1000 } = {}) {
        const url = urlDe(alvo);
        await fsp.mkdir(path.dirname(destino), { recursive: true });
        const parcial = `${destino}.parcial`;
        const { resposta, timer } = await chamar('GET', url, { repetir: 'sempre', timeoutMs });
        try {
            if (!resposta.body) throw new ErroOpenRouter('O OpenRouter devolveu o arquivo vazio.', { status: resposta.status });
            await pipeline(Readable.fromWeb(resposta.body), fs.createWriteStream(parcial));
            const { size } = await fsp.stat(parcial);
            if (!size) throw new ErroOpenRouter('O OpenRouter devolveu o arquivo vazio.', { status: resposta.status });
            await fsp.rename(parcial, destino);
            return { bytes: size, destino };
        } catch (e) {
            await fsp.rm(parcial, { force: true }).catch(() => {});
            if (e instanceof ErroOpenRouter) throw e;
            throw new ErroOpenRouter(limpar(`Falha ao baixar o resultado: ${e.message}`), { status: 0 });
        } finally {
            clearTimeout(timer);
        }
    }

    return {
        simulado: false,
        temChave: Boolean(chave),
        base,
        pedirJson,
        baixar,
        // nunca serializar segredos
        toJSON() { return { simulado: false, temChave: Boolean(chave), base }; },
    };
}

module.exports = { criarCliente, BASE, CA_AVAST };
