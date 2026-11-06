// Regras de leitura dos dados da série usadas pelas telas (sem rede).
import GlobalVar from '../subComponents/GlobalVar';

export const PASTA_DO_TIPO = { personagem: 'elenco', local: 'locais', objeto: 'objetos' };

// Teto de uma chamada de texto do showrunner (o servidor recusa acima disso).
export const TETO_ETAPA_USD = 0.05;

// Duração livre do episódio (mesmos limites do backend: series/validar.js).
export const DURACAO_MIN_S = 1;
export const DURACAO_MAX_S = 600;
export const LIMITE_SEM_ESCOLHA_S = 20; // abaixo disso não cabe a votação A/B (marcada sozinha)

// Caminho de uma imagem da ficha relativo à pasta da série (as fichas guardam caminho relativo à pasta da ficha).
export function caminhoDaFicha(ficha, relativo) {
    if (!ficha || !relativo) return null;
    const pasta = PASTA_DO_TIPO[ficha.tipo] || 'elenco';
    return `${pasta}/${ficha.id}/${relativo}`;
}

export function urlDaFicha(serieId, ficha, relativo) {
    const c = caminhoDaFicha(ficha, relativo);
    return c ? GlobalVar.urlMidia(serieId, c) : '';
}

// Todas as referências do estado atual (vista → caminho relativo à ficha).
export function refsDaFicha(ficha) {
    const estados = Array.isArray(ficha && ficha.estados) ? ficha.estados : [];
    const atual = estados.find((e) => e.id === ficha.estadoAtual) || estados[0];
    return atual && atual.refs ? Object.entries(atual.refs).map(([vista, caminho]) => ({ vista, caminho })) : [];
}

// Imagem principal: a canônica; sem ela, a primeira referência.
export function imagemPrincipal(ficha) {
    if (!ficha) return null;
    if (ficha.canonica) return ficha.canonica;
    const r = refsDaFicha(ficha);
    return r.length ? r[0].caminho : null;
}

// Caminho (relativo à série) da imagem principal de uma ficha, ou null.
export function caminhoPrincipal(ficha) {
    return ficha && !ficha.erro ? caminhoDaFicha(ficha, imagemPrincipal(ficha)) : null;
}

// Capa da série: serie.capa; senão a imagem do local que dá nome à série (o farol); senão o primeiro local/elenco com imagem.
export function capaDaSerie({ serie, elenco = [], locais = [] } = {}) {
    if (!serie) return null;
    if (serie.capa) return serie.capa;
    const comImagem = (lista) => lista.filter((f) => !f.erro && imagemPrincipal(f)).map((f) => ({ f, c: caminhoDaFicha(f, imagemPrincipal(f)) }));
    const locs = comImagem(locais);
    const partes = String(serie.id || '').split('-');
    const doTitulo = locs.find((l) => partes.includes(l.f.id));
    const escolhida = doTitulo || locs[0] || comImagem(elenco)[0];
    return escolhida ? escolhida.c : null;
}

// Quadros do cabeçalho de cena: a capa primeiro, depois locais e elenco com imagem (sem repetir).
export function quadrosDaSerie(dados, max = 6) {
    const lista = [capaDaSerie(dados)];
    for (const f of [...(dados.locais || []), ...(dados.elenco || [])]) lista.push(caminhoPrincipal(f));
    return [...new Set(lista.filter(Boolean))].slice(0, max);
}

export function indiceEtapa(id) {
    return GlobalVar.ETAPAS.findIndex((e) => e.id === id);
}

// Classe de cor do estado (texto, sem pílula): publicado = ok; ideia = neutro; votação = ação; o resto, texto normal.
export function classeEstado(status) {
    if (status === 'publicado') return 'ok';
    if (status === 'ideia' || !status) return 'neutro';
    if (status === 'votacao') return 'acao';
    return 'andamento';
}

// ---------------------------------------------------------------- duração livre
const entradaDoEpisodio = (serie, n) => (serie && Array.isArray(serie.episodios) ? serie.episodios : []).find((e) => e.n === n) || null;

