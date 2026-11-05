// Consolidação: depois que o episódio foi publicado (e a votação é real), gera uma PROPOSTA de memória
// (fatos novos, fatos encerrados, estado novo, resumo, glossário). Nada canônico é gravado sem aprovar=true.
const { obterSerie, fatosVigentes, aplicarProposta, gravarProposta, acharFicha, TIPOS_FATO } = require('./arquivos');
const est = require('./estado');
const { montarContexto } = require('./contexto');
const { extrairJson } = require('../showrunner/json');
const { epNum, epTag, normalizar, clonar, lista } = require('./util');

const VOZES_SISTEMA = new Set(['narrador', 'alerta']);

function votacaoValida(v) {
    return Boolean(v && ['A', 'B', 'empate'].includes(v.vencedora) && ['manual', 'youtube'].includes(v.fonte));
}

function proximoSeq(fatos, tag) {
    let max = 0;
    for (const f of fatos) {
        const m = String(f.id || '').match(new RegExp(`^${tag}-(\\d+)$`));
        if (m) max = Math.max(max, Number(m[1]));
    }
    return max + 1;
}

function normalizarFato(f, tag, consertos) {
    if (!f || typeof f !== 'object' || !String(f.texto || '').trim()) return null;
    let tipo = normalizar(f.tipo || '').replace(/[^a-z]/g, '');
    if (!TIPOS_FATO.includes(tipo)) {
        consertos.push(`fato com tipo "${f.tipo}" virou "evento"`);
        tipo = 'evento';
    }
    let imp = Number(f.importancia);
    if (![1, 2, 3].includes(imp)) {
        const novo = Math.min(3, Math.max(1, Math.round(imp) || 2));
        consertos.push(`importância "${f.importancia}" ajustada para ${novo}`);
        imp = novo;
    }
    return {
        id: null, tipo, texto: String(f.texto).trim(), fonte: f.fonte ? String(f.fonte) : tag,
        desde: tag, ate: null, importancia: imp,
        sobre: lista(f.sobre).map(String).filter(Boolean),
        ...(f.chave ? { chave: String(f.chave) } : {}),
    };
}

function linhaEscolha(n, roteiro, votacao) {
    if (!votacaoValida(votacao)) return 'Votação: ainda não registrada.';
    if (votacao.vencedora === 'empate') return 'Votação: empate (desempate do Rafael pendente).';
    const o = roteiro.escolhas?.[votacao.vencedora] || {};
    const votos = votacao.votos ? ` (A ${votacao.votos.A ?? '?'} × B ${votacao.votos.B ?? '?'})` : '';
    return `Escolha do público: ${votacao.vencedora} — ${o.texto || ''}${votos}.`;
}

