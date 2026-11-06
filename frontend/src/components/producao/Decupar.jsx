// DECUPAR o episódio: a IA escreve o pedido de vídeo de cada plano (etapa "decupagem" do showrunner), você lê e salva
// (planos.json). Também dá para ver o prompt e colar a resposta de outra IA (sem custo). Nada é gravado sem "Salvar".
import { useEffect, useState } from 'react';
import GlobalVar from '../subComponents/GlobalVar';
import ConfirmarCusto from '../subComponents/ConfirmarCusto';
import Dialogo from '../subComponents/Dialogo';
import PromptEtapa from '../subComponents/PromptEtapa';
import { Ico } from '../subComponents/icones';
import { Girador, avisar } from '../subComponents/Movimento';
import { ExecutarEtapa, SalvarDecupagem, rotaIndisponivel } from '../funcionalidades/bancoGet';
import { erroDe } from '../funcionalidades/fetchFunc';
import { TETO_ETAPA_USD, textoDuracao } from '../sala/serieUtil';
import '../../assets/css/Decupar.css';

const TIPO = { video_ia: 'Vídeo IA', apresentador: 'Apresentador', grafico: 'Gráfico', reaproveitar: 'Reaproveitar clipe' };

/**
 * props: aberto ('confirmar' | 'ver' | 'colar' | 'revisar' | null), serieId, ep, modeloTexto, teto { tetoUsd, gastoUsd },
 *        onFechar, onSalvo(resposta)
 */
