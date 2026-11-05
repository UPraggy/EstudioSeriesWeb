// GET /Midia?serie=<id>&caminho=<relativo à pasta da série>  — serve imagem/vídeo/áudio da série com suporte a Range
// (o <video> do navegador precisa de Range para avançar/voltar). Recusa qualquer caminho fora da pasta da série.
const fs = require('fs');
const path = require('path');

const TIPOS = {
    '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
    '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.json': 'application/json',
    '.srt': 'text/plain; charset=utf-8', '.ass': 'text/plain; charset=utf-8',
};

function raizDados() {
    return process.env.ESTUDIO_DADOS || 'E:\\EstudioSeriesDados';
}

exports.resolver = (serie, caminho) => {
    if (!serie || !/^[a-z0-9-]+$/.test(serie)) throw Object.assign(new Error('Série inválida.'), { status: 400 });
    if (!caminho) throw Object.assign(new Error('Informe o caminho.'), { status: 400 });
    const base = path.resolve(raizDados(), 'series', serie);
    const alvo = path.resolve(base, String(caminho));
    if (alvo !== base && !alvo.startsWith(base + path.sep)) throw Object.assign(new Error('Caminho fora da série.'), { status: 400 });
    return alvo;
};

exports.REST = async (req, res) => {
    try {
        const alvo = exports.resolver(req.query.serie, req.query.caminho);
        if (!fs.existsSync(alvo) || !fs.statSync(alvo).isFile()) return res.status(404).json({ Error: 'Arquivo não encontrado.' });
        const tamanho = fs.statSync(alvo).size;
        const tipo = TIPOS[path.extname(alvo).toLowerCase()] || 'application/octet-stream';
        res.setHeader('Content-Type', tipo);
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
        res.status(error.status || 500).json({ Error: error.message });
    }
};
