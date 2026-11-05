// Monta o contexto usado pelas funções de alto nível: cliente (real ou simulado), pasta base, jobs, livro e tetos.
const fs = require('fs');
const path = require('path');
const { raizDados, modoSimulado } = require('./ambiente');
const { criarCliente } = require('./cliente');
const { criarClienteSimulado } = require('./simulado');
const { criarJobs } = require('./jobs');
const { obterLivro } = require('./livro');
const { ErroValidacao } = require('./erros');
const util = require('./util');

const RE_SERIE = /^[a-z0-9][a-z0-9-]{0,80}$/;
const TETOS_SERIE_PADRAO = { plano: 1.0, episodio: 4.0, serie: 40.0 };

const clientes = {};
function obterCliente() {
    if (modoSimulado()) return clientes.sim || (clientes.sim = criarClienteSimulado());
    return clientes.real || (clientes.real = criarCliente());
}

function pastaSerie(raiz, serie) {
    if (!RE_SERIE.test(String(serie))) throw new ErroValidacao(`Série inválida: ${serie}`);
    return path.join(raiz, 'series', serie);
}

function tetosSimples() {
    const v = Number(process.env.ESTUDIO_TETO_SIMPLES_USD);
    return { plano: Number.isFinite(v) && v > 0 ? v : 1.0 };
}

async function tetosDaSerie(base) {
    const s = await util.lerJson(path.join(base, 'serie.json'), null);
    const o = (s && s.orcamento) || {};
    return {
        plano: o.tetoPlanoUsd ?? TETOS_SERIE_PADRAO.plano,
        episodio: o.tetoEpisodioUsd ?? TETOS_SERIE_PADRAO.episodio,
        serie: o.tetoSerieUsd ?? TETOS_SERIE_PADRAO.serie,
    };
}

const cacheJobs = new Map();

/**
 * obterContexto({ serie }) → { raiz, base, serie, cliente, livro, jobs, tetos, simulado }
 * Sem série = geração simples (<ESTUDIO_DADOS>\geracao-simples, teto por geração ESTUDIO_TETO_SIMPLES_USD, padrão US$ 1).
 * Com série: tetos vêm do serie.json (orcamento.tetoPlanoUsd/tetoEpisodioUsd/tetoSerieUsd).
 */
async function obterContexto({ serie = null } = {}) {
    const raiz = raizDados();
    const cliente = obterCliente();
    const base = serie ? pastaSerie(raiz, serie) : path.join(raiz, 'geracao-simples');
    if (serie && !fs.existsSync(base)) throw new ErroValidacao(`A série ${serie} não existe em ${path.join(raiz, 'series')}.`);
    const livro = obterLivro({ raiz, serie, base });
    const chave = `${cliente.simulado ? 'sim' : 'real'}|${base}`;
    let jobs = cacheJobs.get(chave);
    if (!jobs) {
        jobs = criarJobs({ base, cliente, livro, serie });
        cacheJobs.set(chave, jobs);
    }
    const tetos = serie ? await tetosDaSerie(base) : tetosSimples();
    return { raiz, base, serie, cliente, livro, jobs, tetos, simulado: cliente.simulado === true };
}

module.exports = { obterCliente, obterContexto, pastaSerie, tetosDaSerie, TETOS_SERIE_PADRAO };
