// Casca HTTP dos controllers da Mesa: junta query + corpo, responde JSON e { Error } em falha (sem segredos).
const { limparSegredos } = require('../openrouter/erros');

function responder(fn) {
    return async (req, res) => {
        try {
            const dados = { ...(req.query || {}), ...(req.body || {}) };
            const r = await fn(dados, req, res);
            if (!res.headersSent) res.json(r === undefined ? { ok: true } : r);
        } catch (error) {
            const msg = limparSegredos(error.message);
            console.error('Error:', msg);
            const status = Number(error.status) >= 400 && Number(error.status) < 600 ? Number(error.status) : 500;
            if (!res.headersSent) res.status(status).json({ Error: msg, ...(error.erros ? { erros: error.erros } : {}) });
        }
    };
}

function exigir(dados, ...campos) {
    const faltam = campos.filter((c) => dados[c] === undefined || dados[c] === null || dados[c] === '');
    if (faltam.length) throw Object.assign(new Error(`Informe ${faltam.join(', ')}.`), { status: 400 });
}

module.exports = { responder, exigir };
