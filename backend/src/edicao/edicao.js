// EDIÇÃO do episódio (fonte da verdade da Mesa): episodios/epNN/edicao.json.
//
// Fluxo "narração primeiro" (docs/INTERFACE.md): as falas (falas.json, tempos reais do TTS) definem a duração de
// cada plano; o vídeo de cada plano cobre o tempo das suas falas, preenchido com o clipe do acervo mais adequado
// (origem "acervo") até existir um take gerado.
//
// Formato (INTERFACE.md, com os campos que a Mesa precisa):
// { versao, serie, ep, titulo, duracaoS, fps, largura, altura, revisao, criadoEm, atualizadoEm,
//   planos: [ { n, deS, ateS, tipo, local, elenco, objetos, visual, tela, prompt, modelo, quadroChave } ],
//   faixas: { video:   [ { id, plano, arquivo, inicioS, duracaoS, entradaS, duracaoArquivoS, origem, mudo, volume, take? } ],
//             narracao:[ { id, fala, plano, quem, via, voz, intencao, tom, velocidade, volume, texto, textoFalado,
//                          arquivo, inicioS, duracaoS, entradaS, duracaoArquivoS, palavras, status } ],
//             falas:   [ ...igual à narração, para os personagens ],
//             efeitos: [], ambiente: [ { id, tipo: "sintetico"|"arquivo", arquivo, inicioS, duracaoS, volume } ],
//             texto:   [ { id, plano, texto, inicioS, duracaoS } ], ab: [ { id, inicioS, duracaoS, A, B } ] },
//   legenda: [ { id, item, quem, cor, linhas, ini, fim, manual? } ] }
// Caminhos de mídia relativos à PASTA DA SÉRIE (como falas.json e /Midia).
// Regerações e takes ficam em mesa.json (fora do desfazer: um take pago nunca some num Ctrl+Z).
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const U = require('./util');
const legendasMod = require('../audio/legendas');

const VERSAO = 1;
const MIN_PLANO_S = 2;
const MAX_HISTORICO = 120;
const FAIXAS = ['video', 'narracao', 'falas', 'efeitos', 'ambiente', 'texto', 'ab'];
const FAIXAS_AUDIO = ['narracao', 'falas', 'efeitos'];
const EPS = 1e-6;

// ---------------------------------------------------------------- falas
// Fala sem áudio ainda (falas.json não existe): duração estimada a 2,5 palavras/s + pausas entre frases.
function estimarFala(f) {
    const palavras = String(f.textoExibido || f.texto || '').split(/\s+/).filter(Boolean);
    const pausasFrases = (f.frases || []).reduce((s, fr) => s + (Number(fr.pausaDepoisS) || 0), 0);
    const duracaoS = U.arred(Math.max(0.8, palavras.length / 2.5 + pausasFrases));
    const passo = duracaoS / Math.max(1, palavras.length);
    return {
        ...f,
        duracaoS,
        palavras: palavras.map((p, i) => ({ p: p.toLowerCase(), t: U.arred(0.05 + i * passo) })),
        palavrasEstimadas: true,
        arquivo: null,
        status: 'sem_audio',
    };
}

const pausaDe = (f) => ({
    antesS: Number(f.pausa && f.pausa.antesS) || 0.3,
    depoisS: Number(f.pausa && f.pausa.depoisS) || 0.3,
});

// Tempo que as falas de um plano ocupam (pausa antes da 1ª, falas, intervalos, pausa depois da última).
function coberturaDoPlano(falas) {
    if (!falas.length) return 0;
    let t = pausaDe(falas[0]).antesS;
    falas.forEach((f, i) => {
        t += Number(f.duracaoS) || 0;
        if (i < falas.length - 1) t += pausaDe(f).depoisS + pausaDe(falas[i + 1]).antesS;
    });
    return t + pausaDe(falas.at(-1)).depoisS;
}

/**
 * Duração de cada plano: nunca corta fala (mínimo = cobertura das falas, ≥ 2 s); quando sobra tempo, mantém o
 * ritmo do roteiro (deS/ateS) e encolhe só as folgas para o total ficar no alvo (60 s).
 */
function duracoesDosPlanos(planosRoteiro, falasPorPlano, alvoS = 60) {
    const audio = planosRoteiro.map((p) => Math.max(MIN_PLANO_S, coberturaDoPlano(falasPorPlano.get(p.n) || [])));
    const roteiro = planosRoteiro.map((p) => {
        const d = Number(p.ateS) - Number(p.deS);
        return Number.isFinite(d) && d > 0 ? Math.max(MIN_PLANO_S, d) : MIN_PLANO_S;
    });
    let dur = audio.map((a, i) => Math.max(a, roteiro[i]));
    const excesso = dur.reduce((s, d) => s + d, 0) - alvoS;
    if (excesso > 0.01) {
        const folgas = dur.map((d, i) => d - audio[i]);
        const total = folgas.reduce((s, f) => s + f, 0);
        if (total > EPS) {
            const corte = Math.min(excesso, total);
            dur = dur.map((d, i) => d - (corte * folgas[i]) / total);
        }
    }
    return { duracoes: dur, audio, roteiro };
}

