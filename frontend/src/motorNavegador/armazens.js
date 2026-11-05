// Armazéns do motor do navegador: onde os arquivos das séries ficam de verdade.
// Todos têm a mesma interface (caminhos relativos, com "/"):
//   listarTudo() → [{ caminho, tipo: 'arquivo'|'pasta', tamanho, mtimeMs }]
//   ler(caminho) → Blob · gravar(caminho, Uint8Array|Blob) · criarPasta(caminho) · apagar(caminho, { recursivo })
//   moverArquivo(de, para) → true se moveu sem copiar (opcional)
//
//  - armazemDiretorio(handle): uma pasta do File System Access. Serve para a pasta REAL escolhida pelo usuário
//    (showDirectoryPicker, PC e Android) e para o OPFS (pasta interna do site, todos os navegadores modernos).
//  - armazemIndexedDB(): plano B quando o OPFS não deixa gravar pela página (Safari antigo).
//  - armazemMemoria(): testes.
const partes = (rel) => String(rel || '').split('/').filter(Boolean);

function naoAchou(e) {
    return e && (e.name === 'NotFoundError' || e.code === 'ENOENT');
}

export function armazemMemoria({ nome = 'Memória' } = {}) {
    const arquivos = new Map(); // caminho → { dados: Uint8Array, mtimeMs }
    const pastas = new Set();
    const garantirPastas = (rel) => {
        const ps = partes(rel);
        for (let i = 1; i < ps.length; i++) pastas.add(ps.slice(0, i).join('/'));
    };
    return {
        tipo: 'memoria',
        nome,
        arquivos,
        pastas,
        async listarTudo() {
            const out = [...pastas].map((caminho) => ({ caminho, tipo: 'pasta' }));
            for (const [caminho, a] of arquivos) out.push({ caminho, tipo: 'arquivo', tamanho: a.dados.length, mtimeMs: a.mtimeMs });
            return out;
        },
        async ler(rel) {
            const a = arquivos.get(partes(rel).join('/'));
            if (!a) throw Object.assign(new Error(`Não existe: ${rel}`), { name: 'NotFoundError' });
            return new Blob([a.dados]);
        },
        async gravar(rel, dados) {
            const c = partes(rel).join('/');
            garantirPastas(c);
            const bytes = dados instanceof Blob ? new Uint8Array(await dados.arrayBuffer()) : Uint8Array.from(dados);
            arquivos.set(c, { dados: bytes, mtimeMs: Date.now() });
        },
        async criarPasta(rel) {
            const c = partes(rel).join('/');
            if (!c) return;
            garantirPastas(c);
            pastas.add(c);
        },
        async apagar(rel) {
            const c = partes(rel).join('/');
            arquivos.delete(c);
            pastas.delete(c);
            for (const k of [...arquivos.keys()]) if (k.startsWith(`${c}/`)) arquivos.delete(k);
            for (const k of [...pastas]) if (k.startsWith(`${c}/`)) pastas.delete(k);
        },
    };
}

export function armazemDiretorio(raiz, { tipo = 'pasta', nome = raiz.name } = {}) {
    async function pasta(ps, criar) {
        let h = raiz;
        for (const p of ps) h = await h.getDirectoryHandle(p, { create: criar });
        return h;
    }
    async function arquivo(rel, criar) {
        const ps = partes(rel);
        const n = ps.pop();
        const dir = await pasta(ps, criar);
        return dir.getFileHandle(n, { create: criar });
    }

    async function listar(dir, prefixo, out) {
        for await (const [n, h] of dir.entries()) {
            const caminho = prefixo ? `${prefixo}/${n}` : n;
            if (h.kind === 'directory') {
                out.push({ caminho, tipo: 'pasta' });
                await listar(h, caminho, out);
            } else {
                try {
                    const f = await h.getFile();
                    out.push({ caminho, tipo: 'arquivo', tamanho: f.size, mtimeMs: f.lastModified });
                } catch {
                    // arquivo sendo gravado por outra aba ou sem permissão: aparece na próxima abertura
                }
            }
        }
    }

    return {
        tipo,
        nome,
        raiz,
        async listarTudo() {
            const out = [];
            await listar(raiz, '', out);
            return out;
        },
        async ler(rel) {
            return (await arquivo(rel, false)).getFile();
        },
        async gravar(rel, dados) {
            const fh = await arquivo(rel, true);
            const w = await fh.createWritable();
            try {
                await w.write(dados);
                await w.close();
            } catch (e) {
                await w.abort().catch(() => {});
                throw e;
            }
        },
        async criarPasta(rel) {
            await pasta(partes(rel), true);
        },
        async apagar(rel) {
            const ps = partes(rel);
            const n = ps.pop();
            if (!n) return;
            let dir;
            try {
                dir = await pasta(ps, false);
                await dir.removeEntry(n, { recursive: true });
            } catch (e) {
                if (!naoAchou(e)) throw e;
            }
        },
        async moverArquivo(de, para) {
            const fh = await arquivo(de, false);
            if (typeof fh.move !== 'function') return false;
            const ps = partes(para);
            const n = ps.pop();
            const dir = await pasta(ps, true);
            await fh.move(dir, n);
            return true;
        },
    };
}

// ---------------- IndexedDB (plano B e configurações) ----------------
function pedido(req) {
    return new Promise((ok, falha) => {
        req.onsuccess = () => ok(req.result);
        req.onerror = () => falha(req.error);
    });
}

