// verificarContinuidade: acusa contradições entre um roteiro e a memória.
// Parte determinística (sempre roda, custo zero) + prompt de verificação para o LLM (opcional, injetado).
const { obterSerie, fatosVigentes, acharFicha } = require('./arquivos');
const est = require('./estado');
const { montarContexto } = require('./contexto');
const { extrairJson } = require('../showrunner/json');
const { epNum, normalizar, lista } = require('./util');

const VOZES_SISTEMA = new Set(['narrador', 'alerta']);
const NEGACOES = new Set(['sem', 'nao', 'nem', 'nenhum', 'nenhuma', 'nunca', 'jamais', 'no', 'not', 'without']);
const PALAVRAS_VAZIAS = new Set(['porque', 'quando', 'sobre', 'entre', 'depois', 'antes', 'ainda', 'mesmo', 'mesma', 'outro', 'outra',
    'todos', 'todas', 'pelos', 'pelas', 'nossa', 'nosso', 'estava', 'estao', 'podem', 'muito', 'muita', 'isso', 'aquele', 'aquela',
    'deles', 'delas', 'para', 'pela', 'pelo', 'chama', 'proximo', 'episodio']);
const PISTAS_FERIMENTO = ['curativ', 'faixa', 'enfaix', 'ferid', 'manc', 'tipoia', 'machuc', 'cicatriz', 'bandag', 'injur', 'wound'];

function palavras(texto) {
    return normalizar(texto).replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
}

// Quantas vezes o termo aparece SEM negação nas 3 palavras anteriores da mesma oração
// ("sem ponte" e "no blood" não contam; "no blood. Blood on the wall" conta 1).
function ocorrenciasAfirmativas(texto, termo) {
    const alvo = palavras(termo);
    if (!alvo.length) return 0;
    let n = 0;
    for (const oracao of String(texto ?? '').split(/[.;:!?\n|·,()]+/)) {
        const ps = palavras(oracao);
        for (let i = 0; i + alvo.length <= ps.length; i++) {
            const bate = alvo.every((w, k) => ps[i + k] === w || (k === alvo.length - 1 && w.length >= 4 && ps[i + k].startsWith(w)));
            if (!bate) continue;
            if (!ps.slice(Math.max(0, i - 3), i).some((w) => NEGACOES.has(w))) n++;
        }
    }
    return n;
}

function radicais(texto) {
    return [...new Set(palavras(texto).filter((w) => w.length >= 5 && !PALAVRAS_VAZIAS.has(w)).map((w) => w.slice(0, 5)))];
}

function textoDoPlano(p) {
    return [p.visual, p.tela, ...lista(p.falas).map((f) => f.texto)].filter(Boolean).join(' . ');
}

function textoDoRoteiro(r) {
    return [r.titulo, r.objetivo, r.resumo, r.gancho, ...lista(r.planos).map(textoDoPlano)].filter(Boolean).join(' . ');
}

function fatoDaChave(vig, chave) {
    return vig.find((f) => f.chave === chave)?.id || null;
}

function votoAnterior(s, estado, ep) {
    const v = s.episodios?.[ep - 1]?.votacao;
    if (v && ['A', 'B'].includes(v.vencedora)) return v.vencedora;
    const e = lista(estado.escolhas).find((x) => epNum(x.ep) === ep - 1);
    return e && ['A', 'B'].includes(e.vencedora) ? e.vencedora : null;
}

/**
 * @param roteiro roteiro.json (o que vai ser verificado)
 * @param memoria memória ({fatos, estado, resumos, glossario}), série carregada ou caminho da pasta
 * @param opcoes { ep, chamarLLM, modelo, limiteCaracteres }
 * @returns { ok, ep, problemas:[{nivel,tipo,plano,texto,fatoId,origem}], erros, avisos, prompt, custoUsd }
 */
