import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { Ico } from './icones';
import '../../assets/css/Dialogo.css';

const SAIDA_MS = 150;

// Diálogo modal com o <dialog> nativo: prende o foco, Esc fecha (a não ser que "travado"), sem fechar no clique fora.
// Uso: <Dialogo aberto titulo="..." onFechar={fn} rodape={<botões/>} icone={Ico.custo}>conteúdo</Dialogo>
// Movimento: entra com escala 0.96 → 1 e o véu esmaece (CSS); ao fechar, o último conteúdo fica na tela por
// ~150 ms, inerte (não aceita clique nem teclado), enquanto sai. Quem decide abrir/fechar continua sendo o dono do estado.
export default function Dialogo({ aberto, titulo, descricao, onFechar, rodape, children, largura = 520, travado = false, id, icone: Icone }) {
    const ref = useRef(null);
    const idTitulo = `${id || 'dlg'}-titulo`;
    const reduzido = useReducedMotion();
    const [montado, setMontado] = useState(Boolean(aberto));
    const ultimo = useRef(null);
    if (aberto) ultimo.current = { titulo, descricao, rodape, children, Icone };
    const saindo = !aberto && montado;

    useEffect(() => {
        const d = ref.current;
        if (!d) return undefined;
        if (aberto) {
            setMontado(true);
            if (!d.open) {
                d.showModal();
                // Foco inicial: o elemento marcado com data-foco; senão o primeiro campo. (autoFocus do React não vale aqui:
                // ele roda antes do showModal.) Num diálogo de gasto, data-foco fica no "Cancelar".
                const alvo = d.querySelector('[data-foco]') || d.querySelector('input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])');
                if (alvo) alvo.focus();
            }
            return undefined;
        }
        if (d.open) {
            const t = setTimeout(() => {
                if (d.open) d.close();
                setMontado(false);
            }, reduzido ? 0 : SAIDA_MS);
            return () => clearTimeout(t);
        }
        setMontado(false);
        return undefined;
    }, [aberto, reduzido]);

    // Esc dispara "cancel": quem decide fechar é o dono do estado.
    function aoCancelar(e) {
        e.preventDefault();
        if (aberto && !travado && onFechar) onFechar();
    }

    const c = aberto ? { titulo, descricao, rodape, children, Icone } : (saindo ? ultimo.current : null);

    return (
        <dialog ref={ref} className={`dlg${saindo ? ' saindo' : ''}`} style={{ maxWidth: largura }} onCancel={aoCancelar} aria-labelledby={idTitulo}>
            {c && (
                <div className="dlg-int" inert={saindo ? '' : undefined}>
                    <div className="dlg-cab">
                        <div className="dlg-cab-linha">
                            {c.Icone && <span className="dlg-icone" aria-hidden="true"><c.Icone /></span>}
                            <h2 id={idTitulo}>{c.titulo}</h2>
                            {onFechar && (
                                <button
                                    type="button"
                                    className="btn fantasma icone mini dlg-fechar"
                                    aria-label="Fechar"
                                    title="Fechar (Esc)"
                                    disabled={travado}
                                    onClick={() => { if (aberto && !travado) onFechar(); }}
                                >
                                    <Ico.fechar aria-hidden="true" />
                                </button>
                            )}
                        </div>
                        {c.descricao && <p className="dlg-desc">{c.descricao}</p>}
                    </div>
                    <div className="dlg-corpo">{c.children}</div>
                    {c.rodape && <div className="dlg-rodape">{c.rodape}</div>}
                </div>
            )}
        </dialog>
    );
}
