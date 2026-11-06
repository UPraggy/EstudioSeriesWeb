// REGERAR SÓ UM TRECHO (docs/INTERFACE.md):
//  - vídeo: o trecho [deS, ateS] vira um pedido por plano; primeiro quadro = quadro do take atual em deS (ffmpeg);
//    último quadro = quadro em ateS quando o modelo aceita E a emenda dá certo; duração pedida = a menor aceita pelo
//    modelo ≥ trecho; custo cotado ANTES (token de confirmação do módulo openrouter — nada pago sem clique);
//    o resultado vira um take novo (o antigo fica) aparado para o tamanho exato e entra SÓ naquele pedaço.
//  - fala: regera só aquela fala (mesma voz) pelo módulo de áudio; a faixa se ajusta e a legenda acompanha.
//  - legenda: recalcula os blocos das falas do trecho.
// Regerações e takes ficam em episodios/epNN/mesa.json (fora do desfazer).
const fsp = require('fs/promises');
const path = require('path');
const U = require('./util');
const E = require('./edicao');
const midia = require('./midia');

// O quanto dá para acelerar um clipe para caber no trecho e manter as duas emendas (acima disso, apara).
const ACELERACAO_MAX = 1.35;
const seguindo = new Set();

// ---------------------------------------------------------------- funções puras
/** Menor duração aceita pelo modelo que cobre o trecho (s inteiros). Lança erro se o trecho passa do máximo. */
function duracaoPedida(modelo, trechoS) {
    const lista = Array.isArray(modelo && modelo.supported_durations) ? [...modelo.supported_durations].map(Number).sort((a, b) => a - b) : null;
    if (!lista || !lista.length) return Math.max(1, Math.ceil(trechoS - 1e-6));
    const d = lista.find((x) => x >= trechoS - 1e-6);
    if (d === undefined) {
        throw U.erro(`O trecho tem ${trechoS.toFixed(2).replace('.', ',')} s e o ${modelo.name || modelo.id} gera no máximo ${lista.at(-1)} s: selecione um trecho menor.`);
    }
    return d;
}

/**
 * Como o clipe gerado (duracaoPedidaS) vira o trecho exato:
 *  - "acelerar": o modelo aceita último quadro e a diferença é pequena (≤ 1,35×): manda os dois quadros e
 *    acelera — emenda sem pulo nas duas pontas;
 *  - "aparar": manda só o primeiro quadro e corta o fim (a emenda do fim pode pular).
 */
function decidirAjuste({ trechoS, duracaoPedidaS, aceitaUltimo }) {
    const fator = duracaoPedidaS / trechoS;
    if (aceitaUltimo && fator <= ACELERACAO_MAX + 1e-9) return { ajuste: fator > 1.0001 ? 'acelerar' : 'exato', fator: U.arred(fator, 4), usarUltimo: true };
    return { ajuste: fator > 1.0001 ? 'aparar' : 'exato', fator: U.arred(fator, 4), usarUltimo: false };
}

/** Segmento de vídeo que aparece no tempo t e o tempo correspondente dentro do arquivo. */
function quadroNoTempo(doc, t) {
    const p = E.linhaDeVideo(doc).find((s) => t >= s.inicioS - 1e-6 && t < s.inicioS + s.duracaoS - 1e-6);
    if (!p || !p.arquivo) return null;
    return { segmento: p, arquivo: p.arquivo, tArquivo: U.arred((Number(p.entradaS) || 0) + (t - p.inicioS), 4) };
}

function montarPrompt(plano, fichas = {}, instrucao = '') {
    const ancoras = (plano.ancoras || [])
        .map((id) => fichas[id])
        .filter((f) => f && f.ancora)
        .map((f) => `${f.nome}: ${f.ancora}`);
    return [
        String(plano.prompt || plano.visual || '').trim(),
        ancoras.length ? `Continuidade: ${ancoras.join('; ')}.` : '',
        instrucao ? `Neste trecho: ${String(instrucao).trim()}.` : '',
        'Vídeo vertical 9:16, sem texto escrito na imagem.',
    ].filter(Boolean).join(' ').replace(/\.\./g, '.');
}

// Próximo número de take do plano (olha os takes gravados, os arquivos e as cotações em aberto).
function proximoTake(nomesArquivos = [], takes = [], reservados = []) {
    let max = 0;
    for (const n of [...nomesArquivos, ...takes.map((t) => t.id), ...reservados]) {
        const m = /take_(\d+)/.exec(String(n));
        if (m) max = Math.max(max, Number(m[1]));
    }
    return `take_${String(max + 1).padStart(2, '0')}`;
}

