// POST /MixarAudio { serie, episodio, ambiente?: 0.12 | "caminho/relativo/a/serie.wav", volumeAmbiente?, clipe?: "caminho relativo", volumeClipe?, ducking?: 3 }
// falas.json → episodios/epNN/audio/episodio.wav: falas no tempo certo + fundo com ducking + master -14 LUFS / -1,5 dBTP.
const path = require('path');
const fs = require('fs');
const { lerFalasEpisodio } = require('../audio/falas');
const { mixarEpisodio } = require('../audio/tratamento');
const { pastaEpisodio } = require('../audio/config');

function dentroDaSerie(pastaSerie, relativo) {
    const abs = path.resolve(pastaSerie, String(relativo));
    if (!abs.startsWith(path.resolve(pastaSerie) + path.sep)) throw new Error(`Caminho fora da pasta da série: ${relativo}`);
    if (!fs.existsSync(abs)) throw new Error(`Arquivo não encontrado: ${relativo}`);
    return abs;
}

exports.REST = async (req, res) => {
    try {
        const { serie, episodio, ambiente = null, volumeAmbiente, clipe = null, volumeClipe, ducking } = req.body || {};
        if (!serie || !episodio) return res.status(400).json({ Error: 'Informe serie e episodio.' });
        const { doc, pastaSerie } = lerFalasEpisodio(serie, episodio);
        const falas = doc.falas.filter((f) => f.status === 'pronta' && f.arquivo)
            .map((f) => ({ arquivo: path.join(pastaSerie, f.arquivo), inicioS: f.inicioS, duracaoS: f.duracaoS }));
        const amb = typeof ambiente === 'number' ? ambiente
            : ambiente ? { arquivo: dentroDaSerie(pastaSerie, ambiente), volume: volumeAmbiente ?? 0.3 } : null;
        const cl = clipe ? { arquivo: dentroDaSerie(pastaSerie, clipe), volume: volumeClipe ?? 1 } : null;
        const saida = path.join(pastaEpisodio(serie, episodio), 'audio', 'episodio.wav');
        const r = await mixarEpisodio({ falas, duracaoS: doc.duracaoS, ambiente: amb, clipe: cl, ducking: ducking ? { razao: Number(ducking) } : {}, saida });
        return res.json({ ok: true, arquivo: saida, duracaoS: r.duracaoS, loudness: r.depois, tipo: r.tipo, master: r.cadeia });
    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ Error: error.message });
    }
};
