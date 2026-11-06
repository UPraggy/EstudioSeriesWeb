// GET|POST /ConferirVozesFalas { serie, ep } — só leitura: as falas gravadas (edição, senão falas.json) foram geradas
// com a voz/tom que o personagem tem AGORA? → { fonte, total, mudancas: [ { quem, nome, nomeVozAntes, nomeVozAgora,
// vozAntes, vozAgora, tomAntes, tomAgora, mudouVoz, mudouTom, origemVoz, falas: [{ id, fala, texto }] } ], erros }.
const { responder, exigir } = require('../edicao/http');
const { conferirVozes } = require('../audio/vozesFalas');

exports.REST = responder(async (d) => {
    exigir(d, 'serie', 'ep');
    return conferirVozes(d.serie, d.ep);
});
