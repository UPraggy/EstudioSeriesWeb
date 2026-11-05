// Motor híbrido: decide QUEM faz o trabalho pesado (arquivos das séries, vozes, IA, montagem).
//  - "local":     rodando pelo Abrir Estudio.vbs / npm run dev — o backend está na mesma origem (/api).
//  - "ajudante":  site publicado (GitHub Pages) que achou o Estúdio aberto no PC (http://127.0.0.1:4190).
//  - "sem-motor": site publicado sem o Estúdio do PC. Ainda não existe motor no navegador (etapas 2–4 de
//                 docs/PUBLICAR-SEM-BACKEND.md); a tela SemMotor explica isso com honestidade.
// Ponto único de troca: GlobalVar.serverBase (fetchFunc e as URLs de mídia usam só ele).
import GlobalVar from '../subComponents/GlobalVar';

export const NO_PAGES = import.meta.env.VITE_DESTINO === 'pages';
const CHAVE_ENDERECO = 'estudio:ajudante';
const PADRAO = import.meta.env.VITE_AJUDANTE || 'http://127.0.0.1:4190';
// O Chrome 142+ pode abrir a pergunta "acessar apps do seu dispositivo"; enquanto ela está aberta o fetch espera.
// Servidor desligado responde na hora (conexão recusada), então o tempo longo só pesa quando há pergunta na tela.
const ESPERA_MS = 20000;

let estado = { modo: NO_PAGES ? 'procurando' : 'local', endereco: NO_PAGES ? null : '', erro: null };
let promessa = null;

function mudar(novo) {
    estado = novo;
    window.dispatchEvent(new CustomEvent('estudio:motor', { detail: estado }));
}

export const estadoMotor = () => estado;

export function ouvirMotor(fn) {
    const f = (e) => fn(e.detail);
    window.addEventListener('estudio:motor', f);
    return () => window.removeEventListener('estudio:motor', f);
}

export function enderecoAjudante() {
    return GlobalVar.getLocalStorage(CHAVE_ENDERECO, null) || PADRAO;
}

// Aceita "127.0.0.1:4190", "http://192.168.0.10:4190/" ou ".../api"; devolve a origem limpa ou null se inválido.
export function normalizarEndereco(texto) {
    let t = String(texto || '').trim();
    if (!t) return null;
    if (!/^https?:\/\//i.test(t)) t = `http://${t}`;
    try {
        const u = new URL(t);
        return `${u.protocol}//${u.host}`;
    } catch {
        return null;
    }
}

export function definirEndereco(texto) {
    const e = normalizarEndereco(texto);
    if (!e) return null;
    if (e === PADRAO) {
        try { localStorage.removeItem(CHAVE_ENDERECO); } catch { /* sem armazenamento: fica só nesta aba */ }
    } else {
        GlobalVar.setLocalStorage(CHAVE_ENDERECO, e);
    }
    return e;
}

export function procurarMotor() {
    if (!NO_PAGES) {
        GlobalVar.serverBase = '/api';
        mudar({ modo: 'local', endereco: '', erro: null });
        promessa = Promise.resolve(estado);
        return promessa;
    }
    const base = enderecoAjudante();
    mudar({ modo: 'procurando', endereco: base, erro: null });
    promessa = (async () => {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), ESPERA_MS);
        try {
            const r = await fetch(`${base}/api/Saude`, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
            const j = await r.json().catch(() => null);
            if (!r.ok || !j || !j.ok) throw new Error(`resposta inesperada (HTTP ${r.status})`);
            GlobalVar.serverBase = `${base}/api`;
            mudar({ modo: 'ajudante', endereco: base, erro: null, chave: Boolean(j.chaveOpenRouter) });
        } catch (e) {
            const erro = e.name === 'AbortError'
                ? `O Estúdio do PC não respondeu em ${ESPERA_MS / 1000} s.`
                : 'Não encontrei o Estúdio do PC neste endereço.';
            mudar({ modo: 'sem-motor', endereco: base, erro, detalhe: e.message });
        } finally {
            clearTimeout(timer);
        }
        return estado;
    })();
    return promessa;
}

// fetchFunc espera a primeira procura antes de qualquer chamada (assim nenhuma tela dispara pedidos à toa).
export const motorPronto = () => promessa || procurarMotor();
