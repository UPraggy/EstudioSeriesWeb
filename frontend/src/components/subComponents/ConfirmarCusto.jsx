import { useEffect, useState } from 'react';
import Dialogo from './Dialogo';
import GlobalVar from './GlobalVar';
import { SaldoOpenRouter } from '../funcionalidades/bancoGet';
import { erroDe } from '../funcionalidades/fetchFunc';
import { Ico } from './icones';
import { Contador, Girador, MOV, motion } from './Movimento';
import '../../assets/css/ConfirmarCusto.css';

// Saldo que dá para gastar agora (o menor entre o saldo da conta e o que resta no limite da chave). null = não se sabe.
export function saldoDisponivel(saldo) {
    if (!saldo || saldo.simulado || erroDe(saldo)) return null;
    const valores = [];
    if (saldo.conta && Number.isFinite(saldo.conta.saldoUsd)) valores.push(saldo.conta.saldoUsd);
    if (Number.isFinite(saldo.limiteRestanteUsd)) valores.push(saldo.limiteRestanteUsd);
    return valores.length ? Math.min(...valores) : null;
}

const pct = (v, de) => (de > 0 ? Math.max(0, Math.min(100, (v / de) * 100)) : 0);

/**
 * Confirmação de gasto (reutilizável). NUNCA confirma sozinho: o foco começa em "Cancelar" e só o clique no botão
 * principal chama onConfirmar. Mostra itens, custo previsto, saldo antes/depois e o teto.
 * props: aberto, titulo, descricao, itens [{ descricao, usd, estimativa }], totalUsd, estimativa,
 *        teto { rotulo, tetoUsd, gastoUsd }, avisos [], simulado, arquivos [], verbo ('Gerar'),
 *        ocupado, progresso (texto), erro, onConfirmar, onCancelar
 * (Só o visual mudou em 04/11/2026: o fluxo cotação → token → executar é o mesmo.)
 */
