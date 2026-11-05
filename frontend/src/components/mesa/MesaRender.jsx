// MONTAR EPISÓDIO: escolhe o caminho (ffmpeg fiel à Mesa, ou o motor NarradorVideo), acompanha o progresso e
// mostra o mp4 final numa moldura 9:16. Montar é local e grátis (não chama a IA).
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import '../../assets/css/MesaRender.css';
import * as M from './mesaUtil';
import { RenderizarEpisodio, StatusRender } from '../funcionalidades/bancoGet';
import { erroDe } from '../funcionalidades/fetchFunc';
import { Ico } from '../subComponents/icones';
import { motion, MOV, Girador, Contador, Visto, avisar } from '../subComponents/Movimento';

const MOTORES = [
    {
        id: 'ffmpeg', nome: 'Igual à Mesa', icone: Ico.montar, recomendado: true,
        desc: 'Cortes no quadro exato, as falas nos mesmos tempos, legenda, texto de tela e cartões A/B como na prévia; som dos clipes e ambiente com ducking; master −14 LUFS.',
    },
    {
        id: 'narrador', nome: 'Motor NarradorVideo', icone: Ico.narracao,
        desc: 'Traduz a edição para um projeto do motor (uma cena por plano, falas com atraso) e usa os títulos animados dele. Gera a voz de novo, estica a cena pela fala e não grava a legenda.',
    },
];

