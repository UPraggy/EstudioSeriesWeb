// Referências a arquivos nos pedidos: arquivo local vira { arquivo, sha1 } no hash do pedido
// (trocar a imagem muda o pedido) e data URL na hora de enviar.
const path = require('path');
const crypto = require('crypto');
const { ErroValidacao } = require('./erros');
const util = require('./util');

function relativoOuAbsoluto(base, abs) {
    const rel = path.relative(base, abs);
    return rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? rel.split(path.sep).join('/') : abs;
}

async function referenciaParaHash(valor, base) {
    if (!valor) return null;
    if (util.ehUrl(valor)) return { url: valor };
    if (/^data:/i.test(valor)) return { dataSha1: crypto.createHash('sha1').update(valor).digest('hex') };
    const abs = path.resolve(base, String(valor));
    let sha1;
    try {
        sha1 = await util.sha1Arquivo(abs);
    } catch {
        throw new ErroValidacao(`Arquivo não encontrado: ${valor}`);
    }
    return { arquivo: relativoOuAbsoluto(base, abs), sha1 };
}

async function urlParaEnvio(valor, base) {
    if (util.ehUrl(valor) || /^data:/i.test(valor)) return valor;
    return util.dataUrlDeArquivo(path.resolve(base, String(valor)));
}

const itemImagem = (url) => ({ type: 'image_url', image_url: { url } });

module.exports = { relativoOuAbsoluto, referenciaParaHash, urlParaEnvio, itemImagem };
