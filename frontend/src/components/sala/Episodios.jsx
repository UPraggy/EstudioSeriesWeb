import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useReducedMotion } from 'framer-motion';
import GlobalVar from '../subComponents/GlobalVar';
import ConfirmarCusto from '../subComponents/ConfirmarCusto';
import { Ico } from '../subComponents/icones';
import { Girador, Item, Lista, Trocar, Vazio, Visto, avisar } from '../subComponents/Movimento';
import { ExecutarEtapa, LerEdicao, SalvarRoteiro, rotaIndisponivel } from '../funcionalidades/bancoGet';
import { erroDe } from '../funcionalidades/fetchFunc';
import FolhaRoteiro from './FolhaRoteiro';
import { TETO_ETAPA_USD, episodiosDaTemporada, etapasDoEpisodio, imagemDoEpisodio, resumoDaEdicao, textoDuracao } from './serieUtil';
import '../../assets/css/Episodios.css';

const ICONE_ETAPA = { roteiro: Ico.roteiro, falas: Ico.voz, video: Ico.video, montado: Ico.montar };
const ICONE_ESTADO = { ok: Ico.ok, aviso: Ico.aviso, andamento: Ico.carregando, perigo: Ico.erro, falta: Ico.pendente };
const dois = (n) => String(n).padStart(2, '0');

// Etapas do episódio por ícone + texto. Compacto (no pôster): o estado vira um ícone e o texto fica no title/leitor.
function EtapasEp({ etapas, compacto = false }) {
    return (
        <ul className={`ep-etapas${compacto ? ' compacto' : ''}`}>
            {etapas.map((e) => {
                const Icone = ICONE_ETAPA[e.id];
                const Estado = ICONE_ESTADO[e.estado];
                return (
                    <li key={e.id} className={`ep-etapa ${e.estado}`} title={`${e.nome}: ${e.texto}`}>
                        <Icone className="ep-etapa-ico" aria-hidden="true" />
                        <span className="ep-etapa-nome">{e.nome}</span>
                        {compacto ? <span className="sr">: {e.texto}</span> : <span className="ep-etapa-txt">{e.texto}</span>}
                        {e.estado === 'carregando'
                            ? <span className="esqueleto ep-etapa-esq" aria-hidden="true" />
                            : Estado && <Estado className={`ep-etapa-st${e.estado === 'andamento' ? ' girador' : ''}`} aria-hidden="true" />}
                    </li>
                );
            })}
        </ul>
    );
}

// Prévia do episódio montado: o vídeo só carrega quando o mouse (ou o foco) chega no pôster.
function usePrevia(url) {
    const reduzido = useReducedMotion();
    const ref = useRef(null);
    const [pedido, setPedido] = useState(false);
    const [ativo, setAtivo] = useState(false);
    const [tocando, setTocando] = useState(false);
    useEffect(() => {
        const v = ref.current;
        if (!v || !pedido) return;
        if (ativo) { v.play().catch(() => {}); } else { v.pause(); setTocando(false); }
    }, [ativo, pedido]);
    if (!url || reduzido) return { eventos: {}, foco: {}, video: null };
    const entrar = () => { setPedido(true); setAtivo(true); };
    const sair = () => setAtivo(false);
    return {
        eventos: { onMouseEnter: entrar, onMouseLeave: sair },
        foco: { onFocus: entrar, onBlur: sair },
        video: (
            <video
                ref={ref}
                className={`poster-video${tocando ? ' tocando' : ''}`}
                src={pedido ? url : undefined}
                muted
                loop
                playsInline
                preload="none"
                onPlaying={() => setTocando(true)}
                aria-hidden="true"
                tabIndex={-1}
            />
        ),
    };
}