// Proposta só com regras determinísticas (sem LLM): posições pelos planos, escolha pela votação real,
// e o que o roteiro declarou em `continuidade` (fatosNovos / estadoDepois).
function propostaPorRegras(s, n, roteiro, votacao, estadoAntes) {
    const tag = epTag(n);
    const estado = clonar(estadoAntes);
    estado.personagens = estado.personagens || {};
    estado.objetos = estado.objetos || {};
    const fatos = [];
    const avisos = [];
    const consertos = [];
    const glossario = [];
    const ondeDosPlanos = { personagens: new Set(), objetos: new Set() };
    const termosGlossario = new Set(lista(s.memoria.glossario?.termos).map((t) => normalizar(t.termo)));
    const desconhecidos = new Set();

    for (const p of lista(roteiro.planos)) {
        const fonte = `${tag}/p${String(p.n).padStart(2, '0')}`;
        for (const id of lista(p.elenco)) {
            const ficha = acharFicha(s, id, 'personagem');
            if (VOZES_SISTEMA.has(id) || est.ehApresentador(ficha)) continue;
            if (!estado.personagens[id]) {
                estado.personagens[id] = { nome: ficha?.nome || id, onde: null, vivo: true, condicao: 'sem ferimentos', ferimentos: [], estadoFicha: ficha?.estadoAtual || 'padrao', carrega: [], sabe: [] };
                fatos.push({ tipo: 'personagem', texto: `${ficha?.nome || id} entra na história.`, fonte, importancia: 2, sobre: [id] });
                if (!ficha) desconhecidos.add(id);
            }
            if (p.local && estado.personagens[id].onde !== p.local) {
                estado.personagens[id].onde = p.local;
                ondeDosPlanos.personagens.add(id);
            } else if (p.local) ondeDosPlanos.personagens.add(id);
        }
        for (const id of lista(p.objetos)) {
            const ficha = acharFicha(s, id, 'objeto');
            const o = estado.objetos[id];
            if (!o) {
                estado.objetos[id] = { nome: ficha?.nome || id, onde: p.local || null, estado: null, comQuem: null, fixo: Boolean(ficha?.fixo) };
                ondeDosPlanos.objetos.add(id);
                if (!ficha) desconhecidos.add(id);
            } else if (p.local && o.onde !== p.local && !o.fixo) {
                o.onde = p.local;
                o.comQuem = null;
                ondeDosPlanos.objetos.add(id);
            }
        }
        for (const f of lista(p.falas)) {
            if (!f.quem || VOZES_SISTEMA.has(f.quem)) continue;
            if (!acharFicha(s, f.quem, 'personagem') && !estado.personagens[f.quem]) desconhecidos.add(f.quem);
        }
    }
    for (const id of desconhecidos) {
        avisos.push(`"${id}" aparece no roteiro mas não tem ficha: criar na etapa de elenco/locais.`);
        if (!termosGlossario.has(normalizar(id))) glossario.push({ termo: id, tipo: 'novo', pronuncia: null, nota: 'conferir grafia e pronúncia' });
    }

    // o que o próprio roteiro declarou (o showrunner pede este bloco) vence a dedução pelos planos
    const cont = roteiro.continuidade || {};
    for (const f of lista(cont.fatosNovos)) fatos.push({ ...f, fonte: f.fonte || tag });
    mesclarEstado(estado, cont.estadoDepois, { ondeTravado: null });
    for (const grupo of ['personagens', 'objetos']) {
        for (const [id, v] of Object.entries(cont.estadoDepois?.[grupo] || {})) if (v && v.onde) ondeDosPlanos[grupo].add(id);
    }
    for (const [id, p] of Object.entries(cont.estadoDepois?.personagens || {})) {
        if (p && p.vivo === false && estadoAntes.personagens?.[id]?.vivo !== false) {
            fatos.push({ tipo: 'personagem', texto: `${estado.personagens[id]?.nome || id} morre no Ep. ${n}.`, fonte: tag, importancia: 3, sobre: [id], chave: `personagem:${id}:vivo` });
        }
    }

    // posição final (depois do que o roteiro declarou): só vira fato o que mudou de lugar
    for (const id of ondeDosPlanos.personagens) {
        const p = estado.personagens[id];
        if (!p || (estadoAntes.personagens?.[id] && estadoAntes.personagens[id].onde === p.onde)) continue;
        fatos.push({ tipo: 'personagem', texto: `${p.nome || id} termina o Ep. ${n} em ${est.nomeLocal(p.onde, s)}.`, fonte: tag, importancia: 1, sobre: [id, p.onde].filter(Boolean), chave: `personagem:${id}:onde` });
    }
    for (const id of ondeDosPlanos.objetos) {
        const o = estado.objetos[id];
        if (!o || (estadoAntes.objetos?.[id] && estadoAntes.objetos[id].onde === o.onde)) continue;
        fatos.push({ tipo: 'objeto', texto: `${o.nome || id} está em ${est.nomeLocal(o.onde, s)}.`, fonte: tag, importancia: 2, sobre: [id, o.onde].filter(Boolean), chave: `objeto:${id}:onde` });
    }

    // votação real -> escolha + consequência pendente para o próximo episódio
    estado.escolhas = lista(estado.escolhas).filter((e) => epNum(e.ep) !== n);
    estado.consequenciasPendentes = lista(estado.consequenciasPendentes).filter((c) => c.paraEp != null && epNum(c.paraEp) > n);
    if (!votacao) avisos.push('Votação ainda não registrada: a escolha do público fica de fora (nunca inventada).');
    else if (!votacaoValida(votacao)) avisos.push('Votação ignorada: precisa de vencedora A|B|empate e fonte manual|youtube.');
    else if (votacao.vencedora === 'empate') avisos.push('Votação empatada: o Rafael decide o desempate antes do próximo roteiro.');
    else {
        const v = votacao.vencedora;
        const o = roteiro.escolhas?.[v] || {};
        if (votacao.votos && Number.isFinite(votacao.votos.A) && Number.isFinite(votacao.votos.B)) {
            const maior = votacao.votos.A > votacao.votos.B ? 'A' : votacao.votos.B > votacao.votos.A ? 'B' : 'empate';
            if (maior !== v) avisos.push(`Os votos (A ${votacao.votos.A} × B ${votacao.votos.B}) não batem com a vencedora ${v}: conferir.`);
        }
        estado.escolhas.push({ ep: n, vencedora: v, texto: o.texto || null, votos: votacao.votos || null, fonte: votacao.fonte });
        fatos.push({ tipo: 'evento', texto: `No fim do Ep. ${n}, o público escolheu ${v}: ${o.texto || ''}${o.detalhe ? ` — ${o.detalhe}` : ''}`.trim(), fonte: `${tag}/votacao`, importancia: 3, sobre: [] });
        const consequencia = o.consequencia || o.detalhe;
        if (consequencia) estado.consequenciasPendentes.push({ paraEp: n + 1, texto: consequencia, origem: `${tag}/${v}` });
    }
    estado.atualizadoAte = tag;
    delete estado.atualizadoEm; // a data entra quando o Rafael aprovar

    const titulo = roteiro.titulo || '';
    const resumo = `# Ep. ${n}${titulo ? ` — ${titulo}` : ''}\n\n${roteiro.resumo || '(o roteiro não trouxe resumo)'}\n\n${linhaEscolha(n, roteiro, votacao)}`;
    return { fatos, estado, resumo, glossario, avisos, consertos, ondeDosPlanos };
}

