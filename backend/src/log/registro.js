// Registro (log) do Estúdio: uma linha JSON por evento em logs/registro-AAAA-MM-DD.jsonl (data local do PC).
// Campos: em (ISO), nivel (info|aviso|erro), area, evento, serie, ep, ms, custoUsd, msg (português), dados (pequeno).
// Também espelha no console de forma legível (o scripts/dev.js grava o console em logs/estudio-<data>.log).
//
// Regras: nunca grava a chave do OpenRouter, tokens de confirmação, Authorization nem corpos grandes (base64,
// áudio, mídia). Registrar nunca derruba quem chamou: qualquer falha aqui é engolida.
//
// Ambiente:
//   ESTUDIO_LOGS          pasta dos registros (padrão: <projeto>/logs)
//   ESTUDIO_LOG_DIAS      quantos dias guardar (padrão 30; o resto é apagado ao iniciar o servidor)
//   ESTUDIO_LOG_CONSOLE   "0" desliga o espelho no console; "1" liga mesmo dentro do node --test
//   ESTUDIO_LOG_DESLIGADO "1" não grava nada
// Dentro do `node --test` (NODE_TEST_CONTEXT) sem ESTUDIO_LOGS o registro fica desligado: os testes não sujam logs/.
const fs = require('fs');
const path = require('path');
const { limparSegredos } = require('../openrouter/erros');

const NIVEIS = ['info', 'aviso', 'erro'];
const AREAS = ['http', 'showrunner', 'openrouter', 'job', 'audio', 'legenda', 'edicao', 'render', 'lixeira', 'memoria', 'serie', 'sistema'];
const PASTA_PADRAO = path.join(__dirname, '..', '..', '..', 'logs');
const RE_ARQUIVO = /^registro-(\d{4}-\d{2}-\d{2})\.jsonl$/;
const OCULTO = '[oculto]';

const MAX_MSG = 600;
const MAX_TEXTO = 300;
const MAX_DADOS = 4000;
const MAX_ITENS = 20;
const MAX_CHAVES = 30;
const MAX_PROFUNDIDADE = 4;

function pastaLogs() {
    return process.env.ESTUDIO_LOGS || PASTA_PADRAO;
}

function ativo() {
    if (process.env.ESTUDIO_LOG_DESLIGADO === '1') return false;
    if (process.env.ESTUDIO_LOGS) return true;
    return !process.env.NODE_TEST_CONTEXT;
}

function consoleAtivo() {
    if (process.env.ESTUDIO_LOG_CONSOLE === '0') return false;
    if (process.env.ESTUDIO_LOG_CONSOLE === '1') return true;
    return !process.env.NODE_TEST_CONTEXT;
}

const dois = (n) => String(n).padStart(2, '0');
// Dia LOCAL (o Rafael lê "hoje" no fuso dele, não em UTC).
function diaDe(data = new Date()) {
    const d = data instanceof Date ? data : new Date(data);
    return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
}

function arquivoDoDia(dia = diaDe(), pasta = pastaLogs()) {
    return path.join(pasta, `registro-${dia}.jsonl`);
}

// ---------------------------------------------------------------- limpeza (segredos e tamanho)
// Nomes de campo que nunca vão para o registro (o valor vira [oculto]; booleanos ficam: não carregam segredo).
const RE_CAMPO_SECRETO = /token|chave|apikey|api_key|^key$|authorization|senha|password|secret|segredo|cookie|bearer/i;
// Campos de conteúdo grande (mídia, base64, corpo de requisição, prompt inteiro).
const RE_CAMPO_GRANDE = /^(base64|dataUrl|data_url|b64_json|imagem64|audio64|conteudo|corpo|body|buffer|bytes64|mensagens|messages|prompt)$/i;

function cortar(texto, max = MAX_TEXTO) {
    const t = String(texto);
    return t.length > max ? `${t.slice(0, max)}… (+${t.length - max})` : t;
}

// Texto livre: tira chave/Bearer, troca base64/data URL por um resumo e corta.
function limparTexto(valor, max = MAX_TEXTO) {
    if (valor === undefined || valor === null) return '';
    let t = limparSegredos(String(valor));
    t = t.replace(/data:[a-z]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi, (m) => `[data URL, ${m.length} caracteres]`);
    t = t.replace(/[A-Za-z0-9+/=_-]{160,}/g, (m) => `[texto codificado, ${m.length} caracteres]`);
    return cortar(t, max);
}

