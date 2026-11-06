// Registro (log): formato JSONL, redação de segredos, filtros/paginação, resumo, retenção, middleware HTTP e rotas.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const PASTA = fs.mkdtempSync(path.join(os.tmpdir(), 'estudio-registro-'));
process.env.ESTUDIO_LOGS = PASTA;
const CHAVE_FALSA = 'sk-or-v1-chavefalsa1234567890abcdef';
process.env.ASE_OPENROUTER_KEY = CHAVE_FALSA;

const R = require('../src/log/registro');
const { lerRegistro, resumirRegistro } = require('../src/log/leitor');
const { criarMiddleware, nomeDaRota } = require('../src/log/http');

function limparPasta() {
    for (const n of fs.readdirSync(PASTA)) fs.rmSync(path.join(PASTA, n), { force: true, recursive: true });
}
function linhasDe(dia) {
    const arq = path.join(PASTA, `registro-${dia}.jsonl`);
    return fs.readFileSync(arq, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
}
function gravarLinhas(dia, linhas) {
    fs.writeFileSync(path.join(PASTA, `registro-${dia}.jsonl`), `${linhas.map((l) => JSON.stringify(l)).join('\n')}\n`);
}

test.after(() => {
    delete process.env.ASE_OPENROUTER_KEY;
    fs.rmSync(PASTA, { recursive: true, force: true });
});

test('grava uma linha JSON por evento no arquivo do dia, com os campos do contrato', () => {
    limparPasta();
    const l = R.registrar({ nivel: 'aviso', area: 'render', evento: 'concluido', serie: 'o-ultimo-farol', ep: 'ep03', ms: 1234.6, custoUsd: 0.1234567, msg: 'Montado', dados: { tamanhoMb: 7.8 } });
    assert.ok(l);
    const [lida] = linhasDe(R.diaDe());
    assert.deepStrictEqual(Object.keys(lida), ['em', 'nivel', 'area', 'evento', 'serie', 'ep', 'ms', 'custoUsd', 'msg', 'dados']);
    assert.match(lida.em, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    assert.strictEqual(lida.nivel, 'aviso');
    assert.strictEqual(lida.area, 'render');
    assert.strictEqual(lida.ep, 3);
    assert.strictEqual(lida.ms, 1235);
    assert.strictEqual(lida.custoUsd, 0.123457);
    assert.deepStrictEqual(lida.dados, { tamanhoMb: 7.8 });
});

test('nível e área desconhecidos caem no padrão; campos vazios não aparecem', () => {
    const l = R.montarLinha({ nivel: 'debug', area: 'qualquer', evento: 'x', serie: '', ep: null });
    assert.strictEqual(l.nivel, 'info');
    assert.strictEqual(l.area, 'sistema');
    assert.ok(!('serie' in l) && !('ep' in l) && !('ms' in l) && !('custoUsd' in l) && !('dados' in l));
});

test('nunca grava a chave, Bearer, tokens, Authorization nem base64/mídia', () => {
    limparPasta();
    const base64 = Buffer.alloc(3000, 7).toString('base64');
    const tokenConfirmacao = `${Buffer.from(JSON.stringify({ h: 'a'.repeat(64), c: 0.2, e: 1, n: 'abc' })).toString('base64url')}.${'Z'.repeat(43)}`;
    R.registrar({
        nivel: 'erro', area: 'openrouter', evento: 'erro-api',
        msg: `Falhou com ${CHAVE_FALSA} e Authorization: Bearer ${CHAVE_FALSA} e outra sk-or-v1-OUTRAchave99999`,
        dados: {
            token: tokenConfirmacao, chave: CHAVE_FALSA, headers: { Authorization: `Bearer ${CHAVE_FALSA}`, Cookie: 'sessao=1' },
            imagem: `data:image/png;base64,${base64}`, base64, audio: Buffer.alloc(5000), solto: base64,
            prompt: 'x'.repeat(5000), messages: [{ role: 'user', content: 'segredo' }],
            confirmacoes: [{ id: 'r1', token: tokenConfirmacao }], chaveOpenRouter: true,
            lista: Array.from({ length: 100 }, (_, i) => i), texto: 'y'.repeat(2000),
        },
        erro: Object.assign(new Error(`erro com ${CHAVE_FALSA}`), { status: 401 }),
    });
    const bruto = fs.readFileSync(path.join(PASTA, `registro-${R.diaDe()}.jsonl`), 'utf8');
    assert.ok(!bruto.includes(CHAVE_FALSA), 'a chave do ambiente vazou');
    assert.ok(!bruto.includes('OUTRAchave99999'), 'chave sk-or- vazou');
    assert.ok(!bruto.includes(tokenConfirmacao), 'token de confirmação vazou');
    assert.ok(!bruto.includes(base64.slice(0, 200)), 'base64 vazou');
    assert.ok(!bruto.includes('sessao=1'), 'cookie vazou');
    assert.ok(!bruto.includes('segredo'), 'mensagens do prompt vazaram');
    assert.ok(bruto.length < 7000, `linha grande demais (${bruto.length})`);
    const [l] = linhasDe(R.diaDe());
    assert.strictEqual(l.dados.token, '[oculto]');
    assert.strictEqual(l.dados.chaveOpenRouter, true, 'booleano não é segredo');
    assert.strictEqual(l.dados.confirmacoes[0].token, '[oculto]');
    assert.match(l.dados.audio, /binário, 5000 bytes/);
    assert.strictEqual(l.dados.lista.length, 21);
    assert.ok(l.dados.texto.length < 400);
    assert.strictEqual(l.dados.erro.status, 401);
});

test('registrar nunca lança, mesmo com pasta impossível', () => {
    const antes = process.env.ESTUDIO_LOGS;
    process.env.ESTUDIO_LOGS = path.join(PASTA, 'arquivo-no-lugar-da-pasta');
    fs.writeFileSync(process.env.ESTUDIO_LOGS, 'x');
    try {
        assert.doesNotThrow(() => R.registrar({ evento: 'x', dados: { a: 1 } }));
    } finally {
        process.env.ESTUDIO_LOGS = antes;
    }
});

test('medir registra o fim com ms e o erro com o evento -falhou', async () => {
    limparPasta();
    const r = await R.medir(async () => 42, { area: 'legenda', evento: 'gerar', msg: 'ok', depois: (v) => ({ dados: { valor: v } }) });
    assert.strictEqual(r, 42);
    await assert.rejects(R.medir(async () => { throw new Error('quebrou'); }, { area: 'legenda', evento: 'gerar' }), /quebrou/);
    const [a, b] = linhasDe(R.diaDe());
    assert.strictEqual(a.evento, 'gerar');
    assert.strictEqual(a.dados.valor, 42);
    assert.ok(typeof a.ms === 'number');
    assert.strictEqual(b.evento, 'gerar-falhou');
    assert.strictEqual(b.nivel, 'erro');
    assert.match(b.msg, /quebrou/);
});

test('lerRegistro: mais recentes primeiro, filtros por dia, nível, área, série e busca', () => {
    limparPasta();
    gravarLinhas('2026-11-03', [
        { em: '2026-11-03T10:00:00.000Z', nivel: 'info', area: 'http', evento: 'requisicao', msg: 'GET /LerSerie → 200' },
        { em: '2026-11-03T11:00:00.000Z', nivel: 'erro', area: 'render', evento: 'falhou', serie: 'farol', ep: 1, msg: 'ffmpeg caiu' },
    ]);
    gravarLinhas('2026-11-04', [
        { em: '2026-11-04T09:00:00.000Z', nivel: 'aviso', area: 'openrouter', evento: 'repetindo', msg: '429', dados: { status: 429 } },
        'linha quebrada {',
        { em: '2026-11-04T12:00:00.000Z', nivel: 'info', area: 'render', evento: 'concluido', serie: 'farol', ep: 2, ms: 8000, msg: 'Montado' },
    ]);
    fs.appendFileSync(path.join(PASTA, 'registro-2026-11-04.jsonl'), 'lixo sem json\n');

    const tudo = lerRegistro({});
    assert.deepStrictEqual(tudo.eventos.map((e) => e.em), [
        '2026-11-04T12:00:00.000Z', '2026-11-04T09:00:00.000Z', '2026-11-03T11:00:00.000Z', '2026-11-03T10:00:00.000Z',
    ]);
    assert.deepStrictEqual(tudo.dias, ['2026-11-04', '2026-11-03']);
    assert.strictEqual(lerRegistro({ dia: '2026-11-03' }).eventos.length, 2);
    assert.deepStrictEqual(lerRegistro({ nivel: 'aviso,erro' }).eventos.map((e) => e.evento), ['repetindo', 'falhou']);
    assert.deepStrictEqual(lerRegistro({ area: 'render' }).eventos.map((e) => e.ep), [2, 1]);
    assert.strictEqual(lerRegistro({ serie: 'farol', nivel: 'erro' }).eventos.length, 1);
    assert.strictEqual(lerRegistro({ busca: 'FFMPEG' }).eventos[0].evento, 'falhou');
    assert.strictEqual(lerRegistro({ busca: '429' }).eventos.length, 1, 'busca olha também os dados');
    assert.throws(() => lerRegistro({ dia: '03/11/2026' }), /Dia inválido/);
});

test('lerRegistro pagina com antesDe sem perder nem repetir eventos (inclusive do mesmo instante)', () => {
    limparPasta();
    const linhas = [];
    for (let i = 0; i < 25; i++) linhas.push({ em: `2026-11-05T10:00:${String(i).padStart(2, '0')}.000Z`, nivel: 'info', area: 'http', evento: `e${i}`, msg: '' });
    linhas.push({ em: '2026-11-05T10:00:10.000Z', nivel: 'info', area: 'http', evento: 'gemeo', msg: '' });
    gravarLinhas('2026-11-05', linhas);
    const vistos = [];
    let antesDe;
    for (let volta = 0; volta < 10; volta++) {
        const p = lerRegistro({ limite: 7, antesDe });
        vistos.push(...p.eventos.map((e) => e.evento));
        if (!p.temMais) break;
        assert.ok(p.proximoAntesDe);
        antesDe = p.proximoAntesDe;
    }
    assert.strictEqual(vistos.length, 26);
    assert.strictEqual(new Set(vistos).size, 26);
});

test('resumirRegistro: requisições (com agregado), erros, gasto real, gerações e render médio por dia', () => {
    limparPasta();
    const agora = new Date(2026, 10, 5, 15, 0, 0);
    const hoje = R.diaDe(agora);
    const ontem = R.diaDe(new Date(2026, 10, 4, 12));
    gravarLinhas(hoje, [
        { em: '2026-11-05T12:00:00.000Z', nivel: 'info', area: 'http', evento: 'requisicao', msg: '', dados: { status: 200 } },
        { em: '2026-11-05T12:00:01.000Z', nivel: 'aviso', area: 'http', evento: 'requisicao', msg: '', dados: { status: 404 } },
        { em: '2026-11-05T12:01:00.000Z', nivel: 'info', area: 'http', evento: 'agregado', msg: '', dados: { quantidade: 40 } },
        { em: '2026-11-05T12:02:00.000Z', nivel: 'info', area: 'openrouter', evento: 'cotacao', msg: '', dados: { previstoUsd: 9 } },
        { em: '2026-11-05T12:03:00.000Z', nivel: 'info', area: 'openrouter', evento: 'job-criado', msg: '' },
        { em: '2026-11-05T12:04:00.000Z', nivel: 'info', area: 'job', evento: 'job-pronto', custoUsd: 0.25, msg: '' },
        { em: '2026-11-05T12:05:00.000Z', nivel: 'info', area: 'openrouter', evento: 'texto', custoUsd: 0.0015, msg: '' },
        { em: '2026-11-05T12:06:00.000Z', nivel: 'info', area: 'render', evento: 'concluido', ms: 8000, msg: '' },
        { em: '2026-11-05T12:07:00.000Z', nivel: 'info', area: 'render', evento: 'concluido', ms: 12000, msg: '' },
        { em: '2026-11-05T12:08:00.000Z', nivel: 'erro', area: 'render', evento: 'falhou', msg: '' },
    ]);
    gravarLinhas(ontem, [{ em: '2026-11-04T12:00:00.000Z', nivel: 'erro', area: 'sistema', evento: 'x', msg: '' }]);
    const r = resumirRegistro({ dias: 3, agora });
    assert.strictEqual(r.dias.length, 3);
    const d = r.dias[0];
    assert.strictEqual(d.dia, hoje);
    assert.strictEqual(d.requisicoes, 42);
    assert.strictEqual(d.errosHttp, 1);
    assert.strictEqual(d.erros, 1);
    assert.strictEqual(d.avisos, 1);
    assert.strictEqual(d.gastoUsd, 0.2515, 'cotação não conta como gasto');
    assert.strictEqual(d.geracoes, 1);
    assert.strictEqual(d.chamadasIa, 1);
    assert.strictEqual(d.renders, 2);
    assert.strictEqual(d.rendersFalhos, 1);
    assert.strictEqual(d.renderMedioMs, 10000);
    assert.strictEqual(r.dias[1].erros, 1);
    assert.strictEqual(r.dias[2].eventos, 0, 'dia sem arquivo vem zerado');
    assert.strictEqual(r.totais.erros, 2);
    assert.strictEqual(r.totais.renderMedioMs, 10000);
});

test('retenção: apaga só registro/estudio com mais de N dias (ESTUDIO_LOG_DIAS)', () => {
    limparPasta();
    const agora = new Date(2026, 10, 5, 10);
    const nomes = [
        'registro-2026-09-01.jsonl', 'registro-2026-10-05.jsonl', 'registro-2026-10-06.jsonl', 'registro-2026-11-05.jsonl',
        'estudio-2026-09-01.log', 'estudio-2026-11-04.log', 'ep99-teste-5s.mp4', 'estudio.pid', 'registro-velho.txt',
    ];
    for (const n of nomes) fs.writeFileSync(path.join(PASTA, n), 'x');
    process.env.ESTUDIO_LOG_DIAS = '30';
    try {
        assert.strictEqual(R.diasParaGuardar(), 30);
        const r = R.limparAntigos({ agora });
        assert.deepStrictEqual(r.apagados.sort(), ['estudio-2026-09-01.log', 'registro-2026-09-01.jsonl', 'registro-2026-10-05.jsonl']);
        const sobram = fs.readdirSync(PASTA).sort();
        assert.deepStrictEqual(sobram, ['ep99-teste-5s.mp4', 'estudio-2026-11-04.log', 'estudio.pid', 'registro-2026-10-06.jsonl', 'registro-2026-11-05.jsonl', 'registro-velho.txt']);
        process.env.ESTUDIO_LOG_DIAS = 'abc';
        assert.strictEqual(R.diasParaGuardar(), 30);
        process.env.ESTUDIO_LOG_DIAS = '7';
        assert.strictEqual(R.diasParaGuardar(), 7);
    } finally {
        delete process.env.ESTUDIO_LOG_DIAS;
    }
});

// ---------------------------------------------------------------- HTTP
function subir(app) {
    return new Promise((res) => { const s = app.listen(0, '127.0.0.1', () => res(s)); });
}
async function pedir(base, metodo, rota, corpo) {
    const r = await fetch(`${base}${rota}`, {
        method: metodo, headers: corpo ? { 'Content-Type': 'application/json', Authorization: `Bearer ${CHAVE_FALSA}` } : { Authorization: `Bearer ${CHAVE_FALSA}` },
        body: corpo ? JSON.stringify(corpo) : undefined,
    });
    return { status: r.status, corpo: await r.json().catch(() => null) };
}
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

test('nomeDaRota tira /api e a query', () => {
    assert.strictEqual(nomeDaRota({ path: '/api/LerSerie' }), 'LerSerie');
    assert.strictEqual(nomeDaRota({ path: '/Midia' }), 'Midia');
    assert.strictEqual(nomeDaRota({ path: '/assets/index-abc.js' }), '(site)');
});

test('middleware: uma linha por requisição (sem corpo), mídia agregada, erro com a mensagem limpa e evento de domínio', async () => {
    limparPasta();
    const express = require('express');
    const app = express();
    const mw = criarMiddleware({ intervaloMs: 60000 });
    app.use(mw);
    app.use(express.json());
    app.get('/LerSerie', (req, res) => res.json({ ok: true }));
    app.get('/Midia', (req, res) => res.json({ ok: true }));
    app.post('/SalvarEdicao', (req, res) => res.json({ edicao: { revisao: 8 }, historico: { podeDesfazer: true } }));
    app.post('/ApagarSerie', (req, res) => res.status(409).json({ Error: `Recusado ${CHAVE_FALSA}` }));
    const s = await subir(app);
    const base = `http://127.0.0.1:${s.address().port}`;
    try {
        await pedir(base, 'GET', '/LerSerie?serie=farol');
        for (let i = 0; i < 5; i++) await pedir(base, 'GET', '/Midia?serie=farol&arquivo=x.mp4');
        await pedir(base, 'POST', '/SalvarEdicao', { serie: 'farol', ep: 2, edicao: { base64: 'A'.repeat(5000) }, revisaoBase: 7 });
        await pedir(base, 'POST', '/ApagarSerie', { serie: 'farol', confirmacao: 'Farol' });
        await esperar(50);
        mw.parar();
    } finally {
        s.close();
    }
    const bruto = fs.readFileSync(path.join(PASTA, `registro-${R.diaDe()}.jsonl`), 'utf8');
    assert.ok(!bruto.includes(CHAVE_FALSA), 'chave vazou pelo HTTP');
    assert.ok(!bruto.includes('AAAAAAAAAA'), 'corpo vazou');
    const ls = bruto.trim().split('\n').map((l) => JSON.parse(l));
    const req = ls.filter((l) => l.evento === 'requisicao');
    assert.deepStrictEqual(req.map((l) => l.dados.rota), ['LerSerie', 'SalvarEdicao', 'ApagarSerie']);
    assert.strictEqual(req[0].serie, 'farol');
    assert.ok(typeof req[0].ms === 'number');
    assert.strictEqual(req[2].nivel, 'aviso');
    assert.match(req[2].msg, /409: Recusado \[chave oculta\]/);
    const salvar = ls.find((l) => l.area === 'edicao' && l.evento === 'salvar');
    assert.strictEqual(salvar.dados.revisao, 8);
    assert.strictEqual(salvar.dados.revisaoBase, 7);
    assert.strictEqual(salvar.ep, 2);
    const apagar = ls.find((l) => l.area === 'lixeira' && l.evento === 'apagar-serie-falhou');
    assert.ok(apagar, 'falha aparece na área da operação');
    const ag = ls.find((l) => l.evento === 'agregado');
    assert.strictEqual(ag.dados.quantidade, 5);
    assert.strictEqual(ag.dados.rotas.Midia.n, 5);
});

test('rotas GET /Registro e /RegistroResumo respondem pelo app do Estúdio', async () => {
    limparPasta();
    gravarLinhas(R.diaDe(), [
        { em: new Date(Date.now() - 2000).toISOString(), nivel: 'erro', area: 'render', evento: 'falhou', serie: 'farol', msg: 'caiu' },
        { em: new Date(Date.now() - 1000).toISOString(), nivel: 'info', area: 'serie', evento: 'criar', serie: 'farol', msg: 'criada' },
    ]);
    const app = require('../src/index');
    const s = await subir(app);
    const base = `http://127.0.0.1:${s.address().port}`;
    try {
        const a = await pedir(base, 'GET', '/Registro?nivel=erro&limite=10');
        assert.strictEqual(a.status, 200);
        assert.strictEqual(a.corpo.eventos.length, 1);
        assert.strictEqual(a.corpo.eventos[0].evento, 'falhou');
        const b = await pedir(base, 'GET', '/api/RegistroResumo?dias=2');
        assert.strictEqual(b.status, 200);
        assert.strictEqual(b.corpo.dias.length, 2);
        assert.strictEqual(b.corpo.dias[0].erros, 1);
        const c = await pedir(base, 'GET', '/Registro?dia=ontem');
        assert.strictEqual(c.status, 400);
        assert.match(c.corpo.Error, /Dia inválido/);
    } finally {
        s.close();
    }
});

test('showrunner registra a etapa com modelo, tentativas, erros de validação e custo (em dados)', async () => {
    const { executarEtapa } = require('../src/showrunner');
    const vistos = [];
    const desligar = R.ouvir((l) => vistos.push(l));
    try {
        const r = await executarEtapa('ideias', { modo: 'A', serieId: 'farol' }, {
            chamarLLM: async () => ({ conteudo: 'sem json nenhum', custoUsd: 0.001 }), maxTentativas: 2, modelo: 'teste/modelo',
        });
        assert.strictEqual(r.ok, false);
    } finally {
        desligar();
    }
    const l = vistos.find((x) => x.area === 'showrunner' && x.evento === 'etapa');
    assert.ok(l, 'etapa não registrada');
    assert.strictEqual(l.nivel, 'erro');
    assert.strictEqual(l.serie, 'farol');
    assert.strictEqual(l.dados.modelo, 'teste/modelo');
    assert.strictEqual(l.dados.tentativas, 2);
    assert.strictEqual(l.dados.custoUsd, 0.002);
    assert.strictEqual(l.custoUsd, undefined, 'o gasto real sai no evento "texto", não aqui');
    assert.strictEqual(l.dados.errosPorTentativa.length, 2);
});

test('jobs registram criado, mudança de estado, download e pronto (com o custo real)', async () => {
    const { criarJobs } = require('../src/openrouter/jobs');
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'estudio-jobs-log-'));
    let estado = 'in_progress';
    const cliente = {
        simulado: false,
        pedirJson: async () => ({ status: estado, usage: estado === 'completed' ? { cost: 0.42 } : undefined }),
        baixar: async (alvo, destino) => { fs.mkdirSync(path.dirname(destino), { recursive: true }); fs.writeFileSync(destino, 'x'); return { bytes: 1, destino }; },
    };
    const jobs = criarJobs({ base, cliente, serie: 'farol', livro: { registrar: async () => {} } });
    const vistos = [];
    const desligar = R.ouvir((l) => vistos.push(l));
    try {
        const { job } = await jobs.abrir({ pedidoHash: 'h1', tipo: 'video', modelo: 'google/veo', destino: 'takes/a.mp4', previstoUsd: 0.4, ep: 1 },
            async () => ({ id: 'job-1', status: 'pending' }));
        await jobs.consultar(job.jobId);
        estado = 'completed';
        await jobs.consultar(job.jobId);
    } finally {
        desligar();
        fs.rmSync(base, { recursive: true, force: true });
    }
    const eventos = vistos.map((l) => l.evento);
    assert.deepStrictEqual(eventos, ['job-criado', 'job-estado', 'download', 'job-pronto']);
    const pronto = vistos[3];
    assert.strictEqual(pronto.custoUsd, 0.42);
    assert.strictEqual(pronto.serie, 'farol');
    assert.strictEqual(pronto.ep, 1);
    assert.strictEqual(vistos[0].area, 'openrouter');
    assert.strictEqual(vistos[0].dados.previstoUsd, 0.4);
});