function escolherModelo({ pedido, plano, serie, modelos }) {
    const aceitaQuadro = (id) => {
        const m = modelos.find((x) => x.id === id);
        return m && (m.supported_frame_images || []).includes('first_frame');
    };
    if (pedido) return pedido;
    if (plano && plano.modelo && aceitaQuadro(plano.modelo)) return plano.modelo;
    const s = (serie && serie.modelos) || {};
    for (const id of [s.videoFinal, s.videoRascunho]) if (id && aceitaQuadro(id)) return id;
    const qualquer = modelos.find((m) => (m.supported_frame_images || []).includes('first_frame'));
    if (!qualquer) throw U.erro('Nenhum modelo de vídeo do catálogo aceita primeiro quadro.');
    return qualquer.id;
}

// ---------------------------------------------------------------- cotar
/**
 * cotarTrecho({ serie, ep, deS, ateS, instrucao, modelo, resolucao })
 * → { cotacoes: [ { id, plano, deS, ateS, duracaoS, duracaoPedidaS, ajuste, fator, custoPrevistoUsd, token, ... } ], totalUsd }
 * Não gasta nada. Cada cotação tem o seu token (10 min) — RegerarTrecho exige o token de volta.
 */
async function cotarTrecho({ serie, ep, deS, ateS, instrucao = '', modelo = null, resolucao = null } = {}) {
    const or = require('../openrouter');
    const servico = require('../openrouter/servico');
    const c = U.caminhos(serie, ep);
    const doc = await E.lerEdicao(serie, ep);
    if (!doc) throw U.erro('Este episódio ainda não tem edição.', 404);
    const de = Number(deS);
    const ate = Number(ateS);
    if (!Number.isFinite(de) || !Number.isFinite(ate) || ate - de < 0.2) throw U.erro('Selecione um trecho de pelo menos 0,2 s.');
    if (de < -1e-6 || ate > doc.duracaoS + 0.05) throw U.erro('O trecho passa dos limites do episódio.');
    const partes = E.planosDoTrecho(doc, de, ate);
    if (!partes.length) throw U.erro('O trecho não cai em nenhum plano com vídeo.');

    const serieDados = await U.lerJson(path.join(c.pastaSerie, 'serie.json'), {});
    const ctx = await or.obterContexto({ serie });
    const cat = await or.catalogo.carregarCatalogoVideo({ cliente: ctx.cliente, raiz: ctx.raiz });
    const fichas = await E.fichasPorId(c.pastaSerie);
    const mesa = await E.lerMesa(serie, ep);
    const fps = doc.fps || U.FPS_PADRAO;
    const cotacoes = [];

    for (const parte of partes) {
        const plano = (doc.planos || []).find((p) => p.n === parte.plano) || { n: parte.plano };
        const modeloId = escolherModelo({ pedido: modelo, plano, serie: serieDados, modelos: cat.modelos });
        const m = or.catalogo.acharModelo(cat.modelos, modeloId, 'vídeo');
        const len = U.arred(parte.ateS - parte.deS);
        const durPedida = duracaoPedida(m, len);
        const aceita = m.supported_frame_images || [];
        const aj = decidirAjuste({ trechoS: len, duracaoPedidaS: durPedida, aceitaUltimo: aceita.includes('last_frame') });
        const id = U.novoId('r');
        const pastaQuadros = path.join(c.pastaEp, 'quadros');
        const avisos = [];
        const quadros = { primeiro: null, ultimo: null };
        if (aceita.includes('first_frame')) {
            const q = quadroNoTempo(doc, parte.deS + 0.001);
            if (q) quadros.primeiro = (await midia.extrairQuadro({ serie, caminho: q.arquivo, tS: q.tArquivo, saida: path.join(pastaQuadros, `trecho-${id}-ini.png`) })).arquivo;
            else avisos.push('Não há vídeo no início do trecho: o novo clipe sai sem primeiro quadro.');
        } else {
            avisos.push(`${m.name || m.id} não aceita primeiro quadro: a emenda pode pular.`);
        }
        if (aj.usarUltimo) {
            const q = quadroNoTempo(doc, parte.ateS - 1 / fps);
            if (q) quadros.ultimo = (await midia.extrairQuadro({ serie, caminho: q.arquivo, tS: q.tArquivo, saida: path.join(pastaQuadros, `trecho-${id}-fim.png`) })).arquivo;
        }
        if (aj.ajuste === 'aparar') avisos.push(`O modelo gera ${durPedida} s: o clipe será aparado para ${len.toFixed(2).replace('.', ',')} s (a emenda do fim pode pular).`);
        if (aj.ajuste === 'acelerar') avisos.push(`O modelo gera ${durPedida} s: o clipe será acelerado ${aj.fator.toFixed(2).replace('.', ',')}× para caber em ${len.toFixed(2).replace('.', ',')} s e emendar nas duas pontas.`);

        const pasta = `episodios/${c.epId}/takes/p${String(parte.plano).padStart(2, '0')}`;
        let nomes = [];
        try { nomes = await fsp.readdir(path.join(c.pastaSerie, pasta)); } catch { nomes = []; }
        const reservados = mesa.regeracoes.filter((r) => r.plano === parte.plano && ['cotado', 'gerando'].includes(r.status)).map((r) => r.take && r.take.id);
        const takeId = proximoTake(nomes, (mesa.takes || {})[parte.plano] || [], [...reservados, ...cotacoes.filter((x) => x.plano === parte.plano).map((x) => x.take.id)]);
        const resolucoes = m.supported_resolutions || [];
        const proporcoes = m.supported_aspect_ratios || [];
        const pedido = {
            modelo: m.id,
            prompt: montarPrompt(plano, fichas, instrucao),
            duracaoS: durPedida,
            resolucao: resolucao || (resolucoes.length ? (resolucoes.includes('720p') ? '720p' : resolucoes[0]) : null),
            proporcao: proporcoes.length ? (proporcoes.includes('9:16') ? '9:16' : null) : null,
            audio: false,
            quadros: { primeiro: quadros.primeiro, ultimo: quadros.ultimo },
            destino: `${pasta}/${takeId}.bruto.mp4`,
            ep: c.n,
            etapa: 'regeracao',
            ref: `p${String(parte.plano).padStart(2, '0')}/${takeId}`,
        };
        if (!pedido.proporcao) throw U.erro(`${m.name || m.id} não gera vídeo vertical 9:16: escolha outro modelo.`);
        const cot = await servico.cotarGeracao({ tipo: 'video', serie, pedido });
        const registro = {
            id, faixa: 'video', status: 'cotado', plano: parte.plano, deS: parte.deS, ateS: parte.ateS, duracaoS: len,
            duracaoPedidaS: durPedida, ajuste: aj.ajuste, fator: aj.fator, instrucao: String(instrucao || ''), modelo: m.id, nomeModelo: m.name,
            prompt: pedido.prompt, quadros, pedido, custoPrevistoUsd: cot.custoPrevistoUsd, estimativa: Boolean(cot.estimativa),
            simulado: Boolean(cot.simulado), criadoEm: new Date().toISOString(),
            take: { id: takeId, arquivo: `${pasta}/${takeId}.mp4`, bruto: pedido.destino },
        };
        cotacoes.push({ ...registro, token: cot.token, expiraEm: cot.expiraEm, orcamento: cot.orcamento, detalhe: cot.detalhe, avisos: [...avisos, ...(cot.avisos || [])] });
    }

    // guarda as cotações (sem token) para o RegerarTrecho saber o pedido exato; limpa cotações velhas
    const limite = Date.now() - 30 * 60 * 1000;
    await E.atualizarMesa(serie, ep, (m) => {
        m.regeracoes = m.regeracoes.filter((r) => r.status !== 'cotado' || Date.parse(r.criadoEm) > limite);
        for (const x of cotacoes) {
            const { token, expiraEm, orcamento, detalhe, avisos, ...reg } = x;
            m.regeracoes.push(reg);
        }
    });
    const totalUsd = Math.round(cotacoes.reduce((s, x) => s + x.custoPrevistoUsd, 0) * 1e6) / 1e6;
    return { cotacoes, totalUsd, simulado: cotacoes.some((x) => x.simulado) };
}

