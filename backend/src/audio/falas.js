// FALAS do episódio: roteiro.json (planos[].falas: quem/texto/via) → falas.json + um wav por fala.
// Cada fala: voz SÓ de vozes.json, intenção → tom/velocidade/volume/pausas/filtro (parametros.js),
// texto falado com o dicionário de pronúncia, dividida em frases para respirar (sem mudar o texto),
// gerada pelo motor (NarradorVideo/fala_cli.py, cache de TTS em .tmp/cache) e tratada (tratamento.js).
// Cache por hash em episodios/epNN/audio/: mesma fala com os mesmos parâmetros nunca é gerada de novo.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cfg = require('./config');
const P = require('./parametros');
const tratamento = require('./tratamento');
const { chamarFalaCli } = require('./motor');
const registro = require('../log/registro');

// Registro do TTS: quantas falas, quantas do cache, falhas e tempo (nunca o texto inteiro nem o áudio).
function registrarTts(evento, { serie, ep, falas, ms, regerar, tratar }) {
    const falhas = falas.filter((f) => f.status === 'falhou');
    const doCache = falas.filter((f) => f.doCache).length;
    registro.registrar({
        nivel: falhas.length ? 'aviso' : 'info', area: 'audio', evento, serie, ep, ms,
        msg: `${falas.length} fala(s): ${doCache} do cache, ${falas.length - doCache - falhas.length} geradas${falhas.length ? `, ${falhas.length} falharam` : ''}`,
        dados: {
            total: falas.length, doCache, geradas: falas.length - doCache - falhas.length, falhas: falhas.length, regerar, tratar,
            erros: falhas.slice(0, 5).map((f) => ({ id: f.id, quem: f.quem, erro: f.erro })),
            vozes: [...new Set(falas.map((f) => f.voz).filter(Boolean))],
        },
    });
}

const VERSAO_CACHE = 1;
const pad2 = (n) => String(n).padStart(2, '0');
const sha = (obj) => crypto.createHash('sha1').update(JSON.stringify(obj)).digest('hex').slice(0, 16);
const relativo = (base, arq) => path.relative(base, arq).split(path.sep).join('/');
const arred = (n) => Math.round(n * 1000) / 1000;

function carregarSerie(serie) {
    const pasta = cfg.pastaSerie(serie);
    const arq = path.join(pasta, 'serie.json');
    if (!fs.existsSync(arq)) throw new Error(`Série não encontrada: ${serie} (${arq})`);
    return { pasta, dados: cfg.lerJson(arq) };
}

function lerFicha(pastaSerie, quem) {
    if (!pastaSerie || !cfg.SLUG.test(String(quem || ''))) return null;
    return cfg.lerJsonSeExistir(path.join(pastaSerie, 'elenco', quem, 'ficha.json'), null);
}

// Uma fala pronta para gerar (sem tempo ainda). entrada = { quem, texto, via, intencao, voz, tom, velocidade, volume,
// pausa, pausaAntesS, pausaDepoisS, pausaFrasesS, filtro }; ctx = { serie, ficha, vozesCfg, tipoPlano }.
function prepararFala(entrada, { serie = {}, ficha = null, vozesCfg, tipoPlano } = {}) {
    const quem = String(entrada.quem || 'narrador').trim().toLowerCase();
    const textoExibido = String(entrada.texto || '').trim().replace(/\s+/g, ' ');
    if (!textoExibido) throw new Error(`Fala de "${quem}" sem texto`);
    const voz = P.resolverVoz({ quem, vozFala: entrada.voz, serie, ficha, vozesCfg });
    const intencao = entrada.intencao
        ? P.resolverIntencao(entrada.intencao)
        : P.intencaoPadrao({ via: entrada.via, quem, tipoPlano, genero: serie.genero, intencaoNarrador: serie.audio && serie.audio.intencaoNarrador });
    const papel = {
        tom: (serie.tons && serie.tons[quem]) || (ficha && ficha.tom) || null,
        velocidade: (serie.velocidades && serie.velocidades[quem]) || null,
        volume: serie.volumes && serie.volumes[quem] !== undefined ? serie.volumes[quem] : null,
    };
    const par = P.resolverParametros({ vozId: voz.id, intencao, fala: entrada, papel, vozesCfg });
    const dicSerie = { pronuncia: serie.pronuncia, pronuncia_piper: serie.pronuncia_piper };
    const divididas = P.dividirEmFrases(textoExibido);
    const pausas = P.pausasEntreFrases(divididas, par.pausa.entreFrasesS);
    const frases = divididas.map((f, i) => ({
        texto: f.texto,
        textoFalado: P.aplicarPronuncia(f.texto, voz.motor, vozesCfg, dicSerie),
        pausaDepoisS: pausas[i],
    }));
    // O volume padrão da voz em vozes.json (Cadu 1,3) só compensa o nível cru do motor; depois da
    // normalização por fala ele sobraria. O alvo de loudness usa o volume RELATIVO a esse padrão.
    const volumePadraoVoz = Number(P.presetDaVoz(vozesCfg, voz.id).volume) || 1;
    return {
        quem,
        via: entrada.via || null,
        voz: voz.id,
        motor: voz.motor,
        intencao,
        textoExibido,
        textoFalado: frases.map((f) => f.textoFalado).join(' '),
        frases,
        tom: par.tom,
        velocidade: par.velocidade,
        volume: par.volume,
        volumeAlvo: Math.round((par.volume / volumePadraoVoz) * 1000) / 1000,
        pausa: par.pausa,
        filtro: par.filtro,
        origem: { voz: voz.origem, ...par.origem },
        avisos: par.avisos,
    };
}

