import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useReducedMotion } from 'framer-motion';
import GlobalVar from '../subComponents/GlobalVar';
import ConfirmarCusto from '../subComponents/ConfirmarCusto';
import { Ico } from '../subComponents/icones';
import { Girador, Item, Lista, Trocar, Vazio, Visto, avisar } from '../subComponents/Movimento';
import { ExecutarEtapa, LerNotasEpisodio, SalvarNotasEpisodio, SalvarRoteiro, rotaIndisponivel } from '../funcionalidades/bancoGet';
import { erroDe } from '../funcionalidades/fetchFunc';
import FolhaRoteiro from './FolhaRoteiro';
import RefazerRoteiro from './RefazerRoteiro';
import ApagarEpisodio from './ApagarEpisodio';
import VersoesRoteiro from './VersoesRoteiro';
import NotasRoteiro from './NotasRoteiro';
import HistoricoPropostas from './HistoricoPropostas';
import CompararRoteiros from './CompararRoteiros';
import MenuAcoes from '../subComponents/MenuAcoes';
import PromptEtapa from '../subComponents/PromptEtapa';
import { TETO_ETAPA_USD, episodiosDaTemporada, imagemDoEpisodio, textoDuracao } from './serieUtil';
import { lerProducao, selosEpisodio } from './producaoUtil';
import DuracaoEpisodio from './DuracaoEpisodio';
import ProximoPasso from '../producao/ProximoPasso';
import AvisoVozes from '../producao/AvisoVozes';
import '../../assets/css/Episodios.css';

