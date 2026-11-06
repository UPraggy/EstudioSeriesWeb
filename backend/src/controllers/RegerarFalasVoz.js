// POST /RegerarFalasVoz { serie, ep, quem? } — regera as falas com a voz/tom ATUAIS da ficha/série (TTS grátis, sem
// cotação). quem = só esse personagem; sem quem = todas (as que não mudaram vêm do cache). Com edição, troca só os
// itens de fala (takes, cortes e ajustes ficam; Ctrl+Z desfaz); sem edição, refaz o falas.json.
// → { modo: 'edicao'|'falas', regeradas, doCache, avisos, edicao?, historico? }
const { responder, exigir } = require('../edicao/http');
const { regerarFalasVoz } = require('../audio/vozesFalas');

exports.REST = responder(async (d) => {
    exigir(d, 'serie', 'ep');
    return regerarFalasVoz({ serie: d.serie, ep: d.ep, quem: d.quem || null });
});