// ---------------------------------------------------------------- gerar (só com o token da cotação)
async function regerarTrecho({ serie, ep, confirmacoes = [] } = {}) {
    const servico = require('../openrouter/servico');
    if (!Array.isArray(confirmacoes) || !confirmacoes.length) throw U.erro('Confirme a cotação antes de gerar (falta o token).');
    const mesa = await E.lerMesa(serie, ep);
    const iniciadas = [];
    for (const { id, token } of confirmacoes) {
        const rec = mesa.regeracoes.find((r) => r.id === id);
        if (!rec) throw U.erro(`Cotação ${id} não encontrada: cote de novo.`, 404);
        if (rec.status !== 'cotado') throw U.erro(`A regeração ${id} já foi ${rec.status === 'pronto' ? 'feita' : 'enviada'}.`, 409);
        if (!token) throw U.erro('Falta o token de confirmação: nada é gerado sem confirmar o custo.');
        const r = await servico.gerar({ tipo: 'video', serie, pedido: rec.pedido, token });
        const atualizado = await mudarRegeracao(serie, ep, id, {
            status: 'gerando', etapa: 'enviado', jobId: r.job && r.job.jobId, novo: r.novo !== false, iniciadoEm: new Date().toISOString(),
        });
        iniciadas.push(vistaRegeracao(atualizado));
        acompanhar(serie, ep, id);
    }
    return { regeracoes: iniciadas };
}

