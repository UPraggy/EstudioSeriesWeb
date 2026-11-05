import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import GlobalVar from './subComponents/GlobalVar';
import { ListarSeries, SaldoOpenRouter } from './funcionalidades/bancoGet';
import { erroDe } from './funcionalidades/fetchFunc';
import { saldoDisponivel } from './subComponents/ConfirmarCusto';
import { Ico } from './subComponents/icones';
import { Contador, MOV, motion, AnimatePresence } from './subComponents/Movimento';
import '../assets/css/TopMenu.css';

const LINKS = [
    { para: '/', rotulo: 'Séries', icone: Ico.series, fim: true },
    { para: '/geracao-simples', rotulo: 'Geração simples', icone: Ico.geracaoSimples },
    { para: '/custos', rotulo: 'Custos', icone: Ico.custos },
    { para: '/configuracoes', rotulo: 'Configurações', icone: Ico.config },
];

// "Séries" continua marcado dentro de uma série (sala e Mesa).
const ativoExtra = (link, caminho) => link.para === '/' && caminho.startsWith('/serie/');
const estaAtivo = (link, caminho) => (link.fim ? caminho === link.para : caminho.startsWith(link.para)) || ativoExtra(link, caminho);

// Onde o Rafael parou (Sala ou Mesa de qual episódio): a tela de Séries usa para o "Continuar de onde parou".
export const CHAVE_ULTIMO_LUGAR = 'estudio:ultimoLugar';
export function lerUltimoLugar() {
    const l = GlobalVar.getLocalStorage(CHAVE_ULTIMO_LUGAR, null);
    return l && typeof l.serie === 'string' ? l : null;
}

// Títulos das séries para as migalhas (cache do módulo: uma consulta por série nova).
const titulos = new Map();

function migalhasDe(caminho, titulo) {
    const m = caminho.match(/^\/serie\/([^/]+)(?:\/ep\/(\d+))?/);
    if (m) {
        const lista = [{ rotulo: 'Séries', para: '/' }, { rotulo: titulo || m[1], para: `/serie/${m[1]}` }];
        if (m[2]) lista.push({ rotulo: `Ep. ${Number(m[2])}`, para: caminho });
        return lista;
    }
    if (caminho.startsWith('/geracao-simples')) return [{ rotulo: 'Geração simples', para: caminho }];
    if (caminho.startsWith('/custos')) return [{ rotulo: 'Custos', para: caminho }];
    if (caminho.startsWith('/configuracoes')) return [{ rotulo: 'Configurações', para: caminho }];
    return [{ rotulo: 'Séries', para: '/' }];
}

function estadoSaldo(saldo) {
    if (!saldo) return { tipo: 'carregando', titulo: 'Consultando o saldo da chave' };
    if (erroDe(saldo)) return { tipo: 'texto', valor: 'indisponível', titulo: erroDe(saldo) };
    if (saldo.simulado) return { tipo: 'simulado', valor: 'Modo simulado', titulo: 'Modo simulado: nada é cobrado e o saldo não é consultado' };
    const d = saldoDisponivel(saldo);
    if (d === null) return { tipo: 'texto', valor: 'sem limite', titulo: 'A chave não tem limite definido' };
    return { tipo: 'numero', valor: d, titulo: 'Saldo disponível na chave do OpenRouter. Abrir os custos.' };
}

// Símbolo da marca: um quadro 9:16 com marcas de registro de filme nos cantos e a cruz do centro.
function Simbolo() {
    return (
        <svg className="topo-simbolo" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="9.5" y="6" width="9" height="16" rx="1.2" />
            <path d="M3.5 6h3.5M9.5 1.5V3.5M21 6h3.5M18.5 1.5V3.5M3.5 22h3.5M9.5 24.5v2M21 22h3.5M18.5 24.5v2" />
            <path d="M14 12.4v3.2M12.4 14h3.2" strokeWidth="1.3" />
        </svg>
    );
}

function Marca({ comoLink = true }) {
    const conteudo = (<><Simbolo /><span className="topo-marca-nome">Estúdio de Séries</span></>);
    return comoLink
        ? <Link to="/" className="topo-marca" aria-label="Estúdio de Séries: início">{conteudo}</Link>
        : <span className="topo-marca">{conteudo}</span>;
}

