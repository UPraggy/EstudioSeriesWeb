// Sistema de arquivos virtual do motor do navegador: o backend enxerga um `fs` do Node, com a API síncrona que ele usa
// (existsSync, readFileSync, writeFileSync, renameSync...), e por trás os arquivos vão para um ARMAZÉM do navegador
// (OPFS, IndexedDB ou uma pasta real escolhida pelo usuário). Ver docs/MOTOR-NAVEGADOR.md.
//
// Como funciona:
//  - Ao montar um armazém, o índice inteiro (pastas, nomes, tamanhos) vai para a memória, junto com o CONTEÚDO dos
//    arquivos pequenos (JSON, JSONL, textos: tudo até LIMITE_PRECARGA). Assim as leituras síncronas do backend funcionam.
//  - Arquivos grandes (vídeo, áudio) ficam "preguiçosos": só o tamanho na memória; o conteúdo é lido do armazém quando
//    alguém pede de forma assíncrona (fs.promises.readFile, FileHandle.read, lerBlob para as mídias).
//  - Toda escrita muda a memória NA HORA e entra numa FILA que grava no armazém na mesma ordem. `liberar()` espera a
//    fila esvaziar: o motor chama isso antes de responder cada pedido, então resposta recebida = dado gravado.
//  - Caminhos fora de qualquer montagem (ex.: /tmp) vivem só na memória.
import caminho from './caminho.js';
import { Buffer, paraBytes } from './buffer.js';

export const LIMITE_PRECARGA = 4 * 1024 * 1024; // texto/JSON até 4 MB entra na memória ao montar
export const LIMITE_MEMORIA = 2 * 1024 * 1024;  // depois de gravado, arquivo maior que isso sai da memória
const EXT_TEXTO = new Set(['.json', '.jsonl', '.md', '.txt', '.srt', '.ass', '.vtt', '.csv', '.log', '.bak', '.tmp', '.yml', '.yaml', '.html']);
const PARALELO = 8;

const MENSAGENS = {
    ENOENT: 'no such file or directory',
    EEXIST: 'file already exists',
    ENOTDIR: 'not a directory',
    EISDIR: 'illegal operation on a directory',
    ENOTEMPTY: 'directory not empty',
    EBADF: 'bad file descriptor',
    EINVAL: 'invalid argument',
    EPERM: 'operation not permitted',
};

export function erroFs(code, syscall, alvo) {
    const e = new Error(`${code}: ${MENSAGENS[code] || 'erro'}, ${syscall} '${alvo}'`);
    e.code = code;
    e.errno = -1;
    e.syscall = syscall;
    e.path = alvo;
    return e;
}

const constants = { F_OK: 0, R_OK: 4, W_OK: 2, X_OK: 1, COPYFILE_EXCL: 1, COPYFILE_FICLONE: 2, O_RDONLY: 0, O_WRONLY: 1, O_RDWR: 2 };

function opcoesDe(op, padrao = {}) {
    if (typeof op === 'string') return { ...padrao, encoding: op };
    return { ...padrao, ...(op || {}) };
}

function ehTexto(p) {
    return EXT_TEXTO.has(caminho.extname(p).toLowerCase());
}

function criarStats(no) {
    const ehPasta = no.tipo === 'pasta';
    const mtimeMs = no.mtimeMs || 0;
    return {
        size: ehPasta ? 0 : no.tamanho,
        mtimeMs,
        ctimeMs: mtimeMs,
        atimeMs: mtimeMs,
        birthtimeMs: no.criadoMs || mtimeMs,
        mtime: new Date(mtimeMs),
        ctime: new Date(mtimeMs),
        atime: new Date(mtimeMs),
        birthtime: new Date(no.criadoMs || mtimeMs),
        mode: ehPasta ? 0o40755 : 0o100644,
        isFile: () => !ehPasta,
        isDirectory: () => ehPasta,
        isSymbolicLink: () => false,
        isFIFO: () => false,
        isSocket: () => false,
    };
}

function dirent(nome, no, pai) {
    return {
        name: nome,
        parentPath: pai,
        path: pai,
        isFile: () => no.tipo === 'arquivo',
        isDirectory: () => no.tipo === 'pasta',
        isSymbolicLink: () => false,
    };
}

