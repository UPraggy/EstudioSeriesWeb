import { useState } from 'react';
import GlobalVar from '../subComponents/GlobalVar';
import { Ico } from '../subComponents/icones';
import { Expandir } from '../subComponents/Movimento';
import '../../assets/css/HistoricoPropostas.css';

function origem(h) {
    if (h.origem === 'externo') return h.tipo === 'ajuste' ? 'Ajuste colado de fora' : 'Colado de fora';
    if (h.tipo !== 'ajuste') return 'Escrito do zero';
    if (h.base === 'salvo') return 'Ajuste do roteiro salvo';
    return h.baseVersao ? `Ajuste da v${h.baseVersao}` : 'Ajuste de uma proposta';
}

/**
 * Histórico das propostas de roteiro do episódio (notas.json → historico), da mais nova para a mais velha.
 * Cada uma: versão, de onde veio, data, custo, título, ajustes/observações usados; "Comparar" e "Usar esta".
 * props: historico [], naTela (versão da proposta na tela), comparando (versão), onComparar(h), onUsar(h)
 */
export default function HistoricoPropostas({ historico = [], naTela, comparando, onComparar, onUsar }) {
    const [aberto, setAberto] = useState(false);
    if (!historico.length) return null;
    const lista = [...historico].reverse();
    const gasto = historico.reduce((s, h) => s + (Number(h.custoUsd) || 0), 0);

    return (
        <section className="hist-prop" aria-label="Propostas deste episódio">
            <button type="button" className="hp-cab" aria-expanded={aberto} aria-controls="hp-corpo" onClick={() => setAberto((a) => !a)}>
                <Ico.historico className="hp-ico" aria-hidden="true" />
                <span className="hp-titulo">Propostas deste episódio</span>
                <span className="hp-resumo num">{historico.length} · {GlobalVar.usdFino(gasto)}</span>
                <Ico.expandir className={`hp-seta${aberto ? ' aberta' : ''}`} aria-hidden="true" />
            </button>
            <Expandir aberto={aberto}>
                <ol id="hp-corpo" className="hp-lista">
                    {lista.map((h) => {
                        const atual = naTela === h.versao;
                        const vendo = comparando === h.versao;
                        const temRoteiro = Boolean(h.resultado && Array.isArray(h.resultado.planos)) || h.temRoteiro === true;
                        return (
                            <li key={h.id || h.versao} className={`hp-item${atual ? ' atual' : ''}${vendo ? ' vendo' : ''}`}>
                                <div className="hp-linha">
                                    <strong className="hp-v num">v{h.versao}</strong>
                                    <span className="hp-origem">{origem(h)}</span>
                                    <span className="hp-data">{GlobalVar.dataHoraBR(h.em)}</span>
                                    <span className="hp-custo num">{GlobalVar.usdFino(h.custoUsd)}</span>
                                    {h.ok === false && <span className="hp-tag aviso"><Ico.aviso aria-hidden="true" />Com problemas</span>}
                                    {atual && <span className="hp-tag"><Ico.ver aria-hidden="true" />Na tela</span>}
                                </div>
                                {h.titulo && <p className="hp-nome">{h.titulo}</p>}
                                {h.ajustes && <p className="hp-pedido"><Ico.ajustar aria-hidden="true" /><span>{h.ajustes}</span></p>}
                                {h.observacoes && <p className="hp-pedido suave"><Ico.observacoes aria-hidden="true" /><span>{h.observacoes}</span></p>}
                                <div className="hp-acoes">
                                    <button type="button" className={`btn mini${vendo ? '' : ' fantasma'}`} aria-pressed={vendo} disabled={!temRoteiro} onClick={() => onComparar(vendo ? null : h)}>
                                        <Ico.comparar aria-hidden="true" />{vendo ? 'Fechar comparação' : 'Comparar'}
                                    </button>
                                    <button type="button" className="btn mini" disabled={atual || !temRoteiro} onClick={() => onUsar(h)} title={atual ? 'Esta já é a proposta na tela' : 'Põe esta proposta na tela para ler e salvar'}>
                                        <Ico.confirmar aria-hidden="true" />Usar esta
                                    </button>
                                </div>
                            </li>
                        );
                    })}
                </ol>
            </Expandir>
        </section>
    );
}