// Mescla campo a campo um estado parcial (do roteiro ou da IA) no estado da proposta.
function mesclarEstado(estado, parcial, { ondeTravado }) {
    if (!parcial || typeof parcial !== 'object') return;
    for (const grupo of ['personagens', 'objetos', 'locais']) {
        for (const [id, valores] of Object.entries(parcial[grupo] || {})) {
            if (!valores || typeof valores !== 'object') continue;
            estado[grupo] = estado[grupo] || {};
            const atual = estado[grupo][id] || {};
            const novo = { ...atual };
            for (const [k, v] of Object.entries(valores)) {
                if (k === 'onde' && ondeTravado && ondeTravado[grupo]?.has(id)) continue; // o que os planos mostraram vence
                novo[k] = v;
            }
            estado[grupo][id] = novo;
        }
    }
    if (parcial.recursos && typeof parcial.recursos === 'object') estado.recursos = { ...(estado.recursos || {}), ...parcial.recursos };
    if (Array.isArray(parcial.misteriosAbertos)) estado.misteriosAbertos = parcial.misteriosAbertos;
    if (Array.isArray(parcial.segredos)) estado.segredos = parcial.segredos;
}

function ehFatoDeVotacao(f) {
    const t = normalizar(`${f.texto} ${f.chave || ''}`);
    return /\b(votacao|votaram|votos|escolheu|escolha do publico|venceu a opcao)\b/.test(t);
}

/**
 * Gera a proposta de memória do episódio. Com aprovar=true grava nos arquivos canônicos.
 * @param serie caminho da pasta ou série carregada
 * @param ep número do episódio (1) ou 'ep01'
 * @param op { roteiroAprovado, votacao, chamarLLM, modelo, aprovar, proposta (editada pelo Rafael), salvarProposta }
 */
