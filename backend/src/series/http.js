// Ajudantes dos controllers de séries: junta query + body e responde erro no padrão { Error }.

// Aceita os dados por GET (?serie=...) ou POST (JSON); o body vence a query.
function entrada(req) {
    return { ...(req.query || {}), ...(req.body && typeof req.body === 'object' ? req.body : {}) };
}

function responderErro(res, error) {
    console.error('Error:', error.message);
    const corpo = { Error: error.message };
    if (Array.isArray(error.erros)) corpo.erros = error.erros;
    if (Array.isArray(error.avisos)) corpo.avisos = error.avisos;
    const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 600 ? error.status : 500;
    return res.status(status).json(corpo);
}

module.exports = { entrada, responderErro };
