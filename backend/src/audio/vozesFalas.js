// VOZ MUDOU? Compara a voz/tom com que cada fala foi gerada (edicao.json, senão falas.json) com a voz/tom que a
// fala teria AGORA (ficha do elenco, serie.json → vozes/tons, vozes.json) e regera só o que precisa (TTS grátis).
// A edição é atualizada no lugar (só as faixas de fala: takes, cortes e ajustes ficam); nada é remontado do roteiro.
const fs = require('fs');
const path = require('path');
const U = require('../edicao/util');
const cfg = require('./config');
const falasMod = require('./falas');

const FAIXAS_FALA = ['narracao', 'falas', 'efeitos'];
const SLUG = /^[a-z0-9-]+$/;

// "Cadu (Brasil)" → "Cadu"; voz fora da lista → o próprio id.
function nomeCurtoVoz(vozesCfg, id) {
    if (!id) return '';
    const v = (vozesCfg.permitidas || []).find((x) => x.id === id);
    const nome = v && v.nome ? String(v.nome) : String(id).replace(/^piper:pt_BR-/, '').replace(/-medium$/, '').replace(/MultilingualNeural$/, '').replace(/^[a-z]{2}-[A-Z]{2}-/, '');
    return nome.split(' (')[0];
}

async function lerContexto(serie, ep) {
    const c = U.caminhos(serie, ep);
    const serieDados = await U.lerJson(path.join(c.pastaSerie, 'serie.json'), null);
    if (!serieDados) throw U.erro(`Série não encontrada: ${serie}.`, 404);
    const edicao = await U.lerJson(c.edicao, null);
    const falasDoc = await U.lerJson(c.falas, null);
    const fichas = {};
    const ficha = async (quem) => {
        if (!(quem in fichas)) fichas[quem] = SLUG.test(quem) ? await U.lerJson(path.join(c.pastaSerie, 'elenco', quem, 'ficha.json'), null) : null;
        return fichas[quem];
    };
    return { c, serieDados, edicao, falasDoc, ficha, vozesCfg: cfg.carregarVozes() };
}

// As falas como estão gravadas: as da edição (o que toca e monta) ou, sem edição, as do falas.json.
function falasGravadas(edicao, falasDoc) {
    if (edicao && edicao.faixas) {
        const itens = [];
        for (const f of FAIXAS_FALA) {
            for (const it of edicao.faixas[f] || []) {
                if (!it || (!it.fala && !it.quem)) continue;
                itens.push({ id: it.id, fala: it.fala || it.id, quem: String(it.quem || 'narrador').toLowerCase(), voz: it.voz || null, tom: it.tom || null,
                    texto: it.texto || '', via: it.via || null, intencao: it.intencao || null, arquivo: it.arquivo || null, inicioS: Number(it.inicioS) || 0,
                    plano: it.plano, ajusteManual: it.ajusteManual || null, faixa: f });
            }
        }
        return { fonte: 'edicao', itens: itens.sort((a, b) => a.inicioS - b.inicioS) };
    }
    if (falasDoc && Array.isArray(falasDoc.falas)) {
        return {
            fonte: 'falas',
            itens: falasDoc.falas.map((f) => ({ id: f.id, fala: f.id, quem: String(f.quem || 'narrador').toLowerCase(), voz: f.voz || null, tom: f.tom || null,
                texto: f.textoExibido || f.texto || '', via: f.via || null, intencao: f.intencao || null, arquivo: f.arquivo || null,
                inicioS: Number(f.inicioS) || 0, plano: f.plano, ajusteManual: null })),
        };
    }
    return { fonte: null, itens: [] };
}

// De onde vem a voz de "quem" agora (a mesma ordem de parametros.resolverVoz).
function origemDaVoz(serieDados, ficha, quem) {
    if (serieDados.vozes && serieDados.vozes[quem]) return 'serie';
    if (ficha && ficha.voz) return 'ficha';
    return 'casa';
}

