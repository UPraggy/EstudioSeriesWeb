// executarEtapa: monta o prompt da etapa, chama o LLM INJETADO, faz o parse robusto, valida, conserta o óbvio
// e, se ainda houver erro, pede uma correção (no máximo `maxTentativas`). Nunca grava nada: devolve a proposta.
const { SISTEMA, USUARIO, REVISAO_ROTEIRO } = require('./prompts');
const V = require('./validar');
const { extrairJson } = require('./json');
const { montarContexto } = require('../memoria/contexto');
const { verificarContinuidade } = require('../memoria/continuidade');
const { obterSerie } = require('../memoria/arquivos');
const { epNum, lista } = require('../memoria/util');
const registro = require('../log/registro');

const MODELO_PADRAO = 'openai/gpt-6-luna';
const TETO_TOKENS = 32000; // limite máximo de resposta numa nova tentativa depois de um corte

function textoDoPacote(pacote) {
    const u = pacote?.mensagens?.find((m) => m.role === 'user');
    if (!u) return '';
    if (typeof u.content === 'string') return u.content;
    return lista(u.content).filter((p) => p.type === 'text').map((p) => p.text).join('\n');
}

function sistemaDoPacote(pacote) {
    const s = pacote?.mensagens?.find((m) => m.role === 'system');
    return s ? `\n\nSOBRE A MEMÓRIA: ${s.content}` : '';
}

function carregarSerieSeHouver(c) {
    if (c.pasta) return obterSerie(c.pasta);
    if (c.serie && typeof c.serie === 'object' && (c.serie.pasta || c.serie.memoria || c.serie.fichas)) return obterSerie(c.serie);
    return null;
}

function idsDoElenco(serie, c) {
    const ids = new Set(lista(c.elencoIds));
    for (const id of Object.keys(serie?.fichas?.elenco || {})) ids.add(id);
    for (const p of lista(serie?.biblia?.personagens || c.biblia?.personagens)) if (p?.id) ids.add(p.id);
    return ids.size ? [...ids] : null;
}

function idsDosLocais(serie, c) {
    const ids = new Set(lista(c.locaisIds));
    for (const id of Object.keys(serie?.fichas?.locais || {})) ids.add(id);
    return ids.size ? [...ids] : null;
}

// Protagonista da série (para o aviso do piloto): ficha com "protagonista" no papel; senão o 1º personagem da bíblia.
function protagonistaDa(serie, c) {
    if (c.protagonista && typeof c.protagonista === 'object' && c.protagonista.nome) return { id: c.protagonista.id || null, nome: c.protagonista.nome };
    const fichas = Object.values(serie?.fichas?.elenco || {}).filter((f) => f && f.id !== 'narrador');
    const pelaFicha = fichas.find((f) => /protagonista/i.test(String(f.papel || '')));
    if (pelaFicha) return { id: pelaFicha.id, nome: pelaFicha.nome || pelaFicha.id };
    const primeiro = lista(serie?.biblia?.personagens || c.biblia?.personagens).find((p) => p && p.id && p.id !== 'narrador');
    if (!primeiro) return null;
    const ficha = fichas.find((f) => f.id === primeiro.id);
    return { id: primeiro.id, nome: (ficha && ficha.nome) || primeiro.nome || primeiro.id };
}

