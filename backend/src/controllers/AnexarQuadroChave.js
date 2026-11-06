// POST /AnexarQuadroChave { serie, ep, plano, arquivo: { nome, base64 } } — imagem gerada FORA vira o quadro-chave
// do plano: grava em episodios/epNN/quadros/pNN-externo-<id>.<ext> e devolve { arquivo, quadroChave } para a Mesa
// gravar no plano (origem "externo"). PNG/JPEG/WEBP até 25 MB. Custo 0. Registro: "edicao" / "anexo-externo".
const externo = require('../externo');
const { entrada, responderErro } = require('../series/http');

exports.REST = async (req, res) => {
    try {
        const { serie, ep, plano, arquivo } = entrada(req);
        if (!serie || !ep || !plano) return res.status(400).json({ Error: 'Informe serie, ep e plano.' });
        return res.json(await externo.anexarQuadroChave({ serie, ep, plano, upload: { arquivo } }));
    } catch (error) {
        return responderErro(res, error);
    }
};
