// Jobs: pedidoHash nunca abre 2 jobs, retomada depois de reiniciar, envio interrompido = incerto,
// espera crescente, download e custo real no livro.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { criarJobs } = require('../src/openrouter/jobs');
const { ErroJob } = require('../src/openrouter/erros');
const aj = require('./fixtures/openrouter-ajuda');

// Cliente falso de jobs (estado por jobId).
function clienteFalso(estados = {}) {
    const chamadas = [];
    return {
        simulado: false,
        chamadas,
        estados,
        async pedirJson(metodo, rota) {
            chamadas.push(`${metodo} ${rota}`);
            const id = decodeURIComponent(rota.split('/').pop());
            const seq = estados[id];
            const r = Array.isArray(seq) ? (seq.length > 1 ? seq.shift() : seq[0]) : seq;
            if (!r) throw new Error(`sem estado para ${id}`);
            return { id, ...r };
        },
        async baixar(alvo, destino) {
            chamadas.push(`BAIXAR ${alvo}`);
            fs.mkdirSync(path.dirname(destino), { recursive: true });
            fs.writeFileSync(destino, 'video');
            return { bytes: 5, destino };
        },
    };
}

const info = (h, extra = {}) => ({ pedidoHash: h, tipo: 'video', modelo: 'google/veo-3.1-lite', destino: `episodios/ep01/takes/p0${h.slice(-1)}/take_01.mp4`, previstoUsd: 0.24, ep: 1, ref: `p0${h.slice(-1)}/take_01`, ...extra });

test('o mesmo pedidoHash nunca abre 2 jobs (nem em paralelo)', async () => {
    const base = aj.pastaTemp('jobs-dup-');
    const jobs = criarJobs({ base, cliente: clienteFalso() });
    let posts = 0;
    const criar = async () => { posts++; await new Promise((r) => setTimeout(r, 20)); return { id: 'gen-vid-1', status: 'pending' }; };
    const [a, b] = await Promise.all([jobs.abrir(info('h1'), criar), jobs.abrir(info('h1'), criar)]);
    assert.strictEqual(posts, 1);
    assert.deepStrictEqual([a.novo, b.novo].sort(), [false, true]);
    const c = await jobs.abrir(info('h1'), criar);
    assert.strictEqual(c.novo, false);
    assert.strictEqual(c.job.jobId, 'gen-vid-1');
    assert.strictEqual(posts, 1);
    const doc = JSON.parse(fs.readFileSync(path.join(base, 'jobs.json'), 'utf8'));
    assert.strictEqual(doc.versao, 1);
    assert.strictEqual(doc.jobs.length, 1);
    assert.deepStrictEqual(Object.keys(doc.jobs[0]).slice(0, 6), ['jobId', 'tipo', 'modelo', 'pedidoHash', 'destino', 'criadoEm']);
    assert.strictEqual(doc.jobs[0].status, 'pendente');
});

test('retomada: outro processo (nova instância) consulta, baixa e registra o custo real uma vez', async () => {
    const base = aj.pastaTemp('jobs-ret-');
    const livro = aj.livroMemoria();
    const j1 = criarJobs({ base, cliente: clienteFalso(), livro, serie: 'o-ultimo-farol' });
    await j1.abrir(info('h3'), async () => ({ id: 'gen-vid-3', status: 'pending' }));

    // "reiniciou": instância nova lendo o mesmo jobs.json
    const cliente = clienteFalso({
        'gen-vid-3': { status: 'completed', unsigned_urls: ['https://openrouter.ai/api/v1/videos/gen-vid-3/content?index=0'], urls: ['https://assinada.exemplo/segredo?sig=abc'], usage: { cost: 0.23 } },
    });
    const j2 = criarJobs({ base, cliente, livro, serie: 'o-ultimo-farol' });
    const r = await j2.retomarPendentes();
    assert.strictEqual(r.consultados.length, 1);
    const job = r.consultados[0];
    assert.strictEqual(job.status, 'pronto');
    assert.strictEqual(job.custoUsd, 0.23);
    assert.ok(fs.existsSync(path.join(base, 'episodios', 'ep01', 'takes', 'p03', 'take_01.mp4')));
    assert.ok(cliente.chamadas.includes('BAIXAR https://openrouter.ai/api/v1/videos/gen-vid-3/content?index=0'));
    assert.deepStrictEqual(livro.linhas.map((l) => [l.serie, l.ep, l.tipo, l.modelo, l.previstoUsd, l.realUsd, l.jobId, l.ref]),
        [['o-ultimo-farol', 1, 'video', 'google/veo-3.1-lite', 0.24, 0.23, 'gen-vid-3', 'p03/take_01']]);
    // consultar de novo não registra 2x nem baixa de novo
    await j2.consultar('gen-vid-3');
    await j2.retomarPendentes();
    assert.strictEqual(livro.linhas.length, 1);
    const texto = fs.readFileSync(path.join(base, 'jobs.json'), 'utf8');
    assert.ok(!texto.includes('assinada.exemplo'), 'URLs assinadas nunca são gravadas');
});

