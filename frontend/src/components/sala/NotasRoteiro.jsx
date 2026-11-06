import { useEffect, useState } from 'react';
import GlobalVar from '../subComponents/GlobalVar';
import { Ico } from '../subComponents/icones';
import { Expandir, Girador } from '../subComponents/Movimento';
import { TETO_ETAPA_USD } from './serieUtil';
import '../../assets/css/NotasRoteiro.css';

const MAX_TEXTO = 4000;

/**
 * Observações do roteiro (ANTES de gerar) e "Pedir ajustes" (DEPOIS de gerar), na mesa de luz do episódio.
 * - Observações: texto livre guardado no episódio (notas.json); entram em todo pedido de roteiro. Guardam ao sair
 *   do campo e antes de gerar.
 * - Ajustes: "O que mudar" na proposta na tela (ou no roteiro salvo). O botão abre a confirmação de custo.
 * props: observacoes, onObservacoes(texto), estadoObs ('vazio'|'guardada'|'mudou'|'guardando'|'erro'), onGuardarObs(),
 *        abertoInicial, ajustes, onAjustes(texto), base (null | 'proposta' | 'salvo'), versaoBase, ocupado, onPedirAjustes()
 */
export default function NotasRoteiro({
    observacoes, onObservacoes, estadoObs, onGuardarObs, abertoInicial = true,
    ajustes, onAjustes, base, versaoBase, ocupado = false, onPedirAjustes,
}) {
    const [aberto, setAberto] = useState(abertoInicial);
    useEffect(() => { setAberto(abertoInicial); }, [abertoInicial]);
    const temObs = observacoes.trim().length > 0;
    const textoEstado = {
        vazio: 'Opcional',
        guardada: 'Guardadas',
        mudou: 'Não guardadas',
        guardando: 'Guardando…',
        erro: 'Não guardei',
    }[estadoObs] || '';
    const IconeEstado = estadoObs === 'guardada' ? Ico.ok : estadoObs === 'erro' ? Ico.erro : estadoObs === 'mudou' ? Ico.pendente : null;
    const podeAjustar = Boolean(base) && ajustes.trim().length > 0 && !ocupado;

    return (
        <section className="notas-rot" aria-label="Observações e ajustes do roteiro">
            <div className="nr-bloco">
                <button
                    type="button"
                    className="nr-cab"
                    aria-expanded={aberto}
                    aria-controls="nr-obs-corpo"
                    onClick={() => setAberto((a) => !a)}
                >
                    <Ico.observacoes className="nr-ico" aria-hidden="true" />
                    <span className="nr-titulo">Observações para o roteiro</span>
                    <span className={`nr-estado ${estadoObs}`}>
                        {estadoObs === 'guardando' ? <Girador /> : IconeEstado && <IconeEstado aria-hidden="true" />}
                        {textoEstado}
                    </span>
                    <Ico.expandir className={`nr-seta${aberto ? ' aberta' : ''}`} aria-hidden="true" />
                </button>
                {!aberto && temObs && <p className="nr-previa">{observacoes}</p>}
                <Expandir aberto={aberto}>
                    <div id="nr-obs-corpo" className="nr-corpo">
                        <label className="nr-campo">
                            <span className="sr">Observações para o roteiro</span>
                            <textarea
                                rows={4}
                                maxLength={MAX_TEXTO}
                                value={observacoes}
                                placeholder="Ex.: comece apresentando a Mara e o farol; tom de suspense, sem correria; evite a Mara falando olhando para a câmera."
                                onChange={(e) => onObservacoes(e.target.value)}
                                onBlur={() => estadoObs === 'mudou' && onGuardarObs()}
                            />
                            <small>O que você quer na história, o tom, o que evitar. Ficam guardadas neste episódio e entram em todo pedido de roteiro: escrever, ajustar e refazer.</small>
                        </label>
                        {estadoObs === 'mudou' && (
                            <div className="nr-acoes">
                                <button type="button" className="btn mini" onClick={onGuardarObs}>
                                    <Ico.salvar aria-hidden="true" />Guardar observações
                                </button>
                            </div>
                        )}
                    </div>
                </Expandir>
            </div>

            {base && (
                <div className="nr-bloco nr-ajustes">
                    <h3 className="nr-titulo nr-titulo-ajustes"><Ico.ajustar className="nr-ico" aria-hidden="true" />Pedir ajustes</h3>
                    <p className="nr-sub">
                        {base === 'proposta'
                            ? `O showrunner reescreve a proposta na tela${versaoBase ? ` (v${versaoBase})` : ''}: muda só o que você pedir e mantém o resto.`
                            : 'O showrunner reescreve o roteiro salvo: muda só o que você pedir e mantém o resto. O salvo só troca quando você salvar a proposta nova.'}
                    </p>
                    <label className="nr-campo">
                        <span>O que mudar</span>
                        <textarea
                            rows={3}
                            maxLength={MAX_TEXTO}
                            value={ajustes}
                            disabled={ocupado}
                            placeholder="Ex.: o Davi só aparece no rádio; troque o final por uma batida na porta; menos narração no começo."
                            onChange={(e) => onAjustes(e.target.value)}
                        />
                    </label>
                    <div className="nr-acoes">
                        <span className="nr-custo num">até {GlobalVar.usdFino(TETO_ETAPA_USD)}</span>
                        <button type="button" className="btn" onClick={onPedirAjustes} disabled={!podeAjustar} aria-busy={ocupado}>
                            {ocupado && <Girador />}
                            <Ico.regerar className="ico-girar" aria-hidden="true" />
                            <span>{base === 'proposta' ? 'Regerar com ajustes' : 'Ajustar roteiro salvo'}</span>
                        </button>
                    </div>
                </div>
            )}
        </section>
    );
}