// Duração-alvo (s): a do episódio (serie.json) > a do roteiro > a padrão da série > 60.
// O episódio vence: salvar um roteiro grava a duração dele no serie.json, e "Duração" (AlterarDuracaoEpisodio) troca
// só o serie.json até o roteiro ser ajustado — a tela mostra a duração NOVA e avisa que o roteiro ficou para trás.
export function duracaoDoEpisodio(serie, n, roteiro) {
    const e = entradaDoEpisodio(serie, n);
    const d = Number((e && e.duracaoAlvoS) || (roteiro && roteiro.duracaoAlvoS) || (serie && serie.duracaoAlvoS) || 60);
    return Number.isFinite(d) && d > 0 ? d : 60;
}

// Sem votação A/B: marcado no episódio (salvar o roteiro grava) > roteiro salvo sem escolhas > abaixo de 20 s.
export function semEscolhaDoEpisodio(serie, n, roteiro) {
    const e = entradaDoEpisodio(serie, n);
    if (e && typeof e.semEscolha === 'boolean') return e.semEscolha;
    if (roteiro && roteiro.escolhas === null) return true;
    if (roteiro && roteiro.escolhas) return false;
    return duracaoDoEpisodio(serie, n, roteiro) < LIMITE_SEM_ESCOLHA_S;
}

// "1 plano", "8 planos"
export function plural(n, um, varios) {
    return `${n} ${Number(n) === 1 ? um : varios}`;
}

// O que a memória da série tem de um episódio ({ fatos, encerramentos, resumo }), em texto: "2 fatos e o resumo".
// Vazio ('') quando não há nada.
export function textoMemoria(m) {
    if (!m) return '';
    const partes = [];
    if (m.fatos > 0) partes.push(plural(m.fatos, 'fato', 'fatos'));
    if (m.resumo) partes.push('o resumo');
    if (!partes.length && m.encerramentos > 0) partes.push(plural(m.encerramentos, 'fato encerrado', 'fatos encerrados'));
    return partes.join(' e ');
}

// "60 s", "7,5 s"
export function textoDuracao(s) {
    const v = Math.round(Number(s) * 10) / 10;
    if (!Number.isFinite(v)) return '—';
    return `${String(v).replace('.', ',')} s`;
}

// Mesma faixa de planos que o showrunner recebe (backend/src/showrunner/prompts.js).
export function faixaPlanos(alvo) {
    if (alvo <= 8) return '1 a 2 planos';
    if (alvo <= 20) return '2 a 4 planos';
    if (alvo <= 45) return '4 a 7 planos';
    return '6 a 9 planos';
}

// Quantos planos de 2 a 10 s cabem (estimativa só para a prévia da fita; quem decide é o roteiro).
export function estimarPlanos(alvo) {
    const d = Math.max(DURACAO_MIN_S, Number(alvo) || 0);
    const meio = Math.round(d / 7.5);
    return Math.max(1, Math.min(Math.max(meio, Math.ceil(d / 10)), Math.max(1, Math.floor(d / 2))));
}

// ---------------------------------------------------------------- episódios
// Episódios da temporada: o mapa da bíblia + o que já existe no serie.json (+ detalhes lidos do episódio).
export function episodiosDaTemporada(serie, biblia, detalhes = {}) {
    const doMapa = Array.isArray(biblia && biblia.temporada) ? biblia.temporada : [];
    const criados = Array.isArray(serie && serie.episodios) ? serie.episodios : [];
    const ns = new Set([...doMapa.map((t) => t.n), ...criados.map((e) => e.n)]);
    return [...ns].sort((a, b) => a - b).map((n) => {
        const t = doMapa.find((x) => x.n === n) || {};
        const e = criados.find((x) => x.n === n);
        const escolha = ((biblia && biblia.escolhas) || []).find((x) => x.ep === n) || null;
        const det = detalhes[n] || null;
        const roteiro = det && det.roteiro;
        return {
            n,
            titulo: (e && e.titulo) || t.titulo || `Episódio ${n}`,
            fase: t.fase || '',
            resumo: (roteiro && roteiro.resumo) || t.resumo || '',
            status: (e && e.status) || t.status || 'ideia',
            criado: Boolean(e),
            escolha,
            detalhe: det,
            duracaoAlvoS: duracaoDoEpisodio(serie, n, roteiro),
            semEscolha: semEscolhaDoEpisodio(serie, n, roteiro),
        };
    });
}

