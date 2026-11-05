// GET /MidiaSimples?id=<geração>&caminho=<relativo à pasta da geração> — serve o resultado/anexo de uma geração simples
// (<ESTUDIO_DADOS>/geracao-simples/<id>/...) com suporte a Range, como o /Midia faz para as séries.
// Recusa id fora do formato e qualquer caminho que saia da pasta da geração.
const fs = require('fs');
const path = require('path');
const armazem = require('../series/armazem');

const RE_ID = /^\d{4}-\d{2}-\d{2}-\d{4}-[0-9a-f]{4}$/;
const TIPOS = {
    '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
    '.txt': 'text/plain; charset=utf-8', '.json': 'application/json',
};

function resolver(id, caminho) {
    if (!RE_ID.test(String(id || ''))) throw Object.assign(new Error('Geração inválida.'), { status: 400 });
    if (!caminho) throw Object.assign(new Error('Informe o caminho.'), { status: 400 });
    const base = path.resolve(armazem.raizDados(), 'geracao-simples', String(id));
    const alvo = path.resolve(base, String(caminho));
    if (!alvo.startsWith(base + path.sep)) throw Object.assign(new Error('Caminho fora da geração.'), { status: 400 });
    return alvo;
}

exports.resolver = resolver;

exports.REST = async (req, res) => {
    try {
        const alvo = resolver(req.query.id, req.query.caminho);
        if (!fs.existsSync(alvo) || !fs.statSync(alvo).isFile()) return res.status(404).json({ Error: 'Arquivo não encontrado.' });
        const tamanho = fs.statSync(alvo).size;
        res.setHeader('Content-Type', TIPOS[path.extname(alvo).toLowerCase()] || 'application/octet-stream');
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'no-cache');
        const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
        if (m) {
            const ini = m[1] === '' ? Math.max(0, tamanho - Number(m[2])) : Number(m[1]);
            const fim = m[1] !== '' && m[2] !== '' ? Math.min(Number(m[2]), tamanho - 1) : tamanho - 1;
            if (ini >= tamanho || ini > fim) {
                res.setHeader('Content-Range', `bytes */${tamanho}`);
                return res.status(416).end();
            }
            res.status(206);
            res.setHeader('Content-Range', `bytes ${ini}-${fim}/${tamanho}`);
            res.setHeader('Content-Length', fim - ini + 1);
            return fs.createReadStream(alvo, { start: ini, end: fim }).pipe(res);
        }
        res.setHeader('Content-Length', tamanho);
        return fs.createReadStream(alvo).pipe(res);
    } catch (error) {
        console.error('Error:', error.message);
        return res.status(error.status || 500).json({ Error: error.message });
    }
};
