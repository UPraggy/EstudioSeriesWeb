// `path` POSIX para o motor do navegador. Os caminhos do sistema de arquivos virtual são sempre "/dados/...".
// Barra invertida vira "/" (dados criados no Windows continuam abrindo).
const sep = '/';
const delimiter = ':';

const limpar = (p) => String(p === undefined || p === null ? '' : p).replace(/\\/g, '/');

function normalizarPartes(partes, absoluto) {
    const out = [];
    for (const parte of partes) {
        if (!parte || parte === '.') continue;
        if (parte === '..') {
            if (out.length && out[out.length - 1] !== '..') out.pop();
            else if (!absoluto) out.push('..');
        } else {
            out.push(parte);
        }
    }
    return out;
}

function normalize(p) {
    const s = limpar(p);
    if (!s) return '.';
    const absoluto = s.startsWith('/');
    const terminaComBarra = s.endsWith('/');
    let r = normalizarPartes(s.split('/'), absoluto).join('/');
    if (!r && !absoluto) r = '.';
    if (r && terminaComBarra) r += '/';
    return (absoluto ? '/' : '') + r;
}

function join(...partes) {
    const validas = partes.map(limpar).filter((x) => x.length > 0);
    if (!validas.length) return '.';
    return normalize(validas.join('/'));
}

function resolve(...partes) {
    let resolvido = '';
    let absoluto = false;
    for (let i = partes.length - 1; i >= -1 && !absoluto; i--) {
        const p = i >= 0 ? limpar(partes[i]) : '/';
        if (!p) continue;
        resolvido = `${p}/${resolvido}`;
        absoluto = p.startsWith('/');
    }
    const r = normalizarPartes(resolvido.split('/'), true).join('/');
    return `/${r}`;
}

function isAbsolute(p) {
    return limpar(p).startsWith('/');
}

function dirname(p) {
    const s = limpar(p);
    if (!s) return '.';
    const semFim = s.length > 1 ? s.replace(/\/+$/, '') : s;
    const i = semFim.lastIndexOf('/');
    if (i === -1) return '.';
    if (i === 0) return '/';
    return semFim.slice(0, i);
}

function basename(p, ext) {
    const s = limpar(p).replace(/\/+$/, '');
    let b = s.slice(s.lastIndexOf('/') + 1);
    if (ext && b.endsWith(ext) && b !== ext) b = b.slice(0, -ext.length);
    return b;
}

function extname(p) {
    const b = basename(p);
    const i = b.lastIndexOf('.');
    if (i <= 0) return '';
    return b.slice(i);
}

function relative(de, para) {
    const a = resolve(de).split('/').filter(Boolean);
    const b = resolve(para).split('/').filter(Boolean);
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i++;
    return [...Array(a.length - i).fill('..'), ...b.slice(i)].join('/');
}

function parse(p) {
    const s = limpar(p);
    const root = s.startsWith('/') ? '/' : '';
    const base = basename(s);
    const ext = extname(s);
    const dir = dirname(s);
    return { root, dir: dir === '.' && !s.includes('/') ? '' : dir, base, ext, name: ext ? base.slice(0, -ext.length) : base };
}

function format(o) {
    const dir = o.dir || o.root || '';
    const base = o.base || `${o.name || ''}${o.ext || ''}`;
    if (!dir) return base;
    return dir.endsWith('/') ? `${dir}${base}` : `${dir}/${base}`;
}

function toNamespacedPath(p) {
    return p;
}

const caminho = {
    sep, delimiter, normalize, join, resolve, isAbsolute, dirname, basename, extname, relative, parse, format, toNamespacedPath,
};
caminho.posix = caminho;
caminho.win32 = caminho;

export { sep, delimiter, normalize, join, resolve, isAbsolute, dirname, basename, extname, relative, parse, format };
export default caminho;
