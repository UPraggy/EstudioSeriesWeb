// montarContexto: escolhe da memória SÓ o que importa para cada finalidade, em seções com prioridade,
// corta pelo tamanho (o menos importante sai primeiro) e devolve as mensagens no formato chat completions
// (multimodal com data URL quando há imagem de referência).
const fs = require('fs');
const path = require('path');
const { obterSerie, fatosVigentes, acharFicha } = require('./arquivos');
const est = require('./estado');
const { epNum, epTag, normalizar, lista, encurtar } = require('./util');

const FINALIDADES = ['roteiro', 'decupagem', 'quadroChave', 'video', 'verificacao', 'consolidacao'];
const LIMITE_PADRAO = { roteiro: 12000, decupagem: 10000, quadroChave: 4000, video: 1500, verificacao: 12000, consolidacao: 12000 };
const IMAGENS_PADRAO = { quadroChave: 4, video: 2 };
// importância do fato (3 = muda a história, 1 = detalhe) -> prioridade de corte (1 = fica, 5 = sai primeiro)
const PRIO_IMPORTANCIA = { 3: 2, 2: 3, 1: 5 };
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };
const PASTA_TIPO = { personagem: 'elenco', local: 'locais', objeto: 'objetos' };

const SISTEMA = {
    roteiro: 'A mensagem do usuário traz a MEMÓRIA CANÔNICA da série (fonte da verdade). Não contradiga regras, estado do mundo, mortos, '
        + 'escolhas do público, fatos nem resumos. O que não estiver na memória, invente pouco e declare em "continuidade.fatosNovos".',
    decupagem: 'A mensagem do usuário traz o roteiro APROVADO e a memória visual da série: âncoras (aparência fixa) de quem e onde aparece, '
        + 'estado atual (ferimentos, objetos) e referências disponíveis. Repita a âncora em todo prompt de personagem/local; respeite o estado.',
    quadroChave: 'Você gera o QUADRO-CHAVE (primeiro quadro) de um plano de série vertical 9:16. As imagens anexadas são referências CANÔNICAS: '
        + 'a pessoa da imagem de identidade é a MESMA pessoa (mesmo rosto, cabelo, idade e roupa); o cenário de referência define arquitetura, luz e cor. '
        + 'Terror sugerido: sem sangue, sem ferida aberta, sem violência explícita. Sem texto, legenda, logotipo ou marca d\'água. Gere UMA imagem.',
    video: 'Você ajusta o prompt de MOVIMENTO de um clipe curto (imagem para vídeo). O primeiro quadro anexado já fixa identidade, roupa e cenário: '
        + 'descreva só câmera, ação e atmosfera, em inglês, até 500 caracteres, sem texto na tela, sem sangue, sem boca falando. Responda só com o prompt.',
    verificacao: 'Você é o supervisor de continuidade da série. Compare o ROTEIRO com a MEMÓRIA CANÔNICA e aponte contradições: objeto em outro lugar '
        + 'sem ninguém que o levasse, personagem morto em cena, ferimento ignorado, regra do mundo quebrada, escolha do público ignorada, personagem '
        + 'num lugar impossível, segredo revelado sem motivo, recurso que não existe mais, nome com grafia errada. "erro" = contradiz a memória; '
        + '"aviso" = suspeito. Não acuse o que a memória não diz. Responda SÓ com JSON: {"contradicoes":[{"plano":3,"tipo":"objeto_fora_do_lugar|'
        + 'morto_em_cena|ferimento|regra_quebrada|escolha_ignorada|personagem_deslocado|segredo_revelado|recurso|grafia|outro","gravidade":"erro|aviso",'
        + '"texto":"explicação curta em português","fatoId":"id do fato ou null"}]}. Sem contradições: {"contradicoes":[]}.',
    consolidacao: 'Você é o arquivista da série. A partir do ROTEIRO APROVADO e da VOTAÇÃO REAL, proponha a atualização da memória. Registre só o que '
        + 'aconteceu na tela ou nas falas; a escolha do público vem SÓ da votação informada (nunca invente resultado). Responda SÓ com JSON: '
        + '{"resumo":"3 a 6 frases, pt-BR","fatosNovos":[{"tipo":"regra|evento|personagem|objeto|local|relacao|segredo|misterio","texto":"...",'
        + '"sobre":["ids"],"importancia":1,"fonte":"epNN/pNN","chave":"opcional, ex.: objeto:barra:onde"}],"fatosEncerrados":[{"id":"...","motivo":"..."}],'
        + '"estado":{"personagens":{"id":{"onde":"local","condicao":"...","vivo":true,"ferimentos":[],"carrega":[],"sabe":[]}},"objetos":{"id":{"onde":"local",'
        + '"estado":"...","comQuem":null}},"recursos":{},"misteriosAbertos":[]},"glossario":[{"termo":"Nome","tipo":"personagem","pronuncia":null,"nota":"..."}]}. '
        + 'Importância: 3 = muda a história, 2 = útil, 1 = detalhe. Use "chave" em fatos exclusivos (o novo encerra o antigo com a mesma chave).',
};

// ---------------------------------------------------------------- seções e corte por tamanho
function item(texto, prioridade, peso = 0, rotulo = null, fixo = false) {
    return texto ? { texto, prioridade, peso, rotulo, fixo } : null;
}

function secao(id, titulo, prioridade, itens, extra = {}) {
    return {
        id, titulo, prioridade, ...extra,
        itens: (itens || []).filter(Boolean).map((it) => (typeof it === 'string' ? { texto: it } : it)),
    };
}

function renderizar(cabecalho, secoes, comTitulos = true) {
    const blocos = secoes.filter((s) => s.itens.length).map((s) => {
        const corpo = s.itens.map((i) => i.texto).join(comTitulos ? '\n' : ' ');
        return comTitulos ? `## ${s.titulo}\n${corpo}` : corpo;
    });
    return [cabecalho, ...blocos].filter(Boolean).join(comTitulos ? '\n\n' : ' ');
}

