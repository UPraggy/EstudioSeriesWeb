// DO ROTEIRO AO VÍDEO (06/11/2026): UM cálculo só para a página do episódio, a Mesa e a Visão geral.
// O estado REAL de cada etapa vem do GET /EstadoProducao (backend/src/edicao/producao.js). Sem a rota (backend antigo,
// ainda não reiniciado), producaoDaEdicao monta o mesmo formato a partir do /LerEdicao, com menos detalhe (limitado).
// estado de cada etapa: feito | falta | aviso | andamento | perigo | bloqueado | opcional
import { EstadoProducao, LerEdicao, rotaIndisponivel } from '../funcionalidades/bancoGet';
import { erroDe } from '../funcionalidades/fetchFunc';
import { imagemPrincipal, plural, textoDuracao } from './serieUtil';

export const ETAPAS_PRODUCAO = [
    { id: 'roteiro', nome: 'Roteiro aprovado' },
    { id: 'falas', nome: 'Falas' },
    { id: 'decupagem', nome: 'Decupagem' },
    { id: 'quadros', nome: 'Quadros-chave' },
    { id: 'videos', nome: 'Vídeos' },
    { id: 'montado', nome: 'Montado' },
    { id: 'votacao', nome: 'Votação' },
];

const pl = (n, um, varios) => plural(n, um, varios);

// Resposta do /LerEdicao (+ o roteiro completo, que traz "aprovado") no formato do /EstadoProducao.
export function producaoDaEdicao(r, roteiroCompleto = null, entrada = {}) {
    const ed = (r && r.edicao) || null;
    const roteiro = roteiroCompleto || (r && r.roteiro) || null;
    const planosRot = roteiro && Array.isArray(roteiro.planos) ? roteiro.planos : [];
    const fim = planosRot.reduce((m, p) => Math.max(m, Number(p.ateS) || 0), 0);
    const alvo = Number(entrada.duracaoAlvoS || (roteiro && roteiro.duracaoAlvoS) || 60);
    const faixas = (ed && ed.faixas) || {};
    const falas = [...(faixas.narracao || []), ...(faixas.falas || [])];
    const planos = ed && Array.isArray(ed.planos) ? ed.planos : planosRot;
    const regs = (r && r.mesa && r.mesa.regeracoes) || [];
    const videos = planos.map((p) => {
        const segs = (faixas.video || []).filter((v) => v.plano === p.n && v.arquivo);
        const take = segs.find((v) => v.origem === 'take' || v.take);
        const acervo = segs.find((v) => v.origem === 'acervo');
        const fonte = take ? 'take' : acervo ? 'acervo' : null;
        const g = regs.find((x) => x.plano === p.n && x.status === 'gerando');
        return {
            n: p.n, tipo: p.tipo || 'video_ia', deS: p.deS, ateS: p.ateS, duracaoS: Number(p.ateS) - Number(p.deS), fonte,
            pronto: fonte === 'take' || (fonte === 'acervo' && p.tipo === 'reaproveitar'), gerando: g ? { id: g.id, etapa: g.etapa } : null,
            quadroChave: Boolean(p.quadroChave && p.quadroChave.arquivo), prompt: p.prompt || p.visual || '', modelo: p.modelo || null,
        };
    });
    const render = (r && r.render) || { status: 'nenhum' };
    return {
        limitado: true,
        duracaoAlvoS: alvo,
        semEscolha: Boolean(entrada.semEscolha),
        roteiro: roteiro ? {
            existe: true, aprovado: roteiro.aprovado === true, planos: planosRot.length, duracaoAlvoS: roteiro.duracaoAlvoS, duracaoPlanosS: fim,
            foraDaDuracao: Math.abs(fim - alvo) > Math.max(0.5, Math.min(3, alvo * 0.1)),
        } : { existe: false, aprovado: false, planos: 0 },
        falas: {
            existe: Boolean(r && r.episodio && r.episodio.temFalas), total: falas.length, prontas: falas.filter((f) => f.arquivo).length,
            estimadas: Boolean(ed && ed.origem && ed.origem.falas === 'estimadas'), vozesMudaram: [], errosVoz: [],
        },
        decupagem: { existe: false, decupados: 0, total: planosRot.length, faltam: [], desconhecida: true },
        quadros: { com: videos.filter((v) => v.quadroChave).length, total: videos.length },
        videos: {
            total: videos.length, prontos: videos.filter((v) => v.pronto).length, comTake: videos.filter((v) => v.fonte === 'take').length,
            gerando: videos.filter((v) => v.gerando).length, planos: videos,
        },
        edicao: ed ? { existe: true, revisao: ed.revisao, duracaoS: ed.duracaoS } : { existe: false },
        render: { status: render.status || 'nenhum', saida: render.status === 'pronto' ? render.saida || null : null, duracaoS: render.duracaoS ?? null, pct: render.pct ?? null },
        votacao: { semEscolha: Boolean(entrada.semEscolha), registrada: false, vencedora: null },
        modelos: (r && r.serie && r.serie.modelos) || {},
        orcamento: (r && r.serie && r.serie.orcamento) || {},
    };
}

