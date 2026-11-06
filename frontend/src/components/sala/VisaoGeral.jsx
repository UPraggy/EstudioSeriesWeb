import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import GlobalVar from '../subComponents/GlobalVar';
import ConfirmarCusto from '../subComponents/ConfirmarCusto';
import { Ico } from '../subComponents/icones';
import { Contador, Expandir, Girador, MOV, Visto, avisar, motion } from '../subComponents/Movimento';
import { AprovarBiblia, ExecutarEtapa, LerNotasEpisodio, ProporMemoria, rotaIndisponivel } from '../funcionalidades/bancoGet';
import EditarIdeia from './EditarIdeia';
import { erroDe } from '../funcionalidades/fetchFunc';
import { TETO_ETAPA_USD, episodiosDaTemporada, imagemPrincipal, proximosPassos, textoDuracao } from './serieUtil';
import { TEXTO_ESTADO, etapasDaSerie, etapasProducao, lerProducao, proximaEtapa } from './producaoUtil';
import EditarModelos from './EditarModelos';
import PromptEtapa from '../subComponents/PromptEtapa';
import '../../assets/css/VisaoGeral.css';

// Ícone de cada tipo de pendência (o mesmo desenho do resto do app).
const ICONE_PASSO = { roteiro: Ico.roteiro, aprovar: Ico.roteiro, rosto: Ico.rosto, folha: Ico.gerarImagem, local: Ico.local, objeto: Ico.objeto, voto: Ico.escolha };

const ICONE_ESTADO = { feito: Ico.ok, falta: Ico.pendente, aviso: Ico.aviso, andamento: Ico.carregando, perigo: Ico.erro, bloqueado: Ico.bloqueado, opcional: Ico.info };
const ICONE_ETAPA = { ideia: Ico.pedirIA, biblia: Ico.biblia, elenco: Ico.elenco, roteiro: Ico.roteiro, falas: Ico.voz, decupagem: Ico.decupagem, quadros: Ico.quadroChave, videos: Ico.video, montado: Ico.montar, votacao: Ico.escolha };
const dois = (n) => String(n).padStart(2, '0');
const irAoShowrunner = () => { const el = document.getElementById('h-ia'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); };