// Remove, um a um, o item de MAIOR número de prioridade (e menor peso) até caber. Seções/itens fixos nunca saem.
function cortarPorTamanho(cabecalho, secoes, limite, comTitulos = true) {
    const vivas = secoes.map((s) => ({
        ...s,
        itens: s.itens.map((it, i) => ({ ...it, prioridade: it.prioridade ?? s.prioridade ?? 3, peso: it.peso ?? 0, ordem: i })),
    }));
    const cortes = [];
    let texto = renderizar(cabecalho, vivas, comTitulos);
    while (texto.length > limite) {
        let alvo = null;
        for (const s of vivas) {
            if (s.fixa) continue;
            for (const it of s.itens) {
                if (it.fixo) continue;
                if (!alvo || it.prioridade > alvo.it.prioridade
                    || (it.prioridade === alvo.it.prioridade && it.peso < alvo.it.peso)) alvo = { s, it };
            }
        }
        if (!alvo) break;
        alvo.s.itens = alvo.s.itens.filter((x) => x !== alvo.it);
        cortes.push({ secao: alvo.s.id, item: alvo.it.rotulo || encurtar(alvo.it.texto.replace(/^-\s*/, ''), 70), motivo: 'tamanho', caracteres: alvo.it.texto.length });
        texto = renderizar(cabecalho, vivas, comTitulos);
    }
    return { texto, cortes, excedeu: texto.length > limite, secoes: vivas.filter((s) => s.itens.length).map((s) => s.id) };
}

// ---------------------------------------------------------------- blocos de memória reutilizados
function nomeDe(s, id) {
    return acharFicha(s, id)?.nome || s.memoria.estado?.personagens?.[id]?.nome || id;
}

function fatoLinha(f) {
    const desde = f.desde != null ? `desde ${f.desde}` : '';
    return `- [${f.tipo || 'fato'}] ${f.texto} (${[f.id, desde].filter(Boolean).join(', ')})`;
}

function temFatosDoTipo(s, tipo) {
    return s.memoria.fatos.some((f) => f.tipo === tipo);
}

function regrasItens(s, vig) {
    const itens = [];
    if (s.biblia.premissa) itens.push(item(`- Premissa: ${s.biblia.premissa}`, 1, 0, 'premissa', true));
    if (temFatosDoTipo(s, 'regra')) {
        for (const f of vig.filter((x) => x.tipo === 'regra')) {
            const imp = Number(f.importancia) || 2;
            itens.push(item(`- ${f.texto} (${f.id})`, imp >= 3 ? 1 : imp === 2 ? 2 : 4, imp, f.id));
        }
    } else {
        lista(s.biblia.regras).forEach((r, i) => itens.push(item(`- ${r}`, 1, 10 - i, `regra ${i + 1}`)));
    }
    return itens;
}

function votacaoReal(s, k) {
    const v = s.episodios?.[k]?.votacao;
    if (v && ['A', 'B', 'empate'].includes(v.vencedora) && ['manual', 'youtube'].includes(v.fonte)) return v;
    const e = (s.memoria.estado?.escolhas || []).find((x) => epNum(x.ep) === k);
    if (e && ['A', 'B', 'empate'].includes(e.vencedora)) return { ep: k, vencedora: e.vencedora, votos: e.votos || null, fonte: e.fonte || 'memoria' };
    return null;
}

function escolhasItens(s, estado, ep) {
    const itens = [];
    for (const p of lista(estado.consequenciasPendentes)) {
        if (p && (p.paraEp == null || epNum(p.paraEp) === ep)) itens.push(item(`- PENDENTE para o Ep. ${ep}: ${p.texto}`, 1, 100, 'pendente', true));
    }
    for (let k = 1; k < ep; k++) {
        const v = votacaoReal(s, k);
        const esc = s.episodios?.[k]?.roteiro?.escolhas || {};
        let texto;
        if (!v) texto = `- Ep. ${k}: votação NÃO registrada — não invente o resultado.`;
        else if (v.vencedora === 'empate') texto = `- Ep. ${k}: EMPATE na votação (o Rafael decide o desempate).`;
        else {
            const o = esc[v.vencedora] || {};
            const votos = v.votos ? ` (votos A ${v.votos.A ?? '?'} × B ${v.votos.B ?? '?'})` : '';
            texto = `- Ep. ${k}: venceu ${v.vencedora}${o.texto ? ` — ${o.texto}` : ''}${votos}.${o.consequencia ? ` Consequência prometida: ${o.consequencia}` : ''}`;
        }
        itens.push(item(texto, k === ep - 1 ? 1 : 2, k, `escolha ep${k}`, k === ep - 1));
    }
    if (!itens.length) itens.push(item('- Primeiro episódio: ainda não há escolhas do público.', 1, 0, null, true));
    return itens;
}

function estadoItens(s, estado, ids) {
    const itens = [];
    const filtra = (id) => !ids || ids.has(id);
    for (const [id, p] of Object.entries(estado.personagens || {})) {
        if (!filtra(id)) continue;
        itens.push(item(est.linhaPersonagem(id, p, s), p.vivo === false ? 1 : 2, 50, `estado ${id}`, p.vivo === false));
    }
    for (const [id, o] of Object.entries(estado.objetos || {})) {
        if (!filtra(id)) continue;
        itens.push(item(est.linhaObjeto(id, o, s), 2, 20, `objeto ${id}`));
    }
    if (!ids) {
        est.linhasRecursos(estado).forEach((l) => itens.push(item(l, 2, 30, 'recurso')));
        for (const [id, l] of Object.entries(estado.locais || {})) itens.push(item(`- local ${id}: ${l.estado || JSON.stringify(l)}`, 3, 10, `local ${id}`));
    } else {
        for (const [id, l] of Object.entries(estado.locais || {})) if (ids.has(id)) itens.push(item(`- local ${id}: ${l.estado || JSON.stringify(l)}`, 2, 10, `local ${id}`));
    }
    return itens;
}

