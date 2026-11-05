// BARRA DO TRECHO selecionado: "Regerar vídeo deste trecho" (cotar → ver custo, quadros e ajuste → confirmar com
// clique → acompanhar), "Regerar fala" (abre a fala no inspetor) e "Regerar legenda". Nada é pago sem o clique
// em "Confirmar e gerar"; o token da cotação vale 10 min e só para aquele pedido. (Só o visual mudou em 04/11.)
import { useEffect, useMemo, useState } from 'react';
import '../../assets/css/MesaTrecho.css';
import * as M from './mesaUtil';
import { useCatalogo } from './mesaMidia';
import { CotarTrecho, RegerarTrecho, RegerarLegenda } from '../funcionalidades/bancoGet';
import { erroDe } from '../funcionalidades/fetchFunc';
import { Ico } from '../subComponents/icones';
import { Expandir, Trocar, Girador, Contador, Visto } from '../subComponents/Movimento';

function textoAjuste(c) {
    const len = M.fmtS(c.duracaoS, 2);
    if (c.ajuste === 'acelerar') return `O modelo gera ${c.duracaoPedidaS} s; acelera ${String(c.fator).replace('.', ',')}× para caber em ${len} e emendar nas duas pontas.`;
    if (c.ajuste === 'aparar') return `O modelo gera ${c.duracaoPedidaS} s; apara para ${len} (o fim pode pular na emenda).`;
    return `O modelo gera exatamente ${len}.`;
}

// segundos desde que a regeração começou (atualiza a cada segundo enquanto gera)
function useDecorrido(desdeIso, ativo) {
    const [agora, setAgora] = useState(Date.now());
    useEffect(() => {
        if (!ativo) return undefined;
        const id = setInterval(() => setAgora(Date.now()), 1000);
        return () => clearInterval(id);
    }, [ativo]);
    const t0 = desdeIso ? Date.parse(desdeIso) : NaN;
    return Number.isFinite(t0) ? Math.max(0, Math.round((agora - t0) / 1000)) : null;
}

function fmtDecorrido(s) {
    if (s === null) return '';
    const m = Math.floor(s / 60);
    return m ? `${m} min ${String(s % 60).padStart(2, '0')} s` : `${s} s`;
}

// Acompanhamento de uma regeração: etapas Enviado → Gerando → Aparando → Pronto, a atual com o ponto vivo vermelho.
function Acompanhar({ r }) {
    const passo = M.passoRegeracao(r);
    const falhou = r.status === 'falhou';
    const gerando = r.status === 'gerando';
    const decorrido = useDecorrido(r.iniciadoEm, gerando);
    return (
        <div className={`tr-acomp ${falhou ? 'falhou' : ''}`}>
            <div className="tr-acomp-cab">
                <b>Plano {r.plano}</b>
                {gerando && <span className="estado vivo">{r.etapa ? r.etapa[0].toUpperCase() + r.etapa.slice(1) : 'Gerando'}</span>}
                {r.status === 'pronto' && <span className="tr-pronto"><Visto tamanho={15} />Pronto: o take entrou na linha do tempo</span>}
                {falhou && <span className="tr-falhou"><Ico.erro aria-hidden="true" />Falhou{r.erro ? `: ${r.erro}` : ''}</span>}
                {gerando && decorrido !== null && <span className="tr-decorrido num">{fmtDecorrido(decorrido)}</span>}
            </div>
            <ol className="tr-etapas" aria-label="Etapas da regeração">
                {M.ETAPAS_REGERACAO.map((nome, i) => {
                    const estado = falhou && i === passo ? 'erro' : i < passo || r.status === 'pronto' ? 'feito' : i === passo ? 'agora' : 'depois';
                    return (
                        <li key={nome} className={estado} aria-current={estado === 'agora' ? 'step' : undefined}>
                            <span className="tr-etapa-marca" aria-hidden="true">{estado === 'feito' ? <Ico.confirmar /> : null}</span>
                            {nome}
                        </li>
                    );
                })}
            </ol>
        </div>
    );
}