async function consolidarEpisodio(serie, ep, op = {}) {
    const s = obterSerie(serie);
    const n = epNum(ep);
    if (!n || n < 1) throw new Error(`Episódio inválido: ${ep}`);
    const tag = epTag(n);

    // aprovação de uma proposta já revisada (e talvez editada) pelo Rafael
    if (op.aprovar && op.proposta) {
        if (epNum(op.proposta.ep) !== n) throw new Error(`A proposta é do ${op.proposta.ep}, não do ${tag}.`);
        const gravados = aplicarProposta(s.pasta, op.proposta);
        return { ...op.proposta, aprovada: true, gravados };
    }

    const roteiro = op.roteiroAprovado || s.episodios?.[n]?.roteiro;
    if (!roteiro) throw new Error(`Sem roteiro do ${tag} para consolidar.`);
    const avisos = [];
    if (!roteiro.aprovado) avisos.push('O roteiro não está marcado como aprovado.');
    const votacao = op.votacao !== undefined ? op.votacao : (s.episodios?.[n]?.votacao || null);
    const estadoAntes = est.estadoOuInicial(s);
    if (epNum(estadoAntes.atualizadoAte) >= n) avisos.push(`A memória já foi consolidada até ${estadoAntes.atualizadoAte}: aprovar de novo sobrescreve o estado.`);

    const regras = propostaPorRegras(s, n, roteiro, votacao, estadoAntes);
    avisos.push(...regras.avisos);
    const consertos = [...regras.consertos];
    let fatosBrutos = regras.fatos;
    let resumo = regras.resumo;
    const estadoNovo = regras.estado;
    const glossarioNovo = [...regras.glossario];
    const vigentes = fatosVigentes(s.memoria.fatos, n);
    const encerradosIa = [];
    let custoUsd = 0;
    let origem = 'regras';

    if (typeof op.chamarLLM === 'function') {
        const pacote = await montarContexto(s, 'consolidacao', { ep: n, roteiro, votacao: votacaoValida(votacao) ? votacao : null, limiteCaracteres: op.limiteCaracteres });
        const r = await op.chamarLLM(pacote.mensagens, { modelo: op.modelo || s.serie?.modelos?.texto || 'openai/gpt-6-luna', maxTokens: op.maxTokens || 3000, json: true });
        custoUsd += Number(r?.custoUsd) || 0;
        const j = extrairJson(r?.conteudo);
        consertos.push(...j.consertos);
        if (!j.ok || !j.valor || typeof j.valor !== 'object') {
            avisos.push(`A IA não devolveu JSON válido (${j.erro || 'formato'}): ficou só a proposta por regras.`);
        } else {
            origem = 'regras+llm';
            const ia = j.valor;
            if (typeof ia.resumo === 'string' && ia.resumo.trim()) {
                resumo = `# Ep. ${n}${roteiro.titulo ? ` — ${roteiro.titulo}` : ''}\n\n${ia.resumo.trim()}\n\n${linhaEscolha(n, roteiro, votacaoValida(votacao) ? votacao : null)}`;
            }
            for (const f of lista(ia.fatosNovos)) {
                if (ehFatoDeVotacao(f || {})) { consertos.push('descartado fato sobre votação vindo da IA (a escolha vem só da votação real)'); continue; }
                fatosBrutos.push({ ...f, _ia: true });
            }
            for (const e of lista(ia.fatosEncerrados)) {
                if (e && vigentes.some((v) => v.id === e.id)) encerradosIa.push({ id: e.id, ate: tag, motivo: e.motivo || 'encerrado na consolidação' });
                else if (e && e.id) consertos.push(`ignorado encerramento de fato inexistente ou já encerrado: ${e.id}`);
            }
            if (ia.estado && typeof ia.estado === 'object') {
                const { escolhas, consequenciasPendentes, atualizadoAte, ...resto } = ia.estado;
                if (escolhas || consequenciasPendentes) consertos.push('ignoradas escolhas/consequências vindas da IA (só a votação real decide)');
                mesclarEstado(estadoNovo, resto, { ondeTravado: regras.ondeDosPlanos });
            }
            const termos = new Set([...lista(s.memoria.glossario?.termos), ...glossarioNovo].map((t) => normalizar(t.termo)));
            for (const t of lista(ia.glossario)) {
                if (t && t.termo && !termos.has(normalizar(t.termo))) { glossarioNovo.push({ termo: String(t.termo), tipo: t.tipo || null, pronuncia: t.pronuncia || null, nota: t.nota || null }); termos.add(normalizar(t.termo)); }
            }
        }
    }

    // normaliza, tira duplicados (texto igual ou mesma chave: regras vencem) e numera
    const fatosNovos = [];
    const textos = new Set(vigentes.map((f) => normalizar(f.texto)));
    const chaves = new Set();
    for (const bruto of fatosBrutos) {
        const f = normalizarFato(bruto, tag, consertos);
        if (!f) continue;
        const t = normalizar(f.texto);
        if (textos.has(t)) continue;
        if (f.chave && chaves.has(f.chave)) continue;
        textos.add(t);
        if (f.chave) chaves.add(f.chave);
        fatosNovos.push(f);
    }
    let seq = proximoSeq(s.memoria.fatos, tag);
    for (const f of fatosNovos) f.id = `${tag}-${String(seq++).padStart(3, '0')}`;

    // fato novo com `chave` encerra o vigente com a mesma chave
    const fatosEncerrados = [...encerradosIa];
    for (const f of fatosNovos) {
        if (!f.chave) continue;
        for (const v of s.memoria.fatos) {
            if (v.chave === f.chave && v.ate == null && v.id !== f.id && !fatosEncerrados.some((e) => e.id === v.id)) {
                fatosEncerrados.push({ id: v.id, ate: tag, motivo: `substituído por ${f.id}` });
            }
        }
    }

    const proposta = {
        versao: 1, ep: tag, titulo: roteiro.titulo || null, criadaEm: new Date().toISOString(), origem, aprovada: false,
        resumo, fatosNovos, fatosEncerrados, estadoNovo, glossarioNovo,
        mudancas: est.diferencas(estadoAntes, estadoNovo), avisos, consertos, custoUsd,
    };
    if (op.aprovar) {
        proposta.gravados = aplicarProposta(s.pasta, proposta);
        proposta.aprovada = true;
    } else if (s.pasta && op.salvarProposta !== false) {
        proposta.arquivo = gravarProposta(s.pasta, proposta); // rascunho em memoria/propostas/ (não é canônico)
    }
    return proposta;
}