// ---------------------------------------------------------------- acervo
const PARADAS = new Set(['para', 'pela', 'pelo', 'como', 'mais', 'quando', 'sobre', 'entre', 'uma', 'umas', 'esta', 'este', 'essa', 'esse']);

function pontuarClipe(clipe, plano, usados) {
    let s = 0;
    const elenco = clipe.elenco || [];
    if (clipe.local && clipe.local === plano.local) s += 4;
    for (const e of plano.elenco || []) if (elenco.includes(e)) s += 2;
    if (plano.tipo === 'apresentador' && elenco.includes('narrador')) s += 3;
    if (plano.tipo !== 'apresentador' && elenco.includes('narrador')) s -= 3;
    if (!(plano.elenco || []).length && elenco.length && plano.tipo !== 'apresentador') s -= 1;
    const visual = new Set(U.palavrasDe(`${plano.visual || ''} ${(plano.objetos || []).join(' ')}`).filter((p) => !PARADAS.has(p)));
    for (const p of new Set(U.palavrasDe(clipe.descricao))) if (visual.has(p)) s += 0.75;
    s -= (usados.get(clipe.arquivo) || 0) * 1.5;
    return s;
}

/**
 * Preenche o plano [inicioS, inicioS+duracaoS] com clipes do acervo (o melhor primeiro; se o plano for maior
 * que o clipe, entra o próximo melhor). Devolve os segmentos (origem "acervo").
 */
function escolherClipes(plano, inicioS, duracaoS, clipes, usados, fps = U.FPS_PADRAO) {
    const segs = [];
    if (!clipes.length) return segs;
    let t = 0;
    const noPlano = new Set();
    while (duracaoS - t > 0.05 && segs.length < 6) {
        const ordem = clipes
            .map((c) => ({ c, s: pontuarClipe(c, plano, usados) - (noPlano.has(c.arquivo) ? 5 : 0) }))
            .sort((a, b) => b.s - a.s || String(a.c.arquivo).localeCompare(String(b.c.arquivo)));
        const { c } = ordem[0];
        const total = Number(c.duracaoS) || 8;
        // reaproveitado: começa de onde o uso anterior parou (se couber), para não repetir o mesmo trecho
        const jaUsado = usados.get(`${c.arquivo}#fim`) || 0;
        const resta = duracaoS - t;
        const entrada = jaUsado && total - jaUsado >= Math.min(resta, total) ? jaUsado : 0;
        const d = U.noQuadro(Math.min(resta, total - entrada), fps);
        if (d <= 0.04) break;
        segs.push({
            plano: plano.n,
            arquivo: c.arquivo,
            inicioS: U.arred(inicioS + t),
            duracaoS: U.arred(d),
            entradaS: U.arred(entrada),
            duracaoArquivoS: total,
            origem: 'acervo',
            mudo: /mudo/i.test(c.obs || '') || (c.elenco || []).includes('narrador'),
            volume: 0.6,
            descricao: c.descricao || '',
        });
        usados.set(c.arquivo, (usados.get(c.arquivo) || 0) + 1);
        usados.set(`${c.arquivo}#fim`, entrada + d);
        noPlano.add(c.arquivo);
        t += d;
    }
    return segs;
}

// ---------------------------------------------------------------- legenda
// Blocos de legenda (módulo de áudio) a partir dos itens de fala da linha do tempo. Fala aparada (entradaS > 0 ou
// mais curta que o arquivo): calcula com a fala inteira e corta os blocos fora do trecho visível.
function legendaDosItens(itens, opcoes = {}) {
    const blocos = [];
    for (const it of itens) {
        if (!it.texto || it.mudo) continue;
        const virtual = U.arred((Number(it.inicioS) || 0) - (Number(it.entradaS) || 0));
        const fala = {
            id: it.id, quem: it.quem, intencao: it.intencao, via: it.via, textoExibido: it.texto,
            palavras: it.palavras || [], duracaoS: Number(it.duracaoArquivoS) || Number(it.duracaoS) || 0, inicioS: virtual,
        };
        const ini = Number(it.inicioS) || 0;
        const fim = ini + (Number(it.duracaoS) || 0) + 0.35;
        for (const b of legendasMod.montarBlocos([fala], opcoes)) {
            if (b.fim <= ini + 0.05 || b.ini >= fim - 0.05) continue;
            blocos.push({ item: it.id, quem: it.quem, cor: b.cor, linhas: b.linhas, ini: U.arred(Math.max(b.ini, ini), 2), fim: U.arred(Math.min(b.fim, fim), 2) });
        }
    }
    blocos.sort((a, b) => a.ini - b.ini);
    // sem sobrepor (o próximo começa onde o anterior termina)
    for (let i = 0; i < blocos.length - 1; i++) if (blocos[i].fim > blocos[i + 1].ini) blocos[i].fim = Math.max(blocos[i].ini + 0.3, blocos[i + 1].ini);
    return blocos;
}

function numerarLegenda(blocos) {
    return blocos.map((b, i) => ({ ...b, id: `L${i + 1}` }));
}

