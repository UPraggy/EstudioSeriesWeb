// Validação do que o LLM devolve em cada etapa + "consertar o óbvio" (sempre listando o que foi consertado).
// Regras do roteiro e da decupagem vêm de docs/CONTRATOS.md e do plano (4–8 s por clipe, ~15 palavras/8 s, sem sangue).
const { normalizar, slug, contarPalavras, lista, clonar } = require('../memoria/util');
const { ocorrenciasAfirmativas } = require('../memoria/continuidade');
const { CTA_PADRAO, CTA_FINAL, FASES, vozesPermitidas } = require('./prompts');
const { custoPrevisto, ajustarDuracao, USD_QUADRO_CHAVE } = require('./precos');
const { toleranciaDuracao, ETAPAS: ETAPAS_SERIE } = require('../series/validar');

const TIPOS_PLANO = ['video_ia', 'apresentador', 'grafico', 'reaproveitar'];
const VIAS = ['narracao', 'radio', 'telefone', 'em_cena'];
const VOZES_SISTEMA = ['narrador', 'alerta'];
const RE_SANGUE = /\b(sangue|sangrando|sangra|ensanguentad\w*|blood\w*|bloody|gore|gory|v[ií]sceras?|tripas|guts|decapit\w*|mutil\w*|dismember\w*|entrails)\b/i;
const RE_FLASHBACK = /\b(flashback|minutos antes|horas antes|dias antes|anos antes|semanas antes|tempos atr[aá]s|lembran[cç]a de)\b/i;
const RE_DE_COSTAS = /\b(de costas|perfil|fora de quadro|fora do quadro|silhueta|from behind|back to (the )?camera|profile|silhouette|off-screen|out of frame)\b/i;
const CAMPOS_IDEIA = ['titulo', 'genero', 'logline', 'protagonista', 'ameaca', 'ganchoEp1', 'primeiraEscolha', 'misterioCentral', 'cenariosRecorrentes', 'potencialRetencao'];
const SINONIMOS_IDEIA = {
    titulo: 'titulo', genero: 'genero', logline: 'logline', premissa: 'logline', protagonista: 'protagonista',
    ameaca: 'ameaca', antagonista: 'ameaca', ganchoep1: 'ganchoEp1', gancho: 'ganchoEp1', primeiraescolha: 'primeiraEscolha',
    escolha: 'primeiraEscolha', escolhaab: 'primeiraEscolha', misteriocentral: 'misterioCentral', misterio: 'misterioCentral',
    cenariosrecorrentes: 'cenariosRecorrentes', cenarios: 'cenariosRecorrentes', potencialretencao: 'potencialRetencao',
    potencialderetencao: 'potencialRetencao', retencao: 'potencialRetencao',
};

// Primeiro termo de sangue/violência explícita que aparece SEM negação ("no blood" e "sem sangue" não contam).
// Negação que vale para a frase inteira, inclusive em lista: "No visible blood, wounds, gore, or explicit violence".
const RE_NEGA_FRASE = /\b(no|not|without|never|avoid|sem|nem|nenhum|nenhuma|evite|evitar|jamais)\b/i;
function negadoNaFrase(texto, indice) {
    const antes = String(texto).slice(0, indice);
    const inicio = Math.max(antes.lastIndexOf('.'), antes.lastIndexOf(';'), antes.lastIndexOf('!'), antes.lastIndexOf('?'), antes.lastIndexOf('\n'));
    return RE_NEGA_FRASE.test(antes.slice(inicio + 1));
}

function sangueAfirmado(texto) {
    const re = new RegExp(RE_SANGUE.source, 'gi');
    for (const m of String(texto ?? '').matchAll(re)) {
        if (negadoNaFrase(texto, m.index)) continue;
        if (ocorrenciasAfirmativas(texto, m[0])) return m[0];
    }
    return null;
}

function novoRelatorio(valor) {
    return { valor, erros: [], avisos: [], consertos: [] };
}

function caixaAlta(t) {
    return String(t ?? '').toLocaleUpperCase('pt-BR');
}

// ---------------------------------------------------------------- ideias
function normalizarIdeia(bruta, rel, rotulo) {
    const ideia = {};
    for (const [k, v] of Object.entries(bruta || {})) {
        const alvo = SINONIMOS_IDEIA[normalizar(k).replace(/[^a-z0-9]/g, '')];
        if (alvo && ideia[alvo] === undefined) {
            if (alvo !== k) rel.consertos.push(`${rotulo}: campo "${k}" renomeado para "${alvo}"`);
            ideia[alvo] = v;
        } else ideia[k] = v;
    }
    if (typeof ideia.cenariosRecorrentes === 'string') {
        ideia.cenariosRecorrentes = ideia.cenariosRecorrentes.split(/[,;]/).map((x) => x.trim()).filter(Boolean);
        rel.consertos.push(`${rotulo}: cenários recorrentes viraram lista`);
    }
    if (ideia.primeiraEscolha && typeof ideia.primeiraEscolha === 'object') {
        for (const k of ['A', 'B']) {
            if (typeof ideia.primeiraEscolha[k] === 'string' && ideia.primeiraEscolha[k] !== caixaAlta(ideia.primeiraEscolha[k])) {
                ideia.primeiraEscolha[k] = caixaAlta(ideia.primeiraEscolha[k]);
                rel.consertos.push(`${rotulo}: opção ${k} em caixa alta`);
            }
        }
        if (ideia.primeiraEscolha.A && normalizar(ideia.primeiraEscolha.A) === normalizar(ideia.primeiraEscolha.B)) rel.erros.push(`${rotulo}: opções A e B iguais.`);
    }
    for (const c of CAMPOS_IDEIA) {
        const v = ideia[c];
        if (v == null || v === '' || (Array.isArray(v) && !v.length)) rel.erros.push(`${rotulo}: falta o campo "${c}".`);
    }
    if (Array.isArray(ideia.cenariosRecorrentes) && ideia.cenariosRecorrentes.length > 4) rel.avisos.push(`${rotulo}: ${ideia.cenariosRecorrentes.length} cenários (produção barata pede 2 a 4).`);
    return ideia;
}