function resumosItens(s, ep) {
    const itens = [];
    for (let k = 1; k < ep; k++) {
        let txt = s.memoria.resumos?.[k];
        let origem = '';
        if (!txt) {
            txt = s.episodios?.[k]?.roteiro?.resumo;
            origem = txt ? ' (do roteiro; memória não consolidada)' : '';
        }
        if (!txt) continue;
        const limpo = String(txt).replace(/^#.*$/m, '').replace(/\s+/g, ' ').trim();
        itens.push(item(`- Ep. ${k}${origem}: ${limpo}`, k === ep - 1 ? 2 : 4, k, `resumo ep${k}`));
    }
    return itens;
}

function personagensItens(s, estado, ids) {
    const itens = [];
    const todos = new Set([...Object.keys(s.fichas.elenco || {}), ...Object.keys(estado.personagens || {})]);
    for (const id of todos) {
        if (ids && !ids.has(id)) continue;
        const f = s.fichas.elenco[id] || {};
        const p = estado.personagens?.[id];
        if (p && p.vivo === false) {
            itens.push(item(`- ${p.nome || f.nome || id} (${id}): MORTO — não pode aparecer vivo nem falar.`, 1, 99, `morto ${id}`, true));
            continue;
        }
        const ap = est.ehApresentador(f) ? ' · APRESENTADOR (fora da história; lip-sync só nele)' : '';
        const partes = [`- ${f.nome || p?.nome || id} (${id})${ap}`];
        if (f.papel) partes.push(f.papel);
        if (f.ancora) partes.push(`aparência: ${f.ancora}`);
        itens.push(item(partes.join(' · '), ap ? 3 : 2, ap ? 1 : 5, `personagem ${id}`));
    }
    return itens;
}

function misteriosItens(s, estado, vig) {
    const itens = [];
    if (temFatosDoTipo(s, 'misterio')) vig.filter((f) => f.tipo === 'misterio').forEach((f) => itens.push(item(`- Mistério: ${f.texto} (${f.id})`, 2, Number(f.importancia) || 2, f.id)));
    else lista(estado.misteriosAbertos || s.biblia.misterios).forEach((m, i) => itens.push(item(`- Mistério: ${m}`, 2, 5 - i, `misterio ${i + 1}`)));
    if (temFatosDoTipo(s, 'segredo')) {
        vig.filter((f) => f.tipo === 'segredo').forEach((f) => itens.push(item(`- Segredo: ${f.texto} (${f.id})`, 2, Number(f.importancia) || 2, f.id)));
    } else {
        for (const sg of lista(estado.segredos)) {
            const quem = sg.publicoSabe ? 'o público sabe' : 'o público ainda não sabe';
            const sabem = lista(sg.sabem).length ? `; sabem: ${lista(sg.sabem).join(', ')}` : '; nenhum personagem sabe';
            itens.push(item(`- Segredo (${quem}${sabem}): ${sg.texto}`, 2, 3, `segredo ${sg.id}`));
        }
    }
    return itens;
}

function relevante(f, ids, s) {
    const sobre = lista(f.sobre);
    if (sobre.length) return sobre.some((id) => ids.has(id));
    const t = ` ${normalizar(f.texto).replace(/[^a-z0-9]+/g, ' ')} `;
    for (const id of ids) {
        const nome = normalizar(nomeDe(s, id)).replace(/[^a-z0-9]+/g, ' ').trim();
        if (t.includes(` ${normalizar(id)} `) || (nome && t.includes(` ${nome} `))) return true;
    }
    return false;
}

// Fatos de posição (chave "...:onde") ficam de fora: o estado do mundo já diz onde cada um está.
function fatosItens(s, vig, { excluirTipos = [], ids = null, cortes = null, secaoId = 'fatos', prioMin = 0 } = {}) {
    const itens = [];
    let fora = 0;
    for (const f of vig) {
        if (excluirTipos.includes(f.tipo)) continue;
        if (f.chave && /:onde$/.test(f.chave)) continue;
        if (ids && !relevante(f, ids, s)) { fora++; continue; }
        const imp = Number(f.importancia) || 2;
        itens.push(item(fatoLinha(f), Math.max(prioMin, PRIO_IMPORTANCIA[imp] || 3), epNum(f.desde) ?? 0, f.id));
    }
    if (fora && cortes) cortes.push({ secao: secaoId, item: `${fora} fato(s) sobre quem/onde não aparece aqui`, motivo: 'irrelevante', quantidade: fora });
    return itens;
}

function temporadaItens(s, ep) {
    return lista(s.biblia.temporada).filter((t) => Number(t.n) > ep).map((t) => item(
        `- Ep. ${t.n} "${t.titulo || ''}" — ${t.fase || ''}${t.resumo ? `: ${t.resumo}` : ''}`,
        Number(t.n) <= ep + 2 ? 3 : 4, -Number(t.n), `temporada ep${t.n}`,
    ));
}

function idsItens(s, estado) {
    const itens = [];
    for (const [id, f] of Object.entries(s.fichas.locais || {})) itens.push(item(`- local ${id}: ${f.nome || id}`, 4, 2, `local ${id}`));
    const objs = new Set([...Object.keys(s.fichas.objetos || {}), ...Object.keys(estado.objetos || {})]);
    for (const id of objs) {
        const f = s.fichas.objetos[id] || {};
        const o = estado.objetos?.[id];
        itens.push(item(`- objeto ${id}: ${f.nome || o?.nome || id}${o?.onde ? ` (em ${o.onde})` : ''}`, 4, 1, `objeto ${id}`));
    }
    return itens;
}

function glossarioItens(s, prio = 3) {
    return lista(s.memoria.glossario?.termos).map((t) => {
        const partes = [`- ${t.termo}`];
        if (t.grafia && t.grafia !== t.termo) partes.push(`escreva "${t.grafia}"`);
        if (t.pronuncia) partes.push(`pronúncia "${t.pronuncia}"`);
        if (lista(t.variantesErradas).length) partes.push(`nunca: ${lista(t.variantesErradas).join(', ')}`);
        if (lista(t.evitarNaFalaDe).length) partes.push(`não pôr na fala de: ${lista(t.evitarNaFalaDe).join(', ')}`);
        if (t.nota) partes.push(t.nota);
        return item(partes.join(' · '), prio, 0, `glossário ${t.termo}`);
    });
}

function linhaPlano(p) {
    const partes = [`P${p.n} · ${p.deS ?? '?'}–${p.ateS ?? '?'} s (${duracaoPlano(p)} s) · ${p.tipo || '?'}`];
    if (p.local) partes.push(`local: ${p.local}`);
    if (lista(p.elenco).length) partes.push(`elenco: ${lista(p.elenco).join(', ')}`);
    if (p.pov) partes.push(`POV de ${p.pov}`);
    if (lista(p.objetos).length) partes.push(`objetos: ${lista(p.objetos).join(', ')}`);
    if (p.visual) partes.push(`visual: ${p.visual}`);
    if (p.tela) partes.push(`tela: "${p.tela}"`);
    const falas = lista(p.falas).map((f) => `${f.quem} (${f.via || '?'}): "${f.texto}"`);
    if (falas.length) partes.push(`falas: ${falas.join(' | ')}`);
    return `- ${partes.join(' · ')}`;
}

function duracaoPlano(p) {
    if (p.deS != null && p.ateS != null) return Math.round((p.ateS - p.deS) * 10) / 10;
    return p.duracaoS ?? '?';
}

function roteiroItens(roteiro) {
    const itens = [];
    itens.push(item(`- Ep. ${roteiro.n ?? '?'} "${roteiro.titulo || ''}" · ${roteiro.duracaoAlvoS || 60} s · objetivo: ${roteiro.objetivo || '—'}`, 1, 0, null, true));
    if (roteiro.resumo) itens.push(item(`- Resumo: ${roteiro.resumo}`, 1, 0, null, true));
    for (const p of lista(roteiro.planos)) itens.push(item(linhaPlano(p), 1, 0, `P${p.n}`, true));
    const e = roteiro.escolhas || {};
    for (const k of ['A', 'B']) {
        if (e[k]) itens.push(item(`- Escolha ${k}: ${e[k].texto || ''} — ${e[k].detalhe || ''}${e[k].consequencia ? ` (consequência: ${e[k].consequencia})` : ''}`, 1, 0, null, true));
    }
    if (roteiro.cta) itens.push(item(`- CTA: ${roteiro.cta}`, 1, 0, null, true));
    return itens;
}

// Âncora visual (aparência fixa) + estado atual de uma entidade.
function ancoraItem(s, id, estado, prio = 1, curto = false) {
    const f = acharFicha(s, id);
    if (!f) return item(`- ${id}: SEM FICHA (sem âncora visual — criar na etapa de elenco/locais)`, prio, 0, `âncora ${id}`);
    const tipo = f.tipo || 'personagem';
    const e = lista(f.estados).find((x) => x.id === (estado.personagens?.[id]?.estadoFicha || f.estadoAtual)) || null;
    const p = estado.personagens?.[id];
    const fer = lista(p?.ferimentos).map((x) => (typeof x === 'string' ? x : [x.onde, x.descricao].filter(Boolean).join(': ')));
    const o = estado.objetos?.[id];
    if (curto) {
        // Para o prompt do modelo de vídeo: "Nome: âncora (inglês se houver)".
        let t = `${f.nome || id}: ${f.ancoraEn || f.ancora || ''}`.trim();
        if (fer.length) t += `; visible injury: ${fer.join('; ')}`;
        return item(t.replace(/[.;:\s]+$/, '') + '.', prio, 10, `âncora ${id}`);
    }
    const partes = [`- ${f.nome || id} (${id} · ${tipo}${e && e.descricao ? ` · estado "${e.id}": ${e.descricao}` : ''})`];
    if (f.ancora) partes.push(f.ancora);
    if (f.ancoraEn) partes.push(`EN: ${f.ancoraEn}`);
    if (p?.vivo === false) partes.push('MORTO');
    if (fer.length) partes.push(`ferimentos visíveis: ${fer.join('; ')}`);
    if (o && o.estado) partes.push(`agora: ${o.estado}`);
    return item(partes.filter(Boolean).join(' · '), prio, 10, `âncora ${id}`);
}

function refsDaFicha(s, f) {
    const e = lista(f.estados).find((x) => x.id === (s.memoria.estado?.personagens?.[f.id]?.estadoFicha || f.estadoAtual)) || lista(f.estados)[0] || null;
    return { estado: e, refs: { ...(e?.refs || {}) }, canonica: f.canonica || null };
}

// Caminho de mídia -> relativo à pasta da série. Fichas: relativo à pasta da ficha (ex.: "ref/x.png");
// planos.json: relativo à pasta do episódio (ex.: "quadros/p03.png"); começando com elenco/, locais/... já é da série.
function caminhoSerie(rel, base) {
    if (!rel) return null;
    const r = String(rel).replace(/\\/g, '/').replace(/^\.\//, '');
    if (/^(elenco|locais|objetos|episodios|memoria)\//.test(r)) return r;
    return base ? `${base}/${r}` : r;
}

function pastaFicha(f) {
    return f._pasta || `${PASTA_TIPO[f.tipo] || 'elenco'}/${f.id}`;
}

function referenciasCandidatas(s, ids) {
    const out = [];
    const add = (f, rel, papel, ordem) => {
        const caminho = caminhoSerie(rel, pastaFicha(f));
        if (caminho) out.push({ caminho, papel, ordem, entidade: f.id });
    };
    for (const id of ids.personagens) {
        const f = acharFicha(s, id, 'personagem');
        if (!f) continue;
        const { estado, refs, canonica } = refsDaFicha(s, f);
        const tag = estado ? ` — estado "${estado.id}"${estado.descricao ? ` (${estado.descricao})` : ''}` : '';
        if (refs.frente || canonica) add(f, refs.frente || canonica, `identidade de ${f.nome || id}: rosto, cabelo e idade${tag}`, 1);
        if (refs.corpo) add(f, refs.corpo, `figurino e corpo inteiro de ${f.nome || id}${tag}`, 3);
        if (refs.perfil) add(f, refs.perfil, `perfil de ${f.nome || id}`, 6);
        for (const [k, v] of Object.entries(refs)) if (!['frente', 'corpo', 'perfil'].includes(k)) add(f, v, `${k} de ${f.nome || id}`, 7);
    }
    for (const id of ids.locais) {
        const f = acharFicha(s, id, 'local');
        if (!f) continue;
        const { refs, canonica } = refsDaFicha(s, f);
        const principal = canonica || Object.values(refs)[0];
        if (principal) add(f, principal, `cenário: ${f.nome || id} (arquitetura, luz e cor)`, 2);
        for (const v of Object.values(refs)) if (v !== principal) add(f, v, `outro ângulo do cenário ${f.nome || id}`, 8);
    }
    for (const id of ids.objetos) {
        const f = acharFicha(s, id, 'objeto');
        if (!f) continue;
        const { refs, canonica } = refsDaFicha(s, f);
        const principal = canonica || Object.values(refs)[0];
        if (principal) add(f, principal, `objeto: ${f.nome || id}`, 5);
    }
    return out;
}

async function carregarImagens(s, candidatos, { max, dataUrl, cortes, avisos }) {
    const ordenadas = [...candidatos].sort((a, b) => a.ordem - b.ordem);
    const vistas = new Set();
    const escolhidas = [];
    for (const c of ordenadas) {
        if (vistas.has(c.caminho)) continue;
        vistas.add(c.caminho);
        const abs = s.pasta ? path.resolve(s.pasta, ...c.caminho.split('/')) : null;
        if (abs && !abs.startsWith(path.resolve(s.pasta) + path.sep)) {
            cortes.push({ secao: 'imagens', item: c.caminho, papel: c.papel, motivo: 'fora_da_pasta_da_serie' });
            continue;
        }
        const existe = Boolean(abs && fs.existsSync(abs));
        if (!existe && dataUrl) {
            cortes.push({ secao: 'imagens', item: c.caminho, papel: c.papel, motivo: 'arquivo_ausente' });
            continue;
        }
        if (escolhidas.length >= max) {
            cortes.push({ secao: 'imagens', item: c.caminho, papel: c.papel, motivo: 'limite_imagens' });
            continue;
        }
        let url = `arquivo:${c.caminho}`;
        let bytes = 0;
        if (existe) {
            const buf = await fs.promises.readFile(abs);
            bytes = buf.length;
            if (dataUrl) url = `data:${MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream'};base64,${buf.toString('base64')}`;
            if (bytes > 4 * 1024 * 1024) avisos.push(`Imagem grande (${(bytes / 1048576).toFixed(1).replace('.', ',')} MB): ${c.caminho} — reduza para economizar.`);
        } else {
            avisos.push(`Referência ainda não existe: ${c.caminho} (${c.papel}).`);
        }
        escolhidas.push({ caminho: c.caminho, papel: c.papel, existe, bytes, url });
    }
    return escolhidas;
}

function montarMensagens(sistema, texto, imagens) {
    if (!imagens.length) return [{ role: 'system', content: sistema }, { role: 'user', content: texto }];
    const partes = [{ type: 'text', text: `${texto}\n\nAs imagens de referência vêm a seguir, numeradas, cada uma com o seu papel.` }];
    imagens.forEach((im, i) => {
        partes.push({ type: 'text', text: `Imagem ${i + 1} — ${im.papel}` });
        partes.push({ type: 'image_url', image_url: { url: im.url } });
    });
    return [{ role: 'system', content: sistema }, { role: 'user', content: partes }];
}

// ---------------------------------------------------------------- dados do episódio/plano
function roteiroDe(s, ep, op) {
    return op.roteiro || s.episodios?.[ep]?.roteiro || null;
}

function planosDe(s, ep, op) {
    const p = op.planos || s.episodios?.[ep]?.planos || null;
    return p ? lista(p.planos || p) : [];
}

function entidadesDoRoteiro(s, roteiro) {
    const pers = new Set();
    const locais = new Set();
    const objetos = new Set();
    for (const p of lista(roteiro?.planos)) {
        lista(p.elenco).forEach((id) => pers.add(id));
        if (p.pov) pers.add(p.pov);
        if (p.local) locais.add(p.local);
        lista(p.objetos).forEach((id) => objetos.add(id));
        lista(p.falas).forEach((f) => { if (f.quem && acharFicha(s, f.quem, 'personagem')) pers.add(f.quem); });
    }
    return { personagens: pers, locais, objetos, todos: new Set([...pers, ...locais, ...objetos]) };
}

function entidadesDoPlano(s, rp, dp) {
    const pers = new Set(lista(rp?.elenco));
    const locais = new Set(rp?.local ? [rp.local] : []);
    const objetos = new Set(lista(rp?.objetos));
    for (const id of lista(dp?.ancoras)) {
        if (acharFicha(s, id, 'personagem')) pers.add(id);
        else if (acharFicha(s, id, 'local')) locais.add(id);
        else if (acharFicha(s, id, 'objeto')) objetos.add(id);
    }
    return { personagens: [...pers], locais: [...locais], objetos: [...objetos], todos: new Set([...pers, ...locais, ...objetos]) };
}

function acharPlano(s, ep, op) {
    const n = Number(op.plano);
    if (!Number.isFinite(n)) throw new Error('Informe opcoes.plano (número do plano).');
    const roteiro = roteiroDe(s, ep, op);
    const rp = lista(roteiro?.planos).find((p) => Number(p.n) === n) || null;
    const dp = planosDe(s, ep, op).find((p) => Number(p.n) === n) || null;
    if (!rp && !dp) throw new Error(`Plano ${n} não encontrado no roteiro nem na decupagem do Ep. ${ep}.`);
    return { n, roteiro, rp, dp };
}

function quadroAprovado(q) {
    return q && q.aprovado === true && q.caminho ? q : null;
}

// ---------------------------------------------------------------- montadores por finalidade
const MONTADORES = {
    roteiro(s, ep, op, ctx) {
        const estado = est.estadoOuInicial(s);
        const vig = fatosVigentes(s.memoria.fatos, ep);
        const temp = lista(s.biblia.temporada);
        const total = temp.length || 10;
        const alvo = temp.find((t) => Number(t.n) === ep);
        const sj = s.serie || {};
        return {
            cabecalho: `MEMÓRIA DA SÉRIE — para escrever o roteiro do Ep. ${ep}.`,
            secoes: [
                secao('serie', 'SÉRIE E EPISÓDIO', 1, [
                    `- ${sj.titulo || '(série sem título)'} · ${sj.genero || 'gênero não definido'} · pt-BR · ${sj.duracaoAlvoS || 60} s · 9:16`,
                    `- Agora: Ep. ${ep} de ${total}${alvo ? ` — "${alvo.titulo || ''}" (${alvo.fase || 'fase não definida'})${alvo.resumo ? `: ${alvo.resumo}` : ''}` : ''}`,
                    ep >= total ? '- Último episódio: sem A/B; resolve a temporada.' : null,
                ], { fixa: true }),
                secao('regras', 'PREMISSA E REGRAS DO MUNDO (não quebrar)', 1, regrasItens(s, vig)),
                secao('escolhas', 'ESCOLHAS DO PÚBLICO (resultado real) E CONSEQUÊNCIAS', 1, escolhasItens(s, estado, ep)),
                secao('estado', `ESTADO DO MUNDO NO INÍCIO DO EP. ${ep}`, 1, estadoItens(s, estado, null)),
                secao('resumos', 'EPISÓDIOS ANTERIORES (resumo canônico)', 2, resumosItens(s, ep)),
                secao('personagens', 'PERSONAGENS', 2, personagensItens(s, estado, null)),
                secao('misterios', 'MISTÉRIOS ABERTOS E SEGREDOS', 2, misteriosItens(s, estado, vig)),
                secao('fatos', 'OUTROS FATOS CANÔNICOS', 3, fatosItens(s, vig, { excluirTipos: ['regra', 'misterio', 'segredo'] })),
                secao('temporada', 'MAPA DA TEMPORADA (próximos episódios)', 3, temporadaItens(s, ep)),
                secao('glossario', 'GLOSSÁRIO (grafia e pronúncia)', 3, glossarioItens(s)),
                secao('ids', 'LOCAIS E OBJETOS (use estes ids)', 4, idsItens(s, estado)),
            ],
            sistema: SISTEMA.roteiro,
        };
    },

    decupagem(s, ep, op, ctx) {
        const roteiro = roteiroDe(s, ep, op);
        if (!roteiro) throw new Error(`Sem roteiro do Ep. ${ep} para decupar.`);
        if (roteiro.aprovado !== true && !roteiro.aprovado) ctx.avisos.push('O roteiro ainda não está aprovado: a decupagem deve partir do roteiro aprovado.');
        const estado = est.estadoOuInicial(s);
        const ids = entidadesDoRoteiro(s, roteiro);
        const vig = fatosVigentes(s.memoria.fatos, ep);
        const refs = [];
        for (const id of ids.todos) {
            const f = acharFicha(s, id);
            if (!f) continue;
            const { estado: e, refs: r, canonica } = refsDaFicha(s, f);
            const lista2 = Object.entries(r).map(([k, v]) => `${k}=${caminhoSerie(v, pastaFicha(f))}`);
            if (canonica && !Object.values(r).includes(canonica)) lista2.push(`canonica=${caminhoSerie(canonica, pastaFicha(f))}`);
            refs.push(item(`- ${id}${e ? ` (estado ${e.id})` : ''}: ${lista2.join(', ') || 'sem imagem de referência ainda'}`, 3, 1, `refs ${id}`));
        }
        return {
            cabecalho: `MEMÓRIA PARA A DECUPAGEM — Ep. ${ep}.`,
            secoes: [
                secao('roteiro', 'ROTEIRO APROVADO', 1, roteiroItens(roteiro), { fixa: true }),
                secao('ancoras', 'ÂNCORAS VISUAIS (aparência fixa; repetir em todo prompt)', 1, [...ids.todos].map((id) => ancoraItem(s, id, estado, 1))),
                secao('estado', 'ESTADO AGORA (quem e o que aparece)', 2, estadoItens(s, estado, ids.todos)),
                secao('referencias', 'IMAGENS DE REFERÊNCIA DISPONÍVEIS', 3, refs),
                secao('regras', 'REGRAS DO MUNDO', 3, regrasItens(s, vig).map((i) => ({ ...i, prioridade: Math.max(3, i.prioridade), fixo: false }))),
                secao('fatos', 'FATOS SOBRE QUEM/ONDE APARECE', 3, fatosItens(s, vig, { excluirTipos: ['regra'], ids: ids.todos, cortes: ctx.cortes, prioMin: 3 })),
                secao('glossario', 'GLOSSÁRIO', 4, glossarioItens(s, 4)),
            ],
            sistema: SISTEMA.decupagem,
        };
    },

    quadroChave(s, ep, op, ctx) {
        const { n, rp, dp } = acharPlano(s, ep, op);
        const estado = est.estadoOuInicial(s);
        const ids = entidadesDoPlano(s, rp, dp);
        const vig = fatosVigentes(s.memoria.fatos, ep);
        if (dp?.quadroChave?.origem === 'ultimo_quadro') ctx.avisos.push(`O plano ${n} usa o último quadro do plano anterior: não precisa gerar quadro-chave.`);
        const planoItens = [
            `- Plano ${n} · ${rp?.tipo || dp?.tipo || '?'} · ${dp?.duracaoS ?? duracaoPlano(rp || {})} s · local: ${rp?.local || '—'}${rp?.pov ? ` · POV de ${rp.pov} (quem olha não aparece)` : ''}`,
            dp?.prompt ? `- Prompt do plano (inglês): ${dp.prompt}` : null,
            rp?.visual ? `- O que acontece (pt-BR): ${rp.visual}` : null,
        ];
        const falas = lista(rp?.falas).filter((f) => f.via && f.via !== 'em_cena');
        if (falas.length) planoItens.push(`- Falas fora de quadro (${falas.map((f) => `${f.quem} por ${f.via}`).join(', ')}): ninguém com a boca aberta falando.`);
        const continuidade = [];
        for (const dep of lista(dp?.dependeDe)) {
            const anterior = planosDe(s, ep, op).find((p) => Number(p.n) === Number(dep));
            if (quadroAprovado(anterior?.quadroChave)) {
                continuidade.push(item(`- Continua o visual do plano ${dep} (quadro aprovado anexado): mesma luz, roupa e posição dos objetos.`, 2, 5, `continuidade p${dep}`));
                ctx.candidatas.push({ caminho: caminhoSerie(anterior.quadroChave.caminho, `episodios/${epTag(ep)}`), papel: `continuidade: quadro-chave aprovado do plano ${dep}`, ordem: 4 });
            } else continuidade.push(item(`- Depende do plano ${dep}, que ainda não tem quadro aprovado.`, 3, 1, `continuidade p${dep}`));
        }
        ctx.candidatas.push(...referenciasCandidatas(s, ids));
        return {
            cabecalho: `QUADRO-CHAVE — ${s.serie?.titulo || 'série'} · Ep. ${ep} · Plano ${n}. Gere UMA imagem vertical 9:16 (1080×1920) que será o PRIMEIRO QUADRO do vídeo deste plano.`,
            secoes: [
                secao('plano', 'PLANO', 1, planoItens, { fixa: true }),
                secao('ancoras', 'QUEM E ONDE (âncoras fixas: não mude a aparência)', 1, [...ids.todos].map((id) => ancoraItem(s, id, estado, 1))),
                secao('estado', 'ESTADO AGORA', 2, estadoItens(s, estado, ids.todos)),
                secao('continuidade', 'CONTINUIDADE', 2, continuidade),
                secao('fatos', 'FATOS ÚTEIS', 4, fatosItens(s, vig, { excluirTipos: ['regra', 'misterio'], ids: ids.todos, cortes: ctx.cortes, prioMin: 4 })),
            ],
            sistema: SISTEMA.quadroChave,
        };
    },

    video(s, ep, op, ctx) {
        const { n, rp, dp } = acharPlano(s, ep, op);
        const estado = est.estadoOuInicial(s);
        const ids = entidadesDoPlano(s, rp, dp);
        if (!dp?.prompt) ctx.avisos.push(`O plano ${n} não tem prompt de decupagem: usando o visual do roteiro.`);
        const movimento = dp?.prompt || rp?.visual || '';
        const qc = quadroAprovado(dp?.quadroChave);
        const qf = quadroAprovado(dp?.quadroFinal);
        const refs = referenciasCandidatas(s, ids);
        if (qc) {
            ctx.candidatas.push({ caminho: caminhoSerie(qc.caminho, `episodios/${epTag(ep)}`), papel: 'primeiro_quadro', ordem: 1 });
            if (qf) ctx.candidatas.push({ caminho: caminhoSerie(qf.caminho, `episodios/${epTag(ep)}`), papel: 'ultimo_quadro', ordem: 2 });
            for (const r of refs) ctx.cortes.push({ secao: 'imagens', item: r.caminho, papel: r.papel, motivo: 'primeiro_quadro_vence' });
        } else {
            ctx.avisos.push(`O plano ${n} não tem quadro-chave aprovado: aprove o quadro antes do vídeo (nunca texto→vídeo puro para personagem que se repete). Indo só com referências.`);
            for (const r of refs) ctx.candidatas.push({ ...r, papel: `referência — ${r.papel}` });
        }
        const duracao = dp?.duracaoS ?? duracaoPlano(rp || {});
        ctx.pedidoBase = {
            modelo: dp?.modelo || s.serie?.modelos?.videoFinal || null, duracaoS: duracao,
            resolucao: dp?.resolucao || '720p', audio: Boolean(dp?.audio), proporcao: '9:16',
        };
        // âncora que o prompt da decupagem já traz não se repete (economiza o limite do prompt de vídeo)
        const mov = normalizar(movimento);
        const ancoras = [];
        for (const id of ids.todos) {
            const f = acharFicha(s, id);
            const a = normalizar(f?.ancoraEn || f?.ancora || '').slice(0, 40);
            if (a && mov.includes(a)) continue;
            ancoras.push(ancoraItem(s, id, estado, ids.personagens.includes(id) ? 1 : 2, true));
        }
        const estiloJa = /no blood/i.test(movimento) && /9:16/.test(movimento);
        return {
            cabecalho: '',
            comTitulos: false,
            secoes: [
                secao('movimento', 'MOVIMENTO', 1, [movimento.trim()], { fixa: true }),
                secao('ancoras', 'ÂNCORAS', 1, ancoras),
                secao('estilo', 'ESTILO', 3, estiloJa ? [] : [`Vertical 9:16, ${duracao} s. No on-screen text, no subtitles, no blood or gore (suggested horror).`]),
            ],
            sistema: SISTEMA.video,
        };
    },

    verificacao(s, ep, op, ctx) {
        const roteiro = roteiroDe(s, ep, op);
        if (!roteiro) throw new Error(`Sem roteiro do Ep. ${ep} para verificar.`);
        const estado = est.estadoOuInicial(s);
        const vig = fatosVigentes(s.memoria.fatos, ep);
        const ids = entidadesDoRoteiro(s, roteiro);
        const estadoPresentes = estadoItens(s, estado, ids.todos).map((i) => ({ ...i, prioridade: 1 }));
        const outros = new Set([...Object.keys(estado.personagens || {}), ...Object.keys(estado.objetos || {})].filter((id) => !ids.todos.has(id)));
        return {
            cabecalho: `VERIFICAÇÃO DE CONTINUIDADE — Ep. ${ep}. Compare o roteiro abaixo com a memória.`,
            secoes: [
                secao('roteiro', 'ROTEIRO A VERIFICAR', 1, roteiroItens(roteiro), { fixa: true }),
                secao('regras', 'REGRAS DO MUNDO', 1, regrasItens(s, vig)),
                secao('escolhas', 'ESCOLHAS DO PÚBLICO E CONSEQUÊNCIAS', 1, escolhasItens(s, estado, ep)),
                secao('estado', `ESTADO NO INÍCIO DO EP. ${ep} (quem e o que aparece)`, 1, estadoPresentes),
                secao('estadoOutros', 'ESTADO DOS DEMAIS', 3, estadoItens(s, estado, outros)),
                secao('fatos', 'FATOS CANÔNICOS', 2, fatosItens(s, vig, { excluirTipos: ['regra'] })),
                secao('resumos', 'EPISÓDIOS ANTERIORES', 3, resumosItens(s, ep)),
                secao('glossario', 'GLOSSÁRIO', 3, glossarioItens(s)),
            ],
            sistema: SISTEMA.verificacao,
        };
    },

    consolidacao(s, ep, op, ctx) {
        const roteiro = roteiroDe(s, ep, op);
        if (!roteiro) throw new Error(`Sem roteiro do Ep. ${ep} para consolidar.`);
        const estado = est.estadoOuInicial(s);
        const vig = fatosVigentes(s.memoria.fatos, ep);
        const v = op.votacao !== undefined ? op.votacao : s.episodios?.[ep]?.votacao;
        let votoTxt = '- Votação ainda NÃO registrada: não registre escolha nenhuma.';
        if (v && ['A', 'B'].includes(v.vencedora)) {
            const o = roteiro.escolhas?.[v.vencedora] || {};
            votoTxt = `- Votação real (${v.fonte || 'manual'}): venceu ${v.vencedora} — ${o.texto || ''} (A ${v.votos?.A ?? '?'} × B ${v.votos?.B ?? '?'}). Consequência prometida: ${o.consequencia || o.detalhe || '—'}`;
        } else if (v && v.vencedora === 'empate') votoTxt = '- Votação real: EMPATE (o Rafael decide o desempate; não escolha).';
        return {
            cabecalho: `CONSOLIDAÇÃO DA MEMÓRIA — Ep. ${ep}.`,
            secoes: [
                secao('roteiro', 'ROTEIRO APROVADO', 1, roteiroItens(roteiro), { fixa: true }),
                secao('votacao', 'VOTAÇÃO', 1, [votoTxt], { fixa: true }),
                secao('estado', `ESTADO NO INÍCIO DO EP. ${ep}`, 1, estadoItens(s, estado, null)),
                secao('fatos', 'FATOS VIGENTES (diga quais deixaram de valer)', 2, fatosItens(s, vig, {})),
                secao('glossario', 'GLOSSÁRIO ATUAL', 3, glossarioItens(s)),
                secao('ids', 'LOCAIS E OBJETOS (ids)', 4, idsItens(s, estado)),
            ],
            sistema: SISTEMA.consolidacao,
        };
    },
};

// Junta os cortes por seção + motivo: [{ secao, motivo, quantidade, caracteres?, itens: [...] }].
function agruparCortes(cortes) {
    const grupos = new Map();
    for (const c of cortes) {
        const k = `${c.secao}|${c.motivo}`;
        const g = grupos.get(k) || { secao: c.secao, motivo: c.motivo, quantidade: 0, itens: [] };
        g.quantidade += c.quantidade || 1;
        if (c.caracteres) g.caracteres = (g.caracteres || 0) + c.caracteres;
        g.itens.push(c.papel ? `${c.item} (${c.papel})` : c.item);
        grupos.set(k, g);
    }
    return [...grupos.values()];
}

function epPadrao(s, finalidade, op) {
    if (op.ep != null) return epNum(op.ep);
    if (op.roteiro?.n != null) return epNum(op.roteiro.n);
    if (finalidade === 'roteiro') return (epNum(s.memoria.estado?.atualizadoAte) ?? 0) + 1;
    throw new Error(`Informe opcoes.ep para a finalidade "${finalidade}".`);
}

/**
 * Monta o pacote de contexto para o OpenRouter.
 * @param serie caminho da pasta, série carregada (carregarSerie) ou só a memória
 * @param finalidade roteiro | decupagem | quadroChave | video | verificacao | consolidacao
 * @param opcoes { ep, plano, limiteCaracteres, maxImagens, dataUrl (padrão true), roteiro, planos, votacao }
 * @returns { finalidade, ep, plano, mensagens, imagens:[{caminho,papel,existe,bytes}], tamanho, cortes, avisos, secoes, pedido? }
 */
async function montarContexto(serie, finalidade, opcoes = {}) {
    if (!FINALIDADES.includes(finalidade)) throw new Error(`Finalidade desconhecida: ${finalidade}. Use: ${FINALIDADES.join(', ')}.`);
    const s = obterSerie(serie);
    const ep = epPadrao(s, finalidade, opcoes);
    const limite = Number(opcoes.limiteCaracteres) > 0 ? Number(opcoes.limiteCaracteres) : LIMITE_PADRAO[finalidade];
    const maxImagens = opcoes.maxImagens != null ? Math.max(0, Number(opcoes.maxImagens)) : (IMAGENS_PADRAO[finalidade] || 0);
    const dataUrl = opcoes.dataUrl !== false;
    const ctx = { cortes: [], avisos: [], candidatas: [], pedidoBase: null };
    if (s.memoria.errosFatos?.length) ctx.avisos.push(`fatos.jsonl tem ${s.memoria.errosFatos.length} linha(s) inválida(s), ignoradas: ${s.memoria.errosFatos.join('; ')}`);

    const m = MONTADORES[finalidade](s, ep, opcoes, ctx);
    const comTitulos = m.comTitulos !== false;
    const corte = cortarPorTamanho(m.cabecalho, m.secoes, limite, comTitulos);
    if (corte.excedeu) ctx.avisos.push(`Mesmo só com o essencial, o pacote tem ${corte.texto.length} caracteres (limite ${limite}).`);
    const cortes = [...ctx.cortes, ...corte.cortes];
    const imagens = await carregarImagens(s, ctx.candidatas, { max: maxImagens, dataUrl, cortes, avisos: ctx.avisos });
    const mensagens = montarMensagens(m.sistema, corte.texto, imagens);
    const resultado = {
        finalidade, ep, plano: opcoes.plano != null ? Number(opcoes.plano) : null,
        mensagens,
        imagens: imagens.map(({ caminho, papel, existe, bytes }) => ({ caminho, papel, existe, bytes })),
        tamanho: {
            caracteres: corte.texto.length, limite, sistema: m.sistema.length,
            imagens: imagens.length, maxImagens, bytesImagens: imagens.reduce((a, i) => a + i.bytes, 0),
        },
        cortes: agruparCortes(cortes), avisos: ctx.avisos, secoes: corte.secoes,
    };
    if (finalidade === 'video') {
        resultado.pedido = {
            ...ctx.pedidoBase,
            prompt: corte.texto,
            anexos: imagens.map((i) => ({ tipo: 'imagem', arquivo: i.caminho, papel: i.papel === 'primeiro_quadro' || i.papel === 'ultimo_quadro' ? i.papel : 'referencia' })),
        };
    }
    return resultado;
}

module.exports = { montarContexto, FINALIDADES, LIMITE_PADRAO, IMAGENS_PADRAO, SISTEMA, cortarPorTamanho, linhaPlano, roteiroItens };
