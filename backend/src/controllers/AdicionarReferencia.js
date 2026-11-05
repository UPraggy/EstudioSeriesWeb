// POST /AdicionarReferencia — copia uma imagem para <tipo>/<id>/ref/ e registra na ficha.
// Corpo: { serie, tipo, id, estado?, vista?, candidata? } + UM de:
//   caminhoArquivo: "C:\\...\\foto.png"          (arquivo local; só PNG/JPEG/WEBP de verdade)
//   arquivo: { nome: "foto.png", base64: "..." }  (envio pelo navegador)
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const fichas = require('../series/fichas');
const { entrada, responderErro } = require('../series/http');

const MAX_BYTES = 25 * 1024 * 1024;

exports.REST = async (req, res) => {
    let temporario = null;
    try {
        const { serie, tipo, id, estado, vista, candidata, caminhoArquivo, arquivo } = entrada(req);
        let origem = caminhoArquivo;
        let nomeOriginal;
        if (arquivo && typeof arquivo === 'object') {
            const ext = path.extname(String(arquivo.nome || '')).toLowerCase();
            if (!fichas.EXTENSOES_IMAGEM.includes(ext)) return res.status(400).json({ Error: `Envie uma imagem ${fichas.EXTENSOES_IMAGEM.join(', ')}.` });
            const conteudo = Buffer.from(String(arquivo.base64 || '').replace(/^data:[^,]*,/, ''), 'base64');
            if (!conteudo.length) return res.status(400).json({ Error: 'Arquivo vazio.' });
            if (conteudo.length > MAX_BYTES) return res.status(400).json({ Error: 'Imagem maior que 25 MB.' });
            temporario = path.join(os.tmpdir(), `estudio-ref-${crypto.randomBytes(6).toString('hex')}${ext}`);
            await fsp.writeFile(temporario, conteudo);
            origem = temporario;
            nomeOriginal = path.basename(String(arquivo.nome));
        } else if (typeof caminhoArquivo !== 'string' || !path.isAbsolute(caminhoArquivo)) {
            return res.status(400).json({ Error: 'Informe "caminhoArquivo" (caminho absoluto) ou "arquivo" { nome, base64 }.' });
        }
        const r = await fichas.adicionarReferencia(serie, tipo, id, origem, {
            estado,
            vista,
            candidata: candidata === true || candidata === 'true',
            nomeOriginal,
        });
        return res.json(r);
    } catch (error) {
        return responderErro(res, error);
    } finally {
        if (temporario) await fsp.rm(temporario, { force: true }).catch(() => {});
    }
};
