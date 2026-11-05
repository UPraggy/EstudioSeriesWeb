import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import GlobalVar from './subComponents/GlobalVar';
import { saldoDisponivel } from './subComponents/ConfirmarCusto';
import { ListarCustos, ListarSeries, LerSerie, SaldoOpenRouter, rotaIndisponivel } from './funcionalidades/bancoGet';
import { erroDe } from './funcionalidades/fetchFunc';
import { capaDaSerie } from './sala/serieUtil';
import { Ico } from './subComponents/icones';
import { Contador, Esqueleto, Lista, Item, Vazio } from './subComponents/Movimento';
import '../assets/css/Telas.css';
import '../assets/css/Custos.css';

const SIMPLES = '__simples__';
const valorDa = (l) => (Number.isFinite(l.realUsd) ? l.realUsd : Number.isFinite(l.previstoUsd) ? l.previstoUsd : 0);
const ICONE_TIPO = { video: Ico.video, imagem: Ico.imagem, texto: Ico.texto, audio: Ico.voz, voz: Ico.voz, tts: Ico.voz };
const NOME_TIPO = { video: 'Vídeo', imagem: 'Imagem', texto: 'Texto', audio: 'Áudio', voz: 'Voz', tts: 'Voz' };

// Número grande (a notícia da tela). valor null = mostra o texto "alternativo".
function Numero({ icone: Icone, rotulo, valor, alternativo = '—', formatar = GlobalVar.usd, sub, destaque = false, tom = '' }) {
    return (
        <div className={`custos-numero${destaque ? ' destaque' : ''}${tom ? ` ${tom}` : ''}`}>
            <span className="custos-numero-rot"><Icone aria-hidden="true" />{rotulo}</span>
            {Number.isFinite(valor)
                ? <Contador valor={valor} formatar={formatar} className="custos-numero-valor" duracao={0.9} />
                : <span className="custos-numero-valor texto">{alternativo}</span>}
            {sub && <span className="custos-numero-sub">{sub}</span>}
        </div>
    );
}

function Resumo({ saldo, series }) {
    const carregandoSaldo = !saldo;
    const simulado = saldo && saldo.simulado;
    const erroSaldo = saldo && erroDe(saldo);
    const d = saldoDisponivel(saldo);
    const gastoSeries = series ? series.reduce((s, x) => s + (Number(x.gastoUsd) || 0), 0) : null;
    const qtd = series ? series.length : 0;

    let disponivel;
    if (carregandoSaldo) disponivel = <div className="custos-numero destaque"><Esqueleto altura={14} largura="40%" /><Esqueleto altura={44} largura="70%" /></div>;
    else if (simulado) disponivel = <Numero destaque tom="simulado" icone={Ico.simulado} rotulo="Disponível agora" valor={null} alternativo="Modo simulado" sub="O saldo não é consultado sem gastar." />;
    else if (erroSaldo) disponivel = <Numero destaque icone={Ico.saldo} rotulo="Disponível agora" valor={null} alternativo="Indisponível" sub={erroSaldo} />;
    else disponivel = <Numero destaque icone={Ico.saldo} rotulo="Disponível agora" valor={d} alternativo="Sem limite" sub="O menor entre o saldo da conta e o que resta no limite da chave." />;

    return (
        <section className="custos-numeros" aria-label="Resumo dos custos">
            {disponivel}
            {series === null
                ? <div className="custos-numero"><Esqueleto altura={14} largura="50%" /><Esqueleto altura={36} largura="60%" /></div>
                : <Numero icone={Ico.custo} rotulo="Gasto nas séries" valor={gastoSeries} sub={`Somando ${qtd} ${qtd === 1 ? 'série' : 'séries'}.`} />}
            {carregandoSaldo
                ? <div className="custos-numero"><Esqueleto altura={14} largura="50%" /><Esqueleto altura={36} largura="60%" /></div>
                : <Numero icone={Ico.data} rotulo="Uso no mês" valor={simulado || erroSaldo ? null : saldo.usoMesUsd} formatar={GlobalVar.usdFino} sub="Tudo que a chave gastou no mês." />}
        </section>
    );
}