async function emParalelo(itens, fn, n = PARALELO) {
    let i = 0;
    const trabalhadores = Array.from({ length: Math.min(n, itens.length) }, async () => {
        while (i < itens.length) {
            const item = itens[i++];
            await fn(item);
        }
    });
    await Promise.all(trabalhadores);
}

export function criarVfs({ aoErroGravar } = {}) {
    const nos = new Map();
    const agora = () => Date.now();
    nos.set('/', { tipo: 'pasta', filhos: new Set(), mtimeMs: agora() });

    const montagens = []; // { prefixo, armazem }
    const fila = [];
    let rodando = null;
    let erros = [];
    const descritores = new Map();
    let proximoFd = 10;

    const abs = (p) => {
        if (p && typeof p === 'object' && p.href) p = decodeURIComponent(new URL(p.href).pathname);
        if (typeof p !== 'string' && !(p instanceof Uint8Array)) throw new TypeError(`Caminho inválido: ${p}`);
        return caminho.resolve('/', String(p));
    };

    function montagemDe(p) {
        let melhor = null;
        for (const m of montagens) {
            if ((p === m.prefixo || p.startsWith(`${m.prefixo}/`)) && (!melhor || m.prefixo.length > melhor.prefixo.length)) melhor = m;
        }
        return melhor;
    }
    const relDe = (m, p) => (p === m.prefixo ? '' : p.slice(m.prefixo.length + 1));

    // ---------------- árvore em memória ----------------
    function pegar(p, syscall) {
        const n = nos.get(p);
        if (!n) throw erroFs('ENOENT', syscall, p);
        return n;
    }

    function paiDe(p, syscall) {
        const pai = nos.get(caminho.dirname(p));
        if (!pai) throw erroFs('ENOENT', syscall, p);
        if (pai.tipo !== 'pasta') throw erroFs('ENOTDIR', syscall, p);
        return pai;
    }

    function ligar(p, no) {
        nos.set(p, no);
        if (p !== '/') {
            const pai = nos.get(caminho.dirname(p));
            pai.filhos.add(caminho.basename(p));
            pai.mtimeMs = agora();
        }
    }

    function desligar(p) {
        const n = nos.get(p);
        if (!n) return;
        if (n.tipo === 'pasta') for (const f of [...n.filhos]) desligar(p === '/' ? `/${f}` : `${p}/${f}`);
        nos.delete(p);
        const pai = nos.get(caminho.dirname(p));
        if (pai && pai.filhos) {
            pai.filhos.delete(caminho.basename(p));
            pai.mtimeMs = agora();
        }
    }

    function descendentes(p) {
        const out = [];
        const n = nos.get(p);
        if (!n) return out;
        out.push([p, n]);
        if (n.tipo === 'pasta') for (const f of n.filhos) out.push(...descendentes(p === '/' ? `/${f}` : `${p}/${f}`));
        return out;
    }

    function mkdirInterno(p, recursivo, syscall = 'mkdir') {
        const existente = nos.get(p);
        if (existente) {
            if (recursivo && existente.tipo === 'pasta') return undefined;
            throw erroFs('EEXIST', syscall, p);
        }
        const paiCaminho = caminho.dirname(p);
        let primeiro;
        if (!nos.get(paiCaminho)) {
            if (!recursivo) throw erroFs('ENOENT', syscall, p);
            primeiro = mkdirInterno(paiCaminho, true, syscall);
        } else if (nos.get(paiCaminho).tipo !== 'pasta') {
            throw erroFs('ENOTDIR', syscall, p);
        }
        ligar(p, { tipo: 'pasta', filhos: new Set(), mtimeMs: agora(), criadoMs: agora() });
        agendar({ op: 'pasta', p });
        return primeiro || p;
    }

    function gravarInterno(p, bytes, syscall = 'open', { exclusivo = false } = {}) {
        let n = nos.get(p);
        if (n && n.tipo === 'pasta') throw erroFs('EISDIR', syscall, p);
        if (n && exclusivo) throw erroFs('EEXIST', syscall, p);
        if (!n) {
            paiDe(p, syscall);
            n = { tipo: 'arquivo', criadoMs: agora() };
            ligar(p, n);
        }
        n.dados = bytes;
        n.tamanho = bytes.length;
        n.mtimeMs = agora();
        n.versao = (n.versao || 0) + 1;
        n.sujo = true;
        agendar({ op: 'gravar', p });
    }

    function lerSync(p, syscall = 'open') {
        const n = pegar(p, syscall);
        if (n.tipo === 'pasta') throw erroFs('EISDIR', 'read', p);
        if (!n.dados) {
            const e = new Error(`O arquivo ${p} (${n.tamanho} bytes) é grande demais para leitura síncrona no navegador; use fs.promises.readFile.`);
            e.code = 'EAGAIN';
            throw e;
        }
        return n.dados;
    }

    async function lerAsync(p, syscall = 'open') {
        const n = pegar(p, syscall);
        if (n.tipo === 'pasta') throw erroFs('EISDIR', 'read', p);
        if (n.dados) return n.dados;
        const blob = await lerBlob(p);
        return new Uint8Array(await blob.arrayBuffer());
    }

    function decodificar(bytes, enc) {
        const b = Buffer.deBytes(bytes);
        return enc ? b.toString(enc) : Buffer.from(b);
    }

    function renomearInterno(de, para, syscall = 'rename') {
        const n = pegar(de, syscall);
        if (de === para) return;
        if (para.startsWith(`${de}/`)) throw erroFs('EINVAL', syscall, de);
        paiDe(para, syscall);
        const alvo = nos.get(para);
        if (alvo) {
            if (n.tipo === 'arquivo' && alvo.tipo === 'pasta') throw erroFs('EISDIR', syscall, para);
            if (n.tipo === 'pasta' && alvo.tipo === 'arquivo') throw erroFs('ENOTDIR', syscall, para);
            if (alvo.tipo === 'pasta' && alvo.filhos.size) throw erroFs('ENOTEMPTY', syscall, para);
            desligar(para);
        }
        const lista = descendentes(de);
        // origem antiga de cada arquivo preguiçoso (o conteúdo ainda está lá no armazém até a fila mover)
        for (const [p, no] of lista) {
            nos.delete(p);
            const novo = para + p.slice(de.length);
            if (no.tipo === 'arquivo' && !no.dados && !no.origem) no.origem = p;
            nos.set(novo, no);
        }
        const paiAntigo = nos.get(caminho.dirname(de));
        if (paiAntigo) { paiAntigo.filhos.delete(caminho.basename(de)); paiAntigo.mtimeMs = agora(); }
        const paiNovo = nos.get(caminho.dirname(para));
        paiNovo.filhos.add(caminho.basename(para));
        paiNovo.mtimeMs = agora();
        agendar({ op: 'mover', de, para });
    }

    function removerInterno(p, { recursive = false, force = false } = {}, syscall = 'rm') {
        const n = nos.get(p);
        if (!n) {
            if (force) return;
            throw erroFs('ENOENT', syscall, p);
        }
        if (p === '/' || montagens.some((m) => m.prefixo === p)) throw erroFs('EPERM', syscall, p);
        if (n.tipo === 'pasta' && n.filhos.size && !recursive) throw erroFs(syscall === 'rm' ? 'EISDIR' : 'ENOTEMPTY', syscall, p);
        desligar(p);
        agendar({ op: 'apagar', p });
    }

    function copiarInterno(de, para, flags = 0, syscall = 'copyfile') {
        const n = pegar(de, syscall);
        if (n.tipo === 'pasta') throw erroFs('EISDIR', syscall, de);
        if ((flags & constants.COPYFILE_EXCL) && nos.has(para)) throw erroFs('EEXIST', syscall, para);
        if (n.dados) {
            gravarInterno(para, Uint8Array.from(n.dados), syscall);
            return;
        }
        // arquivo grande: copia direto no armazém, sem passar pela memória
        let alvo = nos.get(para);
        if (alvo && alvo.tipo === 'pasta') throw erroFs('EISDIR', syscall, para);
        if (!alvo) {
            paiDe(para, syscall);
            alvo = { tipo: 'arquivo', criadoMs: agora() };
            ligar(para, alvo);
        }
        Object.assign(alvo, { dados: null, tamanho: n.tamanho, mtimeMs: agora(), versao: (alvo.versao || 0) + 1, sujo: true, origem: null });
        agendar({ op: 'copiar', de: n.origem || de, para });
    }

    // ---------------- fila de gravação no armazém ----------------
    function agendar(op) {
        const m = montagemDe(op.p || op.para || op.de);
        const mDe = op.de ? montagemDe(op.de) : null;
        if (!m && !mDe) return; // só memória
        fila.push(op);
        if (!rodando) rodando = processar();
    }

    async function comRepeticao(fn, descricao) {
        for (let n = 1; ; n++) {
            try {
                return await fn();
            } catch (e) {
                if (n >= 3) {
                    const erro = `${descricao}: ${e && e.message ? e.message : e}`;
                    erros.push(erro);
                    if (aoErroGravar) aoErroGravar(erro);
                    return undefined;
                }
                await new Promise((r) => setTimeout(r, 150 * n));
            }
        }
    }

    async function gravarNo(m, p, no) {
        const versao = no.versao;
        const rel = relDe(m, p);
        if (no.dados) {
            await m.armazem.gravar(rel, no.dados);
        } else if (no.origem && no.origem !== p) {
            await copiarNoArmazem(no.origem, p);
        } else {
            return; // já está no armazém
        }
        if (no.versao === versao) {
            no.sujo = false;
            no.origem = null;
            if (no.dados && no.tamanho > LIMITE_MEMORIA) no.dados = null; // libera a memória: fica preguiçoso
        }
    }

    async function copiarNoArmazem(de, para) {
        const md = montagemDe(de);
        const mp = montagemDe(para);
        if (!md || !mp) throw new Error(`Cópia sem armazém (${de} → ${para}).`);
        const blob = await md.armazem.ler(relDe(md, de));
        await mp.armazem.gravar(relDe(mp, para), blob);
    }

    // Antes de apagar algo do armazém: quem foi movido de lá e ainda não teve o conteúdo copiado recebe a cópia agora
    // (ex.: A→B e depois B→C antes da fila andar; o conteúdo continua em A até aqui).
    async function materializarOrigens(prefixo) {
        for (const [p, no] of [...nos.entries()]) {
            if (no.tipo !== 'arquivo' || !no.origem) continue;
            if (no.origem !== prefixo && !no.origem.startsWith(`${prefixo}/`)) continue;
            const m = montagemDe(p);
            if (m) {
                await gravarNo(m, p, no);
            } else {
                const md = montagemDe(no.origem);
                no.dados = new Uint8Array(await (await md.armazem.ler(relDe(md, no.origem))).arrayBuffer());
                no.origem = null;
                no.sujo = false;
            }
        }
    }

    async function executar(op) {
        if (op.op === 'gravar') {
            const n = nos.get(op.p);
            const m = montagemDe(op.p);
            if (!n || n.tipo !== 'arquivo' || !m) return;
            await gravarNo(m, op.p, n);
        } else if (op.op === 'pasta') {
            const n = nos.get(op.p);
            const m = montagemDe(op.p);
            if (!n || n.tipo !== 'pasta' || !m) return;
            await m.armazem.criarPasta(relDe(m, op.p));
        } else if (op.op === 'apagar') {
            const m = montagemDe(op.p);
            if (!m) return;
            await materializarOrigens(op.p);
            await m.armazem.apagar(relDe(m, op.p), { recursivo: true });
        } else if (op.op === 'copiar') {
            const n = nos.get(op.para);
            if (!n || n.tipo !== 'arquivo') return;
            if (n.dados) { await gravarNo(montagemDe(op.para), op.para, n); return; }
            await copiarNoArmazem(op.de, op.para);
            n.sujo = false;
        } else if (op.op === 'mover') {
            const mPara = montagemDe(op.para);
            const mDe = montagemDe(op.de);
            if (mPara) {
                for (const [p, no] of descendentes(op.para)) {
                    if (no.tipo === 'pasta') {
                        await mPara.armazem.criarPasta(relDe(mPara, p));
                    } else if (no.dados || (no.origem && no.origem !== p)) {
                        // Mover nativo de arquivo grande quando o armazém sabe (OPFS); senão, copia.
                        if (!no.dados && mDe === mPara && mPara.armazem.moverArquivo) {
                            const ok = await mPara.armazem.moverArquivo(relDe(mDe, no.origem), relDe(mPara, p)).catch(() => false);
                            if (ok) { no.origem = null; no.sujo = false; continue; }
                        }
                        await gravarNo(mPara, p, no);
                    }
                }
            }
            if (mDe) {
                await materializarOrigens(op.de);
                await mDe.armazem.apagar(relDe(mDe, op.de), { recursivo: true });
            }
        }
    }

    async function processar() {
        try {
            while (fila.length) {
                const op = fila.shift();
                await comRepeticao(() => executar(op), `Falha ao gravar (${op.op} ${op.p || `${op.de} → ${op.para}`})`);
            }
        } finally {
            rodando = null;
        }
    }

    // Espera tudo ser gravado. Devolve os erros acumulados desde a última chamada (e limpa a lista).
    async function liberar() {
        while (rodando) await rodando;
        const e = erros;
        erros = [];
        return e;
    }

    // ---------------- montagem ----------------
    async function montar(prefixo, armazem, { aoProgresso } = {}) {
        const pre = abs(prefixo);
        if (montagens.some((m) => m.prefixo === pre)) throw new Error(`Já existe um armazém em ${pre}.`);
        mkdirInterno(pre, true);
        const m = { prefixo: pre, armazem };
        montagens.push(m);
        const entradas = await armazem.listarTudo();
        entradas.sort((a, b) => a.caminho.length - b.caminho.length);
        const carregar = [];
        for (const e of entradas) {
            const p = e.caminho ? `${pre}/${e.caminho}` : pre;
            if (!e.caminho) continue;
            if (!nos.get(caminho.dirname(p))) mkdirSemFila(caminho.dirname(p));
            if (e.tipo === 'pasta') {
                if (!nos.get(p)) ligar(p, { tipo: 'pasta', filhos: new Set(), mtimeMs: e.mtimeMs || agora() });
            } else {
                const no = { tipo: 'arquivo', tamanho: e.tamanho || 0, mtimeMs: e.mtimeMs || agora(), dados: null, sujo: false, versao: 0 };
                ligar(p, no);
                const limite = ehTexto(p) ? LIMITE_PRECARGA : LIMITE_MEMORIA / 4;
                if (no.tamanho <= limite) carregar.push([p, no, e.caminho]);
            }
        }
        let feitos = 0;
        await emParalelo(carregar, async ([, no, rel]) => {
            try {
                const blob = await armazem.ler(rel);
                if (no.dados === null && no.versao === 0) no.dados = new Uint8Array(await blob.arrayBuffer());
            } catch {
                // fica preguiçoso: a leitura assíncrona tenta de novo
            }
            feitos++;
            if (aoProgresso) aoProgresso(feitos, carregar.length);
        });
        return { arquivos: entradas.filter((e) => e.tipo !== 'pasta').length, precarregados: carregar.length };
    }

    function mkdirSemFila(p) {
        if (nos.get(p)) return;
        mkdirSemFila(caminho.dirname(p));
        ligar(p, { tipo: 'pasta', filhos: new Set(), mtimeMs: agora() });
    }

    // Arquivo embutido no próprio site (ex.: amostras do modo simulado): só memória, nunca vai para o armazém.
    function embutir(p, dados) {
        const a = abs(p);
        mkdirSemFila(caminho.dirname(a));
        ligar(a, { tipo: 'arquivo', dados: paraBytes(dados), tamanho: paraBytes(dados).length, mtimeMs: agora(), sujo: false, versao: 0 });
    }

    // Conteúdo como Blob (mídias): sem copiar para a memória quando o arquivo está no armazém.
    async function lerBlob(p) {
        const a = abs(p);
        const n = pegar(a, 'open');
        if (n.tipo !== 'arquivo') throw erroFs('EISDIR', 'read', a);
        if (n.dados) return new Blob([n.dados]);
        if (n.origem || n.sujo) await liberar();
        const atual = nos.get(a);
        if (!atual) throw erroFs('ENOENT', 'open', a);
        if (atual.dados) return new Blob([atual.dados]);
        const m = montagemDe(a);
        if (!m) throw erroFs('ENOENT', 'open', a);
        return m.armazem.ler(relDe(m, a));
    }

    // ---------------- API do fs (síncrona) ----------------
    const fs = {
        constants,
        existsSync: (p) => { try { return nos.has(abs(p)); } catch { return false; } },
        statSync: (p, op = {}) => {
            const a = abs(p);
            const n = nos.get(a);
            if (!n) {
                if (op.throwIfNoEntry === false) return undefined;
                throw erroFs('ENOENT', 'stat', a);
            }
            return criarStats(n);
        },
        readFileSync: (p, op) => decodificar(lerSync(abs(p)), opcoesDe(op).encoding),
        writeFileSync: (p, dados, op) => {
            const o = opcoesDe(op);
            const a = abs(p);
            if (o.flag && o.flag.startsWith('a')) return fs.appendFileSync(a, dados, o);
            gravarInterno(a, Uint8Array.from(paraBytes(dados, o.encoding)), 'open', { exclusivo: o.flag === 'wx' });
            return undefined;
        },
        appendFileSync: (p, dados, op) => {
            const a = abs(p);
            const o = opcoesDe(op);
            const novo = paraBytes(dados, o.encoding);
            const n = nos.get(a);
            if (!n) return gravarInterno(a, Uint8Array.from(novo), 'open');
            const antigo = lerSync(a);
            const junto = new Uint8Array(antigo.length + novo.length);
            junto.set(antigo);
            junto.set(novo, antigo.length);
            return gravarInterno(a, junto, 'open');
        },
        mkdirSync: (p, op) => mkdirInterno(abs(p), Boolean(opcoesDe(op).recursive)),
        readdirSync: (p, op) => {
            const a = abs(p);
            const n = pegar(a, 'scandir');
            if (n.tipo !== 'pasta') throw erroFs('ENOTDIR', 'scandir', a);
            const nomes = [...n.filhos].sort();
            if (opcoesDe(op).withFileTypes) return nomes.map((nome) => dirent(nome, nos.get(a === '/' ? `/${nome}` : `${a}/${nome}`), a));
            return nomes;
        },
        renameSync: (de, para) => renomearInterno(abs(de), abs(para)),
        rmSync: (p, op) => removerInterno(abs(p), opcoesDe(op), 'rm'),
        rmdirSync: (p, op) => {
            const a = abs(p);
            const n = pegar(a, 'rmdir');
            if (n.tipo !== 'pasta') throw erroFs('ENOTDIR', 'rmdir', a);
            removerInterno(a, { recursive: Boolean(opcoesDe(op).recursive) }, 'rmdir');
        },
        unlinkSync: (p) => {
            const a = abs(p);
            const n = pegar(a, 'unlink');
            if (n.tipo === 'pasta') throw erroFs('EPERM', 'unlink', a);
            removerInterno(a, {}, 'unlink');
        },
        copyFileSync: (de, para, flags) => copiarInterno(abs(de), abs(para), flags),
        accessSync: (p) => { pegar(abs(p), 'access'); },
        openSync: (p, flags = 'r') => {
            const a = abs(p);
            const f = String(flags);
            if (f.startsWith('r')) pegar(a, 'open');
            else if (f.includes('x') && nos.has(a)) throw erroFs('EEXIST', 'open', a);
            else if (f.startsWith('w') || !nos.has(a)) gravarInterno(a, new Uint8Array(0), 'open');
            const fd = proximoFd++;
            descritores.set(fd, { p: a, pos: 0 });
            return fd;
        },
        readSync: (fd, buffer, offset = 0, length, position) => {
            const d = descritores.get(fd);
            if (!d) throw erroFs('EBADF', 'read', String(fd));
            if (offset && typeof offset === 'object') ({ offset = 0, length, position } = offset);
            const dados = lerSync(d.p, 'read');
            const ini = position === null || position === undefined ? d.pos : position;
            const n = Math.max(0, Math.min(length ?? buffer.length - offset, dados.length - ini, buffer.length - offset));
            buffer.set(dados.subarray(ini, ini + n), offset);
            if (position === null || position === undefined) d.pos += n;
            return n;
        },
        fstatSync: (fd) => {
            const d = descritores.get(fd);
            if (!d) throw erroFs('EBADF', 'fstat', String(fd));
            return criarStats(pegar(d.p, 'fstat'));
        },
        closeSync: (fd) => { descritores.delete(fd); },
        createWriteStream: (p, op) => criarFluxoEscrita(abs(p), opcoesDe(op)),
        createReadStream: (p, op) => criarFluxoLeitura(abs(p), opcoesDe(op)),
    };
    fs.lstatSync = fs.statSync;
    fs.realpathSync = (p) => abs(p);

    // ---------------- API do fs/promises ----------------
    const assincrono = (f) => async (...args) => f(...args);
    const fsp = {
        constants,
        readFile: async (p, op) => decodificar(await lerAsync(abs(p)), opcoesDe(op).encoding),
        writeFile: assincrono(fs.writeFileSync),
        appendFile: async (p, dados, op) => {
            const a = abs(p);
            if (nos.has(a) && !nos.get(a).dados) await lerAsync(a).then((b) => { nos.get(a).dados = b; });
            return fs.appendFileSync(a, dados, op);
        },
        mkdir: assincrono(fs.mkdirSync),
        readdir: assincrono(fs.readdirSync),
        rename: assincrono(fs.renameSync),
        rm: assincrono(fs.rmSync),
        rmdir: assincrono(fs.rmdirSync),
        unlink: assincrono(fs.unlinkSync),
        stat: assincrono(fs.statSync),
        lstat: assincrono(fs.statSync),
        access: assincrono(fs.accessSync),
        copyFile: assincrono(fs.copyFileSync),
        realpath: assincrono(fs.realpathSync),
        open: async (p, flags = 'r') => {
            const a = abs(p);
            const fd = fs.openSync(a, flags);
            return {
                fd,
                async read(buffer, offset = 0, length, position) {
                    if (buffer && !(buffer instanceof Uint8Array)) ({ buffer, offset = 0, length, position } = buffer);
                    if (!buffer) buffer = Buffer.alloc(16384);
                    const d = descritores.get(fd);
                    const no = pegar(d.p, 'read');
                    const ini = position === null || position === undefined ? d.pos : position;
                    const quer = Math.max(0, Math.min(length ?? buffer.length - offset, buffer.length - offset, no.tamanho - ini));
                    let pedaco;
                    if (no.dados) pedaco = no.dados.subarray(ini, ini + quer);
                    else pedaco = new Uint8Array(await (await lerBlob(d.p)).slice(ini, ini + quer).arrayBuffer());
                    buffer.set(pedaco, offset);
                    if (position === null || position === undefined) d.pos += pedaco.length;
                    return { bytesRead: pedaco.length, buffer };
                },
                async readFile(op) { return fsp.readFile(a, op); },
                async writeFile(dados, op) { return fs.writeFileSync(a, dados, op); },
                async appendFile(dados, op) { return fs.appendFileSync(a, dados, op); },
                async write(dados, ...resto) {
                    const enc = typeof resto[1] === 'string' ? resto[1] : undefined;
                    const bytes = typeof dados === 'string' ? paraBytes(dados, enc) : paraBytes(dados);
                    fs.appendFileSync(a, bytes);
                    return { bytesWritten: bytes.length, buffer: dados };
                },
                // A durabilidade aqui é a fila do armazém (liberar()); sync/datasync não têm o que fazer.
                async sync() {},
                async datasync() {},
                async stat() { return fs.fstatSync(fd); },
                async close() { fs.closeSync(fd); },
            };
        },
    };
    fs.promises = fsp;

    // ---------------- fluxos (só o necessário) ----------------
    function emissor() {
        const ouvintes = {};
        return {
            on(ev, fn) { (ouvintes[ev] = ouvintes[ev] || []).push(fn); return this; },
            once(ev, fn) { const f = (...a) => { this.off(ev, f); fn(...a); }; return this.on(ev, f); },
            off(ev, fn) { ouvintes[ev] = (ouvintes[ev] || []).filter((x) => x !== fn); return this; },
            removeListener(ev, fn) { return this.off(ev, fn); },
            emit(ev, ...a) { (ouvintes[ev] || []).slice().forEach((fn) => fn(...a)); return true; },
        };
    }

    function criarFluxoEscrita(a, op) {
        const partes = [];
        const fluxo = emissor();
        let fechado = false;
        Object.assign(fluxo, {
            path: a,
            writable: true,
            ehFluxoVfs: true,
            write(pedaco, enc, cb) {
                if (typeof enc === 'function') { cb = enc; enc = undefined; }
                partes.push(Uint8Array.from(paraBytes(pedaco, enc || op.encoding)));
                if (cb) queueMicrotask(cb);
                return true;
            },
            end(pedaco, enc, cb) {
                if (typeof pedaco === 'function') { cb = pedaco; pedaco = undefined; }
                if (typeof enc === 'function') { cb = enc; enc = undefined; }
                if (pedaco) fluxo.write(pedaco, enc);
                if (fechado) return fluxo;
                fechado = true;
                try {
                    const total = partes.reduce((s, p) => s + p.length, 0);
                    const junto = new Uint8Array(total);
                    let pos = 0;
                    for (const p of partes) { junto.set(p, pos); pos += p.length; }
                    if (op.flags && op.flags.startsWith('a')) fs.appendFileSync(a, junto);
                    else gravarInterno(a, junto, 'open');
                    queueMicrotask(() => { fluxo.emit('finish'); fluxo.emit('close'); if (cb) cb(); });
                } catch (e) {
                    queueMicrotask(() => { fluxo.emit('error', e); if (cb) cb(e); });
                }
                return fluxo;
            },
            destroy(e) { fechado = true; if (e) queueMicrotask(() => fluxo.emit('error', e)); return fluxo; },
        });
        return fluxo;
    }

    // Leitura em pedaços de 1 MB: por iteração (for await) ou pelos eventos 'data'/'end' (começa ao ouvir 'data').
    function criarFluxoLeitura(a, op) {
        const fluxo = emissor();
        const ini = op.start || 0;
        async function* pedacos() {
            const no = pegar(a, 'open');
            const fim = op.end !== undefined ? op.end + 1 : no.tamanho;
            const blob = (await lerBlob(a)).slice(ini, fim);
            const passo = 1024 * 1024;
            for (let p = 0; p < blob.size; p += passo) {
                yield Buffer.deBytes(new Uint8Array(await blob.slice(p, p + passo).arrayBuffer()));
            }
        }
        async function bombear() {
            try {
                for await (const p of pedacos()) fluxo.emit('data', p);
                fluxo.emit('end');
                fluxo.emit('close');
            } catch (e) {
                fluxo.emit('error', e);
            }
        }
        const ouvir = fluxo.on;
        let iniciado = false;
        Object.assign(fluxo, {
            path: a,
            readable: true,
            [Symbol.asyncIterator]: pedacos,
            on(ev, fn) {
                ouvir.call(fluxo, ev, fn);
                if (ev === 'data' && !iniciado) { iniciado = true; queueMicrotask(bombear); }
                return fluxo;
            },
            pipe() { throw new Error('createReadStream().pipe não existe no navegador.'); },
        });
        return fluxo;
    }

    function estado() {
        let arquivos = 0;
        let pastas = 0;
        let bytesMemoria = 0;
        for (const n of nos.values()) {
            if (n.tipo === 'pasta') pastas++;
            else { arquivos++; if (n.dados) bytesMemoria += n.dados.length; }
        }
        return { arquivos, pastas, bytesMemoria, filaPendente: fila.length + (rodando ? 1 : 0), montagens: montagens.map((m) => ({ prefixo: m.prefixo, tipo: m.armazem.tipo, nome: m.armazem.nome })) };
    }

    return { fs, fsp, montar, embutir, lerBlob, liberar, estado, _nos: nos };
}