// Imagem do pôster do episódio: o local (ou quem aparece) do primeiro plano com imagem; senão a capa da série.
export function imagemDoEpisodio(dados, ep) {
    const r = ep && ep.detalhe && ep.detalhe.roteiro;
    const fichaPorId = (lista, id) => (lista || []).find((f) => f.id === id && !f.erro);
    if (r && Array.isArray(r.planos)) {
        for (const p of r.planos) {
            const local = caminhoPrincipal(fichaPorId(dados.locais, p.local));
            if (local) return local;
            for (const id of p.elenco || []) {
                const c = caminhoPrincipal(fichaPorId(dados.elenco, id));
                if (c) return c;
            }
        }
    }
    return ep && ep.criado ? capaDaSerie(dados) : null;
}

// Resumo do que a Mesa já tem (vem de GET /LerEdicao): falas com áudio, planos com vídeo e a montagem.
export function resumoDaEdicao(r) {
    if (!r) return null;
    const ed = r.edicao || null;
    const faixas = (ed && ed.faixas) || {};
    const falas = [...(faixas.narracao || []), ...(faixas.falas || [])];
    const planos = ed && Array.isArray(ed.planos) ? ed.planos.map((p) => p.n) : [];
    const comVideo = new Set((faixas.video || []).filter((v) => v.arquivo).map((v) => v.plano));
    const render = r.render || { status: 'nenhum' };
    return {
        temEdicao: Boolean(ed),
        falas: { feitas: falas.filter((f) => f.arquivo).length, total: falas.length },
        video: { feitos: planos.filter((n) => comVideo.has(n)).length, total: planos.length },
        render,
        saida: render.status === 'pronto' && render.saida ? render.saida : null,
    };
}

// As quatro etapas do episódio (roteiro, falas, vídeo, montado) com estado por ícone + texto.
// estado: ok | aviso | andamento | perigo | falta | carregando
export function etapasDoEpisodio(ep, resumo) {
    const r = ep && ep.detalhe && ep.detalhe.roteiro;
    const carregando = ep && ep.criado && resumo === undefined;
    const etapa = (id, nome, estado, texto) => ({ id, nome, estado, texto });
    const lista = [];
    if (!r) lista.push(etapa('roteiro', 'Roteiro', 'falta', ep && ep.criado ? 'Sem roteiro' : 'Episódio não criado'));
    else lista.push(etapa('roteiro', 'Roteiro', r.aprovado === true ? 'ok' : 'aviso', r.aprovado === true ? 'Aprovado' : 'A aprovar'));

    if (carregando) {
        ['falas', 'video', 'montado'].forEach((id) => lista.push(etapa(id, { falas: 'Falas', video: 'Vídeo', montado: 'Montado' }[id], 'carregando', 'Lendo…')));
        return lista;
    }
    const f = resumo ? resumo.falas : { feitas: 0, total: 0 };
    if (!f.total) lista.push(etapa('falas', 'Falas', 'falta', 'A gerar'));
    else if (f.feitas >= f.total) lista.push(etapa('falas', 'Falas', 'ok', f.total === 1 ? '1 pronta' : `${f.total} prontas`));
    else lista.push(etapa('falas', 'Falas', f.feitas ? 'aviso' : 'falta', `${f.feitas} de ${f.total}`));

    const v = resumo ? resumo.video : { feitos: 0, total: 0 };
    if (!v.total) lista.push(etapa('video', 'Vídeo', 'falta', 'A gerar'));
    else if (v.feitos >= v.total) lista.push(etapa('video', 'Vídeo', 'ok', plural(v.total, 'plano', 'planos')));
    else lista.push(etapa('video', 'Vídeo', v.feitos ? 'aviso' : 'falta', `${v.feitos} de ${plural(v.total, 'plano', 'planos')}`));

    const st = resumo && resumo.render ? resumo.render.status : 'nenhum';
    if (st === 'pronto') lista.push(etapa('montado', 'Montado', 'ok', resumo.render.duracaoS ? textoDuracao(resumo.render.duracaoS) : 'Pronto'));
    else if (st === 'montando') lista.push(etapa('montado', 'Montado', 'andamento', `Montando${Number.isFinite(resumo.render.pct) ? ` ${Math.round(resumo.render.pct)}%` : ''}`));
    else if (st === 'falhou' || st === 'interrompido') lista.push(etapa('montado', 'Montado', 'perigo', 'Falhou'));
    else lista.push(etapa('montado', 'Montado', 'falta', 'Não montado'));
    return lista;
}