function Chave({ saldo }) {
    if (!saldo) return <div className="custos-chave-esq"><Esqueleto linhas={2} /></div>;
    if (erroDe(saldo)) return <p className="nota-erro" role="alert"><Ico.erro aria-hidden="true" /><span>Não consegui ler o saldo: {erroDe(saldo)}</span></p>;
    if (saldo.simulado) {
        return (
            <p className="nota-aviso">
                <Ico.simulado aria-hidden="true" />
                <span>
                    <strong>Modo simulado.</strong> O servidor está rodando sem gastar: nenhuma chamada paga é feita e o saldo da chave não é consultado.
                    {saldo.chaveConfigurada ? ' A chave existe no ambiente; desligue o simulado para ver o saldo.' : ' Nenhuma chave configurada no ambiente.'}
                </span>
            </p>
        );
    }
    const blocos = [
        { rot: 'Limite da chave', valor: saldo.limiteUsd, texto: 'sem limite', sub: saldo.renovacaoLimite ? `renova: ${saldo.renovacaoLimite}` : null },
        { rot: 'Uso hoje', valor: saldo.usoHojeUsd, fino: true },
        { rot: 'Uso na semana', valor: saldo.usoSemanaUsd, fino: true },
    ];
    if (saldo.conta) blocos.unshift({ rot: 'Saldo da conta', valor: saldo.conta.saldoUsd, sub: `${GlobalVar.usd(saldo.conta.creditosUsd)} em créditos` });
    // limite usado: barra simples (o que já saiu do limite da chave)
    const usoLimite = Number.isFinite(saldo.limiteUsd) && saldo.limiteUsd > 0 && Number.isFinite(saldo.limiteRestanteUsd)
        ? Math.max(0, Math.min(100, ((saldo.limiteUsd - saldo.limiteRestanteUsd) / saldo.limiteUsd) * 100)) : null;
    return (
        <>
            <dl className="custos-chave">
                {blocos.map((b) => (
                    <div key={b.rot}>
                        <dt>{b.rot}</dt>
                        <dd>
                            {Number.isFinite(b.valor)
                                ? <Contador valor={b.valor} formatar={b.fino ? GlobalVar.usdFino : GlobalVar.usd} />
                                : <span className="suave">{b.texto || '—'}</span>}
                        </dd>
                        {b.sub && <dd className="custos-sub">{b.sub}</dd>}
                    </div>
                ))}
            </dl>
            {usoLimite !== null && (
                <div className="custos-limite">
                    <div className={`custos-barra${usoLimite >= 80 ? ' alta' : ''}`} aria-hidden="true">
                        <span style={{ width: `${usoLimite}%` }} />
                    </div>
                    <span className="custos-limite-txt">
                        <span className="num">{usoLimite.toFixed(0)}%</span> do limite da chave já foi usado ({GlobalVar.usdFino(saldo.limiteUsd - saldo.limiteRestanteUsd)} de {GlobalVar.usd(saldo.limiteUsd)}).
                    </span>
                </div>
            )}
            {(saldo.avisos || []).map((a) => <p key={a} className="custos-nota"><Ico.info aria-hidden="true" />{a}</p>)}
        </>
    );
}

function BarraUso({ uso, gasto }) {
    const alta = uso >= 80;
    return (
        <div className="custos-uso">
            <div className={`custos-barra${alta ? ' alta' : ''}`} aria-hidden="true">
                <span style={{ width: `${Math.max(uso, gasto > 0 ? 1 : 0)}%` }} />
            </div>
            <span className={`num${alta ? ' custos-alto' : ''}`}>{alta && <Ico.aviso aria-hidden="true" />}{uso.toFixed(0)}%</span>
        </div>
    );
}

