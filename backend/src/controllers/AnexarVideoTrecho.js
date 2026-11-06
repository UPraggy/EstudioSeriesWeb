// POST /AnexarVideoTrecho — vídeo gerado FORA vira um TAKE novo do plano (custo 0), aparado ao trecho como os
// takes gerados, e entra na linha do tempo (aplicar=false só guarda nos takes).
// Dois jeitos de enviar:
//   JSON: { serie, ep, deS, ateS (ou plano), instrucao?, aplicar?, arquivo: { nome, base64 } }
//   binário (vídeos grandes): corpo = o arquivo (Content-Type video/* ou application/octet-stream) e
//           ?serie=&ep=&deS=&ateS=&nome=&instrucao=&aplicar=  (registrado no routes.js com express.raw, até 300 MB)
// MP4/MOV/WEBM conferido pelo conteúdo + ffprobe; avisa se não for 9:16. Registro: área "edicao", "anexo-externo".
const externo = require('../externo');
const { responderErro } = require('../series/http');

exports.REST = async (req, res) => {
    try {
        const binario = Buffer.isBuffer(req.body);
        const d = { ...(req.query || {}), ...(!binario && req.body && typeof req.body === 'object' ? req.body : {}) };
        if (!d.serie || !d.ep) return res.status(400).json({ Error: 'Informe serie e ep.' });
        const upload = binario ? { buffer: req.body, nome: d.nome } : { arquivo: d.arquivo };
        const aplicar = !(d.aplicar === false || d.aplicar === 'false' || d.aplicar === '0');
        return res.json(await externo.anexarVideoTrecho({
            serie: d.serie, ep: d.ep, deS: d.deS, ateS: d.ateS, plano: d.plano, instrucao: d.instrucao || '', upload, aplicar,
        }));
    } catch (error) {
        return responderErro(res, error);
    }
};