// Roteiro → lista de falas (função pura: não gera áudio).
function montarFalas({ roteiro, serie = {}, fichas = {}, vozesCfg }) {
    const falas = [];
    for (const plano of roteiro.planos || []) {
        (plano.falas || []).forEach((f, k) => {
            const ficha = fichas[String(f.quem || '').toLowerCase()] || null;
            const pronta = prepararFala(f, { serie, ficha, vozesCfg, tipoPlano: plano.tipo });
            falas.push({ id: `p${pad2(plano.n)}-f${pad2(k + 1)}`, plano: plano.n, ordem: falas.length + 1, ...pronta });
        });
    }
    return falas;
}

// Início/fim de cada fala no episódio: começa no plano (deS + pausa antes) e nunca encosta na anterior
// (fim anterior + pausa depois dela + pausa antes desta). Avisa quando a fala passa do fim do plano.
function calcularLinhaDoTempo(falas, planos = [], duracaoAlvoS = 0) {
    const porPlano = new Map(planos.map((p) => [p.n, p]));
    const avisos = [];
    let anterior = null;
    for (const f of falas) {
        const plano = porPlano.get(f.plano) || {};
        const primeira = !anterior || anterior.plano !== f.plano;
        const pelaAnterior = anterior ? anterior.fimS + anterior.pausa.depoisS + f.pausa.antesS : 0;
        const peloPlano = primeira && plano.deS !== undefined ? Number(plano.deS) + f.pausa.antesS : 0;
        f.inicioS = arred(Math.max(pelaAnterior, peloPlano, primeira && !anterior ? f.pausa.antesS : 0));
        f.fimS = arred(f.inicioS + (f.duracaoS || 0));
        if (plano.ateS !== undefined && f.fimS > Number(plano.ateS) + 0.05) {
            avisos.push(`${f.id} (${f.quem}) termina em ${f.fimS.toFixed(2)} s, depois do fim do plano ${f.plano} (${plano.ateS} s): encurte o texto ou aumente o plano`);
        }
        anterior = f;
    }
    const fim = anterior ? anterior.fimS + anterior.pausa.depoisS : 0;
    return { duracaoS: arred(Math.max(Number(duracaoAlvoS) || 0, fim)), fimFalasS: arred(fim), avisos };
}

function chaves(fala, { tratar, serie }) {
    const bruto = sha({
        v: VERSAO_CACHE, voz: fala.voz, frases: fala.frases.map((f) => [f.textoFalado, f.pausaDepoisS]),
        tom: fala.tom, velocidade: fala.velocidade, volume: fala.volume, filtro: fala.filtro,
        pronuncia: [serie.pronuncia || null, serie.pronuncia_piper || null],
    });
    if (!tratar) return { bruto, final: `${bruto}.bruto` };
    const final = sha({ bruto, alvo: tratamento.ALVO_FALA_LUFS, eq: tratamento.cadeiaDialogo(), volume: fala.volumeAlvo });
    return { bruto, final };
}

