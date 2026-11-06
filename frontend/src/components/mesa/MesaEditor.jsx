// MESA DE DECUPAGEM / EDITOR do episódio (/serie/:id/ep/:n).
// Fonte da verdade: episodios/epNN/edicao.json no servidor. Toda mudança é salva sozinha (SalvarEdicao, com a
// revisão para não sobrescrever uma regeração que terminou) e o desfazer/refazer é o histórico do servidor.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import '../../assets/css/Mesa.css';
import {
    LerEdicao, SalvarEdicao, DesfazerEdicao, RefazerEdicao, EdicaoInicial, StatusRegeracao, IntencoesFala,
} from '../funcionalidades/bancoGet';
import { RegerarFalasVoz } from '../funcionalidades/bancoGet';
import { lerProducao } from '../sala/producaoUtil';
import ProximoPasso from '../producao/ProximoPasso';
import MenuAcoes from '../subComponents/MenuAcoes';
import { erroDe } from '../funcionalidades/fetchFunc';
import { Relogio } from './mesaRelogio';
import * as M from './mesaUtil';
import MesaAcervo from './MesaAcervo';
import MesaPrevia from './MesaPrevia';
import MesaLinhaTempo from './MesaLinhaTempo';
import MesaInspetor from './MesaInspetor';
import MesaTrecho from './MesaTrecho';
import MesaRender from './MesaRender';
import MesaCelular from './MesaCelular';
import { Ico } from '../subComponents/icones';
import {
    avisar, Esqueleto, Vazio, Contador, Visto, Girador, Expandir, motion, AnimatePresence, MOV,
} from '../subComponents/Movimento';

const fontesCarregadas = new Set();

// Estado do salvamento (a Mesa salva sozinha): ícone + texto, troca com um fade curto.
const ESTADO_SALVO = {
    salvo: { texto: 'Salvo', classe: 'ok' },
    pendente: { texto: 'Alterado', classe: 'neutro' },
    salvando: { texto: 'Salvando', classe: 'neutro' },
    erro: { texto: 'Não salvou', classe: 'perigo' },
};
function EstadoSalvo({ salvo }) {
    const e = ESTADO_SALVO[salvo] || ESTADO_SALVO.salvo;
    let icone = <span className="mesa-salvo-ponto" aria-hidden="true" />;
    if (salvo === 'salvo') icone = <Visto tamanho={14} />;
    else if (salvo === 'salvando') icone = <Girador />;
    else if (salvo === 'erro') icone = <Ico.erro aria-hidden="true" />;
    return (
        <span className={`mesa-salvo ${e.classe}`} role="status" title="A Mesa salva sozinha a cada mudança">
            <AnimatePresence mode="wait" initial={false}>
                <motion.span
                    key={salvo} className="mesa-salvo-int"
                    initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0, transition: { duration: MOV.rapido, ease: MOV.enfatico } }}
                    exit={{ opacity: 0, transition: { duration: 0.08 } }}
                >
                    {icone}{e.texto}
                </motion.span>
            </AnimatePresence>
        </span>
    );
}

// Lugar da Mesa enquanto carrega (mesmo desenho: barra, acervo, prévia, inspetor e faixas)
function MesaEsqueleto({ raizRef, altura }) {
    return (
        <div className="mesa mesa-carregando" ref={raizRef} style={altura ? { height: altura } : undefined} aria-busy="true" aria-label="Carregando a Mesa">
            <header className="mesa-barra">
                <Esqueleto altura={28} largura={28} />
                <Esqueleto altura={14} largura={220} />
                <span className="mesa-barra-dir"><Esqueleto altura={30} largura={150} /></span>
            </header>
            <div className="mesa-corpo">
                <div className="mesa-esq-col">
                    <Esqueleto altura={14} largura="70%" />
                    <Esqueleto altura={30} />
                    <div className="mesa-esq-grade">{[0, 1, 2, 3].map((k) => <Esqueleto key={k} altura="auto" className="mesa-esq-poster" />)}</div>
                </div>
                <div className="mesa-esq-previa"><Esqueleto altura="100%" largura="auto" className="mesa-esq-palco" /></div>
                <div className="mesa-esq-col"><Esqueleto altura={14} largura="50%" /><Esqueleto linhas={6} /></div>
            </div>
            <div className="lt mesa-esq-lt">
                {[56, 36, 30, 30, 22, 22].map((h, k) => <Esqueleto key={k} altura={h - 8} largura={`${92 - k * 9}%`} />)}
            </div>
        </div>
    );
}