function validarIdeias(v, c = {}) {
    const rel = novoRelatorio(null);
    if (c.modo === 'B') {
        let obj = v;
        if (obj && !obj.ideia && (obj.titulo || obj.logline)) { obj = { ideia: obj }; rel.consertos.push('ideia embrulhada em {"ideia": ...}'); }
        if (!obj || !obj.ideia) { rel.erros.push('Faltou "ideia".'); rel.valor = obj; return rel; }
        rel.valor = { ideia: normalizarIdeia(obj.ideia, rel, 'ideia'), ajustes: lista(obj.ajustes), riscos: lista(obj.riscos) };
        return rel;
    }
    let ideias = Array.isArray(v) ? v : v?.ideias;
    if (Array.isArray(v)) rel.consertos.push('lista embrulhada em {"ideias": [...]}');
    if (!Array.isArray(ideias)) { rel.erros.push('Faltou a lista "ideias".'); rel.valor = v; return rel; }
    if (ideias.length > 5) { ideias = ideias.slice(0, 5); rel.consertos.push('mais de 5 ideias: ficaram as 5 primeiras'); }
    if (ideias.length < 5) rel.erros.push(`Vieram ${ideias.length} ideias; o Modo A pede 5.`);
    const out = ideias.map((i, k) => normalizarIdeia(i, rel, `ideia ${k + 1}`));
    const titulos = out.map((i) => normalizar(i.titulo));
    if (new Set(titulos).size !== titulos.length) rel.avisos.push('Há ideias com o mesmo título.');
    rel.valor = { ideias: out };
    return rel;
}

// ---------------------------------------------------------------- bíblia
function slugCampo(obj, rel, rotulo) {
    if (!obj || obj.id == null) return;
    const s = slug(obj.id);
    if (s !== obj.id) { rel.consertos.push(`${rotulo}: id "${obj.id}" → "${s}"`); obj.id = s; }
}

function validarBiblia(v, c = {}) {
    let obj = v;
    const rel = novoRelatorio(null);
    if (obj && !obj.biblia && obj.premissa) { obj = { biblia: obj, elenco: obj.elenco, locais: obj.locais }; delete obj.biblia.elenco; delete obj.biblia.locais; rel.consertos.push('bíblia embrulhada em {"biblia": ...}'); }
    if (!obj || !obj.biblia || typeof obj.biblia !== 'object') { rel.erros.push('Faltou "biblia".'); rel.valor = obj; return rel; }
    const b = { versao: 1, ...obj.biblia };
    const elenco = lista(obj.elenco).map((e) => ({ ...e }));
    const locais = lista(obj.locais).map((e) => ({ ...e }));
    if (!b.premissa) rel.erros.push('Falta a premissa.');
    b.regras = lista(b.regras);
    if (!b.regras.length) rel.erros.push('Faltam as regras do mundo.');
    else if (b.regras.length < 3) rel.avisos.push('Poucas regras do mundo (o ideal é 4 a 8).');
    if (!Array.isArray(b.cronologia)) { b.cronologia = []; }
    b.recursos = b.recursos && typeof b.recursos === 'object' ? b.recursos : {};
    b.misterios = lista(b.misterios);
    b.segredos = b.segredos && typeof b.segredos === 'object' ? { personagens: lista(b.segredos.personagens), publico: lista(b.segredos.publico) } : { personagens: [], publico: [] };

    const escolhasInventadas = lista(b.escolhas).some((e) => e && (e.vencedora != null || Number(e.votos?.A) > 0 || Number(e.votos?.B) > 0));
    if (escolhasInventadas || !Array.isArray(b.escolhas)) rel.consertos.push('"escolhas" zerado: ninguém votou ainda (nunca inventar votação)');
    b.escolhas = [];

    // temporada: exatamente 10, n = 1..10, fase preenchida
    let t = lista(b.temporada).map((x) => ({ ...x }));
    if (t.length > 10) { t = t.slice(0, 10); rel.consertos.push('temporada com mais de 10 episódios: ficaram 10'); }
    if (t.length < 10) rel.erros.push(`O mapa da temporada tem ${t.length} episódios; precisa de 10.`);
    t.forEach((e, i) => {
        if (Number(e.n) !== i + 1) { e.n = i + 1; rel.consertos.push(`temporada: episódio ${i + 1} renumerado`); }
        if (!e.fase) { e.fase = FASES[i]; rel.consertos.push(`temporada: fase do Ep. ${i + 1} preenchida (${FASES[i]})`); }
        if (!e.titulo) rel.erros.push(`temporada: Ep. ${i + 1} sem título.`);
        // status do mapa usa os nomes de etapa do biblia.json (ideia = só planejado); "planejado" antigo vira "ideia"
        if (!e.status || !ETAPAS_SERIE.includes(e.status)) e.status = 'ideia';
    });
    b.temporada = t;

    const idsVistos = new Map();
    const registrar = (id, onde) => {
        if (!id) return;
        if (idsVistos.has(id) && idsVistos.get(id) !== onde) rel.erros.push(`id repetido "${id}" em ${idsVistos.get(id)} e ${onde}.`);
        idsVistos.set(id, onde);
    };
    const vozes = new Set(vozesPermitidas().map((x) => x.id));
    elenco.forEach((e, i) => {
        slugCampo(e, rel, `elenco ${i + 1}`);
        registrar(e.id, 'elenco');
        if (!e.ancora) rel.erros.push(`elenco ${e.id || i + 1}: falta a âncora (aparência fixa).`);
        if (!e.ancoraEn) rel.avisos.push(`elenco ${e.id || i + 1}: falta "ancoraEn" (âncora em inglês para os prompts).`);
        if (e.vozSugerida && !vozes.has(e.vozSugerida)) { rel.consertos.push(`elenco ${e.id}: voz "${e.vozSugerida}" fora da lista permitida → vazia`); e.vozSugerida = null; }
    });
    locais.forEach((l, i) => {
        slugCampo(l, rel, `local ${i + 1}`);
        registrar(l.id, 'locais');
        if (!l.ancora) rel.erros.push(`local ${l.id || i + 1}: falta a âncora.`);
    });
    if (elenco.filter((e) => e.id !== 'narrador').length > 4) rel.avisos.push(`${elenco.length} personagens: produção barata pede 2 a 4 fixos.`);
    if (locais.length > 6) rel.avisos.push(`${locais.length} locais: produção barata pede até 6 recorrentes.`);

    const idsLocais = new Set(locais.map((l) => l.id));
    b.objetos = lista(b.objetos).map((o, i) => {
        const x = { ...o };
        slugCampo(x, rel, `objeto ${i + 1}`);
        registrar(x.id, 'objetos');
        if (x.onde && idsLocais.size && !idsLocais.has(x.onde)) {
            const s = slug(x.onde);
            const achado = [...idsLocais].find((id) => s === id || s.split('-').includes(id));
            if (achado) { rel.consertos.push(`objeto ${x.id}: onde "${x.onde}" → "${achado}"`); x.onde = achado; } else rel.avisos.push(`objeto ${x.id}: local "${x.onde}" não está entre os locais.`);
        }
        return x;
    });
    b.personagens = lista(b.personagens).map((p, i) => { const x = { ...p }; slugCampo(x, rel, `personagem ${i + 1}`); return x; });
    for (const e of elenco) {
        if (e.id && e.id !== 'narrador' && !b.personagens.some((p) => p.id === e.id)) {
            b.personagens.push({ id: e.id, estado: 'sem ferimentos', sabe: [] });
            rel.consertos.push(`personagem "${e.id}" acrescentado ao estado da bíblia`);
        }
    }
    rel.valor = { biblia: b, elenco, locais };
    return rel;
}

