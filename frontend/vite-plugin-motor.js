// Plugin do Vite que entrega o "backend no navegador" como o módulo virtual `virtual:motor-navegador`.
// O esbuild (que já vem com o Vite) empacota frontend/src/motorNavegador/entrada.js junto com os controllers
// CommonJS de backend/src, trocando os módulos do Node pelos substitutos de src/motorNavegador/ponte.
// Ver docs/MOTOR-NAVEGADOR.md.
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const MOTOR = path.join(AQUI, 'src', 'motorNavegador');
const PONTE = path.join(MOTOR, 'ponte');
const BACKEND = path.resolve(AQUI, '..', 'backend', 'src');
const AMOSTRAS = path.join(BACKEND, 'openrouter', 'amostras');

// Módulo do Node → substituto do navegador.
const SUBSTITUTOS = {
    fs: 'fs.cjs',
    'fs/promises': 'fs-promises.cjs',
    path: 'path.cjs',
    crypto: 'crypto.cjs',
    os: 'os.cjs',
    stream: 'stream.cjs',
    'stream/promises': 'stream-promises.cjs',
    child_process: 'child_process.cjs',
};

const ID = 'virtual:motor-navegador';
const ID_RESOLVIDO = `\0${ID}`;

// Caminho "de mentira" que o backend enxerga em __dirname (só o modo simulado usa, para achar amostras/).
function dirnameVirtual(arquivo) {
    const rel = path.relative(path.resolve(BACKEND, '..', '..'), path.dirname(arquivo)).split(path.sep).join('/');
    return `/app/${rel}`;
}

const pluginNode = {
    name: 'estudio-substitutos-node',
    setup(b) {
        b.onResolve({ filter: /^(node:)?(fs|fs\/promises|path|crypto|os|stream|stream\/promises|child_process)$/ }, (args) => ({
            path: path.join(PONTE, SUBSTITUTOS[args.path.replace(/^node:/, '')]),
        }));
        b.onResolve({ filter: /^(express|cors|http|https|net|worker_threads)$/ }, (args) => ({
            errors: [{ text: `O backend no navegador não pode usar "${args.path}" (${args.importer}).` }],
        }));
        b.onResolve({ filter: /^estudio:amostras$/ }, () => ({ path: 'amostras', namespace: 'estudio-amostras' }));
        b.onLoad({ filter: /.*/, namespace: 'estudio-amostras' }, () => {
            const mapa = {};
            for (const nome of fs.readdirSync(AMOSTRAS)) {
                const arq = path.join(AMOSTRAS, nome);
                if (fs.statSync(arq).isFile()) mapa[nome] = fs.readFileSync(arq).toString('base64');
            }
            return { contents: `export default ${JSON.stringify(mapa)};`, loader: 'js', watchDirs: [AMOSTRAS] };
        });
        // __dirname/__filename por arquivo (o esbuild não define no navegador).
        b.onLoad({ filter: /[\\/]backend[\\/]src[\\/].*\.js$/ }, (args) => {
            const codigo = fs.readFileSync(args.path, 'utf8');
            if (!/__dirname|__filename/.test(codigo)) return undefined;
            const dir = dirnameVirtual(args.path);
            const cab = `var __dirname = ${JSON.stringify(dir)}; var __filename = ${JSON.stringify(`${dir}/${path.basename(args.path)}`)};\n`;
            return { contents: cab + codigo, loader: 'js' };
        });
    },
};

/**
 * empacotar({ minificar }) → { codigo, arquivos }
 * Usado pelo plugin (dev e build) e pelo teste de ponta a ponta no Node (backend/test/navegador-motor.test.js).
 */
export async function empacotar({ minificar = false } = {}) {
    const r = await build({
        entryPoints: [path.join(MOTOR, 'entrada.js')],
        bundle: true,
        write: false,
        format: 'esm',
        platform: 'browser',
        target: 'es2022',
        inject: [path.join(PONTE, 'globais.js')],
        define: { 'require.main': 'undefined' },
        plugins: [pluginNode],
        metafile: true,
        minify: minificar,
        legalComments: 'none',
        logLevel: 'silent',
        charset: 'utf8',
    });
    const arquivos = Object.keys(r.metafile.inputs)
        .filter((f) => !f.includes(':'))
        .map((f) => path.resolve(process.cwd(), f));
    return { codigo: r.outputFiles[0].text, arquivos };
}

export default function motorNavegador() {
    return {
        name: 'estudio-motor-navegador',
        resolveId(id) {
            if (id === ID) return ID_RESOLVIDO;
            return undefined;
        },
        async load(id) {
            if (id !== ID_RESOLVIDO) return undefined;
            const { codigo, arquivos } = await empacotar();
            arquivos.forEach((f) => this.addWatchFile(f));
            return codigo;
        },
    };
}
