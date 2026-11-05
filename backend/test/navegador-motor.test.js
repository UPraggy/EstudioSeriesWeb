// Ponta a ponta do MOTOR DO NAVEGADOR: empacota o backend com o esbuild (o mesmo pacote que o site usa) e roda as rotas
// no Node com o armazém em memória. Nada de rede: modo simulado e, na parte "real", um fetch falso.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const aj = require('./fixtures/openrouter-ajuda');

const FRONT = path.join(__dirname, '..', '..', 'frontend');
const temEsbuild = fs.existsSync(path.join(FRONT, 'node_modules', 'esbuild'));

let motor;
let armazem;
let pastaTmp;
const fetchOriginal = globalThis.fetch;

async function chamar(metodo, rota, dados = {}) {
    const r = await motor.chamar(metodo, rota, metodo === 'GET' ? { query: dados } : { body: dados });
    return { status: r.status, json: r.corpo };
}
const post = (rota, corpo) => chamar('POST', rota, corpo);
const get = (rota, query) => chamar('GET', rota, query);
const noArmazem = (c) => armazem.arquivos.get(c);

test.before(async () => {
    if (!temEsbuild) return;
    const { empacotar } = await import(pathToFileURL(path.join(FRONT, 'vite-plugin-motor.js')).href);
    const { codigo } = await empacotar();
    pastaTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'estudio-motor-'));
    const arq = path.join(pastaTmp, 'motor.mjs');
    fs.writeFileSync(arq, codigo);
    motor = await import(pathToFileURL(arq).href);
    const { armazemMemoria } = await import(pathToFileURL(path.join(FRONT, 'src', 'motorNavegador', 'armazens.js')).href);
    armazem = armazemMemoria();
    globalThis.fetch = async () => { throw new Error('rede proibida neste teste'); };
    await motor.iniciar({ armazem });
});

test.after(() => {
    globalThis.fetch = fetchOriginal;
    if (pastaTmp) fs.rmSync(pastaTmp, { recursive: true, force: true });
});

test('o pacote do navegador não usa o process nem o ambiente da máquina', { skip: !temEsbuild }, async () => {
    const s = motor.situacao();
    assert.equal(s.temChave, false);
    const saude = await get('Saude');
    assert.equal(saude.json.dados, '/dados');
    assert.equal(saude.json.chaveOpenRouter, false);
});

test('séries: criar, listar, ler, ficha, episódio (tudo gravado no armazém)', { skip: !temEsbuild }, async () => {
    let r = await get('ListarSeries');
    assert.deepEqual(r.json, { series: [] });
    r = await post('CriarSerie', { titulo: 'O Último Farol', genero: 'Sobrevivência', ideia: 'Uma ilhota.' });
    assert.equal(r.status, 200, r.json && r.json.Error);
    assert.equal(r.json.serie.id, 'o-ultimo-farol');
    assert.ok(noArmazem('series/o-ultimo-farol/serie.json'), 'serie.json no armazém');
    r = await post('CriarSerie', { titulo: 'O ultimo farol' });
    assert.equal(r.status, 409);
    r = await get('ListarSeries');
    assert.equal(r.json.series.length, 1);
    r = await get('LerSerie', { serie: 'o-ultimo-farol' });
    assert.equal(r.status, 200, r.json && r.json.Error);
    assert.equal(r.json.serie.titulo, 'O Último Farol');
    assert.equal(r.json.custos.gastoUsd, 0);
});