function mudarRegeracao(serie, ep, id, campos) {
    return E.atualizarMesa(serie, ep, (m) => {
        const r = m.regeracoes.find((x) => x.id === id);
        if (!r) return null;
        Object.assign(r, campos, { atualizadoEm: new Date().toISOString() });
        return { ...r };
    });
}

// O que vai para a interface (sem o pedido inteiro).
function vistaRegeracao(r) {
    if (!r) return null;
    const { pedido, ...resto } = r;
    return resto;
}

// Acompanha o job (backoff do módulo de jobs) e finaliza; roda solto (a interface consulta StatusRegeracao).
function acompanhar(serie, ep, id) {
    const chave = `${serie}|${ep}|${id}`;
    if (seguindo.has(chave)) return;
    seguindo.add(chave);
    const registro = require('../log/registro');
    const fim = registro.cronometro();
    const log = (nivel, evento, msg, dados = {}, extra = {}) => registro.registrar({ nivel, area: 'edicao', evento, serie, ep, msg, ms: fim(), dados: { regeracao: id, ...dados }, ...extra });
    (async () => {
        try {
            const or = require('../openrouter');
            const mesa = await E.lerMesa(serie, ep);
            const rec = mesa.regeracoes.find((r) => r.id === id);
            if (!rec || rec.status !== 'gerando' || !rec.jobId) return;
            const ctx = await or.obterContexto({ serie });
            let job = await ctx.jobs.consultar(rec.jobId);
            if (job.status === 'pendente') {
                await mudarRegeracao(serie, ep, id, { etapa: `gerando (${job.statusApi || 'na fila'})` });
                job = await ctx.jobs.acompanhar(rec.jobId, {
                    aoAtualizar: (j) => { mudarRegeracao(serie, ep, id, { etapa: j.erroDownload ? 'baixando de novo' : `gerando (${j.statusApi || 'na fila'})` }).catch(() => {}); },
                });
            }
            if (job.status === 'pendente') {
                await mudarRegeracao(serie, ep, id, { etapa: 'ainda gerando (consulte de novo depois)' });
                log('aviso', 'regeracao-pendente', 'Regeração ainda gerando depois do limite de espera (continua na próxima consulta)', { jobId: rec.jobId });
                return;
            }
            if (job.status !== 'pronto') {
                await mudarRegeracao(serie, ep, id, { status: 'falhou', etapa: 'falhou', erro: job.erro || `job ${job.status}` });
                log('erro', 'regeracao-falhou', `Regeração falhou: ${job.erro || `job ${job.status}`}`, { jobId: rec.jobId, plano: rec.plano });
                return;
            }
            await mudarRegeracao(serie, ep, id, { etapa: 'aparando', custoUsd: job.custoUsd ?? null });
            const take = await finalizarRegeracao(serie, ep, { ...rec, custoUsd: job.custoUsd ?? null });
            log('info', 'regeracao-pronta', `Trecho ${rec.deS}–${rec.ateS} s trocado pelo take ${take && take.id}`,
                { jobId: rec.jobId, plano: rec.plano, take: take && take.id, ajuste: rec.ajuste, custoDoJobUsd: job.custoUsd ?? null, simulado: Boolean(rec.simulado) });
        } catch (e) {
            log('erro', 'regeracao-falhou', `Regeração falhou: ${e.message}`, { jobId: undefined }, { erro: e });
            await mudarRegeracao(serie, ep, id, { status: 'falhou', etapa: 'falhou', erro: e.message }).catch(() => {});
        } finally {
            seguindo.delete(chave);
        }
    })();
}

