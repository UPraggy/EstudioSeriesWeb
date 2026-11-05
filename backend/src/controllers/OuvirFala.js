// POST /OuvirFala { texto, quem?, voz?, intencao?, via?, serie?, tom?, velocidade?, volume?, filtro?, tratar?, responder? }
// Gera UMA fala com a voz/intenção pedida (mesmas regras do episódio) e devolve o arquivo.
// responder: "json" (padrão: caminho, duração, palavras e parâmetros) | "arquivo" (o próprio wav).
const { gerarFalaAvulsa } = require('../audio/falas');

exports.REST = async (req, res) => {
    try {
        const corpo = req.body || {};
        if (!corpo.texto || !String(corpo.texto).trim()) return res.status(400).json({ Error: 'Informe o texto da fala.' });
        const campos = ['texto', 'quem', 'voz', 'intencao', 'via', 'tom', 'velocidade', 'volume', 'filtro', 'pausa', 'pausaAntesS', 'pausaDepoisS', 'pausaFrasesS', 'tipoPlano'];
        const entrada = Object.fromEntries(campos.filter((c) => corpo[c] !== undefined).map((c) => [c, corpo[c]]));
        const fala = await gerarFalaAvulsa(entrada, { serie: corpo.serie, tratar: corpo.tratar !== false });
        if (corpo.responder === 'arquivo') return res.type('audio/wav').sendFile(fala.arquivo);
        return res.json({ ok: true, ...fala });
    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ Error: error.message });
    }
};