const ETAPAS = {
    ideias: {
        maxTokens: 6000,
        async preparar(c) {
            const modo = c.modo === 'B' ? 'B' : 'A';
            if (modo === 'B' && !String(c.ideia || '').trim()) return { erros: ['O Modo B precisa da ideia do Rafael (contexto.ideia).'] };
            return { sistema: SISTEMA.ideias(modo), usuario: USUARIO.ideias({ ...c, modo }), ctxValidacao: { modo } };
        },
        validar: V.validarIdeias,
    },

    biblia: {
        maxTokens: 12000,
        async preparar(c) {
            if (!c.ideia) return { erros: ['A bíblia precisa da ideia aprovada (contexto.ideia).'] };
            return { sistema: SISTEMA.biblia(), usuario: USUARIO.biblia(c), ctxValidacao: {} };
        },
        validar: V.validarBiblia,
    },

    roteiro: {
        // cresce com a duração do episódio (modelos que "pensam" gastam parte do limite raciocinando)
        maxTokens: (prep) => Math.min(24000, 8000 + Math.round(120 * Number(prep?.ctxValidacao?.duracaoAlvoS || 60))),
        async preparar(c) {
            const ep = epNum(c.ep);
            if (!ep || ep < 1) return { erros: ['Informe o episódio (contexto.ep).'] };
            const serie = carregarSerieSeHouver(c);
            let pacote = c.pacote || null;
            if (!pacote && serie) pacote = await montarContexto(serie, 'roteiro', { ep, limiteCaracteres: c.limiteCaracteres });
            const biblia = serie?.biblia || c.biblia;
            const memoria = pacote ? textoDoPacote(pacote) : (biblia ? `BÍBLIA DA SÉRIE (JSON):\n${JSON.stringify(biblia)}` : '');
            if (!memoria) return { erros: ['Sem memória nem bíblia para escrever o roteiro (passe contexto.pasta, contexto.pacote ou contexto.biblia).'] };
            const total = lista(biblia?.temporada).length || 10;
            const ultimo = ep >= total;
            // duração livre: pedido > episódio (serie.json) > série > 60 s; abaixo de 20 s não há votação A/B
            const entradaEp = lista(serie?.serie?.episodios).find((e) => Number(e.n) === Number(ep));
            // revisão: roteiroBase (a proposta na tela ou o roteiro salvo) + ajustes (o que mudar)
            const ajustes = typeof c.ajustes === 'string' ? c.ajustes.trim() : '';
            let base = c.roteiroBase ?? null;
            if (!base && ajustes) base = serie?.episodios?.[ep]?.roteiro || null;
            if (base !== null && (typeof base !== 'object' || Array.isArray(base) || !Array.isArray(base.planos))) {
                return { erros: ['contexto.roteiroBase precisa ser o roteiro (objeto com "planos").'] };
            }
            if (base && !ajustes) return { erros: ['Diga o que mudar no roteiro (contexto.ajustes).'] };
            if (ajustes && !base) return { erros: [`Sem roteiro para ajustar no Ep. ${ep}: mande contexto.roteiroBase ou salve um roteiro antes.`] };
            const alvo = Number(c.duracaoAlvoS || entradaEp?.duracaoAlvoS || base?.duracaoAlvoS || serie?.serie?.duracaoAlvoS || 60);
            const semEscolha = c.semEscolha ?? (entradaEp?.semEscolha ?? alvo < 20);
            const sistema = SISTEMA.roteiro(ultimo, alvo, semEscolha, ep) + (base ? REVISAO_ROTEIRO : '') + sistemaDoPacote(pacote);
            // a duração do episódio pode ter mudado depois do roteiro (AlterarDuracaoEpisodio): a base vai com a duração
            // NOVA e o pedido diz quanto o roteiro tinha, para a IA acrescentar ou cortar cenas
            const fimBase = base ? lista(base.planos).reduce((m, p) => Math.max(m, Number(p?.ateS) || 0), 0) : 0;
            const duracaoAntesS = base ? Number(base.duracaoAlvoS) || fimBase || null : null;
            const roteiroBase = base ? { ...base, n: ep, aprovado: null, duracaoAlvoS: alvo } : null;
            const pedido = base
                ? USUARIO.roteiroRevisao({ ...c, ep, duracaoAlvoS: alvo, roteiroBase, ajustes, duracaoAntesS, duracaoPlanosAntesS: fimBase || null, semEscolha })
                : USUARIO.roteiro({ ...c, ep, duracaoAlvoS: alvo });
            return {
                serie, ep, revisao: Boolean(base),
                sistema,
                usuario: `${memoria}\n\n${pedido}`,
                ctxValidacao: {
                    ep, ultimo, semEscolha, totalEpisodios: total, duracaoAlvoS: alvo,
                    elencoIds: idsDoElenco(serie, c), locaisIds: idsDosLocais(serie, c),
                    protagonista: protagonistaDa(serie, c),
                },
                avisos: pacote?.avisos || [], cortes: pacote?.cortes || [],
                modeloSerie: serie?.serie?.modelos?.texto,
            };
        },
        validar: V.validarRoteiro,
        // contradições com a memória (parte determinística) também voltam para correção
        async verificar(valor, prep) {
            // sem planos a validação já acusou o erro; a continuidade só confere um roteiro de verdade
            if (!prep.serie || !valor || !Array.isArray(valor.planos)) return null;
            return verificarContinuidade(valor, prep.serie, { ep: prep.ep });
        },
    },

    decupagem: {
        maxTokens: 14000,
        async preparar(c) {
            const ep = epNum(c.ep);
            if (!ep || ep < 1) return { erros: ['Informe o episódio (contexto.ep).'] };
            const serie = carregarSerieSeHouver(c);
            const roteiro = c.roteiro || serie?.episodios?.[ep]?.roteiro;
            if (!roteiro) return { erros: [`Sem o roteiro do Ep. ${ep}.`] };
            if (!roteiro.aprovado && !c.permitirNaoAprovado) return { erros: ['O roteiro ainda não foi aprovado pelo Rafael: aprove antes de decupar.'] };
            let pacote = c.pacote || null;
            if (!pacote && serie) pacote = await montarContexto(serie, 'decupagem', { ep, roteiro, limiteCaracteres: c.limiteCaracteres });
            const memoria = pacote ? textoDoPacote(pacote) : `ROTEIRO APROVADO (JSON):\n${JSON.stringify(roteiro)}${c.ancoras ? `\n\nÂNCORAS:\n${JSON.stringify(c.ancoras)}` : ''}`;
            const ids = new Set([...Object.keys(serie?.fichas?.elenco || {}), ...Object.keys(serie?.fichas?.locais || {}), ...Object.keys(serie?.fichas?.objetos || {}), ...lista(c.idsConhecidos)]);
            const modelos = c.modelos || serie?.serie?.modelos || {};
            return {
                serie, ep,
                sistema: SISTEMA.decupagem() + sistemaDoPacote(pacote),
                usuario: `${memoria}\n\n${USUARIO.decupagem({ ...c, ep, modelos })}`,
                ctxValidacao: { ep, roteiro, modelos, idsConhecidos: ids.size ? [...ids] : null },
                avisos: pacote?.avisos || [], cortes: pacote?.cortes || [],
                modeloSerie: serie?.serie?.modelos?.texto,
            };
        },
        validar: V.validarDecupagem,
    },

    atualizarMundo: {
        maxTokens: 6000,
        async preparar(c) {
            const ep = epNum(c.ep);
            if (!ep || ep < 1) return { erros: ['Informe o episódio votado (contexto.ep).'] };
            const serie = carregarSerieSeHouver(c);
            const votacao = c.votacao || serie?.episodios?.[ep]?.votacao || null;
            if (!V.votacaoValida(votacao)) {
                return { erros: ['Votação não registrada (vencedora A|B|empate e fonte manual|youtube). Nunca se inventa o resultado: o Rafael informa.'] };
            }
            if (votacao.vencedora === 'empate' && !['A', 'B'].includes(c.desempate)) return { erros: ['Votação empatada: informe o desempate do Rafael (contexto.desempate = "A" ou "B").'] };
            const biblia = c.biblia || serie?.biblia;
            const roteiro = c.roteiro || serie?.episodios?.[ep]?.roteiro;
            if (!biblia) return { erros: ['Sem bíblia para atualizar.'] };
            if (!roteiro) return { erros: [`Sem o roteiro do Ep. ${ep}.`] };
            const ctx = { ep, biblia, roteiro, votacao, desempate: c.desempate };
            return {
                sistema: SISTEMA.atualizarMundo(), usuario: USUARIO.atualizarMundo(ctx), ctxValidacao: ctx,
                modeloSerie: serie?.serie?.modelos?.texto,
            };
        },
        validar: V.validarAtualizarMundo,
    },
};

