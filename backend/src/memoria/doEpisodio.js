// Memória que VEIO de um episódio: tirar da memória viva (guardando junto) e devolver depois.
// Usado ao apagar um episódio (guarda na pasta da lixeira do episódio) e ao refazer/restaurar o roteiro (guarda em
// episodios/epNN/_versoes/<data>/). Nada é destruído: o que sai da memória viva vai para <pastaGuarda>/memoria/.
//
// O que sai (só do episódio N; a bíblia e os outros episódios ficam):
//  - fatos.jsonl: linhas de fatos cuja origem é o Ep. N (id "epNN-…"; sem id de episódio, `desde`, senão `fonte`),
//    TODAS as linhas desses ids (inclusive encerramentos feitos depois) e os encerramentos `{id, ate: "epNN"}` que o
//    Ep. N fez em fatos de outros episódios (o fato volta a valer).
//  - resumos/epNN.md e propostas/epNN.json (a proposta aprovada não pode ser reaplicada por engano).
// O que NÃO sai (vira aviso): fato sem origem identificável, termos do glossário (não guardam a origem) e o estado.json
// (é uma foto do mundo depois do último episódio consolidado: as cópias de antes ficam em memoria/historico/).
//
// Tudo síncrono de propósito: ler, separar e regravar o fatos.jsonl acontece sem ceder a vez a outra requisição.
const fs = require('fs');
const path = require('path');
const { caminhosMemoria } = require('./arquivos');
const { epNum, epTag, lerJson, lerTexto, gravarTexto, gravarJson, acrescentarJsonl } = require('./util');

const PASTA_GUARDA = 'memoria';

const ehObjeto = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
// Linha que só encerra um fato (o que aplicarProposta grava): { id, ate, motivoFim?, registradoEm? }.
const soEncerramento = (l) => ehObjeto(l) && l.id && l.ate != null && l.texto === undefined && l.tipo === undefined;

function epDoId(id) {
    const m = /^ep(\d+)-/i.exec(String(id || ''));
    return m ? Number(m[1]) : null;
}

// Episódio de onde veio um fato (bíblia = 0) ou null quando não dá para saber.
function origemDoFato(l) {
    const porId = epDoId(l.id);
    if (porId != null) return porId;
    for (const campo of [l.desde, l.fonte]) {
        const n = epNum(campo);
        if (n != null) return n;
    }
    return null;
}

/**
 * Separa as linhas do fatos.jsonl: as que vieram do Ep. n (saem) e as que ficam (texto original, na ordem).
 * Linha quebrada fica onde está (não é nossa para mexer).
 */
function separarLinhas(texto, n) {
    const linhas = String(texto || '').split(/\r?\n/).filter((l) => l.trim());
    const lidas = linhas.map((bruta) => {
        try { return { bruta, obj: JSON.parse(bruta) }; } catch { return { bruta, obj: null }; }
    });
    const idsDoEp = new Set();
    for (const { obj } of lidas) {
        if (!ehObjeto(obj) || !obj.id) continue;
        if (soEncerramento(obj) ? epDoId(obj.id) === n : origemDoFato(obj) === n) idsDoEp.add(String(obj.id));
    }
    const sai = [];
    const fica = [];
    const semOrigem = new Set();
    let fatos = 0;
    let encerramentos = 0;
    for (const l of lidas) {
        const o = l.obj;
        if (!ehObjeto(o)) { fica.push(l.bruta); continue; }
        if (o.id && idsDoEp.has(String(o.id))) {
            sai.push(l.bruta);
            if (!soEncerramento(o)) fatos += 1;
            continue;
        }
        if (soEncerramento(o)) {
            if (epNum(o.ate) === n) { sai.push(l.bruta); encerramentos += 1; } else fica.push(l.bruta);
            continue;
        }
        if (origemDoFato(o) == null) semOrigem.add(String(o.id || o.texto || '?').slice(0, 40));
        fica.push(l.bruta);
    }
    return { sai, fica, ids: [...idsDoEp], fatos, encerramentos, semOrigem: [...semOrigem] };
}

function arquivosDoEp(pastaSerie, n) {
    const c = caminhosMemoria(pastaSerie);
    const tag = epTag(n);
    return {
        c,
        tag,
        resumo: path.join(c.resumos, `${tag}.md`),
        proposta: path.join(c.propostas, `${tag}.json`),
    };
}

function avisoSemOrigem(semOrigem, n) {
    if (!semOrigem.length) return null;
    const lista = semOrigem.slice(0, 5).join(', ') + (semOrigem.length > 5 ? '…' : '');
    return `${semOrigem.length === 1 ? '1 fato da memória não diz' : `${semOrigem.length} fatos da memória não dizem`} de qual episódio `
        + `${semOrigem.length === 1 ? 'veio' : 'vieram'} (${lista}): ficaram na memória. Confira na Memória se algum era do Ep. ${n}.`;
}

