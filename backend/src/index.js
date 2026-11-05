// Servidor do Estúdio de Séries (só 127.0.0.1).
const express = require('express');
const cors = require('cors');
const routes = require('./routes');

const app = express();
app.use(express.json({ limit: '100mb' }));

// Quem pode chamar este backend pelo navegador: a própria máquina e o site publicado no GitHub Pages
// (motor híbrido). Outras origens: ESTUDIO_ORIGENS="https://a.github.io,https://b.dev" (separadas por vírgula).
const ORIGENS_PUBLICADAS = (process.env.ESTUDIO_ORIGENS || 'https://upraggy.github.io')
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

const PORTA = Number(process.env.PORTA || 4190);
if (require.main === module) {
    app.listen(PORTA, '127.0.0.1', () => console.log(`Estúdio de Séries em http://127.0.0.1:${PORTA}`));
}

module.exports = app;