export default function Custos({ ativaResp }) {
    const [params, setParams] = useSearchParams();
    const [saldo, setSaldo] = useState(null);
    const [series, setSeries] = useState(null);
    const [lanc, setLanc] = useState(null);
    const [lancErro, setLancErro] = useState('');
    const [lancIndisponivel, setLancIndisponivel] = useState(false);
    const [etapa, setEtapa] = useState('');

    const origem = params.get('serie') || (series && series[0] ? series[0].id : SIMPLES);

    useEffect(() => {
        SaldoOpenRouter().then(setSaldo);
        ListarSeries().then(async (r) => {
            if (erroDe(r)) { setSeries([]); return; }
            const lista = await Promise.all((r.series || []).map(async (s) => {
                const d = await LerSerie({ id: s.id });
                return erroDe(d) ? { ...s, erro: erroDe(d) } : { ...s, orcamento: d.serie.orcamento || {}, gastoUsd: d.custos ? d.custos.gastoUsd : 0, capa: capaDaSerie(d) };
            }));
            setSeries(lista);
        });
    }, []);

    // Depois de uma geração paga em outra tela (ou nesta), o saldo se atualiza e o número corre.
    useEffect(() => {
        const recarregar = () => SaldoOpenRouter().then(setSaldo);
        window.addEventListener('estudio:gasto', recarregar);
        return () => window.removeEventListener('estudio:gasto', recarregar);
    }, []);

    useEffect(() => {
        if (series === null) return;
        setLanc(null);
        setLancErro('');
        setEtapa('');
        ListarCustos(origem === SIMPLES ? {} : { serie: origem }).then((r) => {
            if (rotaIndisponivel(r)) { setLancIndisponivel(true); setLanc([]); return; }
            if (erroDe(r)) { setLancErro(erroDe(r)); setLanc([]); return; }
            setLanc(r);
        });
    }, [origem, series]);

    const linhas = lanc && lanc.linhas ? lanc.linhas : [];
    const etapas = [...new Set(linhas.map((l) => l.etapa || 'sem etapa'))];
    const filtradas = etapa ? linhas.filter((l) => (l.etapa || 'sem etapa') === etapa) : linhas;
    const totalFiltrado = filtradas.reduce((s, l) => s + valorDa(l), 0);

    return (
        <main className={`tela custos${ativaResp ? ' resp' : ''}`}>
            <div className="tela-cab custos-cab">
                <div>
                    <h1>Custos</h1>
                    <p>Saldo da chave, tetos de cada série e cada chamada paga registrada em <code>custos.jsonl</code>. Nenhuma geração passa do teto sem você mudar o teto.</p>
                </div>
            </div>

            <Resumo saldo={saldo} series={series} />

            <section className="secao" aria-labelledby="h-chave">
                <div className="secao-cab"><h2 id="h-chave"><Ico.saldo aria-hidden="true" />Chave do OpenRouter</h2><p><Ico.bloqueado aria-hidden="true" />Só números: a chave nunca sai do servidor.</p></div>
                <Chave saldo={saldo} />
            </section>

            <section className="secao" aria-labelledby="h-tetos">
                <div className="secao-cab"><h2 id="h-tetos"><Ico.series aria-hidden="true" />Tetos por série</h2><p>Definidos em <code>serie.json → orcamento</code>. O servidor recusa qualquer pedido acima deles.</p></div>
                {series === null && <div className="custos-esq-tabela"><Esqueleto altura={40} /><Esqueleto altura={56} /><Esqueleto altura={56} /></div>}
                {series && series.length === 0 && (
                    <div className="custos-vazio"><Vazio icone={Ico.series} titulo="Nenhuma série ainda" texto="Os tetos aparecem aqui quando você criar a primeira série."><Link to="/" className="btn"><Ico.novo aria-hidden="true" />Ir para Séries</Link></Vazio></div>
                )}
                {series && series.length > 0 && (
                    <div className="tabela-wrap empilha">
                        <table className="tabela custos-tabela">
                            <thead>
                                <tr>
                                    <th scope="col">Série</th>
                                    <th scope="col" className="num">Gasto</th>
                                    <th scope="col">Uso do teto da série</th>
                                    <th scope="col" className="num">Teto da série</th>
                                    <th scope="col" className="num">Por episódio</th>
                                    <th scope="col" className="num">Por plano</th>
                                </tr>
                            </thead>
                            <Lista as="tbody">
                                {series.map((s) => {
                                    const o = s.orcamento || {};
                                    const uso = o.tetoSerieUsd ? Math.min(100, ((s.gastoUsd || 0) / o.tetoSerieUsd) * 100) : 0;
                                    return (
                                        <Item as="tr" key={s.id}>
                                            <td data-rotulo="Série">
                                                <Link to={`/serie/${s.id}`} className="custos-serie">
                                                    <span className="custos-serie-capa" aria-hidden="true">
                                                        {s.capa ? <img src={GlobalVar.urlMidia(s.id, s.capa)} alt="" loading="lazy" /> : <Ico.series />}
                                                    </span>
                                                    <span>{s.titulo}</span>
                                                </Link>
                                                {s.erro && <span className="custos-erro-serie"><Ico.erro aria-hidden="true" />{s.erro}</span>}
                                            </td>
                                            <td data-rotulo="Gasto" className="num custos-gasto"><Contador valor={s.gastoUsd || 0} formatar={GlobalVar.usd} /></td>
                                            <td data-rotulo="Uso"><BarraUso uso={uso} gasto={s.gastoUsd || 0} /></td>
                                            <td data-rotulo="Teto da série" className="num">{GlobalVar.usd(o.tetoSerieUsd)}</td>
                                            <td data-rotulo="Por episódio" className="num">{GlobalVar.usd(o.tetoEpisodioUsd)}</td>
                                            <td data-rotulo="Por plano" className="num">{GlobalVar.usd(o.tetoPlanoUsd)}</td>
                                        </Item>
                                    );
                                })}
                            </Lista>
                        </table>
                    </div>
                )}
            </section>

            <section className="secao" aria-labelledby="h-lanc">
                <div className="secao-cab">
                    <h2 id="h-lanc"><Ico.custos aria-hidden="true" />Lançamentos</h2>
                    <div className="custos-filtros">
                        <Ico.filtro className="custos-filtros-ico" aria-hidden="true" />
                        <label className="campo">
                            <span className="sr">Origem</span>
                            <select className="entrada" aria-label="Origem" value={origem} onChange={(e) => setParams(e.target.value === SIMPLES ? { serie: SIMPLES } : { serie: e.target.value })}>
                                {(series || []).map((s) => <option key={s.id} value={s.id}>{s.titulo}</option>)}
                                <option value={SIMPLES}>Geração simples</option>
                            </select>
                        </label>
                        <label className="campo">
                            <span className="sr">Etapa</span>
                            <select className="entrada" aria-label="Etapa" value={etapa} onChange={(e) => setEtapa(e.target.value)} disabled={!etapas.length}>
                                <option value="">Todas as etapas</option>
                                {etapas.map((x) => <option key={x} value={x}>{x}</option>)}
                            </select>
                        </label>
                    </div>
                </div>

                {lancIndisponivel && <p className="nota-aviso"><Ico.aviso aria-hidden="true" /><span>Os lançamentos estão indisponíveis: a rota ListarCustos ainda não foi registrada no servidor.</span></p>}
                {lancErro && <p className="nota-erro" role="alert"><Ico.erro aria-hidden="true" /><span>{lancErro}</span></p>}
                {lanc === null && <div className="custos-esq-tabela"><Esqueleto altura={48} largura="50%" /><Esqueleto altura={40} /><Esqueleto altura={40} /><Esqueleto altura={40} /></div>}

                {lanc && !lancIndisponivel && !lancErro && (
                    <>
                        <dl className="custos-resumo">
                            <div><dt>Total registrado</dt><dd><Contador valor={lanc.totalUsd || 0} formatar={GlobalVar.usdFino} /></dd></div>
                            <div><dt>Lançamentos</dt><dd><Contador valor={lanc.quantidade || 0} /></dd></div>
                            {Object.entries(lanc.porEp || {}).map(([ep, v]) => <div key={ep}><dt>Ep. {ep}</dt><dd><Contador valor={v} formatar={GlobalVar.usdFino} /></dd></div>)}
                            {etapa && <div className="filtrado"><dt>Filtrado</dt><dd><Contador valor={totalFiltrado} formatar={GlobalVar.usdFino} /></dd></div>}
                        </dl>
                        {filtradas.length === 0 ? (
                            <div className="custos-vazio">
                                <Vazio
                                    icone={Ico.custos}
                                    titulo={`Nenhuma chamada paga ${origem === SIMPLES ? 'na geração simples' : 'nesta série'} ainda`}
                                    texto="Quando você confirmar uma geração, ela aparece aqui com o valor previsto e o real."
                                />
                            </div>
                        ) : (
                            <div className="tabela-wrap empilha">
                                <table className="tabela custos-tabela">
                                    <thead>
                                        <tr>
                                            <th scope="col">Quando</th>
                                            <th scope="col">Ep.</th>
                                            <th scope="col">Etapa</th>
                                            <th scope="col">Tipo</th>
                                            <th scope="col">Modelo</th>
                                            <th scope="col">Referência</th>
                                            <th scope="col" className="num">Previsto</th>
                                            <th scope="col" className="num">Real</th>
                                        </tr>
                                    </thead>
                                    <Lista as="tbody" key={`${origem}-${etapa}`}>
                                        {filtradas.map((l, i) => {
                                            const IconeTipo = ICONE_TIPO[l.tipo] || Ico.custo;
                                            return (
                                                <Item as="tr" key={`${l.em}-${i}`}>
                                                    <td data-rotulo="Quando" className="num custos-quando">{GlobalVar.dataHoraBR(l.em)}</td>
                                                    <td data-rotulo="Ep." className="num custos-ep">{l.ep ?? '—'}</td>
                                                    <td data-rotulo="Etapa">{l.etapa || '—'}</td>
                                                    <td data-rotulo="Tipo"><span className="custos-tipo"><IconeTipo aria-hidden="true" />{NOME_TIPO[l.tipo] || l.tipo || '—'}</span></td>
                                                    <td data-rotulo="Modelo" className="custos-mono">{l.modelo || '—'}</td>
                                                    <td data-rotulo="Referência" className="custos-mono">{l.ref || l.jobId || '—'}</td>
                                                    <td data-rotulo="Previsto" className="num">{Number.isFinite(l.previstoUsd) ? GlobalVar.usdFino(l.previstoUsd) : '—'}</td>
                                                    <td data-rotulo="Real" className="num custos-real">{Number.isFinite(l.realUsd) ? GlobalVar.usdFino(l.realUsd) : <span className="suave custos-a-confirmar"><Ico.relogio aria-hidden="true" />a confirmar</span>}</td>
                                                </Item>
                                            );
                                        })}
                                    </Lista>
                                </table>
                            </div>
                        )}
                    </>
                )}
            </section>
        </main>
    );
}