function pedidoMotor(fala, saida, serie = {}) {
    return {
        voz: fala.voz,
        frases: fala.frases.map((f) => ({ texto: f.texto, pausa_depois: f.pausaDepoisS })),
        tom: fala.tom,
        velocidade: fala.velocidade,
        volume: fala.volume,
        filtro: fala.filtro,
        saida,
        ...(serie.pronuncia ? { pronuncia: serie.pronuncia } : {}),
        ...(serie.pronuncia_piper ? { pronuncia_piper: serie.pronuncia_piper } : {}),
    };
}

// Gera (ou acha no cache) o áudio de uma lista de falas numa pasta. executor = chamarFalaCli (trocável nos testes).
async function gerarAudios(falas, { pastaAudio, tratar = true, regerar = false, serie = {}, executor = chamarFalaCli } = {}) {
    fs.mkdirSync(pastaAudio, { recursive: true });
    const pendentes = [];
    for (const f of falas) {
        const h = chaves(f, { tratar, serie });
        f.hash = h.final;
        f._arqBruto = path.join(pastaAudio, `${h.bruto}.bruto.wav`);
        f._metaBruto = path.join(pastaAudio, `${h.bruto}.bruto.json`);
        f._arq = tratar ? path.join(pastaAudio, `${h.final}.wav`) : f._arqBruto;
        f._meta = tratar ? path.join(pastaAudio, `${h.final}.json`) : f._metaBruto;
        if (!regerar && fs.existsSync(f._arq) && fs.existsSync(f._meta)) {
            Object.assign(f, cfg.lerJson(f._meta).resultado, { status: 'pronta', doCache: true });
            continue;
        }
        f.doCache = false;
        if (regerar || !fs.existsSync(f._arqBruto) || !fs.existsSync(f._metaBruto)) pendentes.push(f);
    }

    if (pendentes.length) {
        const resp = await executor({ acao: 'lote', itens: pendentes.map((f) => pedidoMotor(f, f._arqBruto, serie)) });
        pendentes.forEach((f, i) => {
            const r = (resp.itens || [])[i] || { ok: false, erro: 'sem resposta do motor' };
            if (!r.ok) {
                f.status = 'falhou';
                f.erro = r.erro;
                return;
            }
            cfg.gravarJson(f._metaBruto, {
                versao: 1, voz: r.voz, duracaoS: r.duracao, textoFalado: r.texto_falado,
                palavras: r.palavras.map((w) => ({ p: w.p, t: w.t })), frases: r.frases, estimado: Boolean(r.estimado),
            });
        });
    }

    for (const f of falas) {
        if (f.status === 'falhou' || f.status === 'pronta') continue;
        const bruto = cfg.lerJson(f._metaBruto);
        const resultado = {
            duracaoS: arred(bruto.duracaoS),
            textoFalado: bruto.textoFalado || f.textoFalado,
            palavras: bruto.palavras,
            palavrasEstimadas: Boolean(bruto.estimado),
            tempoFrases: bruto.frases,
            tratamento: null,
        };
        if (tratar) {
            const t = await tratamento.normalizarFala(f._arqBruto, f._arq, { volume: f.volumeAlvo ?? f.volume });
            resultado.tratamento = { medidoLufs: t.medidoLufs, alvoLufs: t.alvoLufs, ganhoDb: t.ganhoDb, cadeia: t.cadeia };
        }
        cfg.gravarJson(f._meta, { versao: 1, hash: f.hash, resultado });
        Object.assign(f, resultado, { status: 'pronta' });
    }
    return falas;
}

function limparInternos(f, pastaBase) {
    const limpo = { ...f };
    limpo.arquivo = f.status === 'pronta' ? relativo(pastaBase, f._arq) : null;
    limpo.arquivoBruto = fs.existsSync(f._arqBruto) ? relativo(pastaBase, f._arqBruto) : null;
    for (const k of Object.keys(limpo)) if (k.startsWith('_')) delete limpo[k];
    return limpo;
}

