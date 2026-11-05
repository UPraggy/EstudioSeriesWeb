import { useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, motion, animate, useReducedMotion } from 'framer-motion';
import { Ico } from './icones';

// Peças de movimento do Estúdio (framer-motion). Regra: o movimento RESPONDE a uma ação (abrir, trocar, confirmar,
// carregar) ou orquestra UMA entrada por tela. Nada piscando sozinho. Movimento reduzido é respeitado em
// routes.jsx (<MotionConfig reducedMotion="user">) e no CSS (Principais.css).
// Tokens (iguais ao colors.css, gerados pelo VisualInspector):
export const MOV = {
    rapido: 0.16,
    base: 0.24,
    lento: 0.4,
    enfatico: [0.2, 0, 0, 1],
    padrao: [0.4, 0, 0.2, 1],
    mola: { type: 'spring', stiffness: 260, damping: 20 },   // "snappy"
    molaSuave: { type: 'spring', stiffness: 120, damping: 14 }, // "gentle"
    escalonar: 0.05,
};

// Entrada da página (uma por rota). Use dentro do <AnimatePresence mode="wait"> de routes.jsx.
export function Pagina({ children, className = '' }) {
    return (
        <motion.div
            className={`pagina ${className}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0, transition: { duration: MOV.base, ease: MOV.enfatico } }}
            exit={{ opacity: 0, transition: { duration: 0.1, ease: MOV.padrao } }}
        >
            {children}
        </motion.div>
    );
}

// Lista que entra em cascata UMA vez (ex.: cartões de séries, planos do roteiro).
// <Lista as="ul" className="..."> <Item as="li" key=...>...</Item> </Lista>
const varLista = { oculto: {}, visivel: { transition: { staggerChildren: MOV.escalonar } } };
const varItem = {
    oculto: { opacity: 0, y: 6 },
    visivel: { opacity: 1, y: 0, transition: { duration: MOV.base, ease: MOV.enfatico } },
};
export function Lista({ as = 'div', children, ...resto }) {
    const Tag = motion[as] || motion.div;
    return <Tag variants={varLista} initial="oculto" animate="visivel" {...resto}>{children}</Tag>;
}
export function Item({ as = 'div', children, ...resto }) {
    const Tag = motion[as] || motion.div;
    return <Tag variants={varItem} layout="position" {...resto}>{children}</Tag>;
}

// Número que "corre" até o novo valor (saldo, custo, duração). formatar(n) devolve o texto.
export function Contador({ valor, formatar = (n) => String(Math.round(n)), duracao = 0.6, className = '' }) {
    const reduzido = useReducedMotion();
    const [mostrado, setMostrado] = useState(Number(valor) || 0);
    const anterior = useRef(Number(valor) || 0);
    useEffect(() => {
        const alvo = Number(valor);
        if (!Number.isFinite(alvo)) return undefined;
        if (reduzido) { setMostrado(alvo); anterior.current = alvo; return undefined; }
        const c = animate(anterior.current, alvo, { duration: duracao, ease: MOV.enfatico, onUpdate: setMostrado });
        anterior.current = alvo;
        return () => c.stop();
    }, [valor, duracao, reduzido]);
    return <span className={`num ${className}`}>{formatar(mostrado)}</span>;
}

// Abas com sublinhado que desliza. abas = [{ id, rotulo, icone?: Componente, contador? }]
// Teclado: setas esquerda/direita, Home/End (padrão ARIA de tablist).
export function Abas({ abas, ativa, onTrocar, rotuloAria = 'Abas', className = '' }) {
    const idGrupo = useId();
    const refs = useRef({});
    function tecla(e, i) {
        const n = abas.length;
        let alvo = null;
        if (e.key === 'ArrowRight') alvo = (i + 1) % n;
        else if (e.key === 'ArrowLeft') alvo = (i - 1 + n) % n;
        else if (e.key === 'Home') alvo = 0;
        else if (e.key === 'End') alvo = n - 1;
        if (alvo === null) return;
        e.preventDefault();
        onTrocar(abas[alvo].id);
        refs.current[abas[alvo].id]?.focus();
    }
    return (
        <div className={`abas com-marca ${className}`} role="tablist" aria-label={rotuloAria}>
            {abas.map((a, i) => {
                const Icone = a.icone;
                const ehAtiva = a.id === ativa;
                return (
                    <button
                        key={a.id}
                        ref={(el) => { refs.current[a.id] = el; }}
                        type="button"
                        role="tab"
                        id={`${idGrupo}-${a.id}`}
                        aria-selected={ehAtiva}
                        tabIndex={ehAtiva ? 0 : -1}
                        className={ehAtiva ? 'ativa' : ''}
                        onClick={() => onTrocar(a.id)}
                        onKeyDown={(e) => tecla(e, i)}
                    >
                        {Icone && <Icone aria-hidden="true" />}
                        {a.rotulo}
                        {a.contador != null && <span className="abas-contador num">{a.contador}</span>}
                        {ehAtiva && <motion.span layoutId={`marca-${idGrupo}`} className="abas-marca" transition={MOV.mola} />}
                    </button>
                );
            })}
        </div>
    );
}

// Conteúdo que troca com um cross-fade curto (o conteúdo da aba ativa, um painel do inspetor...).
export function Trocar({ chave, children, className = '' }) {
    return (
        <AnimatePresence mode="wait" initial={false}>
            <motion.div
                key={chave}
                className={className}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0, transition: { duration: MOV.rapido, ease: MOV.enfatico } }}
                exit={{ opacity: 0, transition: { duration: 0.08 } }}
            >
                {children}
            </motion.div>
        </AnimatePresence>
    );
}

// Abre/fecha com altura animada (detalhes, seções recolhíveis).
export function Expandir({ aberto, children, className = '' }) {
    return (
        <AnimatePresence initial={false}>
            {aberto && (
                <motion.div
                    className={className}
                    style={{ overflow: 'hidden' }}
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1, transition: { duration: MOV.base, ease: MOV.enfatico } }}
                    exit={{ height: 0, opacity: 0, transition: { duration: MOV.rapido, ease: MOV.padrao } }}
                >
                    {children}
                </motion.div>
            )}
        </AnimatePresence>
    );
}

// Visto que se desenha (confirmação de "salvo", "aprovado"). tamanho em px.
export function Visto({ tamanho = 16, className = '' }) {
    return (
        <svg className={className} width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <motion.path d="M5 12.5l4.5 4.5L19 7.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.32, ease: MOV.enfatico }} />
        </svg>
    );
}

// Girador para botões ocupados: <button className="btn" aria-busy={ocupado}>{ocupado && <Girador/>}<Ico.salvar/>Salvar</button>
export function Girador({ className = '' }) {
    return <Ico.carregando className={`girador ${className}`} aria-hidden="true" />;
}

// Bloco "carregando" no formato do conteúdo. <Esqueleto linhas={3} /> ou <Esqueleto altura={120} />
export function Esqueleto({ linhas = 1, altura, largura = '100%', className = '' }) {
    if (altura) return <span className={`esqueleto ${className}`} style={{ height: altura, width: largura }} aria-hidden="true" />;
    return (
        <span className={className} style={{ display: 'flex', flexDirection: 'column', gap: 8 }} aria-hidden="true">
            {Array.from({ length: linhas }, (_, i) => (
                <span key={i} className="esqueleto" style={{ height: 12, width: i === linhas - 1 && linhas > 1 ? '62%' : largura }} />
            ))}
        </span>
    );
}

// Estado vazio com ícone e uma ação. <Vazio icone={Ico.series} titulo="..." texto="...">{botão}</Vazio>
export function Vazio({ icone: Icone = Ico.info, titulo, texto, children }) {
    return (
        <motion.div className="vazio" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: MOV.base, ease: MOV.enfatico }}>
            <Icone aria-hidden="true" />
            {titulo && <strong>{titulo}</strong>}
            {texto && <span>{texto}</span>}
            {children}
        </motion.div>
    );
}

// Avisos flutuantes (toasts). Em qualquer tela: avisar('Roteiro salvo', 'ok' | 'erro' | 'aviso' | 'info').
// O <Avisos/> fica uma vez só em routes.jsx.
export function avisar(texto, tipo = 'ok', ms = 3200) {
    window.dispatchEvent(new CustomEvent('estudio:aviso', { detail: { texto, tipo, ms } }));
}
const ICONE_AVISO = { ok: Ico.ok, erro: Ico.erro, aviso: Ico.aviso, info: Ico.info };
export function Avisos() {
    const [lista, setLista] = useState([]);
    useEffect(() => {
        let seq = 0;
        const ao = (e) => {
            const id = ++seq;
            const { texto, tipo = 'ok', ms = 3200 } = e.detail || {};
            setLista((l) => [...l.slice(-3), { id, texto, tipo }]);
            setTimeout(() => setLista((l) => l.filter((a) => a.id !== id)), ms);
        };
        window.addEventListener('estudio:aviso', ao);
        return () => window.removeEventListener('estudio:aviso', ao);
    }, []);
    return (
        <div className="avisos" role="status" aria-live="polite">
            <AnimatePresence initial={false}>
                {lista.map((a) => {
                    const Icone = ICONE_AVISO[a.tipo] || Ico.info;
                    return (
                        <motion.div
                            key={a.id}
                            layout
                            className={`aviso-flut ${a.tipo}`}
                            initial={{ opacity: 0, y: 12, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1, transition: MOV.mola }}
                            exit={{ opacity: 0, x: 24, transition: { duration: MOV.rapido } }}
                        >
                            {a.tipo === 'ok' ? <Visto /> : <Icone aria-hidden="true" />}
                            <span>{a.texto}</span>
                        </motion.div>
                    );
                })}
            </AnimatePresence>
        </div>
    );
}

export { motion, AnimatePresence };
