// GET /CatalogoVideo[?forcar=1] — modelos de vídeo do OpenRouter (cache de 24 h) com preço de exemplo (8 s, 720p, 9:16).
const servico = require('../openrouter/servico');
const { limparSegredos } = require('../openrouter/erros');

exports.REST = async (req, res) => {
    try {
        const forcar = ['1', 'true', 'sim'].includes(String((req.query && req.query.forcar) || ''));
        return res.json(await servico.catalogoVideoResumo({ forcar }));
    } catch (error) {
        const msg = limparSegredos(error.message);
        console.error('Error:', msg);
        res.status(500).json({ Error: msg });
    }
};
