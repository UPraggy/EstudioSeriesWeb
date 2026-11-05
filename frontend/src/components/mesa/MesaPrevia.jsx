// PRÉVIA 9:16 que toca de verdade: dois <video> alternados (o próximo é pré-carregado e entra no corte certo),
// falas e ambiente agendados no Web Audio pelo relógio, e por cima o texto de tela, a legenda e os cartões A/B
// com as mesmas fontes e posições do render (zona segura de 1080×1920).
import { useEffect, useMemo, useRef, useState } from 'react';
import '../../assets/css/MesaPrevia.css';
import * as M from './mesaUtil';
import { useTempo } from './mesaRelogio';
import { Ico } from '../subComponents/icones';
import { motion, AnimatePresence, MOV } from '../subComponents/Movimento';

function Sobreposicao({ doc, relogio, mostrarLegenda, mostrarZona }) {
    const { t } = useTempo(relogio);
    const G = M.GEOM;
    const textos = M.textoNoTempo(doc, t);
    const leg = mostrarLegenda ? M.legendaNoTempo(doc, t) : null;
    const ab = M.abNoTempo(doc, t);
    const px = (v) => `calc(var(--esc) * ${v}px)`;
    const larguraUtil = G.largura - G.margemL - G.margemR;
    return (
        <div className="pv-sobre" aria-hidden="true">
            {mostrarZona && (
                <div className="pv-zona" style={{ left: px(G.zona.xMin), top: px(G.zona.yMin), width: px(G.zona.xMax - G.zona.xMin), height: px(G.zona.yMax - G.zona.yMin) }} />
            )}
            {textos.map((x) => (
                <div key={x.id} className="pv-tela" style={{ left: px(G.margemL), width: px(larguraUtil), top: px(G.tela.topo), fontSize: px(G.tela.tamanho) }}>
                    {String(x.texto).toUpperCase()}
                </div>
            ))}
            {ab && [['A', ab.A, G.cartao.yA, 0], ['B', ab.B, G.cartao.yB, 0.25]].map(([letra, op, yc, atraso]) => (op && t >= ab.inicioS + atraso ? (
                <div
                    key={letra} className="pv-cartao"
                    style={{ left: px(G.margemL), top: px(yc - G.cartao.altura / 2), width: px(larguraUtil), height: px(G.cartao.altura), gridTemplateColumns: `${px(G.cartao.colunaLetra)} 1fr` }}
                >
                    <span className="pv-cartao-letra" style={{ fontSize: px(G.cartao.letra) }}>{letra}</span>
                    <span className="pv-cartao-texto">
                        <span className="pv-cartao-titulo" style={{ fontSize: px(G.cartao.titulo) }}>{op.texto}</span>
                        {op.detalhe && <span className="pv-cartao-sub" style={{ fontSize: px(G.cartao.sub) }}>{op.detalhe}</span>}
                    </span>
                </div>
            ) : null))}
            {leg && (
                <div className="pv-legenda" style={{ left: px(G.margemL), width: px(larguraUtil), bottom: px(G.altura - G.legenda.base), fontSize: px(G.legenda.tamanho), color: leg.cor }}>
                    {leg.linhas.map((l, i) => <div key={i}>{l}</div>)}
                </div>
            )}
        </div>
    );
}

// Timecode grande (minutos:segundos em destaque, quadros mais apagados), em algarismos tabulares.
function Mostrador({ relogio, fps, duracao }) {
    const { t, tocando, taxa } = useTempo(relogio);
    const tc = M.fmtTimecode(t, fps);
    return (
        <div className="pv-mostrador" aria-label={`Posição ${tc} de ${M.fmtTimecode(duracao, fps)}`}>
            <span className="mono pv-tc" aria-hidden="true">{tc.slice(0, 5)}<span className="pv-tc-q">{tc.slice(5)}</span></span>
            <span className="mono pv-tc-total" aria-hidden="true">{M.fmtTimecode(duracao, fps)}</span>
            {tocando && taxa !== 1 && <span className="pv-taxa num">{taxa > 0 ? `${String(taxa).replace('.', ',')}×` : `−${String(Math.abs(taxa)).replace('.', ',')}×`}</span>}
        </div>
    );
}

// Tocar / pausar: o ícone troca girando um pouco (responde ao clique e às teclas Espaço, J, K, L).
function BotaoTocar({ relogio }) {
    const { tocando } = useTempo(relogio);
    return (
        <button
            type="button" className="pv-tocar" onClick={() => relogio.alternar()}
            title={tocando ? 'Pausar (Espaço ou K)' : 'Tocar (Espaço ou L)'} aria-label={tocando ? 'Pausar' : 'Tocar'} aria-keyshortcuts="Space"
        >
            <AnimatePresence initial={false} mode="popLayout">
                <motion.span
                    key={tocando ? 'pausar' : 'tocar'} className="pv-tocar-ico"
                    initial={{ opacity: 0, scale: 0.5, rotate: -45 }}
                    animate={{ opacity: 1, scale: 1, rotate: 0, transition: MOV.mola }}
                    exit={{ opacity: 0, scale: 0.5, rotate: 45, transition: { duration: 0.1 } }}
                >
                    {tocando ? <Ico.pausar aria-hidden="true" /> : <Ico.tocar aria-hidden="true" />}
                </motion.span>
            </AnimatePresence>
        </button>
    );
}

