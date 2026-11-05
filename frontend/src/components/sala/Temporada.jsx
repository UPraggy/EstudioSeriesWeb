import { Fragment, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import GlobalVar from '../subComponents/GlobalVar';
import Dialogo from '../subComponents/Dialogo';
import { Ico } from '../subComponents/icones';
import { Girador, Trocar, Vazio, avisar } from '../subComponents/Movimento';
import { RegistrarVotacao } from '../funcionalidades/bancoGet';
import { erroDe } from '../funcionalidades/fetchFunc';
import { classeEstado, episodiosDaTemporada, imagemPrincipal, caminhoDaFicha, textoDuracao } from './serieUtil';
import '../../assets/css/Temporada.css';

const FONTES = [
    { id: 'manual', rotulo: 'Contagem manual (comentários das redes)' },
    { id: 'youtube', rotulo: 'Comentários do YouTube' },
];

function textoVencedora(escolha) {
    if (!escolha || !escolha.vencedora) return null;
    const v = escolha.votos || {};
    if (escolha.vencedora === 'empate') return `Empate (${v.A ?? 0} × ${v.B ?? 0})`;
    return `${escolha.vencedora} venceu (${v.A ?? 0} × ${v.B ?? 0})`;
}

// Registro da votação REAL: só números contados de verdade; nada é sugerido nem preenchido.
function VotacaoDialogo({ serieId, ep, aberto, onFechar, onSalvo }) {
    const [a, setA] = useState('');
    const [b, setB] = useState('');
    const [fonte, setFonte] = useState('manual');
    const [erro, setErro] = useState('');
    const [ocupado, setOcupado] = useState(false);

    useEffect(() => { if (aberto) { setA(''); setB(''); setFonte('manual'); setErro(''); setOcupado(false); } }, [aberto]);

    const inteiro = (v) => /^\d+$/.test(String(v).trim());
    const prontos = inteiro(a) && inteiro(b);
    const na = prontos ? Number(a) : 0;
    const nb = prontos ? Number(b) : 0;
    let previa = 'Preencha as duas contagens.';
    if (prontos && na + nb === 0) previa = 'Sem votos (0 × 0): nada a registrar.';
    else if (prontos) previa = na === nb ? `Empate: ${na} × ${nb}.` : `${na > nb ? 'A' : 'B'} vence por ${Math.max(na, nb)} × ${Math.min(na, nb)}.`;

    async function salvar(e) {
        e.preventDefault();
        if (!prontos) { setErro('Informe as duas contagens com números inteiros (0 ou mais).'); return; }
        if (na + nb === 0) { setErro('Sem votos (0 × 0): nada a registrar.'); return; }
        setOcupado(true);
        setErro('');
        const r = await RegistrarVotacao({ serie: serieId, n: ep.n, A: na, B: nb, fonte });
        setOcupado(false);
        if (erroDe(r)) { setErro(erroDe(r)); avisar(`Falhou: ${erroDe(r)}`, 'erro', 5000); return; }
        onSalvo(r);
    }

    if (!ep) return null;
    const escolha = ep.escolha || {};
    return (
        <Dialogo
            id="votacao"
            aberto={aberto}
            titulo={`Registrar votação real — Ep. ${ep.n}`}
            descricao="Informe a contagem real dos comentários. O resultado nunca é inventado nem estimado."
            onFechar={onFechar}
            travado={ocupado}
            rodape={(
                <>
                    <button type="button" className="btn" onClick={onFechar} disabled={ocupado}>Cancelar</button>
                    <button type="submit" form="form-votacao" className="btn primario" disabled={ocupado} aria-busy={ocupado}>
                        {ocupado && <Girador />}
                        <Ico.salvar aria-hidden="true" /><span>Salvar votação</span>
                    </button>
                </>
            )}
        >
            <form id="form-votacao" onSubmit={salvar} className="votacao-form" noValidate>
                {escolha.vencedora && (
                    <p className="dlg-aviso">Já registrada: {textoVencedora(escolha)}. Salvar de novo substitui a contagem.</p>
                )}
                <div className="dlg-grade2">
                    <label className="dlg-campo">
                        <span>Votos A — {escolha.A || 'opção A'}</span>
                        <input type="number" inputMode="numeric" min="0" step="1" value={a} onChange={(e) => setA(e.target.value)} data-foco />
                    </label>
                    <label className="dlg-campo">
                        <span>Votos B — {escolha.B || 'opção B'}</span>
                        <input type="number" inputMode="numeric" min="0" step="1" value={b} onChange={(e) => setB(e.target.value)} />
                    </label>
                </div>
                <label className="dlg-campo">
                    <span>Onde foi contado</span>
                    <select value={fonte} onChange={(e) => setFonte(e.target.value)}>
                        {FONTES.map((f) => <option key={f.id} value={f.id}>{f.rotulo}</option>)}
                    </select>
                </label>
                <p className="votacao-previa" aria-live="polite">{previa}</p>
                <p className="dlg-nota">Ao salvar: grava <code>episodios/ep{String(ep.n).padStart(2, '0')}/votacao.json</code> e a escolha entra na bíblia.</p>
                {erro && <p className="dlg-erro" role="alert">{erro}</p>}
            </form>
        </Dialogo>
    );
}

export default function Temporada({ serieId, dados, detalhes, recarregar, params, irPara }) {
    const { serie, biblia, elenco, locais } = dados;
    const eps = episodiosDaTemporada(serie, biblia, detalhes);
    const inicial = Number(params.get('ep')) || (eps.find((e) => e.criado) || eps[0] || {}).n;
    const [selecionado, setSelecionado] = useState(inicial);
    const [votando, setVotando] = useState(null);

    useEffect(() => {
        const n = Number(params.get('ep'));
        if (n) setSelecionado(n);
    }, [params]);

    const ep = eps.find((e) => e.n === selecionado) || eps[0];
    const roteiro = ep && ep.detalhe ? ep.detalhe.roteiro : null;

    // Uma imagem real por plano (local do plano; sem local, o primeiro do elenco com imagem).
    const quadros = roteiro && Array.isArray(roteiro.planos) ? roteiro.planos.map((p) => {
        const local = locais.find((l) => l.id === p.local);
        const pessoa = (p.elenco || []).map((id) => elenco.find((f) => f.id === id)).find((f) => f && imagemPrincipal(f));
        const ficha = local && imagemPrincipal(local) ? local : pessoa;
        return { n: p.n, deS: p.deS, ateS: p.ateS, local: local ? local.nome : p.local, caminho: ficha ? caminhoDaFicha(ficha, imagemPrincipal(ficha)) : null };
    }) : [];

    if (!eps.length) {
        return (
            <Vazio icone={Ico.temporada} titulo="A temporada ainda não tem mapa" texto="Gere a bíblia e o mapa dos episódios na Visão geral.">
                <button type="button" className="btn" onClick={() => irPara('visao')}><Ico.voltar className="ico-voltar" aria-hidden="true" />Ir para a Visão geral</button>
            </Vazio>
        );
    }

    return (
        <div className="temporada">
            <section className="secao" aria-labelledby="h-mapa">
                <div className="secao-cab">
                    <h2 id="h-mapa">Mapa da temporada</h2>
                    <p>{eps.length} episódios. Cada um termina numa escolha A/B; a mais votada decide o próximo.</p>
                </div>
                <div className="trilha-moldura" tabIndex={0} role="region" aria-label="Trilha da temporada (role para os lados)">
                    <ol className="trilha">
                        {eps.map((e, i) => {
                            const venc = e.escolha && e.escolha.vencedora;
                            return (
                                <Fragment key={e.n}>
                                    <li className="trilha-item">
                                        <button
                                            type="button"
                                            className={`no-ep${e.n === selecionado ? ' selecionado' : ''}${e.criado ? ' criado' : ''}`}
                                            aria-pressed={e.n === selecionado}
                                            onClick={() => setSelecionado(e.n)}
                                        >
                                            <span className="no-ep-n num">Ep. {String(e.n).padStart(2, '0')}</span>
                                            <span className="no-ep-titulo">{e.titulo}</span>
                                            <span className="no-ep-fase">{e.fase}</span>
                                            <span className={`estado ${classeEstado(e.status)}`}>{GlobalVar.nomeEtapa(e.status)}</span>
                                        </button>
                                    </li>
                                    {i < eps.length - 1 && (
                                        <li className="trilha-elo" aria-hidden={!e.escolha}>
                                            {e.escolha
                                                ? (
                                                    <button
                                                        type="button"
                                                        className={`losango${venc ? ' decidido' : ''}`}
                                                        onClick={() => { setSelecionado(e.n); setVotando(e); }}
                                                        title={venc ? textoVencedora(e.escolha) : `Escolha do Ep. ${e.n}: registrar votação real`}
                                                        aria-label={`Escolha do Ep. ${e.n} (A: ${e.escolha.A}; B: ${e.escolha.B}). ${venc ? textoVencedora(e.escolha) : 'Registrar votação real'}`}
                                                    >
                                                        <span>{venc && venc !== 'empate' ? venc : 'A/B'}</span>
                                                    </button>
                                                )
                                                : <span className="elo-linha" />}
                                        </li>
                                    )}
                                </Fragment>
                            );
                        })}
                        <li className="trilha-fim"><Ico.fim aria-hidden="true" />Fim da temporada</li>
                    </ol>
                </div>
                <p className="trilha-legenda"><Ico.escolha aria-hidden="true" />Losango: clique para registrar a contagem real dos comentários. Preenchido: votação já registrada.</p>
            </section>

            {ep && (
                <Trocar chave={`ep-${ep.n}`}>
                    <section className="secao ep-detalhe painel" aria-labelledby="h-ep">
                        <div className="painel-corpo">
                            <div className="ep-cab">
                                <div>
                                    <p className="ep-sobre">Ep. {String(ep.n).padStart(2, '0')}{ep.fase ? `, ${ep.fase.charAt(0).toLowerCase()}${ep.fase.slice(1)}` : ''}</p>
                                    <h2 id="h-ep" className="ep-titulo">{ep.titulo}</h2>
                                    <p className="ep-meta"><Ico.duracao aria-hidden="true" />{textoDuracao(ep.duracaoAlvoS)}{ep.semEscolha ? ', sem votação' : ''}</p>
                                </div>
                                <div className="acoes">
                                    <span className={`estado ${classeEstado(ep.status)}`}>{GlobalVar.nomeEtapa(ep.status)}</span>
                                    {ep.criado && (
                                        <button type="button" className="btn" onClick={() => irPara('episodios', { ep: ep.n })}>
                                            <Ico.roteiro aria-hidden="true" />Ver roteiro
                                        </button>
                                    )}
                                    {ep.criado && (
                                        <Link className="btn" to={`/serie/${serieId}/ep/${ep.n}`}>
                                            <Ico.decupagem aria-hidden="true" />Abrir na Mesa
                                        </Link>
                                    )}
                                </div>
                            </div>

                            {quadros.length > 0 && (
                                <ol className="ep-quadros" aria-label="Planos do roteiro">
                                    {quadros.map((q) => (
                                        <li key={q.n}>
                                            <div className="ep-quadro-img">
                                                {q.caminho ? <img className="foto" src={GlobalVar.urlMidia(serieId, q.caminho)} alt={`Plano ${q.n}: ${q.local || ''}`} loading="lazy" /> : <div className="sem-foto"><Ico.imagem aria-hidden="true" /></div>}
                                            </div>
                                            <span className="num ep-quadro-rot"><b>P{q.n}</b>{q.deS}–{q.ateS} s</span>
                                        </li>
                                    ))}
                                </ol>
                            )}

                            <div className="ep-texto">
                                {ep.resumo ? <p>{ep.resumo}</p> : <p className="suave">{ep.criado ? 'Sem resumo no roteiro.' : 'Ainda sem roteiro: o resumo aparece quando o roteiro for escrito.'}</p>}
                                {roteiro && roteiro.gancho && <p className="ep-gancho"><strong>Gancho:</strong> {roteiro.gancho}</p>}
                            </div>

                            {ep.escolha ? (
                                <div className="ep-escolha">
                                    {['A', 'B'].map((l) => {
                                        const det = roteiro && roteiro.escolhas && roteiro.escolhas[l];
                                        const venceu = ep.escolha.vencedora === l;
                                        return (
                                            <div key={l} className={`opcao${venceu ? ' venceu' : ''}`}>
                                                <span className="opcao-letra">{l}{venceu && <Ico.confirmar aria-hidden="true" />}</span>
                                                <div>
                                                    <strong>{ep.escolha[l] || '—'}</strong>
                                                    {det && det.detalhe && <p>{det.detalhe}</p>}
                                                    {ep.escolha.vencedora && <p className="num suave">{(ep.escolha.votos || {})[l] ?? 0} votos{venceu ? ', venceu' : ''}</p>}
                                                </div>
                                            </div>
                                        );
                                    })}
                                    <div className="ep-votacao">
                                        <span className={`estado ${ep.escolha.vencedora ? 'ok' : 'neutro'}`}>{ep.escolha.vencedora ? textoVencedora(ep.escolha) : 'Votação não registrada'}</span>
                                        <button type="button" className="btn" onClick={() => setVotando(ep)}>
                                            <Ico.escolha aria-hidden="true" />{ep.escolha.vencedora ? 'Corrigir contagem' : 'Registrar votação real'}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <p className="suave ep-sem-escolha">
                                    {ep.semEscolha ? 'Episódio sem votação: termina numa imagem ou frase forte.' : 'A escolha A/B deste episódio é definida quando o roteiro for escrito.'}
                                </p>
                            )}
                        </div>
                    </section>
                </Trocar>
            )}

            <VotacaoDialogo
                serieId={serieId}
                ep={votando}
                aberto={Boolean(votando)}
                onFechar={() => setVotando(null)}
                onSalvo={(r) => {
                    setVotando(null);
                    avisar(`Votação do Ep. ${r.votacao.ep} registrada: ${r.votacao.vencedora === 'empate' ? 'empate' : `${r.votacao.vencedora} venceu`} (${r.votacao.votos.A} × ${r.votacao.votos.B})`, 'ok', 4500);
                    recarregar();
                }}
            />
        </div>
    );
}
