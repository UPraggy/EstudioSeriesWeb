// POST /SalvarBiblia { serie, campos } — grava na bíblia SÓ os campos que a interface edita
// (premissa, regras, recursos, objetos, misterios, segredos). Ler-alterar-gravar sob trava, com backup e validação:
// escolhas/votos, cronologia, personagens e temporada ficam como estão (quem mexe neles são SalvarRoteiro e RegistrarVotacao).
const armazem = require('../series/armazem');
const { entrada, responderErro } = require('../series/http');

const EDITAVEIS = ['premissa', 'regras', 'recursos', 'objetos', 'misterios', 'segredos'];

exports.EDITAVEIS = EDITAVEIS;

exports.REST = async (req, res) => {
    try {
        const { serie, campos } = entrada(req);
        if (!serie) return res.status(400).json({ Error: 'Informe a série (campo "serie").' });
        if (!campos || typeof campos !== 'object' || Array.isArray(campos)) {
            return res.status(400).json({ Error: 'Envie os campos da bíblia (objeto "campos").' });
        }
        const recusados = Object.keys(campos).filter((k) => !EDITAVEIS.includes(k));
        if (recusados.length) {
            return res.status(400).json({ Error: `Estes campos não são editados por aqui: ${recusados.join(', ')}.` });
        }
        const biblia = await armazem.atualizarBiblia(serie, (b) => {
            for (const k of Object.keys(campos)) b[k] = campos[k];
            return b;
        });
        return res.json({ biblia });
    } catch (error) {
        return responderErro(res, error);
    }
};