function itensDeFala(doc) {
    return FAIXAS_AUDIO.flatMap((f) => (doc.faixas[f] || []).filter((i) => i.fala || i.texto));
}

// Recalcula a legenda das falas indicadas (ou de todas), mantendo a dos outros itens.
function recalcularLegenda(doc, idsItens = null) {
    const alvo = idsItens ? new Set(idsItens) : null;
    const itens = itensDeFala(doc).filter((i) => !alvo || alvo.has(i.id));
    const novos = legendaDosItens(itens);
    const mantidos = (doc.legenda || []).filter((b) => alvo && !alvo.has(b.item) && itensDeFala(doc).some((i) => i.id === b.item));
    doc.legenda = numerarLegenda([...mantidos, ...novos].sort((a, b) => a.ini - b.ini));
    return doc;
}

// ---------------------------------------------------------------- montagem inicial (função pura)
const RE_CARTOES = /cart(õ|o)es\s*a\s*\/\s*b/i;

/**
 * montarEdicao({ roteiro, falas, acervo, planosDoc, serie, fichas, agora }) → edicao.json
 * falas = lista no formato do falas.json (com duracaoS, palavras, pausa); falas sem áudio são estimadas.
 */
function montarEdicao({ roteiro, falas = [], acervo = { clipes: [] }, planosDoc = null, serie = {}, serieId = null, epId = null, agora = new Date(), fps = U.FPS_PADRAO, origemFalas = 'falas.json' }) {
    // planos.json (CONTRATOS) guarda caminhos relativos ao episódio; a edição usa relativos à série
    const doEpisodio = (rel) => (rel && epId && !String(rel).startsWith('episodios/') ? `episodios/${epId}/${rel}` : rel);
    if (!roteiro || !Array.isArray(roteiro.planos) || !roteiro.planos.length) throw U.erro('O roteiro não tem planos.');
    const planosRot = [...roteiro.planos].sort((a, b) => a.n - b.n);
    const prontas = falas
        .filter((f) => f.status === 'pronta' || f.status === 'sem_audio' || f.status === undefined)
        .map((f) => (Number(f.duracaoS) > 0 ? f : estimarFala(f)));
    const falasPorPlano = new Map();
    for (const f of [...prontas].sort((a, b) => (a.ordem || 0) - (b.ordem || 0))) {
        if (!falasPorPlano.has(f.plano)) falasPorPlano.set(f.plano, []);
        falasPorPlano.get(f.plano).push(f);
    }
    const alvo = Number(roteiro.duracaoAlvoS) || Number(serie.duracaoAlvoS) || 60;
    const { duracoes, audio } = duracoesDosPlanos(planosRot, falasPorPlano, alvo);

    // fronteiras no quadro
    const fronteiras = [0];
    let acc = 0;
    for (const d of duracoes) { acc += d; fronteiras.push(U.noQuadro(acc, fps)); }
    const total = U.arred(fronteiras.at(-1));

    const extras = new Map(((planosDoc && planosDoc.planos) || []).map((p) => [p.n, p]));
    const clipes = ((acervo && acervo.clipes) || []).filter((c) => c && c.arquivo && /\.(mp4|mov|webm)$/i.test(c.arquivo));
    const usados = new Map();
    const faixas = { video: [], narracao: [], falas: [], efeitos: [], ambiente: [], texto: [], ab: [] };
    const planos = [];
    const avisos = [];
    let contV = 0;
    let abInicio = null;

    planosRot.forEach((p, k) => {
        const deS = U.arred(fronteiras[k]);
        const ateS = U.arred(fronteiras[k + 1]);
        const dur = ateS - deS;
        const ex = extras.get(p.n) || {};
        const ancoras = [p.local, ...(p.elenco || []), ...(p.objetos || [])].filter(Boolean);
        planos.push({
            n: p.n, deS, ateS, tipo: p.tipo || 'video_ia', local: p.local || null, elenco: p.elenco || [], objetos: p.objetos || [],
            visual: p.visual || '', tela: p.tela || '',
            prompt: ex.prompt || p.visual || '',
            ancoras: ex.ancoras || ancoras,
            modelo: ex.modelo || (serie.modelos && serie.modelos.videoFinal) || null,
            resolucao: ex.resolucao || null,
            quadroChave: ex.quadroChave && ex.quadroChave.caminho ? { arquivo: doEpisodio(ex.quadroChave.caminho), origem: ex.quadroChave.origem || 'ref' } : null,
            duracaoAudioS: U.arred(audio[k]),
            duracaoRoteiroS: U.arred(Number(p.ateS) - Number(p.deS)),
        });

        // vídeo: take escolhido (planos.json) ou acervo
        const take = ex.takeEscolhido && (ex.takes || []).find((t) => t.id === ex.takeEscolhido && t.caminho);
        if (take) {
            faixas.video.push({ id: `v${++contV}`, plano: p.n, arquivo: doEpisodio(take.caminho), inicioS: deS, duracaoS: U.arred(dur), entradaS: 0, origem: 'take', take: take.id, mudo: true, volume: 0.6 });
        } else {
            const segs = escolherClipes(p, deS, dur, clipes, usados, fps);
            if (!segs.length) avisos.push(`Plano ${p.n}: nenhum clipe no acervo para preencher (fica preto até gerar um take).`);
            for (const s of segs) faixas.video.push({ id: `v${++contV}`, ...s });
        }

        // falas do plano, posicionadas pelos tempos reais
        let anterior = null;
        for (const f of falasPorPlano.get(p.n) || []) {
            const pa = pausaDe(f);
            const inicio = anterior ? anterior.fim + pausaDe(anterior.f).depoisS + pa.antesS : deS + pa.antesS;
            const item = {
                id: `f-${f.id}`, fala: f.id, plano: p.n, quem: f.quem, via: f.via || null, voz: f.voz || null,
                intencao: f.intencao || null, tom: f.tom || null, velocidade: f.velocidade || null, volume: f.volume ?? null,
                texto: f.textoExibido || f.texto || '', textoFalado: f.textoFalado || null, filtro: f.filtro ?? null,
                frases: (f.frases || []).map((fr) => ({ texto: fr.texto, pausaDepoisS: U.arred(Number(fr.pausaDepoisS) || 0) })),
                arquivo: f.arquivo || null, inicioS: U.arred(inicio), duracaoS: U.arred(f.duracaoS), entradaS: 0,
                duracaoArquivoS: U.arred(f.duracaoS), palavras: (f.palavras || []).map((w) => ({ p: w.p, t: U.arred(w.t) })),
                palavrasEstimadas: Boolean(f.palavrasEstimadas), status: f.status || 'pronta',
            };
            (f.quem === 'narrador' ? faixas.narracao : faixas.falas).push(item);
            anterior = { fim: inicio + Number(f.duracaoS), f };
            if (inicio + Number(f.duracaoS) > ateS + 0.05) avisos.push(`${f.id} passa do fim do plano ${p.n}.`);
        }

        // texto de tela (o marcador "CARTÕES A / B" vira a faixa A/B)
        const tela = String(p.tela || '').trim();
        if (RE_CARTOES.test(tela)) {
            if (abInicio === null) abInicio = deS;
        } else if (tela) {
            const ini = deS + Math.min(0.25, dur / 6);
            const d = Math.max(0.8, Math.min(4, ateS - 0.25 - ini));
            faixas.texto.push({ id: `t${p.n}`, plano: p.n, texto: tela, inicioS: U.arred(ini), duracaoS: U.arred(d) });
        }
    });

    // Cartões A/B só quando o episódio tem votação ("escolhas": null = sem votação: curto, teste ou último).
    const esc = roteiro.escolhas;
    if (esc && (esc.A || esc.B)) {
        if (abInicio === null) abInicio = planos.at(-1).deS;
        faixas.ab.push({
            id: 'ab', inicioS: U.arred(abInicio), duracaoS: U.arred(total - abInicio),
            A: { texto: (esc.A && esc.A.texto) || 'A', detalhe: (esc.A && esc.A.detalhe) || '' },
            B: { texto: (esc.B && esc.B.texto) || 'B', detalhe: (esc.B && esc.B.detalhe) || '' },
        });
    }
    faixas.ambiente.push({ id: 'amb1', tipo: 'sintetico', nome: 'Mar e vento (sintético)', arquivo: null, inicioS: 0, duracaoS: total, volume: 0.12 });

    const doc = {
        versao: VERSAO,
        serie: serieId || serie.id || null,
        ep: roteiro.n || null,
        titulo: roteiro.titulo || '',
        duracaoS: total,
        duracaoAlvoS: alvo,
        fps,
        largura: (serie.formato && serie.formato.largura) || 1080,
        altura: (serie.formato && serie.formato.altura) || 1920,
        revisao: 0,
        criadoEm: agora.toISOString(),
        atualizadoEm: agora.toISOString(),
        origem: { roteiro: 'roteiro.json', falas: origemFalas },
        planos,
        faixas,
        legenda: [],
        avisos,
    };
    recalcularLegenda(doc);
    return doc;
}

