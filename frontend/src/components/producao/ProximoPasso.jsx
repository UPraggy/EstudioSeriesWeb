// PRÓXIMO PASSO do episódio (pedido do Rafael, 06/11/2026: "não ficou claro onde gero o vídeo"): as etapas reais,
// em ordem (roteiro → falas → decupagem → quadros-chave → vídeos → montado → votação), cada uma com o estado
// (feito / falta / em andamento…) com ícone + texto, o motivo em uma linha e o botão certo. Só UMA ação em destaque.
// O cálculo é o de sala/producaoUtil.js (o mesmo da Visão geral). Usado na página do episódio e no topo da Mesa.
import { useEffect, useState } from 'react';
import { CotarQuadrosChave, EdicaoInicial, GerarQuadrosChave, RegerarFalasVoz } from '../funcionalidades/bancoGet';
import ConfirmarCusto from '../subComponents/ConfirmarCusto';
import { erroDe } from '../funcionalidades/fetchFunc';
import { Ico } from '../subComponents/icones';
import { Expandir, Girador, avisar } from '../subComponents/Movimento';
import { TEXTO_ESTADO, etapasProducao, proximaEtapa } from '../sala/producaoUtil';
import { textoDuracao } from '../sala/serieUtil';
import AvisoVozes from './AvisoVozes';
import Decupar from './Decupar';
import LoteVideo from './LoteVideo';
import '../../assets/css/ProximoPasso.css';

const ICONE_ETAPA = { roteiro: Ico.roteiro, falas: Ico.voz, decupagem: Ico.decupagem, quadros: Ico.quadroChave, videos: Ico.video, montado: Ico.montar, votacao: Ico.escolha };
const ICONE_ESTADO = { feito: Ico.ok, falta: Ico.pendente, aviso: Ico.aviso, andamento: Ico.carregando, perigo: Ico.erro, bloqueado: Ico.bloqueado, opcional: Ico.info };

// Rótulo do botão de cada ação (o mesmo verbo do começo ao fim do fluxo).
function rotuloAcao(et, prod) {
    const v = (prod && prod.videos) || {};
    const faltam = Math.max(0, (v.total || 0) - (v.prontos || 0));
    switch (et.acao) {
        case 'escreverRoteiro': return 'Escrever o roteiro';
        case 'aprovarRoteiro': return 'Revisar e aprovar';
        case 'ajustarDuracao': return `Ajustar o roteiro para ${textoDuracao(prod.duracaoAlvoS)}`;
        case 'gerarFalas': return 'Gerar as falas (grátis)';
        case 'regerarFalas': return et.estado === 'feito' ? 'Regerar todas as falas' : 'Regerar com a voz nova';
        case 'decupar': return et.estado === 'feito' ? 'Decupar de novo' : 'Decupar os planos';
        case 'quadros': return prod && prod.quadros && prod.quadros.com ? `Gerar os ${Math.max(0, (prod.quadros.total || 0) - prod.quadros.com)} que faltam` : 'Gerar quadros-chave';
        case 'gerarVideos':
            if (et.estado === 'andamento') return 'Ver os planos';
            return et.estado === 'feito' ? 'Gerar de novo' : `Gerar vídeo ${faltam === 1 ? 'de 1 plano' : `dos ${faltam} planos`}`;
        case 'montar': return et.estado === 'feito' ? 'Montar de novo' : 'Montar episódio';
        case 'votar': return 'Registrar votação';
        default: return '';
    }
}

/**
 * props: serieId, ep, prod (EstadoProducao), contexto ('sala' | 'mesa'), modeloTexto, tetoSerie { tetoUsd, gastoUsd },
 *        mostrarVozes (o aviso de voz nova; a página do episódio mostra perto do selo "Falas"),
 *        onRecarregar() → Promise (relê o estado; na Mesa, também a edição), onAcao(acao) para o que mora fora
 *        (escreverRoteiro, aprovarRoteiro, ajustarDuracao, quadros, montar, votar)
 */
