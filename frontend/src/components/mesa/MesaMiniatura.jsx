// MINIATURA QUE "ESFREGA" (scrub): pôster 9:16 de um clipe. Passar o mouse por cima percorre os quadros do clipe,
// com uma barrinha de posição e o tempo no canto. Os quadros vêm da rota MiniaturasClipe (uma imagem com N quadros
// lado a lado, cache no servidor) e só são pedidos quando o pôster aparece na tela. Imagem (referência) aparece
// inteira, sem esfregar. O pôster preenche a caixa como object-fit: cover (vídeo deitado também fica bem).
import { useEffect, useRef, useState } from 'react';
import '../../assets/css/MesaMiniatura.css';
import * as M from './mesaUtil';
import { useMiniaturas } from './mesaMidia';
import { Ico } from '../subComponents/icones';

const ALTURA_TIRA = 240; // px de cada quadro na tira (o máximo da rota): nítido num pôster de ~120 px de largura

// true depois que o elemento chega perto da área visível (uma vez só)
function useVisivel(ref) {
    const [visivel, setVisivel] = useState(false);
    useEffect(() => {
        const el = ref.current;
        if (!el || visivel) return undefined;
        if (typeof IntersectionObserver === 'undefined') { setVisivel(true); return undefined; }
        const io = new IntersectionObserver((ents) => {
            if (ents.some((e) => e.isIntersecting)) { setVisivel(true); io.disconnect(); }
        }, { rootMargin: '160px' });
        io.observe(el);
        return () => io.disconnect();
    }, [ref, visivel]);
    return visivel;
}

function useTamanho(ref) {
    const [tam, setTam] = useState(null);
    useEffect(() => {
        const el = ref.current;
        if (!el) return undefined;
        const medir = () => setTam((t) => (t && t.w === el.clientWidth && t.h === el.clientHeight ? t : { w: el.clientWidth, h: el.clientHeight }));
        medir();
        const ro = new ResizeObserver(medir);
        ro.observe(el);
        return () => ro.disconnect();
    }, [ref]);
    return tam;
}

export default function MesaMiniatura({
    serie, arquivo, duracaoS, rotulo = '', className = '', quadroInicial = 1 / 3, mostrarDuracao = false, esfregar = true, children,
}) {
    const ref = useRef(null);
    const visivel = useVisivel(ref);
    const tam = useTamanho(ref);
    const imagem = M.ehImagem(arquivo);
    const mini = useMiniaturas(serie, visivel && arquivo && !imagem ? arquivo : null, ALTURA_TIRA);
    const [pos, setPos] = useState(null); // 0..1 enquanto o mouse está em cima
    const n = mini && mini.n ? mini.n : 0;
    const base = n ? Math.min(n - 1, Math.floor(n * quadroInicial)) : 0;
    const idx = pos === null ? base : Math.min(n - 1, Math.floor(pos * n));
    const dur = Number(duracaoS) || (mini && mini.duracaoS) || 0;

    let estilo = null;
    if (n && tam && tam.w && mini.larguraQuadro && mini.alturaQuadro) {
        const esc = Math.max(tam.w / mini.larguraQuadro, tam.h / mini.alturaQuadro);
        const qw = mini.larguraQuadro * esc;
        const qh = mini.alturaQuadro * esc;
        estilo = {
            backgroundImage: `url("${M.midiaUrl(serie, mini.arquivo)}")`,
            backgroundSize: `${n * qw}px ${qh}px`,
            backgroundPosition: `${-(idx * qw) + (tam.w - qw) / 2}px ${(tam.h - qh) / 2}px`,
        };
    }

    const mover = (e) => {
        if (!esfregar || !n || e.pointerType === 'touch') return;
        const r = e.currentTarget.getBoundingClientRect();
        setPos(M.limitar((e.clientX - r.left) / Math.max(1, r.width), 0, 0.9999));
    };

    let midia;
    if (imagem) midia = <img className="mm-midia" src={M.midiaUrl(serie, arquivo)} alt={rotulo} draggable={false} loading="lazy" />;
    else if (estilo) midia = <div className="mm-midia mm-quadro" style={estilo} role="img" aria-label={rotulo || 'Miniatura do clipe'} />;
    else if (mini && mini.erro) midia = <div className="mm-midia mm-falhou" title={`Sem miniatura: ${mini.erro}`}><Ico.video aria-hidden="true" /></div>;
    else midia = <span className="mm-midia esqueleto" aria-hidden="true" />;

    return (
        <div
            ref={ref}
            className={`mm ${pos !== null ? 'esfregando' : ''} ${className}`}
            onPointerMove={mover}
            onPointerLeave={() => setPos(null)}
        >
            {midia}
            {pos !== null && <span className="mm-barra" style={{ transform: `scaleX(${pos})` }} aria-hidden="true" />}
            {mostrarDuracao && dur > 0 && (
                <span className="mm-dur num" aria-hidden={pos !== null}>{pos !== null ? M.fmtS(pos * dur, 1) : M.fmtS(dur, 1)}</span>
            )}
            {children}
        </div>
    );
}
