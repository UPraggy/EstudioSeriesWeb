// Controllers novos da interface: SalvarBiblia, ListarCustos, ListarGeracoesSimples, MidiaSimples.
// Montados num Express próprio (o registro em routes.js é feito à parte).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const express = require('express');
const { pastaTemporaria, apagar } = require('./series-ajuda');

function montarApp() {
    const app = express();
    app.use(express.json());
    app.post('/SalvarBiblia', require('../src/controllers/SalvarBiblia').REST);
    app.get('/ListarCustos', require('../src/controllers/ListarCustos').REST);
    app.get('/ListarGeracoesSimples', require('../src/controllers/ListarGeracoesSimples').REST);
    app.get('/MidiaSimples', require('../src/controllers/MidiaSimples').REST);
    return app;
}

async function comServidor(raiz, fn) {
    const antes = process.env.ESTUDIO_DADOS;
    process.env.ESTUDIO_DADOS = raiz;
    const servidor = montarApp().listen(0, '127.0.0.1');
    await new Promise((r) => servidor.once('listening', r));
    try {
        await fn(`http://127.0.0.1:${servidor.address().port}`);
    } finally {
        servidor.close();
        if (antes === undefined) delete process.env.ESTUDIO_DADOS; else process.env.ESTUDIO_DADOS = antes;
    }
}

const postar = (url, corpo) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });

test('SalvarBiblia grava só os campos editáveis e preserva escolhas/votos', async () => {
    const raiz = pastaTemporaria();
    try {
        const armazem = require('../src/series/armazem');
        await armazem.criarSerie({ titulo: 'Teste Bíblia' }, { raiz });
        await armazem.atualizarBiblia('teste-biblia', (b) => {
            b.escolhas = [{ ep: 1, A: 'X', B: 'Y', vencedora: 'A', votos: { A: 3, B: 1 } }];
            return b;
        }, { raiz });
        await comServidor(raiz, async (base) => {
            const r = await postar(`${base}/SalvarBiblia`, { serie: 'teste-biblia', campos: { premissa: 'Nova premissa', regras: ['Uma regra'], misterios: ['?'] } });
            assert.strictEqual(r.status, 200);
            const { biblia } = await r.json();
            assert.strictEqual(biblia.premissa, 'Nova premissa');
            assert.deepStrictEqual(biblia.regras, ['Uma regra']);
            assert.strictEqual(biblia.escolhas[0].vencedora, 'A');
            assert.deepStrictEqual(biblia.escolhas[0].votos, { A: 3, B: 1 });

            const recusa = await postar(`${base}/SalvarBiblia`, { serie: 'teste-biblia', campos: { escolhas: [] } });
            assert.strictEqual(recusa.status, 400);
            assert.match((await recusa.json()).Error, /escolhas/);

            const invalida = await postar(`${base}/SalvarBiblia`, { serie: 'teste-biblia', campos: { regras: 'não é lista' } });
            assert.strictEqual(invalida.status, 400);

            const semSerie = await postar(`${base}/SalvarBiblia`, { serie: 'nao-existe', campos: { premissa: 'x' } });
            assert.strictEqual(semSerie.status, 404);
        });
        const gravada = JSON.parse(fs.readFileSync(path.join(raiz, 'series', 'teste-biblia', 'biblia.json'), 'utf8'));
        assert.strictEqual(gravada.premissa, 'Nova premissa');
    } finally {
        apagar(raiz);
    }
});