// soma os offsetTop até a raiz: a posição real no layout, sem contar o transform da entrada da página
function topoNoLayout(el) {
    let topo = 0;
    for (let n = el; n; n = n.offsetParent) topo += n.offsetTop;
    return topo;
}

export default function MesaEditor({ ativaResp }) {
    const { id: serie, n } = useParams();
    const ep = Number(n);
    const [ctx, setCtx] = useState(null);
    const [doc, setDoc] = useState(null);
    const [historico, setHistorico] = useState(null);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState(null);
    const [salvo, setSalvo] = useState('salvo');
    const [selecao, setSelecao] = useState(null);
    const [trecho, setTrecho] = useState(null);
    const [zoom, setZoom] = useState(null);
    const [renderAberto, setRenderAberto] = useState(false);
    const [intencoes, setIntencoes] = useState(null);
    const [montando, setMontando] = useState(null);
    const [altura, setAltura] = useState(null);
    const [painelFala, setPainelFala] = useState(null);
    const [atalhos, setAtalhos] = useState(false);
    const [prod, setProd] = useState(undefined); // estado das etapas do episódio (Próximo passo)
    const [regerandoFalas, setRegerandoFalas] = useState(false);
    const [busca] = useSearchParams();
    const navegar = useNavigate();

    const relogio = useMemo(() => new Relogio(), []);
    if (import.meta.env.DEV) window.__mesaRelogio = relogio; // só em desenvolvimento: inspecionar a prévia
    const raizRef = useRef(null);
    const docRef = useRef(null);
    const revisaoRef = useRef(null);
    const seqRef = useRef(0);
    const sujoRef = useRef(false);
    const timerRef = useRef(null);
    const salvandoRef = useRef(null);
    const zoomInfoRef = useRef(null); // { pps, min, max } da linha do tempo (para as teclas + e −)

    // avisos flutuantes da casa (avisar de Movimento.jsx): 'ok' | 'erro' | 'aviso' | 'info'
    const mostrarAviso = useCallback((texto, tipo = 'info') => {
        avisar(texto, tipo, tipo === 'erro' ? 9000 : 4500);
    }, []);

    // ---------- carregar ----------
    const aceitarServidor = useCallback((edicao, hist) => {
        seqRef.current += 1;
        sujoRef.current = false;
        docRef.current = edicao;
        revisaoRef.current = edicao ? edicao.revisao : null;
        setDoc(edicao);
        if (hist) setHistorico(hist);
        setSalvo('salvo');
    }, []);

    const recarregar = useCallback(async ({ silencioso = false } = {}) => {
        if (!silencioso) setCarregando(true);
        const r = await LerEdicao({ serie, ep });
        if (erroDe(r)) {
            setErro(erroDe(r));
            setCarregando(false);
            return null;
        }
        const { edicao, historico: hist, ...resto } = r;
        setCtx(resto);
        aceitarServidor(edicao, hist);
        setErro(null);
        setCarregando(false);
        return r;
    }, [serie, ep, aceitarServidor]);

    useEffect(() => {
        recarregar();
        IntencoesFala().then((r) => { if (!erroDe(r)) setIntencoes(r); });
        return () => relogio.soltar();
    }, [recarregar, relogio]);

    // ---------- próximo passo (estado real das etapas; o mesmo cálculo da Sala) ----------
    const carregarProd = useCallback(async () => {
        const r = await lerProducao(serie, ep);
        setProd(r);
        return r;
    }, [serie, ep]);
    useEffect(() => { carregarProd(); }, [carregarProd]);

    // fontes da prévia (as mesmas do render: League Gothic e Barlow Condensed, do motor)
    useEffect(() => {
        if (!ctx || !ctx.fontes || typeof FontFace === 'undefined') return;
        for (const f of ctx.fontes) {
            if (fontesCarregadas.has(f.familia)) continue;
            fontesCarregadas.add(f.familia);
            const ff = new FontFace(f.familia, `url(${M.midiaUrl(serie, f.arquivo)})`, f.familia === 'Barlow Condensed' ? { weight: '700' } : {});
            ff.load().then((x) => document.fonts.add(x)).catch(() => fontesCarregadas.delete(f.familia));
        }
    }, [ctx, serie]);

    // altura útil: a Mesa ocupa o resto da janela abaixo do topo
    useLayoutEffect(() => {
        const medir = () => {
            if (!raizRef.current) return;
            setAltura(Math.max(560, window.innerHeight - topoNoLayout(raizRef.current)));
        };
        medir();
        window.addEventListener('resize', medir);
        return () => window.removeEventListener('resize', medir);
    }, [carregando, doc === null]); // eslint-disable-line react-hooks/exhaustive-deps

    // ---------- salvar sozinho ----------
    const salvarAgora = useCallback(async () => {
        clearTimeout(timerRef.current);
        while (salvandoRef.current) await salvandoRef.current;
        if (!sujoRef.current || !docRef.current) return true;
        const seq = seqRef.current;
        sujoRef.current = false;
        setSalvo('salvando');
        const p = SalvarEdicao({ serie, ep, edicao: docRef.current, revisaoBase: revisaoRef.current });
        salvandoRef.current = p;
        const r = await p;
        salvandoRef.current = null;
        if (erroDe(r)) {
            setSalvo('erro');
            mostrarAviso(`Não salvou: ${erroDe(r)}`, 'erro');
            await recarregar({ silencioso: true });
            return false;
        }
        revisaoRef.current = r.edicao.revisao;
        setHistorico(r.historico);
        if (seqRef.current === seq) {
            docRef.current = r.edicao;
            setDoc(r.edicao);
        } else if (docRef.current) {
            docRef.current = { ...docRef.current, revisao: r.edicao.revisao };
        }
        setSalvo(sujoRef.current ? 'pendente' : 'salvo');
        return true;
    }, [serie, ep, mostrarAviso, recarregar]);

    const aplicar = useCallback((novo) => {
        const d = { ...novo, duracaoS: M.duracaoDoc(novo) };
        seqRef.current += 1;
        sujoRef.current = true;
        docRef.current = d;
        setDoc(d);
        setSalvo('pendente');
        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => { salvarAgora(); }, 450);
    }, [salvarAgora]);

    useEffect(() => {
        const sair = (e) => { if (sujoRef.current) { e.preventDefault(); e.returnValue = ''; } };
        window.addEventListener('beforeunload', sair);
        return () => window.removeEventListener('beforeunload', sair);
    }, []);

    const desfazer = useCallback(async () => {
        if (!(await salvarAgora())) return;
        const r = await DesfazerEdicao({ serie, ep });
        if (erroDe(r)) return mostrarAviso(erroDe(r), 'erro');
        aceitarServidor(r.edicao, r.historico);
        return null;
    }, [serie, ep, salvarAgora, aceitarServidor, mostrarAviso]);

    const refazer = useCallback(async () => {
        if (!(await salvarAgora())) return;
        const r = await RefazerEdicao({ serie, ep });
        if (erroDe(r)) return mostrarAviso(erroDe(r), 'erro');
        aceitarServidor(r.edicao, r.historico);
        return null;
    }, [serie, ep, salvarAgora, aceitarServidor, mostrarAviso]);

    // resposta do servidor que já traz a edição nova (regerar fala/legenda)
    const receberDoServidor = useCallback(async (r) => {
        if (!r || !r.edicao) return;
        aceitarServidor(r.edicao, r.historico);
    }, [aceitarServidor]);

    // ---------- edição inicial ----------
    const montarInicial = async ({ gerarFalas = false, forcar = false } = {}) => {
        if (forcar && !window.confirm('Montar de novo a partir do roteiro? A edição atual fica no histórico (dá para desfazer).')) return;
        await salvarAgora();
        setMontando(gerarFalas ? 'Gerando as falas (TTS grátis) e montando a edição…' : 'Montando a edição…');
        const r = await EdicaoInicial({ serie, ep, gerarFalas, forcar });
        setMontando(null);
        if (erroDe(r)) return mostrarAviso(erroDe(r), 'erro');
        await recarregar({ silencioso: true });
        carregarProd();
        mostrarAviso(gerarFalas ? 'Edição montada com as falas geradas.' : 'Edição montada.', 'ok');
        return null;
    };

    // O "Próximo passo" mudou algo no servidor (falas, decupagem, vídeos em lote): relê o estado das etapas, as
    // regerações e, se a edição mudou lá (revisão nova), a edição — sem perder o que ainda não foi salvo.
    const atualizarDoServidor = useCallback(async () => {
        const p = await carregarProd();
        const st = await StatusRegeracao({ serie, ep });
        if (!montadoRef.current) return;
        if (!erroDe(st)) setCtx((c) => (c ? { ...c, mesa: { regeracoes: st.regeracoes, takes: st.takes } } : c));
        const revisao = p && p.edicao && p.edicao.existe ? p.edicao.revisao : null;
        if (revisao !== null && revisao !== undefined && revisao !== revisaoRef.current) {
            await salvarAgora();
            await recarregar({ silencioso: true });
        } else if (revisao === null && p && p.edicao && p.edicao.existe === false && docRef.current) {
            await recarregar({ silencioso: true });
        } else if (!docRef.current && p && p.edicao && p.edicao.existe) {
            await recarregar({ silencioso: true });
        }
    }, [carregarProd, serie, ep, salvarAgora, recarregar]);

    // Botões do Próximo passo que moram fora dele: roteiro e votação na Sala, quadros no inspetor, montar aqui.
    const acaoDoPasso = useCallback(async (acao) => {
        if (acao === 'montar') { await salvarAgora(); setRenderAberto(true); return; }
        if (acao === 'quadros') {
            const d = docRef.current;
            const sem = d && (d.planos || []).find((p) => !(p.quadroChave && p.quadroChave.arquivo));
            const seg = sem && (d.faixas.video || []).find((v) => v.plano === sem.n);
            if (seg) setSelecao({ faixa: 'video', id: seg.id });
            mostrarAviso(sem ? `Plano ${sem.n}: no inspetor, em "Quadro-chave", use o quadro do cursor, a referência ou anexe uma imagem.` : 'Todos os planos já têm quadro-chave.', 'info');
            return;
        }
        if (acao === 'votar') { navegar(`/serie/${serie}?aba=temporada&ep=${ep}`); return; }
        navegar(`/serie/${serie}?aba=episodios&ep=${ep}`); // escrever, aprovar ou ajustar o roteiro: na página do episódio
    }, [salvarAgora, mostrarAviso, navegar, serie, ep]);

    // Menu da Mesa → "Regerar todas as falas" (TTS grátis, voz/tom atuais; as que não mudaram vêm do cache).
    const regerarTodasFalas = useCallback(async () => {
        await salvarAgora();
        setRegerandoFalas(true);
        const r = await RegerarFalasVoz({ serie, ep });
        setRegerandoFalas(false);
        if (erroDe(r)) { mostrarAviso(`Não regerou as falas: ${erroDe(r)}`, 'erro'); return; }
        if (r.edicao) aceitarServidor(r.edicao, r.historico);
        const n = (r.regeradas || []).length;
        mostrarAviso(`${n === 1 ? '1 fala' : `${n} falas`} com a voz atual (${r.doCache || 0} iguais, do cache). Ctrl+Z desfaz.`, 'ok');
        (r.avisos || []).slice(0, 3).forEach((a) => mostrarAviso(a, 'aviso'));
        carregarProd();
    }, [serie, ep, salvarAgora, aceitarServidor, mostrarAviso, carregarProd]);

    // ?montar=1 (vindo do "Próximo passo" da Sala): abre a montagem assim que a edição carrega
    const pediuMontar = busca.get('montar') === '1';
    useEffect(() => {
        if (pediuMontar && doc && !renderAberto) setRenderAberto(true);
    }, [pediuMontar, doc === null]); // eslint-disable-line react-hooks/exhaustive-deps

    // ---------- relógio: duração e áudio ----------
    useEffect(() => {
        if (!doc) return;
        relogio.duracao = Math.max(1, M.duracaoDoc(doc));
        const falas = M.FAIXAS_AUDIO.flatMap((f) => doc.faixas[f] || []).filter((i) => i.arquivo && !i.mudo);
        const itens = falas.map((i) => ({ url: M.midiaUrl(serie, i.arquivo), inicioS: i.inicioS, duracaoS: i.duracaoS, entradaS: i.entradaS || 0, ganho: 1 }));
        const amb = (doc.faixas.ambiente || []).find((a) => !a.mudo && a.tipo === 'sintetico');
        relogio.fonteAudio = () => ({ itens, ambiente: amb ? { volume: Number(amb.volume) || 0 } : null });
        for (const it of itens) relogio.audio.carregar(it.url);
        if (relogio.tocando) relogio.reagendar();
        if (relogio.agora() > relogio.duracao) relogio.ir(relogio.duracao);
    }, [doc, relogio, serie]);

    // ---------- regerações em andamento ----------
    const gerando = Boolean(ctx && ctx.mesa && ctx.mesa.regeracoes.some((r) => r.status === 'gerando'));
    const montadoRef = useRef(true);
    useEffect(() => {
        montadoRef.current = true; // o StrictMode desmonta e monta de novo em desenvolvimento
        return () => { montadoRef.current = false; };
    }, []);
    useEffect(() => {
        if (!gerando) return undefined;
        let ocupado = false;
        const id = setInterval(async () => {
            if (ocupado) return;
            ocupado = true;
            try {
                const st = await StatusRegeracao({ serie, ep });
                if (!montadoRef.current || erroDe(st)) return;
                // primeiro a edição nova (a troca do trecho), DEPOIS o estado das regerações: mudar o estado
                // desliga este acompanhamento, e a edição não pode ficar para trás
                if (st.revisao !== null && st.revisao !== revisaoRef.current) {
                    await salvarAgora();
                    const r = await LerEdicao({ serie, ep });
                    if (!erroDe(r) && montadoRef.current) {
                        aceitarServidor(r.edicao, r.historico);
                        const ult = st.regeracoes.filter((x) => x.status === 'pronto' && x.segmento).at(-1);
                        if (ult) setSelecao({ faixa: 'video', id: ult.segmento });
                        if (ult) mostrarAviso('Regeração pronta: o trecho foi trocado pelo take novo (o anterior continua no acervo e na lista de takes).', 'ok');
                    }
                }
                if (montadoRef.current) setCtx((c) => (c ? { ...c, mesa: { regeracoes: st.regeracoes, takes: st.takes } } : c));
            } finally {
                ocupado = false;
            }
        }, 1500);
        return () => clearInterval(id);
    }, [gerando, serie, ep, salvarAgora, aceitarServidor, mostrarAviso]);

    const atualizarMesa = useCallback((mesa) => setCtx((c) => (c ? { ...c, mesa } : c)), []);

    // ---------- operações ----------
    const fps = (doc && doc.fps) || 24;

    const dividirNoCursor = useCallback(() => {
        const d0 = docRef.current;
        if (!d0) return;
        const t = M.noQuadro(relogio.agora(), fps);
        const d = M.clonar(d0);
        let feito = false;
        const dividirEm = (faixa, id) => {
            const lista = d.faixas[faixa] || [];
            const i = lista.findIndex((x) => x.id === id);
            if (i < 0) return;
            const partes = M.dividirItem(lista[i], t, M.novoId(faixa[0]));
            if (partes.length < 2) return;
            lista.splice(i, 1, ...partes);
            feito = true;
        };
        if (selecao && selecao.faixa !== 'legenda') {
            const it = M.acharItem(d, selecao);
            if (it && t > it.inicioS && t < M.fimDe(it)) dividirEm(selecao.faixa, it.id);
        }
        if (!feito) {
            const v = (d.faixas.video || []).find((x) => t > x.inicioS + 1e-4 && t < M.fimDe(x) - 1e-4);
            if (v) dividirEm('video', v.id);
        }
        if (feito) aplicar(d);
        else mostrarAviso('Nada para dividir no cursor.');
    }, [relogio, fps, selecao, aplicar, mostrarAviso]);

    const removerSelecionado = useCallback(() => {
        const d0 = docRef.current;
        if (!d0 || !selecao) return;
        const d = M.clonar(d0);
        if (selecao.faixa === 'legenda') d.legenda = d.legenda.filter((b) => b.id !== selecao.id);
        else {
            d.faixas[selecao.faixa] = (d.faixas[selecao.faixa] || []).filter((x) => x.id !== selecao.id);
            if (M.FAIXAS_AUDIO.includes(selecao.faixa)) d.legenda = (d.legenda || []).filter((b) => b.item !== selecao.id);
        }
        setSelecao(null);
        aplicar(d);
    }, [selecao, aplicar]);

    // ---------- teclado ----------
    useEffect(() => {
        const tecla = (e) => {
            const alvo = e.target;
            if (alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.tagName === 'SELECT' || alvo.isContentEditable)) return;
            if (!docRef.current) return;
            const k = e.key;
            const ctrl = e.ctrlKey || e.metaKey;
            if (ctrl && (k === 'z' || k === 'Z')) { e.preventDefault(); if (e.shiftKey) refazer(); else desfazer(); return; }
            if (ctrl && (k === 'y' || k === 'Y')) { e.preventDefault(); refazer(); return; }
            if (ctrl) return;
            switch (k) {
                case ' ': e.preventDefault(); relogio.alternar(); break;
                case 'k': case 'K': relogio.pausar(); break;
                case 'l': case 'L':
                    if (relogio.tocando && relogio.taxa > 0) relogio.mudarTaxa(Math.min(4, relogio.taxa * 2)); else relogio.tocar(1);
                    break;
                case 'j': case 'J':
                    if (relogio.tocando && relogio.taxa < 0) relogio.mudarTaxa(Math.max(-4, relogio.taxa * 2)); else relogio.tocar(-1);
                    break;
                case 'ArrowLeft': e.preventDefault(); relogio.passo(e.shiftKey ? -1 : -1 / fps); break;
                case 'ArrowRight': e.preventDefault(); relogio.passo(e.shiftKey ? 1 : 1 / fps); break;
                case 'Home': e.preventDefault(); relogio.ir(0); break;
                case 'End': e.preventDefault(); relogio.ir(relogio.duracao); break;
                case 'i': case 'I': {
                    const t = M.noQuadro(relogio.agora(), fps);
                    setTrecho((tr) => ({ de: t, ate: tr && tr.ate > t + 0.1 ? tr.ate : Math.min(relogio.duracao, t + 2) }));
                    break;
                }
                case 'o': case 'O': {
                    const t = M.noQuadro(relogio.agora(), fps);
                    setTrecho((tr) => ({ de: tr && tr.de < t - 0.1 ? tr.de : Math.max(0, t - 2), ate: t }));
                    break;
                }
                case 's': case 'S': e.preventDefault(); dividirNoCursor(); break;
                case 'Delete': case 'Backspace': e.preventDefault(); removerSelecionado(); break;
                case 'Escape': setTrecho(null); setSelecao(null); setAtalhos(false); break;
                case '?': e.preventDefault(); setAtalhos((a) => !a); break;
                case '+': case '=': {
                    const z = zoomInfoRef.current;
                    if (z) setZoom(M.limitar(z.pps * 1.4, z.min, z.max));
                    break;
                }
                case '-': case '_': {
                    const z = zoomInfoRef.current;
                    if (z) setZoom(M.limitar(z.pps / 1.4, z.min, z.max));
                    break;
                }
                default:
            }
        };
        window.addEventListener('keydown', tecla);
        return () => window.removeEventListener('keydown', tecla);
    }, [relogio, fps, desfazer, refazer, dividirNoCursor, removerSelecionado]);

    // ---------- tela ----------
    const titulo = ctx && ctx.serie ? ctx.serie.titulo : serie;
    const tituloEp = (doc && doc.titulo) || (ctx && ctx.episodio && ctx.episodio.titulo) || '';

    if (carregando && !ctx) return <MesaEsqueleto raizRef={raizRef} altura={altura} />;
    if (erro && !ctx) {
        return (
            <div className="mesa" ref={raizRef} style={altura ? { height: altura } : undefined}>
                <div className="mesa-vazia">
                    <div className="mesa-cartao-vazio">
                        <Vazio icone={Ico.erro} titulo="Não abriu a Mesa" texto={erro}>
                            <Link className="btn" to={`/serie/${serie}`}><Ico.voltar className="ico-voltar" aria-hidden="true" />Voltar para a série</Link>
                        </Vazio>
                    </div>
                </div>
            </div>
        );
    }

    if (ativaResp && doc) {
        return <MesaCelular serie={serie} ep={ep} doc={doc} ctx={ctx} relogio={relogio} titulo={titulo} tituloEp={tituloEp} />;
    }

    // as migalhas completas ficam no topo do app; aqui o episódio em destaque e o atalho de volta para a série
    const cabecalho = (
        <div className="mesa-cab">
            <Link className="btn mini icone fantasma" to={`/serie/${serie}`} title="Voltar para a Sala do showrunner" aria-label="Voltar para a Sala do showrunner">
                <Ico.voltar className="ico-voltar" aria-hidden="true" />
            </Link>
            <div className="mesa-titulo">
                <span className="mesa-titulo-serie">{titulo}</span>
                <h1>Ep. {ep}{tituloEp ? <span className="mesa-titulo-ep"> · {tituloEp}</span> : null}</h1>
            </div>
        </div>
    );

    if (!doc) {
        const temFalas = ctx && ctx.episodio && ctx.episodio.temFalas;
        const temRoteiro = ctx && ctx.episodio && ctx.episodio.temRoteiro;
        const passos = temRoteiro ? [
            { ok: Boolean(ctx.roteiro), texto: ctx.roteiro ? `${ctx.roteiro.planos.length} planos no roteiro` : 'Roteiro' },
            { ok: Boolean(temFalas), texto: temFalas ? 'Falas já geradas' : 'Falas ainda não geradas' },
            { ok: ctx.acervo.clipes.length > 0, texto: `${ctx.acervo.clipes.length} clipes no acervo` },
        ] : [];
        return (
            <div className="mesa" ref={raizRef} style={altura ? { height: altura } : undefined}>
                <header className="mesa-barra">{cabecalho}</header>
                {temRoteiro && <ProximoPasso serieId={serie} ep={ep} prod={prod} contexto="mesa" onRecarregar={atualizarDoServidor} onAcao={acaoDoPasso} />}
                <div className="mesa-vazia">
                    <div className="mesa-cartao-vazio">
                        <Vazio
                            icone={Ico.decupagem} titulo="Este episódio ainda não tem edição"
                            texto={temRoteiro
                                ? 'A edição começa pela narração: cada fala gerada define quanto dura o seu plano, e o vídeo de cada plano é preenchido com o clipe do acervo mais adequado até existir um take gerado.'
                                : 'Falta o roteiro. Escreva e aprove o roteiro na Sala do showrunner.'}
                        >
                            {temRoteiro && (
                                <>
                                    <ul className="mesa-passos">
                                        {passos.map((p) => (
                                            <li key={p.texto} className={p.ok ? 'ok' : 'falta'}>
                                                {p.ok ? <Ico.ok aria-hidden="true" /> : <Ico.info aria-hidden="true" />}{p.texto}
                                            </li>
                                        ))}
                                    </ul>
                                    <div className="mesa-acoes-vazio">
                                        {temFalas ? (
                                            <button type="button" className="btn primario" aria-busy={Boolean(montando)} disabled={Boolean(montando)} onClick={() => montarInicial({})}>
                                                {montando && <Girador />}<Ico.montar aria-hidden="true" />Montar a edição inicial
                                            </button>
                                        ) : (
                                            <>
                                                <button type="button" className="btn primario" aria-busy={Boolean(montando)} disabled={Boolean(montando)} onClick={() => montarInicial({ gerarFalas: true })}>
                                                    {montando && <Girador />}<Ico.voz aria-hidden="true" />Gerar as falas e montar
                                                </button>
                                                <button type="button" className="btn" disabled={Boolean(montando)} onClick={() => montarInicial({})}>
                                                    <Ico.duracao aria-hidden="true" />Montar com tempos estimados
                                                </button>
                                            </>
                                        )}
                                    </div>
                                    {!temFalas && <p className="mesa-nota">As falas usam as vozes da série (TTS grátis, precisa de internet). Nada é pago.</p>}
                                    {montando && <p className="estado vivo mesa-progresso-texto" role="status">{montando}</p>}
                                </>
                            )}
                            {!temRoteiro && (
                                <Link className="btn" to={`/serie/${serie}`}><Ico.roteiro aria-hidden="true" />Abrir a Sala do showrunner</Link>
                            )}
                        </Vazio>
                    </div>
                </div>
            </div>
        );
    }

    const duracaoAtual = M.duracaoDoc(doc);
    const alvo = M.alvoDe(doc);
    const passou = duracaoAtual > alvo + 0.5;
    const casasAlvo = alvo < 10 ? 1 : 0;
    // episódio curto (duração livre) lê melhor em segundos: "5,0 s de 5 s"; a partir de 1 min, timecode
    const fmtDur = (v, casas) => (alvo < 60 ? M.fmtS(v, casas) : M.fmtTempo(v, casas));

    return (
        <div className="mesa" ref={raizRef} style={altura ? { height: altura } : undefined}>
            <header className="mesa-barra">
                {cabecalho}
                <div className="mesa-barra-meio">
                    <span
                        className={`mesa-dado ${passou ? 'passou' : ''}`}
                        title={passou ? `Passou ${M.fmtS(duracaoAtual - alvo, 1)} da duração do episódio (${M.fmtS(alvo, casasAlvo)})` : `Duração atual e duração do episódio (${M.fmtS(alvo, casasAlvo)})`}
                    >
                        {passou ? <Ico.aviso aria-hidden="true" /> : <Ico.duracao aria-hidden="true" />}
                        <Contador valor={duracaoAtual} formatar={(v) => fmtDur(v, 1)} className="mesa-dado-valor" />
                        <span className="mesa-dado-de num">de {fmtDur(alvo, casasAlvo)}</span>
                    </span>
                    <span className="mesa-dado" title="Planos do episódio">
                        <Ico.decupagem aria-hidden="true" />
                        <Contador valor={doc.planos.length} className="mesa-dado-valor" />
                        <span className="mesa-dado-de">{doc.planos.length === 1 ? 'plano' : 'planos'}</span>
                    </span>
                    {doc.origem && doc.origem.falas === 'estimadas' && (
                        <button type="button" className="btn mini mesa-btn-aviso" onClick={() => montarInicial({ gerarFalas: true, forcar: true })} title="Gera as falas pelo TTS (grátis) e remonta a edição">
                            <Ico.aviso aria-hidden="true" />Falas estimadas: gerar o áudio
                        </button>
                    )}
                </div>
                <div className="mesa-barra-dir">
                    <EstadoSalvo salvo={salvo} />
                    <span className="mesa-grupo">
                        <button type="button" className="btn icone fantasma" onClick={desfazer} disabled={!historico || !historico.podeDesfazer} title="Desfazer (Ctrl+Z)" aria-label="Desfazer" aria-keyshortcuts="Control+Z">
                            <Ico.desfazer aria-hidden="true" />
                        </button>
                        <button type="button" className="btn icone fantasma" onClick={refazer} disabled={!historico || !historico.podeRefazer} title="Refazer (Ctrl+Shift+Z)" aria-label="Refazer" aria-keyshortcuts="Control+Shift+Z">
                            <Ico.refazer aria-hidden="true" />
                        </button>
                    </span>
                    <MenuAcoes
                        rotulo="Mais ações da Mesa"
                        classeBotao="btn icone fantasma"
                        itens={[
                            { id: 'falas', rotulo: regerandoFalas ? 'Regerando as falas…' : 'Regerar todas as falas', icone: Ico.voz, dica: 'TTS grátis com a voz/tom atuais de cada personagem; vídeo e cortes ficam (Ctrl+Z desfaz)', desabilitado: regerandoFalas, onSelecionar: regerarTodasFalas },
                            { id: 'remontar', rotulo: 'Montar de novo a partir do roteiro', icone: Ico.refazer, dica: 'Refaz a edição pelo roteiro e pelas falas (a atual fica no histórico)', onSelecionar: () => montarInicial({ forcar: true }) },
                        ]}
                    />
                    <button type="button" className="btn primario" onClick={async () => { await salvarAgora(); setRenderAberto(true); }}>
                        <Ico.montar aria-hidden="true" />Montar episódio
                    </button>
                </div>
            </header>

            <ProximoPasso
                serieId={serie} ep={ep} prod={prod} contexto="mesa"
                modeloTexto={ctx && ctx.serie && ctx.serie.modelos && ctx.serie.modelos.texto}
                onRecarregar={atualizarDoServidor} onAcao={acaoDoPasso}
            />

            <div className="mesa-corpo">
                <MesaAcervo serie={serie} ctx={ctx} doc={doc} relogio={relogio} aplicar={aplicar} />
                <MesaPrevia serie={serie} doc={doc} relogio={relogio} />
                <MesaInspetor
                    serie={serie} ep={ep} doc={doc} ctx={ctx} relogio={relogio} selecao={selecao} setSelecao={setSelecao}
                    aplicar={aplicar} intencoes={intencoes} salvarAgora={salvarAgora} receberDoServidor={receberDoServidor}
                    mostrarAviso={mostrarAviso} montarInicial={montarInicial} painelFala={painelFala} setPainelFala={setPainelFala}
                />
            </div>

            <Expandir aberto={Boolean(trecho)} className="mesa-trecho-caixa">
                {trecho && (
                    <MesaTrecho
                        serie={serie} ep={ep} doc={doc} trecho={trecho} setTrecho={setTrecho} ctx={ctx} atualizarMesa={atualizarMesa}
                        salvarAgora={salvarAgora} receberDoServidor={receberDoServidor} mostrarAviso={mostrarAviso}
                        abrirFala={(id) => { setSelecao({ faixa: M.FAIXAS_AUDIO.find((f) => (doc.faixas[f] || []).some((x) => x.id === id)), id }); setPainelFala(id); }}
                    />
                )}
            </Expandir>

            <MesaLinhaTempo
                serie={serie} doc={doc} relogio={relogio} zoom={zoom} setZoom={setZoom} zoomInfoRef={zoomInfoRef} selecao={selecao} setSelecao={setSelecao}
                trecho={trecho} setTrecho={setTrecho} aplicar={aplicar} regeracoes={ctx.mesa.regeracoes}
                onDividir={dividirNoCursor} onRemover={removerSelecionado} atalhos={atalhos} setAtalhos={setAtalhos}
            />

            {renderAberto && <MesaRender serie={serie} ep={ep} doc={doc} inicial={ctx.render} fechar={() => { setRenderAberto(false); carregarProd(); }} />}
        </div>
    );
}
