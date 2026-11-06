// Episódios: <serie>/episodios/epNN/ com roteiro.json, planos.json e votacao.json (formato em docs/CONTRATOS.md).
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const validar = require('./validar');
const armazem = require('./armazem');
const fichas = require('./fichas');

const { erro } = armazem;

function numeroEpisodio(n) {
    const num = typeof n === 'string' && n.trim() !== '' ? Number(n) : n;
    if (!Number.isInteger(num) || num < 1 || num > 999) throw erro('Número do episódio inválido (use de 1 a 999).');
    return num;
}

function idEpisodio(n) {
    return `ep${String(numeroEpisodio(n)).padStart(2, '0')}`;
}

function pastaEpisodio(serie, n, opcoes = {}) {
    return path.join(armazem.pastaSerie(serie, opcoes), 'episodios', idEpisodio(n));
}

// Garante a entrada { n, id, titulo, status, duracaoAlvoS?, semEscolha? } no serie.json (sem duplicar).
async function registrarNaSerie(serie, n, { titulo, status, duracaoAlvoS, semEscolha } = {}, opcoes = {}) {
    let entrada;
    await armazem.atualizarSerie(serie, (s) => {
        s.episodios = Array.isArray(s.episodios) ? s.episodios : [];
        entrada = s.episodios.find((e) => e.n === n);
        if (!entrada) {
            entrada = { n, id: idEpisodio(n), titulo: titulo || '', status: status || 'roteiro' };
            s.episodios.push(entrada);
            s.episodios.sort((a, b) => a.n - b.n);
        } else {
            if (titulo) entrada.titulo = titulo;
            if (status) entrada.status = status;
        }
        if (duracaoAlvoS !== undefined) entrada.duracaoAlvoS = duracaoAlvoS;
        if (semEscolha !== undefined) entrada.semEscolha = semEscolha;
        return s;
    }, opcoes);
    return entrada;
}

// Duração livre (s): número de 1 a 600, com até uma casa decimal.
function lerDuracao(valor) {
    if (valor === undefined || valor === null || valor === '') return undefined;
    const d = typeof valor === 'string' ? Number(valor.replace(',', '.')) : valor;
    if (!Number.isFinite(d) || d < validar.DURACAO_MIN_S || d > validar.DURACAO_MAX_S) {
        throw erro(`Duração inválida: use de ${validar.DURACAO_MIN_S} a ${validar.DURACAO_MAX_S} segundos.`);
    }
    return Math.round(d * 10) / 10;
}

/**
 * Cria o episódio (pasta + entrada no serie.json). n é opcional (próximo número livre).
 * extras: { duracaoAlvoS, semEscolha } — duração livre do episódio; abaixo de 20 s não há votação A/B por padrão.
 */
async function criarEpisodio(serie, n, titulo = '', opcoes = {}, extras = {}) {
    await armazem.exigirSerie(serie, opcoes);
    const duracaoAlvoS = lerDuracao(extras.duracaoAlvoS);
    let semEscolha = extras.semEscolha;
    if (semEscolha === undefined && duracaoAlvoS !== undefined) semEscolha = duracaoAlvoS < 20;
    if (semEscolha !== undefined) semEscolha = Boolean(semEscolha);
    return armazem.comTrava(`eps:${serie}`, async () => {
        const s = await armazem.lerSerie(serie, opcoes);
        const usados = (s.episodios || []).map((e) => e.n);
        const num = n === undefined || n === null || n === '' ? (usados.length ? Math.max(...usados) + 1 : 1) : numeroEpisodio(n);
        const pasta = pastaEpisodio(serie, num, opcoes);
        if (fs.existsSync(pasta) || usados.includes(num)) {
            throw erro(`O episódio ${num} já existe (${idEpisodio(num)}).`, 409);
        }
        await fsp.mkdir(pasta, { recursive: true });
        return registrarNaSerie(serie, num, { titulo: String(titulo || '').trim(), status: 'roteiro', duracaoAlvoS, semEscolha }, opcoes);
    });
}

