// `require('stream')` do backend no navegador: só o que o cliente do OpenRouter usa para baixar o vídeo
// (`Readable.fromWeb(resposta.body)` → o próprio ReadableStream do fetch; quem consome é o pipeline de stream-promises).
class Readable {
    static fromWeb(fluxoWeb) { return fluxoWeb; }
}
class Writable {}
class PassThrough {}
module.exports = { Readable, Writable, PassThrough };
