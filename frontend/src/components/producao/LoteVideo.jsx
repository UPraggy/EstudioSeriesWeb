// "GERAR VÍDEO DOS N PLANOS": escolhe os planos (padrão: os que ainda não têm vídeo), cota de graça (um pedido por
// plano, somados), confirma UMA vez na confirmação de custo de sempre e o servidor gera e acompanha cada plano.
// Também dá para gerar um plano só e anexar um vídeo gerado fora (vira o take do plano, sem custo).
import { useEffect, useMemo, useState } from 'react';
import Dialogo from '../subComponents/Dialogo';
import ConfirmarCusto from '../subComponents/ConfirmarCusto';
import { BotaoAnexar, copiar } from '../subComponents/PedidoExterno';
import { Ico } from '../subComponents/icones';
import { Girador, avisar } from '../subComponents/Movimento';
import { AnexarVideoTrecho, CotarVideoPlanos, GerarVideoPlanos, rotaIndisponivel } from '../funcionalidades/bancoGet';
import { erroDe } from '../funcionalidades/fetchFunc';
import { useCatalogo } from '../mesa/mesaMidia';
import { textoDuracao } from '../sala/serieUtil';
import '../../assets/css/LoteVideo.css';

const TIPO = { video_ia: 'Vídeo IA', apresentador: 'Apresentador', grafico: 'Gráfico', reaproveitar: 'Reaproveitar' };

function estadoPlano(p) {
    if (p.gerando) return { classe: 'andamento', texto: 'Gerando', Icone: Ico.carregando };
    if (p.falhou) return { classe: 'perigo', texto: 'Falhou', Icone: Ico.erro };
    if (p.fonte === 'take') return { classe: 'ok', texto: 'Com vídeo', Icone: Ico.ok };
    if (p.fonte === 'acervo') return { classe: p.pronto ? 'ok' : 'neutro', texto: 'Clipe do acervo', Icone: p.pronto ? Ico.ok : Ico.info };
    return { classe: 'falta', texto: 'Sem vídeo', Icone: Ico.pendente };
}

const nomeCurto = (id) => String(id || '').split('/').pop();

/**
 * props: aberto, serieId, ep, prod (EstadoProducao), onFechar, onIniciado(resposta), onMudou()
 */
