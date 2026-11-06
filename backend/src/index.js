// Servidor do Estúdio de Séries (só 127.0.0.1).
const express = require('express');
const cors = require('cors');
const routes = require('./routes');
const registro = require('./log/registro');
const { criarMiddleware } = require('./log/http');

const app = express();
// registro de cada requisição (método, rota, status, ms; nunca o corpo) — vem antes de tudo para medir o tempo inteiro
const registroHttp = criarMiddleware();
app.use(registroHttp);
app.use(express.json({ limit: '100mb' }));

// Quem pode chamar este backend pelo navegador: a própria máquina e o site publicado no GitHub Pages
// (motor híbrido; endereço próprio series.rafaelmr.com.br). Outras origens: ESTUDIO_ORIGENS="https://a.github.io,https://b.dev" (separadas por vírgula).
const ORIGENS_PUBLICADAS = (process.env.ESTUDIO_ORIGENS || 'https://upraggy.github.io,https://series.rafaelmr.com.br')
    .split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean);
const origemPermitida = (o) => !o
    || /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(o)
    || ORIGENS_PUBLICADAS.includes(o);

// Site HTTPS chamando 127.0.0.1: o Chrome pergunta antes ("Private Network Access"/"Local Network Access").
// No pré-voo antigo ele exige este cabeçalho; só respondemos para origens permitidas.
app.use((req, res, next) => {
    if (req.method === 'OPTIONS' && req.headers['access-control-request-private-network'] === 'true' && origemPermitida(req.headers.origin)) {
        res.setHeader('Access-Control-Allow-Private-Network', 'true');
    }
    next();
});
app.use(cors({ origin: (o, cb) => cb(null, origemPermitida(o)) }));
app.use('/api', routes); // o frontend chama /api/<Rota>
app.use(routes);          // padrão do Rafael: /<Rota> direto

// Em produção o Express também serve o frontend compilado (frontend/dist).
const path = require('path');
const fs = require('fs');
const DIST = path.join(__dirname, '..', '..', 'frontend', 'dist');
if (fs.existsSync(DIST)) {
    app.use(express.static(DIST));
    app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(DIST, 'index.html')));
}

// Erro que escapou de um controller (ex.: JSON inválido no corpo): registra e responde no padrão { Error }.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    const status = Number(err.status || err.statusCode) >= 400 && Number(err.status || err.statusCode) < 600 ? Number(err.status || err.statusCode) : 500;
    if (status >= 500) registro.erro('sistema', 'erro-express', `Erro não tratado em ${req.method} ${req.path}: ${err.message}`, { erro: err });
    if (res.headersSent) return;
    res.status(status).json({ Error: registro.limparTexto(status === 400 && err.type === 'entity.parse.failed' ? 'Corpo da requisição não é um JSON válido.' : err.message, 500) });
});

const PORTA = Number(process.env.PORTA || 4190);

// Erros que ninguém pegou: registra e mantém o servidor de pé (só sai quando não dá para continuar, ex.: porta ocupada).
const FATAIS = new Set(['EADDRINUSE', 'EACCES', 'ERR_SERVER_ALREADY_LISTEN']);
function instalarGuardas() {
    process.on('unhandledRejection', (motivo) => {
        registro.erro('sistema', 'promessa-sem-tratamento', `Promessa rejeitada sem tratamento: ${motivo && motivo.message ? motivo.message : String(motivo)}`,
            { erro: motivo instanceof Error ? motivo : undefined, dados: { pilha: motivo && motivo.stack ? String(motivo.stack).split('\n').slice(0, 4).join(' | ') : undefined } });
    });
    process.on('uncaughtException', (e) => {
        const fatal = FATAIS.has(e && e.code);
        registro.erro('sistema', fatal ? 'erro-fatal' : 'excecao-sem-tratamento', `${fatal ? 'Erro fatal' : 'Exceção sem tratamento (o servidor continua)'}: ${e && e.message}`,
            { erro: e, dados: { pilha: e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : undefined } });
        if (fatal) process.exit(1);
    });
}

function iniciar(porta = PORTA) {
    instalarGuardas();
    const ret = registro.limparAntigos();
    const { modoSimulado, temChave } = require('./openrouter/ambiente');
    const servidor = app.listen(porta, '127.0.0.1', () => {
        console.log(`Estúdio de Séries em http://127.0.0.1:${porta}`);
        registro.info('sistema', 'inicio', `Servidor no ar na porta ${porta} (${modoSimulado() ? 'SIMULADO, sem gasto' : 'REAL'})`, {
            dados: {
                porta, modo: modoSimulado() ? 'simulado' : 'real', chaveOpenRouter: temChave(), node: process.version, pid: process.pid,
                dados: process.env.ESTUDIO_DADOS || 'E:\\EstudioSeriesDados', registro: registro.pastaLogs(),
                guardarDias: ret.dias, apagadosNaLimpeza: ret.apagados.length,
            },
        });
    });
    servidor.on('error', (e) => {
        registro.erro('sistema', 'erro-fatal', `O servidor não subiu na porta ${porta}: ${e.message}`, { erro: e });
        process.exit(1);
    });
    const inicio = Date.now();
    let encerrando = false;
    const encerrar = (sinal) => {
        if (encerrando) return;
        encerrando = true;
        registroHttp.parar();
        registro.info('sistema', 'fim', `Servidor encerrado (${sinal}) depois de ${Math.round((Date.now() - inicio) / 60000)} min no ar`, { dados: { sinal, minutos: Math.round((Date.now() - inicio) / 60000) } });
        process.exit(0);
    };
    process.on('SIGINT', () => encerrar('SIGINT'));
    process.on('SIGTERM', () => encerrar('SIGTERM'));
    process.on('SIGBREAK', () => encerrar('SIGBREAK'));
    return servidor;
}

if (require.main === module) iniciar();

module.exports = app;
