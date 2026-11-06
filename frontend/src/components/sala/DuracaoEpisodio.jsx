// DURAÇÃO do episódio editável depois de criado (pedido do Rafael, 06/11/2026: "o episódio ficou muito curto, quero
// poder reeditar o tempo"). Número livre de 1 a 600 s + atalhos, igual ao "Novo episódio". Salvar só troca o
// serie.json (grátis); o roteiro fica como está e a página oferece "Ajustar o roteiro para N s" ou "Refazer do zero".
import { useEffect, useState } from 'react';
import { AlterarDuracaoEpisodio, rotaIndisponivel } from '../funcionalidades/bancoGet';
import { erroDe } from '../funcionalidades/fetchFunc';
import { Ico } from '../subComponents/icones';
import { Expandir, Girador, MOV, avisar, motion } from '../subComponents/Movimento';
import { DURACAO_MAX_S, DURACAO_MIN_S, LIMITE_SEM_ESCOLHA_S, faixaPlanos, textoDuracao } from './serieUtil';
import '../../assets/css/DuracaoEpisodio.css';

const ATALHOS = [15, 30, 45, 60, 90];
const lerNumero = (t) => {
    const v = Number(String(t).replace(',', '.'));
    return Number.isFinite(v) ? Math.round(v * 10) / 10 : NaN;
};
const tolerancia = (alvo) => Math.max(0.5, Math.min(3, alvo * 0.1));

/**
 * props: serieId, ep (n), duracaoAlvoS, semEscolha, roteiro (salvo ou null), onMudou(resposta), onAjustar(duracaoS), onRefazer()
 */
