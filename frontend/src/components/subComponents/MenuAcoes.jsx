import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Ico } from './icones';
import { AnimatePresence, MOV, motion } from './Movimento';
import '../../assets/css/MenuAcoes.css';

const ALTURA_ITEM = 40;

/**
 * Menu "Mais ações": botão (⋯) + lista flutuante. A lista vai num portal com posição fixa, então não é cortada
 * por pais com overflow: hidden (pôster, cabeçalho de cena).
 * Teclado: Enter/Espaço/↓ abre e foca o 1º item; ↑ ↓ Home End navegam; Esc fecha e devolve o foco; Tab fecha.
 * Clique fora, rolar a página ou redimensionar fecham.
 * itens: [{ id, rotulo, icone, perigo, dica, desabilitado, onSelecionar }] — os de perigo ficam por último,
 * depois de uma linha (zona de perigo).
 * classeBotao: classe do gatilho (padrão "btn icone"); texto: rótulo visível opcional ao lado do ícone.
 */
export default function MenuAcoes({ itens = [], rotulo = 'Mais ações', classeBotao = 'btn icone', texto, alinhar = 'fim', className = '' }) {
    const id = useId();
    const botao = useRef(null);
    const lista = useRef(null);
    const [aberto, setAberto] = useState(false);
    const [pos, setPos] = useState(null);

    const comuns = itens.filter((i) => !i.perigo);
    const perigosos = itens.filter((i) => i.perigo);
    const ordem = [...comuns, ...perigosos];

    // Abaixo do botão; se não couber, acima. Alinhado pela borda direita (fim) ou esquerda (inicio).
    useLayoutEffect(() => {
        if (!aberto || !botao.current) return;
        const r = botao.current.getBoundingClientRect();
        const altura = ordem.length * ALTURA_ITEM + 20;
        const cabeAbaixo = r.bottom + 6 + altura <= window.innerHeight - 8;
        const p = cabeAbaixo ? { top: r.bottom + 6 } : { bottom: window.innerHeight - r.top + 6 };
        if (alinhar === 'inicio') p.left = Math.max(8, r.left);
        else p.right = Math.max(8, window.innerWidth - r.right);
        p.origem = `${alinhar === 'inicio' ? 'left' : 'right'} ${cabeAbaixo ? 'top' : 'bottom'}`;
        setPos(p);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [aberto]);

    // Foco no primeiro item ao abrir.
    useEffect(() => {
        if (!aberto || !pos) return;
        const primeiro = lista.current && lista.current.querySelector('[role="menuitem"]:not(:disabled)');
        if (primeiro) primeiro.focus();
    }, [aberto, pos]);

    // Fecha no clique fora, ao rolar e ao redimensionar.
    useEffect(() => {
        if (!aberto) return undefined;
        const fora = (e) => {
            if (lista.current && lista.current.contains(e.target)) return;
            if (botao.current && botao.current.contains(e.target)) return;
            setAberto(false);
        };
        const fechar = () => setAberto(false);
        document.addEventListener('pointerdown', fora, true);
        window.addEventListener('scroll', fechar, true);
        window.addEventListener('resize', fechar);
        return () => {
            document.removeEventListener('pointerdown', fora, true);
            window.removeEventListener('scroll', fechar, true);
            window.removeEventListener('resize', fechar);
        };
    }, [aberto]);

    function fecharEVoltar() {
        setAberto(false);
        if (botao.current) botao.current.focus();
    }

    function teclaBotao(e) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            setAberto(true);
        }
    }

    function teclaLista(e) {
        const botoes = [...lista.current.querySelectorAll('[role="menuitem"]:not(:disabled)')];
        const i = botoes.indexOf(document.activeElement);
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fecharEVoltar(); return; }
        if (e.key === 'Tab') { setAberto(false); return; }
        let alvo = null;
        if (e.key === 'ArrowDown') alvo = botoes[(i + 1) % botoes.length];
        else if (e.key === 'ArrowUp') alvo = botoes[(i - 1 + botoes.length) % botoes.length];
        else if (e.key === 'Home') alvo = botoes[0];
        else if (e.key === 'End') alvo = botoes[botoes.length - 1];
        if (alvo) { e.preventDefault(); alvo.focus(); }
    }

    // O foco volta ao gatilho ANTES da ação: o diálogo que ela abre devolve o foco para ele ao fechar.
    function escolher(item) {
        if (item.desabilitado) return;
        fecharEVoltar();
        item.onSelecionar && item.onSelecionar();
    }

    const renderItem = (item) => {
        const Icone = item.icone;
        return (
            <button
                key={item.id}
                type="button"
                role="menuitem"
                className={`menu-acoes-item${item.perigo ? ' perigo' : ''}`}
                disabled={item.desabilitado}
                title={item.dica || undefined}
                onClick={() => escolher(item)}
            >
                {Icone && <Icone aria-hidden="true" />}
                <span>{item.rotulo}</span>
            </button>
        );
    };

    return (
        <span className={`menu-acoes ${className}`}>
            <button
                ref={botao}
                type="button"
                id={`${id}-gatilho`}
                className={classeBotao}
                aria-haspopup="menu"
                aria-expanded={aberto}
                aria-controls={aberto ? `${id}-lista` : undefined}
                aria-label={texto ? undefined : rotulo}
                title={rotulo}
                onClick={() => setAberto((a) => !a)}
                onKeyDown={teclaBotao}
            >
                <Ico.maisAcoes aria-hidden="true" />
                {texto && <span>{texto}</span>}
            </button>
            {createPortal(
                <AnimatePresence>
                    {aberto && pos && (
                        <motion.div
                            ref={lista}
                            key="lista"
                            id={`${id}-lista`}
                            role="menu"
                            aria-labelledby={`${id}-gatilho`}
                            className="menu-acoes-pop"
                            style={{ top: pos.top, bottom: pos.bottom, left: pos.left, right: pos.right, transformOrigin: pos.origem }}
                            initial={{ opacity: 0, scale: 0.96 }}
                            animate={{ opacity: 1, scale: 1, transition: { duration: MOV.rapido, ease: MOV.enfatico } }}
                            exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.1 } }}
                            onKeyDown={teclaLista}
                        >
                            {comuns.map(renderItem)}
                            {comuns.length > 0 && perigosos.length > 0 && <div className="menu-acoes-sep" role="separator" />}
                            {perigosos.map(renderItem)}
                        </motion.div>
                    )}
                </AnimatePresence>,
                document.body,
            )}
        </span>
    );
}