// Pôster 9:16 de um episódio criado: imagem do primeiro plano, título como cartaz, prévia do vídeo montado no hover.
function Poster({ serieId, dados, ep, resumo, onAbrir }) {
    const img = imagemDoEpisodio(dados, ep);
    const etapas = etapasDoEpisodio(ep, resumo);
    const saida = resumo && resumo.saida ? GlobalVar.urlMidia(serieId, resumo.saida) : null;
    const previa = usePrevia(saida);
    return (
        <article className="poster" aria-labelledby={`pt-${ep.n}`}>
            <div className="poster-midia" {...previa.eventos}>
                {img
                    ? <img className="poster-img" src={GlobalVar.urlMidia(serieId, img)} alt="" loading="lazy" />
                    : <span className="poster-n-grande num" aria-hidden="true">{dois(ep.n)}</span>}
                {previa.video}
                <span className="poster-veu" aria-hidden="true" />
                <span className="poster-topo">
                    <span className="poster-chip"><Ico.duracao aria-hidden="true" />{textoDuracao(ep.duracaoAlvoS)}</span>
                    {ep.semEscolha && <span className="poster-chip">Sem votação</span>}
                    {saida && <span className="poster-chip poster-chip-tocar" title="Episódio montado: passe o mouse para ver"><Ico.tocar aria-hidden="true" /><span className="sr">Montado, com prévia</span></span>}
                </span>
                <span className="poster-txt">
                    <span className="poster-n">
                        <span className="num">Ep. {dois(ep.n)}</span>
                        <span className="poster-ver" aria-hidden="true">Ver roteiro<Ico.direita /></span>
                    </span>
                    <h3 id={`pt-${ep.n}`} className="poster-titulo">{ep.titulo}</h3>
                </span>
                <button
                    type="button"
                    className="poster-abrir"
                    onClick={() => onAbrir(ep)}
                    aria-label={`Ler o roteiro do Ep. ${ep.n}: ${ep.titulo}`}
                    {...previa.foco}
                />
            </div>
            <div className="poster-info">
                <p className="poster-fase">{ep.fase || 'Fora do mapa da temporada'}</p>
                <EtapasEp etapas={etapas} compacto />
                <Link className="btn mini poster-mesa" to={`/serie/${serieId}/ep/${ep.n}`}>
                    <Ico.decupagem aria-hidden="true" />Abrir na Mesa
                </Link>
            </div>
        </article>
    );
}