test('ListarCustos lê o livro da série e da geração simples, com totais', async () => {
    const raiz = pastaTemporaria();
    try {
        const armazem = require('../src/series/armazem');
        await armazem.criarSerie({ titulo: 'Teste Custos' }, { raiz });
        const linhas = [
            { em: '2026-11-04T12:00:00Z', serie: 'teste-custos', ep: 1, etapa: 'geracao', tipo: 'video', modelo: 'm', previstoUsd: 0.24, realUsd: 0.2 },
            { em: '2026-11-04T13:00:00Z', serie: 'teste-custos', ep: 1, etapa: 'elenco', tipo: 'imagem', modelo: 'i', previstoUsd: 0.04 },
        ];
        fs.writeFileSync(path.join(raiz, 'series', 'teste-custos', 'custos.jsonl'), `${linhas.map((l) => JSON.stringify(l)).join('\n')}\nlixo\n`);
        fs.mkdirSync(path.join(raiz, 'geracao-simples'), { recursive: true });
        fs.writeFileSync(path.join(raiz, 'geracao-simples', 'custos.jsonl'), `${JSON.stringify({ etapa: 'geracao-simples', realUsd: 0.5 })}\n`);
        await comServidor(raiz, async (base) => {
            const r = await (await fetch(`${base}/ListarCustos?serie=teste-custos`)).json();
            assert.strictEqual(r.quantidade, 2);
            assert.strictEqual(r.totalUsd, 0.24);
            assert.strictEqual(r.linhas[0].etapa, 'elenco'); // mais recente primeiro
            assert.deepStrictEqual(r.porEtapa, { geracao: 0.2, elenco: 0.04 });
            assert.deepStrictEqual(r.porEp, { 1: 0.24 });
            const s = await (await fetch(`${base}/ListarCustos`)).json();
            assert.strictEqual(s.origem, 'geracao-simples');
            assert.strictEqual(s.totalUsd, 0.5);
            const fora = await fetch(`${base}/ListarCustos?serie=..`);
            assert.strictEqual(fora.status, 400);
        });
    } finally {
        apagar(raiz);
    }
});

test('ListarGeracoesSimples e MidiaSimples: lista mais recente primeiro e serve com Range', async () => {
    const raiz = pastaTemporaria();
    try {
        const pasta = (id) => path.join(raiz, 'geracao-simples', id);
        for (const id of ['2026-11-04-1200-aaaa', '2026-11-04-1300-bbbb']) {
            fs.mkdirSync(pasta(id), { recursive: true });
            fs.writeFileSync(path.join(pasta(id), 'pedido.json'), JSON.stringify({ versao: 1, id, texto: `pedido ${id}`, modelo: 'm', resultado: null }));
        }
        fs.mkdirSync(path.join(raiz, 'geracao-simples', 'nao-e-geracao'), { recursive: true });
        fs.writeFileSync(path.join(pasta('2026-11-04-1300-bbbb'), 'resultado.mp4'), '0123456789');
        await comServidor(raiz, async (base) => {
            const r = await (await fetch(`${base}/ListarGeracoesSimples`)).json();
            assert.deepStrictEqual(r.geracoes.map((g) => g.id), ['2026-11-04-1300-bbbb', '2026-11-04-1200-aaaa']);
            const parte = await fetch(`${base}/MidiaSimples?id=2026-11-04-1300-bbbb&caminho=resultado.mp4`, { headers: { Range: 'bytes=2-5' } });
            assert.strictEqual(parte.status, 206);
            assert.strictEqual(await parte.text(), '2345');
            const fora = await fetch(`${base}/MidiaSimples?id=2026-11-04-1300-bbbb&caminho=..%2F2026-11-04-1200-aaaa%2Fpedido.json`);
            assert.strictEqual(fora.status, 400);
            const idRuim = await fetch(`${base}/MidiaSimples?id=..&caminho=x`);
            assert.strictEqual(idRuim.status, 400);
            const falta = await fetch(`${base}/MidiaSimples?id=2026-11-04-1200-aaaa&caminho=resultado.mp4`);
            assert.strictEqual(falta.status, 404);
        });
        // Sem a pasta geracao-simples: lista vazia.
        const vazia = pastaTemporaria();
        try {
            await comServidor(vazia, async (base) => {
                assert.deepStrictEqual((await (await fetch(`${base}/ListarGeracoesSimples`)).json()).geracoes, []);
            });
        } finally {
            apagar(vazia);
        }
    } finally {
        apagar(raiz);
    }
});
