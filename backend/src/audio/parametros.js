// Entonação: resolve voz, intenção e os parâmetros de cada fala (tom, velocidade, volume, pausas, filtro).
// Prioridade (docs/AUDIO.md): fala > intenção > papel no projeto > padrão da voz (vozes.json).
//  - tom/velocidade: o valor escrito na FALA é absoluto e vence tudo; senão = base (papel > voz) + ajuste da intenção.
//  - volume: o da fala vence; senão = (papel > voz) × volume da intenção.
//  - pausas e filtro: fala > intenção.
// Tudo é preso ao limite natural (Edge ±10 Hz, Piper ±2 st) com aviso.
const INTENCOES = require('./intencoes.json');

const motorDaVoz = (id) => (String(id).startsWith('piper:') ? 'piper' : 'edge');

function semAcento(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Igual ao narrar.norm: minúsculas, sem acento, só letras e números.
function normalizarPalavra(s) {
    return semAcento(String(s || '').toLowerCase()).replace(/[^\p{L}\p{N}]/gu, '');
}

function resolverIntencao(nome) {
    const chave = semAcento(String(nome || '').trim().toLowerCase());
    if (!chave) return null;
    const id = INTENCOES.intencoes[chave] ? chave : INTENCOES.apelidos[chave] || INTENCOES.apelidos[chave.replace(/[\s-]+/g, '_')]
        || (INTENCOES.intencoes[chave.replace(/[\s-]+/g, '_')] ? chave.replace(/[\s-]+/g, '_') : null);
    if (!id) {
        throw new Error(`Intenção desconhecida: "${nome}". Use: ${Object.keys(INTENCOES.intencoes).join(', ')}`);
    }
    return id;
}

const GENERO_SUSPENSE = /suspense|terror|horror|mist[eé]rio|apocal|thriller|sobreviv|zumbi/i;

// Intenção quando a fala não diz qual: pela via (rádio/telefone/pensamento), pelo tipo do plano (apresentador)
// e, para o narrador em narração, pelo gênero da série (suspense → narração de suspense).
function intencaoPadrao({ via, quem, tipoPlano, genero, intencaoNarrador } = {}) {
    const p = INTENCOES.padraoPorVia;
    const v = String(via || '').toLowerCase();
    if (v && p[v] && v !== 'narracao' && v !== 'em_cena') return p[v];
    if (quem === 'narrador') {
        if (tipoPlano === 'apresentador') return p.apresentador;
        if (intencaoNarrador) return resolverIntencao(intencaoNarrador);
        if (!v || v === 'narracao') return GENERO_SUSPENSE.test(genero || '') ? p.narracaoNarradorSuspense : p.narracao;
    }
    return p[v] || 'neutra';
}

// ---------- tom / velocidade / volume ----------
function lerTom(v) {
    if (v === undefined || v === null || v === '') return null;
    const m = String(v).trim().replace(',', '.').match(/^([+-]?\d+(?:\.\d+)?)\s*(hz|st)$/i);
    if (!m) throw new Error(`Tom inválido: "${v}" (use "+4Hz" no Edge ou "+1st" no Piper)`);
    return { valor: Number(m[1]), unidade: m[2].toLowerCase() === 'hz' ? 'Hz' : 'st' };
}

// Edge fala em Hz e o Piper em semitons; ~6 Hz ≈ 1 semitom numa voz falada (aproximação documentada).
function tomNoMotor(tom, motor) {
    if (!tom) return 0;
    const k = INTENCOES.limites.hzPorSemitom;
    if (motor === 'edge') return tom.unidade === 'Hz' ? tom.valor : tom.valor * k;
    return tom.unidade === 'st' ? tom.valor : tom.valor / k;
}

function lerPorcento(v) {
    if (v === undefined || v === null || v === '') return null;
    const m = String(v).trim().replace(',', '.').match(/^([+-]?\d+(?:\.\d+)?)\s*%$/);
    if (!m) throw new Error(`Velocidade inválida: "${v}" (use "+8%" ou "-12%")`);
    return Number(m[1]);
}

const sinal = (n) => (n >= 0 ? '+' : '-');
const arred = (n, casas) => Math.round(n * 10 ** casas) / 10 ** casas;

// edge-tts só aceita inteiros ("+4Hz", "-7%"); o Piper aceita semitom com decimal.
function formatarTom(valor, motor) {
    if (motor === 'edge') {
        const n = Math.round(valor);
        return `${sinal(n)}${Math.abs(n)}Hz`;
    }
    const n = arred(valor, 1);
    return `${sinal(n)}${Math.abs(n)}st`;
}

function formatarPorcento(valor) {
    const n = Math.round(valor);
    return `${sinal(n)}${Math.abs(n)}%`;
}

const prender = (v, min, max) => Math.min(max, Math.max(min, v));

function presetDaVoz(vozesCfg, id) {
    return (vozesCfg.permitidas || []).find((v) => v.id === id) || {};
}

// ---------- voz ----------
// Ordem: voz escrita na fala > serie.json "vozes"[quem] > ficha do elenco > papel padrão em vozes.json.
// Recusa qualquer voz fora de vozes.json (regra do Rafael: só as vozes recomendadas, todas em português).
function resolverVoz({ quem, vozFala, serie = {}, ficha = null, vozesCfg }) {
    const papeisCasa = Object.fromEntries(Object.entries(vozesCfg.papeis || {}).map(([k, v]) => [k, v.voz]));
    const apelidos = { ...papeisCasa, ...(serie.vozes || {}) };
    let pedido = null;
    let origem = null;
    if (vozFala) [pedido, origem] = [vozFala, 'fala'];
    else if (serie.vozes && serie.vozes[quem]) [pedido, origem] = [serie.vozes[quem], 'papel (serie.json)'];
    else if (ficha && ficha.voz) [pedido, origem] = [ficha.voz, 'papel (ficha do elenco)'];
    else if (papeisCasa[quem]) [pedido, origem] = [papeisCasa[quem], 'voz da casa (vozes.json)'];
    if (!pedido) throw new Error(`Sem voz para "${quem}": defina em serie.json → "vozes" ou na ficha do elenco.`);
    const id = apelidos[pedido] || pedido;
    const permitidas = new Set((vozesCfg.permitidas || []).map((v) => v.id));
    if (!permitidas.has(id)) {
        throw new Error(`Voz "${id}" fora da lista de vozes.json: use só as vozes recomendadas (todas em português): ${[...permitidas].join(', ')}`);
    }
    return { id, origem, motor: motorDaVoz(id) };
}

// ---------- parâmetros finais da fala ----------
// fala = { tom, velocidade, volume, pausa, pausaAntesS, pausaDepoisS, filtro }  (o que veio escrito na fala)
// papel = { tom, velocidade, volume }  (serie.json "tons"/"velocidades"/"volumes"[quem] ou ficha do elenco)
function resolverParametros({ vozId, intencao, fala = {}, papel = {}, vozesCfg }) {
    const motor = motorDaVoz(vozId);
    const I = INTENCOES.intencoes[intencao];
    if (!I) throw new Error(`Intenção desconhecida: ${intencao}`);
    const L = INTENCOES.limites;
    const preset = presetDaVoz(vozesCfg, vozId);
    const origem = {};
    const avisos = [];

    // tom
    let tom;
    const tomFala = lerTom(fala.tom);
    if (tomFala) {
        tom = tomNoMotor(tomFala, motor);
        origem.tom = `fala (${fala.tom})`;
    } else {
        const [baseTxt, fonte] = papel.tom ? [papel.tom, 'papel'] : preset.tom ? [preset.tom, 'voz'] : [null, 'padrão'];
        const base = tomNoMotor(lerTom(baseTxt), motor);
        const ajuste = tomNoMotor(lerTom(I[motor].tom), motor);
        tom = base + ajuste;
        origem.tom = `${fonte} (${baseTxt || '0'}) + intenção ${intencao} (${I[motor].tom})`;
    }
    const limTom = L[motor].tom;
    if (Math.abs(tom) > limTom + 1e-9) {
        avisos.push(`tom ${formatarTom(tom, motor)} passa do limite natural (±${limTom} ${L[motor].unidade}); usado ${formatarTom(Math.sign(tom) * limTom, motor)}`);
        tom = Math.sign(tom) * limTom;
    }

    // velocidade
    let vel;
    const velFala = lerPorcento(fala.velocidade);
    if (velFala !== null) {
        vel = velFala;
        origem.velocidade = `fala (${fala.velocidade})`;
    } else {
        const [baseTxt, fonte] = papel.velocidade ? [papel.velocidade, 'papel'] : preset.velocidade ? [preset.velocidade, 'voz'] : [null, 'padrão'];
        vel = (lerPorcento(baseTxt) || 0) + (lerPorcento(I[motor].velocidade) || 0);
        origem.velocidade = `${fonte} (${baseTxt || '0%'}) + intenção ${intencao} (${I[motor].velocidade})`;
    }
    const [vMin, vMax] = L.velocidade;
    if (vel < vMin || vel > vMax) {
        avisos.push(`velocidade ${formatarPorcento(vel)} fora da faixa natural (${vMin}% a +${vMax}%)`);
        vel = prender(vel, vMin, vMax);
    }

    // volume
    let volume;
    if (fala.volume !== undefined && fala.volume !== null && fala.volume !== '') {
        volume = Number(fala.volume);
        origem.volume = 'fala';
    } else {
        const [base, fonte] = papel.volume !== undefined && papel.volume !== null ? [Number(papel.volume), 'papel']
            : preset.volume !== undefined ? [Number(preset.volume), 'voz'] : [1, 'padrão'];
        volume = base * I.volume;
        origem.volume = `${fonte} (${base}) × intenção ${intencao} (${I.volume})`;
    }
    if (!Number.isFinite(volume)) throw new Error(`Volume inválido: ${fala.volume}`);
    const [volMin, volMax] = L.volume;
    if (volume < volMin || volume > volMax) {
        avisos.push(`volume ${arred(volume, 2)} fora da faixa (${volMin} a ${volMax})`);
        volume = prender(volume, volMin, volMax);
    }

    // pausas ("pausa" na fala = antes, como no motor)
    const num = (v) => (v === undefined || v === null || v === '' ? null : Number(v));
    const antes = num(fala.pausaAntesS) ?? num(fala.pausa);
    const depois = num(fala.pausaDepoisS);
    const pausa = {
        antesS: antes ?? I.pausaAntesS,
        depoisS: depois ?? I.pausaDepoisS,
        entreFrasesS: num(fala.pausaFrasesS) ?? I.pausaFrasesS,
    };
    origem.pausa = antes !== null || depois !== null ? 'fala' : `intenção ${intencao}`;

    // filtro ("" na fala = sem filtro)
    const filtro = typeof fala.filtro === 'string' ? fala.filtro.trim() : I.filtro;
    origem.filtro = typeof fala.filtro === 'string' ? 'fala' : `intenção ${intencao}`;

    return {
        motor,
        tom: formatarTom(tom, motor),
        velocidade: formatarPorcento(vel),
        volume: arred(volume, 3),
        pausa,
        filtro,
        origem,
        avisos,
    };
}

// ---------- pronúncia ----------
// Mesmo algoritmo do narrar.aplicar_pronuncia: vozes.json ("pronuncia" no Edge, "pronuncia_piper" no Piper)
// + o dicionário da série (vence); troca só a palavra inteira; chaves maiores primeiro. Só no texto FALADO.
function aplicarPronuncia(texto, motor, vozesCfg, dicSerie = {}) {
    const chave = motor === 'piper' ? 'pronuncia_piper' : 'pronuncia';
    const dic = { ...(vozesCfg[chave] || {}), ...(dicSerie[chave] || {}) };
    let saida = String(texto);
    for (const de of Object.keys(dic).sort((a, b) => b.length - a.length)) {
        const esc = de.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        saida = saida.replace(new RegExp(`(?<![\\p{L}\\p{N}_])${esc}(?![\\p{L}\\p{N}_])`, 'gu'), () => dic[de]);
    }
    return saida;
}

// ---------- frases (respiro) ----------
const ABREVIACOES = new Set(['dr.', 'dra.', 'sr.', 'sra.', 'srta.', 'ep.', 'prof.', 'profa.', 'av.', 'n.', 'nº.', 'pág.', 'cap.']);
const FIM_FRASE = /(\.\.\.|…|[.!?;:])["'»”)\]]*$/;
const VIRGULA = /[,—–]["'»”)\]]*$/;

function sinalFinal(token) {
    const m = String(token).match(/(\.\.\.|…|[.!?;:,—–])["'»”)\]]*$/);
    if (!m) return '';
    return m[1] === '—' || m[1] === '–' ? ',' : m[1];
}

function cortarNaVirgula(palavras, maxPalavrasFrase) {
    const partes = [];
    let atual = [];
    for (let i = 0; i < palavras.length; i++) {
        atual.push(palavras[i]);
        const resto = palavras.length - i - 1;
        if (VIRGULA.test(palavras[i]) && atual.length >= 4 && resto >= 3) {
            partes.push(atual);
            atual = [];
        } else if (atual.length >= maxPalavrasFrase && resto >= 3) {
            partes.push(atual);
            atual = [];
        }
    }
    if (atual.length) partes.push(atual);
    return partes;
}

// Divide uma fala LONGA em frases para a voz respirar, sem mudar o texto:
// frases.map(f => f.texto).join(' ') === texto com espaços normalizados.
function dividirEmFrases(texto, opcoes = {}) {
    const cfg = { ...INTENCOES.frases, ...opcoes };
    const palavras = String(texto || '').trim().split(/\s+/).filter(Boolean);
    if (!palavras.length) return [];
    if (palavras.length <= cfg.maxPalavras) return [{ texto: palavras.join(' '), pontuacao: sinalFinal(palavras.at(-1)) }];
    let frases = [];
    let atual = [];
    palavras.forEach((p, i) => {
        atual.push(p);
        const abreviacao = ABREVIACOES.has(p.toLowerCase());
        if (FIM_FRASE.test(p) && !abreviacao && i < palavras.length - 1) {
            frases.push(atual);
            atual = [];
        }
    });
    if (atual.length) frases.push(atual);
    frases = frases.flatMap((f) => (f.length > cfg.maxPalavrasFrase ? cortarNaVirgula(f, cfg.maxPalavrasFrase) : [f]));
    return frases.map((f) => ({ texto: f.join(' '), pontuacao: sinalFinal(f.at(-1)) }));
}

// Pausa depois de cada frase (a última não tem): respiro da intenção × fator da pontuação.
function pausasEntreFrases(frases, entreFrasesS) {
    const fatores = INTENCOES.frases.pontuacao;
    return frases.map((f, i) => {
        if (i === frases.length - 1) return 0;
        const fator = fatores[f.pontuacao] ?? 0.5;
        return arred(entreFrasesS * fator, 2);
    });
}

module.exports = {
    INTENCOES, motorDaVoz, normalizarPalavra, resolverIntencao, intencaoPadrao, lerTom, lerPorcento,
    formatarTom, formatarPorcento, tomNoMotor, presetDaVoz, resolverVoz, resolverParametros,
    aplicarPronuncia, dividirEmFrases, pausasEntreFrases, sinalFinal,
};