async function verificarContinuidade(roteiro, memoria, opcoes = {}) {
    if (!roteiro || !Array.isArray(roteiro.planos)) throw new Error('Roteiro inválido: precisa de "planos".');
    const s = obterSerie(memoria || {});
    const ep = epNum(opcoes.ep ?? roteiro.n) ?? ((epNum(s.memoria.estado?.atualizadoAte) ?? 0) + 1);
    const estado = est.estadoOuInicial(s);
    const vig = fatosVigentes(s.memoria.fatos, ep);
    const problemas = [];
    const ja = new Set();
    const add = (nivel, tipo, plano, texto, fatoId = null) => {
        const k = `${tipo}|${plano}|${texto}`;
        if (ja.has(k)) return;
        ja.add(k);
        problemas.push({ nivel, tipo, plano, texto, fatoId, origem: 'regras' });
    };
    const nome = (id) => estado.personagens?.[id]?.nome || estado.objetos?.[id]?.nome || acharFicha(s, id)?.nome || id;

    const objetos = {};
    for (const [id, o] of Object.entries(estado.objetos || {})) objetos[id] = { ...o };
    const vistoEm = {};
    const primeira = new Set();
    const desconhecidos = new Set();

    for (const p of roteiro.planos) {
        const presentes = lista(p.elenco).filter((id) => !VOZES_SISTEMA.has(id) && !est.ehApresentador(acharFicha(s, id, 'personagem')));
        const falantes = lista(p.falas).map((f) => f.quem).filter((q) => q && !VOZES_SISTEMA.has(q));

        for (const id of new Set([...presentes, ...falantes])) {
            const pe = estado.personagens?.[id];
            if (pe && pe.vivo === false) {
                add('erro', 'morto_em_cena', p.n, `${nome(id)} está morto(a) na memória, mas aparece ou fala no plano ${p.n}.`, fatoDaChave(vig, `personagem:${id}:vivo`));
            }
            if (!pe && !acharFicha(s, id, 'personagem') && !desconhecidos.has(id)) {
                desconhecidos.add(id);
                add('aviso', 'personagem_desconhecido', p.n, `"${id}" não existe no elenco nem na memória: criar ficha ou corrigir o id.`);
            }
        }

        for (const id of presentes) {
            if (primeira.has(id)) continue;
            primeira.add(id);
            const antes = estado.personagens?.[id]?.onde;
            if (antes && p.local && antes !== p.local) {
                add('aviso', 'personagem_deslocado', p.n, `${nome(id)} estava em ${antes} no fim do episódio anterior e aparece em ${p.local}: mostre ou diga como chegou.`, fatoDaChave(vig, `personagem:${id}:onde`));
            }
        }

        if (p.tipo !== 'apresentador') {
            const visual = normalizar(`${p.visual || ''} ${p.tela || ''}`);
            for (const id of presentes) {
                const fer = lista(estado.personagens?.[id]?.ferimentos);
                if (!fer.length) continue;
                const chaves = [...PISTAS_FERIMENTO, ...fer.flatMap((f) => radicais(typeof f === 'string' ? f : `${f.onde || ''} ${f.descricao || ''}`))];
                if (!chaves.some((k) => visual.includes(k))) {
                    const desc = fer.map((f) => (typeof f === 'string' ? f : [f.onde, f.descricao].filter(Boolean).join(': '))).join('; ');
                    add('aviso', 'ferimento', p.n, `${nome(id)} está ferido(a) (${desc}), mas o visual do plano ${p.n} não mostra.`, fatoDaChave(vig, `personagem:${id}:ferimentos`));
                }
            }
        }

        for (const id of lista(p.objetos)) {
            const o = objetos[id];
            if (!o) {
                if (!acharFicha(s, id, 'objeto')) add('aviso', 'objeto_desconhecido', p.n, `Objeto "${id}" não existe na memória nem nas fichas.`);
                objetos[id] = { onde: p.local || null, comQuem: null, fixo: Boolean(acharFicha(s, id, 'objeto')?.fixo) };
                continue;
            }
            if (!p.local || !o.onde || o.onde === p.local) continue;
            const chaveFato = fatoDaChave(vig, `objeto:${id}:onde`);
            if (o.fixo) {
                add('erro', 'objeto_fora_do_lugar', p.n, `${nome(id)} é fixo em ${o.onde}, mas aparece em ${p.local} no plano ${p.n}.`, chaveFato);
                continue;
            }
            const portador = presentes.find((c) => o.comQuem === c
                || vistoEm[c]?.has(o.onde)
                || estado.personagens?.[c]?.onde === o.onde
                || lista(estado.personagens?.[c]?.carrega).includes(id));
            if (portador) {
                o.onde = p.local;
                o.comQuem = portador;
            } else {
                add('erro', 'objeto_fora_do_lugar', p.n, `${nome(id)} está em ${o.onde} (memória), mas aparece em ${p.local} no plano ${p.n} sem ninguém que o trouxesse.`, chaveFato);
            }
        }
        for (const id of presentes) (vistoEm[id] = vistoEm[id] || new Set()).add(p.local);
    }

    // regras com termos proibidos ("ponte"; "sem ponte" não conta)
    for (const f of vig.filter((x) => x.tipo === 'regra' && lista(x.proibido).length)) {
        for (const p of roteiro.planos) {
            for (const termo of lista(f.proibido)) {
                if (ocorrenciasAfirmativas(textoDoPlano(p), termo)) add('aviso', 'regra_quebrada', p.n, `"${termo}" aparece no plano ${p.n}, mas a regra diz: ${f.texto}`, f.id);
            }
        }
    }

    // a escolha do público (ou a consequência pendente) precisa aparecer no episódio seguinte
    if (ep > 1) {
        const texto = palavras(textoDoRoteiro(roteiro));
        const cobre = (alvo) => {
            const rs = radicais(alvo);
            return !rs.length || rs.some((r) => texto.some((w) => w.startsWith(r)));
        };
        const pend = lista(estado.consequenciasPendentes).filter((c) => c.paraEp == null || epNum(c.paraEp) === ep);
        for (const c of pend) {
            if (!cobre(c.texto)) add('aviso', 'escolha_ignorada', null, `O roteiro não parece tratar da consequência pendente: ${c.texto}`);
        }
        if (!pend.length) {
            const v = votoAnterior(s, estado, ep);
            const o = v && s.episodios?.[ep - 1]?.roteiro?.escolhas?.[v];
            if (o && !cobre(`${o.texto || ''} ${o.consequencia || ''}`)) add('aviso', 'escolha_ignorada', null, `O público escolheu ${v} (${o.texto}) no Ep. ${ep - 1}, mas o roteiro não toca nisso.`);
        }
    }

    // glossário: grafia errada na tela/falas e nome que a voz do personagem não fala direito
    for (const t of lista(s.memoria.glossario?.termos)) {
        for (const p of roteiro.planos) {
            const tela = `${p.tela || ''} . ${lista(p.falas).map((f) => f.texto).join(' . ')}`;
            for (const errado of lista(t.variantesErradas)) {
                if (ocorrenciasAfirmativas(tela, errado)) add('aviso', 'grafia', p.n, `"${errado}" no plano ${p.n}: o certo é "${t.grafia || t.termo}".`);
            }
            for (const f of lista(p.falas)) {
                if (lista(t.evitarNaFalaDe).includes(f.quem) && ocorrenciasAfirmativas(f.texto, t.termo)) {
                    add('aviso', 'pronuncia', p.n, `A voz de ${f.quem} não pronuncia "${t.termo}" direito${t.nota ? ` (${t.nota})` : ''}: tire da fala do plano ${p.n}.`);
                }
            }
        }
    }

    // prompt para o LLM (sempre devolvido) e chamada opcional
    let prompt = null;
    let custoUsd = 0;
    try {
        prompt = (await montarContexto(s, 'verificacao', { ep, roteiro, limiteCaracteres: opcoes.limiteCaracteres })).mensagens;
    } catch (e) {
        problemas.push({ nivel: 'aviso', tipo: 'prompt', plano: null, texto: `Sem prompt de verificação: ${e.message}`, fatoId: null, origem: 'regras' });
    }
    if (typeof opcoes.chamarLLM === 'function' && prompt) {
        const r = await opcoes.chamarLLM(prompt, { modelo: opcoes.modelo || s.serie?.modelos?.texto || 'openai/gpt-6-luna', maxTokens: opcoes.maxTokens || 6000, json: true });
        custoUsd += Number(r?.custoUsd) || 0;
        const j = extrairJson(r?.conteudo);
        if (j.ok && j.valor && Array.isArray(j.valor.contradicoes)) {
            for (const c of j.valor.contradicoes) {
                if (!c || !c.texto) continue;
                problemas.push({
                    nivel: c.gravidade === 'erro' ? 'erro' : 'aviso', tipo: String(c.tipo || 'outro'),
                    plano: Number.isFinite(Number(c.plano)) && c.plano !== null ? Number(c.plano) : null,
                    texto: String(c.texto), fatoId: c.fatoId || null, origem: 'llm',
                });
            }
        } else {
            problemas.push({ nivel: 'aviso', tipo: 'llm_invalido', plano: null, texto: `A verificação por IA não devolveu o JSON esperado (${j.erro || 'formato'}).`, fatoId: null, origem: 'llm' });
        }
    }

    const erros = problemas.filter((p) => p.nivel === 'erro').length;
    return { ok: erros === 0, ep, problemas, erros, avisos: problemas.length - erros, prompt, custoUsd };
}

module.exports = { verificarContinuidade, ocorrenciasAfirmativas };