/**
 * conferirVozes(serie, ep) → { fonte, total, mudancas: [ { quem, nome, vozAntes, vozAgora, nomeVozAntes, nomeVozAgora,
 *   tomAntes, tomAgora, mudouVoz, mudouTom, falas: [{ id, fala, texto }], origemVoz, aviso? } ], erros }
 * Só leitura (não gera nada). Tom ajustado à mão numa fala (ajusteManual.tom) não conta como mudança.
 */
async function conferirVozes(serie, ep) {
    const { serieDados, edicao, falasDoc, ficha, vozesCfg } = await lerContexto(serie, ep);
    const { fonte, itens } = falasGravadas(edicao, falasDoc);
    const grupos = new Map();
    const erros = [];
    for (const it of itens) {
        if (!it.voz) continue; // fala só estimada (sem áudio): nada a comparar
        const f = await ficha(it.quem);
        let atual;
        try {
            atual = falasMod.prepararFala({ quem: it.quem, texto: it.texto || '.', via: it.via || undefined, intencao: it.intencao || undefined }, { serie: serieDados, ficha: f, vozesCfg });
        } catch (e) {
            erros.push(`${it.fala} (${it.quem}): ${e.message}`);
            continue;
        }
        const mudouVoz = atual.voz !== it.voz;
        const tomManual = it.ajusteManual && it.ajusteManual.tom;
        const mudouTom = !mudouVoz && !tomManual && it.tom !== null && String(atual.tom) !== String(it.tom);
        if (!mudouVoz && !mudouTom) continue;
        const chave = `${it.quem}|${it.voz}|${it.tom}`;
        if (!grupos.has(chave)) {
            grupos.set(chave, {
                quem: it.quem, nome: (f && f.nome) || (it.quem === 'narrador' ? 'Narrador' : it.quem.charAt(0).toUpperCase() + it.quem.slice(1)),
                vozAntes: it.voz, vozAgora: atual.voz, nomeVozAntes: nomeCurtoVoz(vozesCfg, it.voz), nomeVozAgora: nomeCurtoVoz(vozesCfg, atual.voz),
                tomAntes: it.tom, tomAgora: atual.tom, mudouVoz, mudouTom, origemVoz: origemDaVoz(serieDados, f, it.quem), falas: [],
            });
        }
        grupos.get(chave).falas.push({ id: it.id, fala: it.fala, texto: String(it.texto).slice(0, 120) });
    }
    // a mesma pessoa em dois grupos (ex.: metade regerada) vira um só, com as duas vozes antigas
    const porQuem = new Map();
    for (const g of grupos.values()) {
        const x = porQuem.get(g.quem);
        if (!x) { porQuem.set(g.quem, g); continue; }
        x.falas.push(...g.falas);
        if (x.vozAntes !== g.vozAntes) x.nomeVozAntes = `${x.nomeVozAntes} / ${g.nomeVozAntes}`;
        x.mudouVoz = x.mudouVoz || g.mudouVoz;
        x.mudouTom = x.mudouTom || g.mudouTom;
    }
    const mudancas = [...porQuem.values()];
    // serie.json → vozes vence a ficha: trocar a voz na ficha não muda nada enquanto a série fixar outra
    for (const quem of new Set(itens.map((i) => i.quem))) {
        const f = await ficha(quem);
        if (f && f.voz && serieDados.vozes && serieDados.vozes[quem] && serieDados.vozes[quem] !== f.voz) {
            erros.push(`A ficha de ${f.nome || quem} pede ${nomeCurtoVoz(vozesCfg, f.voz)}, mas a série fixa ${nomeCurtoVoz(vozesCfg, serieDados.vozes[quem])} para esse papel (serie.json → vozes): vale a da série.`);
        }
    }
    return { fonte, total: itens.length, mudancas, erros };
}