// ---------------------------------------------------------------- próximos passos
// O que falta fazer, a partir dos dados reais (nada inventado).
export function proximosPassos({ serie, biblia, elenco = [], locais = [], objetos = [] }, detalhes = {}) {
    const passos = [];
    const eps = episodiosDaTemporada(serie, biblia, detalhes);
    for (const ep of eps.filter((e) => e.criado)) {
        const r = ep.detalhe && ep.detalhe.roteiro;
        if (!r) {
            passos.push({ id: `roteiro-${ep.n}`, tipo: 'roteiro', texto: `Escrever o roteiro do Ep. ${ep.n}`, detalhe: `${ep.titulo}, ${textoDuracao(ep.duracaoAlvoS)}${ep.semEscolha ? ', sem votação' : ''}`, aba: 'episodios', ep: ep.n });
        } else if (r.aprovado !== true) {
            const planos = Array.isArray(r.planos) ? r.planos.length : 0;
            passos.push({
                id: `aprovar-${ep.n}`,
                tipo: 'aprovar',
                texto: `Revisar e aprovar o roteiro do Ep. ${ep.n}: ${ep.titulo}`,
                detalhe: `${plural(planos, 'plano', 'planos')}, ${textoDuracao(ep.duracaoAlvoS)}, ${ep.semEscolha ? 'sem votação' : `escolha A/B ${r.escolhas ? 'definida' : 'pendente'}`}`,
                aba: 'episodios',
                ep: ep.n,
                mesa: ep.n,
            });
        }
    }
    for (const f of elenco.filter((x) => !x.erro)) {
        const cand = Array.isArray(f.candidatas) ? f.candidatas.length : 0;
        if (!f.canonica && cand > 0) {
            passos.push({ id: `rosto-${f.id}`, tipo: 'rosto', texto: `Escolher o rosto canônico de ${f.nome}`, detalhe: `${cand} candidatas com rostos diferentes`, aba: 'elenco', ficha: f.id });
        } else if (!imagemPrincipal(f)) {
            passos.push({ id: `folha-${f.id}`, tipo: 'folha', texto: `Gerar a folha de personagem de ${f.nome}`, detalhe: 'Frente, perfil e corpo inteiro. O custo aparece antes.', aba: 'elenco', ficha: f.id });
        }
    }
    const locaisSem = locais.filter((f) => !f.erro && !imagemPrincipal(f)).length;
    if (locaisSem) passos.push({ id: 'locais', tipo: 'local', texto: `${locaisSem} ${locaisSem === 1 ? 'local' : 'locais'} sem imagem de referência`, detalhe: 'Elenco e locais › Locais', aba: 'elenco', sub: 'locais' });
    const objSem = objetos.filter((f) => !f.erro && !imagemPrincipal(f)).length;
    if (objSem) passos.push({ id: 'objetos', tipo: 'objeto', texto: `${objSem} ${objSem === 1 ? 'objeto' : 'objetos'} sem imagem de referência`, detalhe: 'Elenco e locais › Objetos', aba: 'elenco', sub: 'objetos' });
    for (const ep of eps) {
        if (ep.escolha && !ep.escolha.vencedora && ['publicado', 'votacao'].includes(ep.status)) {
            passos.push({ id: `voto-${ep.n}`, tipo: 'voto', texto: `Registrar a votação real do Ep. ${ep.n}`, detalhe: `${ep.escolha.A} × ${ep.escolha.B}`, aba: 'temporada', ep: ep.n });
        }
    }
    return passos;
}