// ---------------------------------------------------------------- roteiro
const MAPA_TIPO = {
    videoia: 'video_ia', video: 'video_ia', videoai: 'video_ia', clipe: 'video_ia', apresentador: 'apresentador', narradoremcena: 'apresentador',
    avatar: 'apresentador', grafico: 'grafico', titulo: 'grafico', mapa: 'grafico', cartao: 'grafico', reaproveitar: 'reaproveitar',
    reuso: 'reaproveitar', existente: 'reaproveitar', reaproveitado: 'reaproveitar',
};
const MAPA_VIA = {
    narracao: 'narracao', off: 'narracao', vozoff: 'narracao', voiceover: 'narracao', narrador: 'narracao', radio: 'radio', vhf: 'radio',
    telefone: 'telefone', celular: 'telefone', ligacao: 'telefone', emcena: 'em_cena', cena: 'em_cena', lipsync: 'em_cena',
};

function chaveSimples(t) {
    return normalizar(t).replace(/[^a-z0-9]/g, '');
}

function limitePalavras(dur) {
    return Math.ceil((dur * 15) / 8);
}

const TELA_CARTOES = 'CARTÕES A / B';
const SILENCIO_MAX_S = 3;
const FRACAO_APRESENTACAO = 0.35;
const RE_CARTOES = /cart(õ|o)es\s*a\s*\/\s*b/i;
const RE_TELA_AB = /(^|\n|\s)A\s*[:\-–·.)]\s*\S[\s\S]*(^|\n|\s|\|)\s*B\s*[:\-–·.)]\s*\S/;

// O "tela" traz as opções A e B (formato "A: … B: …" ou o texto das duas)?
function telaComOpcoes(tela, escolhas) {
    if (!tela || RE_CARTOES.test(tela)) return false;
    if (RE_TELA_AB.test(tela)) return true;
    if (!escolhas || typeof escolhas !== 'object') return false;
    const textoDe = (o) => chaveSimples(typeof o === 'string' ? o : o && o.texto);
    const t = chaveSimples(tela);
    const a = textoDe(escolhas.A);
    const b = textoDe(escolhas.B);
    return Boolean(a && b && t.includes(a) && t.includes(b));
}

// O "tela" é a chamada para comentar (o CTA)?
function telaComCta(tela, cta) {
    const t = chaveSimples(tela);
    if (!t) return false;
    if (/^comente|comenteaoub|maisvotada/.test(t)) return true;
    const c = chaveSimples(cta);
    return Boolean(c && (t === c || c.startsWith(t) && t.length > 8));
}

function cabeNaFala(p, texto) {
    const palavras = p.falas.reduce((a, f) => a + contarPalavras(f.texto), 0) + contarPalavras(texto);
    return palavras <= limitePalavras(p.ateS - p.deS);
}

// Conserta o "tela" com as opções A/B (vira "CARTÕES A / B") e com o CTA (sai do "tela" e vai para a fala do
// narrador no último plano). Também garante que o narrador LEIA as opções no plano dos cartões, se couber.
function consertarCartoesECta(r, { semEscolha, ultimo, ctaEsperado }, rel) {
    const escolhas = r.escolhas && typeof r.escolhas === 'object' ? r.escolhas : null;
    const comVotacao = !semEscolha && !ultimo && escolhas;
    let ctaNaTela = false;
    for (const p of r.planos) {
        const rot = `plano ${p.n}`;
        if (telaComOpcoes(p.tela, escolhas)) {
            if (comVotacao) {
                p.tela = TELA_CARTOES;
                rel.consertos.push(`${rot}: opções A/B escritas no "tela" → "${TELA_CARTOES}" (a montagem desenha os cartões)`);
            } else {
                p.tela = '';
                rel.consertos.push(`${rot}: opções A/B no "tela" de um episódio sem votação → "tela" limpo`);
            }
        } else if (telaComCta(p.tela, ctaEsperado || CTA_PADRAO)) {
            p.tela = '';
            ctaNaTela = true;
            rel.consertos.push(`${rot}: CTA escrito no "tela" → limpo (o narrador fala o CTA)`);
        }
    }
    if (comVotacao) {
        const textoOpcao = (k) => {
            const o = escolhas[k];
            return String(typeof o === 'string' ? o : (o && o.texto) || '').trim().replace(/[.!;]+$/, '');
        };
        const a = textoOpcao('A');
        const b = textoOpcao('B');
        const cartoes = r.planos.filter((p) => RE_CARTOES.test(p.tela || ''));
        if (!cartoes.length) rel.avisos.push(`Nenhum plano marca os cartões da escolha ("tela": "${TELA_CARTOES}").`);
        for (const p of cartoes) {
            if (!a || !b) break;
            const falado = chaveSimples(p.falas.map((f) => f.texto).join(' '));
            if (falado.includes(chaveSimples(a)) && falado.includes(chaveSimples(b))) continue;
            const leitura = `${a.charAt(0)}${a.slice(1).toLocaleLowerCase("pt-BR")} ou ${b.toLocaleLowerCase("pt-BR")}?`;
            if (cabeNaFala(p, leitura)) {
                p.falas.push({ quem: 'narrador', texto: leitura, via: 'narracao' });
                rel.consertos.push(`plano ${p.n}: o narrador passa a ler as duas opções em voz alta`);
            } else {
                rel.avisos.push(`plano ${p.n}: o narrador não lê as opções A e B em voz alta (não coube sem passar do limite de palavras).`);
            }
        }
    }
    if (ctaNaTela && ctaEsperado) {
        const ultimoPlano = r.planos[r.planos.length - 1];
        const falado = chaveSimples(ultimoPlano.falas.map((f) => f.texto).join(' '));
        if (!falado.includes('comente')) {
            if (cabeNaFala(ultimoPlano, ctaEsperado)) {
                ultimoPlano.falas.push({ quem: 'narrador', texto: ctaEsperado, via: 'narracao' });
                rel.consertos.push(`plano ${ultimoPlano.n}: o CTA que estava no "tela" virou fala do narrador`);
            } else {
                rel.avisos.push(`plano ${ultimoPlano.n}: o CTA estava no "tela" e não coube na fala do narrador; encurte a fala desse plano.`);
            }
        }
    }
}