export default function DuracaoEpisodio({ serieId, ep, duracaoAlvoS, semEscolha, roteiro, onMudou, onAjustar, onRefazer }) {
    const [editando, setEditando] = useState(false);
    const [valor, setValor] = useState(String(duracaoAlvoS));
    const [semManual, setSemManual] = useState(null);
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState('');
    useEffect(() => { if (!editando) setValor(String(duracaoAlvoS)); }, [duracaoAlvoS, editando]);

    const d = lerNumero(valor);
    const valida = Number.isFinite(d) && d >= DURACAO_MIN_S && d <= DURACAO_MAX_S;
    const semVoto = semManual !== null ? semManual : valida ? d < LIMITE_SEM_ESCOLHA_S || (semEscolha && duracaoAlvoS >= LIMITE_SEM_ESCOLHA_S) : semEscolha;
    const fimRoteiro = roteiro && Array.isArray(roteiro.planos) ? roteiro.planos.reduce((m, p) => Math.max(m, Number(p.ateS) || 0), 0) : 0;
    const roteiroAtrasado = Boolean(roteiro && fimRoteiro && Math.abs(fimRoteiro - duracaoAlvoS) > tolerancia(duracaoAlvoS));
    const votoAtrasado = Boolean(roteiro && (roteiro.escolhas === null) !== Boolean(semEscolha));

    async function salvar(e) {
        if (e) e.preventDefault();
        if (!valida) { setErro(`Use de ${DURACAO_MIN_S} a ${DURACAO_MAX_S} segundos.`); return; }
        setSalvando(true);
        setErro('');
        const r = await AlterarDuracaoEpisodio({ serie: serieId, ep, duracaoAlvoS: d, semEscolha: semManual !== null ? semManual : undefined });
        setSalvando(false);
        if (rotaIndisponivel(r)) { setErro('Reinicie o Estúdio para trocar a duração (rota nova).'); return; }
        if (erroDe(r)) { setErro(erroDe(r)); return; }
        setEditando(false);
        setSemManual(null);
        avisar(`Ep. ${ep} agora tem ${textoDuracao(r.episodio.duracaoAlvoS)}${r.episodio.semEscolha ? ', sem votação' : ', com escolha A/B'}.${r.precisaAjustar ? ' Ajuste o roteiro para a duração nova.' : ''}`, 'ok', 5000);
        onMudou(r);
    }

    return (
        <div className="dur-ep">
            <button type="button" className="dur-chip" onClick={() => setEditando((x) => !x)} aria-expanded={editando} title="Trocar a duração do episódio">
                <Ico.duracao aria-hidden="true" />
                <strong className="num">{textoDuracao(duracaoAlvoS)}</strong>
                <span className="dur-editar"><Ico.editar aria-hidden="true" />Duração</span>
            </button>

            <Expandir aberto={editando}>
                <form className="dur-form" onSubmit={salvar} noValidate>
                    <div className="dur-linha">
                        <label className="dur-numero">
                            <span className="sr">Duração em segundos</span>
                            <input type="text" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} aria-invalid={!valida} aria-describedby={`dur-ajuda-${ep}`} />
                            <span className="dur-unidade" aria-hidden="true">s</span>
                        </label>
                        <div className="dur-atalhos" role="group" aria-label="Atalhos de duração">
                            {ATALHOS.map((v) => {
                                const ativo = valida && d === v;
                                return (
                                    <button key={v} type="button" className={`dur-atalho${ativo ? ' ativo' : ''}`} aria-pressed={ativo} onClick={() => { setValor(String(v)); setErro(''); }}>
                                        {ativo && <motion.span layoutId={`dur-marca-${ep}`} className="dur-atalho-marca" transition={MOV.mola} />}
                                        <span className="num">{v} s</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    <small id={`dur-ajuda-${ep}`} className={valida ? 'suave' : 'dur-erro-txt'}>
                        {valida ? `${faixaPlanos(d)}, ${semVoto ? 'sem votação' : 'com escolha A/B no fim'}. De ${DURACAO_MIN_S} a ${DURACAO_MAX_S} s.` : `Use de ${DURACAO_MIN_S} a ${DURACAO_MAX_S} segundos.`}
                    </small>
                    <label className="dur-check">
                        <input type="checkbox" checked={semVoto} onChange={(e) => setSemManual(e.target.checked)} />
                        <span>Sem votação A/B neste episódio</span>
                    </label>
                    <div className="dur-acoes">
                        <button type="button" className="btn" onClick={() => { setEditando(false); setSemManual(null); setErro(''); }} disabled={salvando}>Cancelar</button>
                        <button type="submit" className="btn primario" disabled={salvando || !valida} aria-busy={salvando}>
                            {salvando && <Girador />}<Ico.salvar aria-hidden="true" />Salvar duração
                        </button>
                    </div>
                    {roteiro && <p className="dur-nota suave"><Ico.info aria-hidden="true" />Salvar não mexe no roteiro: depois você ajusta o roteiro para a duração nova (ou refaz do zero).</p>}
                    {erro && <p className="nota-erro" role="alert"><Ico.erro aria-hidden="true" />{erro}</p>}
                </form>
            </Expandir>

            {!editando && (roteiroAtrasado || votoAtrasado) && (
                <div className="dur-atraso" role="status">
                    <Ico.aviso aria-hidden="true" className="dur-atraso-ico" />
                    <p>
                        <strong>{roteiroAtrasado ? `O roteiro tem ${textoDuracao(fimRoteiro)} e o episódio agora tem ${textoDuracao(duracaoAlvoS)}.` : `O episódio agora é ${semEscolha ? 'sem votação' : 'com escolha A/B'}, e o roteiro não.`}</strong>
                        <span> Ajuste o roteiro (mantém a história) ou refaça do zero.</span>
                    </p>
                    <div className="dur-atraso-acoes">
                        <button type="button" className="btn mini" onClick={() => onAjustar(duracaoAlvoS)}>
                            <Ico.ajustar aria-hidden="true" />Ajustar o roteiro para {textoDuracao(duracaoAlvoS)}
                        </button>
                        <button type="button" className="btn mini fantasma" onClick={onRefazer}>
                            <Ico.refazerRoteiro aria-hidden="true" />Refazer roteiro do zero
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