// ---------------------------------------------------------------- operações na linha do tempo (puras)
const fimDe = (i) => (Number(i.inicioS) || 0) + (Number(i.duracaoS) || 0);

// Limites de cada plano pelo que está na faixa de vídeo (com o roteiro como reserva).
function limitesPlanos(doc) {
    const lim = new Map();
    for (const p of doc.planos || []) lim.set(p.n, { n: p.n, deS: Number(p.deS), ateS: Number(p.ateS) });
    const porPlano = new Map();
    for (const v of doc.faixas.video || []) {
        if (v.plano === undefined || v.plano === null) continue;
        const l = porPlano.get(v.plano) || { n: v.plano, deS: Infinity, ateS: -Infinity };
        l.deS = Math.min(l.deS, v.inicioS);
        l.ateS = Math.max(l.ateS, fimDe(v));
        porPlano.set(v.plano, l);
    }
    for (const [n, l] of porPlano) lim.set(n, { n, deS: U.arred(l.deS), ateS: U.arred(l.ateS) });
    return [...lim.values()].sort((a, b) => a.deS - b.deS || a.n - b.n);
}

// Um trecho [deS, ateS] da linha do tempo vira um pedaço por plano (cruzando dois planos = dois pedidos).
function planosDoTrecho(doc, deS, ateS, minimoS = 0.25) {
    const partes = [];
    for (const l of limitesPlanos(doc)) {
        const de = Math.max(deS, l.deS);
        const ate = Math.min(ateS, l.ateS);
        if (ate - de >= minimoS - EPS) partes.push({ plano: l.n, deS: U.arred(de), ateS: U.arred(ate) });
    }
    return partes;
}