export function abrirBanco(nome = 'estudio-series', versao = 1) {
    return new Promise((ok, falha) => {
        const req = indexedDB.open(nome, versao);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains('arquivos')) db.createObjectStore('arquivos');
            if (!db.objectStoreNames.contains('pastas')) db.createObjectStore('pastas');
            if (!db.objectStoreNames.contains('config')) db.createObjectStore('config');
        };
        req.onsuccess = () => ok(req.result);
        req.onerror = () => falha(req.error);
    });
}

export async function lerConfig(chave) {
    const db = await abrirBanco();
    try {
        return await pedido(db.transaction('config').objectStore('config').get(chave));
    } finally {
        db.close();
    }
}

export async function gravarConfig(chave, valor) {
    const db = await abrirBanco();
    try {
        const tx = db.transaction('config', 'readwrite');
        if (valor === undefined) tx.objectStore('config').delete(chave);
        else tx.objectStore('config').put(valor, chave);
        await new Promise((ok, falha) => { tx.oncomplete = ok; tx.onerror = () => falha(tx.error); });
    } finally {
        db.close();
    }
}

export async function armazemIndexedDB({ nome = 'Neste navegador (IndexedDB)' } = {}) {
    const db = await abrirBanco();
    const tx = (lojas, modo = 'readonly') => db.transaction(lojas, modo);
    const fim = (t) => new Promise((ok, falha) => { t.oncomplete = ok; t.onerror = () => falha(t.error); t.onabort = () => falha(t.error); });
    const garantirPastas = (loja, c) => {
        const ps = partes(c);
        for (let i = 1; i <= ps.length; i++) loja.put(true, ps.slice(0, i).join('/'));
    };
    return {
        tipo: 'indexeddb',
        nome,
        async listarTudo() {
            const t = tx(['arquivos', 'pastas']);
            const [chavesP, chavesA, valores] = await Promise.all([
                pedido(t.objectStore('pastas').getAllKeys()),
                pedido(t.objectStore('arquivos').getAllKeys()),
                pedido(t.objectStore('arquivos').getAll()),
            ]);
            const out = chavesP.map((caminho) => ({ caminho, tipo: 'pasta' }));
            chavesA.forEach((caminho, i) => out.push({ caminho, tipo: 'arquivo', tamanho: valores[i].tamanho, mtimeMs: valores[i].mtimeMs }));
            return out;
        },
        async ler(rel) {
            const v = await pedido(tx('arquivos').objectStore('arquivos').get(partes(rel).join('/')));
            if (!v) throw Object.assign(new Error(`Não existe: ${rel}`), { name: 'NotFoundError' });
            return v.blob;
        },
        async gravar(rel, dados) {
            const c = partes(rel).join('/');
            const blob = dados instanceof Blob ? dados : new Blob([dados]);
            const t = tx(['arquivos', 'pastas'], 'readwrite');
            const ps = partes(c);
            ps.pop();
            if (ps.length) garantirPastas(t.objectStore('pastas'), ps.join('/'));
            t.objectStore('arquivos').put({ blob, tamanho: blob.size, mtimeMs: Date.now() }, c);
            await fim(t);
        },
        async criarPasta(rel) {
            const c = partes(rel).join('/');
            if (!c) return;
            const t = tx('pastas', 'readwrite');
            garantirPastas(t.objectStore('pastas'), c);
            await fim(t);
        },
        async apagar(rel) {
            const c = partes(rel).join('/');
            const faixa = IDBKeyRange.bound(`${c}/`, `${c}/￿`);
            const t = tx(['arquivos', 'pastas'], 'readwrite');
            for (const loja of ['arquivos', 'pastas']) {
                t.objectStore(loja).delete(c);
                t.objectStore(loja).delete(faixa);
            }
            await fim(t);
        },
    };
}

// ---------------- escolha ----------------
export function temPastaReal() {
    return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

export function temOpfsGravavel() {
    return typeof navigator !== 'undefined' && navigator.storage && typeof navigator.storage.getDirectory === 'function'
        && typeof FileSystemFileHandle !== 'undefined' && 'createWritable' in FileSystemFileHandle.prototype;
}

// Armazém interno do site: OPFS quando dá para gravar pela página; senão IndexedDB.
export async function armazemInterno() {
    if (temOpfsGravavel()) {
        const raiz = await navigator.storage.getDirectory();
        const dir = await raiz.getDirectoryHandle('estudio-series', { create: true });
        return armazemDiretorio(dir, { tipo: 'opfs', nome: 'Neste navegador (OPFS)' });
    }
    return armazemIndexedDB();
}

// Pasta real guardada no IndexedDB. Devolve { handle, permissao: 'granted'|'prompt'|'denied' } ou null.
export async function pastaGuardada() {
    const handle = await lerConfig('pasta').catch(() => null);
    if (!handle) return null;
    let permissao = 'prompt';
    try { permissao = await handle.queryPermission({ mode: 'readwrite' }); } catch { /* navegador sem a API */ }
    return { handle, permissao };
}

export async function escolherPasta() {
    const handle = await window.showDirectoryPicker({ id: 'estudio-series', mode: 'readwrite' });
    await gravarConfig('pasta', handle);
    return handle;
}

export async function pedirPermissao(handle) {
    return (await handle.requestPermission({ mode: 'readwrite' })) === 'granted';
}

export async function esquecerPasta() {
    await gravarConfig('pasta', undefined);
}