async function exigirEpisodio(serie, n, opcoes = {}) {
    const s = await armazem.lerSerie(serie, opcoes);
    const num = numeroEpisodio(n);
    const pasta = pastaEpisodio(serie, num, opcoes);
    const entrada = (s.episodios || []).find((e) => e.n === num);
    if (!entrada && !fs.existsSync(pasta)) throw erro(`Episódio ${num} não encontrado na série ${serie}.`, 404);
    return { serie: s, num, pasta, entrada: entrada || { n: num, id: idEpisodio(num), titulo: '', status: 'roteiro' } };
}

async function lerEpisodio(serie, n, opcoes = {}) {
    const { num, pasta, entrada } = await exigirEpisodio(serie, n, opcoes);
    const ler = (nome) => armazem.lerJson(path.join(pasta, nome), null);
    return {
        ...entrada,
        n: num,
        pasta: `episodios/${idEpisodio(num)}`,
        roteiro: await ler('roteiro.json'),
        planos: await ler('planos.json'),
        votacao: await ler('votacao.json'),
    };
}

// Ids com ficha, para conferir "quem" fala e os locais/objetos citados no roteiro.
async function contextoDaSerie(serie, opcoes = {}) {
    const ids = async (tipo) => (await fichas.listarFichas(serie, tipo, opcoes)).filter((f) => !f.erro).map((f) => f.id);
    return { elenco: await ids('elenco'), locais: await ids('locais'), objetos: await ids('objetos') };
}

async function lerRoteiro(serie, n, opcoes = {}) {
    const { pasta } = await exigirEpisodio(serie, n, opcoes);
    return armazem.lerJson(path.join(pasta, 'roteiro.json'), null);
}

async function conferirDoc(serie, doc, opcoes) {
    return armazem.exigirValido(validar.validarRoteiro(doc, await contextoDaSerie(serie, opcoes)), 'roteiro.json');
}

// Só confere (mesmas regras do salvar, nada é gravado): 400 com "erros" se não passar. Devolve { avisos }.
async function conferirRoteiro(serie, n, roteiro, opcoes = {}) {
    await armazem.exigirSerie(serie, opcoes);
    const num = numeroEpisodio(n);
    if (!roteiro || typeof roteiro !== 'object' || Array.isArray(roteiro)) throw erro('O roteiro precisa ser um objeto.');
    if (roteiro.n !== undefined && roteiro.n !== num) throw erro(`O roteiro é do episódio ${roteiro.n}, não do ${num}.`);
    const s = await armazem.lerSerie(serie, opcoes);
    const doc = { versao: 1, n: num, ...roteiro, n: num };
    const entradaEp = (s.episodios || []).find((e) => e.n === num);
    if (doc.duracaoAlvoS === undefined) doc.duracaoAlvoS = (entradaEp && entradaEp.duracaoAlvoS) || s.duracaoAlvoS || 60;
    const r = await conferirDoc(serie, doc, opcoes);
    return { avisos: r.avisos };
}

/**
 * Valida e grava o roteiro (cria o episódio se ainda não existir). Erros de validação → status 400 com "erros".
 * Também deixa a escolha A/B do episódio na biblia.escolhas (sem mexer em votos já registrados).
 * Devolve { roteiro, avisos }.
 */