// Divide um item no tempo t (absoluto). Devolve [antes, depois] (ou [item] se t não cai dentro).
function dividirItem(item, t, novoIdDepois) {
    const ini = Number(item.inicioS);
    const fim = fimDe(item);
    if (!(t > ini + EPS && t < fim - EPS)) return [item];
    const a = { ...item, duracaoS: U.arred(t - ini) };
    const b = { ...item, id: novoIdDepois || `${item.id}b`, inicioS: U.arred(t), duracaoS: U.arred(fim - t) };
    if (item.entradaS !== undefined && item.entradaS !== null) b.entradaS = U.arred(Number(item.entradaS) + (t - ini));
    return [a, b];
}

// Tira o intervalo [deS, ateS] de uma faixa (dividindo os itens nas pontas). Os itens de dentro saem.
function recortarFaixa(itens, deS, ateS) {
    const saida = [];
    for (const it of itens) {
        if (fimDe(it) <= deS + EPS || Number(it.inicioS) >= ateS - EPS) { saida.push(it); continue; }
        let pedacos = [it];
        pedacos = pedacos.flatMap((x) => dividirItem(x, deS, `${it.id}a`));
        pedacos = pedacos.flatMap((x) => dividirItem(x, ateS, `${it.id}c`));
        for (const p of pedacos) {
            const meio = (Number(p.inicioS) + fimDe(p)) / 2;
            if (meio > deS && meio < ateS) continue;
            saida.push(p);
        }
    }
    return saida.sort((a, b) => a.inicioS - b.inicioS);
}

// Troca SÓ o pedaço [deS, ateS] da faixa de vídeo por um segmento novo (o resto do plano fica como estava).
function substituirTrechoVideo(doc, deS, ateS, segmento) {
    const video = recortarFaixa(doc.faixas.video || [], deS, ateS);
    video.push({ ...segmento, inicioS: U.arred(deS), duracaoS: U.arred(ateS - deS) });
    doc.faixas.video = video.sort((a, b) => a.inicioS - b.inicioS);
    garantirIdsUnicos(doc);
    return doc;
}

function garantirIdsUnicos(doc) {
    const vistos = new Set();
    for (const f of FAIXAS) {
        for (const it of doc.faixas[f] || []) {
            let id = it.id || `${f[0]}1`;
            while (vistos.has(id)) id = `${id}x`;
            it.id = id;
            vistos.add(id);
        }
    }
}

/**
 * Linha de vídeo sem sobreposição, em ordem, com buracos (null = preto) — o que a prévia e o render mostram.
 * Em sobreposição vence o segmento que começa depois (a Mesa grava em modo "sobrescrever").
 */
function linhaDeVideo(doc, duracaoS = doc.duracaoS) {
    const segs = [...(doc.faixas.video || [])].filter((s) => s.duracaoS > EPS)
        .map((s, i) => ({ s, i })).sort((a, b) => a.s.inicioS - b.s.inicioS || a.i - b.i).map((x) => x.s);
    // "pinta" em ordem: cada segmento sobrescreve o que estiver embaixo dele
    let pintado = [];
    for (const s of segs) {
        pintado = recortarFaixa(pintado, Number(s.inicioS), fimDe(s));
        pintado.push({ ...s, entradaS: Number(s.entradaS) || 0 });
        pintado.sort((a, b) => a.inicioS - b.inicioS);
    }
    const pedacos = [];
    let t = 0;
    for (const p of pintado) {
        const ini = Math.max(Number(p.inicioS), t);
        const fim = Math.min(fimDe(p), duracaoS);
        if (fim - ini <= 0.01) continue;
        if (ini - t > 0.01) pedacos.push({ arquivo: null, inicioS: U.arred(t), duracaoS: U.arred(ini - t), entradaS: 0 });
        pedacos.push({ ...p, inicioS: U.arred(ini), duracaoS: U.arred(fim - ini), entradaS: U.arred(p.entradaS + (ini - Number(p.inicioS))) });
        t = fim;
    }
    if (duracaoS - t > 0.01) pedacos.push({ arquivo: null, inicioS: U.arred(t), duracaoS: U.arred(duracaoS - t), entradaS: 0 });
    return pedacos;
}

