// LINHA DO TEMPO: régua com zoom (suave), cursor vermelho (arrastar = percorrer), faixas Vídeo · Narração · Falas por
// personagem · Rádio/efeito · Ambiente · Texto · Legenda · A/B, cada uma com ícone e a cor do personagem.
// Clipes com miniaturas e forma de onda; aparar pelas bordas, mover pela alça (vídeo grava em modo "sobrescrever"),
// imã nas bordas, nos planos e nas PALAVRAS das falas (botão Imã, ou Alt enquanto arrasta), soltar do acervo,
// e seleção de trecho arrastando na régua. A duração é LIVRE: o zoom inicial cabe o episódio inteiro na largura.
// Uma só caixa de rolagem: régua presa no topo, nomes das faixas presos à esquerda.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { animate, useReducedMotion } from 'framer-motion';
import '../../assets/css/MesaLinhaTempo.css';
import * as M from './mesaUtil';
import { useMiniaturas, useOnda } from './mesaMidia';
import { Ico } from '../subComponents/icones';
import { motion, AnimatePresence, MOV } from '../subComponents/Movimento';

const CAB = 148; // coluna dos nomes
const PAD = 12;
const BORDA = 7;
const IMA_PX = 8;
const PASSOS_REGUA = [0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120];

const ICONE_FAIXA = {
    video: Ico.video, narracao: Ico.narracao, falas: Ico.voz, efeitos: Ico.efeito, ambiente: Ico.ambiente,
    texto: Ico.texto, legenda: Ico.legenda, ab: Ico.escolha,
};

// Atalhos (painel "Atalhos do teclado" e a tecla ?)
export const ATALHOS = [
    [['Espaço'], 'Tocar / pausar'],
    [['J', 'K', 'L'], 'Voltar, pausar, avançar (repita para acelerar)'],
    [['←', '→'], 'Quadro anterior / seguinte (Shift: 1 s)'],
    [['Home', 'End'], 'Início / fim'],
    [['I', 'O'], 'Marcar começo / fim do trecho'],
    [['S'], 'Dividir no cursor'],
    [['Del'], 'Remover o clipe selecionado'],
    [['Ctrl', 'Z'], 'Desfazer'],
    [['Ctrl', 'Shift', 'Z'], 'Refazer'],
    [['+', '−'], 'Zoom (Ctrl + roda: no ponto do mouse)'],
    [['Alt'], 'Arrastar sem imã'],
    [['Esc'], 'Limpar trecho e seleção'],
    [['?'], 'Mostrar estes atalhos'],
];

function Miniaturas({ serie, it, pps, alto }) {
    const mini = useMiniaturas(serie, it.arquivo, 96);
    const w = Math.max(1, it.duracaoS * pps);
    if (M.ehImagem(it.arquivo)) {
        return <div className="lt-mini-img" style={{ backgroundImage: `url("${M.midiaUrl(serie, it.arquivo)}")`, backgroundSize: `auto ${alto}px` }} />;
    }
    if (!mini || mini.erro || !mini.n) return null;
    const tileW = (mini.larguraQuadro * alto) / mini.alturaQuadro;
    const qtd = Math.min(160, Math.ceil(w / tileW));
    const url = M.midiaUrl(serie, mini.arquivo);
    const tiles = [];
    for (let k = 0; k < qtd; k++) {
        const x = k * tileW;
        const tMeio = (Number(it.entradaS) || 0) + (x + tileW / 2) / pps;
        const idx = M.limitar(Math.floor((tMeio / Math.max(0.1, mini.duracaoS)) * mini.n), 0, mini.n - 1);
        tiles.push(
            <div
                key={k} className="lt-mini"
                style={{ left: x, width: Math.ceil(tileW), height: alto, backgroundImage: `url("${url}")`, backgroundSize: `${mini.n * tileW}px ${alto}px`, backgroundPosition: `${-idx * tileW}px 0` }}
            />,
        );
    }
    return <div className="lt-minis">{tiles}</div>;
}

function Onda({ serie, it, pps, alto, cor }) {
    const onda = useOnda(serie, it.arquivo);
    const ref = useRef(null);
    const w = Math.max(1, Math.round(it.duracaoS * pps));
    useEffect(() => {
        const c = ref.current;
        if (!c || !onda || !onda.picos || !onda.picos.length) return;
        const dpr = window.devicePixelRatio || 1;
        const W = Math.min(w, 8000);
        c.width = Math.round(W * dpr);
        c.height = Math.round(alto * dpr);
        c.style.width = `${W}px`;
        c.style.height = `${alto}px`;
        const g = c.getContext('2d');
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.clearRect(0, 0, W, alto);
        g.fillStyle = M.rgba(cor, 0.62);
        const meio = alto / 2;
        const ps = onda.porSegundo || 100;
        const sPorPx = it.duracaoS / W;
        for (let x = 0; x < W; x++) {
            const t0 = (Number(it.entradaS) || 0) + x * sPorPx;
            const a = Math.floor(t0 * ps);
            const b = Math.max(a + 1, Math.floor((t0 + sPorPx) * ps));
            let max = 0;
            for (let k = a; k < b && k < onda.picos.length; k++) if (onda.picos[k] > max) max = onda.picos[k];
            const h = Math.max(0.5, max * (alto - 8) * 0.5);
            g.fillRect(x, meio - h, 1, h * 2);
        }
    }, [onda, w, alto, cor, it.entradaS, it.duracaoS]);
    if (!it.arquivo || !onda || !onda.picos || !onda.picos.length) return null; // a onda entra (com fade) quando chega
    return <canvas ref={ref} className="lt-onda" aria-hidden="true" />;
}

