// Sobe o Estúdio inteiro (backend Express + frontend Vite) com um comando só e abre o navegador.
//   npm run dev                      -> modo REAL (gerações pagas só com confirmação na tela)
//   npm run dev -- --simulado        -> nada chama a API paga (custo 0, resultados de exemplo)
//   npm run dev -- --sem-navegador   -> não abre o navegador
// Portas: PORTA (backend, padrão 4190) e PORTA_WEB (frontend, padrão 5190).
// Se o Estúdio já estiver no ar, só abre o navegador. Os PIDs ficam em logs/estudio.pid (usado por scripts/parar.js).
const { spawn, exec } = require('child_process');
const fs = require('fs');
const net = require('net');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const LOGS = path.join(RAIZ, 'logs');
const PORTA = Number(process.env.PORTA || 4190);
const PORTA_WEB = Number(process.env.PORTA_WEB || 5190);
const args = process.argv.slice(2);
const SIMULADO = args.includes('--simulado');
const SEM_NAVEGADOR = args.includes('--sem-navegador');
const URL = `http://127.0.0.1:${PORTA_WEB}`;
const CA_AVAST = 'E:\\AutoShortEditorDados\\ferramentas\\ca-com-avast.pem';

fs.mkdirSync(LOGS, { recursive: true });
const arquivoLog = path.join(LOGS, `estudio-${new Date().toISOString().slice(0, 10)}.log`);
const log = fs.createWriteStream(arquivoLog, { flags: 'a' });
function escrever(origem, texto) {
    const linhas = String(texto).split(/\r?\n/).filter(Boolean).map((l) => `[${origem}] ${l}`);
    for (const l of linhas) { console.log(l); log.write(`${new Date().toISOString()} ${l}\n`); }
}

function portaEmUso(porta) {
    return new Promise((res) => {
        const s = net.connect({ port: porta, host: '127.0.0.1' }, () => { s.end(); res(true); });
        s.on('error', () => res(false));
    });
}

async function esperarPorta(porta, segundos = 60) {
    for (let i = 0; i < segundos * 4; i++) {
        if (await portaEmUso(porta)) return true;
        await new Promise((r) => setTimeout(r, 250));
    }
    return false;
}

function abrirNavegador() {
    if (SEM_NAVEGADOR) return;
    exec(`cmd /c start "" "${URL}"`, { windowsHide: true });
}

async function principal() {
    const [backNoAr, webNoAr] = await Promise.all([portaEmUso(PORTA), portaEmUso(PORTA_WEB)]);
    if (backNoAr && webNoAr) {
        escrever('estudio', `já está no ar em ${URL}`);
        abrirNavegador();
        return;
    }

    const env = { ...process.env, PORTA: String(PORTA), PORTA_WEB: String(PORTA_WEB) };
    if (!env.NODE_EXTRA_CA_CERTS && fs.existsSync(CA_AVAST)) env.NODE_EXTRA_CA_CERTS = CA_AVAST; // Avast reassina o TLS
    if (SIMULADO) env.ESTUDIO_SIMULADO = '1'; else delete env.ESTUDIO_SIMULADO;
    escrever('estudio', `modo ${SIMULADO ? 'SIMULADO (sem gasto)' : 'REAL (gerações pagas só com confirmação)'} · log em ${arquivoLog}`);

    const filhos = [];
    if (!backNoAr) {
        const back = spawn(process.execPath, [path.join(RAIZ, 'backend', 'src', 'index.js')], { cwd: RAIZ, env, windowsHide: true });
        back.stdout.on('data', (d) => escrever('backend', d));
        back.stderr.on('data', (d) => escrever('backend', d));
        back.on('exit', (c) => escrever('backend', `saiu (código ${c})`));
        filhos.push(back);
    }
    if (!webNoAr) {
        const vite = path.join(RAIZ, 'frontend', 'node_modules', 'vite', 'bin', 'vite.js');
        if (!fs.existsSync(vite)) {
            escrever('estudio', 'faltam as dependências do frontend: rode "npm install" dentro de frontend\\ uma vez.');
            process.exit(1);
        }
        const web = spawn(process.execPath, [vite, '--host', '127.0.0.1', '--port', String(PORTA_WEB), '--strictPort'],
            { cwd: path.join(RAIZ, 'frontend'), env, windowsHide: true });
        web.stdout.on('data', (d) => escrever('frontend', d));
        web.stderr.on('data', (d) => escrever('frontend', d));
        web.on('exit', (c) => escrever('frontend', `saiu (código ${c})`));
        filhos.push(web);
    }
    fs.writeFileSync(path.join(LOGS, 'estudio.pid'), JSON.stringify({ dev: process.pid, filhos: filhos.map((f) => f.pid), PORTA, PORTA_WEB }));

    const ok = await esperarPorta(PORTA) && await esperarPorta(PORTA_WEB);
    if (!ok) { escrever('estudio', 'não subiu a tempo; veja o log.'); return; }
    escrever('estudio', `pronto: ${URL}`);
    abrirNavegador();

    const encerrar = () => {
        for (const f of filhos) { try { exec(`taskkill /PID ${f.pid} /T /F`, { windowsHide: true }); } catch { /* já saiu */ } }
        try { fs.unlinkSync(path.join(LOGS, 'estudio.pid')); } catch { /* sem pid */ }
        setTimeout(() => process.exit(0), 500);
    };
    process.on('SIGINT', encerrar);
    process.on('SIGTERM', encerrar);
}

principal().catch((e) => { escrever('estudio', `erro: ${e.message}`); process.exit(1); });
