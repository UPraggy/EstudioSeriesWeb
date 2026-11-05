// Livro de custos (custos.jsonl, uma linha por chamada paga, só acrescenta).
// Interface combinada com o núcleo de séries: { registrar(linha), async total({ ep }) }.
// Esta é a implementação mínima do cliente OpenRouter; o núcleo pode trocar pela dele com definirFabricaLivro().
const fsp = require('fs/promises');
const path = require('path');
const util = require('./util');

function numeroEp(ep) {
    if (ep === undefined || ep === null || ep === '') return null;
    if (typeof ep === 'number') return ep;
    const m = String(ep).match(/(\d+)/);
    return m ? Number(m[1]) : null;
}

function criarLivroJsonl(arquivo) {
    return {
        arquivo,
        async registrar(linha) {
            await util.emSerie(arquivo, async () => {
                await fsp.mkdir(path.dirname(arquivo), { recursive: true });
                await fsp.appendFile(arquivo, `${JSON.stringify({ em: new Date().toISOString(), ...linha })}\n`, 'utf8');
            });
        },
        async total({ ep } = {}) {
            let texto = '';
            try {
                texto = await fsp.readFile(arquivo, 'utf8');
            } catch (e) {
                if (e.code === 'ENOENT') return 0;
                throw e;
            }
            const alvo = numeroEp(ep);
            let soma = 0;
            for (const l of texto.split(/\r?\n/)) {
                if (!l.trim()) continue;
                let linha;
                try {
                    linha = JSON.parse(l);
                } catch {
                    continue;
                }
                if (alvo !== null && numeroEp(linha.ep) !== alvo) continue;
                const v = Number(linha.realUsd ?? linha.previstoUsd);
                if (Number.isFinite(v)) soma += v;
            }
            return util.arredondarUsd(soma);
        },
    };
}

let fabrica = null;
// O núcleo de séries pode registrar a fábrica dele: fn({ raiz, serie, base }) → livro
function definirFabricaLivro(fn) {
    fabrica = typeof fn === 'function' ? fn : null;
}

// Livro da série = o do núcleo de séries (backend/src/series/custos.js), quando existir.
function livroDoNucleo(base) {
    try {
        const { criarLivroCustos } = require('../series/custos');
        return typeof criarLivroCustos === 'function' ? criarLivroCustos(base) : null;
    } catch (e) {
        if (e.code === 'MODULE_NOT_FOUND') return null;
        throw e;
    }
}

function obterLivro({ raiz, serie = null, base }) {
    if (fabrica) {
        const l = fabrica({ raiz, serie, base });
        if (l) return l;
    }
    if (serie) {
        const l = livroDoNucleo(base);
        if (l) return l;
    }
    return criarLivroJsonl(path.join(base, 'custos.jsonl'));
}

module.exports = { criarLivroJsonl, definirFabricaLivro, obterLivro, numeroEp };
