import { useState } from 'react';
import { Link } from 'react-router-dom';
import GlobalVar from '../subComponents/GlobalVar';
import ConfirmarCusto from '../subComponents/ConfirmarCusto';
import { Ico } from '../subComponents/icones';
import { Contador, Expandir, Girador, MOV, Visto, avisar, motion } from '../subComponents/Movimento';
import { ExecutarEtapa, ProporMemoria, rotaIndisponivel } from '../funcionalidades/bancoGet';
import { erroDe } from '../funcionalidades/fetchFunc';
import { TETO_ETAPA_USD, episodiosDaTemporada, imagemPrincipal, indiceEtapa, proximosPassos, textoDuracao } from './serieUtil';
import '../../assets/css/VisaoGeral.css';

// Ícone de cada tipo de pendência (o mesmo desenho do resto do app).
const ICONE_PASSO = { roteiro: Ico.roteiro, aprovar: Ico.roteiro, rosto: Ico.rosto, folha: Ico.gerarImagem, local: Ico.local, objeto: Ico.objeto, voto: Ico.escolha };

export default function VisaoGeral({ serieId, dados, detalhes, irPara }) {
    const { serie, biblia, elenco, locais, objetos } = dados;
    const atual = indiceEtapa(serie.etapa);
    const passos = proximosPassos(dados, detalhes);
    const eps = episodiosDaTemporada(serie, biblia, detalhes);
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
            desc: `${textoDuracao(alvoRoteiro.duracaoAlvoS)} ${alvoRoteiro.semEscolha ? 'sem votação' : 'com escolha A/B'}, usando a memória da série.`,
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
    const [resultados, setResultados] = useState({});
    const [abertos, setAbertos] = useState({});

    async function executar(acao) {
        setOcupado(acao.id);
        setErroIA('');
        const r = acao.rota === 'memoria'
            ? await ProporMemoria({ serieId, ep: acao.ep })
            : await ExecutarEtapa({ etapa: acao.etapa, serieId, contexto: acao.contexto || {}, tetoUsd: TETO_ETAPA_USD });
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
        setResultados((x) => ({ ...x, [acao.id]: r }));
        setAbertos((x) => ({ ...x, [acao.id]: true }));
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
    const progresso = GlobalVar.ETAPAS.length > 1 ? Math.max(0, atual) / (GlobalVar.ETAPAS.length - 1) : 0;

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
                        <h2 id="h-etapas">Etapas da série</h2>
                        <p>Cada etapa só avança com a sua aprovação.</p>
                    </div>
                    <div className="etapas-moldura">
                        <div className="etapas-int">
                            <span className="etapas-trilho" aria-hidden="true">
                                {/* a linha enche até a etapa atual uma vez, ao abrir (CSS @keyframes em VisaoGeral.css) */}
                                <span className="etapas-trilho-cheio" style={{ transform: `scaleX(${progresso})` }} />
                            </span>
                            <ol className="etapas">
                                {GlobalVar.ETAPAS.map((e, i) => {
                                    const st = i < atual ? 'feita' : i === atual ? 'atual' : 'futura';
                                    return (
                                        <li key={e.id} className={`etapa ${st}`} aria-current={st === 'atual' ? 'step' : undefined} style={{ '--i': i }}>
                                            <span className="etapa-marca" aria-hidden="true">
                                                {st === 'feita' ? <Ico.confirmar /> : <span className="num">{i + 1}</span>}
                                            </span>
                                            <span className="etapa-nome">{e.nome}</span>
                                            <span className="etapa-st">{st === 'feita' ? 'Feita' : st === 'atual' ? 'Agora' : 'A fazer'}</span>
                                        </li>
                                    );
                                })}
                            </ol>
                        </div>
                    </div>
                </section>

                <section className="secao" aria-labelledby="h-passos">
                    <div className="secao-cab">
                        <h2 id="h-passos">Próximos passos</h2>
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
                                                <span className="suave">{Number.isFinite(res.custoUsd) ? `custou ${GlobalVar.usdFino(res.custoUsd)}` : ''}</span>
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
                                                <pre>{JSON.stringify(res.resultado !== undefined ? res.resultado : res, null, 2).slice(0, 6000)}</pre>
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
                        <div className="painel-cab"><h2 id="h-modelos"><Ico.config aria-hidden="true" />Modelos</h2></div>
                        <div className="painel-corpo">
                            <dl className="modelos">
                                {[['texto', 'Texto', Ico.texto], ['imagem', 'Imagem', Ico.imagem], ['videoRascunho', 'Vídeo rascunho', Ico.video], ['videoFinal', 'Vídeo final', Ico.video], ['apresentador', 'Apresentador', Ico.personagem]]
                                    .filter(([k]) => serie.modelos[k])
                                    .map(([k, rot, Icone]) => (
                                        <div key={k}>
                                            <dt><Icone aria-hidden="true" />{rot}</dt>
                                            <dd>{serie.modelos[k]}</dd>
                                        </div>
                                    ))}
                            </dl>
                        </div>
                    </section>
                )}

                {(biblia.premissa || serie.ideia) && (
                    <section className="painel lateral-bloco" aria-labelledby="h-premissa">
                        <div className="painel-cab">
                            <h2 id="h-premissa"><Ico.showrunner aria-hidden="true" />Premissa</h2>
                            <button type="button" className="btn mini fantasma" onClick={() => irPara('biblia')}><Ico.editar aria-hidden="true" />Editar</button>
                        </div>
                        <div className="painel-corpo"><p className="lateral-premissa">{biblia.premissa || serie.ideia}</p></div>
                    </section>
                )}
            </aside>

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
