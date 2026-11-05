// Lado da TELA do motor do navegador: escolhe o armazém, carrega o pacote do backend sob demanda
// (virtual:motor-navegador), liga o service worker das mídias e atende as perguntas dele.
// As telas não usam este arquivo direto: passam por funcionalidades/motor.js e fetchFunc.js.
import {
    armazemInterno, armazemDiretorio, pastaGuardada, pedirPermissao, temOpfsGravavel, temPastaReal,
} from './armazens.js';
import { chaveAtual, simuladoForcado, ouvirChave } from './chave.js';

let motor = null;      // o módulo do pacote (entrada.js)
let info = null;       // { armazem: { tipo, nome }, arquivos, precarregados }
let swPronto = false;

const PREF_ARMAZEM = 'estudio:armazem'; // 'interno' | 'pasta'

export function preferenciaArmazem() {
    try { return localStorage.getItem(PREF_ARMAZEM) === 'pasta' ? 'pasta' : 'interno'; } catch { return 'interno'; }
}
export function definirPreferenciaArmazem(v) {
    try {
        if (v === 'pasta') localStorage.setItem(PREF_ARMAZEM, 'pasta');
        else localStorage.removeItem(PREF_ARMAZEM);
    } catch { /* sem armazenamento */ }
}

export const capacidades = () => ({
    pastaReal: temPastaReal(),
    opfs: temOpfsGravavel(),
    serviceWorker: typeof navigator !== 'undefined' && 'serviceWorker' in navigator && window.isSecureContext,
});

function aplicarChave() {
    if (!motor) return;
    motor.definirChave(chaveAtual());
    motor.definirSimulado(simuladoForcado());
}

// ---------------- service worker das mídias ----------------
async function ligarServiceWorker() {
    if (swPronto) return;
    if (!capacidades().serviceWorker) throw new Error('Este navegador não deixa o site mostrar as mídias sem servidor (precisa de service worker e HTTPS).');
    navigator.serviceWorker.addEventListener('message', async (e) => {
        const msg = e.data;
        if (!msg || msg.tipo !== 'estudio:midia' || !e.ports[0]) return;
        const porta = e.ports[0];
        try {
            const { blob, tipo } = await motor.lerMidia(msg.rota, msg.query || {});
            porta.postMessage({ ok: true, blob, tipo });
        } catch (erro) {
            porta.postMessage({ ok: false, status: erro.status || 500, erro: erro.message });
        }
    });
    navigator.serviceWorker.startMessages();
    const reg = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw-midia.js`, { scope: import.meta.env.BASE_URL });
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
        // primeira visita: o worker assume a aba com clients.claim(); espera até 5 s
        await new Promise((ok) => {
            const t = setTimeout(ok, 5000);
            navigator.serviceWorker.addEventListener('controllerchange', () => { clearTimeout(t); ok(); }, { once: true });
        });
    }
    if (!navigator.serviceWorker.controller) {
        reg.update().catch(() => {});
        throw new Error('O service worker das mídias não assumiu a página. Recarregue a página (F5).');
    }
    swPronto = true;
}

// ---------------- iniciar ----------------
/**
 * prepararArmazem() → { armazem } | { precisaPermissao: handle } (pasta real guardada que o navegador quer reconfirmar)
 */
export async function prepararArmazem({ comGesto = false } = {}) {
    if (preferenciaArmazem() === 'pasta' && temPastaReal()) {
        const g = await pastaGuardada();
        if (g) {
            if (g.permissao !== 'granted') {
                if (!comGesto) return { precisaPermissao: g.handle };
                if (!(await pedirPermissao(g.handle))) return { precisaPermissao: g.handle };
            }
            return { armazem: armazemDiretorio(g.handle, { tipo: 'pasta', nome: `Pasta "${g.handle.name}" do computador` }) };
        }
        definirPreferenciaArmazem('interno');
    }
    return { armazem: await armazemInterno() };
}

export async function iniciarNavegador({ armazem, aoProgresso } = {}) {
    if (info) return info;
    motor = await import('virtual:motor-navegador');
    aplicarChave();
    ouvirChave(aplicarChave);
    await ligarServiceWorker();
    const r = await motor.iniciar({ armazem, aoProgresso });
    let persistente = null;
    try {
        if (navigator.storage && navigator.storage.persist) {
            persistente = await navigator.storage.persisted();
            if (!persistente && armazem.tipo !== 'pasta') persistente = await navigator.storage.persist();
        }
    } catch { persistente = null; }
    info = { ...r, persistente };
    // Gerações de vídeo pendentes de antes (aba fechada no meio): consulta grátis e baixa o que ficou pronto.
    setTimeout(() => { motor.chamar('POST', 'RetomarJobs', { body: {} }).catch(() => {}); }, 1500);
    return info;
}

export const infoNavegador = () => info;
export const rotasSoNoPc = () => (motor ? motor.ROTAS_SO_NO_PC : []);

export async function situacaoNavegador() {
    const s = motor ? motor.situacao() : null;
    let uso = null;
    try { if (navigator.storage && navigator.storage.estimate) uso = await navigator.storage.estimate(); } catch { uso = null; }
    let persistente = null;
    try { if (navigator.storage && navigator.storage.persisted) persistente = await navigator.storage.persisted(); } catch { persistente = null; }
    return { ...s, info, uso, persistente };
}

export async function pedirPersistencia() {
    if (!navigator.storage || !navigator.storage.persist) return false;
    return navigator.storage.persist();
}

/**
 * chamarNavegador('GET'|'POST', '/Rota', params) → corpo (ou { 'ERROR SERVER': msg }), igual ao fetchFunc.
 */
export async function chamarNavegador(metodo, rota, params) {
    if (!motor || !info) return { 'ERROR SERVER': 'O motor do navegador ainda está abrindo as séries. Tente de novo em instantes.' };
    const nome = String(rota).replace(/^\/+/, '');
    const r = await motor.chamar(metodo, nome, metodo === 'GET' ? { query: params || {} } : { body: params || {} });
    const corpo = r.corpo;
    if (r.status >= 400 || (corpo && corpo.Error)) return { 'ERROR SERVER': (corpo && corpo.Error) || `HTTP ${r.status}` };
    // "/dados" não diz nada para quem usa: mostra onde as séries ficam de verdade.
    if (nome === 'Saude' && corpo) return { ...corpo, dados: info.armazem.nome, motor: 'navegador' };
    return corpo;
}