export default function ConfirmarCusto({
    aberto, titulo = 'Confirmar gasto', descricao, itens = [], totalUsd, estimativa = false, teto, avisos = [],
    simulado = false, arquivos = [], verbo = 'Gerar', ocupado = false, progresso, erro, onConfirmar, onCancelar,
}) {
    const [saldo, setSaldo] = useState(null);
    const [carregandoSaldo, setCarregandoSaldo] = useState(false);

    useEffect(() => {
        if (!aberto) return undefined;
        let vivo = true;
        setCarregandoSaldo(true);
        SaldoOpenRouter().then((r) => {
            if (!vivo) return;
            setSaldo(r);
            setCarregandoSaldo(false);
        });
        return () => { vivo = false; };
    }, [aberto]);

    const total = Number.isFinite(Number(totalUsd)) ? Number(totalUsd) : itens.reduce((s, i) => s + (Number(i.usd) || 0), 0);
    const algumEstimado = estimativa || itens.some((i) => i.estimativa);
    const disponivel = saldoDisponivel(saldo);
    const semSaldo = disponivel !== null && total > disponivel + 1e-9;
    const gastoTeto = teto ? Number(teto.gastoUsd) || 0 : 0;
    const passaTeto = Boolean(teto && Number.isFinite(teto.tetoUsd) && gastoTeto + total > teto.tetoUsd + 1e-9);
    const bloqueado = semSaldo || passaTeto;
    const modoSimulado = simulado || Boolean(saldo && saldo.simulado);

    function linhaSaldo() {
        if (carregandoSaldo) return <span className="suave cc-consultando"><Girador />consultando…</span>;
        if (modoSimulado) return <span className="suave">não consultado (modo simulado)</span>;
        if (erroDe(saldo)) return <span className="suave">não consegui ler ({erroDe(saldo)})</span>;
        if (disponivel === null) return <span className="suave">sem limite definido na chave</span>;
        return (
            <span className="num cc-saldo">
                <span>{GlobalVar.usd(disponivel)}</span>
                <Ico.avancar className="cc-seta" aria-hidden="true" /><span className="cc-sr"> depois: </span>
                <strong className={semSaldo ? 'cc-perigo' : ''}>{GlobalVar.usd(disponivel - total)}</strong>
            </span>
        );
    }

    const rodape = (
        <>
            {progresso && <span className="dlg-rodape-esq" aria-live="polite"><span className="cc-gerando" aria-hidden="true" />{progresso}</span>}
            <button type="button" className="btn" onClick={onCancelar} disabled={ocupado} data-foco>Cancelar</button>
            <button type="button" className="btn primario cc-confirmar" onClick={onConfirmar} disabled={bloqueado || ocupado || !itens.length} aria-busy={ocupado}>
                {ocupado && <Girador />}
                <Ico.confirmar className="ico-pular" aria-hidden="true" />
                <span>{ocupado ? 'Gerando…' : `${verbo} por ${GlobalVar.usdFino(total)}`}</span>
            </button>
        </>
    );

    const temTeto = Boolean(teto && Number.isFinite(teto.tetoUsd));

    return (
        <Dialogo id="confirmar-custo" aberto={aberto} titulo={titulo} descricao={descricao} icone={Ico.custo} onFechar={onCancelar} travado={ocupado} rodape={rodape} largura={560}>
            <div className={`cc-destaque${bloqueado ? ' bloqueado' : ''}`}>
                <span className="cc-destaque-rot">Custo previsto{algumEstimado ? ' (estimado)' : ''}</span>
                <Contador valor={total} formatar={GlobalVar.usdFino} className="cc-destaque-valor" />
            </div>

            {itens.length > 0 && (
                <table className="cc-itens">
                    <tbody>
                        {itens.map((i, k) => (
                            <tr key={k}>
                                <td>{i.descricao}{i.estimativa && <span className="cc-est"> estimado</span>}</td>
                                <td className="num">{GlobalVar.usdFino(i.usd)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}

            <dl className="cc-resumo">
                <div>
                    <dt><Ico.saldo aria-hidden="true" />Saldo da chave</dt>
                    <dd>{linhaSaldo()}</dd>
                </div>
                {temTeto && (
                    <div>
                        <dt><Ico.bloqueado aria-hidden="true" />{teto.rotulo || 'Teto'}</dt>
                        <dd className="num">
                            {GlobalVar.usdFino(gastoTeto)} gasto + {GlobalVar.usdFino(total)} = <strong className={passaTeto ? 'cc-perigo' : ''}>{GlobalVar.usdFino(gastoTeto + total)}</strong> de {GlobalVar.usd(teto.tetoUsd)}
                            <span className={`cc-teto${passaTeto ? ' passa' : ''}`} aria-hidden="true">
                                <span className="cc-teto-gasto" style={{ width: `${pct(gastoTeto, teto.tetoUsd)}%` }} />
                                <motion.span
                                    className="cc-teto-pedido"
                                    initial={{ width: 0 }}
                                    animate={{ width: `${Math.min(pct(total, teto.tetoUsd), 100 - pct(gastoTeto, teto.tetoUsd))}%`, transition: { delay: 0.12, duration: MOV.lento, ease: MOV.enfatico } }}
                                />
                            </span>
                        </dd>
                    </div>
                )}
            </dl>

            {semSaldo && <p className="dlg-erro" role="alert"><Ico.erro aria-hidden="true" /><span>Saldo insuficiente para este pedido.</span></p>}
            {passaTeto && <p className="dlg-erro" role="alert"><Ico.erro aria-hidden="true" /><span>Passa do teto. Ajuste o teto em serie.json ou escolha um modelo mais barato.</span></p>}
            {avisos.length > 0 && (
                <ul className="cc-avisos">
                    {avisos.map((a, k) => <li key={k}><Ico.aviso aria-hidden="true" /><span>{a}</span></li>)}
                </ul>
            )}
            {modoSimulado && (
                <p className="dlg-aviso"><Ico.simulado aria-hidden="true" /><span><strong>Modo simulado.</strong> Nada é cobrado e nada vai para a rede: o servidor devolve um resultado de exemplo.</span></p>
            )}
            {arquivos.length > 0 && (
                <div className="cc-arquivos">
                    <span className="cc-rot"><Ico.pasta aria-hidden="true" />Grava em</span>
                    {arquivos.map((a) => <code key={a}>{a}</code>)}
                </div>
            )}
            {erro && <p className="dlg-erro" role="alert"><Ico.erro aria-hidden="true" /><span>{erro}</span></p>}
            <p className="dlg-nota cc-nota"><Ico.info aria-hidden="true" /><span>Nada é cobrado sem este clique. O pedido fica registrado logo após a resposta, para nunca pagar duas vezes.</span></p>
        </Dialogo>
    );
}