export default function ProximoPasso({ serieId, ep, prod, contexto = 'sala', mostrarVozes = true, modeloTexto, tetoSerie, onRecarregar, onAcao }) {
    const [decupar, setDecupar] = useState(null);
    const [lote, setLote] = useState(false);
    const [ocupado, setOcupado] = useState(null);
    const [aberto, setAberto] = useState(contexto !== 'mesa');
    const [quadros, setQuadros] = useState(null); // cotação do lote de quadros-chave
    const [gerandoQ, setGerandoQ] = useState(false);
    const [erroQ, setErroQ] = useState('');
    const etapas = etapasProducao(prod);
    const proxima = proximaEtapa(etapas);
    const vivo = Boolean(prod && ((prod.videos && prod.videos.gerando) || (prod.render && prod.render.status === 'montando')));

    // vídeos gerando ou montagem rodando: relê sozinho até terminar
    useEffect(() => {
        if (!vivo || !onRecarregar) return undefined;
        const id = setInterval(() => { onRecarregar(); }, 4000);
        return () => clearInterval(id);
    }, [vivo, onRecarregar]);

    if (!prod) return <div className={`pp pp-${contexto}`} aria-busy="true"><span className="esqueleto pp-esq" /></div>;
    if (prod.erro) return <p className="nota-erro"><Ico.erro aria-hidden="true" />Não li o estado do episódio: {prod.erro}</p>;

    async function falas(acao) {
        const temEdicao = prod.edicao && prod.edicao.existe;
        setOcupado(acao);
        let r;
        if (!temEdicao) {
            r = await EdicaoInicial({ serie: serieId, ep, gerarFalas: true });
        } else if (prod.falas && prod.falas.estimadas) {
            if (!window.confirm('Gerar o áudio das falas e montar a edição de novo a partir do roteiro? A edição atual fica no histórico (dá para desfazer na Mesa).')) { setOcupado(null); return; }
            r = await EdicaoInicial({ serie: serieId, ep, gerarFalas: true, forcar: true });
        } else {
            r = await RegerarFalasVoz({ serie: serieId, ep });
        }
        setOcupado(null);
        if (erroDe(r)) { avisar(`Falas: ${erroDe(r)}`, 'erro', 7000); return; }
        avisar(!temEdicao ? 'Falas geradas e edição montada.' : `${(r.regeradas || []).length || 'As'} falas com a voz atual. A edição foi atualizada (Ctrl+Z desfaz na Mesa).`, 'ok', 5000);
        (r.avisos || []).slice(0, 3).forEach((a) => avisar(a, 'aviso', 6000));
        await onRecarregar();
    }

    // Quadros-chave: cota uma imagem por plano (rosto canônico + local) e abre UMA confirmação com o total.
    async function cotarQuadros() {
        setOcupado('quadros');
        setErroQ('');
        const r = await CotarQuadrosChave({ serie: serieId, ep });
        setOcupado(null);
        if (erroDe(r)) { avisar(`Quadros-chave: ${erroDe(r)}`, 'erro', 7000); return; }
        setQuadros(r);
    }
    async function gerarQuadros() {
        if (!quadros) return;
        setGerandoQ(true);
        setErroQ('');
        const r = await GerarQuadrosChave({ serie: serieId, ep, confirmacoes: quadros.cotacoes.map((c) => ({ plano: c.plano, pedido: c.pedido, token: c.token })) });
        setGerandoQ(false);
        window.dispatchEvent(new Event('estudio:gasto'));
        if (erroDe(r)) { setErroQ(erroDe(r)); return; }
        if (r.erro) { setErroQ(`${r.feitos.length} de ${r.total} gerados. ${r.erro}`); await onRecarregar(); return; }
        setQuadros(null);
        avisar(`${r.feitos.length} quadros-chave gerados: os vídeos vão começar neles.`, 'ok', 5000);
        await onRecarregar();
    }

    function agir(et) {
        if (!et || !et.acao) return;
        if (et.acao === 'decupar') { setDecupar('confirmar'); return; }
        if (et.acao === 'gerarVideos') { setLote(true); return; }
        if (et.acao === 'quadros') { cotarQuadros(); return; }
        if (et.acao === 'gerarFalas' || et.acao === 'regerarFalas') { falas(et.acao); return; }
        if (onAcao) onAcao(et.acao, et);
    }

    const botao = (et, primario) => {
        if (!et.acao || et.estado === 'bloqueado') return null;
        const rot = rotuloAcao(et, prod);
        if (!rot) return null;
        const girando = ocupado === et.acao;
        return (
            <button type="button" className={`btn ${primario ? 'primario' : 'mini'}${!primario && et.estado === 'feito' ? ' fantasma' : ''}`} onClick={() => agir(et)} disabled={Boolean(ocupado)} aria-busy={girando}>
                {girando ? <Girador /> : primario ? <Ico.avancar className="ico-avancar" aria-hidden="true" /> : null}
                {rot}
            </button>
        );
    };

    const vozes = (prod.falas && prod.falas.vozesMudaram) || [];
    const errosVoz = (prod.falas && prod.falas.errosVoz) || [];
    const ProxIco = proxima ? ICONE_ETAPA[proxima.id] : Ico.ok;

    return (
        <section className={`pp pp-${contexto}`} aria-labelledby={`pp-titulo-${ep}`}>
            <div className="pp-destaque">
                <span className={`pp-destaque-ico ${proxima ? proxima.estado : 'feito'}`} aria-hidden="true"><ProxIco /></span>
                <div className="pp-destaque-txt">
                    <h3 id={`pp-titulo-${ep}`}>
                        {proxima ? <>Próximo passo: <span className="num">{proxima.n}.</span> {proxima.nome}</> : 'Episódio pronto'}
                    </h3>
                    <p>{proxima ? proxima.motivo : 'Todas as etapas feitas.'}</p>
                </div>
                <div className="pp-destaque-acoes">
                    {proxima && botao(proxima, true)}
                    {contexto === 'mesa' && (
                        <button type="button" className="btn mini fantasma" aria-expanded={aberto} onClick={() => setAberto((a) => !a)}>
                            {aberto ? <Ico.recolher aria-hidden="true" /> : <Ico.expandir aria-hidden="true" />}{aberto ? 'Esconder etapas' : 'Ver as etapas'}
                        </button>
                    )}
                </div>
            </div>

            {contexto === 'mesa' && !aberto && (
                <ol className="pp-chips" aria-label="Etapas do episódio">
                    {etapas.map((et) => {
                        const Est = ICONE_ESTADO[et.estado];
                        return (
                            <li key={et.id} className={`pp-chip ${et.estado}${proxima && proxima.id === et.id ? ' atual' : ''}`} title={`${et.n}. ${et.nome}: ${TEXTO_ESTADO[et.estado]}. ${et.motivo}`}>
                                <span className="num">{et.n}</span>{et.nome}<Est aria-hidden="true" className={et.estado === 'andamento' ? 'girador' : ''} />
                                <span className="sr">: {TEXTO_ESTADO[et.estado]}</span>
                            </li>
                        );
                    })}
                </ol>
            )}

            {mostrarVozes && (vozes.length > 0 || errosVoz.length > 0) && (
                <AvisoVozes serieId={serieId} ep={ep} mudancas={vozes} erros={errosVoz} compacto={contexto === 'mesa'} onFeito={() => onRecarregar()} />
            )}

            <Expandir aberto={aberto}>
                <ol className="pp-etapas">
                    {etapas.map((et) => {
                        const Icone = ICONE_ETAPA[et.id];
                        const Est = ICONE_ESTADO[et.estado];
                        const atual = proxima && proxima.id === et.id;
                        return (
                            <li key={et.id} className={`pp-etapa ${et.estado}${atual ? ' atual' : ''}`} aria-current={atual ? 'step' : undefined}>
                                <span className="pp-marca num" aria-hidden="true">{et.estado === 'feito' ? <Ico.confirmar /> : et.n}</span>
                                <div className="pp-etapa-txt">
                                    <span className="pp-etapa-nome"><Icone aria-hidden="true" />{et.nome}</span>
                                    <span className="pp-etapa-motivo">{et.motivo}</span>
                                </div>
                                <span className={`pp-estado ${et.estado}`}><Est aria-hidden="true" className={et.estado === 'andamento' ? 'girador' : ''} />{TEXTO_ESTADO[et.estado]}</span>
                                <div className="pp-etapa-acoes">
                                    {et.id === 'decupagem' && et.estado !== 'bloqueado' && (
                                        <>
                                            <button type="button" className="btn mini fantasma icone" onClick={() => setDecupar('ver')} title="Ver o prompt da decupagem (para outra IA; não gasta nada)" aria-label="Ver o prompt da decupagem"><Ico.verPrompt aria-hidden="true" /></button>
                                            <button type="button" className="btn mini fantasma icone" onClick={() => setDecupar('colar')} title="Colar a decupagem gerada em outra IA (sem custo)" aria-label="Colar a decupagem de fora"><Ico.colar aria-hidden="true" /></button>
                                        </>
                                    )}
                                    {!atual && botao(et, false)}
                                </div>
                            </li>
                        );
                    })}
                </ol>
                {prod.limitado && <p className="pp-nota suave"><Ico.info aria-hidden="true" />Reinicie o Estúdio para ver a decupagem e a voz das falas aqui (rotas novas).</p>}
            </Expandir>

            <Decupar
                aberto={decupar}
                serieId={serieId}
                ep={ep}
                modeloTexto={modeloTexto}
                teto={tetoSerie}
                onFechar={() => setDecupar(null)}
                onSalvo={() => { setDecupar(null); onRecarregar(); }}
            />
            <ConfirmarCusto
                aberto={Boolean(quadros)}
                titulo={`Quadros-chave do Ep. ${ep}`}
                descricao={quadros ? `${quadros.cotacoes.length} imagens (uma por plano) a partir das fichas: o vídeo de cada plano começa na imagem dele, com o mesmo rosto e lugar.` : ''}
                itens={quadros ? quadros.cotacoes.map((c) => ({ descricao: `Plano ${c.plano}${c.referencias.length ? ` · ${c.referencias.length} referência${c.referencias.length > 1 ? 's' : ''}` : ''}`, usd: c.custoPrevistoUsd, estimativa: c.estimativa })) : []}
                totalUsd={quadros ? quadros.totalUsd : 0}
                teto={quadros && quadros.cotacoes[0] && quadros.cotacoes[0].orcamento && quadros.cotacoes[0].orcamento.tetos ? { rotulo: 'Teto do episódio', tetoUsd: quadros.cotacoes[0].orcamento.tetos.episodio, gastoUsd: quadros.cotacoes[0].orcamento.gastoEpisodioUsd || 0 } : undefined}
                avisos={quadros ? [...new Set(quadros.cotacoes.flatMap((c) => c.avisos || []))] : []}
                simulado={Boolean(quadros && quadros.simulado)}
                arquivos={quadros ? quadros.cotacoes.map((c) => c.pedido.destino) : []}
                ocupado={gerandoQ}
                progresso={gerandoQ ? `Gerando ${quadros ? quadros.cotacoes.length : ''} imagens, uma de cada vez…` : ''}
                erro={erroQ}
                onCancelar={() => { setQuadros(null); setErroQ(''); }}
                onConfirmar={gerarQuadros}
            />
            <LoteVideo
                aberto={lote}
                serieId={serieId}
                ep={ep}
                prod={prod}
                onFechar={() => setLote(false)}
                onIniciado={() => { setLote(false); onRecarregar(); }}
                onMudou={() => onRecarregar()}
            />
        </section>
    );
}