test('modo simulado: catálogo, saldo e geração simples de imagem com token de uso único', { skip: !temEsbuild }, async () => {
    const c = await get('CatalogoVideo');
    assert.equal(c.status, 200, c.json && c.json.Error);
    assert.equal(c.json.simulado, true);
    assert.ok(c.json.modelos.find((m) => m.id === 'google/veo-3.1-lite'));
    const s = await get('SaldoOpenRouter');
    assert.equal(s.json.simulado, true);

    const cot = await post('CotarGeracaoSimples', { tipo: 'imagem', texto: 'Farol na ilhota, noite', modelo: 'google/gemini-3.1-flash-image', resolucao: '1K' });
    assert.equal(cot.status, 200, cot.json.Error);
    assert.ok(cot.json.token);
    const errado = await post('GerarGeracaoSimples', { id: cot.json.id, token: 'x.y' });
    assert.match(errado.json.Error, /Confirmação inválida/);
    const g = await post('GerarGeracaoSimples', { id: cot.json.id, token: cot.json.token });
    assert.equal(g.status, 200, g.json.Error);
    assert.equal(g.json.pedido.resultado.caminho, 'resultado.png');
    assert.ok(noArmazem(`geracao-simples/${cot.json.id}/resultado.png`));
    const deNovo = await post('GerarGeracaoSimples', { id: cot.json.id, token: cot.json.token });
    assert.match(deNovo.json.Error, /já foi usada/);
    const m = await motor.lerMidia('MidiaSimples', { id: cot.json.id, caminho: 'resultado.png' });
    assert.equal(m.tipo, 'image/png');
    assert.ok(m.blob.size > 100);
});

test('série: CotarGeracao → GerarVideo → RetomarJobs → StatusJob → mídia (simulado)', { skip: !temEsbuild }, async () => {
    const pedido = { modelo: 'bytedance/seedance-1-5-pro', prompt: 'mar à noite', duracaoS: 8, resolucao: '480p', destino: 'episodios/ep01/takes/p01/take_01.mp4', ep: 1, ref: 'p01/take_01' };
    motor.fsMotor.mkdirSync('/dados/series/o-ultimo-farol/episodios/ep01', { recursive: true });
    const cot = await post('CotarGeracao', { tipo: 'video', serie: 'o-ultimo-farol', pedido });
    assert.equal(cot.status, 200, cot.json.Error);
    const semToken = await post('GerarVideo', { serie: 'o-ultimo-farol', pedido });
    assert.match(semToken.json.Error, /Confirmação inválida/);
    const g = await post('GerarVideo', { serie: 'o-ultimo-farol', pedido, token: cot.json.token });
    assert.equal(g.status, 200, g.json.Error);
    const r = await post('RetomarJobs', { serie: 'o-ultimo-farol' });
    assert.equal(r.json.consultados[0].status, 'pronto');
    const st = await post('StatusJob', { serie: 'o-ultimo-farol', jobId: g.json.job.jobId });
    assert.equal(st.json.job.status, 'pronto');
    assert.ok(noArmazem('series/o-ultimo-farol/episodios/ep01/takes/p01/take_01.mp4'));
    assert.ok(noArmazem('series/o-ultimo-farol/jobs.json') || [...armazem.arquivos.keys()].some((k) => k.endsWith('jobs.json')));
    const m = await motor.lerMidia('Midia', { serie: 'o-ultimo-farol', caminho: 'episodios/ep01/takes/p01/take_01.mp4' });
    assert.equal(m.tipo, 'video/mp4');
    await assert.rejects(motor.lerMidia('Midia', { serie: 'o-ultimo-farol', caminho: '../../geracao-simples/x' }), /fora da série/);
    const custos = await get('ListarCustos', { serie: 'o-ultimo-farol' });
    assert.equal(custos.status, 200, custos.json.Error);
});

test('lixeira: apagar e restaurar a série (pasta inteira muda de lugar no armazém)', { skip: !temEsbuild }, async () => {
    const a = await post('ApagarSerie', { serie: 'o-ultimo-farol', confirmacao: 'O Último Farol' });
    assert.equal(a.status, 200, a.json.Error);
    assert.ok(![...armazem.arquivos.keys()].some((k) => k.startsWith('series/o-ultimo-farol/')));
    assert.ok([...armazem.arquivos.keys()].some((k) => k.startsWith('_lixeira/') && k.endsWith('take_01.mp4')));
    const l = await get('ListarLixeira');
    assert.equal(l.json.itens.length, 1);
    const r = await post('RestaurarDaLixeira', { item: l.json.itens[0].item });
    assert.equal(r.status, 200, r.json.Error);
    assert.ok(noArmazem('series/o-ultimo-farol/episodios/ep01/takes/p01/take_01.mp4'));
});