/**
 * Cadeia ffmpeg que transforma o clipe gerado (duracaoBrutaS) no trecho exato (trechoS):
 * acelerar (setpts) ou aparar (-t); se ficar curto, segura o último quadro (tpad).
 */
function cadeiaAjuste({ ajuste, duracaoBrutaS, trechoS, fps = U.FPS_PADRAO, largura = 720, altura = 1280 }) {
    const partes = [];
    let d = duracaoBrutaS;
    if (ajuste === 'acelerar' && duracaoBrutaS > trechoS + 0.01) {
        partes.push(`setpts=PTS*${(trechoS / duracaoBrutaS).toFixed(5)}`);
        d = trechoS;
    }
    partes.push(`scale=${largura}:${altura}:force_original_aspect_ratio=increase`, `crop=${largura}:${altura}`, 'setsar=1', `fps=${fps}`);
    if (d < trechoS - 0.01) partes.push(`tpad=stop_mode=clone:stop_duration=${(trechoS - d + 0.1).toFixed(3)}`);
    partes.push('format=yuv420p');
    return partes.join(',');
}

async function finalizarRegeracao(serie, ep, rec) {
    const c = U.caminhos(serie, ep);
    const bruto = U.absolutoNaSerie(c.pastaSerie, rec.take.bruto);
    const final = U.absolutoNaSerie(c.pastaSerie, rec.take.arquivo);
    if (!U.existe(bruto)) throw U.erro(`O vídeo gerado não foi baixado (${rec.take.bruto}).`, 500);
    const info = await U.infoMidia(bruto);
    const doc = await E.lerEdicao(serie, ep);
    const fps = (doc && doc.fps) || U.FPS_PADRAO;
    // mesmo tamanho dos clipes do acervo (o render escala tudo para 1080×1920 depois)
    const vf = cadeiaAjuste({ ajuste: rec.ajuste, duracaoBrutaS: info.duracaoS, trechoS: rec.duracaoS, fps });
    await fsp.mkdir(path.dirname(final), { recursive: true });
    await U.rodarFfmpeg(['-y', '-i', bruto, '-an', '-vf', vf, '-t', rec.duracaoS.toFixed(3), '-c:v', 'libx264', '-crf', '18', '-preset', 'fast', final]);
    const take = {
        id: rec.take.id, arquivo: rec.take.arquivo, bruto: rec.take.bruto, origem: 'regeracao', regeracao: rec.id, plano: rec.plano,
        deS: rec.deS, ateS: rec.ateS, duracaoS: rec.duracaoS, modelo: rec.modelo, instrucao: rec.instrucao,
        custoUsd: rec.custoUsd ?? null, simulado: Boolean(rec.simulado), criadoEm: new Date().toISOString(),
    };
    await E.atualizarMesa(serie, ep, (m) => {
        const k = String(rec.plano);
        m.takes[k] = [...(m.takes[k] || []).filter((t) => t.id !== take.id), take];
    });
    const novoSeg = {
        id: U.novoId('v'), plano: rec.plano, arquivo: take.arquivo, entradaS: 0, duracaoArquivoS: rec.duracaoS,
        origem: 'take', take: take.id, regeracao: rec.id, mudo: true, volume: 0.6, descricao: rec.instrucao || `Take ${take.id}`,
    };
    await E.atualizarEdicao(serie, ep, (d) => E.substituirTrechoVideo(d, rec.deS, rec.ateS, novoSeg));
    // lote "Gerar vídeo dos planos": o take do plano inteiro vira o take escolhido no planos.json
    if (rec.lote) {
        await require('./producao').registrarTakeNoPlano(serie, ep, take, { escolher: true, jobId: rec.jobId || null, fase: rec.fase || 'final' })
            .catch((e) => require('../log/registro').registrar({ nivel: 'aviso', area: 'edicao', evento: 'take-planos-falhou', serie, ep, msg: `Take ${take.id} não entrou no planos.json: ${e.message}` }));
    }
    await mudarRegeracao(serie, ep, rec.id, { status: 'pronto', etapa: 'pronto', concluidoEm: new Date().toISOString(), segmento: novoSeg.id });
    return take;
}