/**
 * @param etapa ideias | biblia | roteiro | decupagem | atualizarMundo
 * @param contexto dados da etapa (ver docs/MEMORIA.md e os testes)
 * @param opcoes { chamarLLM (obrigatório, injetado), modelo, maxTokens, maxTentativas (padrão 2), tetoUsd }
 *   chamarLLM: async (mensagens, { modelo, maxTokens, json: true }) => ({ conteudo, custoUsd })
 * @returns { ok, etapa, resultado, erros, avisos, consertos, custoUsd, tentativas, modelo, cortesMemoria, continuidade, tamanhoPrompt }
 */
// Série para o registro: o id vem da pasta (contexto.pasta) ou do contexto.serieId/serie (texto).
function serieDoContexto(c = {}) {
    if (typeof c.serieId === 'string') return c.serieId;
    if (typeof c.serie === 'string') return c.serie;
    if (typeof c.pasta === 'string') return require('path').basename(c.pasta);
    return undefined;
}

// Registra o fim da etapa (custo vai em dados: o gasto real já sai no evento "texto" do OpenRouter).
function registrarEtapa(etapa, contexto, r, ms) {
    const erros = lista(r.erros);
    registro.registrar({
        nivel: r.ok ? (r.tentativas > 1 ? 'aviso' : 'info') : 'erro',
        area: 'showrunner', evento: 'etapa', serie: serieDoContexto(contexto), ep: contexto && contexto.ep, ms,
        msg: r.ok
            ? `Etapa "${etapa}" pronta em ${r.tentativas} tentativa(s)`
            : `Etapa "${etapa}" saiu com ${erros.length} erro(s) de validação${r.tentativas ? ` após ${r.tentativas} tentativa(s)` : ''}: ${erros.slice(0, 2).join(' | ')}`,
        dados: {
            etapa, modelo: r.modelo, tentativas: r.tentativas, ok: r.ok, custoUsd: r.custoUsd, tamanhoPrompt: r.tamanhoPrompt,
            erros: erros.slice(0, 5), avisos: lista(r.avisos).length, consertos: lista(r.consertos).length,
            errosPorTentativa: lista(r.historico).map((h) => ({ tentativa: h.tentativa, erros: lista(h.erros).length, primeiro: lista(h.erros)[0] })),
            continuidade: r.continuidade ? { ok: r.continuidade.ok, problemas: lista(r.continuidade.problemas).length } : undefined,
        },
    });
}