// Gera as falas do episódio e grava episodios/epNN/falas.json (caminhos relativos à pasta da série).
async function gerarFalasEpisodio(serieId, episodio, { regerar = false, tratar = true, executor } = {}) {
    const { pasta: pastaSerie, dados: serie } = carregarSerie(serieId);
    const epId = cfg.idEpisodio(episodio);
    const pastaEp = cfg.pastaEpisodio(serieId, epId);
    const arqRoteiro = path.join(pastaEp, 'roteiro.json');
    if (!fs.existsSync(arqRoteiro)) throw new Error(`Roteiro não encontrado: ${arqRoteiro}`);
    const roteiro = cfg.lerJson(arqRoteiro);
    const vozesCfg = cfg.carregarVozes();

    const fichas = {};
    for (const plano of roteiro.planos || []) {
        for (const f of plano.falas || []) {
            const quem = String(f.quem || '').toLowerCase();
            if (!(quem in fichas)) fichas[quem] = lerFicha(pastaSerie, quem);
        }
    }
    const falas = montarFalas({ roteiro, serie, fichas, vozesCfg });
    const fim = registro.cronometro();
    try {
        await gerarAudios(falas, { pastaAudio: path.join(pastaEp, 'audio'), tratar, regerar, serie, executor });
    } catch (e) {
        registro.registrar({ nivel: 'erro', area: 'audio', evento: 'falas-falhou', serie: serieId, ep: epId, ms: fim(), msg: `TTS das falas falhou: ${e.message}`, erro: e, dados: { total: falas.length } });
        throw e;
    }
    registrarTts('falas', { serie: serieId, ep: epId, falas, ms: fim(), regerar, tratar });
    const prontas = falas.filter((f) => f.status === 'pronta');
    const linha = calcularLinhaDoTempo(prontas, roteiro.planos || [], roteiro.duracaoAlvoS);

    const doc = {
        versao: 1,
        serie: serieId,
        episodio: epId,
        geradoEm: new Date().toISOString(),
        tratamento: tratar ? { alvoFalaLufs: tratamento.ALVO_FALA_LUFS, dialogo: tratamento.cadeiaDialogo(), master: tratamento.cadeiaMaster() } : null,
        duracaoS: linha.duracaoS,
        fimFalasS: linha.fimFalasS,
        falas: falas.map((f) => limparInternos(f, pastaSerie)),
        avisos: [...falas.flatMap((f) => (f.avisos || []).map((a) => `${f.id}: ${a}`)), ...linha.avisos],
    };
    const arquivo = path.join(pastaEp, 'falas.json');
    cfg.gravarJson(arquivo, doc);
    return { arquivo, doc };
}

// Uma fala avulsa (ouvir/testar): mesma resolução de voz/intenção/parâmetros; sem série = só vozes da casa.
async function gerarFalaAvulsa(entrada, { serie: serieId, tratar = true, executor } = {}) {
    let serie = {};
    let ficha = null;
    let pastaAudio = path.join(cfg.raizDados(), 'previas', 'audio');
    if (serieId) {
        const s = carregarSerie(serieId);
        serie = s.dados;
        ficha = lerFicha(s.pasta, String(entrada.quem || 'narrador').toLowerCase());
        pastaAudio = path.join(s.pasta, 'audio', 'previas');
    }
    const fala = { id: 'previa', ...prepararFala(entrada, { serie, ficha, vozesCfg: cfg.carregarVozes(), tipoPlano: entrada.tipoPlano }) };
    const fim = registro.cronometro();
    await gerarAudios([fala], { pastaAudio, tratar, serie, executor });
    registrarTts('fala-avulsa', { serie: serieId, falas: [fala], ms: fim(), tratar });
    if (fala.status !== 'pronta') throw new Error(fala.erro || 'falha ao gerar a fala');
    const limpo = limparInternos(fala, pastaAudio);
    return { ...limpo, arquivo: fala._arq, arquivoBruto: fala._arqBruto };
}

function lerFalasEpisodio(serieId, episodio) {
    const arq = path.join(cfg.pastaEpisodio(serieId, episodio), 'falas.json');
    if (!fs.existsSync(arq)) throw new Error(`falas.json não encontrado: gere as falas primeiro (${arq})`);
    return { arquivo: arq, doc: cfg.lerJson(arq), pastaSerie: cfg.pastaSerie(serieId) };
}

module.exports = {
    prepararFala, montarFalas, calcularLinhaDoTempo, gerarAudios, gerarFalasEpisodio, gerarFalaAvulsa,
    lerFalasEpisodio, pedidoMotor, carregarSerie,
};