/** Só leitura: o que sairia da memória viva se o Ep. n saísse agora. */
function contarMemoriaDoEpisodio(pastaSerie, ep) {
    const n = epNum(ep);
    const a = arquivosDoEp(pastaSerie, n);
    const sep = separarLinhas(lerTexto(a.c.fatos, ''), n);
    const resumo = fs.existsSync(a.resumo);
    const proposta = fs.existsSync(a.proposta);
    const avisos = [];
    const s = avisoSemOrigem(sep.semOrigem, n);
    if (s) avisos.push(s);
    return { fatos: sep.fatos, encerramentos: sep.encerramentos, resumo, proposta, vazia: !sep.sai.length && !resumo && !proposta, avisos };
}

/**
 * Tira da memória viva o que veio do Ep. n e guarda em <pastaGuarda>/memoria/ (fatos.jsonl, resumos/, propostas/,
 * manifesto.json). Sem nada do episódio: não cria a pasta.
 * → { guardada: bool, fatos, encerramentos, resumo, proposta, ids, avisos }
 */
function retirarMemoriaDoEpisodio(pastaSerie, ep, pastaGuarda) {
    const n = epNum(ep);
    if (!n || n < 1) throw new Error(`Episódio inválido: ${ep}`);
    const a = arquivosDoEp(pastaSerie, n);
    const texto = lerTexto(a.c.fatos, null);
    const sep = separarLinhas(texto || '', n);
    const temResumo = fs.existsSync(a.resumo);
    const temProposta = fs.existsSync(a.proposta);
    const r = { guardada: false, fatos: sep.fatos, encerramentos: sep.encerramentos, resumo: temResumo, proposta: temProposta, ids: sep.ids, avisos: [] };
    const s = avisoSemOrigem(sep.semOrigem, n);
    if (s) r.avisos.push(s);
    if (!sep.sai.length && !temResumo && !temProposta) return r;

    const proposta = temProposta ? (() => { try { return lerJson(a.proposta, null); } catch { return null; } })() : null;
    const termos = proposta && proposta.aprovada && Array.isArray(proposta.glossarioNovo)
        ? proposta.glossarioNovo.map((t) => t && t.termo).filter(Boolean) : [];
    if (termos.length) {
        r.avisos.push(`Os termos do glossário que vieram do Ep. ${n} (${termos.slice(0, 5).join(', ')}${termos.length > 5 ? '…' : ''}) ficaram: o glossário não guarda de qual episódio veio cada termo.`);
    }
    const estado = (() => { try { return lerJson(a.c.estado, null); } catch { return null; } })();
    const ate = estado ? epNum(estado.atualizadoAte) : null;
    if (ate != null && ate >= n && (sep.sai.length || temResumo)) {
        r.avisos.push(`O estado do mundo (memoria/estado.json) foi consolidado até o Ep. ${ate} e ainda inclui o que aconteceu no Ep. ${n}: não mexi nele. As cópias de antes de cada aprovação ficam em memoria/historico/.`);
    }

    const g = path.join(pastaGuarda, PASTA_GUARDA);
    fs.mkdirSync(g, { recursive: true });
    // 1º a cópia guardada; só depois a memória viva muda (se algo falhar no meio, nada some).
    if (sep.sai.length) gravarTexto(path.join(g, 'fatos.jsonl'), sep.sai.join('\n') + '\n');
    gravarJson(path.join(g, 'manifesto.json'), {
        versao: 1,
        ep: a.tag,
        retiradoEm: new Date().toISOString(),
        fatos: sep.fatos,
        encerramentos: sep.encerramentos,
        ids: sep.ids,
        resumo: temResumo,
        proposta: temProposta,
        avisos: r.avisos,
        comoDevolver: 'Restaurar o episódio (lixeira) ou a versão do roteiro devolve tudo. À mão: acrescente as linhas de fatos.jsonl ao memoria/fatos.jsonl da série e mova resumos/ e propostas/ de volta para memoria/.',
    });
    if (temResumo) {
        fs.mkdirSync(path.join(g, 'resumos'), { recursive: true });
        fs.renameSync(a.resumo, path.join(g, 'resumos', path.basename(a.resumo)));
    }
    if (temProposta) {
        fs.mkdirSync(path.join(g, 'propostas'), { recursive: true });
        fs.renameSync(a.proposta, path.join(g, 'propostas', path.basename(a.proposta)));
    }
    if (sep.sai.length) gravarTexto(a.c.fatos, sep.fica.length ? sep.fica.join('\n') + '\n' : '');
    r.guardada = true;
    return r;
}

