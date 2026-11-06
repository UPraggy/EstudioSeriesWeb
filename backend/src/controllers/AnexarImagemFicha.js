// POST /AnexarImagemFicha { serie, tipo: elenco|locais|objetos, id, estado?, vista?, arquivo: { nome, base64 } }
// Imagem gerada FORA do Estúdio vira referência da ficha no mesmo lugar e registro da geração interna:
// <tipo>/<id>/ref/<estado>-<vista>.<ext>, estados[].refs[vista] e a canônica (se ainda não houver). Custo 0.
// Só PNG/JPEG/WEBP de verdade (conferido pelo conteúdo), até 25 MB. Registro: área "serie", evento "anexo-externo".
const externo = require('../externo');
const { entrada, responderErro } = require('../series/http');

exports.REST = async (req, res) => {
    try {
        const { serie, tipo, id, estado, vista, arquivo } = entrada(req);
        if (!serie || !tipo || !id) return res.status(400).json({ Error: 'Informe serie, tipo e id da ficha.' });
        return res.json(await externo.anexarImagemFicha({ serie, tipo, id, estado, vista, upload: { arquivo } }));
    } catch (error) {
        return responderErro(res, error);
    }
};