// Uma fala pronta para gerar com a voz ATUAL, mantendo texto, intenção e os ajustes feitos à mão na Mesa.
function falaComVozAtual(it, ctx, ficha) {
    const P = require('./parametros');
    const entrada = { quem: it.quem, texto: it.texto || '.', via: it.via || undefined, intencao: it.intencao || undefined };
    const avisos = [];
    const m = it.ajusteManual || {};
    const antes = it.voz ? P.motorDaVoz(it.voz) : null;
    for (const k of ['tom', 'velocidade', 'volume']) {
        if (m[k] === undefined || m[k] === null || m[k] === '') continue;
        // tom em Hz (Edge) e em semitons (Piper) não se misturam: trocou de motor, o tom à mão sai
        if (k === 'tom' && antes) {
            const prova = falasMod.prepararFala(entrada, { serie: ctx.serieDados, ficha, vozesCfg: ctx.vozesCfg });
            if (prova.motor !== antes) { avisos.push(`${it.fala}: o tom ajustado à mão (${m.tom}) não vale para a voz nova (outro motor) e saiu.`); continue; }
        }
        entrada[k] = k === 'volume' ? Number(m[k]) : m[k];
    }
    const pronta = falasMod.prepararFala(entrada, { serie: ctx.serieDados, ficha, vozesCfg: ctx.vozesCfg });
    return { fala: { id: it.fala, plano: it.plano, ...pronta }, avisos };
}

/**
 * regerarFalasVoz({ serie, ep, quem?, executor }) — regera as falas com a voz/tom ATUAIS (TTS grátis).
 *  - quem: só as falas desse personagem; sem quem: todas (as que não mudaram vêm do cache, iguais).
 *  - com edição: troca só os itens de fala (ripple dentro do plano, legenda acompanha); vídeo, takes, cortes e
 *    texto de tela ficam. Uma versão nova entra no histórico (Ctrl+Z desfaz). falas.json acompanha.
 *  - sem edição: refaz o falas.json pelo roteiro (cache por hash: só o que mudou é gerado de novo).
 * → { modo: 'edicao'|'falas', regeradas: [{ id, quem, voz, duracaoS, delta }], doCache, avisos, edicao?, historico? }
 */