// ---------------------------------------------------------------- validação e normalização
function validarEdicao(doc) {
    const erros = [];
    if (!doc || typeof doc !== 'object') return ['A edição precisa ser um objeto.'];
    if (!doc.faixas || typeof doc.faixas !== 'object') erros.push('Falta "faixas".');
    else {
        for (const f of FAIXAS) {
            const l = doc.faixas[f];
            if (l === undefined) continue;
            if (!Array.isArray(l)) { erros.push(`faixas.${f} precisa ser uma lista.`); continue; }
            l.forEach((it, i) => {
                if (!it || typeof it !== 'object') return erros.push(`faixas.${f}[${i}] inválido.`);
                if (!Number.isFinite(Number(it.inicioS)) || Number(it.inicioS) < -EPS) erros.push(`faixas.${f}[${i}].inicioS inválido.`);
                if (!Number.isFinite(Number(it.duracaoS)) || Number(it.duracaoS) <= 0) erros.push(`faixas.${f}[${i}].duracaoS inválido.`);
                if (it.arquivo && (path.isAbsolute(String(it.arquivo)) || String(it.arquivo).split(/[\\/]/).includes('..'))) {
                    erros.push(`faixas.${f}[${i}].arquivo precisa ser relativo à série.`);
                }
            });
        }
    }
    if (doc.legenda !== undefined && !Array.isArray(doc.legenda)) erros.push('"legenda" precisa ser uma lista.');
    return erros;
}

function normalizarEdicao(doc) {
    const d = JSON.parse(JSON.stringify(doc));
    d.versao = VERSAO;
    d.fps = Number(d.fps) || U.FPS_PADRAO;
    for (const f of FAIXAS) {
        d.faixas[f] = (d.faixas[f] || []).map((it) => ({
            ...it,
            inicioS: U.arred(Math.max(0, Number(it.inicioS))),
            duracaoS: U.arred(Number(it.duracaoS)),
            ...(it.entradaS !== undefined && it.entradaS !== null ? { entradaS: U.arred(Math.max(0, Number(it.entradaS))) } : {}),
        })).sort((a, b) => a.inicioS - b.inicioS);
    }
    garantirIdsUnicos(d);
    d.legenda = (d.legenda || []).filter((b) => b && b.fim > b.ini).sort((a, b) => a.ini - b.ini);
    // limites dos planos acompanham o vídeo
    const lim = new Map(limitesPlanos(d).map((l) => [l.n, l]));
    d.planos = (d.planos || []).map((p) => (lim.has(p.n) ? { ...p, deS: lim.get(p.n).deS, ateS: lim.get(p.n).ateS } : p));
    const fimConteudo = Math.max(0, ...['video', 'narracao', 'falas', 'efeitos', 'texto', 'ab'].flatMap((f) => d.faixas[f].map(fimDe)));
    d.duracaoS = U.arred(fimConteudo || Number(d.duracaoS) || 0);
    return d;
}

// ---------------------------------------------------------------- persistência + desfazer/refazer no servidor
async function lerEstadoHistorico(c) {
    return (await U.lerJson(c.estadoHistorico, null)) || { versao: 1, pilha: [], pos: -1, proximo: 1 };
}

const resumoHistorico = (e) => ({ podeDesfazer: e.pos > 0, podeRefazer: e.pos < e.pilha.length - 1, versoes: e.pilha.length, posicao: e.pos });

async function registrarVersao(c, doc) {
    const e = await lerEstadoHistorico(c);
    await fsp.mkdir(c.historico, { recursive: true });
    const descartadas = e.pilha.slice(e.pos + 1);
    e.pilha = e.pilha.slice(0, e.pos + 1);
    const nome = `${String(e.proximo).padStart(6, '0')}.json`;
    e.proximo += 1;
    await fsp.writeFile(path.join(c.historico, nome), JSON.stringify(doc), 'utf8');
    e.pilha.push(nome);
    while (e.pilha.length > MAX_HISTORICO) descartadas.push(e.pilha.shift());
    e.pos = e.pilha.length - 1;
    for (const n of descartadas) await fsp.rm(path.join(c.historico, n), { force: true });
    await U.gravarJson(c.estadoHistorico, e);
    return e;
}

async function lerEdicao(serie, ep) {
    const c = U.caminhos(serie, ep);
    return U.lerJson(c.edicao, null);
}

async function historico(serie, ep) {
    return resumoHistorico(await lerEstadoHistorico(U.caminhos(serie, ep)));
}

/**
 * salvarEdicao(serie, ep, doc, { revisaoBase }) — grava com backup (.bak da série) e uma versão no histórico.
 * revisaoBase diferente da revisão gravada = alguém mudou antes (ex.: uma regeração terminou): 409 com a atual.
 */