// Lê o estado do episódio: /EstadoProducao; sem a rota, o /LerEdicao (limitado). null = erro.
export async function lerProducao(serie, ep, { roteiro = null, entrada = {} } = {}) {
    const r = await EstadoProducao({ serie, ep });
    if (!rotaIndisponivel(r) && !erroDe(r)) return r;
    if (!rotaIndisponivel(r)) return { erro: erroDe(r) };
    const e = await LerEdicao({ serie, ep });
    if (erroDe(e)) return { erro: erroDe(e) };
    return producaoDaEdicao(e, roteiro, entrada);
}

/**
 * etapasProducao(prod) → [{ id, n, nome, estado, motivo, acao }] na ordem real do trabalho.
 * acao (quem desenha decide o destino): escreverRoteiro | aprovarRoteiro | ajustarDuracao | gerarFalas | regerarFalas |
 * decupar | quadros | gerarVideos | montar | votar | null
 */
export function etapasProducao(prod) {
    if (!prod || prod.erro) return [];
    const e = [];
    const add = (id, estado, motivo, acao = null) => e.push({ ...ETAPAS_PRODUCAO.find((x) => x.id === id), n: e.length + 1, estado, motivo, acao });
    const r = prod.roteiro || {};
    const aprovado = r.aprovado === true;
    const temEdicao = Boolean(prod.edicao && prod.edicao.existe);
    if (!r.existe) add('roteiro', 'falta', 'Sem roteiro ainda.', 'escreverRoteiro');
    else if (r.foraDaDuracao) add('roteiro', 'aviso', `O roteiro tem ${textoDuracao(r.duracaoPlanosS)} e o episódio agora tem ${textoDuracao(prod.duracaoAlvoS)}.`, 'ajustarDuracao');
    else if (!aprovado) add('roteiro', 'falta', `Escrito (${pl(r.planos, 'plano', 'planos')}): falta você aprovar.`, 'aprovarRoteiro');
    else add('roteiro', 'feito', `${pl(r.planos, 'plano', 'planos')}, ${textoDuracao(r.duracaoPlanosS || prod.duracaoAlvoS)}.`);

    const f = prod.falas || {};
    const mud = f.vozesMudaram || [];
    const comVozAntiga = mud.reduce((t, m) => t + m.falas.length, 0);
    if (!aprovado) add('falas', 'bloqueado', 'Depois do roteiro aprovado.');
    else if (!f.total || (!temEdicao && !f.existe)) add('falas', 'falta', 'Narração e falas pelo TTS (grátis). Elas definem quanto dura cada plano.', 'gerarFalas');
    else if (f.estimadas) add('falas', 'falta', 'A edição usa tempos estimados: gere o áudio das falas (grátis).', 'gerarFalas');
    else if (comVozAntiga) add('falas', 'aviso', `${pl(comVozAntiga, 'fala', 'falas')} com voz antiga (${mud.map((m) => m.nome).join(', ')}).`, 'regerarFalas');
    else if (f.prontas < f.total) add('falas', 'aviso', `${f.prontas} de ${f.total} com áudio.`, 'gerarFalas');
    else add('falas', 'feito', `${f.total === 1 ? '1 pronta' : `${f.total} prontas`}.`, 'regerarFalas');

    const d = prod.decupagem || {};
    if (!aprovado) add('decupagem', 'bloqueado', 'Depois do roteiro aprovado.');
    else if (d.desconhecida) add('decupagem', 'opcional', 'Reinicie o Estúdio para acompanhar a decupagem aqui.', 'decupar');
    else if (d.total && d.decupados >= d.total) add('decupagem', 'feito', `Pedido de vídeo pronto para ${d.total === 1 ? 'o plano' : `os ${d.total} planos`}.`, 'decupar');
    else if (d.decupados > 0) add('decupagem', 'aviso', `${d.decupados} de ${pl(d.total, 'plano', 'planos')} decupados.`, 'decupar');
    else add('decupagem', 'falta', 'A IA escreve o pedido de vídeo de cada plano (câmera, ação, estilo).', 'decupar');

    const q = prod.quadros || {};
    if (!temEdicao) add('quadros', 'bloqueado', 'Opcional, depois das falas.');
    else if (q.total && q.com >= q.total) add('quadros', 'feito', `Todos os planos com imagem de partida.`, 'quadros');
    else add('quadros', 'opcional', q.com ? `${q.com} de ${q.total} planos com imagem de partida (opcional).` : 'Opcional: uma imagem de partida por plano deixa o vídeo mais fiel.', 'quadros');

    const v = prod.videos || {};
    if (!temEdicao) add('videos', 'bloqueado', aprovado ? 'Depois das falas: elas definem o tempo de cada plano.' : 'Depois do roteiro aprovado.');
    else if (v.gerando) add('videos', 'andamento', `Gerando ${pl(v.gerando, 'plano', 'planos')}; ${v.prontos} de ${v.total} prontos.`, 'gerarVideos');
    else if (v.total && v.prontos >= v.total) add('videos', 'feito', `${v.total} de ${pl(v.total, 'plano', 'planos')} com vídeo.`, 'gerarVideos');
    else {
        const falhou = (v.planos || []).filter((p) => p.falhou).length;
        add('videos', falhou ? 'perigo' : 'falta', `${v.prontos} de ${pl(v.total, 'plano', 'planos')} com vídeo${falhou ? ` (${falhou} falhou)` : ''}.`, 'gerarVideos');
    }

    const rd = prod.render || {};
    if (rd.status === 'pronto') add('montado', 'feito', rd.duracaoS ? `Montado: ${textoDuracao(rd.duracaoS)}.` : 'Montado.', 'montar');
    else if (rd.status === 'montando') add('montado', 'andamento', `Montando${Number.isFinite(rd.pct) ? ` ${Math.round(rd.pct)}%` : ''}.`, 'montar');
    else if (rd.status === 'falhou' || rd.status === 'interrompido') add('montado', 'perigo', 'A última montagem falhou: monte de novo.', 'montar');
    else if (!temEdicao) add('montado', 'bloqueado', 'Depois das falas e dos vídeos.');
    else if (v.total && v.prontos < v.total) add('montado', 'falta', `Dá para montar já, mas ${pl(v.total - v.prontos, 'plano fica', 'planos ficam')} sem vídeo (tela preta).`, 'montar');
    else add('montado', 'falta', 'Tudo pronto para montar o episódio.', 'montar');

    const vt = prod.votacao || {};
    if (prod.semEscolha || vt.semEscolha) add('votacao', 'feito', 'Sem votação neste episódio.');
    else if (vt.registrada) add('votacao', 'feito', `Votação registrada${vt.vencedora ? `: venceu ${vt.vencedora}` : ''}.`, 'votar');
    else if (rd.status === 'pronto') add('votacao', 'falta', 'Publique e registre os votos reais (A ou B).', 'votar');
    else add('votacao', 'bloqueado', 'Depois de montado e publicado.');
    return e;
}

