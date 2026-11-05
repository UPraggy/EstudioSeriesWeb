// Caminhos e leitura de arquivos do módulo de áudio.
// Tudo é lido NA HORA da chamada (não no require), para os testes poderem trocar o ambiente.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const NARRADOR_PADRAO = 'E:\\projects\\ClaudeCode\\ClaudCodeCodes\\NarradorVideo';
const PYTHON_PADRAO = 'C:\\Users\\rafae\\AppData\\Local\\Programs\\Python\\Python311\\python.exe';
const CERT_AVAST = 'C:\\ProgramData\\Avast Software\\Avast\\wscert.pem';

const pastaNarrador = () => process.env.NARRADOR_DIR || NARRADOR_PADRAO;
const pythonMotor = () => process.env.ESTUDIO_PYTHON || PYTHON_PADRAO;
const raizDados = () => process.env.ESTUDIO_DADOS || 'E:\\EstudioSeriesDados';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function idEpisodio(ep) {
    if (typeof ep === 'number' || /^\d+$/.test(String(ep ?? ''))) {
        const n = Number(ep);
        if (!Number.isInteger(n) || n < 1 || n > 999) throw new Error(`Episódio inválido: ${ep}`);
        return `ep${String(n).padStart(2, '0')}`;
    }
    const s = String(ep || '').trim().toLowerCase();
    if (!/^ep\d{2,3}$/.test(s)) throw new Error(`Episódio inválido: ${ep} (use 1 ou "ep01")`);
    return s;
}

function pastaSerie(serie) {
    if (!SLUG.test(String(serie || ''))) throw new Error(`Série inválida: ${serie} (id = slug: minúsculas, números e hífens)`);
    return path.join(raizDados(), 'series', serie);
}

const pastaEpisodio = (serie, ep) => path.join(pastaSerie(serie), 'episodios', idEpisodio(ep));

function lerJson(arquivo) {
    return JSON.parse(fs.readFileSync(arquivo, 'utf8').replace(/^\uFEFF/, ''));
}

function lerJsonSeExistir(arquivo, padrao = null) {
    return fs.existsSync(arquivo) ? lerJson(arquivo) : padrao;
}

// Grava por arquivo temporário + rename: quem lê nunca pega um JSON pela metade.
function gravarJson(arquivo, dados) {
    fs.mkdirSync(path.dirname(arquivo), { recursive: true });
    const tmp = `${arquivo}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(dados, null, 2) + '\n', 'utf8');
    fs.renameSync(tmp, arquivo);
}

let cacheVozes = null;
// vozes.json do NarradorVideo: lista oficial de vozes (só estas), papéis padrão e dicionários de pronúncia.
function carregarVozes() {
    const arquivo = process.env.ESTUDIO_VOZES_JSON || path.join(pastaNarrador(), 'vozes.json');
    const mtime = fs.statSync(arquivo).mtimeMs;
    if (!cacheVozes || cacheVozes.arquivo !== arquivo || cacheVozes.mtime !== mtime) {
        cacheVozes = { arquivo, mtime, dados: lerJson(arquivo) };
    }
    return cacheVozes.dados;
}

let avastRodando = null;
// Igual ao narrar.ps1: só aponta SSL_CERT_FILE para o CA do Avast se o Avast estiver rodando
// (ele reassina o TLS); sem Avast, um SSL_CERT_FILE só com esse CA quebraria a verificação.
function ambientePython() {
    const env = { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' };
    if (!env.SSL_CERT_FILE && process.platform === 'win32' && fs.existsSync(CERT_AVAST)) {
        if (avastRodando === null) {
            try {
                const saida = execFileSync('tasklist', ['/FI', 'IMAGENAME eq AvastSvc.exe', '/NH'], { encoding: 'utf8', windowsHide: true });
                avastRodando = /AvastSvc\.exe/i.test(saida);
            } catch {
                avastRodando = false;
            }
        }
        if (avastRodando) env.SSL_CERT_FILE = CERT_AVAST;
    }
    return env;
}

module.exports = {
    pastaNarrador, pythonMotor, raizDados, idEpisodio, pastaSerie, pastaEpisodio,
    lerJson, lerJsonSeExistir, gravarJson, carregarVozes, ambientePython, SLUG,
};