// Página do episódio: pôster, etapas, ações e a folha do roteiro (ou a proposta do showrunner para salvar).
function PaginaEpisodio({ serieId, dados, ep, resumo, recarregar, irPara }) {
    const { serie, elenco, locais } = dados;
    const roteiro = ep.detalhe && ep.detalhe.roteiro;
    const chaveProposta = `estudio:proposta:${serieId}:${ep.n}`;
    const [proposta, setProposta] = useState(() => GlobalVar.getLocalStorage(chaveProposta, null));
    const [pedido, setPedido] = useState(false);
    const [escrevendo, setEscrevendo] = useState(false);
    const [erroIA, setErroIA] = useState('');
    const [salvando, setSalvando] = useState(false);
    const [aprovando, setAprovando] = useState(false);
    const [aprovou, setAprovou] = useState(false);
    const [erroAcao, setErroAcao] = useState('');

    const img = imagemDoEpisodio(dados, ep);
    const saida = resumo && resumo.saida ? GlobalVar.urlMidia(serieId, resumo.saida) : null;
    const previa = usePrevia(saida);
    const etapas = etapasDoEpisodio(ep, resumo);
    const aprovado = roteiro && roteiro.aprovado === true;
    const nomes = Object.fromEntries((elenco || []).filter((f) => !f.erro).map((f) => [f.id, f.nome]));
    const nomesLocais = Object.fromEntries((locais || []).filter((f) => !f.erro).map((f) => [f.id, f.nome]));
    const planos = roteiro && Array.isArray(roteiro.planos) ? roteiro.planos.length : 0;
    const gasto = dados.custos ? dados.custos.gastoUsd : 0;
    const tetoSerie = serie.orcamento ? serie.orcamento.tetoSerieUsd : undefined;
    const roteiroProposto = proposta && proposta.resultado && Array.isArray(proposta.resultado.planos) ? proposta.resultado : null;

    function guardarProposta(p) {
        setProposta(p);
        GlobalVar.setLocalStorage(chaveProposta, p);
    }

    async function escrever() {
        setEscrevendo(true);
        setErroIA('');
        const r = await ExecutarEtapa({
            etapa: 'roteiro',
            serieId,
            contexto: { ep: ep.n, duracaoAlvoS: ep.duracaoAlvoS, semEscolha: ep.semEscolha },
            tetoUsd: TETO_ETAPA_USD,
        });
        setEscrevendo(false);
        if (rotaIndisponivel(r)) { setPedido(false); avisar('O showrunner ainda não está no servidor.', 'aviso'); return; }
        if (erroDe(r)) { setErroIA(erroDe(r)); return; }
        setPedido(false);
        window.dispatchEvent(new Event('estudio:gasto'));
        guardarProposta({ ...r, em: new Date().toISOString() });
        avisar(r.ok === false ? 'Roteiro proposto com problemas: confira antes de salvar' : 'Roteiro proposto. Leia e salve.', r.ok === false ? 'aviso' : 'ok');
    }

    async function salvarProposta() {
        if (!roteiroProposto) return;
        setSalvando(true);
        setErroAcao('');
        const r = await SalvarRoteiro({ serie: serieId, n: ep.n, roteiro: { ...roteiroProposto, n: ep.n } });
        setSalvando(false);
        if (erroDe(r)) { setErroAcao(erroDe(r)); avisar(`Falhou: ${erroDe(r)}`, 'erro', 6000); return; }
        guardarProposta(null);
        avisar(`Roteiro do Ep. ${ep.n} salvo`, 'ok');
        recarregar();
    }

    async function aprovar() {
        if (!roteiro) return;
        setAprovando(true);
        setErroAcao('');
        const r = await SalvarRoteiro({ serie: serieId, n: ep.n, roteiro: { ...roteiro, aprovado: true } });
        setAprovando(false);
        if (erroDe(r)) { setErroAcao(erroDe(r)); avisar(`Falhou: ${erroDe(r)}`, 'erro', 6000); return; }
        setAprovou(true);
        avisar(`Roteiro do Ep. ${ep.n} aprovado`, 'ok');
        recarregar();
    }

    const temProposta = Boolean(proposta);

    return (
        <div className="ep-pagina">
            <button type="button" className="btn fantasma ep-voltar" onClick={() => irPara('episodios')}>
                <Ico.voltar className="ico-voltar" aria-hidden="true" />Todos os episódios
            </button>

            <header className="ep-pag-cab">
                <div className="ep-pag-poster" {...previa.eventos}>
                    {img ? <img src={GlobalVar.urlMidia(serieId, img)} alt="" /> : <span className="poster-n-grande num" aria-hidden="true">{dois(ep.n)}</span>}
                    {previa.video}
                    {saida && <span className="poster-chip poster-chip-tocar ep-pag-tocar" aria-hidden="true"><Ico.tocar /></span>}
                </div>
                <div className="ep-pag-info">
                    <p className="ep-pag-sobre">Ep. {dois(ep.n)}{ep.fase ? `, ${ep.fase.charAt(0).toLowerCase()}${ep.fase.slice(1)}` : ''}</p>
                    <h2 className="ep-pag-titulo">{ep.titulo}</h2>
                    {ep.resumo && <p className="ep-pag-resumo">{ep.resumo}</p>}
                    <ul className="ep-pag-fatos">
                        <li><Ico.duracao aria-hidden="true" /><strong className="num">{textoDuracao(ep.duracaoAlvoS)}</strong></li>
                        {planos > 0 && <li><Ico.decupagem aria-hidden="true" /><span><strong className="num">{planos}</strong> {planos === 1 ? 'plano' : 'planos'}</span></li>}
                        <li><Ico.escolha aria-hidden="true" /><span>{ep.semEscolha ? 'Sem votação' : 'Escolha A/B no fim'}</span></li>
                    </ul>
                    <EtapasEp etapas={etapas} />
                    <div className="acoes ep-pag-acoes">
                        {roteiro && !aprovado && (
                            <button type="button" className="btn primario" onClick={aprovar} disabled={aprovando} aria-busy={aprovando}>
                                {aprovando && <Girador />}
                                <Ico.confirmar aria-hidden="true" /><span>Aprovar roteiro</span>
                            </button>
                        )}
                        {aprovado && (
                            <span className="estado-aprovado">
                                {aprovou ? <Visto tamanho={16} /> : <Ico.ok aria-hidden="true" />}Roteiro aprovado
                            </span>
                        )}
                        <Link className={`btn${aprovado ? ' primario' : ''}`} to={`/serie/${serieId}/ep/${ep.n}`}>
                            <Ico.decupagem aria-hidden="true" />Abrir na Mesa
                        </Link>
                        {saida && (
                            <a className="btn fantasma" href={saida} target="_blank" rel="noreferrer">
                                <Ico.tocar aria-hidden="true" />Assistir
                            </a>
                        )}
                    </div>
                    {erroAcao && <p className="nota-erro" role="alert"><Ico.erro aria-hidden="true" />{erroAcao}</p>}
                </div>
            </header>

            <section className="mesa-luz" aria-label="Roteiro">
                {temProposta && (
                    <div className="proposta-barra" role="region" aria-label="Proposta do showrunner">
                        <div className="proposta-texto">
                            <strong>{proposta.ok === false ? 'Proposta com problemas' : 'Proposta do showrunner'}</strong>
                            <span>
                                Ainda não salva{Number.isFinite(proposta.custoUsd) ? `, custou ${GlobalVar.usdFino(proposta.custoUsd)}` : ''}.
                                {roteiro ? ' Salvar troca o roteiro atual (o anterior fica no backup).' : ''}
                            </span>
                            {Array.isArray(proposta.erros) && proposta.erros.length > 0 && (
                                <ul className="proposta-erros">{proposta.erros.map((e, k) => <li key={k}><Ico.aviso aria-hidden="true" />{e}</li>)}</ul>
                            )}
                        </div>
                        <div className="acoes">
                            <button type="button" className="btn" onClick={() => { guardarProposta(null); avisar('Proposta descartada', 'info'); }} disabled={salvando}>
                                <Ico.apagar aria-hidden="true" />Descartar
                            </button>
                            {roteiroProposto && (
                                <button type="button" className="btn primario" onClick={salvarProposta} disabled={salvando} aria-busy={salvando}>
                                    {salvando && <Girador />}
                                    <Ico.salvar aria-hidden="true" /><span>Salvar roteiro</span>
                                </button>
                            )}
                        </div>
                    </div>
                )}

                <Trocar chave={roteiroProposto ? 'proposta' : roteiro ? 'roteiro' : 'vazio'}>
                    {roteiroProposto
                        ? <FolhaRoteiro roteiro={{ ...roteiroProposto, n: ep.n }} nomes={nomes} locais={nomesLocais} rascunho />
                        : roteiro
                            ? <FolhaRoteiro roteiro={roteiro} nomes={nomes} locais={nomesLocais} />
                            : (
                                <Vazio
                                    icone={Ico.roteiro}
                                    titulo="Sem roteiro ainda"
                                    texto={`O showrunner escreve ${textoDuracao(ep.duracaoAlvoS)} ${ep.semEscolha ? 'sem votação' : 'com escolha A/B'}, usando a memória da série. Você lê aqui antes de salvar.`}
                                >
                                    <button type="button" className="btn primario" onClick={() => { setErroIA(''); setPedido(true); }}>
                                        <Ico.showrunner aria-hidden="true" />Escrever roteiro
                                    </button>
                                    <span className="vazio-custo num">até {GlobalVar.usdFino(TETO_ETAPA_USD)}</span>
                                </Vazio>
                            )}
                </Trocar>
            </section>

            <ConfirmarCusto
                aberto={pedido}
                titulo={`Escrever o roteiro do Ep. ${ep.n}`}
                descricao={`Roteiro de ${textoDuracao(ep.duracaoAlvoS)}${ep.semEscolha ? ', sem votação A/B' : ', com escolha A/B'}. Chamada de texto ao OpenRouter (até 2 tentativas). O valor abaixo é o teto; o custo real costuma ser bem menor.`}
                itens={[{ descricao: `Texto · ${(serie.modelos && serie.modelos.texto) || 'modelo padrão'} · teto da etapa`, usd: TETO_ETAPA_USD, estimativa: true }]}
                teto={{ rotulo: 'Teto da série', tetoUsd: tetoSerie, gastoUsd: gasto }}
                verbo="Escrever"
                ocupado={escrevendo}
                progresso={escrevendo ? 'Esperando a resposta do showrunner…' : ''}
                erro={erroIA}
                onCancelar={() => { setPedido(false); setErroIA(''); }}
                onConfirmar={escrever}
            />
        </div>
    );
}