export default function MesaTrecho({ serie, ep, doc, trecho, setTrecho, ctx, atualizarMesa, salvarAgora, receberDoServidor, mostrarAviso, abrirFala }) {
    const [modo, setModo] = useState(null); // null | 'video' | 'fala'
    const [instrucao, setInstrucao] = useState('');
    const [modelo, setModelo] = useState('');
    const [cotacao, setCotacao] = useState(null);
    const [ocupado, setOcupado] = useState(null);
    const [erro, setErro] = useState(null);
    const cat = useCatalogo();
    const dur = trecho.ate - trecho.de;
    const partes = useMemo(() => M.limitesPlanos(doc)
        .map((l) => ({ plano: l.n, de: Math.max(trecho.de, l.deS), ate: Math.min(trecho.ate, l.ateS) }))
        .filter((p) => p.ate - p.de >= 0.25), [doc, trecho]);
    const falas = useMemo(() => M.FAIXAS_AUDIO.flatMap((f) => doc.faixas[f] || [])
        .filter((f) => f.inicioS < trecho.ate && M.fimDe(f) > trecho.de), [doc, trecho]);
    const modelos = cat ? cat.modelos.filter((m) => (m.quadros || []).includes('first_frame') && (m.proporcoes || []).includes('9:16')) : [];
    const regs = ((ctx.mesa && ctx.mesa.regeracoes) || []);
    const acompanhando = cotacao ? regs.filter((r) => cotacao.cotacoes.some((c) => c.id === r.id) && r.status !== 'cotado') : [];

    // trocar o trecho invalida a cotação
    useEffect(() => { setCotacao(null); setErro(null); }, [trecho.de, trecho.ate]);

    const cotar = async () => {
        setErro(null);
        setOcupado('cotando');
        await salvarAgora();
        const r = await CotarTrecho({ serie, ep, deS: trecho.de, ateS: trecho.ate, instrucao, modelo: modelo || undefined });
        setOcupado(null);
        if (erroDe(r)) { setErro(erroDe(r)); return; }
        setCotacao(r);
    };

    const confirmar = async () => {
        if (!cotacao) return;
        setOcupado('enviando');
        const r = await RegerarTrecho({ serie, ep, confirmacoes: cotacao.cotacoes.map((c) => ({ id: c.id, token: c.token })) });
        setOcupado(null);
        if (erroDe(r)) { setErro(erroDe(r)); return; }
        const novas = r.regeracoes || [];
        atualizarMesa({ ...ctx.mesa, regeracoes: [...regs.filter((x) => !novas.some((n) => n.id === x.id)), ...novas] });
        setCotacao({ ...cotacao, enviada: true });
        mostrarAviso(cotacao.simulado ? 'Enviado em modo simulado (sem custo). O take entra sozinho quando ficar pronto.' : 'Pedido enviado. O take entra sozinho quando ficar pronto.', 'ok');
    };

    const legenda = async () => {
        setOcupado('legenda');
        await salvarAgora();
        const r = await RegerarLegenda({ serie, ep, deS: trecho.de, ateS: trecho.ate });
        setOcupado(null);
        if (erroDe(r)) return mostrarAviso(erroDe(r), 'erro');
        await receberDoServidor(r);
        mostrarAviso(`Legenda refeita para ${r.falas} fala(s) do trecho.`, 'ok');
        return null;
    };

    const etapa = !modo ? 'nada' : modo === 'fala' ? 'fala' : cotacao ? (cotacao.enviada ? 'enviada' : 'cotacao') : 'form';

    return (
        <section className="tr" aria-label="Trecho selecionado">
            <div className="tr-linha">
                <div className="tr-info">
                    <span className="tr-titulo"><Ico.regerarTrecho aria-hidden="true" />Trecho</span>
                    <span className="num tr-tempos">{M.fmtTempo(trecho.de, 2)} – {M.fmtTempo(trecho.ate, 2)}</span>
                    <span className="tr-dur num">{M.fmtS(dur, 2)}</span>
                    <span className="tr-planos">
                        {partes.length ? partes.map((p) => <span key={p.plano} className="tr-plano">P{p.plano}</span>) : <span className="tr-fora">Fora dos planos</span>}
                    </span>
                </div>
                <div className="tr-botoes">
                    <button type="button" className={`btn mini ${modo === 'video' ? 'ligado' : ''}`} aria-pressed={modo === 'video'} disabled={!partes.length} onClick={() => setModo(modo === 'video' ? null : 'video')}>
                        <Ico.video aria-hidden="true" />Regerar vídeo deste trecho
                    </button>
                    <button type="button" className={`btn mini ${modo === 'fala' ? 'ligado' : ''}`} aria-pressed={modo === 'fala'} disabled={!falas.length} onClick={() => (falas.length === 1 ? abrirFala(falas[0].id) : setModo(modo === 'fala' ? null : 'fala'))}>
                        <Ico.voz aria-hidden="true" />Regerar fala
                    </button>
                    <button type="button" className="btn mini" aria-busy={ocupado === 'legenda'} disabled={!falas.length || ocupado === 'legenda'} onClick={legenda}>
                        {ocupado === 'legenda' && <Girador />}<Ico.legenda aria-hidden="true" />Regerar legenda
                    </button>
                    <button type="button" className="btn mini icone fantasma" onClick={() => setTrecho(null)} title="Limpar o trecho (Esc)" aria-label="Limpar o trecho">
                        <Ico.fechar aria-hidden="true" />
                    </button>
                </div>
            </div>

            <Expandir aberto={Boolean(modo)}>
                <div className="tr-painel">
                    <Trocar chave={etapa}>
                        {modo === 'fala' && (
                            <div className="tr-falas">
                                <span className="tr-rotulo">Falas no trecho</span>
                                {falas.map((f) => (
                                    <button key={f.id} type="button" className="tr-fala" onClick={() => abrirFala(f.id)}>
                                        <span className="tr-amostra" style={{ background: M.corDe(f.quem) }} aria-hidden="true" />
                                        <b>{M.nomeDe(f.quem)}</b><span className="tr-fala-txt">{f.texto}</span>
                                        <Ico.direita className="tr-fala-ir" aria-hidden="true" />
                                    </button>
                                ))}
                            </div>
                        )}

                        {modo === 'video' && !cotacao && (
                            <div className="tr-form">
                                <label className="tr-campo tr-instrucao">
                                    <span className="tr-rotulo">O que muda neste trecho</span>
                                    <input value={instrucao} onChange={(e) => setInstrucao(e.target.value)} placeholder="Ex.: ela vira para a janela" onKeyDown={(e) => { if (e.key === 'Enter') cotar(); }} />
                                </label>
                                <label className="tr-campo">
                                    <span className="tr-rotulo">Modelo</span>
                                    <select value={modelo} onChange={(e) => setModelo(e.target.value)}>
                                        <option value="">Do plano ou da série</option>
                                        {modelos.map((m) => <option key={m.id} value={m.id}>{m.nome}{(m.quadros || []).includes('last_frame') ? ' · 1º e último quadro' : ' · só 1º quadro'}</option>)}
                                    </select>
                                </label>
                                <div className="tr-cotar">
                                    <button type="button" className="btn" aria-busy={ocupado === 'cotando'} disabled={ocupado === 'cotando' || !partes.length} onClick={cotar}>
                                        {ocupado === 'cotando' && <Girador />}<Ico.custo aria-hidden="true" />Cotar custo
                                    </button>
                                    <span className="tr-nota"><Ico.info aria-hidden="true" />Cotar não gasta nada.</span>
                                </div>
                            </div>
                        )}

                        {modo === 'video' && cotacao && (
                            <div className="tr-cotacao">
                                {cotacao.cotacoes.map((c) => (
                                    <div key={c.id} className="tr-pedido">
                                        <div className="tr-quadros">
                                            <figure>
                                                {c.quadros.primeiro ? <img src={M.midiaUrl(serie, c.quadros.primeiro)} alt="Primeiro quadro" /> : <div className="tr-sem">sem</div>}
                                                <figcaption>1º quadro</figcaption>
                                            </figure>
                                            <Ico.direita className="tr-seta" aria-hidden="true" />
                                            <figure>
                                                {c.quadros.ultimo ? <img src={M.midiaUrl(serie, c.quadros.ultimo)} alt="Último quadro" /> : <div className="tr-sem">livre</div>}
                                                <figcaption>Último</figcaption>
                                            </figure>
                                        </div>
                                        <div className="tr-detalhe">
                                            <div className="tr-detalhe-cab">
                                                <b>Plano {c.plano}</b>
                                                <span className="num">{M.fmtTempo(c.deS, 2)} – {M.fmtTempo(c.ateS, 2)}</span>
                                                <span className="tr-modelo">{c.nomeModelo || c.modelo}</span>
                                            </div>
                                            <p>{textoAjuste(c)}</p>
                                            <p className="tr-prompt" title={c.prompt}>{c.prompt}</p>
                                            {(c.avisos || []).filter((a) => !/acelerado|aparado/.test(a)).map((a, i) => <p key={i} className="tr-aviso"><Ico.aviso aria-hidden="true" />{a}</p>)}
                                        </div>
                                        <div className="tr-custo">
                                            <span className="tr-rotulo">Custo previsto</span>
                                            <Contador valor={c.custoPrevistoUsd} formatar={M.fmtUsd} className="tr-valor" />
                                            {c.estimativa && <span className="tr-nota">Estimativa</span>}
                                            {c.orcamento && c.orcamento.tetos && (
                                                <span className="tr-nota">Episódio: {M.fmtUsd(c.orcamento.gastoEpisodioUsd || 0)} gastos de {M.fmtUsd(c.orcamento.tetos.episodio || 0)}</span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                                <div className="tr-confirmar">
                                    {cotacao.simulado && <span className="tr-simulado"><Ico.simulado aria-hidden="true" />Modo simulado: nada é cobrado</span>}
                                    {!cotacao.enviada ? (
                                        <>
                                            <button type="button" className="btn fantasma" onClick={() => setCotacao(null)} disabled={Boolean(ocupado)}>
                                                <Ico.voltar className="ico-voltar" aria-hidden="true" />Voltar
                                            </button>
                                            <button type="button" className="btn primario" onClick={confirmar} aria-busy={ocupado === 'enviando'} disabled={Boolean(ocupado)}>
                                                {ocupado === 'enviando' && <Girador />}<Ico.custo aria-hidden="true" />Confirmar e gerar · {M.fmtUsd(cotacao.totalUsd)}
                                            </button>
                                        </>
                                    ) : (
                                        <div className="tr-progresso">
                                            {acompanhando.length === 0 && <span className="estado vivo">Enviado</span>}
                                            {acompanhando.map((r) => <Acompanhar key={r.id} r={r} />)}
                                            {acompanhando.length > 0 && acompanhando.every((r) => r.status !== 'gerando') && (
                                                <button type="button" className="btn mini" onClick={() => { setCotacao(null); setModo(null); }}>
                                                    <Ico.confirmar aria-hidden="true" />Fechar
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </Trocar>
                    {erro && <p className="nota-erro tr-erro"><Ico.erro aria-hidden="true" />{erro}</p>}
                </div>
            </Expandir>
        </section>
    );
}