const ICONE_ETAPA = { roteiro: Ico.roteiro, falas: Ico.voz, video: Ico.video, montado: Ico.montar };
const ICONE_ESTADO = { ok: Ico.ok, aviso: Ico.aviso, andamento: Ico.carregando, perigo: Ico.erro, falta: Ico.pendente };
const dois = (n) => String(n).padStart(2, '0');
// Trecho curto de um texto do Rafael para a confirmação de custo.
const trecho = (t, max = 140) => {
    const x = String(t || '').trim().replace(/\s+/g, ' ');
    return x.length > max ? `${x.slice(0, max)}…` : x.replace(/[.!?;,\s]+$/, '');
};

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
function Poster({ serieId, dados, ep, prod, onAbrir }) {
    const img = imagemDoEpisodio(dados, ep);
    const etapas = selosEpisodio(prod, { criado: ep.criado, temRoteiro: Boolean(ep.detalhe && ep.detalhe.roteiro) });
    const saida = prod && prod.render && prod.render.saida ? GlobalVar.urlMidia(serieId, prod.render.saida) : null;
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
function PaginaEpisodio({ serieId, dados, ep, prod, recarregarProd, recarregar, irPara }) {
    const navegar = useNavigate();
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
    const [refazer, setRefazer] = useState(false);
    const [apagarEp, setApagarEp] = useState(false);
    const [versoes, setVersoes] = useState(false);
    // Pedido do roteiro novo depois de "Refazer do zero": duração e votação escolhidas no diálogo.
    const [escrita, setEscrita] = useState(null);
    const alvo = escrita || { duracaoAlvoS: ep.duracaoAlvoS, semEscolha: ep.semEscolha };
    // Notas do episódio (notas.json): observações (antes de gerar) e histórico das propostas.
    const [notas, setNotas] = useState(null);
    const [obs, setObs] = useState('');
    const [obsGuardada, setObsGuardada] = useState('');
    const [guardandoObs, setGuardandoObs] = useState(false);
    const [erroObs, setErroObs] = useState(false);
    const [ajustes, setAjustes] = useState('');
    const [modo, setModo] = useState('escrever'); // escrever | ajustarProposta | ajustarSalvo (o que a confirmação roda)
    const [comparando, setComparando] = useState(null); // entrada do histórico aberta ao lado
    const [derivados, setDerivados] = useState(true); // ao salvar por cima do salvo: guardar falas/edição/montagem junto
    const [externo, setExterno] = useState(null); // 'ver' | 'colar': o roteiro com uma IA de fora

    const img = imagemDoEpisodio(dados, ep);
    const saida = prod && prod.render && prod.render.saida ? GlobalVar.urlMidia(serieId, prod.render.saida) : null;
    const previa = usePrevia(saida);
    const etapas = selosEpisodio(prod, { criado: true, temRoteiro: Boolean(roteiro) });
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

    const versaoNaTela = proposta && proposta.historico ? proposta.historico.versao : null;
    const historico = notas && Array.isArray(notas.historico) ? notas.historico : [];

    async function carregarNotas() {
        const r = await LerNotasEpisodio({ serie: serieId, ep: ep.n });
        if (rotaIndisponivel(r) || erroDe(r)) { setNotas({ historico: [], indisponivel: true }); return null; }
        setNotas(r.notas);
        return r.notas;
    }

    useEffect(() => {
        let vivo = true;
        LerNotasEpisodio({ serie: serieId, ep: ep.n }).then((r) => {
            if (!vivo) return;
            if (rotaIndisponivel(r) || erroDe(r)) { setNotas({ historico: [], indisponivel: true }); return; }
            setNotas(r.notas);
            setObs(r.notas.observacoes || '');
            setObsGuardada(r.notas.observacoes || '');
        });
        return () => { vivo = false; };
    }, [serieId, ep.n]);

    // Guarda as observações (ao sair do campo, antes de gerar e ao refazer). true = guardadas.
    async function guardarObs(texto = obs) {
        if (texto.trim() === obsGuardada.trim()) return true;
        if (notas && notas.indisponivel) return false;
        setGuardandoObs(true);
        const r = await SalvarNotasEpisodio({ serie: serieId, ep: ep.n, observacoes: texto });
        setGuardandoObs(false);
        if (rotaIndisponivel(r) || erroDe(r)) {
            setErroObs(true);
            avisar(`Não guardei as observações: ${erroDe(r) || 'rota indisponível'}`, 'erro', 5000);
            return false;
        }
        setErroObs(false);
        setObsGuardada(r.notas.observacoes || '');
        return true;
    }

    const mudouObs = obs.trim() !== obsGuardada.trim();
    const estadoObs = guardandoObs ? 'guardando' : erroObs && mudouObs ? 'erro' : mudouObs ? 'mudou' : obs.trim() ? 'guardada' : 'vazio';

    function pedirEscrita(qual) {
        setErroIA('');
        setModo(qual);
        setPedido(true);
    }

    // O contexto do pedido de roteiro: escrever do zero ou revisar com ajustes (o mesmo para a IA do Estúdio e a de fora).
    function contextoRoteiro(qual) {
        const instrucoes = obs.trim();
        const contexto = {
            ep: ep.n,
            duracaoAlvoS: alvo.duracaoAlvoS,
            semEscolha: alvo.semEscolha,
            ...(instrucoes ? { instrucoes } : {}),
        };
        if (qual !== 'escrever') {
            contexto.ajustes = ajustes.trim();
            if (qual === 'ajustarProposta' && roteiroProposto) {
                contexto.roteiroBase = { ...roteiroProposto, n: ep.n };
                if (versaoNaTela) contexto.baseVersao = versaoNaTela;
            }
        }
        return contexto;
    }
    // Com uma IA de fora: com ajustes escritos e algo na tela, é revisão; senão, escrever do zero.
    const modoExterno = ajustes.trim() && (roteiroProposto || roteiro) ? (roteiroProposto ? 'ajustarProposta' : 'ajustarSalvo') : 'escrever';

    function receberDeFora(r) {
        setExterno(null);
        setEscrita(null);
        setComparando(null);
        const ajuste = modoExterno !== 'escrever';
        guardarProposta({ ...r, em: new Date().toISOString(), base: ajuste ? (modoExterno === 'ajustarProposta' ? 'proposta' : 'salvo') : null });
        if (ajuste && r.resultado) setAjustes('');
        carregarNotas();
        const v = r.historico ? ` (v${r.historico.versao})` : '';
        if (r.ok === false) avisar(`Resposta de fora${v} com problemas: confira antes de salvar`, 'aviso');
        else avisar(`Resposta de fora${v} na tela. Leia e salve.`, 'ok');
    }

    // Escrever do zero ou revisar com ajustes (a proposta na tela ou o roteiro salvo). Sempre depois da confirmação.
    async function escrever() {
        setEscrevendo(true);
        setErroIA('');
        await guardarObs();
        const instrucoes = obs.trim();
        const ajuste = modo !== 'escrever';
        const contexto = {
            ep: ep.n,
            duracaoAlvoS: alvo.duracaoAlvoS,
            semEscolha: alvo.semEscolha,
            ...(instrucoes ? { instrucoes } : {}),
        };
        if (ajuste) {
            contexto.ajustes = ajustes.trim();
            if (modo === 'ajustarProposta' && roteiroProposto) {
                contexto.roteiroBase = { ...roteiroProposto, n: ep.n };
                if (versaoNaTela) contexto.baseVersao = versaoNaTela;
            }
        }
        const r = await ExecutarEtapa({ etapa: 'roteiro', serieId, contexto, tetoUsd: TETO_ETAPA_USD });
        setEscrevendo(false);
        if (rotaIndisponivel(r)) { setPedido(false); avisar('O showrunner ainda não está no servidor.', 'aviso'); return; }
        if (erroDe(r)) { setErroIA(erroDe(r)); return; }
        setPedido(false);
        setEscrita(null);
        setComparando(null);
        window.dispatchEvent(new Event('estudio:gasto'));
        guardarProposta({ ...r, em: new Date().toISOString(), base: ajuste ? (modo === 'ajustarProposta' ? 'proposta' : 'salvo') : null });
        if (ajuste && r.resultado) setAjustes('');
        carregarNotas();
        const v = r.historico ? ` (v${r.historico.versao})` : '';
        if (r.ok === false) avisar(`Proposta${v} com problemas: confira antes de salvar`, 'aviso');
        else avisar(ajuste ? `Proposta ajustada${v}. Leia e salve.` : `Roteiro proposto${v}. Leia e salve.`, 'ok');
    }

    // "Usar esta": a proposta do histórico vira a proposta na tela (para ler e salvar).
    function usarDoHistorico(h) {
        if (!h || !h.resultado || !Array.isArray(h.resultado.planos)) return;
        guardarProposta({
            ok: h.ok, erros: h.erros || [], avisos: [], consertos: [], custoUsd: h.custoUsd, modelo: h.modelo,
            resultado: h.resultado, historico: { id: h.id, versao: h.versao, tipo: h.tipo }, em: h.em, doHistorico: true,
        });
        setComparando(null);
        avisar(`Proposta v${h.versao} na tela. Leia e salve.`, 'ok');
    }

    async function salvarProposta() {
        if (!roteiroProposto) return;
        setSalvando(true);
        setErroAcao('');
        // Por cima de um roteiro salvo: o atual vai para "Versões do roteiro" (mesmo caminho do Refazer).
        const r = await SalvarRoteiro({
            serie: serieId, n: ep.n, roteiro: { ...roteiroProposto, n: ep.n },
            ...(roteiro ? { guardarAnterior: true, apagarDerivados: derivados } : {}),
        });
        setSalvando(false);
        if (erroDe(r)) { setErroAcao(erroDe(r)); avisar(`Falhou: ${erroDe(r)}`, 'erro', 6000); return; }
        guardarProposta(null);
        setAprovou(false);
        avisar(r.versaoGuardada ? `Roteiro do Ep. ${ep.n} salvo. O anterior está em Versões do roteiro.` : `Roteiro do Ep. ${ep.n} salvo`, 'ok', 4500);
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

    // "Ajustar o roteiro para N s": a revisão de sempre (Pedir ajustes), com a duração NOVA do episódio e o texto pronto.
    function ajustarDuracao(dur) {
        const antes = roteiroProposto || roteiro;
        const fim = antes && Array.isArray(antes.planos) ? antes.planos.reduce((m, p) => Math.max(m, Number(p.ateS) || 0), 0) : 0;
        const mais = !fim || dur > fim;
        setEscrita(null);
        setAjustes(`Reescreva para ${textoDuracao(dur)} mantendo a história${mais ? '; acrescente cenas de introdução e desenvolvimento para preencher o tempo novo' : '; corte ou junte planos, mantendo o essencial'}.`);
        pedirEscrita(roteiroProposto ? 'ajustarProposta' : 'ajustarSalvo');
    }

    // Botões do "Próximo passo" que moram nesta página (roteiro) ou na Mesa (quadros, montar).
    function acaoDoPasso(acao) {
        if (acao === 'escreverRoteiro') pedirEscrita('escrever');
        else if (acao === 'ajustarDuracao') ajustarDuracao(ep.duracaoAlvoS);
        else if (acao === 'aprovarRoteiro') {
            const el = document.querySelector('.mesa-luz');
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            avisar('Leia o roteiro abaixo e clique em "Aprovar roteiro" no alto da página.', 'info', 5000);
        } else if (acao === 'quadros') navegar(`/serie/${serieId}/ep/${ep.n}`);
        else if (acao === 'montar') navegar(`/serie/${serieId}/ep/${ep.n}?montar=1`);
        else if (acao === 'votar') irPara('temporada', { ep: ep.n });
    }

    const temProposta = Boolean(proposta);
    // Comparar só faz sentido com algo na tela (a proposta ou o roteiro salvo) e o roteiro da versão escolhida.
    const comparacao = Boolean(comparando && comparando.resultado && Array.isArray(comparando.resultado.planos) && (roteiroProposto || roteiro));

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
                        {planos > 0 && <li><Ico.decupagem aria-hidden="true" /><span><strong className="num">{planos}</strong> {planos === 1 ? 'plano' : 'planos'}</span></li>}
                        <li><Ico.escolha aria-hidden="true" /><span>{ep.semEscolha ? 'Sem votação' : 'Escolha A/B no fim'}</span></li>
                    </ul>
                    <DuracaoEpisodio
                        serieId={serieId}
                        ep={ep.n}
                        duracaoAlvoS={ep.duracaoAlvoS}
                        semEscolha={ep.semEscolha}
                        roteiro={roteiro}
                        onMudou={async () => { setEscrita(null); await recarregar(); recarregarProd(); }}
                        onAjustar={ajustarDuracao}
                        onRefazer={() => setRefazer(true)}
                    />
                    <EtapasEp etapas={etapas} />
                    {prod && prod.falas && ((prod.falas.vozesMudaram || []).length > 0 || (prod.falas.errosVoz || []).length > 0) && (
                        <AvisoVozes serieId={serieId} ep={ep.n} mudancas={prod.falas.vozesMudaram} erros={prod.falas.errosVoz} onFeito={() => recarregarProd()} />
                    )}
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
                        {roteiro && (
                            <button type="button" className="btn fantasma" onClick={() => setRefazer(true)}>
                                <Ico.refazerRoteiro aria-hidden="true" />Refazer roteiro do zero
                            </button>
                        )}
                        <MenuAcoes
                            rotulo={`Mais ações do Ep. ${ep.n}`}
                            classeBotao="btn fantasma icone"
                            itens={[
                                ...(roteiro ? [] : [{ id: 'refazer', rotulo: 'Trocar duração ou votação', icone: Ico.duracao, onSelecionar: () => setRefazer(true) }]),
                                { id: 'versoes', rotulo: 'Versões do roteiro', icone: Ico.historico, dica: 'Roteiros guardados ao refazer: dá para voltar a um deles', onSelecionar: () => setVersoes(true) },
                                { id: 'apagar', rotulo: 'Apagar episódio', icone: Ico.apagar, perigo: true, onSelecionar: () => setApagarEp(true) },
                            ]}
                        />
                    </div>
                    {erroAcao && <p className="nota-erro" role="alert"><Ico.erro aria-hidden="true" />{erroAcao}</p>}
                </div>
            </header>

            {roteiro && (
                <ProximoPasso
                    serieId={serieId}
                    ep={ep.n}
                    prod={prod}
                    contexto="sala"
                    mostrarVozes={false}
                    modeloTexto={serie.modelos && serie.modelos.texto}
                    tetoSerie={{ tetoUsd: tetoSerie, gastoUsd: gasto }}
                    onRecarregar={recarregarProd}
                    onAcao={acaoDoPasso}
                />
            )}

            <section className="mesa-luz" aria-label="Roteiro">
                {temProposta && (
                    <div className="proposta-barra" role="region" aria-label="Proposta do showrunner">
                        <div className="proposta-texto">
                            <strong>{proposta.ok === false ? 'Proposta com problemas' : proposta.origem === 'externo' ? 'Proposta colada de fora' : 'Proposta do showrunner'}{versaoNaTela ? ` (v${versaoNaTela})` : ''}</strong>
                            <span>
                                Ainda não salva{proposta.origem === 'externo' ? ', sem custo' : Number.isFinite(proposta.custoUsd) ? `, custou ${GlobalVar.usdFino(proposta.custoUsd)}` : ''}.
                                {roteiro ? ' Salvar troca o roteiro atual; ele vai para Versões do roteiro.' : ''}
                            </span>
                            {roteiro && roteiroProposto && (
                                <label className="proposta-check">
                                    <input type="checkbox" checked={derivados} onChange={(e) => setDerivados(e.target.checked)} disabled={salvando} />
                                    <span>Guardar junto falas, edição, legendas e montagem feitas com o roteiro atual</span>
                                </label>
                            )}
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

                <NotasRoteiro
                    observacoes={obs}
                    onObservacoes={(t) => { setObs(t); setErroObs(false); }}
                    estadoObs={estadoObs}
                    onGuardarObs={() => guardarObs()}
                    abertoInicial={!roteiro && !roteiroProposto}
                    ajustes={ajustes}
                    onAjustes={setAjustes}
                    base={roteiroProposto ? 'proposta' : roteiro ? 'salvo' : null}
                    versaoBase={versaoNaTela}
                    ocupado={escrevendo}
                    onPedirAjustes={() => pedirEscrita(roteiroProposto ? 'ajustarProposta' : 'ajustarSalvo')}
                />
                <div className="ep-externo" role="group" aria-label="Roteiro com uma IA de fora">
                    <span className="suave">
                        <Ico.pedirIA aria-hidden="true" />
                        Usar outra IA ({modoExterno === 'escrever' ? 'escrever do zero' : 'com os ajustes acima'}):
                    </span>
                    <button type="button" className="btn mini fantasma" onClick={async () => { await guardarObs(); setExterno('ver'); }} title="O prompt exato do roteiro, para colar no ChatGPT, Claude, Gemini... (não gasta nada)">
                        <Ico.verPrompt aria-hidden="true" />Ver prompt
                    </button>
                    <button type="button" className="btn mini fantasma" onClick={() => setExterno('colar')} title="Cole a resposta gerada fora: ela passa pelas mesmas conferências (sem custo)">
                        <Ico.colar aria-hidden="true" />Colar resposta de fora
                    </button>
                </div>
                <HistoricoPropostas
                    historico={historico}
                    naTela={versaoNaTela}
                    comparando={comparando ? comparando.versao : null}
                    onComparar={setComparando}
                    onUsar={usarDoHistorico}
                />

                <Trocar chave={comparacao ? `cmp-${comparando.versao}` : roteiroProposto ? 'proposta' : roteiro ? 'roteiro' : 'vazio'}>
                    {comparacao ? (
                        <CompararRoteiros
                            n={ep.n}
                            esquerda={roteiroProposto
                                ? { rotulo: versaoNaTela ? `a proposta na tela (v${versaoNaTela})` : 'a proposta na tela', roteiro: roteiroProposto, rascunho: true }
                                : { rotulo: 'o roteiro salvo', roteiro }}
                            direita={{ rotulo: `v${comparando.versao}`, roteiro: comparando.resultado }}
                            nomes={nomes}
                            locais={nomesLocais}
                            onUsar={versaoNaTela === comparando.versao ? null : () => usarDoHistorico(comparando)}
                            onFechar={() => setComparando(null)}
                        />
                    ) : roteiroProposto
                        ? <FolhaRoteiro roteiro={{ ...roteiroProposto, n: ep.n }} nomes={nomes} locais={nomesLocais} rascunho />
                        : roteiro
                            ? <FolhaRoteiro roteiro={roteiro} nomes={nomes} locais={nomesLocais} />
                            : (
                                <Vazio
                                    icone={Ico.roteiro}
                                    titulo="Sem roteiro ainda"
                                    texto={`O showrunner escreve ${textoDuracao(alvo.duracaoAlvoS)} ${alvo.semEscolha ? 'sem votação' : 'com escolha A/B'}, usando a memória da série${obs.trim() ? ' e as suas observações' : ''}. Você lê aqui antes de salvar e pode pedir ajustes depois.`}
                                >
                                    <button type="button" className="btn primario" onClick={() => pedirEscrita('escrever')}>
                                        <Ico.showrunner aria-hidden="true" />Escrever roteiro
                                    </button>
                                    <span className="vazio-custo num">até {GlobalVar.usdFino(TETO_ETAPA_USD)}</span>
                                </Vazio>
                            )}
                </Trocar>
            </section>

            <ConfirmarCusto
                aberto={pedido}
                titulo={modo === 'ajustarProposta' ? `Regerar o roteiro do Ep. ${ep.n} com ajustes`
                    : modo === 'ajustarSalvo' ? `Ajustar o roteiro salvo do Ep. ${ep.n}` : `Escrever o roteiro do Ep. ${ep.n}`}
                descricao={modo === 'escrever'
                    ? `Roteiro de ${textoDuracao(alvo.duracaoAlvoS)}${alvo.semEscolha ? ', sem votação A/B' : ', com escolha A/B'}${obs.trim() ? `, com as suas observações: "${trecho(obs)}"` : ''}. Chamada de texto ao OpenRouter (até 2 tentativas). O valor abaixo é o teto; o custo real costuma ser bem menor.`
                    : `O showrunner reescreve ${modo === 'ajustarProposta' ? `a proposta na tela${versaoNaTela ? ` (v${versaoNaTela})` : ''}` : 'o roteiro salvo'} aplicando: "${trecho(ajustes)}". O resto fica como está${obs.trim() ? ' e as observações continuam valendo' : ''}. ${modo === 'ajustarSalvo' ? 'O roteiro salvo só troca quando você salvar a proposta nova. ' : ''}O valor abaixo é o teto; o custo real costuma ser bem menor.`}
                itens={[{ descricao: `Texto · ${(serie.modelos && serie.modelos.texto) || 'modelo padrão'} · teto da etapa`, usd: TETO_ETAPA_USD, estimativa: true }]}
                teto={{ rotulo: 'Teto da série', tetoUsd: tetoSerie, gastoUsd: gasto }}
                verbo={modo === 'escrever' ? 'Escrever' : 'Regerar'}
                ocupado={escrevendo}
                progresso={escrevendo ? (modo === 'escrever' ? 'Esperando a resposta do showrunner…' : 'O showrunner está aplicando os ajustes…') : ''}
                erro={erroIA}
                onCancelar={() => { setPedido(false); setErroIA(''); }}
                onConfirmar={escrever}
            />

            <PromptEtapa
                aberto={Boolean(externo)}
                modo={externo || 'ver'}
                titulo={modoExterno === 'ajustarProposta' ? `Roteiro do Ep. ${ep.n}: ajustar a proposta com outra IA`
                    : modoExterno === 'ajustarSalvo' ? `Roteiro do Ep. ${ep.n}: ajustar o salvo com outra IA` : `Roteiro do Ep. ${ep.n} com outra IA`}
                etapa="roteiro"
                serieId={serieId}
                obterContexto={async () => contextoRoteiro(modoExterno)}
                onFechar={() => setExterno(null)}
                onResultado={receberDeFora}
            />

            <RefazerRoteiro
                aberto={refazer}
                serieId={serieId}
                ep={ep}
                observacoes={obs}
                onFechar={() => setRefazer(false)}
                onFeito={async (novo) => {
                    setRefazer(false);
                    guardarProposta(null);
                    setAprovou(false);
                    setComparando(null);
                    setEscrita({ duracaoAlvoS: novo.duracaoAlvoS, semEscolha: novo.semEscolha });
                    // As observações do diálogo passam a ser as do episódio (guardadas em notas.json).
                    setObs(novo.instrucoes || '');
                    await guardarObs(novo.instrucoes || '');
                    await recarregar();
                    // Em seguida, o fluxo de sempre: a confirmação de custo e o showrunner escrevendo.
                    pedirEscrita('escrever');
                }}
            />
            <VersoesRoteiro
                aberto={versoes}
                serieId={serieId}
                ep={ep}
                onFechar={() => setVersoes(false)}
                onRestaurado={async () => {
                    setVersoes(false);
                    setAprovou(false);
                    setEscrita(null);
                    await recarregar();
                }}
            />
            <ApagarEpisodio
                aberto={apagarEp}
                serieId={serieId}
                ep={ep}
                onFechar={() => setApagarEp(false)}
                onRefazer={() => { setApagarEp(false); setRefazer(true); }}
                onApagado={async () => {
                    setApagarEp(false);
                    irPara('episodios');
                    await recarregar();
                }}
            />
        </div>
    );
}

export default function Episodios({ serieId, dados, detalhes, recarregar, irPara, params, abrirNovo }) {
    const eps = episodiosDaTemporada(dados.serie, dados.biblia, detalhes);
    const criados = eps.filter((e) => e.criado);
    const planejados = eps.filter((e) => !e.criado);
    const chaveCriados = criados.map((e) => e.n).join(',');
    const [prods, setProds] = useState({}); // n → estado das etapas (null = erro; ausente = lendo)

    // Estado REAL de cada episódio (roteiro, falas, decupagem, vídeos, montagem) — GET /EstadoProducao, só leitura.
    const lerUm = useCallback(async (n) => {
        const ep = criados.find((e) => e.n === n);
        const r = await lerProducao(serieId, n, { roteiro: ep && ep.detalhe && ep.detalhe.roteiro, entrada: ep || {} });
        setProds((x) => ({ ...x, [n]: r && !r.erro ? r : null }));
        return r;
    }, [serieId, chaveCriados, detalhes]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => {
        const ns = chaveCriados ? chaveCriados.split(',').map(Number) : [];
        ns.forEach((n) => { lerUm(n); });
    }, [lerUm, chaveCriados]);

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
                        prod={prods[epSel.n]}
                        recarregarProd={() => lerUm(epSel.n)}
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
                                        <Poster serieId={serieId} dados={dados} ep={ep} prod={prods[ep.n]} onAbrir={abrir} />
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