async function salvarEdicao(serie, ep, doc, { revisaoBase, registrar = true } = {}) {
    const c = U.caminhos(serie, ep);
    const erros = validarEdicao(doc);
    if (erros.length) throw U.erro(`edicao.json inválido: ${erros.slice(0, 5).join(' ')}`, 400, { erros });
    return U.comTrava(c.edicao, async () => {
        const atual = await U.lerJson(c.edicao, null);
        if (revisaoBase !== undefined && revisaoBase !== null && atual && Number(atual.revisao) !== Number(revisaoBase)) {
            throw U.erro('A edição mudou no servidor (outra aba ou uma regeração terminou). Recarreguei a versão atual.', 409, { atual });
        }
        const novo = normalizarEdicao(doc);
        novo.revisao = (atual ? Number(atual.revisao) || 0 : 0) + 1;
        novo.atualizadoEm = new Date().toISOString();
        if (registrar) {
            const e = await lerEstadoHistorico(c);
            if (!e.pilha.length && atual) await registrarVersao(c, atual);
        }
        await U.gravarJson(c.edicao, novo, { pastaSerie: c.pastaSerie });
        const e = registrar ? await registrarVersao(c, novo) : await lerEstadoHistorico(c);
        return { edicao: novo, historico: resumoHistorico(e) };
    });
}

// Ler-alterar-gravar no servidor (regeração, fala): sempre sobre a versão mais nova.
async function atualizarEdicao(serie, ep, mutar) {
    const c = U.caminhos(serie, ep);
    const atual = await U.lerJson(c.edicao, null);
    if (!atual) throw U.erro('Este episódio ainda não tem edição: gere a edição inicial.', 404);
    const novo = (await mutar(JSON.parse(JSON.stringify(atual)))) || atual;
    return salvarEdicao(serie, ep, novo, { revisaoBase: atual.revisao });
}

async function moverNoHistorico(serie, ep, passo) {
    const c = U.caminhos(serie, ep);
    return U.comTrava(c.edicao, async () => {
        const e = await lerEstadoHistorico(c);
        const alvo = e.pos + passo;
        if (alvo < 0 || alvo >= e.pilha.length) throw U.erro(passo < 0 ? 'Nada para desfazer.' : 'Nada para refazer.', 409);
        const versao = await U.lerJson(path.join(c.historico, e.pilha[alvo]), null);
        if (!versao) throw U.erro('Versão do histórico não encontrada.', 500);
        const atual = await U.lerJson(c.edicao, null);
        versao.revisao = (atual ? Number(atual.revisao) || 0 : 0) + 1;
        versao.atualizadoEm = new Date().toISOString();
        await U.gravarJson(c.edicao, versao, { pastaSerie: c.pastaSerie });
        e.pos = alvo;
        await U.gravarJson(c.estadoHistorico, e);
        return { edicao: versao, historico: resumoHistorico(e) };
    });
}

const desfazerEdicao = (serie, ep) => moverNoHistorico(serie, ep, -1);
const refazerEdicao = (serie, ep) => moverNoHistorico(serie, ep, +1);

// ---------------------------------------------------------------- mesa.json (regerações e takes, fora do desfazer)
async function lerMesa(serie, ep) {
    const c = U.caminhos(serie, ep);
    return (await U.lerJson(c.mesa, null)) || { versao: 1, regeracoes: [], takes: {} };
}

function atualizarMesa(serie, ep, mutar) {
    const c = U.caminhos(serie, ep);
    return U.comTrava(c.mesa, async () => {
        const m = (await U.lerJson(c.mesa, null)) || { versao: 1, regeracoes: [], takes: {} };
        m.regeracoes = m.regeracoes || [];
        m.takes = m.takes || {};
        const r = await mutar(m);
        await U.gravarJson(c.mesa, m, { pastaSerie: c.pastaSerie });
        return r === undefined ? m : r;
    });
}