async function regerarFalasVoz({ serie, ep, quem = null, executor } = {}) {
    const ctx = await lerContexto(serie, ep);
    const { c, edicao, falasDoc, ficha } = ctx;
    const alvo = quem ? String(quem).toLowerCase() : null;
    if (!edicao) {
        if (!fs.existsSync(c.roteiro)) throw U.erro('Este episódio ainda não tem roteiro.', 404);
        const r = await falasMod.gerarFalasEpisodio(serie, c.n, { executor });
        const falas = r.doc.falas.filter((f) => !alvo || f.quem === alvo);
        return {
            modo: 'falas', total: r.doc.falas.length, doCache: r.doc.falas.filter((f) => f.doCache).length,
            regeradas: falas.map((f) => ({ id: f.id, quem: f.quem, voz: f.voz, duracaoS: f.duracaoS, status: f.status })),
            avisos: [...(r.doc.avisos || []), ...(falasDoc ? [] : ['Ainda não há edição: as falas ficaram prontas; monte a edição na Mesa.'])],
        };
    }
    const { itens } = falasGravadas(edicao, falasDoc);
    const escolhidos = itens.filter((it) => (!alvo || it.quem === alvo) && it.texto);
    if (!escolhidos.length) throw U.erro(alvo ? `Nenhuma fala de "${alvo}" na edição.` : 'A edição não tem falas.', 404);
    const avisos = [];
    const lote = [];
    for (const it of escolhidos) {
        try {
            const r = falaComVozAtual(it, ctx, await ficha(it.quem));
            avisos.push(...r.avisos);
            lote.push({ it, fala: r.fala });
        } catch (e) {
            avisos.push(`${it.fala} (${it.quem}): ${e.message}`);
        }
    }
    if (!lote.length) throw U.erro(`Nenhuma fala pôde ser preparada: ${avisos.slice(0, 2).join(' ')}`, 400);
    await falasMod.gerarAudios(lote.map((x) => x.fala), { pastaAudio: path.join(c.pastaEp, 'audio'), tratar: true, serie: ctx.serieDados, executor });
    const prontas = lote.filter((x) => x.fala.status === 'pronta');
    for (const x of lote) if (x.fala.status !== 'pronta') avisos.push(`${x.it.fala}: não foi gerada (${x.fala.erro || 'erro no motor'}); ficou a anterior.`);
    if (!prontas.length) throw U.erro(`Nenhuma fala foi gerada: ${avisos.slice(0, 2).join(' ')}`, 500);

    const trecho = require('../edicao/trecho');
    const E = require('../edicao/edicao');
    const agora = new Date().toISOString();
    const regeradas = [];
    let avisosEdicao = [];
    const r = await E.atualizarEdicao(serie, ep, (d) => {
        regeradas.length = 0; // pode rodar de novo (409: outra gravação no meio)
        avisosEdicao = [];
        for (const { it, fala } of prontas) {
            const novo = {
                voz: fala.voz, intencao: fala.intencao, tom: fala.tom, velocidade: fala.velocidade, volume: fala.volume, filtro: fala.filtro ?? null,
                frases: (fala.frases || []).map((fr) => ({ texto: fr.texto, pausaDepoisS: U.arred(Number(fr.pausaDepoisS) || 0) })),
                texto: fala.textoExibido, textoFalado: fala.textoFalado, arquivo: U.relativoNaSerie(c.pastaSerie, fala._arq),
                duracaoS: U.arred(fala.duracaoS), palavras: (fala.palavras || []).map((w) => ({ p: w.p, t: U.arred(w.t) })),
                palavrasEstimadas: Boolean(fala.palavrasEstimadas), status: 'pronta', regeradaEm: agora, vozAnterior: it.voz,
            };
            const info = trecho.aplicarFalaNova(d, it.id, novo);
            avisosEdicao.push(...info.avisos);
            regeradas.push({ id: it.id, fala: it.fala, quem: it.quem, voz: fala.voz, vozAntes: it.voz, duracaoS: novo.duracaoS, delta: info.delta, doCache: Boolean(fala.doCache) });
        }
        return d;
    });
    avisos.push(...avisosEdicao);
    // falas.json acompanha (é de onde a "edição inicial" e o "conferir vozes" sem edição leem)
    if (falasDoc && Array.isArray(falasDoc.falas)) {
        const porId = new Map(prontas.map((x) => [x.it.fala, x.fala]));
        let mudou = false;
        falasDoc.falas = falasDoc.falas.map((f) => {
            const n = porId.get(f.id);
            if (!n) return f;
            mudou = true;
            return {
                ...f, voz: n.voz, motor: n.motor, tom: n.tom, velocidade: n.velocidade, volume: n.volume, volumeAlvo: n.volumeAlvo, filtro: n.filtro,
                frases: n.frases, textoFalado: n.textoFalado, hash: n.hash, duracaoS: n.duracaoS, palavras: n.palavras, palavrasEstimadas: n.palavrasEstimadas,
                tempoFrases: n.tempoFrases, tratamento: n.tratamento, status: 'pronta', doCache: Boolean(n.doCache),
                arquivo: U.relativoNaSerie(c.pastaSerie, n._arq), regeradaEm: agora,
            };
        });
        if (mudou) await U.gravarJson(c.falas, falasDoc, { pastaSerie: c.pastaSerie });
    }
    require('../log/registro').registrar({
        area: 'audio', evento: 'falas-voz-nova', serie, ep: c.epId,
        msg: `${regeradas.length} fala(s) regerada(s) com a voz atual${alvo ? ` (${alvo})` : ''}`,
        dados: { quem: alvo, total: regeradas.length, doCache: regeradas.filter((x) => x.doCache).length, vozes: [...new Set(regeradas.map((x) => x.voz))] },
    });
    return { modo: 'edicao', ...r, regeradas, doCache: regeradas.filter((x) => x.doCache).length, avisos };
}

module.exports = { conferirVozes, regerarFalasVoz, nomeCurtoVoz, falasGravadas };