// Cursor: cabeça na régua + linha nas faixas, movidos direto no DOM (sem renderizar a linha do tempo inteira).
// Parado, o cursor desliza até o ponto novo (classe "pula"); tocando, arrastando ou no zoom, segue sem atraso.
function useCursor({ relogio, pps, fps, rolagemRef, refs, tcRef, arrastandoRef, zoomAnimandoRef }) {
    useEffect(() => relogio.on((t, tocando) => {
        const x = CAB + PAD + t * pps;
        const pula = !tocando && !arrastandoRef.current && !zoomAnimandoRef.current;
        for (const r of refs) {
            if (!r.current) continue;
            r.current.classList.toggle('pula', pula);
            r.current.style.transform = `translateX(${x}px)`;
        }
        if (arrastandoRef.current && tcRef.current) tcRef.current.textContent = M.fmtTimecode(t, fps);
        const s = rolagemRef.current;
        if (s && tocando && (x > s.scrollLeft + s.clientWidth - 40 || x < s.scrollLeft + CAB)) s.scrollLeft = Math.max(0, x - CAB - 80);
        // a cabeça não pode cobrir a coluna dos nomes quando a régua rola para a direita
        if (s && refs[0].current) refs[0].current.style.visibility = x < s.scrollLeft + CAB - 1 ? 'hidden' : 'visible';
    }), [relogio, pps, fps, rolagemRef, refs, tcRef, arrastandoRef, zoomAnimandoRef]);
    useEffect(() => {
        relogio.avisar();
        const s = rolagemRef.current;
        if (!s) return undefined;
        const rolou = () => { if (!relogio.tocando) relogio.avisar(); };
        s.addEventListener('scroll', rolou, { passive: true });
        return () => s.removeEventListener('scroll', rolou);
    }, [pps, relogio, rolagemRef]);
}

function rotuloDe(faixa, it) {
    if (faixa === 'video') {
        if (it.origem === 'take') return `${String(it.take || 'take').replace('_', ' ')} · ${it.descricao || 'regerado'}`;
        return it.descricao || M.nomeArquivo(it.arquivo);
    }
    if (faixa === 'texto') return it.texto;
    if (faixa === 'legenda') return (it.linhas || []).join(' / ');
    if (faixa === 'ab') return `A: ${it.A ? it.A.texto : ''}  ·  B: ${it.B ? it.B.texto : ''}`;
    if (faixa === 'ambiente') return `${it.nome || 'Ambiente'} · ${Math.round((Number(it.volume) || 0) * 100)}%`;
    return it.texto || M.nomeArquivo(it.arquivo);
}

const ehAudio = (f) => M.FAIXAS_AUDIO.includes(f);

// cursor do mouse na página inteira enquanto arrasta (assim não "pisca" ao passar por outros elementos)
const cursorDaPagina = (modo) => {
    if (modo) document.body.dataset.mesaArrasto = modo;
    else delete document.body.dataset.mesaArrasto;
};

function PainelAtalhos({ fechar }) {
    const ref = useRef(null);
    useEffect(() => {
        const fora = (e) => { if (ref.current && !ref.current.contains(e.target) && !e.target.closest('.lt-btn-atalhos')) fechar(); };
        document.addEventListener('pointerdown', fora);
        return () => document.removeEventListener('pointerdown', fora);
    }, [fechar]);
    return (
        <motion.div
            ref={ref} className="lt-atalhos" role="dialog" aria-label="Atalhos do teclado"
            initial={{ opacity: 0, y: 6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: MOV.rapido, ease: MOV.enfatico } }}
            exit={{ opacity: 0, y: 4, transition: { duration: 0.1 } }}
        >
            <div className="lt-atalhos-cab">
                <strong><Ico.teclado aria-hidden="true" />Atalhos do teclado</strong>
                <button type="button" className="btn mini icone fantasma" onClick={fechar} aria-label="Fechar os atalhos" title="Fechar (Esc)"><Ico.fechar aria-hidden="true" /></button>
            </div>
            <dl>
                {ATALHOS.map(([teclas, o]) => (
                    <div key={o} className="lt-atalho">
                        <dt>{teclas.map((k) => <kbd key={k}>{k}</kbd>)}</dt>
                        <dd>{o}</dd>
                    </div>
                ))}
            </dl>
        </motion.div>
    );
}