// A próxima etapa (a primeira que não está feita, nem bloqueada, nem opcional). Em andamento conta: é a atual.
// Montar com planos sem vídeo não é "próxima": antes vêm os vídeos.
export function proximaEtapa(etapas) {
    return (etapas || []).find((x) => ['andamento', 'perigo', 'aviso', 'falta'].includes(x.estado)) || null;
}

// Os quatro selos do pôster/cabeçalho do episódio (Roteiro, Falas, Vídeo, Montado), do MESMO cálculo das etapas.
// estado no formato dos selos: ok | aviso | andamento | perigo | falta | carregando
const SELO = { feito: 'ok', aviso: 'aviso', andamento: 'andamento', perigo: 'perigo', falta: 'falta', bloqueado: 'falta', opcional: 'falta' };
export function selosEpisodio(prod, { criado = true, temRoteiro = false } = {}) {
    if (prod === undefined) {
        return [
            { id: 'roteiro', nome: 'Roteiro', estado: temRoteiro ? 'carregando' : 'falta', texto: temRoteiro ? 'Lendo…' : criado ? 'Sem roteiro' : 'Episódio não criado' },
            ...['falas', 'video', 'montado'].map((id) => ({ id, nome: { falas: 'Falas', video: 'Vídeo', montado: 'Montado' }[id], estado: 'carregando', texto: 'Lendo…' })),
        ];
    }
    const et = Object.fromEntries(etapasProducao(prod || {}).map((x) => [x.id, x]));
    const r = (prod && prod.roteiro) || {};
    const f = (prod && prod.falas) || {};
    const v = (prod && prod.videos) || {};
    const rd = (prod && prod.render) || {};
    const voz = (f.vozesMudaram || []).length;
    const sel = (id, nome, e, texto) => ({ id, nome, estado: SELO[e ? e.estado : 'falta'] || 'falta', texto, motivo: e ? e.motivo : '' });
    return [
        sel('roteiro', 'Roteiro', et.roteiro, !r.existe ? 'Sem roteiro' : r.foraDaDuracao ? 'Fora da duração' : r.aprovado ? 'Aprovado' : 'A aprovar'),
        sel('falas', 'Falas', et.falas, !f.total ? 'A gerar' : voz ? 'Voz antiga' : f.estimadas ? 'Estimadas' : f.prontas >= f.total ? (f.total === 1 ? '1 pronta' : `${f.total} prontas`) : `${f.prontas} de ${f.total}`),
        sel('video', 'Vídeo', et.videos, !v.total ? 'A gerar' : v.gerando ? `Gerando ${v.gerando}` : `${v.prontos} de ${pl(v.total, 'plano', 'planos')}`),
        sel('montado', 'Montado', et.montado, rd.status === 'pronto' ? (rd.duracaoS ? textoDuracao(rd.duracaoS) : 'Pronto') : rd.status === 'montando' ? 'Montando' : rd.status === 'falhou' || rd.status === 'interrompido' ? 'Falhou' : 'Não montado'),
    ];
}