test('rota que depende de ffmpeg/Python responde com erro claro', { skip: !temEsbuild }, async () => {
    assert.ok(motor.ROTAS_SO_NO_PC.includes('GerarFalas'));
    const r = await get('OndaAudio', { serie: 'o-ultimo-farol', caminho: 'nao.wav' });
    assert.ok(r.json && r.json.Error);
    const nao = await post('RotaQueNaoExiste', {});
    assert.equal(nao.status, 404);
});

test('modo real com fetch falso: chave vai só no Authorization, job é gravado, vídeo é baixado e custo entra no livro', { skip: !temEsbuild }, async () => {
    const videos = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'videos-models.json'), 'utf8'));
    const bytesVideo = new Uint8Array(4096).fill(9);
    const fetchFalso = aj.criarFetchFalso(async (req) => {
        const u = new URL(req.url);
        if (u.pathname === '/api/v1/videos/models') return { json: videos };
        if (u.pathname === '/api/v1/videos' && req.metodo === 'POST') return { json: { id: 'job-navegador-1', status: 'pending' } };
        if (u.pathname === '/api/v1/videos/job-navegador-1') return { json: { id: 'job-navegador-1', status: 'completed', usage: { cost: 0.19 } } };
        if (u.pathname === '/api/v1/videos/job-navegador-1/content') return { bytes: bytesVideo, headers: { 'content-type': 'video/mp4' } };
        if (u.pathname === '/api/v1/key') return { json: { data: { limit: 10, limit_remaining: 8.5, usage: 1.5 } } };
        return { status: 404, json: { error: { message: `inesperado: ${req.metodo} ${u.pathname}` } } };
    });
    globalThis.fetch = fetchFalso;
    motor.definirChave(aj.CHAVE_TESTE);
    try {
        assert.equal(motor.situacao().temChave, true);
        const pedido = { modelo: 'bytedance/seedance-1-5-pro', prompt: 'farol aceso', duracaoS: 8, resolucao: '480p', destino: 'episodios/ep01/takes/p02/take_01.mp4', ep: 1, ref: 'p02/take_01' };
        const cot = await post('CotarGeracao', { tipo: 'video', serie: 'o-ultimo-farol', pedido });
        assert.equal(cot.status, 200, cot.json.Error);
        assert.equal(cot.json.simulado, undefined === cot.json.simulado ? undefined : false);
        const g = await post('GerarVideo', { serie: 'o-ultimo-farol', pedido, token: cot.json.token });
        assert.equal(g.status, 200, g.json.Error);
        assert.equal(g.json.job.jobId, 'job-navegador-1');
        const st = await post('StatusJob', { serie: 'o-ultimo-farol', jobId: 'job-navegador-1' });
        assert.equal(st.json.job.status, 'pronto', JSON.stringify(st.json));
        const arq = noArmazem('series/o-ultimo-farol/episodios/ep01/takes/p02/take_01.mp4');
        assert.ok(arq, 'vídeo baixado no armazém');
        assert.equal(arq.dados.length, bytesVideo.length);
        const custos = await get('ListarCustos', { serie: 'o-ultimo-farol' });
        assert.ok(JSON.stringify(custos.json).includes('0.19'), JSON.stringify(custos.json).slice(0, 400));
        const pagos = fetchFalso.chamadas.filter((c) => c.metodo === 'POST');
        assert.equal(pagos.length, 1, 'um único POST pago');
        for (const c of fetchFalso.chamadas) {
            assert.equal(c.headers.Authorization, `Bearer ${aj.CHAVE_TESTE}`);
            assert.ok(!JSON.stringify(c.corpo || {}).includes(aj.CHAVE_TESTE));
        }
        // a chave nunca aparece em nada gravado
        for (const [, v] of armazem.arquivos) assert.ok(!Buffer.from(v.dados).toString('latin1').includes(aj.CHAVE_TESTE));
    } finally {
        motor.definirChave(null);
        globalThis.fetch = async () => { throw new Error('rede proibida neste teste'); };
    }
});