async function executarEtapa(etapa, contexto = {}, opcoes = {}) {
    const fim = registro.cronometro();
    try {
        const r = await executarEtapaSemRegistro(etapa, contexto, opcoes);
        registrarEtapa(etapa, contexto, r, fim());
        return r;
    } catch (e) {
        registro.registrar({
            nivel: 'erro', area: 'showrunner', evento: 'etapa-falhou', serie: serieDoContexto(contexto), ep: contexto && contexto.ep, ms: fim(),
            msg: `Etapa "${etapa}" falhou: ${e && e.message}`, dados: { etapa, modelo: opcoes.modelo || (contexto && contexto.modelo) }, erro: e,
        });
        throw e;
    }
}

async function executarEtapaSemRegistro(etapa, contexto = {}, opcoes = {}) {
    const def = ETAPAS[etapa];
    if (!def) throw new Error(`Etapa desconhecida: ${etapa}. Use: ${Object.keys(ETAPAS).join(', ')}.`);
    const { chamarLLM } = opcoes;
    if (typeof chamarLLM !== 'function') throw new Error('Falta opcoes.chamarLLM (o cliente do OpenRouter é injetado).');

    const prep = await def.preparar(contexto || {});
    const modelo = opcoes.modelo || contexto?.modelo || prep.modeloSerie || MODELO_PADRAO;
    const saida = {
        ok: false, etapa, resultado: null, erros: [], avisos: [...lista(prep.avisos)], consertos: [], custoUsd: 0, tentativas: 0,
        modelo, cortesMemoria: lista(prep.cortes), continuidade: null, tamanhoPrompt: 0, historico: [],
    };
    if (prep.erros?.length) return { ...saida, erros: prep.erros };

    const base = [{ role: 'system', content: prep.sistema }, { role: 'user', content: prep.usuario }];
    saida.tamanhoPrompt = prep.sistema.length + prep.usuario.length;
    const maxTentativas = Math.max(1, Math.min(4, Number(opcoes.maxTentativas ?? 2)));
    const limiteDef = typeof def.maxTokens === 'function' ? def.maxTokens(prep) : def.maxTokens;
    let limiteTokens = Number(opcoes.maxTokens || limiteDef) || 6000;
    let maxTentativasExtra = 0; // um corte na última tentativa ganha UMA chance a mais com o limite maior
    let mensagens = base;
    let ultimo = null;
    for (let i = 0; i < maxTentativas + Math.min(1, maxTentativasExtra); i++) {
        saida.tentativas++;
        let r;
        try {
            r = await chamarLLM(mensagens, { modelo, maxTokens: limiteTokens, json: true });
        } catch (e) {
            if (!e || !e.cortado) throw e;
            // resposta cortada no limite: já foi paga; tenta de novo com o dobro (até TETO_TOKENS)
            saida.custoUsd += Number(e.custoUsd) || 0;
            const proximo = Math.min(TETO_TOKENS, limiteTokens * 2);
            saida.historico.push({ tentativa: i + 1, erros: [`resposta cortada em ${limiteTokens} tokens`] });
            ultimo = { valor: null, erros: [`A resposta foi cortada no limite de ${limiteTokens} tokens${proximo > limiteTokens ? '' : ' (já no máximo)'}.`], avisos: [], consertos: [] };
            if (proximo === limiteTokens) break;
            saida.avisos.push(`A resposta veio cortada em ${limiteTokens} tokens; tentei de novo com ${proximo}.`);
            limiteTokens = proximo;
            if (opcoes.tetoUsd != null && saida.custoUsd >= Number(opcoes.tetoUsd)) {
                saida.avisos.push(`Teto de US$ ${Number(opcoes.tetoUsd).toFixed(4).replace('.', ',')} atingido: sem nova tentativa.`);
                break;
            }
            if (i === maxTentativas - 1) maxTentativasExtra++;
            continue;
        }
        saida.custoUsd += Number(r?.custoUsd) || 0;
        const j = extrairJson(r?.conteudo);
        if (!j.ok) {
            ultimo = { valor: null, erros: [j.erro], avisos: [], consertos: j.consertos };
            saida.historico.push({ tentativa: i + 1, erros: [j.erro] });
            mensagens = [...base, { role: 'assistant', content: String(r?.conteudo || '').slice(0, 4000) },
                { role: 'user', content: 'A resposta não era um JSON válido. Responda de novo SÓ com o objeto JSON completo, no formato pedido.' }];
        } else {
            const v = def.validar(j.valor, prep.ctxValidacao || {});
            ultimo = { ...v, consertos: [...j.consertos, ...v.consertos], avisos: [...v.avisos] };
            if (j.cortado) ultimo.avisos.push('A resposta veio cortada (limite de tokens): confira se falta conteúdo.');
            if (def.verificar && v.valor) {
                const cont = await def.verificar(v.valor, prep);
                if (cont) {
                    saida.continuidade = { ok: cont.ok, problemas: cont.problemas };
                    for (const p of cont.problemas) {
                        const txt = `continuidade${p.plano ? ` (plano ${p.plano})` : ''}: ${p.texto}`;
                        (p.nivel === 'erro' ? ultimo.erros : ultimo.avisos).push(txt);
                    }
                }
            }
            if (!ultimo.erros.length) break;
            saida.historico.push({ tentativa: i + 1, erros: [...ultimo.erros] });
            mensagens = [...base, { role: 'assistant', content: JSON.stringify(v.valor ?? j.valor).slice(0, 15000) },
                { role: 'user', content: `Corrija estes problemas e devolva o JSON COMPLETO no mesmo formato:\n- ${ultimo.erros.join('\n- ')}` }];
        }
        if (opcoes.tetoUsd != null && saida.custoUsd >= Number(opcoes.tetoUsd) && i < maxTentativas - 1) {
            saida.avisos.push(`Teto de US$ ${Number(opcoes.tetoUsd).toFixed(4).replace('.', ',')} atingido: sem nova tentativa.`);
            break;
        }
    }
    return {
        ...saida, ok: !ultimo.erros.length, resultado: ultimo.valor, erros: ultimo.erros,
        avisos: [...saida.avisos, ...ultimo.avisos], consertos: ultimo.consertos,
        custoUsd: Math.round(saida.custoUsd * 1e6) / 1e6,
    };
}

// "Ver prompt" sem chamar a IA: o MESMO preparar da etapa (memória, bíblia, duração, revisão) e o limite de tokens.
// → { prep, modelo, maxTokens } (prep.erros quando falta algo). Não grava nada nem gasta.
async function prepararEtapa(etapa, contexto = {}, opcoes = {}) {
    const def = ETAPAS[etapa];
    if (!def) throw new Error(`Etapa desconhecida: ${etapa}. Use: ${Object.keys(ETAPAS).join(', ')}.`);
    const prep = await def.preparar(contexto || {});
    const modelo = opcoes.modelo || contexto?.modelo || prep.modeloSerie || MODELO_PADRAO;
    const limiteDef = typeof def.maxTokens === 'function' ? def.maxTokens(prep) : def.maxTokens;
    return { prep, modelo, maxTokens: Number(opcoes.maxTokens || limiteDef) || 6000 };
}

module.exports = { executarEtapa, ETAPAS: Object.keys(ETAPAS), MODELO_PADRAO, textoDoPacote, prepararEtapa };
