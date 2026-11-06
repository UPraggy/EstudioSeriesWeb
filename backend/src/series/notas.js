// Notas do roteiro por episódio: episodios/epNN/notas.json (formato em docs/CONTRATOS.md).
// { versao: 1, observacoes, observacoesEm, historico: [ proposta... ] }
// - observacoes: o que o Rafael quer na história (tom, o que evitar). Entram em todo pedido de roteiro do episódio.
// - historico: cada proposta de roteiro que o showrunner devolveu (escrever do zero ou revisar com ajustes),
//   com o roteiro proposto inteiro, para ver, comparar e "Usar esta". Só guarda: nunca grava o roteiro.json.
const path = require('path');
const armazem = require('./armazem');
const episodios = require('./episodios');

const { erro } = armazem;
const MAX_TEXTO = 4000;        // observações e ajustes
const MAX_HISTORICO = 40;      // propostas guardadas por episódio (as mais velhas saem)

function notasVazias() {
    return { versao: 1, observacoes: '', observacoesEm: null, historico: [] };
}

function texto(valor, nome) {
    if (valor === undefined || valor === null) return '';
    if (typeof valor !== 'string') throw erro(`"${nome}" precisa ser texto.`);
    const t = valor.replace(/\r\n/g, '\n').trim();
    if (t.length > MAX_TEXTO) throw erro(`"${nome}" passou de ${MAX_TEXTO} caracteres.`);
    return t;
}

function normalizar(doc) {
    const n = { ...notasVazias(), ...(doc && typeof doc === 'object' && !Array.isArray(doc) ? doc : {}) };
    n.versao = 1;
    n.observacoes = typeof n.observacoes === 'string' ? n.observacoes : '';
    n.historico = Array.isArray(n.historico) ? n.historico.filter((h) => h && typeof h === 'object') : [];
    return n;
}

async function caminhoNotas(serie, ep, opcoes = {}) {
    const { num, pasta } = await episodios.exigirEpisodio(serie, ep, opcoes);
    return { num, caminho: path.join(pasta, 'notas.json'), pastaSerie: armazem.pastaSerie(serie, opcoes) };
}

/** Lê as notas do episódio (vazias se o arquivo ainda não existe). 404 se o episódio não existe. */
async function lerNotas(serie, ep, opcoes = {}) {
    const { num, caminho } = await caminhoNotas(serie, ep, opcoes);
    const doc = normalizar(await armazem.lerJson(caminho, null));
    return { ep: num, ...doc };
}

/** Grava as observações do roteiro (texto livre; vazio limpa). Devolve as notas inteiras. */
async function salvarObservacoes(serie, ep, observacoes, opcoes = {}) {
    const t = texto(observacoes, 'observacoes');
    const { num, caminho, pastaSerie } = await caminhoNotas(serie, ep, opcoes);
    const novo = await armazem.atualizarNaSerie(pastaSerie, caminho, (atual) => {
        const n = normalizar(atual);
        n.observacoes = t;
        n.observacoesEm = new Date().toISOString();
        return n;
    }, { padrao: notasVazias() });
    return { ep: num, ...novo };
}

/**
 * Acrescenta uma proposta ao histórico. dados: { tipo: 'escrever'|'ajuste', base, baseVersao, observacoes, ajustes,
 * duracaoAlvoS, semEscolha, custoUsd, modelo, ok, erros, resultado }. Devolve a entrada gravada (sem o resultado).
 */
async function registrarProposta(serie, ep, dados = {}, opcoes = {}) {
    const { caminho, pastaSerie } = await caminhoNotas(serie, ep, opcoes);
    let entrada;
    await armazem.atualizarNaSerie(pastaSerie, caminho, (atual) => {
        const n = normalizar(atual);
        const ultima = n.historico.reduce((m, h) => Math.max(m, Number(h.versao) || 0), 0);
        const resultado = dados.resultado && typeof dados.resultado === 'object' ? dados.resultado : null;
        entrada = {
            id: `v${ultima + 1}`,
            versao: ultima + 1,
            em: new Date().toISOString(),
            tipo: dados.tipo === 'ajuste' ? 'ajuste' : 'escrever',
            base: dados.tipo === 'ajuste' ? (dados.base === 'salvo' ? 'salvo' : 'proposta') : null,
            baseVersao: Number.isInteger(dados.baseVersao) ? dados.baseVersao : null,
            observacoes: typeof dados.observacoes === 'string' ? dados.observacoes.slice(0, MAX_TEXTO) : '',
            ajustes: typeof dados.ajustes === 'string' ? dados.ajustes.slice(0, MAX_TEXTO) : '',
            duracaoAlvoS: Number.isFinite(Number(dados.duracaoAlvoS)) ? Number(dados.duracaoAlvoS) : (resultado && resultado.duracaoAlvoS) || null,
            semEscolha: dados.semEscolha === undefined ? null : Boolean(dados.semEscolha),
            titulo: (resultado && typeof resultado.titulo === 'string' && resultado.titulo) || '',
            custoUsd: Number(dados.custoUsd) || 0,
            modelo: dados.modelo || null,
            ok: dados.ok !== false,
            erros: (Array.isArray(dados.erros) ? dados.erros : []).slice(0, 8).map(String),
            resultado,
        };
        // resposta colada de fora (ChatGPT/Claude/Gemini externos): mesma validação, custo 0
        if (dados.origem === 'externo') entrada.origem = 'externo';
        n.historico.push(entrada);
        if (n.historico.length > MAX_HISTORICO) n.historico = n.historico.slice(-MAX_HISTORICO);
        return n;
    }, { padrao: notasVazias() });
    const { resultado, ...semResultado } = entrada;
    return semResultado;
}

module.exports = { lerNotas, salvarObservacoes, registrarProposta, notasVazias, MAX_TEXTO, MAX_HISTORICO };