function limparValor(v, profundidade) {
    if (v === null || v === undefined) return v;
    if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 1e6) / 1e6 : null;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'string') return limparTexto(v);
    if (typeof v === 'bigint') return Number(v);
    if (typeof v === 'function' || typeof v === 'symbol') return undefined;
    if (Buffer.isBuffer(v) || ArrayBuffer.isView(v)) return `[binário, ${v.byteLength} bytes]`;
    if (v instanceof Error) return { erro: limparTexto(v.message, MAX_MSG), ...(v.status ? { status: v.status } : {}), ...(v.code ? { codigo: String(v.code) } : {}) };
    if (v instanceof Date) return v.toISOString();
    if (profundidade >= MAX_PROFUNDIDADE) return Array.isArray(v) ? `[lista com ${v.length}]` : '[objeto]';
    if (Array.isArray(v)) {
        const out = v.slice(0, MAX_ITENS).map((x) => limparValor(x, profundidade + 1));
        if (v.length > MAX_ITENS) out.push(`… mais ${v.length - MAX_ITENS}`);
        return out;
    }
    const out = {};
    const chaves = Object.keys(v);
    for (const k of chaves.slice(0, MAX_CHAVES)) {
        const x = v[k];
        if (x === undefined || typeof x === 'function') continue;
        if (RE_CAMPO_SECRETO.test(k) && typeof x !== 'boolean') { out[k] = OCULTO; continue; }
        if (RE_CAMPO_GRANDE.test(k) && x !== null && typeof x === 'object') { out[k] = Array.isArray(x) ? `[lista com ${x.length}]` : '[omitido]'; continue; }
        if (RE_CAMPO_GRANDE.test(k) && typeof x === 'string' && x.length > 80) { out[k] = `[omitido, ${x.length} caracteres]`; continue; }
        out[k] = limparValor(x, profundidade + 1);
    }
    if (chaves.length > MAX_CHAVES) out['…'] = `mais ${chaves.length - MAX_CHAVES} campos`;
    return out;
}

/** Objeto pequeno e sem segredos para o campo `dados`. */
function limparDados(dados) {
    if (dados === undefined || dados === null) return undefined;
    let d = limparValor(dados, 0);
    if (d === undefined) return undefined;
    if (typeof d !== 'object' || Array.isArray(d)) d = { valor: d };
    let json = JSON.stringify(d);
    if (json.length > MAX_DADOS) {
        // grande demais: guarda só os campos simples
        const simples = {};
        for (const [k, v] of Object.entries(d)) if (v === null || ['string', 'number', 'boolean'].includes(typeof v)) simples[k] = v;
        simples.cortado = `dados com ${json.length} caracteres: ficaram só os campos simples`;
        json = JSON.stringify(simples);
        d = json.length > MAX_DADOS ? { cortado: `dados com ${json.length} caracteres` } : simples;
    }
    return d;
}

function numeroOuNada(v) {
    if (v === undefined || v === null || v === '') return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
}

function epDe(ep) {
    if (ep === undefined || ep === null || ep === '') return undefined;
    const m = /^ep?(\d+)$/i.exec(String(ep).trim());
    if (m) return Number(m[1]);
    const n = Number(ep);
    return Number.isFinite(n) ? n : limparTexto(ep, 20);
}

/** Monta a linha (pura: testável). */
function montarLinha({ nivel = 'info', area = 'sistema', evento = 'evento', msg = '', serie, ep, ms, custoUsd, dados, erro, em } = {}) {
    const linha = {
        em: em || new Date().toISOString(),
        nivel: NIVEIS.includes(nivel) ? nivel : 'info',
        area: AREAS.includes(area) ? area : 'sistema',
        evento: limparTexto(evento || 'evento', 60),
    };
    if (serie !== undefined && serie !== null && serie !== '') linha.serie = limparTexto(serie, 90);
    const e = epDe(ep);
    if (e !== undefined) linha.ep = e;
    const t = numeroOuNada(ms);
    if (t !== undefined) linha.ms = Math.round(t);
    const c = numeroOuNada(custoUsd);
    if (c !== undefined) linha.custoUsd = Math.round(c * 1e6) / 1e6;
    let texto = msg;
    if (!texto && erro) texto = erro.message || String(erro);
    linha.msg = limparTexto(texto || '', MAX_MSG);
    let d = dados;
    if (erro) d = { ...(d || {}), erro: erro instanceof Error ? erro : { erro: String(erro) } };
    const limpos = limparDados(d);
    if (limpos && Object.keys(limpos).length) linha.dados = limpos;
    return linha;
}

// ---------------------------------------------------------------- escrita
let pastaCriada = null;
const ouvintes = new Set();