test('envio interrompido (reserva órfã) vira incerto e bloqueia repetir até liberar', async () => {
    const base = aj.pastaTemp('jobs-inc-');
    fs.writeFileSync(path.join(base, 'jobs.json'), JSON.stringify({ versao: 1, jobs: [{ jobId: null, tipo: 'video', modelo: 'm', pedidoHash: 'h4', destino: 'x.mp4', criadoEm: '2026-11-04T12:00:00Z', status: 'enviando', previstoUsd: 0.24 }] }));
    const jobs = criarJobs({ base, cliente: clienteFalso() });
    const r = await jobs.retomarPendentes();
    assert.strictEqual(r.incertos.length, 1);
    assert.strictEqual(r.incertos[0].status, 'incerto');
    assert.deepStrictEqual(await jobs.comprometido({ ep: null }), { serieUsd: 0.24, episodioUsd: 0 });
    let posts = 0;
    await assert.rejects(jobs.abrir(info('h4'), async () => { posts++; return { id: 'x' }; }), (e) => e instanceof ErroJob && /openrouter\.ai\/activity/.test(e.message));
    assert.strictEqual(posts, 0);
    await jobs.liberarIncerto('h4');
    const ok = await jobs.abrir(info('h4'), async () => { posts++; return { id: 'gen-vid-4', status: 'pending' }; });
    assert.strictEqual(ok.novo, true);
    assert.strictEqual(posts, 1);
    assert.strictEqual(ok.job.historico.length, 1);
});

test('timeout no POST marca incerto; erro definitivo (400) marca falhou e permite tentar de novo', async () => {
    const base = aj.pastaTemp('jobs-err-');
    const jobs = criarJobs({ base, cliente: clienteFalso() });
    await assert.rejects(jobs.abrir(info('h5'), async () => { throw Object.assign(new Error('O OpenRouter não respondeu'), { incerto: true }); }));
    assert.strictEqual((await jobs.acharPorHash('h5')).status, 'incerto');
    await assert.rejects(jobs.abrir(info('h6'), async () => { throw Object.assign(new Error('recusou (400)'), { status: 400 }); }), /400/);
    assert.strictEqual((await jobs.acharPorHash('h6')).status, 'falhou');
    const de_novo = await jobs.abrir(info('h6'), async () => ({ id: 'gen-vid-6', status: 'pending' }));
    assert.strictEqual(de_novo.novo, true);
});

test('job que falha no provedor não entra no livro (falha não é cobrada)', async () => {
    const base = aj.pastaTemp('jobs-fal-');
    const livro = aj.livroMemoria();
    const cliente = clienteFalso({ 'gen-vid-7': { status: 'failed', error: 'moderação', usage: { cost: 0 } } });
    const jobs = criarJobs({ base, cliente, livro });
    await jobs.abrir(info('h7'), async () => ({ id: 'gen-vid-7', status: 'pending' }));
    const j = await jobs.consultar('gen-vid-7');
    assert.strictEqual(j.status, 'falhou');
    assert.strictEqual(j.erro, 'moderação');
    assert.strictEqual(livro.linhas.length, 0);
});

test('acompanhar consulta com espera crescente (5 s, 7,5 s, 11,25 s...) até concluir', async () => {
    const base = aj.pastaTemp('jobs-esp-');
    const esperas = [];
    let relogio = 0;
    const cliente = clienteFalso({
        'gen-vid-8': [{ status: 'pending' }, { status: 'in_progress' }, { status: 'in_progress' }, { status: 'completed', usage: { cost: 0.24 } }],
    });
    const jobs = criarJobs({ base, cliente, livro: aj.livroMemoria(), dormir: async (ms) => { esperas.push(ms); relogio += ms; }, relogio: () => relogio });
    await jobs.abrir(info('h8'), async () => ({ id: 'gen-vid-8', status: 'pending' }));
    const vistos = [];
    const j = await jobs.acompanhar('gen-vid-8', { aoAtualizar: (x) => vistos.push(x.statusApi) });
    assert.strictEqual(j.status, 'pronto');
    assert.deepStrictEqual(esperas, [5000, 7500, 11250]);
    assert.deepStrictEqual(vistos, ['pending', 'in_progress', 'in_progress', 'completed']);
    // sem a URL da API em unsigned_urls, baixa pelo endpoint de conteúdo
    assert.ok(cliente.chamadas.includes('BAIXAR /videos/gen-vid-8/content?index=0'));
});

test('acompanhar respeita o limite e devolve o job ainda pendente (dá para retomar depois)', async () => {
    const base = aj.pastaTemp('jobs-lim-');
    let relogio = 0;
    const jobs = criarJobs({ base, cliente: clienteFalso({ 'gen-vid-9': { status: 'pending' } }), dormir: async (ms) => { relogio += ms; }, relogio: () => relogio });
    await jobs.abrir(info('h9'), async () => ({ id: 'gen-vid-9', status: 'pending' }));
    const j = await jobs.acompanhar('gen-vid-9', { limiteMs: 20000 });
    assert.strictEqual(j.status, 'pendente');
    assert.ok(relogio <= 20000);
});

test('download que falha mantém pendente e tenta de novo na próxima consulta', async () => {
    const base = aj.pastaTemp('jobs-dl-');
    const cliente = clienteFalso({ 'gen-vid-10': { status: 'completed', usage: { cost: 0.4 } } });
    const baixarOk = cliente.baixar;
    let falhas = 1;
    cliente.baixar = async (...a) => { if (falhas-- > 0) throw new Error('conexão caiu'); return baixarOk(...a); };
    const livro = aj.livroMemoria();
    const jobs = criarJobs({ base, cliente, livro });
    await jobs.abrir(info('h0'), async () => ({ id: 'gen-vid-10', status: 'pending' }));
    const j1 = await jobs.consultar('gen-vid-10');
    assert.strictEqual(j1.status, 'pendente');
    assert.match(j1.erroDownload, /conexão caiu/);
    const j2 = await jobs.consultar('gen-vid-10');
    assert.strictEqual(j2.status, 'pronto');
    assert.strictEqual(j2.erroDownload, undefined);
    assert.strictEqual(livro.linhas.length, 1);
});
