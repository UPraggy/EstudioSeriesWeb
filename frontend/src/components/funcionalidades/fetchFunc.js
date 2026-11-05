// Wrapper de fetch nativo (padrão do Rafael). Erro volta como { "ERROR SERVER": mensagem }.
// Passa pelo motor híbrido (motor.js): no site publicado, só chama depois de achar o Estúdio do PC.
import GlobalVar from '../subComponents/GlobalVar';
import { motorPronto } from './motor';

const cabecalhos = { Accept: 'application/json', 'Content-Type': 'application/json' };
const SEM_MOTOR = 'O Estúdio do PC não está conectado. Abra o "Abrir Estudio.vbs" no computador e clique em "Procurar de novo".';

async function tratar(r) {
    let corpo = null;
    try { corpo = await r.json(); } catch { corpo = null; }
    if (!r.ok || (corpo && corpo.Error)) return { 'ERROR SERVER': (corpo && corpo.Error) || `HTTP ${r.status}` };
    return corpo;
}

async function motorOk() {
    const m = await motorPronto();
    return m.modo === 'local' || m.modo === 'ajudante';
}

export const fetchGet = async (rota, params) => {
    try {
        if (!(await motorOk())) return { 'ERROR SERVER': SEM_MOTOR };
        const q = params ? `?${new URLSearchParams(params)}` : '';
        return await tratar(await fetch(`${GlobalVar.serverBase}${rota}${q}`, { headers: cabecalhos }));
    } catch (error) {
        return { 'ERROR SERVER': error.message };
    }
};

export const fetchPost = async (rota, body) => {
    try {
        if (!(await motorOk())) return { 'ERROR SERVER': SEM_MOTOR };
        return await tratar(await fetch(`${GlobalVar.serverBase}${rota}`, { method: 'POST', headers: cabecalhos, body: JSON.stringify(body || {}) }));
    } catch (error) {
        return { 'ERROR SERVER': error.message };
    }
};

export const erroDe = (r) => (r && r['ERROR SERVER']) || null;
