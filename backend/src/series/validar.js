// Validação dos JSON do CONTRATOS (docs/CONTRATOS.md). Funções PURAS: não leem disco nem rede.
// Cada validador devolve { ok, erros: [], avisos: [] } com mensagens em português.
// Erro = o arquivo não pode ser gravado assim. Aviso = grava, mas vale revisar.

const ETAPAS = ['ideia', 'biblia', 'roteiro', 'elenco', 'decupagem', 'geracao', 'audio', 'montagem', 'votacao', 'publicado'];
const TIPOS_PLANO = ['video_ia', 'apresentador', 'grafico', 'reaproveitar'];
const VIAS = ['narracao', 'radio', 'telefone', 'em_cena'];
const FALANTES_FIXOS = ['narrador', 'alerta'];
const TIPOS_FICHA = ['personagem', 'local', 'objeto'];
const ORIGENS_FICHA = ['importada', 'gerada'];
const ORIGENS_QUADRO = ['imagem_ia', 'ref', 'ultimo_quadro'];
const FASES_TAKE = ['rascunho', 'final'];
const STATUS_TAKE = ['pendente', 'pronto', 'falhou'];
const FONTES_VOTACAO = ['manual', 'youtube'];
const VENCEDORAS = ['A', 'B', 'empate'];

// Só as vozes recomendadas pelo Rafael (NarradorVideo/vozes.json), todas falando português.
const VOZES_PERMITIDAS = [
    'de-DE-FlorianMultilingualNeural',
    'pt-BR-ThalitaMultilingualNeural',
    'piper:pt_BR-cadu-medium',
    'en-AU-WilliamMultilingualNeural',
    'en-US-AndrewMultilingualNeural',
    'fr-FR-RemyMultilingualNeural',
    'it-IT-GiuseppeMultilingualNeural',
    'ko-KR-HyunsuMultilingualNeural',
];

const PLANO_MIN_S = 2;
const PLANO_MAX_S = 10;
const TOLERANCIA_DURACAO_S = 3;
const PALAVRAS_POR_8S = 15; // "~15 palavras por 8 s": acima disso é aviso...
const FATOR_PALAVRAS_ERRO = 1.5; // ...e acima de 1,5x isso (≈ 2,8 palavras/s) não cabe nem acelerando: erro.

const DURACAO_MIN_S = 1;
const DURACAO_MAX_S = 600;

// Tolerância da soma dos planos: ±3 s num episódio de 60 s, mas proporcional nos curtos (5 s → ±0,5 s).
function toleranciaDuracao(alvo) {
    const a = Number(alvo);
    if (!Number.isFinite(a) || a <= 0) return TOLERANCIA_DURACAO_S;
    return Math.min(TOLERANCIA_DURACAO_S, Math.max(0.5, Math.round(a * 0.1 * 10) / 10));
}

const RE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RE_TOM = /^[+-]\d+(?:\.\d+)?(?:Hz|st)$/;

function ehSlug(texto) {
    return typeof texto === 'string' && texto.length <= 80 && RE_SLUG.test(texto);
}

