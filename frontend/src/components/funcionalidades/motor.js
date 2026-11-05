// Motor: decide QUEM faz o trabalho (arquivos das séries, IA, gerações).
//  - "local":      rodando pelo Abrir Estudio.vbs / npm run dev — o backend está na mesma origem (/api).
//  - "navegador":  site publicado (GitHub Pages). O próprio backend roda DENTRO do navegador (motorNavegador/),
//                  com as séries no armazenamento do navegador ou numa pasta do computador. É o padrão do site.
//  - "ajudante":   site publicado usando o Estúdio aberto no PC (http://127.0.0.1:4190). Opção em Configurações.
// Estados de passagem: "procurando" (ajudante), "iniciando" (navegador abrindo as séries), "precisa-permissao"
// (pasta do computador que o navegador quer reconfirmar com um clique), "sem-motor" (ajudante não respondeu)
// e "erro" (o motor do navegador não abriu).
// Ponto único de troca: GlobalVar.serverBase (fetchFunc e as URLs de mídia usam só ele).
import GlobalVar from '../subComponents/GlobalVar';

export const NO_PAGES = import.meta.env.VITE_DESTINO === 'pages';
const CHAVE_ENDERECO = 'estudio:ajudante';
const CHAVE_PREFERIDO = 'estudio:motorPreferido'; // 'navegador' (padrão) | 'ajudante'
const PADRAO = import.meta.env.VITE_AJUDANTE || 'http://127.0.0.1:4190';
// O Chrome 142+ pode abrir a pergunta "acessar apps do seu dispositivo"; enquanto ela está aberta o fetch espera.
// Servidor desligado responde na hora (conexão recusada), então o tempo longo só pesa quando há pergunta na tela.
const ESPERA_MS = 20000;
// No modo navegador as mídias são URLs comuns que o service worker (public/sw-midia.js) atende.
const BASE_NAVEGADOR = `${import.meta.env.BASE_URL}__motor`;

let estado = { modo: NO_PAGES ? 'iniciando' : 'local', endereco: NO_PAGES ? null : '', erro: null };
let promessa = null;

function mudar(novo) {
    estado = novo;
    window.dispatchEvent(new CustomEvent('estudio:motor', { detail: estado }));
}

export const estadoMotor = () => estado;
export const modoPronto = (m = estado) => m.modo === 'local' || m.modo === 'ajudante' || m.modo === 'navegador';

export function ouvirMotor(fn) {
    const f = (e) => fn(e.detail);
    window.addEventListener('estudio:motor', f);
    return () => window.removeEventListener('estudio:motor', f);
}

export function motorPreferido() {
    return GlobalVar.getLocalStorage(CHAVE_PREFERIDO, 'navegador') === 'ajudante' ? 'ajudante' : 'navegador';
}

// Troca o motor do site e recarrega a página (o motor do navegador não "desliga" no meio).
export function trocarMotor(preferido) {
    if (preferido === 'ajudante') GlobalVar.setLocalStorage(CHAVE_PREFERIDO, 'ajudante');
    else { try { localStorage.removeItem(CHAVE_PREFERIDO); } catch { /* sem armazenamento */ } }
    window.location.reload();
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

async function procurarAjudante() {
    const base = enderecoAjudante();
    mudar({ modo: 'procurando', endereco: base, erro: null });
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
}

async function iniciarNavegador({ comGesto = false } = {}) {
    mudar({ modo: 'iniciando', etapa: 'Abrindo o armazenamento', progresso: null, erro: null });
    try {
        const cli = await import('../../motorNavegador/cliente.js');
        const chave = await import('../../motorNavegador/chave.js');
        const login = await chave.concluirLoginOpenRouter();
        const prep = await cli.prepararArmazem({ comGesto });
        if (prep.precisaPermissao) {
            mudar({ modo: 'precisa-permissao', pasta: prep.precisaPermissao.name, erro: null, login });
            return estado;
        }
        mudar({ modo: 'iniciando', etapa: `Abrindo as séries (${prep.armazem.nome})`, progresso: null, erro: null });
        const info = await cli.iniciarNavegador({
            armazem: prep.armazem,
            aoProgresso: (feitos, total) => mudar({ ...estado, progresso: total ? feitos / total : null }),
        });
        GlobalVar.serverBase = BASE_NAVEGADOR;
        mudar({ modo: 'navegador', erro: null, armazem: info.armazem, persistente: info.persistente, login });
    } catch (e) {
        mudar({ modo: 'erro', erro: e.message || String(e) });
    }
    return estado;
}

export function procurarMotor(opcoes = {}) {
    if (!NO_PAGES) {
        GlobalVar.serverBase = '/api';
        mudar({ modo: 'local', endereco: '', erro: null });
        promessa = Promise.resolve(estado);
        return promessa;
    }
    promessa = motorPreferido() === 'ajudante' ? procurarAjudante() : iniciarNavegador(opcoes);
    return promessa;
}

// Depois do clique em "Reabrir a pasta" (o navegador só pergunta com um gesto do usuário).
export function reabrirPasta() {
    promessa = iniciarNavegador({ comGesto: true });
    return promessa;
}

// fetchFunc espera a primeira procura antes de qualquer chamada (assim nenhuma tela dispara pedidos à toa).
export const motorPronto = () => promessa || procurarMotor();