// Lista das regerações; retoma as que ficaram "gerando" (servidor reiniciou no meio).
async function statusRegeracoes(serie, ep) {
    const mesa = await E.lerMesa(serie, ep);
    for (const r of mesa.regeracoes) if (r.status === 'gerando') acompanhar(serie, ep, r.id);
    const ed = await E.lerEdicao(serie, ep);
    return {
        revisao: ed ? ed.revisao : null,
        regeracoes: mesa.regeracoes.slice(-40).map(vistaRegeracao),
        takes: mesa.takes || {},
    };
}

// ---------------------------------------------------------------- fala
const FAIXAS_FALA = ['narracao', 'falas', 'efeitos'];

function acharItemFala(doc, id) {
    for (const f of FAIXAS_FALA) {
        const it = (doc.faixas[f] || []).find((x) => x.id === id || (x.fala && x.fala === id));
        if (it) return { faixa: f, item: it };
    }
    return null;
}

/**
 * Depois de trocar o áudio de uma fala: as falas seguintes DO MESMO PLANO andam o tanto que ela mudou
 * (ripple), a legenda delas anda junto e a desta fala é recalculada.
 */
function aplicarFalaNova(doc, id, novo) {
    const achado = acharItemFala(doc, id);
    if (!achado) throw U.erro('Fala não encontrada na edição.', 404);
    const it = achado.item;
    const fimAntigo = Number(it.inicioS) + Number(it.duracaoS);
    const delta = U.arred(Number(novo.duracaoS) - Number(it.duracaoS));
    Object.assign(it, novo, { entradaS: 0, duracaoArquivoS: novo.duracaoS });
    const movidos = [];
    if (Math.abs(delta) > 0.001) {
        for (const f of FAIXAS_FALA) {
            for (const x of doc.faixas[f] || []) {
                if (x === it || x.plano !== it.plano || Number(x.inicioS) < fimAntigo - 0.01) continue;
                x.inicioS = U.arred(Math.max(0, Number(x.inicioS) + delta));
                movidos.push(x.id);
            }
        }
        for (const b of doc.legenda || []) if (movidos.includes(b.item)) { b.ini = U.arred(b.ini + delta, 2); b.fim = U.arred(b.fim + delta, 2); }
    }
    E.recalcularLegenda(doc, [it.id]);
    const avisos = [];
    const lim = E.limitesPlanos(doc).find((l) => l.n === it.plano);
    const fimNovo = Number(it.inicioS) + Number(it.duracaoS);
    if (lim && fimNovo > lim.ateS + 0.05) avisos.push(`A fala agora termina em ${fimNovo.toFixed(2).replace('.', ',')} s, depois do fim do plano ${it.plano} (${lim.ateS.toFixed(2).replace('.', ',')} s): estique o vídeo do plano ou encurte o texto.`);
    return { doc, item: it, delta, movidos, avisos };
}

/**
 * regerarFala({ serie, ep, id, intencao, tom, velocidade, volume, texto, textoFalado, executor })
 * Mesma voz; muda intenção/tom/velocidade/volume e/ou o texto (exibido e falado). Grátis (TTS).
 */