export default function Episodios({ serieId, dados, detalhes, recarregar, irPara, params, abrirNovo }) {
    const eps = episodiosDaTemporada(dados.serie, dados.biblia, detalhes);
    const criados = eps.filter((e) => e.criado);
    const planejados = eps.filter((e) => !e.criado);
    const chaveCriados = criados.map((e) => e.n).join(',');
    const [resumos, setResumos] = useState({}); // n → resumo da Mesa (null = sem edição/erro; ausente = lendo)

    // O que a Mesa já tem (falas, vídeo, montagem) — GET /LerEdicao, só leitura.
    useEffect(() => {
        let vivo = true;
        const ns = chaveCriados ? chaveCriados.split(',').map(Number) : [];
        Promise.all(ns.map((n) => LerEdicao({ serie: serieId, ep: n }))).then((rs) => {
            if (!vivo) return;
            const m = {};
            rs.forEach((r, i) => { m[ns[i]] = erroDe(r) ? null : resumoDaEdicao(r); });
            setResumos(m);
        });
        return () => { vivo = false; };
    }, [serieId, chaveCriados]);

    const sel = Number(params.get('ep'));
    const epSel = criados.find((e) => e.n === sel) || null;

    function abrir(ep) {
        if (ep.criado) irPara('episodios', { ep: ep.n });
        else abrirNovo({ n: ep.n, titulo: ep.titulo });
    }

    return (
        <div className="episodios">
            <Trocar chave={epSel ? `ep-${epSel.n}` : 'grade'}>
                {epSel ? (
                    <PaginaEpisodio
                        key={epSel.n}
                        serieId={serieId}
                        dados={dados}
                        ep={epSel}
                        resumo={resumos[epSel.n]}
                        recarregar={recarregar}
                        irPara={irPara}
                    />
                ) : (
                    <section className="secao" aria-labelledby="h-episodios">
                        <div className="eps-cab">
                            <div>
                                <h2 id="h-episodios">Episódios</h2>
                                <p>{criados.length === 1 ? '1 criado' : `${criados.length} criados`} de {eps.length}. Toque no pôster para ler o roteiro; cada episódio tem a duração que você quiser.</p>
                            </div>
                            <button type="button" className="btn primario" onClick={() => abrirNovo()}>
                                <Ico.novo className="ico-pular" aria-hidden="true" />Novo episódio
                            </button>
                        </div>
                        {criados.length === 0 ? (
                            <Vazio icone={Ico.episodio} titulo="Nenhum episódio criado ainda" texto="Crie o primeiro com a duração que quiser: 5 s, 15 s, 60 s ou mais.">
                                <button type="button" className="btn primario" onClick={() => abrirNovo()}><Ico.novo aria-hidden="true" />Novo episódio</button>
                            </Vazio>
                        ) : (
                            <Lista as="ul" className="posteres">
                                {criados.map((ep) => (
                                    <Item as="li" key={ep.n}>
                                        <Poster serieId={serieId} dados={dados} ep={ep} resumo={resumos[ep.n]} onAbrir={abrir} />
                                    </Item>
                                ))}
                            </Lista>
                        )}

                        {planejados.length > 0 && (
                            <section className="eps-mapa" aria-labelledby="h-eps-mapa">
                                <div className="eps-mapa-cab">
                                    <h3 id="h-eps-mapa"><Ico.temporada aria-hidden="true" />No mapa da temporada</h3>
                                    <p>Ainda sem pasta. Crie quando for escrever; a duração é você quem escolhe.</p>
                                </div>
                                <ul className="eps-mapa-lista">
                                    {planejados.map((ep) => (
                                        <li key={ep.n}>
                                            <button type="button" className="slot" onClick={() => abrir(ep)} aria-label={`Criar o Ep. ${ep.n}: ${ep.titulo}`}>
                                                <span className="slot-n num" aria-hidden="true">{dois(ep.n)}</span>
                                                <span className="slot-txt">
                                                    <strong>{ep.titulo}</strong>
                                                    {ep.fase && <span>{ep.fase}</span>}
                                                </span>
                                                <span className="slot-criar" aria-hidden="true"><Ico.novo className="ico-pular" />Criar</span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        )}
                    </section>
                )}
            </Trocar>
        </div>
    );
}
