// Erros do cliente OpenRouter (mensagens em português, sem nunca carregar a chave).
const { lerChaves } = require('./ambiente');

class ErroEstudio extends Error {
    constructor(mensagem, extra = {}) {
        super(limparSegredos(mensagem));
        this.name = this.constructor.name;
        for (const [k, v] of Object.entries(extra)) this[k] = v;
    }
}
class ErroOpenRouter extends ErroEstudio {}   // falha HTTP/rede com o OpenRouter (status, codigo, incerto)
class ErroOrcamento extends ErroEstudio {}    // teto de plano/episódio/série estourado
class ErroConfirmacao extends ErroEstudio {}  // token de confirmação inválido/expirado/de outro pedido
class ErroValidacao extends ErroEstudio {}    // pedido incompatível com o modelo
class ErroPreco extends ErroEstudio {}        // não sei calcular o preço do modelo
class ErroJob extends ErroEstudio {}          // job duplicado/incerto/inexistente

const OCULTO = '[chave oculta]';

// Remove do texto a chave do ambiente (e qualquer coisa com cara de chave do OpenRouter).
function limparSegredos(texto, extras = []) {
    let t = texto === undefined || texto === null ? '' : String(texto);
    for (const s of [...lerChaves(), ...extras]) {
        if (s && s.length >= 6) t = t.split(s).join(OCULTO);
    }
    t = t.replace(/sk-or-[A-Za-z0-9_-]{6,}/g, OCULTO);
    t = t.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, `Bearer ${OCULTO}`);
    return t;
}

module.exports = {
    ErroEstudio, ErroOpenRouter, ErroOrcamento, ErroConfirmacao, ErroValidacao, ErroPreco, ErroJob,
    limparSegredos,
};
