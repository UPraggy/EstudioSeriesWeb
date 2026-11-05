// POST /GerarFalas { serie, episodio, regerar?, tratar? }
// roteiro.json do episódio → falas.json + um wav por fala (vozes de vozes.json, intenção, pronúncia, tratamento).
const { gerarFalasEpisodio } = require('../audio/falas');

exports.REST = async (req, res) => {
    try {
        const { serie, episodio, regerar = false, tratar = true } = req.body || {};
        if (!serie || !episodio) return res.status(400).json({ Error: 'Informe serie e episodio.' });
        const { arquivo, doc } = await gerarFalasEpisodio(serie, episodio, { regerar: Boolean(regerar), tratar: tratar !== false });
        const falhas = doc.falas.filter((f) => f.status !== 'pronta').map((f) => ({ id: f.id, quem: f.quem, erro: f.erro || 'não gerada' }));
        return res.json({
            ok: falhas.length === 0,
            arquivo,
            total: doc.falas.length,
            doCache: doc.falas.filter((f) => f.doCache).length,
            duracaoS: doc.duracaoS,
            fimFalasS: doc.fimFalasS,
            falhas,
            avisos: doc.avisos,
            falas: doc.falas.map((f) => ({
                id: f.id, plano: f.plano, quem: f.quem, voz: f.voz, intencao: f.intencao, tom: f.tom, velocidade: f.velocidade,
                volume: f.volume, inicioS: f.inicioS, duracaoS: f.duracaoS, arquivo: f.arquivo, status: f.status,
            })),
        });
    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ Error: error.message });
    }
};
