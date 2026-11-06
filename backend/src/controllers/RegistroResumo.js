// GET /RegistroResumo { dias? } — resumo por dia dos últimos N dias (padrão 7): requisições, erros, avisos, gasto real,
// gerações (imagem/vídeo), chamadas de IA de texto e tempo médio de montagem. Só leitura.
const { resumirRegistro } = require('../log/leitor');
const { entrada, responderErro } = require('../series/http');

exports.REST = async (req, res) => {
    try {
        const { dias } = entrada(req);
        return res.json(resumirRegistro({ dias }));
    } catch (error) {
        return responderErro(res, error);
    }
};
