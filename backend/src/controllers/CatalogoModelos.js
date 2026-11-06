// GET /CatalogoModelos[?forcar=1] — modelos do OpenRouter por papel (texto, imagem, vídeo), com preço de referência.
// Grátis (só leitura do catálogo, cache de 24 h). Usado pelo card "Modelos" da Sala.
const { catalogoModelos } = require('../openrouter/modelos');
const { limparSegredos } = require('../openrouter/erros');

exports.REST = async (req, res) => {
    try {
        const forcar = ['1', 'true', 'sim'].includes(String((req.query && req.query.forcar) || ''));
        return res.json(await catalogoModelos({ forcar }));
    } catch (error) {
        const msg = limparSegredos(error.message);
        console.error('Error:', msg);
        res.status(500).json({ Error: msg });
    }
};
