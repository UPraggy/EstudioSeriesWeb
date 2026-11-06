// Leitura do registro (logs/registro-AAAA-MM-DD.jsonl): busca paginada (mais recentes primeiro) e resumo por dia.
// Só leitura. Linhas quebradas (ex.: queda no meio da escrita) são puladas.
const fs = require('fs');
const path = require('path');
const { pastaLogs, RE_ARQUIVO, NIVEIS, AREAS, diaDe } = require('./registro');

const LIMITE_PADRAO = 100;
const LIMITE_MAX = 500;

/** Dias com registro, do mais novo para o mais velho. */
function diasDisponiveis(pasta = pastaLogs()) {
    let nomes = [];
    try { nomes = fs.readdirSync(pasta); } catch { return []; }
    return nomes.map((n) => RE_ARQUIVO.exec(n)).filter(Boolean).map((m) => m[1]).sort().reverse();
}

function lerLinhas(arquivo) {
    let texto = '';
    try { texto = fs.readFileSync(arquivo, 'utf8'); } catch { return []; }
    const out = [];
    for (const l of texto.split('\n')) {
        if (!l.trim()) continue;
        try {
            const o = JSON.parse(l);
            if (o && typeof o === 'object' && o.em) out.push(o);
        } catch { /* linha quebrada */ }
    }
    return out;
}

const lista = (v) => (Array.isArray(v) ? v : String(v || '').split(',')).map((s) => String(s).trim()).filter(Boolean);
const RE_DIA = /^\d{4}-\d{2}-\d{2}$/;

function criarFiltro({ nivel, area, serie, busca, antesDe } = {}) {
    const niveis = lista(nivel).filter((n) => NIVEIS.includes(n));
    const areas = lista(area).filter((a) => AREAS.includes(a));
    const series = lista(serie);
    const termo = String(busca || '').trim().toLowerCase();
    const antes = antesDe ? String(antesDe) : null;
    return (l) => {
        if (antes && !(l.em < antes)) return false;
        if (niveis.length && !niveis.includes(l.nivel)) return false;
        if (areas.length && !areas.includes(l.area)) return false;
        if (series.length && !series.includes(l.serie)) return false;
        if (termo) {
            const alvo = `${l.evento || ''} ${l.msg || ''} ${l.area || ''} ${l.serie || ''} ${l.dados ? JSON.stringify(l.dados) : ''}`.toLowerCase();
            if (!alvo.includes(termo)) return false;
        }
        return true;
    };
}

/**
 * lerRegistro({ dia?, nivel?, area?, serie?, busca?, limite?, antesDe?, pasta? })
 * nivel/area/serie aceitam vários separados por vírgula ("aviso,erro").
 * antesDe = o `em` do último evento da página anterior ("carregar mais").
 * → { eventos, temMais, proximoAntesDe, dias, pasta }
 */
function lerRegistro(op = {}) {
    const pasta = op.pasta || pastaLogs();
    const limite = Math.max(1, Math.min(LIMITE_MAX, Math.floor(Number(op.limite)) || LIMITE_PADRAO));
    const dias = diasDisponiveis(pasta);
    let alvo = dias;
    if (op.dia) {
        const dia = String(op.dia).trim();
        if (!RE_DIA.test(dia)) throw Object.assign(new Error('Dia inválido: use AAAA-MM-DD.'), { status: 400 });
        alvo = dias.filter((d) => d === dia);
    }
    // com antesDe, os dias depois dele não têm o que mostrar
    if (op.antesDe) {
        const diaCursor = diaDe(new Date(op.antesDe));
        if (RE_DIA.test(diaCursor)) alvo = alvo.filter((d) => d <= diaCursor);
    }
    const filtro = criarFiltro(op);
    const eventos = [];
    let temMais = false;
    for (const dia of alvo) {
        const linhas = lerLinhas(path.join(pasta, `registro-${dia}.jsonl`)).filter(filtro);
        linhas.sort((a, b) => (a.em < b.em ? 1 : a.em > b.em ? -1 : 0));
        for (const l of linhas) {
            if (eventos.length >= limite) {
                // não separa eventos do mesmo instante entre duas páginas (o cursor é "antes de")
                if (l.em === eventos[eventos.length - 1].em) { eventos.push(l); continue; }
                temMais = true;
                break;
            }
            eventos.push(l);
        }
        if (temMais) break;
    }
    return {
        eventos,
        temMais,
        proximoAntesDe: temMais && eventos.length ? eventos[eventos.length - 1].em : null,
        dias,
    };
}

