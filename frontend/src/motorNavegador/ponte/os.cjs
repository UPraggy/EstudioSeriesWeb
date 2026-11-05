// `require('os')` do backend no navegador: o mínimo (pasta temporária só na memória do sistema de arquivos virtual).
const nucleos = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4;
module.exports = {
    EOL: '\n',
    tmpdir: () => '/tmp',
    homedir: () => '/',
    platform: () => 'browser',
    type: () => 'Browser',
    arch: () => 'wasm',
    release: () => '0',
    hostname: () => 'navegador',
    cpus: () => Array.from({ length: nucleos }, () => ({ model: 'navegador', speed: 0 })),
    totalmem: () => 0,
    freemem: () => 0,
};
