// Armazém das séries: uma pasta por série em <ESTUDIO_DADOS>/series/<id>/ (formato em docs/CONTRATOS.md).
// Toda gravação de JSON é atômica (arquivo temporário + rename) e guarda o anterior em <serie>/.bak/.
// Todas as funções aceitam { raiz } nas opções (testes usam pasta temporária); sem ela vale ESTUDIO_DADOS.
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const validar = require('./validar');

const RAIZ_PADRAO = 'E:\\EstudioSeriesDados';
const MAX_BACKUPS_POR_ARQUIVO = 10;
const SEM_PADRAO = Symbol('semPadrao');

function raizDados(opcoes = {}) {
    return path.resolve(opcoes.raiz || process.env.ESTUDIO_DADOS || RAIZ_PADRAO);
}

// Erro com status HTTP (os controllers usam error.status; o resto cai em 500).
function erro(mensagem, status = 400, extra = {}) {
    const e = new Error(mensagem);
    e.status = status;
    Object.assign(e, extra);
    return e;
}

function slug(texto) {
    return String(texto || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80)
        .replace(/-+$/g, '');
}

function dentroDe(base, alvo) {
    const rel = path.relative(path.resolve(base), path.resolve(alvo));
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function exigirId(id, oque = 'id') {
    if (!validar.ehSlug(id)) throw erro(`${oque} inválido ("${String(id).slice(0, 40)}"): use minúsculas, números e hífens.`);
    return id;
}

// Resolve um caminho RELATIVO dentro de "base"; recusa absoluto, "..", e qualquer coisa que saia da base.
function resolverDentro(base, relativo) {
    if (!validar.caminhoRelativoSeguro(relativo)) throw erro(`Caminho recusado ("${String(relativo).slice(0, 80)}"): use um caminho relativo, sem "..".`);
    const alvo = path.resolve(base, relativo);
    if (!dentroDe(base, alvo) || path.resolve(base) === alvo) throw erro('Caminho fora da pasta permitida.');
    return alvo;
}

// Caminho relativo com "/" (como fica gravado nos JSON).
function relativoPosix(base, alvo) {
    return path.relative(base, alvo).split(path.sep).join('/');
}

function pastaSeries(opcoes = {}) {
    return path.join(raizDados(opcoes), 'series');
}

function pastaSerie(id, opcoes = {}) {
    exigirId(id, 'id da série');
    const base = pastaSeries(opcoes);
    const pasta = path.resolve(base, id);
    if (!dentroDe(base, pasta) || pasta === path.resolve(base)) throw erro('Caminho fora da pasta de dados.');
    return pasta;
}

function existe(caminho) {
    return fs.existsSync(caminho);
}

// ---------- JSON: leitura, gravação atômica, backup e trava ----------
async function lerJson(caminho, padrao = SEM_PADRAO) {
    let texto;
    try {
        texto = await fsp.readFile(caminho, 'utf8');
    } catch (e) {
        if (e.code === 'ENOENT') {
            if (padrao !== SEM_PADRAO) return padrao;
            throw erro(`Arquivo não encontrado: ${path.basename(caminho)}.`, 404);
        }
        throw e;
    }
    try {
        return JSON.parse(texto.replace(/^\uFEFF/, ''));
    } catch (e) {
        throw erro(`JSON inválido em ${path.basename(caminho)}: ${e.message}`, 500);
    }
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// No Windows o antivírus às vezes segura o arquivo por alguns ms: tenta de novo.
async function renomearComRetentativa(de, para) {
    for (let tentativa = 0; ; tentativa++) {
        try {
            await fsp.rename(de, para);
            return;
        } catch (e) {
            if (!['EPERM', 'EBUSY', 'EACCES'].includes(e.code) || tentativa >= 8) throw e;
            await esperar(40 * (tentativa + 1));
        }
    }
}

async function fazerBackup(caminho, pastaBak) {
    if (!existe(caminho)) return null;
    await fsp.mkdir(pastaBak, { recursive: true });
    const nome = path.basename(caminho);
    const carimbo = new Date().toISOString().replace(/[:.]/g, '-');
    const destino = path.join(pastaBak, `${nome}.${carimbo}.${crypto.randomBytes(2).toString('hex')}.bak`);
    await fsp.copyFile(caminho, destino);
    // Mantém só os últimos N backups deste arquivo.
    const antigos = (await fsp.readdir(pastaBak)).filter((n) => n.startsWith(`${nome}.`) && n.endsWith('.bak')).sort();
    for (const velho of antigos.slice(0, Math.max(0, antigos.length - MAX_BACKUPS_POR_ARQUIVO))) {
        await fsp.rm(path.join(pastaBak, velho), { force: true });
    }
    return destino;
}

// Grava JSON de forma atômica. Se o conteúdo (o JSON, não a formatação) não mudou, não grava nem faz backup.
async function escreverJsonAtomico(caminho, dados, { pastaBak } = {}) {
    const texto = `${JSON.stringify(dados, null, 2)}\n`;
    try {
        const atual = await fsp.readFile(caminho, 'utf8');
        if (atual === texto) return false;
        try {
            if (JSON.stringify(JSON.parse(atual.replace(/^﻿/, ''))) === JSON.stringify(dados)) return false;
        } catch {
            // arquivo atual corrompido: grava o novo (o antigo vai para o backup)
        }
    } catch (e) {
        if (e.code !== 'ENOENT') throw e;
    }
    await fsp.mkdir(path.dirname(caminho), { recursive: true });
    const tmp = `${caminho}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    const fh = await fsp.open(tmp, 'wx');
    try {
        await fh.writeFile(texto, 'utf8');
        await fh.sync();
    } finally {
        await fh.close();
    }
    try {
        if (pastaBak) await fazerBackup(caminho, pastaBak);
        await renomearComRetentativa(tmp, caminho);
    } catch (e) {
        await fsp.rm(tmp, { force: true });
        throw e;
    }
    return true;
}

// Fila por chave: operações de ler-alterar-gravar no mesmo arquivo nunca se atropelam (no mesmo processo).
const travas = new Map();
function comTrava(chave, fn) {
    const k = process.platform === 'win32' ? String(chave).toLowerCase() : String(chave);
    const anterior = travas.get(k) || Promise.resolve();
    const atual = anterior.then(() => fn());
    const guardada = atual.catch(() => {});
    travas.set(k, guardada);
    guardada.then(() => { if (travas.get(k) === guardada) travas.delete(k); });
    return atual;
}

// Backup de qualquer arquivo da série vai para <serie>/.bak/<mesmo caminho relativo>.
function pastaBakDe(pastaDaSerie, caminho) {
    return path.join(pastaDaSerie, '.bak', path.dirname(path.relative(pastaDaSerie, caminho)));
}

async function gravarNaSerie(pastaDaSerie, caminho, dados) {
    if (!dentroDe(pastaDaSerie, caminho)) throw erro('Caminho fora da pasta da série.');
    return escreverJsonAtomico(caminho, dados, { pastaBak: pastaBakDe(pastaDaSerie, caminho) });
}

// Lê, aplica "mutar" (pode alterar o objeto ou devolver outro), valida e grava — tudo sob a trava do arquivo.
async function atualizarNaSerie(pastaDaSerie, caminho, mutar, { padrao = SEM_PADRAO, validador } = {}) {
    return comTrava(caminho, async () => {
        const atual = await lerJson(caminho, padrao === SEM_PADRAO ? SEM_PADRAO : structuredClone(padrao));
        const novo = (await mutar(atual)) || atual;
        if (validador) exigirValido(validador(novo), path.basename(caminho));
        await gravarNaSerie(pastaDaSerie, caminho, novo);
        return novo;
    });
}

function exigirValido(resultado, nome) {
    if (!resultado.ok) {
        throw erro(`${nome} inválido: ${resultado.erros.join(' ')}`, 400, { erros: resultado.erros, avisos: resultado.avisos });
    }
    return resultado;
}

// ---------- Séries ----------
function modeloSerie({ id, titulo, genero, ideia }) {
    return {
        versao: 1,
        id,
        titulo,
        genero: genero || '',
        idioma: 'pt-BR',
        formato: { largura: 1080, altura: 1920, proporcao: '9:16' },
        duracaoAlvoS: 60,
        criadaEm: new Date().toISOString(),
        orcamento: { tetoPlanoUsd: 1.0, tetoEpisodioUsd: 4.0, tetoSerieUsd: 40.0 },
        modelos: {
            texto: 'openai/gpt-6-luna',
            imagem: 'google/gemini-3.1-flash-image',
            videoRascunho: 'bytedance/seedance-1-5-pro',
            videoFinal: 'google/veo-3.1-lite',
            apresentador: 'heygen/avatar-iv',
        },
        vozes: { narrador: 'de-DE-FlorianMultilingualNeural', alerta: 'en-US-BrianMultilingualNeural' },
        tons: {},
        etapa: 'ideia',
        ideia: ideia || '',
        episodios: [],
    };
}

function bibliaVazia() {
    return {
        versao: 1,
        premissa: '',
        regras: [],
        cronologia: [],
        recursos: {},
        objetos: [],
        personagens: [],
        segredos: { personagens: [], publico: [] },
        misterios: [],
        escolhas: [],
        temporada: [],
    };
}

async function criarSerie({ titulo, genero = '', ideia = '' } = {}, opcoes = {}) {
    const tituloLimpo = String(titulo || '').trim();
    if (!tituloLimpo) throw erro('Informe o título da série.');
    const id = slug(tituloLimpo);
    if (!id) throw erro('O título precisa ter letras ou números.');
    const pasta = pastaSerie(id, opcoes);
    return comTrava(`serie:${pasta}`, async () => {
        if (existe(pasta)) throw erro(`A série "${tituloLimpo}" já existe (${id}).`, 409);
        const serie = modeloSerie({ id, titulo: tituloLimpo, genero: String(genero || '').trim(), ideia: String(ideia || '').trim() });
        exigirValido(validar.validarSerie(serie), 'serie.json');
        const base = pastaSeries(opcoes);
        await fsp.mkdir(base, { recursive: true });
        // Monta numa pasta temporária e renomeia no fim: ou a série aparece inteira, ou não aparece.
        const tmp = path.join(base, `.criando-${id}-${crypto.randomBytes(3).toString('hex')}`);
        await fsp.mkdir(tmp);
        try {
            for (const sub of ['elenco', 'locais', 'objetos', 'episodios']) await fsp.mkdir(path.join(tmp, sub));
            await escreverJsonAtomico(path.join(tmp, 'serie.json'), serie);
            await escreverJsonAtomico(path.join(tmp, 'biblia.json'), bibliaVazia());
            await escreverJsonAtomico(path.join(tmp, 'jobs.json'), { versao: 1, jobs: [] });
            await fsp.writeFile(path.join(tmp, 'custos.jsonl'), '', { flag: 'wx' });
            if (existe(pasta)) throw erro(`A série "${tituloLimpo}" já existe (${id}).`, 409);
            await renomearComRetentativa(tmp, pasta);
        } catch (e) {
            await fsp.rm(tmp, { recursive: true, force: true });
            throw e;
        }
        return serie;
    });
}

async function listarSeries(opcoes = {}) {
    const base = pastaSeries(opcoes);
    let entradas;
    try {
        entradas = await fsp.readdir(base, { withFileTypes: true });
    } catch (e) {
        if (e.code === 'ENOENT') return [];
        throw e;
    }
    const lista = [];
    for (const ent of entradas) {
        if (!ent.isDirectory() || ent.name.startsWith('.') || !validar.ehSlug(ent.name)) continue;
        const caminho = path.join(base, ent.name, 'serie.json');
        if (!existe(caminho)) continue;
        try {
            const s = await lerJson(caminho);
            lista.push({
                id: s.id || ent.name,
                titulo: s.titulo || ent.name,
                genero: s.genero || '',
                etapa: s.etapa || null,
                criadaEm: s.criadaEm || null,
                episodios: Array.isArray(s.episodios) ? s.episodios.length : 0,
            });
        } catch (e) {
            lista.push({ id: ent.name, titulo: ent.name, erro: e.message });
        }
    }
    return lista.sort((a, b) => String(a.titulo).localeCompare(String(b.titulo), 'pt-BR'));
}

async function exigirSerie(id, opcoes = {}) {
    const pasta = pastaSerie(id, opcoes);
    if (!existe(path.join(pasta, 'serie.json'))) throw erro(`Série não encontrada: ${id}.`, 404);
    return pasta;
}

async function lerSerie(id, opcoes = {}) {
    const pasta = await exigirSerie(id, opcoes);
    return lerJson(path.join(pasta, 'serie.json'));
}

async function salvarSerie(id, dados, opcoes = {}) {
    const pasta = await exigirSerie(id, opcoes);
    if (!dados || typeof dados !== 'object') throw erro('serie.json precisa ser um objeto.');
    if (dados.id !== undefined && dados.id !== id) throw erro(`O id do conteúdo (${dados.id}) não bate com a série (${id}).`);
    const serie = { ...dados, id };
    exigirValido(validar.validarSerie(serie), 'serie.json');
    const caminho = path.join(pasta, 'serie.json');
    await comTrava(caminho, () => gravarNaSerie(pasta, caminho, serie));
    return serie;
}

// Ler-alterar-gravar do serie.json com trava (use em vez de lerSerie + salvarSerie).
async function atualizarSerie(id, mutar, opcoes = {}) {
    const pasta = await exigirSerie(id, opcoes);
    return atualizarNaSerie(pasta, path.join(pasta, 'serie.json'), mutar, { validador: validar.validarSerie });
}

async function lerBiblia(id, opcoes = {}) {
    const pasta = await exigirSerie(id, opcoes);
    return lerJson(path.join(pasta, 'biblia.json'), bibliaVazia());
}

async function salvarBiblia(id, dados, opcoes = {}) {
    const pasta = await exigirSerie(id, opcoes);
    exigirValido(validar.validarBiblia(dados), 'biblia.json');
    const caminho = path.join(pasta, 'biblia.json');
    await comTrava(caminho, () => gravarNaSerie(pasta, caminho, dados));
    return dados;
}

async function atualizarBiblia(id, mutar, opcoes = {}) {
    const pasta = await exigirSerie(id, opcoes);
    return atualizarNaSerie(pasta, path.join(pasta, 'biblia.json'), mutar, { padrao: bibliaVazia(), validador: validar.validarBiblia });
}

module.exports = {
    RAIZ_PADRAO,
    raizDados,
    erro,
    slug,
    dentroDe,
    exigirId,
    resolverDentro,
    relativoPosix,
    pastaSeries,
    pastaSerie,
    exigirSerie,
    lerJson,
    escreverJsonAtomico,
    gravarNaSerie,
    atualizarNaSerie,
    exigirValido,
    comTrava,
    modeloSerie,
    bibliaVazia,
    criarSerie,
    listarSeries,
    lerSerie,
    salvarSerie,
    atualizarSerie,
    lerBiblia,
    salvarBiblia,
    atualizarBiblia,
};