async function salvarRoteiro(serie, n, roteiro, opcoes = {}) {
    await armazem.exigirSerie(serie, opcoes);
    const num = numeroEpisodio(n);
    if (!roteiro || typeof roteiro !== 'object' || Array.isArray(roteiro)) throw erro('O roteiro precisa ser um objeto.');
    if (roteiro.n !== undefined && roteiro.n !== num) throw erro(`O roteiro é do episódio ${roteiro.n}, não do ${num}.`);
    const s = await armazem.lerSerie(serie, opcoes);
    const doc = { versao: 1, n: num, ...roteiro };
    doc.n = num;
    const entradaEp = (s.episodios || []).find((e) => e.n === num);
    if (doc.duracaoAlvoS === undefined) doc.duracaoAlvoS = (entradaEp && entradaEp.duracaoAlvoS) || s.duracaoAlvoS || 60;
    const resultado = await conferirDoc(serie, doc, opcoes);

    const pasta = pastaEpisodio(serie, num, opcoes);
    const pastaSerie = armazem.pastaSerie(serie, opcoes);
    await fsp.mkdir(pasta, { recursive: true });
    const caminho = path.join(pasta, 'roteiro.json');
    await armazem.comTrava(caminho, () => armazem.gravarNaSerie(pastaSerie, caminho, doc));
    await registrarNaSerie(serie, num, { titulo: doc.titulo, duracaoAlvoS: doc.duracaoAlvoS, semEscolha: doc.escolhas === null }, opcoes);
    if (doc.escolhas) await armazem.atualizarBiblia(serie, (b) => {
        b.escolhas = Array.isArray(b.escolhas) ? b.escolhas : [];
        let e = b.escolhas.find((x) => x.ep === num);
        if (!e) {
            e = { ep: num, A: '', B: '', vencedora: null, votos: { A: 0, B: 0 } };
            b.escolhas.push(e);
            b.escolhas.sort((x, y) => x.ep - y.ep);
        }
        e.A = doc.escolhas.A.texto;
        e.B = doc.escolhas.B.texto;
        return b;
    }, opcoes);
    return { roteiro: doc, avisos: resultado.avisos };
}

async function lerPlanos(serie, n, opcoes = {}) {
    const { pasta } = await exigirEpisodio(serie, n, opcoes);
    return armazem.lerJson(path.join(pasta, 'planos.json'), null);
}

async function salvarPlanos(serie, n, planos, opcoes = {}) {
    const { serie: s, pasta } = await exigirEpisodio(serie, n, opcoes);
    const doc = { versao: 1, ...planos };
    const resultado = armazem.exigirValido(
        validar.validarPlanos(doc, { tetoPlanoUsd: s.orcamento && s.orcamento.tetoPlanoUsd }),
        'planos.json',
    );
    await fsp.mkdir(pasta, { recursive: true });
    const caminho = path.join(pasta, 'planos.json');
    await armazem.comTrava(caminho, () => armazem.gravarNaSerie(armazem.pastaSerie(serie, opcoes), caminho, doc));
    return { planos: doc, avisos: resultado.avisos };
}

function lerContagem(valor, lado) {
    const v = typeof valor === 'string' && valor.trim() !== '' ? Number(valor) : valor;
    if (!Number.isInteger(v) || v < 0) throw erro(`Informe os votos de ${lado} (número inteiro ≥ 0). Nunca inventamos resultado.`);
    return v;
}

/**
 * Registra o resultado REAL da votação (só o Rafael ou uma contagem real de comentários).
 * Calcula a vencedora (ou empate), grava votacao.json e atualiza biblia.escolhas.
 */
async function registrarVotacao(serie, n, { A, B, fonte = 'manual' } = {}, opcoes = {}) {
    const votos = { A: lerContagem(A, 'A'), B: lerContagem(B, 'B') };
    if (votos.A + votos.B === 0) throw erro('Sem votos (0 x 0): nada a registrar.');
    if (!validar.FONTES_VOTACAO.includes(fonte)) throw erro('Fonte da votação deve ser "manual" ou "youtube".');
    const { num, pasta } = await exigirEpisodio(serie, n, opcoes);
    const votacao = {
        versao: 1,
        ep: num,
        votos,
        vencedora: validar.calcularVencedora(votos.A, votos.B),
        fonte,
        registradaEm: new Date().toISOString(),
    };
    armazem.exigirValido(validar.validarVotacao(votacao), 'votacao.json');
    const pastaSerie = armazem.pastaSerie(serie, opcoes);
    await fsp.mkdir(pasta, { recursive: true });
    const caminho = path.join(pasta, 'votacao.json');
    await armazem.comTrava(caminho, () => armazem.gravarNaSerie(pastaSerie, caminho, votacao));

    const roteiro = await armazem.lerJson(path.join(pasta, 'roteiro.json'), null);
    let escolha;
    await armazem.atualizarBiblia(serie, (b) => {
        b.escolhas = Array.isArray(b.escolhas) ? b.escolhas : [];
        escolha = b.escolhas.find((x) => x.ep === num);
        if (!escolha) {
            escolha = { ep: num, A: '', B: '', vencedora: null, votos: { A: 0, B: 0 } };
            b.escolhas.push(escolha);
            b.escolhas.sort((x, y) => x.ep - y.ep);
        }
        if (roteiro && roteiro.escolhas) {
            if (!escolha.A && roteiro.escolhas.A) escolha.A = roteiro.escolhas.A.texto || '';
            if (!escolha.B && roteiro.escolhas.B) escolha.B = roteiro.escolhas.B.texto || '';
        }
        escolha.votos = { ...votos };
        escolha.vencedora = votacao.vencedora;
        return b;
    }, opcoes);
    return { votacao, escolha };
}