export default function VisaoGeral({ serieId, dados, detalhes, irPara, recarregar, abrirNovo }) {
    const { serie, biblia, elenco, locais, objetos } = dados;
    const [editandoModelos, setEditandoModelos] = useState(false);
    const passos = proximosPassos(dados, detalhes);
    const eps = episodiosDaTemporada(serie, biblia, detalhes);
    // Etapas calculadas do estado REAL (serie.etapa continua gravado, mas não decide nada aqui): a série (ideia,
    // bíblia, elenco) uma vez só; cada episódio criado com as etapas dele (o mesmo cálculo da página do episódio).
    const etapasSerie = etapasDaSerie(dados);
    const criados = eps.filter((e) => e.criado);
    const chaveCriados = criados.map((e) => `${e.n}:${e.detalhe && e.detalhe.roteiro ? (e.detalhe.roteiro.aprovado ? 'a' : 'r') : '-'}:${e.duracaoAlvoS}`).join(',');
    const [prods, setProds] = useState({});
    useEffect(() => {
        let vivo = true;
        criados.forEach((e) => {
            lerProducao(serieId, e.n, { roteiro: e.detalhe && e.detalhe.roteiro, entrada: e }).then((r) => { if (vivo) setProds((x) => ({ ...x, [e.n]: r && !r.erro ? r : null })); });
        });
        return () => { vivo = false; };
    }, [serieId, chaveCriados]); // eslint-disable-line react-hooks/exhaustive-deps
    const irEtapaSerie = (et) => (et.aba === 'visao' ? irAoShowrunner() : irPara(et.aba, { sub: et.sub }));
    // UMA próxima ação recomendada: a primeira etapa da série que falta; senão a do primeiro episódio com o que fazer.
    const faltaSerie = etapasSerie.find((x) => ['falta', 'aviso'].includes(x.estado));
    const epFoco = criados.map((e) => ({ e, prox: proximaEtapa(etapasProducao(prods[e.n])) })).find((x) => x.prox && x.prox.id !== 'votacao');
    let recomendada = null;
    if (faltaSerie) {
        recomendada = { titulo: faltaSerie.nome, motivo: faltaSerie.motivo, rotulo: faltaSerie.aba === 'visao' ? 'Ir ao showrunner' : faltaSerie.aba === 'elenco' ? 'Abrir Elenco e locais' : 'Abrir a bíblia', ir: () => irEtapaSerie(faltaSerie) };
    } else if (epFoco) {
        recomendada = { titulo: `Ep. ${epFoco.e.n}: ${epFoco.prox.nome}`, motivo: epFoco.prox.motivo, rotulo: 'Abrir o episódio', ir: () => irPara('episodios', { ep: epFoco.e.n }) };
    } else if (criados.length === 0 && abrirNovo) {
        recomendada = { titulo: 'Criar o primeiro episódio', motivo: 'Escolha a duração (5 s, 30 s, 60 s…) e escreva o roteiro.', rotulo: 'Novo episódio', ir: () => abrirNovo() };
    }
    // Roteiro: primeiro episódio criado e ainda sem roteiro; senão o próximo do mapa. A duração é a DESSE episódio.
    const alvoRoteiro = eps.find((e) => e.criado && !(e.detalhe && e.detalhe.roteiro)) || eps.find((e) => !e.criado)
        || { n: eps.length + 1, duracaoAlvoS: serie.duracaoAlvoS || 60, semEscolha: (serie.duracaoAlvoS || 60) < 20 };
    const ultimoCriado = [...eps].reverse().find((e) => e.criado);

    // Rotas de IA: marcadas "indisponível" se o servidor responder 404 (rota não registrada) ao executar.
    const [rotas, setRotas] = useState({ etapa: true, memoria: true });

    const ideia = String(serie.ideia || biblia.premissa || '').trim();
    const acoesIA = [
        ideia
            ? { id: 'ideias', icone: Ico.pedirIA, nome: 'Desenvolver a ideia', desc: 'Título, logline e gancho a partir da ideia da série.', etapa: 'ideias', rota: 'etapa', contexto: { modo: 'B', ideia, preferencias: serie.genero || undefined } }
            : { id: 'ideias', icone: Ico.pedirIA, nome: 'Gerar 5 ideias', desc: `Ideias de minissérie${serie.genero ? ` (${serie.genero})` : ''}.`, etapa: 'ideias', rota: 'etapa', contexto: { modo: 'A', preferencias: serie.genero || undefined } },
        { id: 'biblia', icone: Ico.biblia, nome: 'Gerar bíblia e mapa', desc: ideia ? 'Premissa, regras, recursos e o mapa dos 10 episódios.' : 'Precisa da ideia aprovada (etapa 1).', etapa: 'biblia', rota: 'etapa', contexto: { ideia }, bloqueada: !ideia },
        {
            id: 'roteiro',
            icone: Ico.roteiro,
            nome: `Escrever o roteiro do Ep. ${alvoRoteiro.n}`,
            desc: `${textoDuracao(alvoRoteiro.duracaoAlvoS)} ${alvoRoteiro.semEscolha ? 'sem votação' : 'com escolha A/B'}, usando a memória da série e as observações do episódio.`,
            etapa: 'roteiro',
            rota: 'etapa',
            contexto: { ep: alvoRoteiro.n, duracaoAlvoS: alvoRoteiro.duracaoAlvoS, semEscolha: alvoRoteiro.semEscolha },
        },
        ultimoCriado && {
            id: 'memoria', icone: Ico.memoria, nome: `Propor a memória do Ep. ${ultimoCriado.n}`, desc: 'Fatos, estado dos personagens e resumo. Sem IA: grátis.', rota: 'memoria', gratis: true, ep: ultimoCriado.n,
        },
    ].filter(Boolean);

    const [pedido, setPedido] = useState(null); // ação de IA aguardando confirmação
    const [ocupado, setOcupado] = useState(null); // id da ação rodando
    const [erroIA, setErroIA] = useState('');
    const chaveProposta = (id) => `estudio:proposta-etapa:${serieId}:${id}`;
    const [resultados, setResultados] = useState(() => {
        const r = {};
        for (const id of ['ideias', 'biblia']) { const v = GlobalVar.getLocalStorage(chaveProposta(id), null); if (v) r[id] = v; }
        return r;
    });
    const [editandoIdeia, setEditandoIdeia] = useState(false);
    const [aprovando, setAprovando] = useState(false);

    async function aprovarBiblia() {
        const res = resultados.biblia;
        if (!res || !res.resultado) return;
        setAprovando(true);
        const r = await AprovarBiblia({ serie: serieId, proposta: res.resultado });
        setAprovando(false);
        if (erroDe(r)) { avisar(`Não salvei a bíblia: ${erroDe(r)}`, 'erro', 6000); return; }
        try { localStorage.removeItem(chaveProposta('biblia')); } catch { /* sem armazenamento */ }
        setResultados((x) => { const y = { ...x }; delete y.biblia; return y; });
        const n = (r.criadas?.elenco?.length || 0) + (r.criadas?.locais?.length || 0);
        avisar(n ? `Bíblia salva e ${n} fichas criadas` : 'Bíblia salva');
        (r.avisos || []).slice(0, 3).forEach((a) => avisar(a, 'aviso', 6000));
        if (recarregar) recarregar();
    }
    const [abertos, setAbertos] = useState({});
    // "Ver prompt" / "Colar resposta de fora" de uma ação: { acao, modo: 'ver' | 'colar' }
    const [externo, setExterno] = useState(null);

    // O contexto exato que a etapa recebe (o mesmo para executar, ver o prompt e colar a resposta de fora).
    async function contextoDe(acao) {
        let contexto = acao.contexto || {};
        // Roteiro: as observações guardadas no episódio (notas.json) entram no pedido, como na página do episódio.
        if (acao.etapa === 'roteiro') {
            const n = await LerNotasEpisodio({ serie: serieId, ep: contexto.ep });
            const obs = n && n.notas && typeof n.notas.observacoes === 'string' ? n.notas.observacoes.trim() : '';
            if (obs) contexto = { ...contexto, instrucoes: obs };
        }
        return contexto;
    }

    // Proposta pronta (do showrunner ou colada de fora): guarda e mostra do mesmo jeito.
    function receber(acao, r) {
        setResultados((x) => ({ ...x, [acao.id]: r }));
        if (['ideias', 'biblia'].includes(acao.id)) GlobalVar.setLocalStorage(chaveProposta(acao.id), { ...r, em: new Date().toISOString() });
        // A proposta de roteiro fica pronta para ler e salvar na página do episódio (mesma chave de lá).
        if (acao.etapa === 'roteiro' && r.resultado) GlobalVar.setLocalStorage(`estudio:proposta:${serieId}:${acao.contexto.ep}`, { ...r, em: new Date().toISOString() });
        setAbertos((x) => ({ ...x, [acao.id]: true }));
    }

    function receberDeFora(r) {
        const acao = externo && externo.acao;
        setExterno(null);
        if (!acao) return;
        receber(acao, r);
        avisar(r.ok === false ? `${acao.nome}: resposta de fora com problemas` : `${acao.nome}: resposta de fora pronta`, r.ok === false ? 'aviso' : 'ok');
    }

    async function executar(acao) {
        setOcupado(acao.id);
        setErroIA('');
        const contexto = acao.rota === 'memoria' ? {} : await contextoDe(acao);
        const r = acao.rota === 'memoria'
            ? await ProporMemoria({ serieId, ep: acao.ep })
            : await ExecutarEtapa({ etapa: acao.etapa, serieId, contexto, tetoUsd: TETO_ETAPA_USD });
        setOcupado(null);
        if (rotaIndisponivel(r)) {
            setRotas((x) => ({ ...x, [acao.rota]: false }));
            setPedido(null);
            avisar('Essa etapa ainda não está no servidor.', 'aviso');
            return;
        }
        if (erroDe(r)) {
            setErroIA(erroDe(r));
            if (!pedido) avisar(`Falhou: ${erroDe(r)}`, 'erro', 5000);
            return;
        }
        setPedido(null);
        receber(acao, r);
        avisar(r.ok === false ? `${acao.nome}: proposta com problemas` : `${acao.nome}: proposta pronta`, r.ok === false ? 'aviso' : 'ok');
        window.dispatchEvent(new Event('estudio:gasto'));
    }

    function clicar(acao) {
        if (acao.gratis) { executar(acao); return; }
        setErroIA('');
        setPedido(acao);
    }

    const gasto = dados.custos ? dados.custos.gastoUsd : 0;
    const o = serie.orcamento || {};
    const uso = o.tetoSerieUsd ? Math.min(100, (gasto / o.tetoSerieUsd) * 100) : 0;
    const comImagem = (lista) => lista.filter((f) => !f.erro && imagemPrincipal(f)).length;
    const roteiros = Object.values(detalhes).filter((d) => d && d.roteiro).length;

    const numeros = [
        { id: 'elenco', icone: Ico.elenco, rotulo: 'Elenco', valor: elenco.length, extra: `${comImagem(elenco)} com imagem`, ir: () => irPara('elenco') },
        { id: 'locais', icone: Ico.local, rotulo: 'Locais', valor: locais.length, extra: `${comImagem(locais)} com imagem`, ir: () => irPara('elenco', { sub: 'locais' }) },
        { id: 'objetos', icone: Ico.objeto, rotulo: 'Objetos', valor: objetos.length, extra: `${comImagem(objetos)} com imagem`, ir: () => irPara('elenco', { sub: 'objetos' }) },
        { id: 'roteiros', icone: Ico.roteiro, rotulo: 'Roteiros', valor: roteiros, extra: `de ${eps.length} episódios`, ir: () => irPara('episodios') },
    ];

    return (
        <div className="visao">
            <div className="visao-principal">
                <section className="secao" aria-labelledby="h-etapas">
                    <div className="secao-cab">
                        <h2 id="h-etapas">Etapas</h2>
                        <p>Calculadas dos arquivos da série. Clique numa etapa para ir até ela.</p>
                    </div>
                    {recomendada && (
                        <div className="vg-recomendada">
                            <span className="vg-rec-ico" aria-hidden="true"><Ico.avancar /></span>
                            <div className="vg-rec-txt">
                                <strong>Próximo: {recomendada.titulo}</strong>
                                <span>{recomendada.motivo}</span>
                            </div>
                            <button type="button" className="btn primario" onClick={recomendada.ir}>
                                {recomendada.rotulo}<Ico.direita className="ico-avancar" aria-hidden="true" />
                            </button>
                        </div>
                    )}
                    <div className="vg-etapas painel">
                        <div className="vg-grupo">
                            <h3 className="vg-grupo-tit">Série</h3>
                            <ol className="vg-linha">
                                {etapasSerie.map((et, i) => {
                                    const Est = ICONE_ESTADO[et.estado];
                                    const Icone = ICONE_ETAPA[et.id];
                                    return (
                                        <li key={et.id}>
                                            <button type="button" className={`vg-etapa ${et.estado}`} onClick={() => irEtapaSerie(et)} title={et.motivo}>
                                                <span className="vg-n num">{i + 1}</span>
                                                <span className="vg-etapa-txt">
                                                    <span className="vg-etapa-nome"><Icone aria-hidden="true" />{et.nome}</span>
                                                    <span className="vg-etapa-motivo">{et.motivo}</span>
                                                </span>
                                                <span className={`vg-estado ${et.estado}`}><Est aria-hidden="true" />{TEXTO_ESTADO[et.estado]}</span>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ol>
                        </div>
                        <div className="vg-grupo">
                            <h3 className="vg-grupo-tit">Episódios</h3>
                            {criados.length === 0 ? (
                                <p className="suave vg-vazio">Nenhum episódio criado ainda.</p>
                            ) : (
                                <ul className="vg-eps">
                                    {criados.map((e) => {
                                        const p = prods[e.n];
                                        const ets = etapasProducao(p);
                                        const prox = proximaEtapa(ets);
                                        return (
                                            <li key={e.n}>
                                                <button type="button" className="vg-ep" onClick={() => irPara('episodios', { ep: e.n })} aria-label={`Ep. ${e.n}: ${e.titulo}${prox ? `. Próximo: ${prox.nome}` : ''}`}>
                                                    <span className="vg-ep-cab">
                                                        <span className="num vg-ep-n">Ep. {dois(e.n)}</span>
                                                        <span className="vg-ep-tit">{e.titulo}</span>
                                                        <span className="suave num">{textoDuracao(e.duracaoAlvoS)}</span>
                                                    </span>
                                                    {p === undefined ? <span className="esqueleto vg-ep-esq" aria-hidden="true" /> : (
                                                        <ol className="vg-chips" aria-hidden="true">
                                                            {ets.map((et) => {
                                                                const Est = ICONE_ESTADO[et.estado];
                                                                return (
                                                                    <li key={et.id} className={`vg-chip ${et.estado}${prox && prox.id === et.id ? ' atual' : ''}`} title={`${et.nome}: ${TEXTO_ESTADO[et.estado]}. ${et.motivo}`}>
                                                                        <Est className={et.estado === 'andamento' ? 'girador' : ''} />{et.nome}
                                                                    </li>
                                                                );
                                                            })}
                                                        </ol>
                                                    )}
                                                    {prox && <span className="vg-ep-prox"><Ico.direita aria-hidden="true" />{prox.nome}: {prox.motivo}</span>}
                                                </button>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </div>
                    </div>
                </section>

                <section className="secao" aria-labelledby="h-passos">
                    <div className="secao-cab">
                        <h2 id="h-passos">Pendências</h2>
                        <p>{passos.length ? `${passos.length} ${passos.length > 1 ? 'pendências tiradas' : 'pendência tirada'} dos arquivos da série.` : 'Nada pendente.'}</p>
                    </div>
                    {passos.length > 0 ? (
                        <ol className="passos painel">
                            {passos.map((p) => {
                                const Icone = ICONE_PASSO[p.tipo] || Ico.info;
                                return (
                                    <li key={p.id}>
                                        <span className="passo-ico" aria-hidden="true"><Icone /></span>
                                        <div className="passo-texto">
                                            <strong>{p.texto}</strong>
                                            {p.detalhe && <span>{p.detalhe}</span>}
                                        </div>
                                        <button type="button" className="btn mini" onClick={() => irPara(p.aba, { sub: p.sub, ficha: p.ficha, ep: p.ep })}>
                                            {p.aba === 'elenco' ? 'Abrir fichas' : p.aba === 'temporada' ? 'Abrir votação' : p.tipo === 'aprovar' ? 'Revisar roteiro' : 'Abrir episódio'}
                                            <Ico.direita className="ico-avancar" aria-hidden="true" />
                                        </button>
                                    </li>
                                );
                            })}
                        </ol>
                    ) : (
                        <p className="nota-ok"><Ico.ok aria-hidden="true" />Tudo em dia. O próximo passo é escrever um episódio novo.</p>
                    )}
                </section>

                <section className="secao" aria-labelledby="h-ia">
                    <div className="secao-cab">
                        <h2 id="h-ia">Showrunner</h2>
                        <p>Cada etapa devolve uma proposta para você aprovar. Nada é gravado sozinho.</p>
                    </div>
                    <ul className="ia-lista painel">
                        {acoesIA.map((a) => {
                            const disp = rotas[a.rota];
                            const res = resultados[a.id];
                            const Icone = a.icone;
                            const rodando = ocupado === a.id;
                            return (
                                <li key={a.id}>
                                    <div className="ia-linha">
                                        <span className="passo-ico" aria-hidden="true"><Icone /></span>
                                        <div className="ia-texto">
                                            <strong>{a.nome}</strong>
                                            <span>{a.desc}</span>
                                        </div>
                                        <div className="ia-acao">
                                            {disp === false
                                                ? <span className="estado neutro" title="A rota ainda não está registrada no servidor">Indisponível</span>
                                                : <span className="ia-custo num">{a.gratis ? 'Grátis' : `até ${GlobalVar.usdFino(TETO_ETAPA_USD)}`}</span>}
                                            {!a.gratis && (
                                                <button type="button" className="btn mini fantasma icone" disabled={a.bloqueada} onClick={() => setExterno({ acao: a, modo: 'ver' })} title="Ver o prompt desta etapa e levar para outra IA (não gasta nada)" aria-label={`Ver o prompt: ${a.nome}`}>
                                                    <Ico.verPrompt aria-hidden="true" />
                                                </button>
                                            )}
                                            {!a.gratis && (
                                                <button type="button" className="btn mini fantasma icone" disabled={a.bloqueada} onClick={() => setExterno({ acao: a, modo: 'colar' })} title="Colar a resposta gerada em outra IA (sem custo)" aria-label={`Colar resposta de fora: ${a.nome}`}>
                                                    <Ico.colar aria-hidden="true" />
                                                </button>
                                            )}
                                            <button type="button" className="btn mini" disabled={disp !== true || Boolean(ocupado) || a.bloqueada} onClick={() => clicar(a)} aria-busy={rodando && a.gratis ? true : undefined}>
                                                {rodando && a.gratis && <Girador />}
                                                {a.gratis ? <Ico.memoria aria-hidden="true" /> : <Ico.enviar className="ico-pular" aria-hidden="true" />}
                                                <span>{a.gratis ? 'Propor' : 'Executar'}</span>
                                            </button>
                                        </div>
                                    </div>
                                    {res && (
                                        <div className="ia-resultado">
                                            <button type="button" className="ia-resultado-cab" aria-expanded={Boolean(abertos[a.id])} onClick={() => setAbertos((x) => ({ ...x, [a.id]: !x[a.id] }))}>
                                                {res.ok === false
                                                    ? <span className="estado aviso">Proposta com problemas</span>
                                                    : <span className="estado-visto ok"><Visto tamanho={14} />Proposta pronta</span>}
                                                <span className="suave">{res.origem === 'externo' ? 'colada de fora, sem custo' : Number.isFinite(res.custoUsd) ? `custou ${GlobalVar.usdFino(res.custoUsd)}` : ''}</span>
                                                <Ico.expandir className={`ia-seta${abertos[a.id] ? ' aberta' : ''}`} aria-hidden="true" />
                                            </button>
                                            <Expandir aberto={Boolean(abertos[a.id])}>
                                                {Array.isArray(res.erros) && res.erros.length > 0 && (
                                                    <ul className="ia-erros">{res.erros.map((e, k) => <li key={k}><Ico.aviso aria-hidden="true" />{e}</li>)}</ul>
                                                )}
                                                {a.id === 'roteiro' && res.resultado && (
                                                    <p className="ia-dica">
                                                        <button type="button" className="btn-link" onClick={() => irPara('episodios', { ep: a.contexto.ep })}>Abrir o Ep. {a.contexto.ep}</button> para ler como roteiro e salvar.
                                                    </p>
                                                )}
                                                {a.id === 'biblia' && res.resultado && res.resultado.biblia && (
                                                    <div className="ia-biblia">
                                                        <p><strong>Premissa:</strong> {res.resultado.biblia.premissa}</p>
                                                        {(res.resultado.elenco || []).length > 0 && <p><strong>Elenco:</strong> {(res.resultado.elenco || []).map((e) => `${e.nome}${e.papel ? ` (${e.papel})` : ''}`).join(', ')}</p>}
                                                        {(res.resultado.locais || []).length > 0 && <p><strong>Locais:</strong> {(res.resultado.locais || []).map((l) => l.nome).join(', ')}</p>}
                                                        {(res.resultado.biblia.temporada || []).length > 0 && (
                                                            <ol className="ia-temporada">{res.resultado.biblia.temporada.map((t) => <li key={t.n}><strong>{t.titulo}</strong>{t.resumo ? ` — ${t.resumo}` : ''}</li>)}</ol>
                                                        )}
                                                        <div className="ia-biblia-acoes">
                                                            <button type="button" className="btn primario" onClick={aprovarBiblia} disabled={aprovando || res.ok === false} aria-busy={aprovando} title={res.ok === false ? 'Corrija os problemas (rode de novo) antes de aprovar' : 'Grava a bíblia e cria as fichas de elenco e locais que faltam'}>
                                                                {aprovando && <Girador />}<Ico.confirmar aria-hidden="true" />Aprovar e salvar bíblia
                                                            </button>
                                                            <span className="suave">Fichas que você já tem não são substituídas.</span>
                                                        </div>
                                                    </div>
                                                )}
                                                <details className="ia-json"><summary>Ver a proposta completa (JSON)</summary>
                                                    <pre>{JSON.stringify(res.resultado !== undefined ? res.resultado : res, null, 2).slice(0, 12000)}</pre>
                                                </details>
                                            </Expandir>
                                        </div>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                    {erroIA && !pedido && <p className="nota-erro ia-erro" role="alert"><Ico.erro aria-hidden="true" />{erroIA}</p>}
                </section>
            </div>

            <aside className="visao-lateral">
                <section className="painel lateral-bloco" aria-labelledby="h-custos">
                    <div className="painel-cab">
                        <h2 id="h-custos"><Ico.custo aria-hidden="true" />Custos da série</h2>
                        <Link to={`/custos?serie=${serieId}`} className="lateral-link">Lançamentos</Link>
                    </div>
                    <div className="painel-corpo">
                        <p className="lateral-gasto">
                            <Contador valor={gasto} formatar={(v) => GlobalVar.usd(v)} />
                            <span className="suave"> de {GlobalVar.usd(o.tetoSerieUsd)}</span>
                        </p>
                        <div className={`barra${uso >= 80 ? ' alta' : ''}`} role="img" aria-label={`${Math.round(uso)}% do teto da série`}>
                            <motion.span initial={{ width: 0 }} animate={{ width: `${Math.max(uso, gasto > 0 ? 1 : 0)}%` }} transition={{ duration: MOV.lento * 1.5, ease: MOV.enfatico }} />
                        </div>
                        <dl className="lateral-tetos">
                            <div><dt>Teto por episódio</dt><dd className="num">{GlobalVar.usd(o.tetoEpisodioUsd)}</dd></div>
                            <div><dt>Teto por plano</dt><dd className="num">{GlobalVar.usd(o.tetoPlanoUsd)}</dd></div>
                        </dl>
                    </div>
                </section>

                <section className="painel lateral-bloco" aria-labelledby="h-numeros">
                    <div className="painel-cab"><h2 id="h-numeros"><Ico.grade aria-hidden="true" />Em números</h2></div>
                    <ul className="numeros">
                        {numeros.map((x) => {
                            const Icone = x.icone;
                            return (
                                <li key={x.id}>
                                    <button type="button" className="numero" onClick={x.ir}>
                                        <span className="numero-rot"><Icone aria-hidden="true" />{x.rotulo}</span>
                                        <Contador className="numero-valor" valor={x.valor} />
                                        <span className="numero-extra">{x.extra}</span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </section>

                {serie.modelos && (
                    <section className="painel lateral-bloco" aria-labelledby="h-modelos">
                        <div className="painel-cab">
                            <h2 id="h-modelos"><Ico.config aria-hidden="true" />Modelos</h2>
                            <button type="button" className="btn mini fantasma" onClick={() => setEditandoModelos(true)} title="Trocar os modelos desta série (via OpenRouter)"><Ico.editar aria-hidden="true" />Trocar</button>
                        </div>
                        <div className="painel-corpo">
                            <dl className="modelos">
                                {[['texto', 'Texto', Ico.texto], ['imagem', 'Imagem', Ico.imagem], ['videoRascunho', 'Vídeo rascunho', Ico.video], ['videoFinal', 'Vídeo final', Ico.video], ['apresentador', 'Apresentador', Ico.personagem]]
                                    .filter(([k]) => serie.modelos[k])
                                    .map(([k, rot, Icone]) => (
                                        <div key={k}>
                                            <dt><Icone aria-hidden="true" />{rot}</dt>
                                            <dd>{serie.modelos[k]} <span className="suave">via OpenRouter</span></dd>
                                        </div>
                                    ))}
                            </dl>
                        </div>
                    </section>
                )}

                <EditarModelos
                    aberto={editandoModelos}
                    serieId={serieId}
                    atuais={serie.modelos || {}}
                    onFechar={() => setEditandoModelos(false)}
                    onSalvo={() => recarregar && recarregar()}
                />

                {(biblia.premissa || serie.ideia) && (
                    <section className="painel lateral-bloco" aria-labelledby="h-premissa">
                        <div className="painel-cab">
                            <h2 id="h-premissa"><Ico.showrunner aria-hidden="true" />Premissa</h2>
                            <button type="button" className="btn mini fantasma" onClick={() => (biblia.premissa ? irPara('biblia') : setEditandoIdeia(true))} title={biblia.premissa ? 'Editar a premissa na Bíblia' : 'A bíblia ainda não foi aprovada: edite a ideia da série'}><Ico.editar aria-hidden="true" />Editar</button>
                        </div>
                        <div className="painel-corpo">
                            {!biblia.premissa && <p className="suave lateral-nota">Ainda não há bíblia aprovada: abaixo está a ideia da série.</p>}
                            <p className="lateral-premissa">{biblia.premissa || serie.ideia}</p>
                            {biblia.premissa && <button type="button" className="btn-link" onClick={() => setEditandoIdeia(true)}>Editar a ideia da série</button>}
                        </div>
                    </section>
                )}
            </aside>

            <PromptEtapa
                aberto={Boolean(externo)}
                modo={externo ? externo.modo : 'ver'}
                titulo={externo ? externo.acao.nome : ''}
                etapa={externo ? externo.acao.etapa : 'ideias'}
                serieId={serieId}
                obterContexto={() => (externo ? contextoDe(externo.acao) : Promise.resolve({}))}
                onFechar={() => setExterno(null)}
                onResultado={receberDeFora}
            />

            <EditarIdeia aberto={editandoIdeia} serieId={serieId} ideia={serie.ideia || ''} onFechar={() => setEditandoIdeia(false)} onSalvo={() => recarregar && recarregar()} />

            <ConfirmarCusto
                aberto={Boolean(pedido)}
                titulo={pedido ? pedido.nome : ''}
                descricao="Chamada de texto ao OpenRouter (até 2 tentativas, se a primeira resposta vier inválida). O valor abaixo é o teto da etapa; o custo real costuma ser bem menor."
                itens={pedido ? [{ descricao: `Texto · ${(serie.modelos && serie.modelos.texto) || 'modelo padrão'} · teto da etapa`, usd: TETO_ETAPA_USD, estimativa: true }] : []}
                teto={{ rotulo: 'Teto da série', tetoUsd: o.tetoSerieUsd, gastoUsd: gasto }}
                verbo="Executar"
                ocupado={Boolean(ocupado)}
                progresso={ocupado ? 'Esperando a resposta do showrunner…' : ''}
                erro={erroIA}
                onCancelar={() => { setPedido(null); setErroIA(''); }}
                onConfirmar={() => pedido && executar(pedido)}
            />
        </div>
    );
}