export default function Decupar({ aberto, serieId, ep, modeloTexto, teto, onFechar, onSalvo }) {
    const chave = `estudio:decupagem:${serieId}:${ep}`;
    const [proposta, setProposta] = useState(() => GlobalVar.getLocalStorage(chave, null));
    const [modo, setModo] = useState(null);
    const [ocupado, setOcupado] = useState(false);
    const [erro, setErro] = useState('');
    const [salvando, setSalvando] = useState(false);

    // "decupar" abre a revisão se já houver uma proposta guardada; senão a confirmação de custo
    useEffect(() => {
        if (!aberto) { setModo(null); return; }
        setErro('');
        if (aberto === 'confirmar' && proposta && proposta.resultado) setModo('revisar');
        else setModo(aberto);
    }, [aberto]); // eslint-disable-line react-hooks/exhaustive-deps

    function guardar(p) {
        setProposta(p);
        GlobalVar.setLocalStorage(chave, p);
    }

    function fechar() {
        setModo(null);
        onFechar();
    }

    async function executar() {
        setOcupado(true);
        setErro('');
        const r = await ExecutarEtapa({ etapa: 'decupagem', serieId, contexto: { ep }, tetoUsd: TETO_ETAPA_USD });
        setOcupado(false);
        if (rotaIndisponivel(r)) { setErro('O showrunner não está no servidor.'); return; }
        if (erroDe(r)) { setErro(erroDe(r)); return; }
        window.dispatchEvent(new Event('estudio:gasto'));
        guardar({ ...r, em: new Date().toISOString() });
        setModo('revisar');
    }

    function receberDeFora(r) {
        guardar({ ...r, em: new Date().toISOString() });
        setModo('revisar');
    }

    async function salvar() {
        if (!proposta || !proposta.resultado) return;
        setSalvando(true);
        setErro('');
        const r = await SalvarDecupagem({ serie: serieId, ep, decupagem: proposta.resultado });
        setSalvando(false);
        if (rotaIndisponivel(r)) { setErro('Reinicie o Estúdio para salvar a decupagem (rota nova).'); return; }
        if (erroDe(r)) { setErro(`${erroDe(r)}${Array.isArray(r.erros) && r.erros.length > 1 ? ` (+${r.erros.length - 1})` : ''}`); return; }
        try { localStorage.removeItem(chave); } catch { /* sem armazenamento */ }
        setProposta(null);
        avisar(`Decupagem do Ep. ${ep} salva: o pedido de vídeo de cada plano está pronto.`, 'ok', 5000);
        (r.avisos || []).slice(0, 3).forEach((a) => avisar(a, 'aviso', 6000));
        setModo(null);
        onSalvo(r);
    }

    const planos = proposta && proposta.resultado && Array.isArray(proposta.resultado.planos) ? proposta.resultado.planos : [];

    return (
        <>
            <ConfirmarCusto
                aberto={modo === 'confirmar'}
                titulo={`Decupar o Ep. ${ep}`}
                descricao="O showrunner escreve, para cada plano do roteiro aprovado, o pedido de vídeo (câmera, quem, ação, lugar e estilo, em inglês), as âncoras e o modelo. Você lê antes de salvar. O valor abaixo é o teto; o custo real costuma ser bem menor."
                itens={[{ descricao: `Texto · ${modeloTexto || 'modelo padrão'} · teto da etapa`, usd: TETO_ETAPA_USD, estimativa: true }]}
                teto={teto ? { rotulo: 'Teto da série', ...teto } : undefined}
                verbo="Decupar"
                ocupado={ocupado}
                progresso={ocupado ? 'O showrunner está decupando…' : ''}
                erro={erro}
                onCancelar={fechar}
                onConfirmar={executar}
            />

            <PromptEtapa
                aberto={modo === 'ver' || modo === 'colar'}
                modo={modo === 'colar' ? 'colar' : 'ver'}
                titulo={`Decupagem do Ep. ${ep} com outra IA`}
                etapa="decupagem"
                serieId={serieId}
                obterContexto={async () => ({ ep })}
                onFechar={fechar}
                onResultado={receberDeFora}
            />

            <Dialogo
                id="decupar-revisar"
                aberto={modo === 'revisar'}
                titulo={`Decupagem do Ep. ${ep}`}
                descricao={proposta ? `${proposta.origem === 'externo' ? 'Colada de fora, sem custo' : Number.isFinite(proposta.custoUsd) ? `Custou ${GlobalVar.usdFino(proposta.custoUsd)}` : 'Proposta'}. Ainda não salva: leia e salve.` : ''}
                icone={Ico.decupagem}
                largura={760}
                travado={salvando}
                onFechar={fechar}
                rodape={(
                    <>
                        <button type="button" className="btn fantasma" onClick={() => { try { localStorage.removeItem(chave); } catch { /* */ } setProposta(null); fechar(); avisar('Decupagem descartada', 'info'); }} disabled={salvando}>
                            <Ico.apagar aria-hidden="true" />Descartar
                        </button>
                        <button type="button" className="btn" onClick={() => setModo('confirmar')} disabled={salvando}>
                            <Ico.regerar className="ico-girar" aria-hidden="true" />Decupar de novo
                        </button>
                        <button type="button" className="btn primario" onClick={salvar} disabled={salvando || !planos.length} aria-busy={salvando} data-foco>
                            {salvando && <Girador />}<Ico.salvar aria-hidden="true" />Salvar decupagem
                        </button>
                    </>
                )}
            >
                {proposta && Array.isArray(proposta.erros) && proposta.erros.length > 0 && (
                    <ul className="dec-erros">{proposta.erros.map((e) => <li key={e}><Ico.aviso aria-hidden="true" />{e}</li>)}</ul>
                )}
                <ol className="dec-planos">
                    {planos.map((p) => (
                        <li key={p.n} className="dec-plano">
                            <div className="dec-cab">
                                <strong>Plano {p.n}</strong>
                                <span className="suave">{TIPO[p.tipo] || p.tipo}</span>
                                {Number.isFinite(p.duracaoS) && <span className="num suave">{textoDuracao(p.duracaoS)}</span>}
                                {p.modelo && <span className="dec-modelo">{p.modelo}</span>}
                            </div>
                            {p.descricaoPt && <p className="dec-pt">{p.descricaoPt}</p>}
                            {p.prompt && (
                                <details className="dec-prompt">
                                    <summary>Ver o pedido de vídeo</summary>
                                    <pre>{p.prompt}</pre>
                                </details>
                            )}
                            {Array.isArray(p.ancoras) && p.ancoras.length > 0 && <p className="dec-ancoras suave">Âncoras: {p.ancoras.join(', ')}</p>}
                        </li>
                    ))}
                </ol>
                {erro && <p className="dlg-erro" role="alert"><Ico.erro aria-hidden="true" /><span>{erro}</span></p>}
            </Dialogo>
        </>
    );
}