/**
 * Troca a duração-alvo de um episódio JÁ criado (serie.json → episodios[].duracaoAlvoS). Não mexe no roteiro:
 * o roteiro novo sai pelo "Ajustar o roteiro para N s" (revisão) ou pelo "Refazer roteiro do zero".
 * semEscolha: sem valor = abaixo de 20 s fica sem votação; acima, mantém o que era (o "sem votação" automático de
 * quem era curto volta a ter votação). Devolve { episodio, antes, roteiro, precisaAjustar, avisos }.
 */
async function alterarDuracao(serie, n, { duracaoAlvoS, semEscolha } = {}, opcoes = {}) {
    const dur = lerDuracao(duracaoAlvoS);
    if (dur === undefined) throw erro('Informe a duração nova (duracaoAlvoS, de 1 a 600 s).');
    const { num, pasta, entrada } = await exigirEpisodio(serie, n, opcoes);
    const s = await armazem.lerSerie(serie, opcoes);
    const antes = {
        duracaoAlvoS: entrada.duracaoAlvoS ?? s.duracaoAlvoS ?? 60,
        semEscolha: typeof entrada.semEscolha === 'boolean' ? entrada.semEscolha : (entrada.duracaoAlvoS ?? s.duracaoAlvoS ?? 60) < 20,
    };
    let sem;
    if (semEscolha !== undefined && semEscolha !== null) sem = Boolean(semEscolha);
    else if (dur < 20) sem = true;
    else if (antes.semEscolha && antes.duracaoAlvoS < 20) sem = false;
    else sem = antes.semEscolha;
    const roteiro = await armazem.lerJson(path.join(pasta, 'roteiro.json'), null);
    const avisos = [];
    const votado = await armazem.lerJson(path.join(pasta, 'votacao.json'), null);
    if (votado) avisos.push('Este episódio já tem votação registrada: trocar a duração não mexe nela.');
    const novo = await armazem.comTrava(`eps:${serie}`, () => registrarNaSerie(serie, num, { duracaoAlvoS: dur, semEscolha: sem }, opcoes));
    let infoRoteiro = null;
    let precisaAjustar = false;
    if (roteiro && Array.isArray(roteiro.planos)) {
        const fim = roteiro.planos.reduce((m, p) => Math.max(m, Number(p.ateS) || 0), 0);
        infoRoteiro = { duracaoAlvoS: roteiro.duracaoAlvoS ?? null, duracaoPlanosS: Math.round(fim * 10) / 10, planos: roteiro.planos.length, aprovado: roteiro.aprovado === true, semEscolha: roteiro.escolhas === null };
        precisaAjustar = Math.abs(fim - dur) > Math.max(0.5, Math.min(3, dur * 0.1)) || infoRoteiro.semEscolha !== sem;
        if (precisaAjustar) avisos.push(`O roteiro salvo ainda tem ${String(infoRoteiro.duracaoPlanosS).replace('.', ',')} s: ajuste o roteiro para ${String(dur).replace('.', ',')} s (ou refaça do zero).`);
    }
    return { episodio: novo, antes, roteiro: infoRoteiro, precisaAjustar, avisos };
}

module.exports = {
    alterarDuracao,
    numeroEpisodio,
    idEpisodio,
    pastaEpisodio,
    criarEpisodio,
    lerEpisodio,
    lerRoteiro,
    salvarRoteiro,
    conferirRoteiro,
    lerPlanos,
    salvarPlanos,
    registrarVotacao,
    contextoDaSerie,
    exigirEpisodio,
};
