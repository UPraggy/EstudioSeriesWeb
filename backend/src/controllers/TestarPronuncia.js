// POST /TestarPronuncia — Whisper offline (qa_pronuncia.py) numa fala; devolve nota e palavras trocadas.
//   { serie, episodio, id, modelo? }            → fala já gerada do episódio (falas.json)
//   { texto, quem?, voz?, intencao?, serie?, modelo? } → gera a fala (prévia) e testa
const { testarPronuncia, testarFalaDoEpisodio } = require('../audio/qa');
const { gerarFalaAvulsa } = require('../audio/falas');

exports.REST = async (req, res) => {
    try {
        const corpo = req.body || {};
        const modelo = corpo.modelo || 'small';
        if (corpo.episodio && corpo.id) {
            if (!corpo.serie) return res.status(400).json({ Error: 'Informe a serie.' });
            return res.json({ ok: true, ...(await testarFalaDoEpisodio(corpo.serie, corpo.episodio, corpo.id, { modelo })) });
        }
        if (!corpo.texto) return res.status(400).json({ Error: 'Informe { serie, episodio, id } ou { texto, quem/voz, intencao }.' });
        const campos = ['texto', 'quem', 'voz', 'intencao', 'via', 'tom', 'velocidade', 'volume', 'filtro'];
        const entrada = Object.fromEntries(campos.filter((c) => corpo[c] !== undefined).map((c) => [c, corpo[c]]));
        const fala = await gerarFalaAvulsa(entrada, { serie: corpo.serie, tratar: corpo.tratar !== false });
        const r = await testarPronuncia({ arquivo: fala.arquivo, texto: fala.textoExibido, modelo });
        return res.json({ ok: true, voz: fala.voz, intencao: fala.intencao, texto: fala.textoExibido, textoFalado: fala.textoFalado, arquivo: fala.arquivo, ...r });
    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ Error: error.message });
    }
};
