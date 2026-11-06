import { useEffect, useRef, useState } from 'react';
import { BrowserRouter, HashRouter, Routes, Route, useLocation } from 'react-router-dom';
import { AnimatePresence, MotionConfig } from 'framer-motion';
import TopMenu from './components/TopMenu';
import Series from './components/Series';
import SalaShowrunner from './components/SalaShowrunner';
import MesaEditor from './components/mesa/MesaEditor';
import GeracaoSimples from './components/GeracaoSimples';
import Custos from './components/Custos';
import Registro from './components/Registro';
import SemMotor from './components/SemMotor';
import { Pagina, Avisos, avisar } from './components/subComponents/Movimento';
import { NO_PAGES, estadoMotor, ouvirMotor, motorPronto } from './components/funcionalidades/motor';

// Rotas:
//   /                         -> Minhas séries
//   /serie/:id                -> Sala do showrunner (painel da série)
//   /serie/:id/ep/:n          -> Mesa de decupagem / editor do episódio
//   /geracao-simples          -> Geração simples (anexos + pedido)
//   /custos                   -> Custos e saldo
//   /registro                 -> Registro (log/histórico de como o Estúdio está rodando)
// Uma única entrada orquestrada por troca de página (<Pagina/>); o resto do movimento responde a ações.
// No site publicado (GitHub Pages) as rotas vão depois do "#" (HashRouter): recarregar não dá 404.
const Roteador = NO_PAGES ? HashRouter : BrowserRouter;

// Estado do motor híbrido (motor.js): "local", "ajudante", "procurando" ou "sem-motor".
function useMotor() {
    const [m, setM] = useState(estadoMotor());
    const anterior = useRef(m.modo);
    useEffect(() => {
        const parar = ouvirMotor((novo) => {
            if (NO_PAGES && novo.modo === 'ajudante' && anterior.current !== 'ajudante') avisar('Conectado ao Estúdio do PC');
            anterior.current = novo.modo;
            setM(novo);
        });
        setM(estadoMotor()); // a procura pode ter começado antes (o TopMenu chama o saldo primeiro)
        motorPronto().then(setM);
        return parar;
    }, []);
    return m;
}

function Paginas({ ativaResp }) {
    const location = useLocation();
    const motor = useMotor();
    if (NO_PAGES && motor.modo !== 'ajudante') return <SemMotor estado={motor} />;
    return (
        <AnimatePresence mode="wait" initial={false}>
            <Routes location={location} key={location.pathname}>
                <Route path="/" element={<Pagina><Series ativaResp={ativaResp} /></Pagina>} />
                <Route path="/serie/:id" element={<Pagina><SalaShowrunner ativaResp={ativaResp} /></Pagina>} />
                <Route path="/serie/:id/ep/:n" element={<Pagina className="pagina-mesa"><MesaEditor ativaResp={ativaResp} /></Pagina>} />
                <Route path="/geracao-simples" element={<Pagina><GeracaoSimples ativaResp={ativaResp} /></Pagina>} />
                <Route path="/custos" element={<Pagina><Custos ativaResp={ativaResp} /></Pagina>} />
                <Route path="/registro" element={<Pagina><Registro ativaResp={ativaResp} /></Pagina>} />
            </Routes>
        </AnimatePresence>
    );
}

export default function Router() {
    const [ativaResp, setAtivaResp] = useState(null);
    useEffect(() => {
        if (ativaResp == null) setAtivaResp(window.matchMedia('(max-width: 767px)').matches);
    }, [ativaResp]);

    return (
        <MotionConfig reducedMotion="user">
            <Roteador>
                <div className="containerPrincipal">
                    <TopMenu ativaResp={ativaResp} />
                    <Paginas ativaResp={ativaResp} />
                    <Avisos />
                </div>
            </Roteador>
        </MotionConfig>
    );
}
