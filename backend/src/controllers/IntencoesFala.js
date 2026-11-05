// GET /IntencoesFala — tabela de intenções (com as cadeias de filtro) e as vozes permitidas (vozes.json), para a interface.
const { INTENCOES } = require('../audio/parametros');
const { exportarCadeias } = require('../audio/tratamento');
const { carregarVozes } = require('../audio/config');

exports.REST = async (req, res) => {
    try {
        const vozes = carregarVozes();
        const cadeias = exportarCadeias();
        return res.json({
            ok: true,
            intencoes: Object.entries(INTENCOES.intencoes).map(([id, i]) => ({
                id, nome: i.nome, uso: i.uso, edge: i.edge, piper: i.piper, volume: i.volume,
                pausaAntesS: i.pausaAntesS, pausaDepoisS: i.pausaDepoisS, pausaFrasesS: i.pausaFrasesS, filtro: i.filtro,
            })),
            limites: INTENCOES.limites,
            vozes: (vozes.permitidas || []).map((v) => ({ id: v.id, nome: v.nome, motor: v.motor, uso: v.uso, tom: v.tom, velocidade: v.velocidade, volume: v.volume })),
            papeis: vozes.papeis || {},
            cadeias: { dialogo: cadeias.dialogo, ducking: cadeias.ducking, master: cadeias.master },
        });
    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ Error: error.message });
    }
};