function validarRoteiro(v, c = {}) {
    const rel = novoRelatorio(null);
    let r = v && v.roteiro && typeof v.roteiro === 'object' ? v.roteiro : v;
    if (r !== v) rel.consertos.push('roteiro desembrulhado de {"roteiro": ...}');
    if (!r || typeof r !== 'object') { rel.erros.push('O roteiro não é um objeto.'); return rel; }
    r = clonar(r);
    const ep = Number(c.ep ?? r.n ?? 1);
    const total = Number(c.totalEpisodios || 10);
    const ultimo = c.ultimo ?? ep >= total;
    if (r.versao !== 1) { r.versao = 1; }
    if (Number(r.n) !== ep) { if (r.n != null) rel.consertos.push(`número do episódio ${r.n} → ${ep}`); r.n = ep; }
    const alvo = Number(c.duracaoAlvoS || r.duracaoAlvoS || 60);
    r.duracaoAlvoS = alvo;
    // duração livre: episódio curto (< 20 s) não tem votação A/B, a não ser que o pedido diga o contrário
    const semEscolha = c.semEscolha ?? alvo < 20;
    const tolerancia = toleranciaDuracao(alvo);
    const minPlanos = alvo <= 10 ? 1 : 2;
    if (!r.titulo) rel.erros.push('Falta o título do episódio.');
    if (!r.resumo) rel.avisos.push('Falta o resumo (a memória usa o resumo).');
    if (!Array.isArray(r.planos) || r.planos.length < minPlanos) { rel.erros.push(`O roteiro precisa de uma lista de planos (pelo menos ${minPlanos}).`); rel.valor = r; return rel; }

    const elencoConhecido = c.elencoIds ? new Set(c.elencoIds) : null;
    const novosDeclarados = new Set(lista(r.continuidade?.fatosNovos).flatMap((f) => lista(f?.sobre)));

    // normalização de cada plano
    r.planos = r.planos.map((p0, i) => {
        const p = { ...p0 };
        const rot = `plano ${p.n ?? i + 1}`;
        const tipo = MAPA_TIPO[chaveSimples(p.tipo)];
        if (!tipo) rel.erros.push(`${rot}: tipo "${p.tipo}" desconhecido (use ${TIPOS_PLANO.join(', ')}).`);
        else if (tipo !== p.tipo) { rel.consertos.push(`${rot}: tipo "${p.tipo}" → "${tipo}"`); p.tipo = tipo; }
        p.elenco = lista(p.elenco).map((x) => slug(x)).filter(Boolean);
        p.objetos = lista(p.objetos).map((x) => slug(x)).filter(Boolean);
        if (p.local) p.local = slug(p.local);
        if (p.pov === '' || p.pov === undefined) p.pov = null;
        if (p.tela == null) p.tela = '';
        if (p.fala && !p.falas) {
            p.falas = typeof p.fala === 'string' ? [{ quem: 'narrador', texto: p.fala }] : lista(p.fala);
            delete p.fala;
            rel.consertos.push(`${rot}: "fala" virou "falas"`);
        }
        p.falas = lista(p.falas).map((f0) => {
            const f = { ...f0 };
            if (f.txt && !f.texto) { f.texto = f.txt; delete f.txt; rel.consertos.push(`${rot}: "txt" → "texto"`); }
            f.quem = slug(f.quem || 'narrador') || 'narrador';
            f.texto = String(f.texto ?? '').trim();
            const via = MAPA_VIA[chaveSimples(f.via)];
            if (via) {
                if (via !== f.via) rel.consertos.push(`${rot}: via "${f.via}" → "${via}"`);
                f.via = via;
            } else {
                const padrao = f.quem === 'alerta' ? 'radio'
                    : (f.quem === 'narrador' ? (p.tipo === 'apresentador' ? 'em_cena' : 'narracao') : (p.elenco.includes(f.quem) ? 'em_cena' : 'narracao'));
                rel.consertos.push(`${rot}: fala de ${f.quem} sem via válida → "${padrao}"`);
                f.via = padrao;
            }
            return f;
        });
        if (p.tipo === 'apresentador' && !p.elenco.length) { p.elenco = ['narrador']; rel.consertos.push(`${rot}: apresentador sem elenco → ["narrador"]`); }
        return p;
    });

    // tempos: contínuos a partir de 0, numeração 1..k
    const numero = (x) => (x === null || x === undefined || x === '' ? NaN : Number(x));
    const temTempo = (p) => Number.isFinite(numero(p.deS)) && Number.isFinite(numero(p.ateS));
    if (r.planos.every(temTempo)) r.planos.sort((a, b) => numero(a.deS) - numero(b.deS));
    let t = 0;
    let mexeu = false;
    r.planos.forEach((p, i) => {
        if (Number(p.n) !== i + 1) { p.n = i + 1; mexeu = true; }
        let dur = temTempo(p) ? numero(p.ateS) - numero(p.deS) : numero(p.duracaoS);
        if (!Number.isFinite(dur) || dur <= 0) { rel.erros.push(`plano ${i + 1}: duração inválida (deS ${p.deS}, ateS ${p.ateS}).`); dur = 0; }
        if (Number(p.deS) !== t || Number(p.ateS) !== t + dur) mexeu = true;
        p.deS = Math.round(t * 10) / 10;
        p.ateS = Math.round((t + dur) * 10) / 10;
        delete p.duracaoS;
        t += dur;
    });
    if (mexeu) rel.consertos.push('planos renumerados e tempos tornados contínuos a partir de 0 s');

    const somaS = Math.round(t * 10) / 10;
    if (Math.abs(somaS - alvo) > tolerancia) rel.erros.push(`Os planos somam ${somaS} s; o alvo é ${alvo} s (±${tolerancia}).`);

    // cartões A/B e CTA: a montagem desenha os cartões; o narrador LÊ as opções e FALA o CTA (nada disso no "tela")
    const ctaEsperado = semEscolha ? (ultimo && alvo >= 20 ? CTA_FINAL : '') : (ultimo ? CTA_FINAL : CTA_PADRAO);
    consertarCartoesECta(r, { semEscolha, ultimo, ctaEsperado }, rel);

    let videosIa = 0;
    const minPlanoS = Math.min(2, alvo);
    for (const p of r.planos) {
        const rot = `plano ${p.n}`;
        const dur = p.ateS - p.deS;
        if (dur < minPlanoS || dur > 10) rel.erros.push(`${rot}: ${dur} s (cada plano tem de ${minPlanoS} a 10 s).`);
        if (p.tipo === 'video_ia') videosIa++;
        const palavras = p.falas.reduce((a, f) => a + contarPalavras(f.texto), 0);
        if (palavras > limitePalavras(dur)) rel.erros.push(`${rot}: ${palavras} palavras em ${dur} s (máximo ${limitePalavras(dur)}: ~15 a cada 8 s).`);
        const falantes = new Set(p.falas.map((f) => f.quem));
        if (falantes.size > 1) rel.avisos.push(`${rot}: ${falantes.size} falantes (o ideal é um por plano).`);
        for (const f of p.falas) {
            if (!f.texto) rel.erros.push(`${rot}: fala vazia de ${f.quem}.`);
            if (!VOZES_SISTEMA.includes(f.quem) && elencoConhecido && !elencoConhecido.has(f.quem)) {
                if (novosDeclarados.has(f.quem)) rel.avisos.push(`${rot}: "${f.quem}" é personagem novo (precisa de ficha e voz).`);
                else rel.erros.push(`${rot}: "${f.quem}" não existe no elenco (use um id do elenco, "narrador" ou "alerta").`);
            }
            if (f.via === 'em_cena' && p.tipo !== 'apresentador' && !p.elenco.includes(f.quem)) {
                f.via = 'narracao';
                rel.consertos.push(`${rot}: ${f.quem} não está no quadro → fala "em_cena" virou "narracao" (voz em off)`);
            }
            // quem fala aparecendo no quadro (em cena, rádio ou telefone na mão) mexe a boca: sem lip-sync, só de costas/perfil
            if (p.tipo !== 'apresentador' && f.via !== 'narracao' && p.elenco.includes(f.quem) && !RE_DE_COSTAS.test(p.visual || '')) {
                rel.avisos.push(`${rot}: ${f.quem} aparece falando (${f.via}) sem lip-sync; mostre de costas/perfil ou tire do quadro.`);
            }
            if (/\d/.test(f.texto)) rel.avisos.push(`${rot}: número em algarismo na fala ("${f.texto}"): escreva por extenso.`);
        }
        // silêncio: nenhum trecho sem fala por mais de ~3 s (o gancho, plano 1, pode ser só imagem)
        if (p.n > 1 && !p.falas.length && dur > SILENCIO_MAX_S) rel.avisos.push(`${rot}: ${dur} s sem fala nenhuma (mais de ${SILENCIO_MAX_S} s em silêncio perde o público); ponha uma fala curta ou encurte.`);
        const textoPlano = `${p.visual || ''} ${p.tela || ''} ${p.falas.map((f) => f.texto).join(' ')}`;
        if (RE_FLASHBACK.test(textoPlano)) rel.avisos.push(`${rot}: parece flashback ("${textoPlano.match(RE_FLASHBACK)[0]}"); a série é linear.`);
        const sangue = sangueAfirmado(textoPlano);
        if (sangue) rel.avisos.push(`${rot}: menciona sangue/violência explícita ("${sangue}"); terror sugerido.`);
        if (c.locaisIds && p.local && !c.locaisIds.includes(p.local) && !novosDeclarados.has(p.local)) rel.avisos.push(`${rot}: local "${p.local}" não existe nas fichas.`);
        for (const id of p.elenco) {
            if (elencoConhecido && !elencoConhecido.has(id) && !novosDeclarados.has(id)) rel.avisos.push(`${rot}: "${id}" em cena não existe no elenco.`);
        }
    }
    // piloto: o público não sabe nada; a protagonista é apresentada pelo nome logo no começo
    if (ep === 1 && c.protagonista && c.protagonista.nome && alvo >= 20) {
        const limiteS = Math.round(alvo * FRACAO_APRESENTACAO * 10) / 10;
        const nome = normalizar(String(c.protagonista.nome).split(/\s+/)[0]);
        const cedo = r.planos.filter((p) => p.deS < limiteS).flatMap((p) => p.falas.map((f) => normalizar(f.texto)));
        const re = new RegExp(`\\b${nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
        if (nome && !cedo.some((txt) => re.test(txt))) {
            rel.avisos.push(`Ep. 1 (piloto): o nome da protagonista (${c.protagonista.nome}) não aparece nas falas dos primeiros ${limiteS} s; o público precisa saber quem ela é, onde está e o que aconteceu com o mundo.`);
        }
    }
    if (videosIa > 3) rel.avisos.push(`${videosIa} clipes novos de vídeo IA (produção barata pede 2 a 3; use reaproveitar/apresentador/gráfico).`);
    if (r.planos[0] && r.planos[0].ateS > 6) rel.avisos.push(`O gancho (plano 1) dura ${r.planos[0].ateS} s; o ideal é até 5 s.`);
    if (r.planos[0]?.tipo === 'apresentador') rel.avisos.push('O gancho (plano 1) é o apresentador: os 5 primeiros segundos pedem uma imagem forte da história.');
    const apresentador = r.planos.filter((p) => p.tipo === 'apresentador');
    if (apresentador.length > 2) {
        const seg = apresentador.reduce((a, p) => a + (p.ateS - p.deS), 0);
        rel.avisos.push(`${apresentador.length} planos de apresentador (${seg} s de lip-sync ≈ US$ ${(seg * 0.05).toFixed(2).replace('.', ',')}): ele abre/situa e fecha; o resto é história.`);
    }

    // escolhas e CTA
    if (semEscolha) {
        // sem votação vence o "último episódio": curto não tem CTA; o último longo fecha com o CTA final
        if (r.escolhas) { r.escolhas = null; rel.consertos.push('episódio sem votação: escolhas A/B removidas'); }
        else r.escolhas = null;
        const ctaCerto = ultimo && alvo >= 20 ? CTA_FINAL : '';
        if (r.cta !== ctaCerto) { if (r.cta) rel.consertos.push(ctaCerto ? 'CTA do último episódio preenchido' : 'episódio curto sem CTA'); r.cta = ctaCerto; }
    } else if (ultimo) {
        if (r.escolhas) rel.avisos.push('Último episódio com escolhas A/B: a temporada fecha sem votação.');
        if (!r.cta) { r.cta = CTA_FINAL; rel.consertos.push('CTA do último episódio preenchido'); }
    } else {
        const e = r.escolhas && typeof r.escolhas === 'object' ? r.escolhas : null;
        if (!e || !e.A || !e.B) rel.erros.push('Faltam as escolhas A e B.');
        else {
            for (const k of ['A', 'B']) {
                if (typeof e[k] === 'string') { e[k] = { texto: e[k] }; rel.consertos.push(`escolha ${k} virou objeto`); }
                if (!e[k].texto) rel.erros.push(`Escolha ${k} sem texto.`);
                else {
                    if (e[k].texto !== caixaAlta(e[k].texto)) { e[k].texto = caixaAlta(e[k].texto); rel.consertos.push(`escolha ${k} em caixa alta`); }
                    const semPonto = e[k].texto.trim().replace(/[.!;]+$/, '');
                    if (semPonto !== e[k].texto) { e[k].texto = semPonto; rel.consertos.push(`escolha ${k} sem ponto final`); }
                    const n = contarPalavras(e[k].texto);
                    if (n > 6) rel.erros.push(`Escolha ${k} longa demais (${n} palavras): o cartão pede 2 a 4 palavras, ex.: "ACENDER O FAROL"; o resto vai em "detalhe".`);
                    else if (n > 4) rel.avisos.push(`Escolha ${k} com ${n} palavras: no cartão, 2 a 4 leem melhor.`);
                }
                if (!e[k].detalhe) rel.avisos.push(`Escolha ${k} sem "detalhe" (o custo da opção).`);
                if (!e[k].consequencia) rel.avisos.push(`Escolha ${k} sem "consequencia" para o próximo episódio.`);
            }
            if (e.A.texto && normalizar(e.A.texto) === normalizar(e.B.texto)) rel.erros.push('As escolhas A e B são iguais.');
            if ('vencedora' in e || 'votos' in e) { delete e.vencedora; delete e.votos; rel.consertos.push('removido resultado de votação inventado pela IA'); }
        }
        if (r.cta !== CTA_PADRAO) { if (r.cta) rel.consertos.push('CTA trocado pelo padrão da série'); r.cta = CTA_PADRAO; }
        const ultimoPlano = r.planos[r.planos.length - 1];
        const falaFinal = normalizar(lista(ultimoPlano?.falas).map((f) => f.texto).join(' '));
        if (!falaFinal.includes('comente')) rel.avisos.push('O último plano não fala o CTA ("Comente A ou B...").');
    }
    if (r.aprovado !== null && r.aprovado !== undefined) rel.consertos.push('"aprovado" volta a null: só o Rafael aprova');
    r.aprovado = null;
    const cont = r.continuidade && typeof r.continuidade === 'object' ? r.continuidade : {};
    r.continuidade = { fatosNovos: lista(cont.fatosNovos), estadoDepois: cont.estadoDepois && typeof cont.estadoDepois === 'object' ? cont.estadoDepois : {} };
    rel.valor = r;
    return rel;
}

// ---------------------------------------------------------------- decupagem
function juntarPrompt(pp) {
    const partes = [['Camera', pp.camera], ['Subject', pp.sujeito], ['Action', pp.acao], ['Context', pp.contexto], ['Style', pp.estilo]];
    return partes.filter(([, v]) => v && String(v).trim()).map(([k, v]) => `${k}: ${String(v).trim().replace(/[.\s]+$/, '')}.`).join(' ');
}

// Ordem de geração (grafo de dependências, Kahn): um plano só sai depois dos que ele depende.
// Entre os prontos: vídeo IA antes do apresentador, quem define o visual (nível 0) antes de quem parte dele.
// Devolve { ordem, ciclo } (ciclo = planos presos numa dependência circular).
function ordenarGrafo(planos) {
    const porN = new Map(planos.map((p) => [p.n, p]));
    const deps = (n) => lista(porN.get(n)?.dependeDe).filter((d) => porN.has(d) && d !== n);
    const nivel = new Map();
    const calcNivel = (n, pilha = new Set()) => {
        if (nivel.has(n)) return nivel.get(n);
        if (pilha.has(n)) return 0;
        pilha.add(n);
        const v = deps(n).reduce((m, d) => Math.max(m, calcNivel(d, pilha) + 1), 0);
        pilha.delete(n);
        nivel.set(n, v);
        return v;
    };
    const pesoTipo = (n) => ({ video_ia: 0, apresentador: 1 })[porN.get(n)?.tipo] ?? 2;
    const pendentes = new Set(porN.keys());
    const ordem = [];
    while (pendentes.size) {
        const prontos = [...pendentes].filter((n) => deps(n).every((d) => !pendentes.has(d)));
        if (!prontos.length) return { ordem, ciclo: [...pendentes].sort((a, b) => a - b) };
        prontos.sort((a, b) => pesoTipo(a) - pesoTipo(b) || calcNivel(a) - calcNivel(b) || a - b);
        ordem.push(prontos[0]);
        pendentes.delete(prontos[0]);
    }
    return { ordem, ciclo: null };
}

function validarDecupagem(v, c = {}) {
    const rel = novoRelatorio(null);
    let d = Array.isArray(v) ? { planos: v } : v;
    if (Array.isArray(v)) rel.consertos.push('lista embrulhada em {"planos": [...]}');
    if (!d || !Array.isArray(d.planos)) { rel.erros.push('Faltou a lista "planos".'); rel.valor = d; return rel; }
    d = clonar(d);
    d.versao = 1;
    const roteiro = c.roteiro;
    if (!roteiro || !Array.isArray(roteiro.planos)) { rel.erros.push('Sem o roteiro aprovado para conferir a decupagem.'); rel.valor = d; return rel; }
    const modelos = c.modelos || {};
    const idsConhecidos = c.idsConhecidos ? new Set(c.idsConhecidos) : null;
    const saida = [];
    const ns = new Set(roteiro.planos.map((p) => Number(p.n)));
    for (const x of d.planos) if (!ns.has(Number(x?.n))) rel.consertos.push(`removido o plano ${x?.n} da decupagem (não existe no roteiro)`);

    for (const rp of roteiro.planos) {
        const rot = `plano ${rp.n}`;
        const p0 = d.planos.find((x) => Number(x?.n) === Number(rp.n));
        if (!p0) { rel.erros.push(`${rot}: sem decupagem.`); continue; }
        const p = { ...p0, n: Number(rp.n) };
        if (p.tipo !== rp.tipo) { if (p.tipo) rel.consertos.push(`${rot}: tipo "${p.tipo}" → "${rp.tipo}" (o do roteiro)`); p.tipo = rp.tipo; }
        const durRoteiro = Math.round((rp.ateS - rp.deS) * 10) / 10;
        const ancorasPadrao = [...new Set([...lista(rp.elenco), rp.local, ...lista(rp.objetos)].filter(Boolean))];
        if (!Array.isArray(p.ancoras) || !p.ancoras.length) { p.ancoras = ancorasPadrao; rel.consertos.push(`${rot}: âncoras preenchidas com quem/onde aparece`); }
        if (idsConhecidos) for (const id of p.ancoras) if (!idsConhecidos.has(id)) rel.avisos.push(`${rot}: âncora "${id}" sem ficha.`);
        if (p.quadroFinal === undefined) p.quadroFinal = null;
        if (!Array.isArray(p.takes)) p.takes = [];
        if (p.takeEscolhido === undefined) p.takeEscolhido = null;
        if (p.resolucao == null) p.resolucao = '720p';
        if (p.audio == null) p.audio = false;

        if (p.tipo === 'video_ia') {
            if (!p.prompt && p.promptPartes) { p.prompt = juntarPrompt(p.promptPartes); rel.consertos.push(`${rot}: prompt montado a partir de câmera + sujeito + ação + contexto + estilo`); }
            if (!p.prompt || !String(p.prompt).trim()) rel.erros.push(`${rot}: sem prompt.`);
            if (!p.modelo) { p.modelo = modelos.videoFinal || 'google/veo-3.1-lite'; rel.consertos.push(`${rot}: modelo padrão ${p.modelo}`); }
            const dur = ajustarDuracao(p.modelo, p.duracaoS ?? durRoteiro);
            if (dur !== p.duracaoS) { if (p.duracaoS != null) rel.consertos.push(`${rot}: duração ${p.duracaoS} s → ${dur} s (aceita pelo ${p.modelo}, entre 4 e 8 s)`); p.duracaoS = dur; }
            if (durRoteiro > dur) {
                const fator = durRoteiro / dur;
                (fator > 1.4 ? rel.erros : rel.avisos).push(`${rot}: o plano tem ${durRoteiro} s e o clipe ${dur} s (esticar ${fator.toFixed(2).replace('.', ',')}×${fator > 1.4 ? ', acima do limite 1,4×: divida o plano ou encurte' : ' na montagem'}).`);
            }
            const q = p.quadroChave && typeof p.quadroChave === 'object' ? { ...p.quadroChave } : null;
            const caminhoPadrao = `quadros/p${String(p.n).padStart(2, '0')}.png`;
            if (!q) { p.quadroChave = { origem: 'imagem_ia', caminho: caminhoPadrao, aprovado: false }; rel.consertos.push(`${rot}: quadro-chave padrão (imagem IA aprovada antes do vídeo)`); } else {
                if (!['imagem_ia', 'ref', 'ultimo_quadro'].includes(q.origem)) { q.origem = 'imagem_ia'; rel.consertos.push(`${rot}: origem do quadro-chave → imagem_ia`); }
                if (!q.caminho) q.caminho = caminhoPadrao;
                if (q.aprovado !== false) rel.consertos.push(`${rot}: quadro-chave volta a "não aprovado" (só o Rafael aprova)`);
                q.aprovado = false;
                p.quadroChave = q;
            }
            const prompt = String(p.prompt || '');
            const sangue = sangueAfirmado(prompt);
            if (sangue) rel.erros.push(`${rot}: prompt com sangue/violência explícita ("${sangue}"): terror sugerido.`);
            for (const termo of ['text', 'subtitle', 'subtitles', 'caption', 'logo', 'watermark', 'letreiro', 'legenda']) {
                if (ocorrenciasAfirmativas(prompt, termo)) { rel.avisos.push(`${rot}: o prompt pede "${termo}" na imagem; texto é título da montagem.`); break; }
            }
            if (/\b(talking|speaking|speaks|lips|mouth moving|says|falando)\b/i.test(prompt) && !RE_DE_COSTAS.test(prompt)) rel.avisos.push(`${rot}: personagem falando de frente (sem lip-sync): mostre de costas/perfil.`);
        } else if (p.tipo === 'apresentador') {
            if (!p.modelo) { p.modelo = modelos.apresentador || 'heygen/avatar-iv'; rel.consertos.push(`${rot}: modelo do apresentador ${p.modelo}`); }
            if (p.duracaoS !== durRoteiro) { if (p.duracaoS != null) rel.consertos.push(`${rot}: duração do apresentador = a do roteiro (${durRoteiro} s)`); p.duracaoS = durRoteiro; }
            if (p.quadroChave === undefined) p.quadroChave = null;
            else if (p.quadroChave && p.quadroChave.aprovado !== false) { p.quadroChave = { ...p.quadroChave, aprovado: false }; }
        } else {
            if (p.modelo) { rel.consertos.push(`${rot}: ${p.tipo} não usa modelo pago (modelo → null)`); }
            p.modelo = null;
            if (p.duracaoS == null) p.duracaoS = durRoteiro;
            if (p.quadroChave === undefined) p.quadroChave = null;
        }

        const custo = p.modelo ? custoPrevisto(p.modelo, p.duracaoS, p.resolucao, p.audio) : 0;
        if (custo != null && Math.abs((Number(p.custoPrevistoUsd) || 0) - custo) > 0.005) {
            if (p.custoPrevistoUsd != null) rel.consertos.push(`${rot}: custo previsto recalculado (US$ ${custo.toFixed(2).replace('.', ',')})`);
            p.custoPrevistoUsd = custo;
        } else if (custo == null) {
            if (p.custoPrevistoUsd == null) p.custoPrevistoUsd = null;
            rel.avisos.push(`${rot}: sem tabela de preço local para ${p.modelo} (o cliente OpenRouter calcula antes de gerar).`);
        }
        p.dependeDe = lista(p.dependeDe).map(Number).filter((n) => Number.isFinite(n));
        const deps = p.dependeDe.filter((n) => n !== p.n && ns.has(n));
        if (deps.length !== p.dependeDe.length) { rel.consertos.push(`${rot}: dependências inválidas removidas`); p.dependeDe = deps; }
        saida.push(p);
    }
    const { ordem, ciclo } = ordenarGrafo(saida);
    if (ciclo) rel.erros.push(`Dependência circular entre planos: ${ciclo.join(' → ')}.`);
    const pagos = new Set(saida.filter((p) => p.modelo).map((p) => p.n));
    const videosIa = saida.filter((p) => p.tipo === 'video_ia');
    if (videosIa.length > 3) rel.avisos.push(`${videosIa.length} clipes de vídeo IA no episódio (produção barata pede 2 a 3).`);
    const soma = (f) => Math.round(saida.filter(f).reduce((a, p) => a + (Number(p.custoPrevistoUsd) || 0), 0) * 100) / 100;
    const quadros = videosIa.filter((p) => p.quadroChave?.origem === 'imagem_ia').length;
    const resumoCusto = {
        videoUsd: soma((p) => p.tipo === 'video_ia'), apresentadorUsd: soma((p) => p.tipo === 'apresentador'),
        quadrosChaveUsd: Math.round(quadros * USD_QUADRO_CHAVE * 100) / 100,
    };
    resumoCusto.totalUsd = Math.round((resumoCusto.videoUsd + resumoCusto.apresentadorUsd + resumoCusto.quadrosChaveUsd) * 100) / 100;
    rel.valor = { versao: 1, ordemGeracao: ordem.filter((n) => pagos.has(n)), resumoCusto, planos: saida };
    return rel;
}

// ---------------------------------------------------------------- atualizar o mundo (depois da votação real)
function votacaoValida(v) {
    return Boolean(v && ['A', 'B', 'empate'].includes(v.vencedora) && ['manual', 'youtube'].includes(v.fonte));
}

function validarAtualizarMundo(v, c = {}) {
    const rel = novoRelatorio(null);
    if (!v || typeof v !== 'object') { rel.erros.push('Resposta vazia.'); return rel; }
    const ep = Number(c.ep);
    const b = clonar(c.biblia || {});
    const vot = c.votacao;
    const venc = vot.vencedora === 'empate' ? c.desempate : vot.vencedora;

    b.cronologia = lista(b.cronologia);
    for (const e of lista(v.cronologia)) {
        if (!e || !e.evento) continue;
        if (Number(e.ep) !== ep) { rel.consertos.push(`cronologia do Ep. ${e.ep} ignorada (só o Ep. ${ep} entra agora)`); continue; }
        b.cronologia.push({ ep, evento: String(e.evento) });
    }
    if (!lista(v.cronologia).some((e) => Number(e?.ep) === ep)) rel.avisos.push(`A IA não registrou o que aconteceu no Ep. ${ep} na cronologia.`);
    const mesclarLista = (campo) => {
        b[campo] = lista(b[campo]).map((x) => ({ ...x }));
        for (const novo of lista(v[campo])) {
            if (!novo || !novo.id) continue;
            const i = b[campo].findIndex((x) => x.id === novo.id);
            if (i >= 0) b[campo][i] = { ...b[campo][i], ...novo };
            else { b[campo].push({ ...novo }); rel.avisos.push(`${campo === 'personagens' ? 'personagem' : 'objeto'} novo: ${novo.id} (precisa de ficha).`); }
        }
    };
    mesclarLista('personagens');
    mesclarLista('objetos');
    if (v.recursos && typeof v.recursos === 'object') b.recursos = { ...(b.recursos || {}), ...v.recursos };
    if (Array.isArray(v.misterios) && v.misterios.length) b.misterios = v.misterios;
    if (v.segredos && typeof v.segredos === 'object') b.segredos = { personagens: lista(v.segredos.personagens), publico: lista(v.segredos.publico) };
    b.temporada = lista(b.temporada).map((x) => ({ ...x }));
    for (const t of lista(v.temporada)) {
        const n = Number(t?.n);
        if (!n) continue;
        if (n <= ep) { rel.consertos.push(`mapa do Ep. ${n} não muda (já publicado)`); continue; }
        const i = b.temporada.findIndex((x) => Number(x.n) === n);
        if (i >= 0) b.temporada[i] = { ...b.temporada[i], ...t, n, status: b.temporada[i].status || 'ideia' };
    }
    const atual = b.temporada.find((x) => Number(x.n) === ep);
    if (atual) atual.status = 'publicado';
    if (v.escolhas || v.vencedora || v.votos) rel.consertos.push('ignorado resultado de votação vindo da IA (vale só a votação real)');
    b.escolhas = lista(b.escolhas).filter((e) => Number(e?.ep) !== ep);
    const r = c.roteiro || {};
    b.escolhas.push({
        ep, A: r.escolhas?.A?.texto || null, B: r.escolhas?.B?.texto || null, vencedora: venc,
        votos: vot.votos || { A: 0, B: 0 }, fonte: vot.fonte, ...(vot.vencedora === 'empate' ? { desempate: 'Rafael' } : {}),
    });
    b.escolhas.sort((a, z) => a.ep - z.ep);
    if (!v.consequencia) rel.erros.push('Faltou "consequencia" (o que o próximo episódio TEM de mostrar).');
    rel.valor = { biblia: b, consequencia: v.consequencia || null, mudancas: lista(v.mudancas), patch: v };
    return rel;
}

module.exports = {
    sangueAfirmado,
    TIPOS_PLANO, VIAS, validarIdeias, validarBiblia, validarRoteiro, validarDecupagem, validarAtualizarMundo,
    votacaoValida, limitePalavras, ordenarGrafo, juntarPrompt,
};