// ---------------------------------------------------------------- contexto da série (acervo, fichas)
async function lerFichas(pastaSerie, tipo) {
    const pasta = path.join(pastaSerie, tipo);
    let nomes = [];
    try { nomes = await fsp.readdir(pasta, { withFileTypes: true }); } catch { return []; }
    const lista = [];
    for (const n of nomes) {
        if (!n.isDirectory() || n.name.startsWith('.')) continue;
        const f = await U.lerJson(path.join(pasta, n.name, 'ficha.json'), null);
        if (!f) continue;
        const refs = [];
        const add = (rel, rotulo) => {
            if (!rel) return;
            const arq = `${tipo}/${n.name}/${rel}`;
            if (!refs.some((r) => r.arquivo === arq) && fs.existsSync(path.join(pastaSerie, arq))) refs.push({ arquivo: arq, rotulo });
        };
        add(f.canonica, 'canônica');
        for (const e of f.estados || []) for (const [k, v] of Object.entries(e.refs || {})) add(v, `${e.id} · ${k}`);
        for (const cand of f.candidatas || []) add(cand.caminho, 'candidata');
        lista.push({ id: f.id || n.name, tipo, nome: f.nome || n.name, papel: f.papel || '', ancora: f.ancora || '', voz: f.voz || null, refs });
    }
    return lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

async function fichasPorId(pastaSerie) {
    const mapa = {};
    for (const tipo of ['elenco', 'locais', 'objetos']) for (const f of await lerFichas(pastaSerie, tipo)) mapa[f.id] = f;
    return mapa;
}

async function lerAcervo(pastaSerie) {
    const a = (await U.lerJson(path.join(pastaSerie, 'acervo', 'acervo.json'), null)) || { clipes: [] };
    return { ...a, clipes: (a.clipes || []).filter((c) => c && c.arquivo && fs.existsSync(path.join(pastaSerie, c.arquivo))) };
}

async function contextoMesa(serie, ep) {
    const c = U.caminhos(serie, ep);
    const serieDados = await U.lerJson(path.join(c.pastaSerie, 'serie.json'), null);
    if (!serieDados) throw U.erro(`Série não encontrada: ${serie}.`, 404);
    const roteiro = await U.lerJson(c.roteiro, null);
    const acervo = await lerAcervo(c.pastaSerie);
    const mesa = await lerMesa(serie, ep);
    return {
        serie: {
            id: serie, titulo: serieDados.titulo, genero: serieDados.genero, modelos: serieDados.modelos || {},
            vozes: serieDados.vozes || {}, tons: serieDados.tons || {}, orcamento: serieDados.orcamento || {},
        },
        episodio: { n: c.n, id: c.epId, titulo: roteiro ? roteiro.titulo : '', temRoteiro: Boolean(roteiro), temFalas: fs.existsSync(c.falas) },
        roteiro: roteiro ? { titulo: roteiro.titulo, gancho: roteiro.gancho, escolhas: roteiro.escolhas, cta: roteiro.cta, planos: roteiro.planos } : null,
        acervo: {
            clipes: acervo.clipes,
            elenco: await lerFichas(c.pastaSerie, 'elenco'),
            locais: await lerFichas(c.pastaSerie, 'locais'),
            objetos: await lerFichas(c.pastaSerie, 'objetos'),
        },
        mesa,
    };
}

// ---------------------------------------------------------------- edição inicial
/**
 * edicaoInicial(serie, ep, { gerarFalas, forcar, executor })
 * Lê roteiro + falas.json (se existir; com gerarFalas=true gera pelo módulo de áudio; senão estima pelo texto),
 * monta a edição "narração primeiro" e grava (entra no histórico: dá para desfazer).
 */
async function edicaoInicial(serie, ep, { gerarFalas = false, forcar = false, executor } = {}) {
    const c = U.caminhos(serie, ep);
    const serieDados = await U.lerJson(path.join(c.pastaSerie, 'serie.json'), null);
    if (!serieDados) throw U.erro(`Série não encontrada: ${serie}.`, 404);
    const roteiro = await U.lerJson(c.roteiro, null);
    if (!roteiro) throw U.erro('Este episódio ainda não tem roteiro (roteiro.json).', 404);
    const atual = await U.lerJson(c.edicao, null);
    if (atual && !forcar) throw U.erro('A edição já existe. Use "Refazer do roteiro" (forcar) para montar de novo.', 409);

    let falasDoc = await U.lerJson(c.falas, null);
    let origemFalas = 'falas.json';
    if (!falasDoc && gerarFalas) {
        const falasMod = require('../audio/falas');
        falasDoc = (await falasMod.gerarFalasEpisodio(serie, c.n, { executor })).doc;
    }
    let falas = falasDoc ? falasDoc.falas || [] : [];
    if (!falasDoc) {
        origemFalas = 'estimadas';
        const falasMod = require('../audio/falas');
        const cfg = require('../audio/config');
        const fichas = {};
        for (const p of roteiro.planos || []) {
            for (const f of p.falas || []) {
                const q = String(f.quem || '').toLowerCase();
                if (!(q in fichas)) fichas[q] = await U.lerJson(path.join(c.pastaSerie, 'elenco', q, 'ficha.json'), null);
            }
        }
        try {
            falas = falasMod.montarFalas({ roteiro, serie: serieDados, fichas, vozesCfg: cfg.carregarVozes() }).map((f) => ({ ...f, status: 'sem_audio' }));
        } catch {
            falas = (roteiro.planos || []).flatMap((p) => (p.falas || []).map((f, k) => ({
                id: `p${String(p.n).padStart(2, '0')}-f${String(k + 1).padStart(2, '0')}`, plano: p.n, ordem: k + 1, quem: f.quem,
                via: f.via, textoExibido: f.texto, status: 'sem_audio',
            })));
        }
    }
    const doc = montarEdicao({
        roteiro,
        falas,
        acervo: await lerAcervo(c.pastaSerie),
        planosDoc: await U.lerJson(c.planos, null),
        serie: serieDados,
        serieId: serie,
        epId: c.epId,
        origemFalas,
    });
    return salvarEdicao(serie, ep, doc, {});
}

module.exports = {
    VERSAO, FAIXAS, FAIXAS_AUDIO, MIN_PLANO_S,
    estimarFala, coberturaDoPlano, duracoesDosPlanos, pontuarClipe, escolherClipes, montarEdicao,
    legendaDosItens, recalcularLegenda, itensDeFala,
    limitesPlanos, planosDoTrecho, dividirItem, recortarFaixa, substituirTrechoVideo, linhaDeVideo, fimDe,
    validarEdicao, normalizarEdicao,
    lerEdicao, salvarEdicao, atualizarEdicao, desfazerEdicao, refazerEdicao, historico, edicaoInicial,
    lerMesa, atualizarMesa, contextoMesa, lerFichas, fichasPorId, lerAcervo,
};
