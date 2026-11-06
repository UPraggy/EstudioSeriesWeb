// Peças únicas do motor do navegador, compartilhadas pelo pacote do backend (via ponte/*.cjs) e pela entrada.
// O `process` daqui é SEMPRE o usado pelo backend no navegador (o esbuild injeta; ver vite-plugin-motor.js):
// nada do ambiente da máquina vaza para dentro, nem nos testes que rodam no Node.
import { criarVfs } from './vfs.js';

export const DADOS = '/dados';

const ouvintesErro = new Set();
export const aoErroGravar = (fn) => { ouvintesErro.add(fn); return () => ouvintesErro.delete(fn); };

export const vfs = criarVfs({ aoErroGravar: (erro) => ouvintesErro.forEach((fn) => fn(erro)) });

export const processo = {
    // Registro (log) junto das séries, para a aba Registro funcionar entre visitas; sem eco no console do navegador.
    env: { ESTUDIO_DADOS: DADOS, NODE_ENV: 'production', ESTUDIO_MOTOR: 'navegador', ESTUDIO_LOGS: `${DADOS}/_registro`, ESTUDIO_LOG_CONSOLE: '0' },
    platform: 'browser',
    pid: 1,
    arch: 'wasm',
    version: 'v0.0.0-navegador',
    versions: {},
    argv: [],
    execArgv: [],
    cwd: () => '/',
    nextTick: (fn, ...args) => queueMicrotask(() => fn(...args)),
    on() { return processo; },
    once() { return processo; },
    off() { return processo; },
    emitWarning() {},
    hrtime: Object.assign(
        (antes) => {
            const t = performance.now();
            const s = Math.floor(t / 1000);
            const ns = Math.floor((t % 1000) * 1e6);
            if (!antes) return [s, ns];
            return [s - antes[0], ns - antes[1]];
        },
        { bigint: () => BigInt(Math.floor(performance.now() * 1e6)) },
    ),
    memoryUsage: () => ({ rss: 0, heapUsed: 0, heapTotal: 0 }),
    uptime: () => performance.now() / 1000,
    exit() { throw new Error('process.exit não existe no navegador.'); },
};