export default function MesaRender({ serie, ep, doc, inicial, fechar }) {
    const [motor, setMotor] = useState('ffmpeg');
    const [st, setSt] = useState(inicial && inicial.status !== 'nenhum' ? inicial : null);
    const [erro, setErro] = useState(null);
    const [pedindo, setPedindo] = useState(false);
    const caixaRef = useRef(null);
    const antesRef = useRef(st ? st.status : null);

    useEffect(() => {
        const esc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); fechar(); } };
        window.addEventListener('keydown', esc);
        const voltarFoco = document.activeElement;
        if (caixaRef.current) caixaRef.current.focus();
        return () => {
            window.removeEventListener('keydown', esc);
            if (voltarFoco && voltarFoco.focus) voltarFoco.focus();
        };
    }, [fechar]);

    const montando = st && st.status === 'montando';
    useEffect(() => {
        if (!montando) return undefined;
        const id = setInterval(async () => {
            const r = await StatusRender({ serie, ep });
            if (!erroDe(r)) setSt(r);
        }, 900);
        return () => clearInterval(id);
    }, [montando, serie, ep]);

    // fim da montagem: aviso flutuante (o visto se desenha no cartão)
    useEffect(() => {
        const agora = st ? st.status : null;
        if (antesRef.current === 'montando' && agora === 'pronto') avisar('Episódio montado', 'ok');
        if (antesRef.current === 'montando' && (agora === 'falhou' || agora === 'interrompido')) avisar('A montagem falhou. Veja o motivo no diálogo.', 'erro', 6000);
        antesRef.current = agora;
    }, [st]);

    const montar = async () => {
        setErro(null);
        setPedindo(true);
        const r = await RenderizarEpisodio({ serie, ep, motor });
        setPedindo(false);
        if (erroDe(r)) { setErro(erroDe(r)); return; }
        antesRef.current = 'montando';
        setSt(r);
    };

    const pronto = st && st.status === 'pronto' && st.saida;
    const desatualizado = pronto && st.revisao !== undefined && st.revisao !== doc.revisao;
    const falhou = st && (st.status === 'falhou' || st.status === 'interrompido');
    const pct = Math.max(0, Math.min(100, (st && st.pct) || 0));

    return createPortal(
        <motion.div
            className="rd-fundo" role="presentation"
            initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { duration: MOV.rapido } }}
            onMouseDown={(e) => { if (e.target === e.currentTarget && !montando) fechar(); }}
        >
            <motion.div
                className="rd-caixa" role="dialog" aria-modal="true" aria-labelledby="rd-titulo" tabIndex={-1} ref={caixaRef}
                initial={{ opacity: 0, y: 10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: MOV.base, ease: MOV.enfatico } }}
            >
                <header className="rd-cab">
                    <div>
                        <h2 id="rd-titulo">Montar episódio</h2>
                        <p className="rd-sub">Ep. {ep} · <span className="num">{M.fmtS(M.duracaoDoc(doc), 1)}</span> · {doc.largura || 1080}×{doc.altura || 1920} · {doc.fps || 24} qps</p>
                    </div>
                    <button type="button" className="btn mini icone fantasma" onClick={fechar} aria-label="Fechar" title="Fechar (Esc)"><Ico.fechar aria-hidden="true" /></button>
                </header>
                <div className="rd-corpo">
                    <div className="rd-opcoes" role="radiogroup" aria-label="Como montar">
                        {MOTORES.map((m) => {
                            const Icone = m.icone;
                            return (
                                <label key={m.id} className={`rd-opcao ${motor === m.id ? 'sel' : ''}`}>
                                    <input type="radio" name="motor" value={m.id} checked={motor === m.id} onChange={() => setMotor(m.id)} disabled={montando} />
                                    <Icone className="rd-opcao-ico" aria-hidden="true" />
                                    <span className="rd-opcao-txt">
                                        <span className="rd-opcao-nome">{m.nome}{m.recomendado && <span className="rd-recomendado"><Ico.ok aria-hidden="true" />Recomendado</span>}</span>
                                        <span className="rd-desc">{m.desc}</span>
                                    </span>
                                </label>
                            );
                        })}
                    </div>

                    {st && st.status !== 'nenhum' && !pronto && (
                        <div className={`rd-estado ${falhou ? 'falhou' : ''}`} role="status">
                            <div className="rd-estado-cab">
                                {montando && <span className="estado vivo">Montando</span>}
                                {falhou && <span className="rd-falhou"><Ico.erro aria-hidden="true" />{st.status === 'interrompido' ? 'Interrompido' : 'Falhou'}</span>}
                                <span className="rd-etapa">{st.etapa}</span>
                                <Contador valor={pct} formatar={(v) => `${Math.round(v)}%`} className="rd-pct" />
                            </div>
                            <div className="rd-barra" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label="Progresso da montagem">
                                <div style={{ transform: `scaleX(${pct / 100})` }} />
                            </div>
                            {st.erro && <p className="rd-erro">{st.erro}</p>}
                            {(st.avisos || []).map((a, i) => <p key={i} className="nota-aviso"><Ico.aviso aria-hidden="true" />{a}</p>)}
                        </div>
                    )}

                    {pronto && (
                        <div className="rd-final">
                            <div className="rd-moldura">
                                <video key={`${st.saida}-${st.concluidoEm}`} src={`${M.midiaUrl(serie, st.saida)}&v=${encodeURIComponent(st.concluidoEm || '')}`} controls playsInline preload="metadata" />
                            </div>
                            <div className="rd-final-info">
                                <p className="rd-pronto"><Visto tamanho={18} />Episódio montado</p>
                                <dl className="rd-resumo">
                                    <dt>Arquivo</dt><dd className="rd-arquivo" title={st.saida}>{st.saida}</dd>
                                    <dt>Duração</dt><dd className="num">{M.fmtS(st.duracaoS, 2)}</dd>
                                    {st.tamanhoMb ? <><dt>Tamanho</dt><dd className="num">{String(st.tamanhoMb).replace('.', ',')} MB</dd></> : null}
                                    {st.levouS ? <><dt>Levou</dt><dd className="num">{M.fmtS(st.levouS, 1)}</dd></> : null}
                                    <dt>Motor</dt><dd>{st.motor === 'narrador' ? 'NarradorVideo' : 'ffmpeg (igual à Mesa)'}</dd>
                                </dl>
                                {(st.avisos || []).map((a, i) => <p key={i} className="nota-aviso"><Ico.aviso aria-hidden="true" />{a}</p>)}
                                {desatualizado && <p className="nota-aviso"><Ico.aviso aria-hidden="true" />A edição mudou depois desta montagem. Monte de novo para ver as mudanças.</p>}
                            </div>
                        </div>
                    )}
                    {erro && <p className="nota-erro"><Ico.erro aria-hidden="true" />{erro}</p>}
                </div>
                <footer className="rd-rodape">
                    <span className="rd-nota"><Ico.info aria-hidden="true" />Montar é grátis (ffmpeg local). Nada aqui chama a IA.</span>
                    <button type="button" className="btn fantasma" onClick={fechar}>Fechar</button>
                    <button type="button" className="btn primario" onClick={montar} aria-busy={montando || pedindo} disabled={montando || pedindo}>
                        {(montando || pedindo) && <Girador />}<Ico.montar aria-hidden="true" />{pronto ? 'Montar de novo' : 'Montar'}
                    </button>
                </footer>
            </motion.div>
        </motion.div>,
        document.body,
    );
}
