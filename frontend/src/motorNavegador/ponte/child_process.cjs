// `require('child_process')` do backend no navegador: não há Python, ffmpeg nem executáveis.
// Quem chamar recebe um erro claro (as rotas de voz, QA, mixagem, miniaturas e montagem ainda precisam do
// Estúdio do PC; ver docs/MOTOR-NAVEGADOR.md, "O que ainda não roda no navegador").
const MENSAGEM = 'Esta função ainda precisa do Estúdio do PC (usa ffmpeg/Python, que não existem no navegador). '
    + 'No site, ligue o Estúdio do PC em Configurações ou faça esta parte pelo Abrir Estudio.vbs.';

function erro() {
    const e = new Error(MENSAGEM);
    e.code = 'ESONOPC';
    e.status = 501;
    return e;
}
function semProcesso() { throw erro(); }

module.exports = {
    MENSAGEM,
    spawn: semProcesso,
    spawnSync: semProcesso,
    exec: semProcesso,
    execSync: semProcesso,
    execFile: semProcesso,
    execFileSync: semProcesso,
    fork: semProcesso,
};
