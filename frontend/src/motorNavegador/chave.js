// Chave do OpenRouter no navegador (BYOK): colada pelo usuário ou criada pelo login "Entrar com OpenRouter" (OAuth PKCE).
// Regras (docs/PUBLICAR-SEM-BACKEND.md §4.1 e docs/MOTOR-NAVEGADOR.md):
//  - a chave nunca vai para o código, para o repositório nem para os arquivos das séries;
//  - "lembrar neste navegador" guarda no localStorage; sem lembrar, fica só na memória desta aba;
//  - o teto que ninguém fura é o LIMITE DE CRÉDITO da própria chave no painel do OpenRouter.
const LS_CHAVE = 'estudio:openrouterChave';
const LS_SIMULADO = 'estudio:simuladoForcado';
const SS_PKCE = 'estudio:pkce';
const AUTH = 'https://openrouter.ai/auth';
const TROCA = 'https://openrouter.ai/api/v1/auth/keys';

let naMemoria = null; // { chave, origem, em, lembrada }
const ouvintes = new Set();

function lerLS(chave) {
    try { return JSON.parse(localStorage.getItem(chave) || 'null'); } catch { return null; }
}
function gravarLS(chave, valor) {
    try {
        if (valor === null || valor === undefined) localStorage.removeItem(chave);
        else localStorage.setItem(chave, JSON.stringify(valor));
    } catch { /* navegador sem armazenamento: fica só na memória */ }
}

function avisar() {
    const info = infoChave();
    ouvintes.forEach((fn) => fn(info));
    window.dispatchEvent(new CustomEvent('estudio:chave', { detail: info }));
}

export function ouvirChave(fn) {
    ouvintes.add(fn);
    return () => ouvintes.delete(fn);
}

export function chaveAtual() {
    if (naMemoria) return naMemoria.chave;
    const salva = lerLS(LS_CHAVE);
    if (salva && typeof salva.chave === 'string') {
        naMemoria = { ...salva, lembrada: true };
        return salva.chave;
    }
    return '';
}

// Para a tela: nunca devolve a chave inteira.
export function infoChave() {
    const chave = chaveAtual();
    if (!chave) return { temChave: false, simuladoForcado: simuladoForcado() };
    return {
        temChave: true,
        final: chave.slice(-4),
        origem: naMemoria.origem || 'colada',
        em: naMemoria.em || null,
        lembrada: Boolean(naMemoria.lembrada),
        simuladoForcado: simuladoForcado(),
    };
}

export function validarFormato(chave) {
    const c = String(chave || '').trim();
    if (!c) return 'Cole a chave.';
    if (!/^sk-or-[A-Za-z0-9_-]{10,}$/.test(c)) return 'Isso não parece uma chave do OpenRouter (começa com "sk-or-").';
    return null;
}

export function guardarChave(chave, { lembrar = true, origem = 'colada' } = {}) {
    const c = String(chave || '').trim();
    const erro = validarFormato(c);
    if (erro) throw new Error(erro);
    naMemoria = { chave: c, origem, em: new Date().toISOString(), lembrada: lembrar };
    gravarLS(LS_CHAVE, lembrar ? { chave: c, origem, em: naMemoria.em } : null);
    avisar();
}

export function esquecerChave() {
    naMemoria = null;
    gravarLS(LS_CHAVE, null);
    avisar();
}

export function simuladoForcado() {
    return lerLS(LS_SIMULADO) === true;
}

export function definirSimuladoForcado(ligado) {
    gravarLS(LS_SIMULADO, ligado ? true : null);
    avisar();
}

// ---------------- Entrar com OpenRouter (OAuth PKCE, sem servidor) ----------------
function base64url(bytes) {
    let bin = '';
    bytes.forEach((b) => { bin += String.fromCharCode(b); });
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Volta para a mesma página (sem o "#rota"): o OpenRouter acrescenta ?code=...
export function enderecoDeVolta() {
    return `${window.location.origin}${window.location.pathname}`;
}

export async function entrarComOpenRouter() {
    const verificador = base64url(crypto.getRandomValues(new Uint8Array(32)));
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verificador)));
    const desafio = base64url(hash);
    sessionStorage.setItem(SS_PKCE, JSON.stringify({ verificador, rota: window.location.hash || '' }));
    const u = new URL(AUTH);
    u.searchParams.set('callback_url', enderecoDeVolta());
    u.searchParams.set('code_challenge', desafio);
    u.searchParams.set('code_challenge_method', 'S256');
    window.location.assign(u.toString());
}

/**
 * Chamado ao abrir o site: se a URL voltou do OpenRouter com ?code=..., troca o código pela chave.
 * → null (nada a fazer) | { ok: true } | { ok: false, erro }
 */
export async function concluirLoginOpenRouter() {
    const params = new URLSearchParams(window.location.search);
    const codigo = params.get('code');
    if (!codigo) return null;
    let pkce = null;
    try { pkce = JSON.parse(sessionStorage.getItem(SS_PKCE) || 'null'); } catch { pkce = null; }
    sessionStorage.removeItem(SS_PKCE);
    const limparUrl = () => {
        params.delete('code');
        const resto = params.toString();
        window.history.replaceState(null, '', `${window.location.pathname}${resto ? `?${resto}` : ''}${(pkce && pkce.rota) || window.location.hash || ''}`);
    };
    if (!pkce || !pkce.verificador) {
        limparUrl();
        return { ok: false, erro: 'O login do OpenRouter voltou, mas esta aba não tinha começado o pedido. Tente "Entrar com OpenRouter" de novo.' };
    }
    try {
        const r = await fetch(TROCA, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: codigo, code_verifier: pkce.verificador, code_challenge_method: 'S256' }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.key) throw new Error((j.error && (j.error.message || j.error)) || `HTTP ${r.status}`);
        guardarChave(j.key, { lembrar: true, origem: 'login' });
        return { ok: true };
    } catch (e) {
        return { ok: false, erro: `Não consegui criar a chave pelo login do OpenRouter: ${e.message}` };
    } finally {
        limparUrl();
    }
}