async function regerarFala({ serie, ep, id, intencao, tom, velocidade, volume, texto, textoFalado, executor } = {}) {
    const falasMod = require('../audio/falas');
    const P = require('../audio/parametros');
    const cfg = require('../audio/config');
    const c = U.caminhos(serie, ep);
    const doc = await E.lerEdicao(serie, ep);
    if (!doc) throw U.erro('Este episódio ainda não tem edição.', 404);
    const achado = acharItemFala(doc, id);
    if (!achado) throw U.erro('Fala não encontrada na edição.', 404);
    const it = achado.item;
    const serieDados = await U.lerJson(path.join(c.pastaSerie, 'serie.json'), {});
    const quem = String(it.quem || 'narrador').toLowerCase();
    const ficha = /^[a-z0-9-]+$/.test(quem) ? await U.lerJson(path.join(c.pastaSerie, 'elenco', quem, 'ficha.json'), null) : null;
    const vozesCfg = cfg.carregarVozes();
    const tipoPlano = ((doc.planos || []).find((p) => p.n === it.plano) || {}).tipo;
    const vazio = (v) => v === undefined || v === null || String(v).trim() === '';
    const entrada = {
        quem,
        texto: vazio(texto) ? it.texto : String(texto).trim(),
        via: it.via || undefined,
        voz: it.voz || undefined,
        intencao: vazio(intencao) ? (it.intencao || undefined) : intencao,
        ...(vazio(tom) ? {} : { tom: String(tom).trim() }),
        ...(vazio(velocidade) ? {} : { velocidade: String(velocidade).trim() }),
        ...(vazio(volume) ? {} : { volume: Number(volume) }),
    };
    const pronta = falasMod.prepararFala(entrada, { serie: serieDados, ficha, vozesCfg, tipoPlano });
    if (!vazio(textoFalado) && String(textoFalado).trim() !== String(entrada.texto)) {
        // texto falado diferente do exibido (ex.: "7 km" exibido, "sete quilômetros" falado)
        const dic = { pronuncia: serieDados.pronuncia, pronuncia_piper: serieDados.pronuncia_piper };
        const div = P.dividirEmFrases(String(textoFalado).trim());
        const pausas = P.pausasEntreFrases(div, pronta.pausa.entreFrasesS);
        pronta.frases = div.map((f, i) => ({ texto: f.texto, textoFalado: P.aplicarPronuncia(f.texto, pronta.motor, vozesCfg, dic), pausaDepoisS: pausas[i] }));
        pronta.textoFalado = pronta.frases.map((f) => f.textoFalado).join(' ');
    }
    const fala = { id: it.fala || it.id, plano: it.plano, ...pronta };
    await falasMod.gerarAudios([fala], { pastaAudio: path.join(c.pastaEp, 'audio'), tratar: true, serie: serieDados, executor });
    if (fala.status !== 'pronta') throw U.erro(`A fala não foi gerada: ${fala.erro || 'erro no motor'}`, 500);
    const novo = {
        voz: fala.voz, intencao: fala.intencao, tom: fala.tom, velocidade: fala.velocidade, volume: fala.volume, filtro: fala.filtro ?? null,
        frases: (fala.frases || []).map((fr) => ({ texto: fr.texto, pausaDepoisS: U.arred(Number(fr.pausaDepoisS) || 0) })),
        texto: fala.textoExibido, textoFalado: fala.textoFalado, arquivo: U.relativoNaSerie(c.pastaSerie, fala._arq),
        duracaoS: U.arred(fala.duracaoS), palavras: (fala.palavras || []).map((w) => ({ p: w.p, t: U.arred(w.t) })),
        palavrasEstimadas: Boolean(fala.palavrasEstimadas), status: 'pronta', regeradaEm: new Date().toISOString(),
    };
    // tom/velocidade/volume escolhidos à mão ficam marcados: "voz mudou" não confunde com troca de ficha e
    // "Regerar falas com a voz nova" mantém esses ajustes
    const manual = { ...(it.ajusteManual || {}) };
    if (!vazio(tom)) manual.tom = String(tom).trim();
    if (!vazio(velocidade)) manual.velocidade = String(velocidade).trim();
    if (!vazio(volume)) manual.volume = Number(volume);
    if (Object.keys(manual).length) novo.ajusteManual = manual;
    let info = null;
    const r = await E.atualizarEdicao(serie, ep, (d) => {
        info = aplicarFalaNova(d, it.id, novo);
        return info.doc;
    });
    return { ...r, fala: { id: it.id, ...novo }, delta: info.delta, movidos: info.movidos, avisos: info.avisos, doCache: Boolean(fala.doCache) };
}

// ---------------------------------------------------------------- legenda
async function regerarLegenda({ serie, ep, deS = 0, ateS = Infinity } = {}) {
    let ids = [];
    const r = await E.atualizarEdicao(serie, ep, (d) => {
        ids = E.itensDeFala(d).filter((i) => Number(i.inicioS) < Number(ateS) && Number(i.inicioS) + Number(i.duracaoS) > Number(deS)).map((i) => i.id);
        if (!ids.length) throw U.erro('Nenhuma fala no trecho selecionado.');
        E.recalcularLegenda(d, ids);
        return d;
    });
    return { ...r, falas: ids.length };
}

module.exports = {
    ACELERACAO_MAX, duracaoPedida, decidirAjuste, quadroNoTempo, montarPrompt, proximoTake, escolherModelo, cadeiaAjuste,
    cotarTrecho, regerarTrecho, acompanhar, finalizarRegeracao, statusRegeracoes, vistaRegeracao,
    acharItemFala, aplicarFalaNova, regerarFala, regerarLegenda,
};
