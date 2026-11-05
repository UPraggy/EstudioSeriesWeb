const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

test('Midia serve com Range e recusa caminho fora da série', async () => {
    const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'midia-'));
    const pasta = path.join(raiz, 'series', 'teste');
    fs.mkdirSync(pasta, { recursive: true });
    fs.writeFileSync(path.join(pasta, 'a.json'), '0123456789');
    const antes = process.env.ESTUDIO_DADOS;
    process.env.ESTUDIO_DADOS = raiz;
    const app = require('../src/index');
    const servidor = app.listen(0, '127.0.0.1');
    await new Promise((r) => servidor.once('listening', r));
    try {
        const base = `http://127.0.0.1:${servidor.address().port}/api/Midia`;
        const r1 = await fetch(`${base}?serie=teste&caminho=a.json`, { headers: { Range: 'bytes=2-5' } });
        assert.strictEqual(r1.status, 206);
        assert.strictEqual(await r1.text(), '2345');
        const r2 = await fetch(`${base}?serie=teste&caminho=..%2F..%2Fsegredo.txt`);
        assert.strictEqual(r2.status, 400);
        const r3 = await fetch(`${base}?serie=..&caminho=a.json`);
        assert.strictEqual(r3.status, 400);
    } finally {
        servidor.close();
        if (antes === undefined) delete process.env.ESTUDIO_DADOS; else process.env.ESTUDIO_DADOS = antes;
    }
});