export default function MesaLinhaTempo({
    serie, doc, relogio, zoom, setZoom, zoomInfoRef, selecao, setSelecao, trecho, setTrecho, aplicar, regeracoes = [],
    onDividir, onRemover, atalhos, setAtalhos,
}) {
    const rolagemRef = useRef(null);
    const conteudoRef = useRef(null);
    const cabecaRef = useRef(null);
    const linhaRef = useRef(null);
    const tcRef = useRef(null);
    const arrastandoRef = useRef(false);
    const zoomAnimandoRef = useRef(false);
    const imediatoRef = useRef(true);
    const ancoraRef = useRef(null);
    const zoomRef = useRef(zoom);
    zoomRef.current = zoom;
    const cursorRefs = useMemo(() => [cabecaRef, linhaRef], []);
    const [larguraVisivel, setLarguraVisivel] = useState(900);
    const [arrasto, setArrasto] = useState(null);
    const [guia, setGuia] = useState(null);
    const [soltarEm, setSoltarEm] = useState(null);
    const [ima, setIma] = useState(true);
    const [entrada, setEntrada] = useState(true);
    const imaRef = useRef(ima);
    imaRef.current = ima;
    const reduzido = useReducedMotion();
    const fps = doc.fps || 24;
    const lanes = useMemo(() => M.lanesDe(doc), [doc]);
    const duracao = M.duracaoDoc(doc);
    const alvo = M.alvoDe(doc);
    const base = Math.max(alvo, duracao, 0.5);
    const visivel = base + Math.max(0.5, base * 0.04);

    // entrada em cascata dos clipes: só na primeira carga
    useEffect(() => {
        const id = setTimeout(() => setEntrada(false), 1100);
        return () => clearTimeout(id);
    }, []);

    useLayoutEffect(() => {
        const el = rolagemRef.current;
        if (!el) return undefined;
        let ultima = -1;
        const medir = () => {
            const w = el.clientWidth;
            if (w === ultima) return; // o ResizeObserver avisa na primeira observação mesmo sem mudar
            ultima = w;
            if (!zoomRef.current) imediatoRef.current = true; // caber na largura acompanha a janela sem animar
            setLarguraVisivel(w);
        };
        const ro = new ResizeObserver(medir);
        ro.observe(el);
        medir();
        return () => ro.disconnect();
    }, []);

    const ajustado = Math.max(0.5, (larguraVisivel - CAB - PAD * 2 - 4) / visivel);
    const zMin = Math.max(0.5, Math.min(3, ajustado / 2));
    const zMax = Math.max(600, ajustado * 4);
    const alvoPps = M.limitar(zoom || ajustado, zMin, zMax);
    if (zoomInfoRef) zoomInfoRef.current = { pps: alvoPps, min: zMin, max: zMax };

    // ---------- zoom suave: o px/s mostrado corre até o alvo, mantendo o cursor (ou o centro) no lugar ----------
    const [pps, setPps] = useState(alvoPps);
    const ppsRef = useRef(alvoPps);
    // layout effect: mudança imediata (janela, roda) entra antes de pintar, sem um quadro com o zoom velho
    useLayoutEffect(() => {
        const de = ppsRef.current;
        if (Math.abs(de - alvoPps) < 1e-3) { ancoraRef.current = null; return undefined; }
        const s = rolagemRef.current;
        if (!ancoraRef.current && s) {
            const tc = relogio.agora();
            const xc = CAB + PAD + tc * de - s.scrollLeft;
            if (xc >= CAB && xc <= s.clientWidth) ancoraRef.current = { t: tc, x: xc };
            else {
                const x = CAB + (s.clientWidth - CAB) / 2;
                ancoraRef.current = { t: Math.max(0, (s.scrollLeft + x - CAB - PAD) / de), x };
            }
        }
        if (imediatoRef.current || reduzido) {
            imediatoRef.current = false;
            ppsRef.current = alvoPps;
            setPps(alvoPps);
            return undefined;
        }
        zoomAnimandoRef.current = true;
        const c = animate(de, alvoPps, {
            duration: MOV.base, ease: MOV.enfatico,
            onUpdate: (v) => { ppsRef.current = v; setPps(v); },
            onComplete: () => { zoomAnimandoRef.current = false; ancoraRef.current = null; },
        });
        return () => { c.stop(); zoomAnimandoRef.current = false; };
    }, [alvoPps, relogio, reduzido]);

    useLayoutEffect(() => {
        const s = rolagemRef.current;
        const a = ancoraRef.current;
        if (!s || !a) return;
        s.scrollLeft = Math.max(0, CAB + PAD + a.t * pps - a.x);
        if (!zoomAnimandoRef.current) ancoraRef.current = null;
    }, [pps]);

    const larguraPista = PAD * 2 + visivel * pps;
    useCursor({ relogio, pps, fps, rolagemRef, refs: cursorRefs, tcRef, arrastandoRef, zoomAnimandoRef });

    const tempoDoX = useCallback((clientX) => {
        const r = conteudoRef.current.getBoundingClientRect();
        return Math.max(0, (clientX - r.left - CAB - PAD) / pps);
    }, [pps]);

    const mudarZoom = useCallback((novo, imediato = false) => {
        imediatoRef.current = imediato;
        setZoom(M.limitar(novo, zMin, zMax));
    }, [setZoom, zMin, zMax]);

    // zoom com Ctrl + roda, mantendo o ponto sob o mouse (imediato: a roda já é contínua)
    useEffect(() => {
        const el = rolagemRef.current;
        if (!el) return undefined;
        const roda = (e) => {
            if (!e.ctrlKey && !e.metaKey) return;
            e.preventDefault();
            const r = el.getBoundingClientRect();
            ancoraRef.current = { t: tempoDoX(e.clientX), x: e.clientX - r.left };
            mudarZoom(ppsRef.current * (e.deltaY < 0 ? 1.25 : 0.8), true);
        };
        el.addEventListener('wheel', roda, { passive: false });
        return () => el.removeEventListener('wheel', roda);
    }, [mudarZoom, tempoDoX]);

    const irAoCursor = () => {
        const s = rolagemRef.current;
        if (!s) return;
        const x = CAB + PAD + relogio.agora() * pps;
        s.scrollTo({ left: Math.max(0, x - CAB - (s.clientWidth - CAB) / 2), behavior: reduzido ? 'auto' : 'smooth' });
    };

    // faixa do zoom em escala logarítmica
    const lnMin = Math.log(zMin);
    const lnMax = Math.log(zMax);
    const valorFaixa = Math.round(((Math.log(alvoPps) - lnMin) / (lnMax - lnMin)) * 1000);

    const confirmarMudanca = (faixa, orig, novo) => {
        const d = M.clonar(doc);
        if (faixa === 'legenda') {
            d.legenda = d.legenda.map((b) => (b.id === novo.id ? { ...b, ini: M.arred(novo.inicioS, 2), fim: M.arred(novo.inicioS + novo.duracaoS, 2), manual: true } : b));
        } else if (faixa === 'video') {
            d.faixas.video = M.sobrescreverVideo(d.faixas.video, { ...novo });
        } else {
            d.faixas[faixa] = d.faixas[faixa].map((x) => (x.id === novo.id ? { ...novo } : x));
            if (ehAudio(faixa)) d.legenda = M.acompanharLegenda(d.legenda, novo, orig);
        }
        aplicar(d);
    };

    // ---------- arrastar clipes (mover / aparar) ----------
    const iniciarArrasto = (e, faixa, it) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        setSelecao({ faixa, id: it.id });
        const r = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - r.left;
        const temFonte = (faixa === 'video' && !M.ehImagem(it.arquivo) && Number(it.duracaoArquivoS) > 0) || (ehAudio(faixa) && Number(it.duracaoArquivoS) > 0);
        let modo = 'mover';
        if (r.width > BORDA * 3) {
            if (x < BORDA) modo = 'ini';
            else if (x > r.width - BORDA) modo = 'fim';
        }
        const pontos = M.pontosIma(doc, it.id, relogio.agora());
        const orig = { ...it };
        const x0 = e.clientX;
        let moveu = false;
        let atual = orig;
        const tol = IMA_PX / pps;
        const q = (v) => M.noQuadro(v, fps);
        const fim0 = orig.inicioS + orig.duracaoS;
        const mover = (ev) => {
            if (!moveu && Math.abs(ev.clientX - x0) < 3) return;
            if (!moveu) cursorDaPagina(modo === 'mover' ? 'mover' : 'aparar');
            moveu = true;
            const dx = (ev.clientX - x0) / pps;
            const semIma = ev.altKey || !imaRef.current;
            const n = { ...orig };
            let g = null;
            if (modo === 'mover') {
                let ini = orig.inicioS + dx;
                if (!semIma) {
                    const a = M.imantar(ini, pontos, tol);
                    const b = M.imantar(ini + orig.duracaoS, pontos, tol);
                    if (a !== null && (b === null || Math.abs(a - ini) <= Math.abs(b - (ini + orig.duracaoS)))) { ini = a; g = a; } else if (b !== null) { ini = b - orig.duracaoS; g = b; }
                }
                n.inicioS = Math.max(0, g !== null ? ini : q(ini));
            } else if (modo === 'ini') {
                let ini = orig.inicioS + dx;
                if (!semIma) { const a = M.imantar(ini, pontos, tol); if (a !== null) { ini = a; g = a; } }
                if (g === null) ini = q(ini);
                const minimo = temFonte ? orig.inicioS - (Number(orig.entradaS) || 0) : 0;
                ini = M.limitar(ini, Math.max(0, minimo), fim0 - 1 / fps);
                n.inicioS = ini;
                n.duracaoS = M.arred(fim0 - ini);
                if (orig.entradaS !== undefined && orig.entradaS !== null) n.entradaS = M.arred(Math.max(0, (Number(orig.entradaS) || 0) + (ini - orig.inicioS)));
            } else {
                let fim = fim0 + dx;
                if (!semIma) { const b = M.imantar(fim, pontos, tol); if (b !== null) { fim = b; g = b; } }
                if (g === null) fim = q(fim);
                const maximo = temFonte ? orig.inicioS + (Number(orig.duracaoArquivoS) - (Number(orig.entradaS) || 0)) : Infinity;
                fim = M.limitar(fim, orig.inicioS + 1 / fps, maximo);
                n.duracaoS = M.arred(fim - orig.inicioS);
            }
            n.inicioS = M.arred(n.inicioS);
            atual = n;
            setGuia(g);
            setArrasto({ id: it.id, faixa, item: n, modo });
        };
        const soltar = () => {
            window.removeEventListener('pointermove', mover);
            window.removeEventListener('pointerup', soltar);
            cursorDaPagina(null);
            setGuia(null);
            setArrasto(null);
            if (!moveu) return;
            if (Math.abs(atual.inicioS - orig.inicioS) < 1e-4 && Math.abs(atual.duracaoS - orig.duracaoS) < 1e-4) return;
            confirmarMudanca(faixa, orig, atual);
        };
        window.addEventListener('pointermove', mover);
        window.addEventListener('pointerup', soltar);
    };

    // ---------- régua: clique = cursor; arrastar = seleção de trecho ----------
    const naRegua = (e) => {
        if (e.button !== 0) return;
        const pontos = M.pontosIma(doc, null, null);
        const tol = IMA_PX / pps;
        const ima2 = (t, ev) => (ev.altKey || !imaRef.current ? M.noQuadro(t, fps) : (M.imantar(t, pontos, tol) ?? M.noQuadro(t, fps)));
        const t0 = tempoDoX(e.clientX);
        const x0 = e.clientX;
        let moveu = false;
        const mover = (ev) => {
            if (!moveu && Math.abs(ev.clientX - x0) < 4) return;
            if (!moveu) cursorDaPagina('trecho');
            moveu = true;
            const t = tempoDoX(ev.clientX);
            const a = ima2(Math.min(t0, t), ev);
            const b = Math.min(ima2(Math.max(t0, t), ev), duracao);
            setTrecho(b - a >= 1 / fps ? { de: M.arred(a), ate: M.arred(b) } : null);
        };
        const soltar = () => {
            window.removeEventListener('pointermove', mover);
            window.removeEventListener('pointerup', soltar);
            cursorDaPagina(null);
            if (!moveu) {
                relogio.ir(Math.min(duracao, M.noQuadro(t0, fps)));
                setTrecho(null);
            }
        };
        window.addEventListener('pointermove', mover);
        window.addEventListener('pointerup', soltar);
    };

    // cabeça do cursor: arrastar = percorrer (scrub), com o timecode ao lado
    const arrastarCursor = (e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        e.preventDefault();
        const tocava = relogio.tocando;
        if (tocava) relogio.pausar();
        arrastandoRef.current = true;
        cabecaRef.current?.classList.add('arrastando');
        cursorDaPagina('percorrer');
        relogio.avisar();
        const mover = (ev) => relogio.ir(Math.min(duracao, M.noQuadro(tempoDoX(ev.clientX), fps)));
        const soltar = () => {
            window.removeEventListener('pointermove', mover);
            window.removeEventListener('pointerup', soltar);
            arrastandoRef.current = false;
            cabecaRef.current?.classList.remove('arrastando');
            cursorDaPagina(null);
            if (tocava) relogio.tocar(1);
        };
        window.addEventListener('pointermove', mover);
        window.addEventListener('pointerup', soltar);
    };

    const noFundo = (e) => {
        if (e.button !== 0 || e.target !== e.currentTarget) return;
        relogio.ir(Math.min(duracao, M.noQuadro(tempoDoX(e.clientX), fps)));
        setSelecao(null);
    };

    // ---------- soltar do acervo (faixa de vídeo) ----------
    const aoArrastarSobre = (lane) => (e) => {
        if (lane.faixa !== 'video' || !Array.from(e.dataTransfer.types || []).includes('application/x-mesa')) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        setSoltarEm({ lane: lane.id, t: tempoDoX(e.clientX) });
    };
    const aoSoltar = (lane) => (e) => {
        setSoltarEm(null);
        if (lane.faixa !== 'video') return;
        let dados;
        try { dados = JSON.parse(e.dataTransfer.getData('application/x-mesa')); } catch { return; }
        if (!dados || !dados.arquivo) return;
        e.preventDefault();
        let t = tempoDoX(e.clientX);
        t = (imaRef.current ? M.imantar(t, M.pontosIma(doc, null, relogio.agora()), IMA_PX / pps) : null) ?? M.noQuadro(t, fps);
        const imagem = M.ehImagem(dados.arquivo);
        const dur = imagem ? 3 : Math.min(Number(dados.duracaoS) || 4, 4);
        const item = {
            id: M.novoId('v'), plano: M.planoNoTempo(doc, t + 0.01), arquivo: dados.arquivo, inicioS: M.arred(t), duracaoS: M.arred(M.noQuadro(dur, fps)),
            entradaS: 0, duracaoArquivoS: imagem ? null : Number(dados.duracaoS) || null, origem: imagem ? 'quadro' : (dados.origem || 'acervo'),
            mudo: Boolean(dados.mudo), volume: 0.6, descricao: dados.descricao || M.nomeArquivo(dados.arquivo), ...(dados.take ? { take: dados.take } : {}),
        };
        const d = M.clonar(doc);
        d.faixas.video = M.sobrescreverVideo(d.faixas.video, item);
        setSelecao({ faixa: 'video', id: item.id });
        aplicar(d);
    };

    // ---------- desenho ----------
    const limites = useMemo(() => M.limitesPlanos(doc), [doc]);
    const passo = PASSOS_REGUA.find((c) => c * pps >= 44) || PASSOS_REGUA.at(-1);
    const todosComRotulo = pps * passo >= 70;
    const passoRotulo = todosComRotulo ? passo : passo * 2;
    const casasRegua = passoRotulo < 0.5 ? 2 : passoRotulo < 1 ? 1 : 0;
    const marcas = [];
    for (let k = 0; k * passo <= visivel + 1e-9; k++) marcas.push(M.arred(k * passo));
    const comQuadros = pps >= 160;
    const novos = new Set(regeracoes.filter((r) => r.status === 'pronto').map((r) => r.segmento));
    const pendentes = regeracoes.filter((r) => r.status === 'gerando');
    const selItem = selecao && selecao.faixa === 'video' ? (doc.faixas.video || []).find((v) => v.id === selecao.id) : null;
    const planoSel = selItem ? selItem.plano : null;
    const xDe = (t) => PAD + t * pps;
    const fecharAtalhos = useCallback(() => setAtalhos(false), [setAtalhos]);

    return (
        <section className="lt" aria-label="Linha do tempo">
            <div className="lt-barra">
                <div className="lt-grupo">
                    <button type="button" className="btn mini" onClick={onDividir} title="Dividir no cursor (S)" aria-keyshortcuts="S">
                        <Ico.cortar aria-hidden="true" />Dividir
                    </button>
                    <button type="button" className="btn mini icone" onClick={onRemover} disabled={!selecao} title="Remover o clipe selecionado (Del)" aria-label="Remover o clipe selecionado" aria-keyshortcuts="Delete">
                        <Ico.apagar aria-hidden="true" />
                    </button>
                    <span className="lt-sep" aria-hidden="true" />
                    <button
                        type="button" className={`btn mini lt-chave ${ima ? 'ligado' : ''}`} aria-pressed={ima} onClick={() => setIma((v) => !v)}
                        title="Imã: encaixa nas bordas, nos planos e nas palavras das falas (Alt desliga enquanto arrasta)"
                    >
                        <Ico.imantar aria-hidden="true" />Imã
                    </button>
                </div>

                <div className="lt-info" aria-live="polite">
                    {trecho ? (
                        <span className="lt-info-trecho">
                            <span className="lt-info-rotulo">Trecho</span>
                            <span className="num">{M.fmtTempo(trecho.de, 2)} – {M.fmtTempo(trecho.ate, 2)}</span>
                        </span>
                    ) : (
                        <span className="lt-dica"><Ico.arrastar aria-hidden="true" />Arraste na régua para marcar um trecho</span>
                    )}
                </div>

                <div className="lt-grupo lt-zoom">
                    <button type="button" className="btn mini icone fantasma" onClick={() => mudarZoom(alvoPps / 1.4)} title="Diminuir o zoom (−)" aria-label="Diminuir o zoom">
                        <Ico.zoomMenos aria-hidden="true" />
                    </button>
                    <input
                        type="range" className="lt-zoom-faixa" min="0" max="1000" step="1" value={valorFaixa}
                        onChange={(e) => mudarZoom(Math.exp(lnMin + (Number(e.target.value) / 1000) * (lnMax - lnMin)), true)}
                        aria-label="Zoom da linha do tempo" aria-valuetext={`${Math.round(alvoPps)} pixels por segundo`}
                        title={`${Math.round(alvoPps)} px/s`}
                    />
                    <button type="button" className="btn mini icone fantasma" onClick={() => mudarZoom(alvoPps * 1.4)} title="Aumentar o zoom (+)" aria-label="Aumentar o zoom">
                        <Ico.zoomMais aria-hidden="true" />
                    </button>
                    <button type="button" className={`btn mini lt-chave ${zoom ? '' : 'ligado'}`} aria-pressed={!zoom} onClick={() => { imediatoRef.current = false; setZoom(null); }} title="Caber o episódio inteiro na largura">
                        <Ico.caber aria-hidden="true" />Caber
                    </button>
                    <button type="button" className="btn mini icone fantasma" onClick={irAoCursor} title="Rolar até o cursor" aria-label="Rolar até o cursor">
                        <Ico.irCursor aria-hidden="true" />
                    </button>
                    <span className="lt-sep" aria-hidden="true" />
                    <div className="lt-atalhos-ancora">
                        <button
                            type="button" className={`btn mini icone fantasma lt-btn-atalhos ${atalhos ? 'ligado' : ''}`} aria-expanded={atalhos}
                            onClick={() => setAtalhos((v) => !v)} title="Atalhos do teclado (?)" aria-label="Atalhos do teclado" aria-keyshortcuts="?"
                        >
                            <Ico.teclado aria-hidden="true" />
                        </button>
                        <AnimatePresence>{atalhos && <PainelAtalhos fechar={fecharAtalhos} />}</AnimatePresence>
                    </div>
                </div>
            </div>

            <div className="lt-rolagem" ref={rolagemRef}>
                <div className={`lt-conteudo ${arrasto ? `arrastando ${arrasto.modo}` : ''}`} ref={conteudoRef} style={{ width: CAB + larguraPista }}>
                    <div className="lt-cursor-cabeca" ref={cabecaRef}>
                        <span className="lt-cursor-pega" onPointerDown={arrastarCursor} title="Arraste para percorrer" />
                        <span className="lt-cursor-tc mono" ref={tcRef} aria-hidden="true" />
                    </div>
                    <div className="lt-linha lt-linha-regua">
                        <div className="lt-cab canto">
                            <span className="lt-canto-tc num" title="Duração do episódio">
                                <Ico.duracao aria-hidden="true" />{M.fmtS(alvo, alvo < 10 ? 1 : 0)}
                            </span>
                        </div>
                        <div className="lt-regua" style={{ width: larguraPista }} onPointerDown={naRegua}>
                            {marcas.map((s, k) => (
                                <div key={s} className={`lt-marca ${k % 2 === 0 ? 'forte' : ''}`} style={{ left: xDe(s) }}>
                                    {(k % 2 === 0 || todosComRotulo) && <span className="mono">{M.fmtTempo(s, casasRegua)}</span>}
                                </div>
                            ))}
                            {comQuadros && Array.from({ length: Math.ceil(visivel * fps) }, (_, k) => k).filter((k) => k % fps).map((k) => (
                                <div key={`q${k}`} className="lt-quadro" style={{ left: xDe(k / fps) }} />
                            ))}
                            <div className="lt-planos">
                                {limites.map((p, i) => (
                                    <div
                                        key={p.n} className={`lt-plano ${i % 2 ? 'par' : ''} ${planoSel === p.n ? 'sel' : ''}`}
                                        style={{ left: xDe(p.deS), width: Math.max(1, (p.ateS - p.deS) * pps) }} title={`Plano ${p.n} · ${M.fmtS(p.ateS - p.deS, 2)}`}
                                    >
                                        <span>{pps * (p.ateS - p.deS) > 34 ? `P${p.n}` : p.n}</span>
                                    </div>
                                ))}
                            </div>
                            {trecho && <div className="lt-trecho-regua" style={{ left: xDe(trecho.de), width: Math.max(1, (trecho.ate - trecho.de) * pps) }} />}
                            <div className="lt-alvo" style={{ left: xDe(alvo) }} title={`Duração do episódio: ${M.fmtS(alvo, alvo < 10 ? 1 : 0)}`} />
                        </div>
                    </div>
                    {lanes.map((l, iLane) => {
                        const Icone = ICONE_FAIXA[l.faixa] || Ico.video;
                        return (
                            <div key={l.id} className={`lt-linha f-${l.faixa}`} style={{ height: l.alto }}>
                                <div className={`lt-cab ${l.faixa === 'video' ? 'video' : ''} ${l.cor ? 'com-cor' : ''}`} style={l.cor ? { '--cor-faixa': l.cor } : undefined} title={l.nome}>
                                    <Icone className="lt-cab-ico" aria-hidden="true" />
                                    <span className="lt-cab-nome">{l.nome}</span>
                                </div>
                                <div
                                    className="lt-lane" style={{ width: larguraPista }} onPointerDown={noFundo}
                                    onDragOver={aoArrastarSobre(l)} onDragLeave={() => setSoltarEm(null)} onDrop={aoSoltar(l)}
                                >
                                    <div className="lt-alem" style={{ left: xDe(alvo) }} />
                                    {M.itensDaLane(doc, l).map((orig) => {
                                        const it = arrasto && arrasto.id === orig.id ? { ...orig, ...arrasto.item } : orig;
                                        const sel = selecao && selecao.id === it.id && selecao.faixa === l.faixa;
                                        const cor = l.cor || (l.faixa === 'legenda' ? (it.cor || '#EFE7D6') : '#5E7A99');
                                        const audio = ehAudio(l.faixa);
                                        const semAudio = audio && (!it.arquivo || it.status === 'sem_audio');
                                        const largura = Math.max(2, it.duracaoS * pps);
                                        const estilo = { left: xDe(it.inicioS), width: largura };
                                        if (audio) { estilo.background = M.rgba(cor, semAudio ? 0.07 : 0.16); estilo.borderColor = M.rgba(cor, 0.5); }
                                        if (l.faixa === 'legenda') estilo.borderColor = M.rgba(cor, 0.42);
                                        if (entrada && !reduzido) estilo.animationDelay = `${(Math.min(1, it.inicioS / visivel) * 0.36 + iLane * 0.025).toFixed(3)}s`;
                                        const classe = [
                                            'lt-clipe', `f-${l.faixa}`, sel && 'sel', semAudio && 'sem-audio', it.mudo && 'mudo', novos.has(it.id) && 'novo',
                                            it.manual && 'manual', arrasto && arrasto.id === orig.id && 'movendo', largura < 44 && 'estreito',
                                        ].filter(Boolean).join(' ');
                                        return (
                                            <div
                                                key={orig.id} className={classe} style={estilo}
                                                onPointerDown={(e) => iniciarArrasto(e, l.faixa, orig)}
                                                onDoubleClick={() => relogio.ir(it.inicioS)}
                                                title={`${rotuloDe(l.faixa, it)}\n${M.fmtTempo(it.inicioS, 2)} – ${M.fmtTempo(it.inicioS + it.duracaoS, 2)} (${M.fmtS(it.duracaoS, 2)})\nArraste para mover; puxe as bordas para aparar.`}
                                            >
                                                {l.faixa === 'video' && it.arquivo && <Miniaturas serie={serie} it={it} pps={pps} alto={l.alto - 6} />}
                                                {audio && it.arquivo && <Onda serie={serie} it={it} pps={pps} alto={l.alto - 6} cor={cor} />}
                                                <span className={`lt-rotulo ${l.faixa === 'video' ? 'sobre' : ''}`}>
                                                    <Ico.arrastar className="lt-alca" aria-hidden="true" />
                                                    {l.faixa === 'video' && it.origem === 'take' && <Ico.regerarTrecho className="lt-selo-ico" aria-label="Take gerado" />}
                                                    {l.faixa === 'video' && it.mudo && <Ico.mudo className="lt-selo-ico" aria-label="Som do clipe mudo" />}
                                                    {audio && it.via === 'radio' && <b className="lt-selo"><Ico.efeito aria-hidden="true" />Rádio</b>}
                                                    {semAudio && <b className="lt-selo aviso"><Ico.aviso aria-hidden="true" />Sem áudio</b>}
                                                    <span className="lt-rotulo-txt">{rotuloDe(l.faixa, it)}</span>
                                                </span>
                                                <span className="lt-borda ini" />
                                                <span className="lt-borda fim" />
                                            </div>
                                        );
                                    })}
                                    {l.faixa === 'video' && pendentes.map((r) => (
                                        <div key={r.id} className="lt-gerando" style={{ left: xDe(r.deS), width: Math.max(2, (r.ateS - r.deS) * pps) }} title={`Regerando: ${r.etapa || ''}`}>
                                            <span className="estado vivo">Gerando</span>
                                        </div>
                                    ))}
                                    {soltarEm && soltarEm.lane === l.id && <div className="lt-soltar" style={{ left: xDe(soltarEm.t) }} />}
                                </div>
                            </div>
                        );
                    })}
                    {trecho && <div className="lt-trecho" style={{ left: CAB + xDe(trecho.de), width: Math.max(1, (trecho.ate - trecho.de) * pps) }} />}
                    {guia !== null && <div className="lt-guia" style={{ left: CAB + xDe(guia) }} />}
                    <div className="lt-cursor-linha" ref={linhaRef} />
                </div>
            </div>
        </section>
    );
}
