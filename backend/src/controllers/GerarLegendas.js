// POST /GerarLegendas { serie, episodio, modo?: "frase"|"palavra"|"ambos", posicao?: "baixo"|"centro"|"alto", corSrt?, tamanhoFonte?, zonaSegura? }
// falas.json → legendas.srt + legendas.ass (+ legendas-palavra.ass), pelos tempos das palavras do TTS.
const { gerarLegendasEpisodio } = require('../audio/legendas');

exports.REST = async (req, res) => {
    try {
        const { serie, episodio, ...resto } = req.body || {};
        if (!serie || !episodio) return res.status(400).json({ Error: 'Informe serie e episodio.' });
        const permitidas = ['modo', 'posicao', 'corSrt', 'tamanhoFonte', 'fonte', 'zonaSegura', 'cores', 'maxCaracteres', 'corDestaque'];
        const opcoes = Object.fromEntries(permitidas.filter((k) => resto[k] !== undefined).map((k) => [k, resto[k]]));
        const r = gerarLegendasEpisodio(serie, episodio, opcoes);
        return res.json({ ok: true, ...r });
    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ Error: error.message });
    }
};
