// `require('stream/promises')` do backend no navegador: pipeline(origem, destino).
// origem: ReadableStream do fetch ou qualquer iterável assíncrono; destino: createWriteStream do sistema de arquivos virtual.
async function* pedacos(origem) {
    if (origem && typeof origem.getReader === 'function') {
        const leitor = origem.getReader();
        try {
            for (;;) {
                const { done, value } = await leitor.read();
                if (done) return;
                yield value;
            }
        } finally {
            leitor.releaseLock();
        }
    } else {
        yield* origem;
    }
}

async function pipeline(origem, ...resto) {
    const destino = resto.filter((x) => typeof x !== 'function' && !(x && x.signal)).pop();
    if (!destino || typeof destino.write !== 'function') throw new Error('pipeline: destino não suportado no navegador.');
    try {
        for await (const p of pedacos(origem)) destino.write(p);
    } catch (e) {
        if (destino.destroy) destino.destroy(e);
        throw e;
    }
    await new Promise((ok, falha) => {
        destino.once('finish', ok);
        destino.once('error', falha);
        destino.end();
    });
}

module.exports = { pipeline, finished: async () => {} };