function espelharNoConsole(l) {
    if (!consoleAtivo()) return;
    try {
        const hora = new Date(l.em).toLocaleTimeString('pt-BR', { hour12: false });
        const onde = [l.serie, l.ep !== undefined ? `ep${l.ep}` : null].filter(Boolean).join(' ');
        const extra = [l.ms !== undefined ? `${l.ms} ms` : null, l.custoUsd !== undefined ? `US$ ${l.custoUsd}` : null].filter(Boolean).join(', ');
        const marca = l.nivel === 'erro' ? 'ERRO ' : l.nivel === 'aviso' ? 'AVISO ' : '';
        const texto = `${hora} ${marca}[${l.area}] ${l.evento}${onde ? ` (${onde})` : ''}${l.msg ? ` — ${l.msg}` : ''}${extra ? ` · ${extra}` : ''}`;
        (l.nivel === 'erro' ? console.error : console.log)(texto);
    } catch { /* console indisponível */ }
}

/** Grava um evento. Nunca lança. Devolve a linha gravada (ou null). */
function registrar(evento = {}) {
    try {
        const linha = montarLinha(evento);
        if (ativo()) {
            const pasta = pastaLogs();
            if (pastaCriada !== pasta) { fs.mkdirSync(pasta, { recursive: true }); pastaCriada = pasta; }
            fs.appendFileSync(arquivoDoDia(diaDe(new Date(linha.em)), pasta), `${JSON.stringify(linha)}\n`, 'utf8');
        }
        espelharNoConsole(linha);
        for (const f of ouvintes) { try { f(linha); } catch { /* ouvinte com defeito */ } }
        return linha;
    } catch {
        return null;
    }
}

const atalho = (nivel) => (area, evento, msg, extra = {}) => registrar({ ...extra, nivel, area, evento, msg });
const info = atalho('info');
const aviso = atalho('aviso');
const erro = atalho('erro');

/** Cronômetro: const fim = cronometro(); ... fim() → ms decorridos. */
function cronometro() {
    const t0 = process.hrtime.bigint();
    return () => Number((process.hrtime.bigint() - t0) / 1000000n);
}

/**
 * medir(fn, { area, evento, msg, serie, ep, dados, depois }) — roda fn, registra o fim (com ms) ou o erro e
 * devolve/relança o mesmo resultado. `depois(resultado)` pode devolver campos extras { msg, dados, custoUsd, nivel }.
 */
async function medir(fn, op = {}) {
    const fim = cronometro();
    try {
        const r = await fn();
        let extra = {};
        try { extra = (op.depois && op.depois(r)) || {}; } catch { extra = {}; }
        registrar({ ...op, ...extra, dados: { ...(op.dados || {}), ...(extra.dados || {}) }, ms: fim() });
        return r;
    } catch (e) {
        registrar({ ...op, nivel: 'erro', evento: `${op.evento || 'evento'}-falhou`, msg: `${op.msgErro || op.msg || 'Falhou'}: ${e && e.message}`, ms: fim(), erro: e });
        throw e;
    }
}

/** Para testes e para a tela: avisa a cada linha registrada. Devolve a função que desliga. */
function ouvir(f) {
    ouvintes.add(f);
    return () => ouvintes.delete(f);
}

// ---------------------------------------------------------------- retenção
function diasParaGuardar() {
    const n = Number(process.env.ESTUDIO_LOG_DIAS);
    return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 30;
}

/**
 * Apaga registro-AAAA-MM-DD.jsonl (e o estudio-AAAA-MM-DD.log do scripts/dev.js) com mais de `dias` dias.
 * Só mexe nesses dois padrões de nome. → { apagados: [nomes], dias }
 */
function limparAntigos({ dias = diasParaGuardar(), pasta = pastaLogs(), agora = new Date() } = {}) {
    const apagados = [];
    let nomes = [];
    try { nomes = fs.readdirSync(pasta); } catch { return { apagados, dias }; }
    const limite = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - dias);
    const corte = diaDe(limite);
    for (const nome of nomes) {
        const m = RE_ARQUIVO.exec(nome) || /^estudio-(\d{4}-\d{2}-\d{2})\.log$/.exec(nome);
        if (!m || m[1] >= corte) continue;
        try { fs.unlinkSync(path.join(pasta, nome)); apagados.push(nome); } catch { /* em uso */ }
    }
    return { apagados, dias };
}

module.exports = {
    NIVEIS, AREAS, RE_ARQUIVO,
    pastaLogs, ativo, diaDe, arquivoDoDia,
    limparTexto, limparDados, montarLinha,
    registrar, info, aviso, erro, cronometro, medir, ouvir,
    diasParaGuardar, limparAntigos,
};