/** Primeira memória a partir da bíblia aprovada (fatos ep00 + estado inicial + glossário). Mesmo esquema de proposta. */
function semearDaBiblia(serie, op = {}) {
    const s = obterSerie(serie);
    const b = s.biblia || {};
    const tag = 'ep00';
    const fatos = [];
    let i = 1;
    const novo = (f) => fatos.push({ id: `${tag}-${String(i++).padStart(3, '0')}`, fonte: 'biblia', desde: tag, ate: null, sobre: [], ...f });
    lista(b.regras).forEach((r) => novo({ tipo: 'regra', texto: r, importancia: 3 }));
    const estado = est.estadoInicial(s);
    for (const [id, p] of Object.entries(estado.personagens)) {
        const f = acharFicha(s, id, 'personagem');
        novo({ tipo: 'personagem', texto: `${p.nome}${f?.papel ? `: ${f.papel}` : ''}.`, importancia: 2, sobre: [id] });
        if (p.onde) novo({ tipo: 'personagem', texto: `${p.nome} começa em ${est.nomeLocal(p.onde, s)}.`, importancia: 1, sobre: [id, p.onde], chave: `personagem:${id}:onde` });
    }
    for (const [id, o] of Object.entries(estado.objetos)) {
        if (o.onde) novo({ tipo: 'objeto', texto: `${o.nome} está em ${est.nomeLocal(o.onde, s)}.`, importancia: 2, sobre: [id, o.onde], chave: `objeto:${id}:onde` });
    }
    for (const sg of estado.segredos) novo({ tipo: 'segredo', texto: `${sg.texto} (${sg.publicoSabe ? 'o público sabe' : 'só personagens'})`, importancia: 3 });
    lista(b.misterios).forEach((m) => novo({ tipo: 'misterio', texto: m, importancia: 3 }));
    const glossarioNovo = [];
    for (const f of Object.values(s.fichas.elenco)) {
        if (f.nome && !est.ehApresentador(f)) glossarioNovo.push({ id: f.id, termo: f.nome, tipo: 'personagem', grafia: f.nome, pronuncia: null, nota: 'conferir pronúncia nas vozes' });
    }
    const proposta = {
        versao: 1, ep: tag, titulo: 'Memória inicial (bíblia)', criadaEm: new Date().toISOString(), origem: 'biblia', aprovada: false,
        resumo: null, fatosNovos: fatos, fatosEncerrados: [], estadoNovo: estado, glossarioNovo, mudancas: [], avisos: [], consertos: [], custoUsd: 0,
    };
    if (s.memoria.fatos.length) proposta.avisos.push('A memória já tem fatos: semear de novo duplica/sobrescreve os da bíblia (mesmos ids).');
    if (op.aprovar) {
        proposta.gravados = aplicarProposta(s.pasta, proposta);
        proposta.aprovada = true;
    } else if (s.pasta && op.salvarProposta !== false) proposta.arquivo = gravarProposta(s.pasta, proposta);
    return proposta;
}

module.exports = { consolidarEpisodio, semearDaBiblia, propostaPorRegras, votacaoValida };
