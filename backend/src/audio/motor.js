// Ponte com o motor Python do NarradorVideo (fala_cli.py): JSON no stdin → JSON no stdout.
// Uma chamada = um processo Python; use acao "lote" para várias falas de uma vez.
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { pastaNarrador, pythonMotor, ambientePython } = require('./config');

function chamarFalaCli(pedido, { timeoutMs } = {}) {
    const script = path.join(pastaNarrador(), 'fala_cli.py');
    const python = pythonMotor();
    if (!fs.existsSync(script)) return Promise.reject(new Error(`Motor não encontrado: ${script}`));
    if (!fs.existsSync(python)) return Promise.reject(new Error(`Python não encontrado: ${python} (ajuste ESTUDIO_PYTHON)`));
    const itens = pedido.acao === 'lote' ? (pedido.itens || []).length : 1;
    const limite = timeoutMs || (pedido.acao === 'qa' ? 180000 : 60000 + 45000 * itens);

    return new Promise((resolve, reject) => {
        const proc = spawn(python, [script], { cwd: pastaNarrador(), env: ambientePython(), windowsHide: true });
        const saida = [];
        const erros = [];
        const relogio = setTimeout(() => {
            proc.kill();
            reject(new Error(`Motor passou de ${Math.round(limite / 1000)} s e foi interrompido`));
        }, limite);
        proc.stdout.on('data', (d) => saida.push(d));
        proc.stderr.on('data', (d) => erros.push(d));
        proc.on('error', (e) => {
            clearTimeout(relogio);
            reject(new Error(`Falha ao iniciar o Python: ${e.message}`));
        });
        proc.on('close', () => {
            clearTimeout(relogio);
            const texto = Buffer.concat(saida).toString('utf8').trim();
            const linha = texto.split(/\r?\n/).filter(Boolean).at(-1) || '';
            let resposta;
            try {
                resposta = JSON.parse(linha);
            } catch {
                const log = Buffer.concat(erros).toString('utf8').slice(-800);
                return reject(new Error(`Resposta inválida do motor: ${linha.slice(0, 200) || '(vazia)'} ${log}`.trim()));
            }
            if (!resposta.ok) return reject(new Error(resposta.erro || 'motor falhou'));
            resolve(resposta);
        });
        proc.stdin.end(JSON.stringify(pedido), 'utf8');
    });
}

module.exports = { chamarFalaCli };