/** Só leitura: resumo do que está guardado em <pastaGuarda>/memoria/ (para listas e prévias). */
function lerMemoriaGuardada(pastaGuarda) {
    const g = path.join(pastaGuarda, PASTA_GUARDA);
    if (!fs.existsSync(g)) return null;
    let m = null;
    try { m = lerJson(path.join(g, 'manifesto.json'), null); } catch { m = null; }
    const linhas = String(lerTexto(path.join(g, 'fatos.jsonl'), '') || '').split(/\r?\n/).filter((l) => l.trim()).length;
    return {
        fatos: m && Number.isInteger(m.fatos) ? m.fatos : linhas,
        encerramentos: m && Number.isInteger(m.encerramentos) ? m.encerramentos : 0,
        resumo: fs.existsSync(path.join(g, 'resumos')) && fs.readdirSync(path.join(g, 'resumos')).some((x) => /\.md$/i.test(x)),
        retiradoEm: m ? m.retiradoEm || null : null,
    };
}

/**
 * Devolve à memória viva o que foi guardado em <pastaGuarda>/memoria/ para o Ep. n e apaga a cópia guardada (o
 * conteúdo voltou inteiro). Se a memória viva JÁ tem algo do Ep. n (consolidado de novo nesse meio tempo), não
 * mistura: a cópia vai para memoria/historico/epNN-nao-devolvida-<data>/ e volta um aviso.
 * → { devolvida: bool, fatos, encerramentos, resumo, proposta, avisos, historico? }
 */
function devolverMemoriaDoEpisodio(pastaSerie, ep, pastaGuarda) {
    const n = epNum(ep);
    if (!n || n < 1) throw new Error(`Episódio inválido: ${ep}`);
    const g = path.join(pastaGuarda, PASTA_GUARDA);
    const r = { devolvida: false, fatos: 0, encerramentos: 0, resumo: false, proposta: false, avisos: [] };
    if (!fs.existsSync(g)) return r;
    const a = arquivosDoEp(pastaSerie, n);
    const resumoG = path.join(g, 'resumos', path.basename(a.resumo));
    const propostaG = path.join(g, 'propostas', path.basename(a.proposta));
    const linhas = [];
    for (const bruta of String(lerTexto(path.join(g, 'fatos.jsonl'), '') || '').split(/\r?\n/)) {
        if (!bruta.trim()) continue;
        try { linhas.push(JSON.parse(bruta)); } catch { r.avisos.push('Uma linha guardada da memória estava quebrada e ficou de fora.'); }
    }

    const viva = separarLinhas(lerTexto(a.c.fatos, ''), n);
    const conflito = viva.fatos > 0 || fs.existsSync(a.resumo) || (fs.existsSync(a.proposta) && fs.existsSync(propostaG));
    if (conflito) {
        const carimbo = new Date().toISOString().replace(/[:.]/g, '-');
        const destino = path.join(a.c.historico, `${a.tag}-nao-devolvida-${carimbo}`);
        fs.mkdirSync(a.c.historico, { recursive: true });
        fs.renameSync(g, destino);
        r.historico = path.relative(pastaSerie, destino).split(path.sep).join('/');
        r.avisos.push(`A memória já tem fatos ou resumo novos do Ep. ${n}: não misturei. A memória antiga ficou em ${r.historico}.`);
        return r;
    }

    // ids que já têm linha na memória viva (não deveria acontecer): avisa, a ordem "última linha vence" decide.
    const vivos = new Set(viva.fica.map((b) => { try { return String(JSON.parse(b).id || ''); } catch { return ''; } }).filter(Boolean));
    const repetidos = [...new Set(linhas.filter((l) => !soEncerramento(l) && l.id && vivos.has(String(l.id))).map((l) => l.id))];
    if (repetidos.length) r.avisos.push(`Fatos com id repetido na memória (${repetidos.slice(0, 5).join(', ')}): vale a linha devolvida.`);

    if (linhas.length) acrescentarJsonl(a.c.fatos, linhas);
    r.fatos = linhas.filter((l) => !soEncerramento(l)).length;
    r.encerramentos = linhas.filter((l) => soEncerramento(l) && epDoId(l.id) !== n).length;
    if (fs.existsSync(resumoG)) {
        fs.mkdirSync(a.c.resumos, { recursive: true });
        fs.renameSync(resumoG, a.resumo);
        r.resumo = true;
    }
    if (fs.existsSync(propostaG)) {
        fs.mkdirSync(a.c.propostas, { recursive: true });
        fs.renameSync(propostaG, a.proposta);
        r.proposta = true;
    }
    fs.rmSync(g, { recursive: true, force: true }); // o conteúdo voltou inteiro para a memória viva
    r.devolvida = true;
    return r;
}

module.exports = {
    PASTA_GUARDA,
    separarLinhas,
    origemDoFato,
    contarMemoriaDoEpisodio,
    retirarMemoriaDoEpisodio,
    devolverMemoriaDoEpisodio,
    lerMemoriaGuardada,
};
