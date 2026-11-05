// Controllers da Mesa pela HTTP (Express de verdade, porta livre): { Error } em falha, 400/404/409, fluxo básico.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), 'estudio-mesa-http-'));
process.env.ESTUDIO_DADOS = DADOS;
process.env.ESTUDIO_SIMULADO = '1';

const express = require('express');
const rotas = require('../src/edicao/rotas');

let servidor;
let base;
test.before(async () => {
    const app = express();
    app.use(express.json({ limit: '20mb' }));
    rotas.registrar(app);
    await new Promise((r) => { servidor = app.listen(0, '127.0.0.1', r); });
    base = `http://127.0.0.1:${servidor.address().port}`;
    const pasta = path.join(DADOS, 'series', 'farol-http');
    fs.mkdirSync(path.join(pasta, 'episodios', 'ep01'), { recursive: true });
    fs.writeFileSync(path.join(pasta, 'serie.json'), JSON.stringify({ versao: 1, id: 'farol-http', titulo: 'Farol HTTP', modelos: { videoFinal: 'google/veo-3.1-lite' } }));
    fs.writeFileSync(path.join(pasta, 'episodios', 'ep01', 'roteiro.json'), JSON.stringify({
        versao: 1, n: 1, titulo: 'T', duracaoAlvoS: 8,
        planos: [{ n: 1, deS: 0, ateS: 4, tipo: 'video_ia', local: 'farol', elenco: [], falas: [] }, { n: 2, deS: 4, ateS: 8, tipo: 'video_ia', local: 'farol', elenco: [], tela: 'CARTÕES A / B', falas: [] }],
        escolhas: { A: { texto: 'A1' }, B: { texto: 'B1' } },
    }));
});
test.after(() => { servidor.close(); fs.rmSync(DADOS, { recursive: true, force: true }); });

const get = async (rota, q) => { const r = await fetch(`${base}/${rota}?${new URLSearchParams(q)}`); return { status: r.status, corpo: await r.json() }; };
const post = async (rota, corpo) => { const r = await fetch(`${base}/${rota}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) }); return { status: r.status, corpo: await r.json() }; };

test('todas as rotas da Mesa estão registradas (GET e POST)', () => {
    for (const n of ['LerEdicao', 'SalvarEdicao', 'DesfazerEdicao', 'RefazerEdicao', 'EdicaoInicial', 'ExtrairQuadro', 'CotarTrecho', 'RegerarTrecho', 'RegerarFala', 'RegerarLegenda', 'RenderizarEpisodio']) assert.ok(rotas.post[n], n);
    for (const n of ['LerEdicao', 'MiniaturasClipe', 'OndaAudio', 'StatusRegeracao', 'StatusRender']) assert.ok(rotas.get[n], n);
    for (const c of [...Object.values(rotas.post), ...Object.values(rotas.get)]) assert.strictEqual(typeof c.REST, 'function');
});

test('falta de parâmetro e série inválida voltam { Error } com 400', async () => {
    const a = await get('LerEdicao', {});
    assert.strictEqual(a.status, 400);
    assert.match(a.corpo.Error, /Informe serie, ep/);
    const b = await get('LerEdicao', { serie: '../fora', ep: 1 });
    assert.strictEqual(b.status, 400);
    assert.ok(b.corpo.Error);
    const c = await post('RegerarTrecho', { serie: 'farol-http', ep: 1 });
    assert.strictEqual(c.status, 400);
});

test('fluxo HTTP: ler vazio → edição inicial (estimada) → salvar → conflito 409 → desfazer', async () => {
    const vazio = await get('LerEdicao', { serie: 'farol-http', ep: 1 });
    assert.strictEqual(vazio.status, 200);
    assert.strictEqual(vazio.corpo.edicao, null);
    assert.strictEqual(vazio.corpo.episodio.temRoteiro, true);
    const ini = await post('EdicaoInicial', { serie: 'farol-http', ep: 1 });
    assert.strictEqual(ini.status, 200, JSON.stringify(ini.corpo));
    assert.strictEqual(ini.corpo.edicao.faixas.ab[0].A.texto, 'A1');
    const dup = await post('EdicaoInicial', { serie: 'farol-http', ep: 1 });
    assert.strictEqual(dup.status, 409);
    const ed = ini.corpo.edicao;
    ed.faixas.ab[0].A.texto = 'MUDOU';
    const s = await post('SalvarEdicao', { serie: 'farol-http', ep: 1, edicao: ed, revisaoBase: ed.revisao });
    assert.strictEqual(s.status, 200);
    const conflito = await post('SalvarEdicao', { serie: 'farol-http', ep: 1, edicao: ed, revisaoBase: ed.revisao });
    assert.strictEqual(conflito.status, 409);
    assert.match(conflito.corpo.Error, /mudou no servidor/);
    const d = await post('DesfazerEdicao', { serie: 'farol-http', ep: 1 });
    assert.strictEqual(d.corpo.edicao.faixas.ab[0].A.texto, 'A1');
    const st = await get('StatusRender', { serie: 'farol-http', ep: 1 });
    assert.strictEqual(st.corpo.status, 'nenhum');
    const reg = await get('StatusRegeracao', { serie: 'farol-http', ep: 1 });
    assert.deepStrictEqual(reg.corpo.regeracoes, []);
});