// Texto curto do estado (sempre junto do ícone; nunca só a cor).
export const TEXTO_ESTADO = { feito: 'Feito', falta: 'Falta', aviso: 'Atenção', andamento: 'Em andamento', perigo: 'Falhou', bloqueado: 'Depois', opcional: 'Opcional' };

// Etapas da série (uma vez só): Ideia → Bíblia aprovada → Elenco e locais com imagem. Do estado REAL dos arquivos.
export function etapasDaSerie({ serie = {}, biblia = {}, elenco = [], locais = [] } = {}) {
    const lista = [];
    const ideia = String(serie.ideia || biblia.premissa || '').trim();
    lista.push({ id: 'ideia', nome: 'Ideia', estado: ideia ? 'feito' : 'falta', motivo: ideia ? 'Ideia da série escrita.' : 'Escreva a ideia ou peça 5 ideias ao showrunner.', aba: 'visao' });
    const personagens = Array.isArray(biblia.personagens) ? biblia.personagens.length : 0;
    const temBiblia = Boolean(String(biblia.premissa || '').trim()) && personagens > 0;
    const mapa = Array.isArray(biblia.temporada) ? biblia.temporada.length : 0;
    lista.push({
        id: 'biblia', nome: 'Bíblia aprovada', estado: temBiblia ? 'feito' : ideia ? 'falta' : 'bloqueado',
        motivo: temBiblia ? `Premissa, ${pl(personagens, 'personagem', 'personagens')}${mapa ? ` e mapa de ${mapa} episódios` : ''}.` : ideia ? 'Gere a bíblia e aprove (premissa, regras, personagens, mapa).' : 'Depois da ideia.',
        aba: temBiblia ? 'biblia' : 'visao',
    });
    const fichas = [...elenco, ...locais].filter((x) => !x.erro && x.id !== 'narrador');
    const sem = fichas.filter((x) => !imagemPrincipal(x));
    const escolher = elenco.filter((x) => !x.erro && !x.canonica && Array.isArray(x.candidatas) && x.candidatas.length > 0);
    let estado = 'feito';
    let motivo = `${pl(fichas.length, 'ficha', 'fichas')} com imagem.`;
    if (!fichas.length) { estado = temBiblia ? 'falta' : 'bloqueado'; motivo = temBiblia ? 'Sem fichas de elenco e locais.' : 'Depois da bíblia.'; }
    else if (escolher.length) { estado = 'falta'; motivo = `Escolha o rosto de ${escolher.map((x) => x.nome).join(', ')}.`; }
    else if (sem.length) { estado = sem.length < fichas.length ? 'aviso' : 'falta'; motivo = `Sem imagem: ${sem.slice(0, 3).map((x) => x.nome || x.id).join(', ')}${sem.length > 3 ? ` e mais ${sem.length - 3}` : ''}.`; }
    lista.push({ id: 'elenco', nome: 'Elenco e locais com imagem', estado, motivo, aba: 'elenco', sub: sem.length && sem.every((x) => x.tipo === 'local') ? 'locais' : undefined });
    return lista;
}