// Saldo da chave: número que corre quando muda e, se baixou por uma geração, mostra quanto saiu.
function Saldo({ saldo, compacto = false }) {
    const s = estadoSaldo(saldo);
    const anterior = useRef(null);
    const [delta, setDelta] = useState(null);

    useEffect(() => {
        if (s.tipo !== 'numero') return undefined;
        const antes = anterior.current;
        anterior.current = s.valor;
        if (antes === null || Math.abs(antes - s.valor) < 0.0005) return undefined;
        setDelta({ id: Date.now(), valor: s.valor - antes });
        const t = setTimeout(() => setDelta(null), 2200);
        return () => clearTimeout(t);
    }, [s.tipo, s.valor]);

    let valor;
    if (s.tipo === 'carregando') valor = <span className="topo-saldo-carregando" aria-label="Consultando">…</span>;
    else if (s.tipo === 'numero') valor = <Contador valor={s.valor} formatar={GlobalVar.usd} className="topo-saldo-valor" />;
    else valor = <span className="topo-saldo-valor texto">{s.valor}</span>;

    const Icone = s.tipo === 'simulado' ? Ico.simulado : Ico.saldo;
    return (
        <Link to="/custos" className={`topo-saldo${s.tipo === 'simulado' ? ' simulado' : ''}${compacto ? ' compacto' : ''}`} title={s.titulo}>
            <Icone className="topo-saldo-ico" aria-hidden="true" />
            <span className="topo-saldo-rot">{s.tipo === 'simulado' ? '' : 'Saldo'}</span>
            {valor}
            <AnimatePresence>
                {delta && (
                    <motion.span
                        key={delta.id}
                        className={`topo-saldo-delta num${delta.valor < 0 ? ' saiu' : ''}`}
                        aria-hidden="true"
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0, transition: { duration: MOV.base, ease: MOV.enfatico } }}
                        exit={{ opacity: 0, y: -8, transition: { duration: MOV.lento } }}
                    >
                        {delta.valor < 0 ? '−' : '+'}{GlobalVar.usdFino(Math.abs(delta.valor)).replace('US$ ', 'US$ ')}
                    </motion.span>
                )}
            </AnimatePresence>
        </Link>
    );
}