// ---------------------------------------------------------------- resumo por dia
const cacheDia = new Map(); // arquivo → { mtimeMs, size, resumo }

function resumirLinhas(dia, linhas) {
    const r = {
        dia, eventos: linhas.length, requisicoes: 0, errosHttp: 0, erros: 0, avisos: 0, gastoUsd: 0,
        geracoes: 0, chamadasIa: 0, renders: 0, rendersFalhos: 0, renderMedioMs: null, primeiro: null, ultimo: null,
        porArea: {},
    };
    let somaRender = 0;
    for (const l of linhas) {
        if (l.nivel === 'erro') r.erros += 1;
        if (l.nivel === 'aviso') r.avisos += 1;
        r.porArea[l.area] = (r.porArea[l.area] || 0) + 1;
        if (!r.primeiro || l.em < r.primeiro) r.primeiro = l.em;
        if (!r.ultimo || l.em > r.ultimo) r.ultimo = l.em;
        if (l.area === 'http') {
            if (l.evento === 'requisicao') r.requisicoes += 1;
            else if (l.evento === 'agregado') r.requisicoes += Number(l.dados && l.dados.quantidade) || 0;
            if (Number(l.dados && l.dados.status) >= 400) r.errosHttp += 1;
        }
        // custoUsd só aparece em gasto REAL (cotação usa dados.previstoUsd)
        if (typeof l.custoUsd === 'number' && Number.isFinite(l.custoUsd)) r.gastoUsd += l.custoUsd;
        if (l.area === 'openrouter' && l.evento === 'job-criado') r.geracoes += 1;
        if (l.area === 'openrouter' && l.evento === 'texto') r.chamadasIa += 1;
        if (l.area === 'render' && l.evento === 'concluido') {
            r.renders += 1;
            if (typeof l.ms === 'number') somaRender += l.ms;
        }
        if (l.area === 'render' && l.evento === 'falhou') r.rendersFalhos += 1;
    }
    r.gastoUsd = Math.round(r.gastoUsd * 1e6) / 1e6;
    r.renderMedioMs = r.renders ? Math.round(somaRender / r.renders) : null;
    return r;
}

function resumoDoDia(pasta, dia) {
    const arquivo = path.join(pasta, `registro-${dia}.jsonl`);
    let st;
    try { st = fs.statSync(arquivo); } catch { return resumirLinhas(dia, []); }
    const c = cacheDia.get(arquivo);
    if (c && c.mtimeMs === st.mtimeMs && c.size === st.size) return c.resumo;
    const resumo = resumirLinhas(dia, lerLinhas(arquivo));
    cacheDia.set(arquivo, { mtimeMs: st.mtimeMs, size: st.size, resumo });
    return resumo;
}

/**
 * resumirRegistro({ dias = 7, pasta?, agora? }) → { dias: [resumo por dia, do mais novo], totais, diasComRegistro }
 * Inclui dias sem registro (zerados) para a tela mostrar a sequência.
 */
function resumirRegistro(op = {}) {
    const pasta = op.pasta || pastaLogs();
    const n = Math.max(1, Math.min(90, Math.floor(Number(op.dias)) || 7));
    const agora = op.agora ? new Date(op.agora) : new Date();
    const dias = [];
    for (let i = 0; i < n; i++) {
        const d = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - i);
        dias.push(resumoDoDia(pasta, diaDe(d)));
    }
    const totais = { eventos: 0, requisicoes: 0, errosHttp: 0, erros: 0, avisos: 0, gastoUsd: 0, geracoes: 0, chamadasIa: 0, renders: 0, rendersFalhos: 0, renderMedioMs: null };
    let somaRender = 0;
    for (const d of dias) {
        for (const k of Object.keys(totais)) if (k !== 'renderMedioMs') totais[k] += d[k];
        if (d.renderMedioMs) somaRender += d.renderMedioMs * d.renders;
    }
    totais.gastoUsd = Math.round(totais.gastoUsd * 1e6) / 1e6;
    totais.renderMedioMs = totais.renders ? Math.round(somaRender / totais.renders) : null;
    return { dias, totais, diasComRegistro: diasDisponiveis(pasta) };
}

module.exports = { lerRegistro, resumirRegistro, resumirLinhas, diasDisponiveis, LIMITE_PADRAO, LIMITE_MAX };
