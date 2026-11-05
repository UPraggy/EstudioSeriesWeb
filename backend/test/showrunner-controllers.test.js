// Controllers do showrunner e da memória (montados num app de teste; LLM falso injetado; dados em pasta temporária).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');

const DOCS = path.join(__dirname, '..', '..', 'docs', 'exemplos');

function montarApp(chamarLLM) {
    const app = express();
    app.use(express.json({ limit: '10mb' }));
    app.post('/ShowrunnerEtapa', require('../src/controllers/ShowrunnerEtapa').criarREST({ chamarLLM }));
    app.post('/MemoriaContexto', require('../src/controllers/MemoriaContexto').REST);
    app.post('/MemoriaConsolidar', require('../src/controllers/MemoriaConsolidar').criarREST({ chamarLLM }));
    app.post('/MemoriaVerificar', require('../src/controllers/MemoriaVerificar').criarREST({ chamarLLM }));
    app.post('/MemoriaSemear', require('../src/controllers/MemoriaSemear').REST);
    app.get('/MemoriaLer', require('../src/controllers/MemoriaLer').REST);
    return app;
}

async function comServidor(app, fn) {
    const servidor = app.listen(0, '127.0.0.1');
    await new Promise((r) => servidor.once('listening', r));
    const base = `http://127.0.0.1:${servidor.address().port}`;
    const post = async (rota, corpo) => {
        const r = await fetch(base + rota, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
        return { status: r.status, json: await r.json() };
    };
    const get = async (rota) => {
        const r = await fetch(base + rota);
        return { status: r.status, json: await r.json() };
    };
    try { await fn({ post, get }); } finally { servidor.close(); }
}

test('ponte para o cliente OpenRouter: devolve uma função chamarLLM (sem chamar a rede)', () => {
    const { obterChamarLLM } = require('../src/showrunner/llm');
    const f = obterChamarLLM({ serie: 'o-ultimo-farol', ep: 1, etapa: 'teste' });
    assert.ok(f === null || typeof f === 'function');
});

test('controllers: contexto, verificação, consolidação em duas fases, leitura e etapa com LLM falso', async () => {
    const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'estudio-dados-'));
    const anterior = process.env.ESTUDIO_DADOS;
    process.env.ESTUDIO_DADOS = dados;
    const pasta = path.join(dados, 'series', 'o-ultimo-farol');
    fs.cpSync(path.join(DOCS, 'o-ultimo-farol'), pasta, { recursive: true });
    const roteiro = { ...JSON.parse(fs.readFileSync(path.join(DOCS, 'farol-ep01-roteiro.json'), 'utf8')), aprovado: true };
    fs.mkdirSync(path.join(pasta, 'episodios', 'ep01'), { recursive: true });
    fs.writeFileSync(path.join(pasta, 'episodios', 'ep01', 'roteiro.json'), JSON.stringify(roteiro));
    fs.writeFileSync(path.join(pasta, 'episodios', 'ep01', 'votacao.json'), JSON.stringify({ versao: 1, ep: 1, votos: { A: 3, B: 1 }, vencedora: 'A', fonte: 'manual' }));
    const chamadas = [];
    const chamarLLM = async (mensagens, op) => { chamadas.push(op); return { conteudo: JSON.stringify(roteiro), custoUsd: 0.0005 }; };
    try {
        await comServidor(montarApp(chamarLLM), async ({ post, get }) => {
            const ctx = await post('/MemoriaContexto', { serieId: 'o-ultimo-farol', finalidade: 'quadroChave', ep: 1, plano: 3 });
            assert.strictEqual(ctx.status, 200); // sem planos.json: usa o plano do roteiro
            assert.ok(ctx.json.imagens.length > 0 && ctx.json.imagens.every((i) => i.existe === false)); // prévia sem data URL
            const sem = await post('/MemoriaContexto', { serieId: 'o-ultimo-farol', finalidade: 'quadroChave', ep: 1, plano: 9 });
            assert.strictEqual(sem.status, 500);
            assert.match(sem.json.Error, /Plano 9 não encontrado/);
            const ctx2 = await post('/MemoriaContexto', { serieId: 'o-ultimo-farol', finalidade: 'roteiro', ep: 1 });
            assert.strictEqual(ctx2.status, 200);
            assert.ok(ctx2.json.tamanho.caracteres > 0);

            const ruim = await post('/MemoriaContexto', { serieId: '../fora', finalidade: 'roteiro' });
            assert.strictEqual(ruim.status, 500);
            assert.match(ruim.json.Error, /serieId inválido/);

            const ver = await post('/MemoriaVerificar', { serieId: 'o-ultimo-farol', ep: 1 });
            assert.strictEqual(ver.json.ok, true);

            const semProposta = await post('/MemoriaConsolidar', { serieId: 'o-ultimo-farol', ep: 1, aprovar: true });
            assert.strictEqual(semProposta.status, 400); // não há proposta ainda: nada é gravado
            const prop = await post('/MemoriaConsolidar', { serieId: 'o-ultimo-farol', ep: 1 });
            assert.strictEqual(prop.json.aprovada, false);
            assert.deepStrictEqual(prop.json.estadoNovo.escolhas.map((e) => e.vencedora), ['A']);
            const lido1 = await get('/MemoriaLer?serieId=o-ultimo-farol');
            assert.strictEqual(lido1.json.estado.atualizadoAte, 'ep00');
            const ok = await post('/MemoriaConsolidar', { serieId: 'o-ultimo-farol', ep: 1, aprovar: true });
            assert.strictEqual(ok.json.aprovada, true);
            const lido2 = await get('/MemoriaLer?serieId=o-ultimo-farol&ep=2');
            assert.strictEqual(lido2.json.estado.atualizadoAte, 'ep01');
            assert.ok(lido2.json.fatosVigentes.some((f) => f.id.startsWith('ep01-')));
            assert.match(lido2.json.resumos['1'], /Sete Quilômetros/);

            const et = await post('/ShowrunnerEtapa', { etapa: 'roteiro', serieId: 'o-ultimo-farol', contexto: { ep: 2, pasta: 'C:\\outra' } });
            assert.strictEqual(et.status, 200);
            assert.strictEqual(chamadas.length >= 1, true);
            assert.strictEqual(et.json.resultado.n, 2);
            assert.ok(typeof et.json.custoUsd === 'number');

            const semEtapa = await post('/ShowrunnerEtapa', {});
            assert.strictEqual(semEtapa.status, 400);
        });
    } finally {
        if (anterior === undefined) delete process.env.ESTUDIO_DADOS; else process.env.ESTUDIO_DADOS = anterior;
        fs.rmSync(dados, { recursive: true, force: true });
    }
});