// Botão de liga/desliga só com ícone (legenda, zona segura, som do clipe)
function Chave({ ligado, aoTrocar, rotulo, icone: Icone, iconeDesligado: IconeDesl }) {
    const Ic = !ligado && IconeDesl ? IconeDesl : Icone;
    return (
        <button type="button" className={`btn mini icone fantasma pv-chave ${ligado ? 'ligado' : ''}`} aria-pressed={ligado} onClick={() => aoTrocar(!ligado)}
            title={`${rotulo}: ${ligado ? 'ligado' : 'desligado'}`} aria-label={rotulo}>
            <Ic aria-hidden="true" />
        </button>
    );
}

export default function MesaPrevia({ serie, doc, relogio, compacta = false }) {
    const caixaRef = useRef(null);
    const palcoRef = useRef(null);
    const vA = useRef(null);
    const vB = useRef(null);
    const imgRef = useRef(null);
    const buracoRef = useRef(null);
    const pedacosRef = useRef([]);
    const somRef = useRef(true);
    const [esc, setEsc] = useState(0.3);
    const [mostrarLegenda, setMostrarLegenda] = useState(true);
    const [mostrarZona, setMostrarZona] = useState(false);
    const [somClipe, setSomClipe] = useState(true);
    const [taxa, setTaxa] = useState(1);
    const fps = doc.fps || 24;
    const duracao = M.duracaoDoc(doc);

    const pedacos = useMemo(() => M.linhaDeVideo(doc, duracao), [doc, duracao]);
    useEffect(() => { pedacosRef.current = pedacos; relogio.avisar(); }, [pedacos, relogio]);
    useEffect(() => { somRef.current = somClipe; relogio.avisar(); }, [somClipe, relogio]);

    // tamanho do palco 9:16 dentro da caixa
    useEffect(() => {
        const caixa = caixaRef.current;
        if (!caixa) return undefined;
        const ajustar = () => {
            const w = caixa.clientWidth - 32;
            const h = caixa.clientHeight - 24;
            const largura = Math.max(120, Math.min(w, (h * 9) / 16));
            if (palcoRef.current) {
                palcoRef.current.style.width = `${Math.round(largura)}px`;
                palcoRef.current.style.height = `${Math.round((largura * 16) / 9)}px`;
            }
            setEsc(largura / 1080);
        };
        ajustar();
        const ro = new ResizeObserver(ajustar);
        ro.observe(caixa);
        return () => ro.disconnect();
    }, []);

    // motor de vídeo: segue o relógio
    useEffect(() => {
        const vids = [vA.current, vB.current];
        const img = imgRef.current;
        if (!vids[0] || !vids[1]) return undefined;
        let ativo = 0;
        const urlDe = (p) => (p && p.arquivo && !M.ehImagem(p.arquivo) ? M.midiaUrl(serie, p.arquivo) : null);
        const carregar = (el, url, tArq) => {
            if (el.dataset.src !== url) {
                el.dataset.src = url;
                el.src = url;
                el.dataset.alvo = String(tArq);
                el.addEventListener('loadedmetadata', function primeiro() {
                    el.removeEventListener('loadedmetadata', primeiro);
                    try { el.currentTime = Number(el.dataset.alvo) || 0; } catch { /* ainda sem dados */ }
                });
            } else if (el.readyState >= 1 && Math.abs(el.currentTime - tArq) > 0.04) {
                try { el.currentTime = tArq; } catch { /* ignora */ }
            }
        };
        const buraco = buracoRef.current;
        const mostrar = (qual) => {
            vids[0].style.opacity = qual === 0 ? '1' : '0';
            vids[1].style.opacity = qual === 1 ? '1' : '0';
            img.style.opacity = qual === 'img' ? '1' : '0';
            if (buraco) buraco.hidden = qual !== null;
        };
        const tick = (t, tocando, taxaAtual) => {
            const ps = pedacosRef.current;
            if (!ps.length) { mostrar(null); return; }
            let i = ps.findIndex((p) => t >= p.inicioS - 1e-4 && t < p.inicioS + p.duracaoS - 1e-4);
            if (i < 0) i = ps.length - 1;
            const p = ps[i];
            const outroDe = (k) => vids[1 - k];
            if (!p.arquivo) {
                mostrar(null);
                vids.forEach((v) => { if (!v.paused) v.pause(); });
            } else if (M.ehImagem(p.arquivo)) {
                const u = M.midiaUrl(serie, p.arquivo);
                if (img.dataset.src !== u) { img.dataset.src = u; img.src = u; }
                mostrar('img');
                vids.forEach((v) => { if (!v.paused) v.pause(); });
            } else {
                const url = urlDe(p);
                const tArq = (Number(p.entradaS) || 0) + (t - p.inicioS);
                let el = vids[ativo];
                if (el.dataset.src !== url) {
                    const outro = outroDe(ativo);
                    if (outro.dataset.src === url) {
                        el.pause();
                        el.muted = true;
                        ativo = 1 - ativo;
                        el = outro;
                    } else {
                        carregar(el, url, tArq);
                    }
                }
                mostrar(ativo);
                el.muted = !somRef.current || Boolean(p.mudo) || !tocando || taxaAtual <= 0;
                el.volume = M.limitar(Number(p.volume ?? 0.6), 0, 1);
                if (tocando && taxaAtual > 0) {
                    if (Math.abs(el.playbackRate - taxaAtual) > 0.01) el.playbackRate = taxaAtual;
                    if (el.readyState >= 2 && Math.abs(el.currentTime - tArq) > 0.15) { try { el.currentTime = tArq; } catch { /* */ } }
                    if (el.paused) el.play().catch(() => {});
                } else {
                    if (!el.paused) el.pause();
                    if (el.readyState >= 1 && !el.seeking && Math.abs(el.currentTime - tArq) > 0.5 / fps) { try { el.currentTime = tArq; } catch { /* */ } }
                }
                const outro = outroDe(ativo);
                if (!outro.paused) outro.pause();
                // pré-carrega o próximo corte no outro <video>
                const q = ps.slice(i + 1).find((x) => x.arquivo) || null;
                const qurl = urlDe(q);
                if (qurl && qurl !== url && q.inicioS - t < 2.5) carregar(outro, qurl, Number(q.entradaS) || 0);
            }
        };
        const off = relogio.on(tick);
        tick(relogio.agora(), relogio.tocando, relogio.taxa);
        return off;
    }, [relogio, serie, fps]);

    const mudarTaxa = (v) => {
        setTaxa(v);
        if (relogio.tocando) relogio.mudarTaxa(v);
        else relogio.taxa = v;
    };

    return (
        <section className={`pv ${compacta ? 'compacta' : ''}`} aria-label="Prévia">
            <div className="pv-caixa" ref={caixaRef}>
                <div className="pv-palco" ref={palcoRef} style={{ '--esc': esc }}>
                    <video ref={vA} className="pv-video" playsInline muted preload="auto" />
                    <video ref={vB} className="pv-video" playsInline muted preload="auto" />
                    <img ref={imgRef} className="pv-video pv-img" alt="Imagem parada do plano no cursor" />
                    <div className="pv-buraco" ref={buracoRef} hidden>
                        <Ico.video aria-hidden="true" />
                        <span>Sem vídeo neste ponto</span>
                    </div>
                    <Sobreposicao doc={doc} relogio={relogio} mostrarLegenda={mostrarLegenda} mostrarZona={mostrarZona} />
                </div>
            </div>
            <div className="pv-controles">
                <Mostrador relogio={relogio} fps={fps} duracao={duracao} />
                <div className="pv-transporte" role="group" aria-label="Transporte">
                    <button type="button" className="pv-btn" onClick={() => relogio.ir(0)} title="Início (Home)" aria-label="Ir para o início" aria-keyshortcuts="Home">
                        <Ico.inicio aria-hidden="true" />
                    </button>
                    <button type="button" className="pv-btn" onClick={() => relogio.passo(-1 / fps)} title="Quadro anterior (←; Shift+← volta 1 s)" aria-label="Quadro anterior" aria-keyshortcuts="ArrowLeft">
                        <Ico.quadroAnterior aria-hidden="true" />
                    </button>
                    <BotaoTocar relogio={relogio} />
                    <button type="button" className="pv-btn" onClick={() => relogio.passo(1 / fps)} title="Quadro seguinte (→; Shift+→ avança 1 s)" aria-label="Quadro seguinte" aria-keyshortcuts="ArrowRight">
                        <Ico.quadroSeguinte aria-hidden="true" />
                    </button>
                    <button type="button" className="pv-btn" onClick={() => relogio.ir(relogio.duracao)} title="Fim (End)" aria-label="Ir para o fim" aria-keyshortcuts="End">
                        <Ico.fim aria-hidden="true" />
                    </button>
                </div>
                {!compacta ? (
                    <div className="pv-opcoes">
                        <label className="pv-vel" title="Velocidade da prévia (J e L também mudam)">
                            <Ico.velocidade aria-hidden="true" />
                            <select className="pv-sel" value={taxa} onChange={(e) => mudarTaxa(Number(e.target.value))} aria-label="Velocidade">
                                {[0.5, 1, 1.5, 2].map((v) => <option key={v} value={v}>{String(v).replace('.', ',')}×</option>)}
                            </select>
                        </label>
                        <Chave ligado={mostrarLegenda} aoTrocar={setMostrarLegenda} rotulo="Legenda" icone={Ico.legenda} />
                        <Chave ligado={mostrarZona} aoTrocar={setMostrarZona} rotulo="Zona segura" icone={Ico.zonaSegura} />
                        <Chave ligado={somClipe} aoTrocar={setSomClipe} rotulo="Som do clipe" icone={Ico.volume} iconeDesligado={Ico.mudo} />
                    </div>
                ) : <span className="pv-opcoes" />}
            </div>
        </section>
    );
}