export default function LoteVideo({ aberto, serieId, ep, prod, onFechar, onIniciado, onMudou }) {
    const planos = useMemo(() => (prod && prod.videos && prod.videos.planos) || [], [prod]);
    const [marcados, setMarcados] = useState([]);
    const [modelo, setModelo] = useState('');
    const [cotando, setCotando] = useState(null); // 'lote' | n
    const [cotacao, setCotacao] = useState(null);
    const [gerando, setGerando] = useState(false);
    const [erro, setErro] = useState('');
    const [anexando, setAnexando] = useState(null);
    const cat = useCatalogo();
    const modelos = cat ? cat.modelos.filter((m) => (m.proporcoes || []).includes('9:16')) : [];
    const daSerie = prod && prod.modelos ? prod.modelos.videoFinal : null;

    useEffect(() => {
        if (!aberto) return;
        setMarcados(planos.filter((p) => !p.pronto && !p.gerando).map((p) => p.n));
        setErro('');
        setCotacao(null);
    }, [aberto]); // eslint-disable-line react-hooks/exhaustive-deps

    const alternar = (n) => setMarcados((m) => (m.includes(n) ? m.filter((x) => x !== n) : [...m, n].sort((a, b) => a - b)));

    async function cotar(lista, qual) {
        setErro('');
        setCotando(qual);
        const r = await CotarVideoPlanos({ serie: serieId, ep, planos: lista, modelo: modelo || undefined });
        setCotando(null);
        if (rotaIndisponivel(r)) { setErro('Reinicie o Estúdio para gerar os vídeos em lote (rota nova). Enquanto isso, regere por trecho na Mesa.'); return; }
        if (erroDe(r)) { setErro(erroDe(r)); return; }
        setCotacao(r);
    }

    async function gerar() {
        if (!cotacao) return;
        setGerando(true);
        setErro('');
        const r = await GerarVideoPlanos({ serie: serieId, ep, confirmacoes: cotacao.cotacoes.map((c) => ({ id: c.id, token: c.token })) });
        setGerando(false);
        if (erroDe(r)) { setErro(erroDe(r)); return; }
        const n = (r.regeracoes || []).length;
        avisar(cotacao.simulado ? `Modo simulado: ${n} ${n === 1 ? 'plano enviado' : 'planos enviados'} sem custo.` : `${n} ${n === 1 ? 'plano enviado' : 'planos enviados'}. Cada vídeo entra sozinho na edição quando ficar pronto.`, 'ok', 6000);
        window.dispatchEvent(new Event('estudio:gasto'));
        setCotacao(null);
        onIniciado(r);
    }

    async function anexar(p, arquivo) {
        setAnexando(p.n);
        const r = await AnexarVideoTrecho({ serie: serieId, ep, plano: p.n, instrucao: 'Vídeo do plano gerado fora', arquivo });
        setAnexando(null);
        if (erroDe(r)) { avisar(`Não anexou: ${erroDe(r)}`, 'erro', 6000); return; }
        avisar(`Vídeo anexado ao plano ${p.n} (sem custo).`, 'ok');
        (r.avisos || []).forEach((a) => avisar(a, 'aviso', 6000));
        onMudou();
    }

    const itens = cotacao ? cotacao.cotacoes.map((c) => ({
        descricao: `Plano ${c.plano} · ${textoDuracao(c.duracaoS)} → pede ${c.duracaoPedidaS} s${c.ajuste === 'aparar' ? ' e apara' : c.ajuste === 'segurar' ? ' e segura o fim' : ''} · ${c.nomeModelo || c.modelo}`,
        usd: c.custoPrevistoUsd, estimativa: c.estimativa,
    })) : [];
    const avisos = cotacao ? [
        ...(cotacao.avisos || []),
        ...cotacao.cotacoes.flatMap((c) => (c.avisos || []).filter((a) => !/apara|aparado/.test(a)).map((a) => `Plano ${c.plano}: ${a}`)),
        ...(cotacao.teto && cotacao.teto.passa ? [cotacao.teto.passa] : []),
    ] : [];
    const tetoEp = prod && prod.orcamento ? prod.orcamento.tetoEpisodioUsd : undefined;
    const gastoEp = cotacao && cotacao.teto && Number.isFinite(cotacao.teto.gastoEpisodioUsd) ? cotacao.teto.gastoEpisodioUsd : 0;
    const qtd = marcados.length;

    return (
        <>
            <Dialogo
                id="lote-video"
                aberto={Boolean(aberto) && !cotacao}
                titulo={`Vídeo dos planos do Ep. ${ep}`}
                descricao="Cada plano vira um vídeo do tamanho dele (o modelo gera a menor duração aceita que cobre o plano e o Estúdio apara). Cotar não gasta nada."
                icone={Ico.video}
                largura={760}
                onFechar={onFechar}
                rodape={(
                    <>
                        <button type="button" className="btn" onClick={onFechar}>Fechar</button>
                        <button type="button" className="btn primario" onClick={() => cotar(marcados, 'lote')} disabled={!qtd || Boolean(cotando)} aria-busy={cotando === 'lote'}>
                            {cotando === 'lote' ? <Girador /> : <Ico.custo aria-hidden="true" />}
                            {qtd ? `Cotar ${qtd === 1 ? '1 plano' : `os ${qtd} planos`}` : 'Escolha os planos'}
                        </button>
                    </>
                )}
            >
                <div className="lv-topo">
                    <label className="lv-modelo">
                        <span>Modelo</span>
                        <select value={modelo} onChange={(e) => setModelo(e.target.value)}>
                            <option value="">Da série{daSerie ? ` (${nomeCurto(daSerie)})` : ''}</option>
                            {modelos.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
                        </select>
                    </label>
                    <span className="suave lv-dica"><Ico.info aria-hidden="true" />Plano com quadro-chave começa nessa imagem (se o modelo aceitar).</span>
                </div>
                <ul className="lv-lista">
                    {planos.map((p) => {
                        const st = estadoPlano(p);
                        const marcado = marcados.includes(p.n);
                        return (
                            <li key={p.n} className={`lv-plano${marcado ? ' marcado' : ''}`}>
                                <label className="lv-check">
                                    <input type="checkbox" checked={marcado} onChange={() => alternar(p.n)} disabled={Boolean(p.gerando)} />
                                    <span className="lv-n num">P{p.n}</span>
                                </label>
                                <div className="lv-info">
                                    <div className="lv-linha">
                                        <span className="num">{textoDuracao(p.duracaoS)}</span>
                                        <span className="suave">{TIPO[p.tipo] || p.tipo}</span>
                                        <span className={`lv-estado ${st.classe}`}><st.Icone aria-hidden="true" className={p.gerando ? 'girador' : ''} />{st.texto}</span>
                                        {p.quadroChave && <span className="lv-quadro"><Ico.quadroChave aria-hidden="true" />Quadro-chave</span>}
                                    </div>
                                    {p.prompt && (
                                        <details className="lv-prompt">
                                            <summary><span>{p.prompt}</span></summary>
                                            <pre>{p.prompt}</pre>
                                            <button type="button" className="btn mini fantasma" onClick={() => copiar(p.prompt, 'Prompt copiado')}><Ico.copiar aria-hidden="true" />Copiar prompt</button>
                                        </details>
                                    )}
                                </div>
                                <div className="lv-acoes">
                                    <button type="button" className="btn mini" onClick={() => cotar([p.n], p.n)} disabled={Boolean(cotando) || Boolean(p.gerando)} aria-busy={cotando === p.n} title="Cotar e gerar só este plano">
                                        {cotando === p.n ? <Girador /> : <Ico.video aria-hidden="true" />}{p.fonte === 'take' ? 'Gerar de novo' : 'Só este'}
                                    </button>
                                    <BotaoAnexar tipo="video" classe="btn mini fantasma" rotulo="Anexar de fora" ocupado={anexando === p.n} disabled={Boolean(anexando) || Boolean(p.gerando)} onArquivo={(a) => anexar(p, a)}
                                        titulo="Gerou este plano em outra plataforma? O vídeo vira o take do plano, aparado ao tamanho dele (sem custo)" />
                                </div>
                            </li>
                        );
                    })}
                </ul>
                {erro && <p className="dlg-erro" role="alert"><Ico.erro aria-hidden="true" /><span>{erro}</span></p>}
            </Dialogo>

            <ConfirmarCusto
                aberto={Boolean(aberto) && Boolean(cotacao)}
                titulo={cotacao && cotacao.cotacoes.length === 1 ? `Gerar o vídeo do plano ${cotacao.cotacoes[0].plano}` : `Gerar o vídeo de ${cotacao ? cotacao.cotacoes.length : 0} planos`}
                descricao="Um pedido de vídeo por plano, todos confirmados de uma vez. Cada job fica registrado antes de ser pago; o vídeo entra sozinho na edição (o anterior continua na lista de takes)."
                itens={itens}
                totalUsd={cotacao ? cotacao.totalUsd : 0}
                teto={{ rotulo: 'Teto do episódio', tetoUsd: tetoEp, gastoUsd: gastoEp }}
                avisos={avisos}
                simulado={Boolean(cotacao && cotacao.simulado)}
                verbo="Gerar"
                ocupado={gerando}
                progresso={gerando ? 'Enviando os pedidos…' : ''}
                erro={erro}
                onCancelar={() => { setCotacao(null); setErro(''); }}
                onConfirmar={gerar}
            />
        </>
    );
}