export default function TopMenu({ ativaResp }) {
    const { pathname } = useLocation();
    const [saldo, setSaldo] = useState(null);
    const [, setVersao] = useState(0);
    const [menuAberto, setMenuAberto] = useState(false);
    const botaoMenu = useRef(null);
    const gaveta = useRef(null);
    const primeiroLink = useRef(null);

    const carregarSaldo = useCallback(() => {
        SaldoOpenRouter().then(setSaldo);
    }, []);

    // Saldo ao abrir, depois de qualquer geração paga (as telas disparam "estudio:gasto")
    // e quando o site publicado se conecta ao Estúdio do PC (motor híbrido: "estudio:motor").
    useEffect(() => {
        carregarSaldo();
        const aoMotor = (e) => { if (e.detail && (e.detail.modo === 'ajudante' || e.detail.modo === 'navegador')) carregarSaldo(); };
        window.addEventListener('estudio:gasto', carregarSaldo);
        window.addEventListener('estudio:chave', carregarSaldo);
        window.addEventListener('estudio:motor', aoMotor);
        return () => {
            window.removeEventListener('estudio:gasto', carregarSaldo);
            window.removeEventListener('estudio:chave', carregarSaldo);
            window.removeEventListener('estudio:motor', aoMotor);
        };
    }, [carregarSaldo]);

    // Título da série na migalha.
    const idSerie = (pathname.match(/^\/serie\/([^/]+)/) || [])[1];
    useEffect(() => {
        if (!idSerie || titulos.has(idSerie)) return;
        ListarSeries().then((r) => {
            if (erroDe(r)) return;
            (r.series || []).forEach((s) => titulos.set(s.id, s.titulo));
            setVersao((v) => v + 1);
        });
    }, [idSerie]);

    // Guarda onde parou (Sala ou Mesa) para o "Continuar de onde parou".
    useEffect(() => {
        const m = pathname.match(/^\/serie\/([^/]+)(?:\/ep\/(\d+))?/);
        if (m) GlobalVar.setLocalStorage(CHAVE_ULTIMO_LUGAR, { serie: decodeURIComponent(m[1]), ep: m[2] ? Number(m[2]) : null, em: Date.now() });
    }, [pathname]);

    // Fecha o menu ao trocar de página.
    useEffect(() => { setMenuAberto(false); }, [pathname]);

    const fecharMenu = useCallback((devolverFoco = true) => {
        setMenuAberto(false);
        if (devolverFoco) requestAnimationFrame(() => botaoMenu.current && botaoMenu.current.focus());
    }, []);

    // Gaveta aberta: foco no primeiro link, Esc fecha e devolve o foco, Tab fica dentro da gaveta.
    useEffect(() => {
        if (!menuAberto) return undefined;
        primeiroLink.current && primeiroLink.current.focus();
        const tecla = (e) => {
            if (e.key === 'Escape') { e.preventDefault(); fecharMenu(); return; }
            if (e.key !== 'Tab' || !gaveta.current) return;
            const focaveis = [...gaveta.current.querySelectorAll('a[href], button:not([disabled])')];
            if (!focaveis.length) return;
            const primeiro = focaveis[0];
            const ultimo = focaveis[focaveis.length - 1];
            if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
            else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
        };
        document.addEventListener('keydown', tecla);
        return () => document.removeEventListener('keydown', tecla);
    }, [menuAberto, fecharMenu]);

    const migalhas = migalhasDe(pathname, idSerie ? titulos.get(idSerie) : null);

    return (
        <header className={`topo${ativaResp ? ' topo-resp' : ''}`}>
            <div className="topo-int">
                <Marca />
                <nav className="topo-migalhas" aria-label="Você está em">
                    <ol>
                        {migalhas.map((m, i) => (
                            <li key={m.para + i}>
                                {i > 0 && <Ico.direita className="topo-migalhas-sep" aria-hidden="true" />}
                                {i === migalhas.length - 1
                                    ? <span aria-current="page">{m.rotulo}</span>
                                    : <Link to={m.para}>{m.rotulo}</Link>}
                            </li>
                        ))}
                    </ol>
                </nav>
                <nav className="topo-nav" aria-label="Principal">
                    {LINKS.map((l) => {
                        const ativo = estaAtivo(l, pathname);
                        const Icone = l.icone;
                        return (
                            <NavLink key={l.para} to={l.para} end={l.fim} className={ativo ? 'ativo' : ''} aria-current={ativo ? 'page' : undefined}>
                                <Icone aria-hidden="true" />
                                <span>{l.rotulo}</span>
                                {ativo && <motion.span layoutId="topo-nav-marca" className="topo-nav-marca" transition={MOV.mola} />}
                            </NavLink>
                        );
                    })}
                </nav>
                <Saldo saldo={saldo} />
                <button
                    ref={botaoMenu}
                    type="button"
                    className="btn fantasma icone topo-menu-btn"
                    aria-label="Abrir menu"
                    title="Menu"
                    aria-expanded={menuAberto}
                    aria-controls="topo-gaveta"
                    onClick={() => setMenuAberto(true)}
                >
                    <Ico.menu aria-hidden="true" />
                </button>
            </div>

            <AnimatePresence>
                {menuAberto && (
                    <motion.div
                        key="veu"
                        className="topo-veu"
                        aria-hidden="true"
                        onClick={() => fecharMenu()}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1, transition: { duration: MOV.base, ease: MOV.padrao } }}
                        exit={{ opacity: 0, transition: { duration: MOV.rapido, ease: MOV.padrao } }}
                    />
                )}
                {menuAberto && (
                    <motion.aside
                        key="gaveta"
                        ref={gaveta}
                        id="topo-gaveta"
                        className="topo-gaveta"
                        role="dialog"
                        aria-modal="true"
                        aria-label="Menu"
                        initial={{ x: '100%' }}
                        animate={{ x: 0, transition: { duration: MOV.base, ease: MOV.enfatico } }}
                        exit={{ x: '100%', transition: { duration: MOV.rapido, ease: MOV.padrao } }}
                    >
                        <div className="topo-gaveta-cab">
                            <Marca comoLink={false} />
                            <button type="button" className="btn fantasma icone" aria-label="Fechar menu" title="Fechar (Esc)" onClick={() => fecharMenu()}>
                                <Ico.fechar aria-hidden="true" />
                            </button>
                        </div>
                        <nav aria-label="Principal (menu)">
                            {LINKS.map((l, i) => {
                                const ativo = estaAtivo(l, pathname);
                                const Icone = l.icone;
                                return (
                                    <motion.div
                                        key={l.para}
                                        initial={{ opacity: 0, x: 12 }}
                                        animate={{ opacity: 1, x: 0, transition: { delay: 0.06 + i * MOV.escalonar, duration: MOV.base, ease: MOV.enfatico } }}
                                    >
                                        <NavLink
                                            to={l.para}
                                            end={l.fim}
                                            ref={i === 0 ? primeiroLink : undefined}
                                            className={ativo ? 'ativo' : ''}
                                            aria-current={ativo ? 'page' : undefined}
                                            onClick={() => fecharMenu(false)}
                                        >
                                            <Icone aria-hidden="true" />
                                            <span>{l.rotulo}</span>
                                            {ativo && <Ico.direita className="topo-gaveta-ativo" aria-hidden="true" />}
                                        </NavLink>
                                    </motion.div>
                                );
                            })}
                        </nav>
                        <div className="topo-gaveta-saldo">
                            <span>Saldo da chave</span>
                            <Saldo saldo={saldo} compacto />
                        </div>
                    </motion.aside>
                )}
            </AnimatePresence>
        </header>
    );
}
