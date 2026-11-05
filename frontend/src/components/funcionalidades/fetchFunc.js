// Wrapper de fetch nativo (padrão do Rafael). Erro volta como { "ERROR SERVER": mensagem }.
// Passa pelo motor (motor.js): no site publicado, o padrão é o motor que roda DENTRO do navegador
// (motorNavegador/cliente.js); com o Estúdio do PC ligado ou rodando local, é o backend por HTTP.
import GlobalVar from '../subComponents/GlobalVar';
import { motorPronto, modoPronto } from './motor';

const cabecalhos = { Accept: 'application/json', 'Content-Type': 'application/json' };

async function tratar(r) {
    let corpo = null;
    try { corpo = await r.json(); } catch { corpo = null; }
    if (!r.ok || (corpo && corpo.Error)) return { 'ERROR SERVER': (corpo && corpo.Error) || `HTTP ${r.status}` };
    return corpo;
}

function semMotor(m) {
    if (m.modo === 'sem-motor') return 'O Estúdio do PC não está conectado. Abra o "Abrir Estudio.vbs" no computador e clique em "Procurar de novo", ou volte para o motor do navegador em Configurações.';
    if (m.modo === 'precisa-permissao') return 'O navegador precisa que você reabra a pasta das séries (botão "Reabrir a pasta").';
    return m.erro || 'O Estúdio ainda está abrindo. Tente de novo em instantes.';
}

async function chamar(metodo, rota, params) {
    const m = await motorPronto();
    if (!modoPronto(m)) return { 'ERROR SERVER': semMotor(m) };
    if (m.modo === 'navegador') {
        const { chamarNavegador } = await import('../../motorNavegador/cliente.js');
        return chamarNavegador(metodo, rota, params);
    }
    if (metodo === 'GET') {
        const q = params ? `?${new URLSearchParams(params)}` : '';
        return tratar(await fetch(`${GlobalVar.serverBase}${rota}${q}`, { headers: cabecalhos }));
    }
    return tratar(await fetch(`${GlobalVar.serverBase}${rota}`, { method: 'POST', headers: cabecalhos, body: JSON.stringify(params || {}) }));
}

export const fetchGet = async (rota, params) => {
    try {
        return await chamar('GET', rota, params);
    } catch (error) {
        return { 'ERROR SERVER': error.message };
    }
};

export const fetchPost = async (rota, body) => {
    try {
        return await chamar('POST', rota, body);
    } catch (error) {
        return { 'ERROR SERVER': error.message };
    }
};

export const erroDe = (r) => (r && r['ERROR SERVER']) || null;
