// Para o Estúdio que o scripts/dev.js subiu (lê logs/estudio.pid). Se não houver pid, procura quem escuta nas portas.
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PID = path.join(__dirname, '..', 'logs', 'estudio.pid');
const matar = (pid) => {
    try { execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore', windowsHide: true }); return true; } catch { return false; }
};

let portas = [Number(process.env.PORTA || 4190), Number(process.env.PORTA_WEB || 5190)];
let parados = 0;
if (fs.existsSync(PID)) {
    const info = JSON.parse(fs.readFileSync(PID, 'utf8'));
    portas = [info.PORTA, info.PORTA_WEB];
    for (const p of [...(info.filhos || []), info.dev]) if (p && matar(p)) parados++;
    fs.unlinkSync(PID);
}
for (const porta of portas) {
    try {
        const saida = execSync(`powershell -NoProfile -Command "(Get-NetTCPConnection -LocalPort ${porta} -State Listen -ErrorAction SilentlyContinue).OwningProcess"`, { encoding: 'utf8', windowsHide: true });
        for (const p of saida.split(/\s+/).filter(Boolean)) if (matar(p)) parados++;
    } catch { /* porta livre */ }
}
console.log(parados ? `Estúdio parado (${parados} processo(s)).` : 'O Estúdio não estava rodando.');