function ehObjeto(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function ehTexto(v) {
    return typeof v === 'string' && v.trim() !== '';
}

function ehNumero(v) {
    return typeof v === 'number' && Number.isFinite(v);
}

function ehInteiro(v, min = 0) {
    return Number.isInteger(v) && v >= min;
}

// Caminho de mídia relativo à pasta da série (ou da ficha): sem letra de unidade, sem "..", sem barra inicial.
function caminhoRelativoSeguro(caminho) {
    if (typeof caminho !== 'string' || caminho.trim() === '') return false;
    if (/^[a-zA-Z]:/.test(caminho) || caminho.startsWith('/') || caminho.startsWith('\\')) return false;
    if (caminho.includes('\0')) return false;
    return !caminho.split(/[\\/]+/).some((parte) => parte === '..');
}

function contarPalavras(texto) {
    if (typeof texto !== 'string') return 0;
    return (texto.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || []).length;
}

function normalizarTexto(texto) {
    return String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function fmt(n) {
    return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100).replace('.', ',');
}

function novoResultado() {
    return { ok: true, erros: [], avisos: [] };
}

function fechar(r) {
    r.ok = r.erros.length === 0;
    return r;
}

function checarVersao(obj, r, nome) {
    if (obj.versao !== 1) r.erros.push(`${nome}: "versao" deve ser 1.`);
}

// ---------- serie.json ----------
function validarSerie(s) {
    const r = novoResultado();
    if (!ehObjeto(s)) return fechar({ ...r, erros: ['serie.json precisa ser um objeto.'] });
    checarVersao(s, r, 'serie.json');
    if (!ehSlug(s.id)) r.erros.push('serie.json: "id" deve ser minúsculo, sem acento, com hífens (ex.: o-ultimo-farol).');
    if (!ehTexto(s.titulo)) r.erros.push('serie.json: falta o "titulo".');
    if (s.genero !== undefined && typeof s.genero !== 'string') r.erros.push('serie.json: "genero" deve ser texto.');
    if (s.idioma !== 'pt-BR') r.avisos.push('serie.json: o idioma da casa é "pt-BR".');
    if (!ehObjeto(s.formato) || !ehInteiro(s.formato.largura, 1) || !ehInteiro(s.formato.altura, 1)) {
        r.erros.push('serie.json: "formato" precisa de largura e altura inteiras (ex.: 1080 x 1920).');
    }
    if (!ehNumero(s.duracaoAlvoS) || s.duracaoAlvoS <= 0) r.erros.push('serie.json: "duracaoAlvoS" deve ser um número positivo.');
    if (s.orcamento !== undefined) {
        if (!ehObjeto(s.orcamento)) r.erros.push('serie.json: "orcamento" deve ser um objeto.');
        else {
            for (const k of ['tetoPlanoUsd', 'tetoEpisodioUsd', 'tetoSerieUsd']) {
                const v = s.orcamento[k];
                if (v !== undefined && (!ehNumero(v) || v < 0)) r.erros.push(`serie.json: orcamento.${k} deve ser um número ≥ 0 (US$).`);
            }
        }
    }
    if (s.vozes !== undefined) {
        if (!ehObjeto(s.vozes)) r.erros.push('serie.json: "vozes" deve ser um objeto { papel: voz }.');
        else {
            for (const [papel, voz] of Object.entries(s.vozes)) {
                if (!VOZES_PERMITIDAS.includes(voz)) r.erros.push(`serie.json: a voz "${voz}" (${papel}) não está na lista recomendada (vozes.json).`);
            }
        }
    }
    if (s.tons !== undefined) {
        if (!ehObjeto(s.tons)) r.erros.push('serie.json: "tons" deve ser um objeto { papel: tom }.');
        else {
            for (const [papel, tom] of Object.entries(s.tons)) {
                if (!RE_TOM.test(String(tom))) r.erros.push(`serie.json: tom "${tom}" (${papel}) inválido; use "+2Hz", "-6Hz" ou "+1st".`);
            }
        }
    }
    if (!ETAPAS.includes(s.etapa)) r.erros.push(`serie.json: "etapa" deve ser uma de: ${ETAPAS.join(', ')}.`);
    if (!Array.isArray(s.episodios)) r.erros.push('serie.json: "episodios" deve ser uma lista.');
    else {
        const vistos = new Set();
        s.episodios.forEach((ep, i) => {
            const rot = `serie.json: episódio ${i + 1}`;
            if (!ehObjeto(ep)) { r.erros.push(`${rot} precisa ser um objeto.`); return; }
            if (!ehInteiro(ep.n, 1)) r.erros.push(`${rot}: "n" deve ser inteiro ≥ 1.`);
            else if (vistos.has(ep.n)) r.erros.push(`${rot}: número ${ep.n} repetido.`);
            vistos.add(ep.n);
            if (ehInteiro(ep.n, 1) && ep.id !== `ep${String(ep.n).padStart(2, '0')}`) r.erros.push(`${rot}: "id" deve ser "ep${String(ep.n).padStart(2, '0')}".`);
            if (typeof ep.titulo !== 'string') r.erros.push(`${rot}: "titulo" deve ser texto.`);
            if (!ETAPAS.includes(ep.status)) r.erros.push(`${rot}: "status" deve ser uma de: ${ETAPAS.join(', ')}.`);
        });
    }
    return fechar(r);
}

// ---------- biblia.json ----------
function validarBiblia(b) {
    const r = novoResultado();
    if (!ehObjeto(b)) return fechar({ ...r, erros: ['biblia.json precisa ser um objeto.'] });
    checarVersao(b, r, 'biblia.json');
    if (typeof b.premissa !== 'string') r.erros.push('biblia.json: "premissa" deve ser texto.');
    const listaDeTextos = (campo) => {
        if (!Array.isArray(b[campo])) r.erros.push(`biblia.json: "${campo}" deve ser uma lista.`);
        else if (b[campo].some((x) => typeof x !== 'string')) r.erros.push(`biblia.json: "${campo}" deve conter só textos.`);
    };
    listaDeTextos('regras');
    listaDeTextos('misterios');
    if (!Array.isArray(b.cronologia)) r.erros.push('biblia.json: "cronologia" deve ser uma lista.');
    else b.cronologia.forEach((c, i) => {
        if (!ehObjeto(c) || !ehInteiro(c.ep, 1) || typeof c.evento !== 'string') r.erros.push(`biblia.json: cronologia ${i + 1} precisa de { ep, evento }.`);
    });
    if (!ehObjeto(b.recursos)) r.erros.push('biblia.json: "recursos" deve ser um objeto.');
    if (!Array.isArray(b.objetos)) r.erros.push('biblia.json: "objetos" deve ser uma lista.');
    else b.objetos.forEach((o, i) => {
        if (!ehObjeto(o) || !ehSlug(o.id)) r.erros.push(`biblia.json: objeto ${i + 1} precisa de "id" em minúsculas com hífens.`);
    });
    if (!Array.isArray(b.personagens)) r.erros.push('biblia.json: "personagens" deve ser uma lista.');
    else b.personagens.forEach((p, i) => {
        if (!ehObjeto(p) || !ehSlug(p.id)) r.erros.push(`biblia.json: personagem ${i + 1} precisa de "id" em minúsculas com hífens.`);
        else if (p.sabe !== undefined && !Array.isArray(p.sabe)) r.erros.push(`biblia.json: personagem "${p.id}": "sabe" deve ser uma lista.`);
    });
    if (!ehObjeto(b.segredos) || !Array.isArray(b.segredos.personagens) || !Array.isArray(b.segredos.publico)) {
        r.erros.push('biblia.json: "segredos" precisa de { personagens: [], publico: [] }.');
    }
    if (!Array.isArray(b.escolhas)) r.erros.push('biblia.json: "escolhas" deve ser uma lista.');
    else b.escolhas.forEach((e, i) => {
        const rot = `biblia.json: escolha ${i + 1}`;
        if (!ehObjeto(e) || !ehInteiro(e.ep, 1)) { r.erros.push(`${rot} precisa de "ep".`); return; }
        if (e.vencedora !== null && e.vencedora !== undefined && !VENCEDORAS.includes(e.vencedora)) r.erros.push(`${rot}: "vencedora" deve ser A, B, empate ou null.`);
        if (e.votos !== undefined && (!ehObjeto(e.votos) || !ehInteiro(e.votos.A) || !ehInteiro(e.votos.B))) r.erros.push(`${rot}: "votos" precisa de A e B inteiros ≥ 0.`);
        else if (e.vencedora && e.votos && e.vencedora !== calcularVencedora(e.votos.A, e.votos.B)) r.erros.push(`${rot}: "vencedora" não bate com os votos.`);
    });
    if (!Array.isArray(b.temporada)) r.erros.push('biblia.json: "temporada" deve ser uma lista.');
    else b.temporada.forEach((t, i) => {
        const rot = `biblia.json: temporada ${i + 1}`;
        if (!ehObjeto(t) || !ehInteiro(t.n, 1)) { r.erros.push(`${rot} precisa de "n".`); return; }
        if (typeof t.titulo !== 'string') r.erros.push(`${rot}: "titulo" deve ser texto.`);
        if (t.status !== undefined && !ETAPAS.includes(t.status)) r.erros.push(`${rot}: "status" deve ser uma de: ${ETAPAS.join(', ')}.`);
    });
    return fechar(r);
}

// ---------- elenco/locais/objetos: ficha.json ----------
function validarFicha(f) {
    const r = novoResultado();
    if (!ehObjeto(f)) return fechar({ ...r, erros: ['ficha.json precisa ser um objeto.'] });
    const nome = `ficha "${f.id || '?'}"`;
    checarVersao(f, r, nome);
    if (!ehSlug(f.id)) r.erros.push(`${nome}: "id" deve ser minúsculo, sem acento, com hífens.`);
    if (!TIPOS_FICHA.includes(f.tipo)) r.erros.push(`${nome}: "tipo" deve ser personagem, local ou objeto.`);
    if (!ehTexto(f.nome)) r.erros.push(`${nome}: falta o "nome".`);
    for (const campo of ['papel', 'ancora']) {
        if (f[campo] !== undefined && typeof f[campo] !== 'string') r.erros.push(`${nome}: "${campo}" deve ser texto.`);
    }
    if (!ehTexto(f.ancora)) r.avisos.push(`${nome}: sem "ancora" (aparência fixa), o visual pode mudar de um clipe para outro.`);
    if (f.tipo === 'personagem') {
        if (f.voz !== undefined && f.voz !== null && !VOZES_PERMITIDAS.includes(f.voz)) {
            r.erros.push(`${nome}: a voz "${f.voz}" não está na lista recomendada (vozes.json).`);
        }
        if (f.tom !== undefined && f.tom !== null && !RE_TOM.test(String(f.tom))) r.erros.push(`${nome}: tom "${f.tom}" inválido; use "+2Hz", "-4Hz" ou "+1st".`);
    }
    if (f.tipo === 'objeto' && f.onde !== undefined && typeof f.onde !== 'string') r.erros.push(`${nome}: "onde" deve ser texto.`);
    if (!Array.isArray(f.estados)) r.erros.push(`${nome}: "estados" deve ser uma lista.`);
    else {
        const ids = new Set();
        f.estados.forEach((e, i) => {
            const rot = `${nome}, estado ${i + 1}`;
            if (!ehObjeto(e)) { r.erros.push(`${rot} precisa ser um objeto.`); return; }
            if (!ehSlug(e.id)) r.erros.push(`${rot}: "id" deve ser minúsculo com hífens (ex.: padrao, ferida).`);
            else if (ids.has(e.id)) r.erros.push(`${rot}: estado "${e.id}" repetido.`);
            ids.add(e.id);
            if (e.refs !== undefined) {
                if (!ehObjeto(e.refs)) r.erros.push(`${rot}: "refs" deve ser um objeto { vista: caminho }.`);
                else for (const [vista, cam] of Object.entries(e.refs)) {
                    if (!caminhoRelativoSeguro(cam)) r.erros.push(`${rot}: referência "${vista}" precisa de caminho relativo à ficha (ex.: ref/padrao-frente.png).`);
                }
            }
        });
        if (f.estados.length && !ids.has(f.estadoAtual)) r.erros.push(`${nome}: "estadoAtual" deve ser um dos estados (${[...ids].join(', ')}).`);
    }
    if (f.canonica !== null && f.canonica !== undefined && !caminhoRelativoSeguro(f.canonica)) {
        r.erros.push(`${nome}: "canonica" precisa de caminho relativo à ficha (ex.: ref/padrao-frente.png).`);
    }
    if (!ORIGENS_FICHA.includes(f.origem)) r.erros.push(`${nome}: "origem" deve ser importada ou gerada.`);
    if (f.candidatas !== undefined) {
        if (!Array.isArray(f.candidatas)) r.erros.push(`${nome}: "candidatas" deve ser uma lista.`);
        else f.candidatas.forEach((c, i) => {
            if (!ehObjeto(c) || !caminhoRelativoSeguro(c.caminho)) r.erros.push(`${nome}: candidata ${i + 1} precisa de "caminho" relativo.`);
        });
    }
    return fechar(r);
}

// ---------- episodios/epNN/roteiro.json ----------
// ctx (opcional): { elenco: [ids com ficha], locais: [ids], objetos: [ids] }.
// Sem ctx.elenco, não dá para conferir se o "quem" existe (só se está preenchido).
function validarRoteiro(rot, ctx = {}) {
    const r = novoResultado();
    if (!ehObjeto(rot)) return fechar({ ...r, erros: ['roteiro.json precisa ser um objeto.'] });
    checarVersao(rot, r, 'roteiro');
    if (!ehInteiro(rot.n, 1)) r.erros.push('roteiro: "n" (número do episódio) deve ser inteiro ≥ 1.');
    if (!ehTexto(rot.titulo)) r.erros.push('roteiro: falta o "titulo".');
    for (const campo of ['objetivo', 'resumo', 'gancho']) {
        if (rot[campo] !== undefined && typeof rot[campo] !== 'string') r.erros.push(`roteiro: "${campo}" deve ser texto.`);
    }
    const alvo = rot.duracaoAlvoS;
    if (!ehNumero(alvo) || alvo <= 0) r.erros.push('roteiro: "duracaoAlvoS" deve ser um número positivo (ex.: 60).');
    const tolerancia = toleranciaDuracao(alvo);
    const minPlanoS = ehNumero(alvo) && alvo > 0 ? Math.min(PLANO_MIN_S, alvo) : PLANO_MIN_S;

    const conhecidos = Array.isArray(ctx.elenco) ? new Set([...ctx.elenco, ...FALANTES_FIXOS]) : null;
    const locais = Array.isArray(ctx.locais) ? new Set(ctx.locais) : null;
    const objetos = Array.isArray(ctx.objetos) ? new Set(ctx.objetos) : null;
    const elencoFichas = Array.isArray(ctx.elenco) ? new Set(ctx.elenco) : null;

    if (!Array.isArray(rot.planos) || rot.planos.length === 0) {
        r.erros.push('roteiro: "planos" deve ser uma lista com pelo menos um plano.');
    } else {
        let soma = 0;
        let somaValida = true;
        let anterior = null;
        rot.planos.forEach((p, i) => {
            const rotulo = `plano ${ehObjeto(p) && p.n !== undefined ? p.n : i + 1}`;
            if (!ehObjeto(p)) { r.erros.push(`${rotulo}: precisa ser um objeto.`); somaValida = false; return; }
            if (!ehInteiro(p.n, 1)) r.erros.push(`${rotulo}: "n" deve ser inteiro ≥ 1.`);
            else if (p.n !== i + 1) r.avisos.push(`${rotulo}: está na posição ${i + 1}; a numeração deveria ser sequencial.`);
            let dur = null;
            if (!ehNumero(p.deS) || !ehNumero(p.ateS)) {
                r.erros.push(`${rotulo}: "deS" e "ateS" devem ser números (segundos).`);
                somaValida = false;
            } else if (p.ateS <= p.deS) {
                r.erros.push(`${rotulo}: "ateS" (${fmt(p.ateS)}) deve ser maior que "deS" (${fmt(p.deS)}).`);
                somaValida = false;
            } else {
                dur = p.ateS - p.deS;
                soma += dur;
                if (dur < minPlanoS || dur > PLANO_MAX_S) {
                    r.erros.push(`${rotulo}: dura ${fmt(dur)} s; cada plano deve ter de ${fmt(minPlanoS)} a ${PLANO_MAX_S} s.`);
                }
                if (anterior === null && p.deS !== 0) r.avisos.push(`${rotulo}: o primeiro plano deveria começar em 0 s.`);
                if (anterior !== null && ehNumero(anterior.ateS) && p.deS !== anterior.ateS) {
                    r.avisos.push(`${rotulo}: começa em ${fmt(p.deS)} s, mas o anterior termina em ${fmt(anterior.ateS)} s.`);
                }
            }
            anterior = p;
            if (!TIPOS_PLANO.includes(p.tipo)) r.erros.push(`${rotulo}: "tipo" deve ser um de: ${TIPOS_PLANO.join(', ')}.`);
            if (p.local !== undefined && p.local !== null && typeof p.local !== 'string') r.erros.push(`${rotulo}: "local" deve ser texto (id do local).`);
            else if (locais && ehTexto(p.local) && !locais.has(p.local)) r.avisos.push(`${rotulo}: o local "${p.local}" ainda não tem ficha.`);
            for (const campo of ['elenco', 'objetos']) {
                if (p[campo] === undefined) continue;
                if (!Array.isArray(p[campo]) || p[campo].some((x) => typeof x !== 'string')) {
                    r.erros.push(`${rotulo}: "${campo}" deve ser uma lista de ids.`);
                    continue;
                }
                const conjunto = campo === 'elenco' ? elencoFichas : objetos;
                if (conjunto) for (const id of p[campo]) {
                    if (!conjunto.has(id)) r.avisos.push(`${rotulo}: "${id}" (${campo}) ainda não tem ficha.`);
                }
            }
            if (p.falas === undefined) return;
            if (!Array.isArray(p.falas)) { r.erros.push(`${rotulo}: "falas" deve ser uma lista.`); return; }
            let palavras = 0;
            const falantes = new Set();
            p.falas.forEach((fala, j) => {
                const rf = `${rotulo}, fala ${j + 1}`;
                if (!ehObjeto(fala)) { r.erros.push(`${rf}: precisa ser um objeto { quem, texto, via }.`); return; }
                if (!ehTexto(fala.quem)) r.erros.push(`${rf}: falta "quem" fala.`);
                else {
                    falantes.add(fala.quem);
                    if (conhecidos && !conhecidos.has(fala.quem)) {
                        r.erros.push(`${rf}: "${fala.quem}" não existe no elenco (use um personagem com ficha, "narrador" ou "alerta").`);
                    }
                }
                if (!ehTexto(fala.texto)) r.erros.push(`${rf}: falta o "texto".`);
                else palavras += contarPalavras(fala.texto);
                if (!VIAS.includes(fala.via)) r.erros.push(`${rf}: "via" deve ser uma de: ${VIAS.join(', ')}.`);
            });
            if (falantes.size > 1) r.avisos.push(`${rotulo}: ${falantes.size} falantes no mesmo plano; o ideal é um por plano.`);
            if (dur !== null && palavras > 0) {
                const limite = (PALAVRAS_POR_8S * dur) / 8;
                if (palavras > limite * FATOR_PALAVRAS_ERRO) {
                    r.erros.push(`${rotulo}: ${palavras} palavras em ${fmt(dur)} s não cabem (o ideal é até ~${Math.floor(limite)}); encurte a fala ou aumente o plano.`);
                } else if (palavras > limite) {
                    r.avisos.push(`${rotulo}: ${palavras} palavras em ${fmt(dur)} s (o ideal é até ~${Math.floor(limite)}); a fala pode ficar corrida.`);
                }
            }
        });
        if (somaValida && ehNumero(alvo) && Math.abs(soma - alvo) > tolerancia) {
            r.erros.push(`roteiro: as durações somam ${fmt(soma)} s; o alvo é ${fmt(alvo)} s (±${fmt(tolerancia)} s).`);
        }
    }

    // "escolhas": null = episódio sem votação (curto, teste ou último); ausente = erro.
    const semVotacao = rot.escolhas === null;
    if (semVotacao) { /* ok */ }
    else if (!ehObjeto(rot.escolhas)) r.erros.push('roteiro: faltam as "escolhas" A e B (use "escolhas": null num episódio sem votação).');
    else {
        for (const lado of ['A', 'B']) {
            const e = rot.escolhas[lado];
            if (!ehObjeto(e) || !ehTexto(e.texto)) r.erros.push(`roteiro: a escolha ${lado} precisa de "texto".`);
            else for (const campo of ['detalhe', 'consequencia']) {
                if (e[campo] !== undefined && typeof e[campo] !== 'string') r.erros.push(`roteiro: escolha ${lado}: "${campo}" deve ser texto.`);
            }
        }
        const a = rot.escolhas.A && rot.escolhas.A.texto;
        const b = rot.escolhas.B && rot.escolhas.B.texto;
        if (ehTexto(a) && ehTexto(b) && normalizarTexto(a) === normalizarTexto(b)) r.erros.push('roteiro: as escolhas A e B são iguais; precisam ser diferentes.');
    }
    if (rot.cta !== undefined && typeof rot.cta !== 'string') r.erros.push('roteiro: "cta" deve ser texto.');
    else if (!ehTexto(rot.cta) && !semVotacao) r.avisos.push('roteiro: sem "cta" (ex.: "Comente A ou B.").');
    if (rot.aprovado !== undefined && rot.aprovado !== null && typeof rot.aprovado !== 'boolean' && typeof rot.aprovado !== 'string') {
        r.erros.push('roteiro: "aprovado" deve ser null, true/false ou a data da aprovação.');
    }
    return fechar(r);
}

// ---------- episodios/epNN/planos.json ----------
// ctx (opcional): { tetoPlanoUsd }.
function validarPlanos(doc, ctx = {}) {
    const r = novoResultado();
    if (!ehObjeto(doc)) return fechar({ ...r, erros: ['planos.json precisa ser um objeto.'] });
    checarVersao(doc, r, 'planos.json');
    if (!Array.isArray(doc.planos)) return fechar({ ...r, erros: [...r.erros, 'planos.json: "planos" deve ser uma lista.'] });
    const numeros = new Set();
    doc.planos.forEach((p) => { if (ehObjeto(p) && ehInteiro(p.n, 1)) numeros.add(p.n); });
    const vistos = new Set();
    doc.planos.forEach((p, i) => {
        const rot = `plano ${ehObjeto(p) && p.n !== undefined ? p.n : i + 1}`;
        if (!ehObjeto(p)) { r.erros.push(`${rot}: precisa ser um objeto.`); return; }
        if (!ehInteiro(p.n, 1)) r.erros.push(`${rot}: "n" deve ser inteiro ≥ 1.`);
        else if (vistos.has(p.n)) r.erros.push(`${rot}: número repetido.`);
        vistos.add(p.n);
        if (!TIPOS_PLANO.includes(p.tipo)) r.erros.push(`${rot}: "tipo" deve ser um de: ${TIPOS_PLANO.join(', ')}.`);
        if (!ehNumero(p.duracaoS) || p.duracaoS < PLANO_MIN_S || p.duracaoS > PLANO_MAX_S) {
            r.erros.push(`${rot}: "duracaoS" deve ficar entre ${PLANO_MIN_S} e ${PLANO_MAX_S} s.`);
        }
        if (p.prompt !== undefined && typeof p.prompt !== 'string') r.erros.push(`${rot}: "prompt" deve ser texto.`);
        else if (p.tipo === 'video_ia' && !ehTexto(p.prompt)) r.avisos.push(`${rot}: plano de vídeo IA sem "prompt".`);
        if (p.ancoras !== undefined && (!Array.isArray(p.ancoras) || p.ancoras.some((x) => typeof x !== 'string'))) {
            r.erros.push(`${rot}: "ancoras" deve ser uma lista de ids.`);
        }
        if (p.quadroChave !== undefined && p.quadroChave !== null) {
            const q = p.quadroChave;
            if (!ehObjeto(q)) r.erros.push(`${rot}: "quadroChave" deve ser um objeto ou null.`);
            else {
                if (!ORIGENS_QUADRO.includes(q.origem)) r.erros.push(`${rot}: quadroChave.origem deve ser uma de: ${ORIGENS_QUADRO.join(', ')}.`);
                if (q.caminho !== undefined && q.caminho !== null && !caminhoRelativoSeguro(q.caminho)) r.erros.push(`${rot}: quadroChave.caminho deve ser relativo à pasta do episódio.`);
                if (q.aprovado !== undefined && typeof q.aprovado !== 'boolean') r.erros.push(`${rot}: quadroChave.aprovado deve ser true/false.`);
            }
        }
        if (p.modelo !== undefined && p.modelo !== null && typeof p.modelo !== 'string') r.erros.push(`${rot}: "modelo" deve ser texto.`);
        if (p.audio !== undefined && typeof p.audio !== 'boolean') r.erros.push(`${rot}: "audio" deve ser true/false.`);
        if (p.custoPrevistoUsd !== undefined && p.custoPrevistoUsd !== null) {
            if (!ehNumero(p.custoPrevistoUsd) || p.custoPrevistoUsd < 0) r.erros.push(`${rot}: "custoPrevistoUsd" deve ser um número ≥ 0.`);
            else if (ehNumero(ctx.tetoPlanoUsd) && p.custoPrevistoUsd > ctx.tetoPlanoUsd) {
                r.avisos.push(`${rot}: custo previsto US$ ${fmt(p.custoPrevistoUsd)} passa do teto por plano (US$ ${fmt(ctx.tetoPlanoUsd)}).`);
            }
        }
        if (p.dependeDe !== undefined) {
            if (!Array.isArray(p.dependeDe)) r.erros.push(`${rot}: "dependeDe" deve ser uma lista de números de plano.`);
            else p.dependeDe.forEach((d) => {
                if (d === p.n) r.erros.push(`${rot}: não pode depender de si mesmo.`);
                else if (!numeros.has(d)) r.erros.push(`${rot}: depende do plano ${d}, que não existe.`);
            });
        }
        const idsTake = new Set();
        if (p.takes !== undefined) {
            if (!Array.isArray(p.takes)) r.erros.push(`${rot}: "takes" deve ser uma lista.`);
            else p.takes.forEach((t, j) => {
                const rt = `${rot}, take ${j + 1}`;
                if (!ehObjeto(t)) { r.erros.push(`${rt}: precisa ser um objeto.`); return; }
                if (!ehTexto(t.id)) r.erros.push(`${rt}: falta "id".`);
                else if (idsTake.has(t.id)) r.erros.push(`${rt}: id "${t.id}" repetido.`);
                idsTake.add(t.id);
                if (!FASES_TAKE.includes(t.fase)) r.erros.push(`${rt}: "fase" deve ser rascunho ou final.`);
                if (t.caminho !== undefined && t.caminho !== null && !caminhoRelativoSeguro(t.caminho)) r.erros.push(`${rt}: "caminho" deve ser relativo à pasta do episódio.`);
                if (!STATUS_TAKE.includes(t.status)) r.erros.push(`${rt}: "status" deve ser pendente, pronto ou falhou.`);
                if (t.custoUsd !== undefined && t.custoUsd !== null && (!ehNumero(t.custoUsd) || t.custoUsd < 0)) r.erros.push(`${rt}: "custoUsd" deve ser um número ≥ 0.`);
            });
        }
        if (p.takeEscolhido !== undefined && p.takeEscolhido !== null && !idsTake.has(p.takeEscolhido)) {
            r.erros.push(`${rot}: "takeEscolhido" (${p.takeEscolhido}) não está entre os takes.`);
        }
    });
    const ciclo = acharCiclo(doc.planos);
    if (ciclo) r.erros.push(`planos.json: dependência circular entre os planos ${ciclo.join(' → ')}.`);
    return fechar(r);
}

function acharCiclo(planos) {
    const deps = new Map();
    for (const p of planos) if (ehObjeto(p) && ehInteiro(p.n, 1)) deps.set(p.n, Array.isArray(p.dependeDe) ? p.dependeDe : []);
    const estado = new Map(); // 1 = visitando, 2 = pronto
    const pilha = [];
    const visitar = (n) => {
        if (estado.get(n) === 2) return null;
        if (estado.get(n) === 1) return [...pilha.slice(pilha.indexOf(n)), n];
        estado.set(n, 1);
        pilha.push(n);
        for (const d of deps.get(n) || []) {
            if (!deps.has(d)) continue;
            const c = visitar(d);
            if (c) return c;
        }
        pilha.pop();
        estado.set(n, 2);
        return null;
    };
    for (const n of deps.keys()) {
        const c = visitar(n);
        if (c) return c;
    }
    return null;
}

// ---------- episodios/epNN/votacao.json ----------
function calcularVencedora(a, b) {
    if (a > b) return 'A';
    if (b > a) return 'B';
    return 'empate';
}

function validarVotacao(v) {
    const r = novoResultado();
    if (!ehObjeto(v)) return fechar({ ...r, erros: ['votacao.json precisa ser um objeto.'] });
    checarVersao(v, r, 'votacao.json');
    if (!ehInteiro(v.ep, 1)) r.erros.push('votacao.json: "ep" deve ser inteiro ≥ 1.');
    if (!ehObjeto(v.votos) || !ehInteiro(v.votos.A) || !ehInteiro(v.votos.B)) r.erros.push('votacao.json: "votos" precisa de A e B inteiros ≥ 0.');
    else if (v.vencedora !== calcularVencedora(v.votos.A, v.votos.B)) r.erros.push('votacao.json: "vencedora" não bate com os votos.');
    if (!FONTES_VOTACAO.includes(v.fonte)) r.erros.push('votacao.json: "fonte" deve ser manual ou youtube.');
    if (!ehTexto(v.registradaEm)) r.erros.push('votacao.json: falta "registradaEm".');
    return fechar(r);
}

module.exports = {
    ETAPAS,
    TIPOS_PLANO,
    VIAS,
    FALANTES_FIXOS,
    TIPOS_FICHA,
    ORIGENS_FICHA,
    FONTES_VOTACAO,
    VOZES_PERMITIDAS,
    PLANO_MIN_S,
    PLANO_MAX_S,
    TOLERANCIA_DURACAO_S,
    DURACAO_MIN_S,
    DURACAO_MAX_S,
    toleranciaDuracao,
    PALAVRAS_POR_8S,
    ehSlug,
    caminhoRelativoSeguro,
    contarPalavras,
    calcularVencedora,
    validarSerie,
    validarBiblia,
    validarFicha,
    validarRoteiro,
    validarPlanos,
    validarVotacao,
};
