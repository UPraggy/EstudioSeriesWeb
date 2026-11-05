// Lixeira recuperável: apagar série/episódio e refazer o roteiro do zero NUNCA destroem nada.
// Tudo numa pasta temporária (ESTUDIO_DADOS também aponta para ela: nunca a raiz real).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const express = require('express');
const { pastaTemporaria, apagar, criarPng } = require('./series-ajuda');
const armazem = require('../src/series/armazem');
const episodios = require('../src/series/episodios');
const lixeira = require('../src/series/lixeira');
const render = require('../src/edicao/render');

let raiz;
let antes;
let opcoes;

test.before(() => {
    raiz = pastaTemporaria('estudio-lixeira-');
    antes = process.env.ESTUDIO_DADOS;
    process.env.ESTUDIO_DADOS = raiz; // render/edição leem a raiz pelo ambiente
    opcoes = { raiz };
});

test.after(() => {
    if (antes === undefined) delete process.env.ESTUDIO_DADOS;
    else process.env.ESTUDIO_DADOS = antes;
    apagar(raiz);
});

const escrever = (arq, conteudo) => {
    fs.mkdirSync(path.dirname(arq), { recursive: true });
    fs.writeFileSync(arq, typeof conteudo === 'string' || Buffer.isBuffer(conteudo) ? conteudo : JSON.stringify(conteudo, null, 2));
};
const ler = (arq) => fs.readFileSync(arq, 'utf8');
const lerJ = (arq) => JSON.parse(ler(arq));

// Série com um episódio "cheio": roteiro, derivados (falas, áudio, edição, legendas, montagem) e takes pagos.
async function montarSerie(titulo, { ep = 1, duracaoAlvoS = 60, semEscolha = false } = {}) {
    const serie = await armazem.criarSerie({ titulo, genero: 'Teste' }, opcoes);
    await episodios.criarEpisodio(serie.id, ep, 'Primeiro', opcoes, { duracaoAlvoS, semEscolha });
    const pastaSerie = armazem.pastaSerie(serie.id, opcoes);
    const pe = episodios.pastaEpisodio(serie.id, ep, opcoes);
    const idEp = episodios.idEpisodio(ep);
    escrever(path.join(pe, 'roteiro.json'), { versao: 1, n: ep, titulo: 'Primeiro', duracaoAlvoS, planos: [], escolhas: null, aprovado: true });
    escrever(path.join(pe, 'falas.json'), { versao: 1, falas: [{ id: 'p01-f01' }] });
    escrever(path.join(pe, 'audio', 'abc.wav'), 'RIFF-fala');
    escrever(path.join(pe, 'edicao.json'), { versao: 1, revisao: 3 });
    escrever(path.join(pe, '.edicao', 'historico.json'), { pilha: [] });
    escrever(path.join(pe, 'legendas.srt'), '1\n00:00:00,000 --> 00:00:01,000\nOi\n');
    escrever(path.join(pe, 'saida', `${idEp}.mp4`), 'video-montado');
    escrever(path.join(pe, 'takes', 'p03', 'take_01.bruto.mp4'), 'take-pago-bruto');
    escrever(path.join(pe, 'takes', 'p03', 'take_01.mp4'), 'take-pago');
    fs.mkdirSync(path.join(pe, 'quadros'), { recursive: true });
    criarPng(path.join(pe, 'quadros'), 'p01.png', 'quadro');
    escrever(path.join(pe, 'planos.json'), { versao: 1, planos: [] });
    escrever(path.join(pe, 'mesa.json'), { versao: 1, regeracoes: [], takes: {} });
    escrever(path.join(pastaSerie, 'jobs.json'), {
        versao: 1,
        jobs: [{ jobId: 'job-1', status: 'pronto', ep, destino: `episodios/${idEp}/takes/p03/take_01.bruto.mp4`, ref: 'p03/take_01', previstoUsd: 0.12 }],
    });
    fs.appendFileSync(path.join(pastaSerie, 'custos.jsonl'), `${JSON.stringify({ serie: serie.id, ep, tipo: 'video', realUsd: 0.12, jobId: 'job-1' })}\n`);
    await armazem.atualizarBiblia(serie.id, (b) => {
        b.escolhas.push({ ep, A: 'ACENDER', B: 'APAGAR', vencedora: null, votos: { A: 0, B: 0 } });
        return b;
    }, opcoes);
    return { id: serie.id, titulo: serie.titulo, pastaSerie, pe, idEp };
}

function comJob(pastaSerie, job) {
    const arq = path.join(pastaSerie, 'jobs.json');
    const d = lerJ(arq);
    d.jobs.push(job);
    escrever(arq, d);
}

// ---------------------------------------------------------------- série
test('apagar série: confirmação errada não mexe em nada', async () => {
    const s = await montarSerie('Farol Errado');
    for (const confirmacao of [undefined, '', 'farol errado', 'Farol Errado ', 'Outra']) {
        await assert.rejects(lixeira.apagarSerie(s.id, confirmacao, opcoes), (e) => e.status === 400 && /digite o nome da série/.test(e.message));
    }
    assert.ok(fs.existsSync(path.join(s.pastaSerie, 'serie.json')));
    assert.ok(!fs.existsSync(lixeira.pastaLixeira(opcoes)) || fs.readdirSync(lixeira.pastaLixeira(opcoes)).every((n) => !n.endsWith(s.id)));
});

test('apagar série: vai inteira para a lixeira com motivo.json e volta igual ao restaurar', async () => {
    const s = await montarSerie('Sinal Fraco');
    const previa = await lixeira.preverApagarSerie(s.id, opcoes);
    assert.strictEqual(previa.episodios, 1);
    assert.strictEqual(previa.takes, 1, 'take_01 e o .bruto do mesmo take contam como 1');
    assert.strictEqual(previa.takesPagos, 1);
    assert.strictEqual(previa.gastoUsd, 0.12);
    assert.deepStrictEqual(previa.bloqueios, []);

    const r = await lixeira.apagarSerie(s.id, 'Sinal Fraco', opcoes);
    assert.strictEqual(r.ok, true);
    assert.match(r.lixeira, /^_lixeira\/\d{4}-\d{2}-\d{2}_\d{6}-sinal-fraco$/);
    assert.ok(!fs.existsSync(s.pastaSerie), 'a pasta saiu de series/');
    const noLixo = path.join(raiz, r.lixeira, s.id);
    assert.strictEqual(ler(path.join(noLixo, 'episodios', 'ep01', 'takes', 'p03', 'take_01.mp4')), 'take-pago', 'takes pagos estão na lixeira');
    const motivo = lerJ(path.join(raiz, r.lixeira, 'motivo.json'));
    assert.strictEqual(motivo.tipo, 'serie');
    assert.strictEqual(motivo.titulo, 'Sinal Fraco');
    assert.strictEqual(motivo.origem, 'series/sinal-fraco');
    assert.match(motivo.comoRestaurar, /Mova a pasta/);
    assert.ok(!(await armazem.listarSeries(opcoes)).some((x) => x.id === s.id));

    const lista = await lixeira.listarLixeira(opcoes);
    const item = lista.find((i) => i.item === r.item);
    assert.ok(item && item.tipo === 'serie' && item.titulo === 'Sinal Fraco');

    const volta = await lixeira.restaurarDaLixeira(r.item, opcoes);
    assert.strictEqual(volta.ok, true);
    assert.strictEqual(ler(path.join(s.pe, 'takes', 'p03', 'take_01.mp4')), 'take-pago');
    assert.strictEqual(lerJ(path.join(s.pastaSerie, 'serie.json')).titulo, 'Sinal Fraco');
    assert.ok(!fs.existsSync(path.join(raiz, r.lixeira)), 'o item some da lixeira depois de restaurado');
});

test('restaurar série nunca sobrescreve uma série que existe hoje', async () => {
    const s = await montarSerie('Duas Vezes');
    const r = await lixeira.apagarSerie(s.id, 'Duas Vezes', opcoes);
    await armazem.criarSerie({ titulo: 'Duas Vezes' }, opcoes);
    await assert.rejects(lixeira.restaurarDaLixeira(r.item, opcoes), (e) => e.status === 409);
    assert.ok(fs.existsSync(path.join(raiz, r.lixeira, s.id, 'serie.json')), 'a cópia da lixeira continua lá');
});

test('job pago pendente trava apagar série, apagar episódio e refazer roteiro; "incerto" só avisa', async () => {
    const s = await montarSerie('Em Andamento');
    comJob(s.pastaSerie, { jobId: 'job-2', status: 'pendente', ep: 1, destino: 'episodios/ep01/takes/p05/take_01.mp4', ref: 'p05/take_01' });
    await assert.rejects(lixeira.apagarSerie(s.id, 'Em Andamento', opcoes), (e) => e.status === 409 && /geração paga em andamento/.test(e.message));
    await assert.rejects(lixeira.apagarEpisodio(s.id, 1, opcoes), (e) => e.status === 409 && /p05\/take_01/.test(e.message));
    await assert.rejects(lixeira.refazerRoteiro(s.id, 1, {}, opcoes), (e) => e.status === 409);
    assert.ok(fs.existsSync(path.join(s.pe, 'roteiro.json')), 'nada saiu do lugar');
    assert.ok(fs.existsSync(s.pastaSerie));
    assert.ok((await lixeira.preverApagarSerie(s.id, opcoes)).bloqueios.length > 0);

    // job de OUTRO episódio não trava este episódio
    const d = lerJ(path.join(s.pastaSerie, 'jobs.json'));
    d.jobs[1] = { ...d.jobs[1], ep: 7, destino: 'episodios/ep07/takes/p01/take_01.mp4' };
    escrever(path.join(s.pastaSerie, 'jobs.json'), d);
    assert.deepStrictEqual((await lixeira.preverApagarEpisodio(s.id, 1, opcoes)).bloqueios, []);

    // "incerto" não grava nada: não trava, só avisa
    d.jobs[1] = { ...d.jobs[1], status: 'incerto' };
    escrever(path.join(s.pastaSerie, 'jobs.json'), d);
    const p = await lixeira.preverApagarSerie(s.id, opcoes);
    assert.deepStrictEqual(p.bloqueios, []);
    assert.match(p.avisos.join(' '), /incerto/);
});

test('montagem rodando trava; render.json "montando" de antes de reiniciar não trava', async () => {
    const s = await montarSerie('Montando Agora');
    escrever(path.join(s.pe, 'saida', 'render.json'), { status: 'montando', pct: 40 });
    assert.deepStrictEqual((await lixeira.preverApagarEpisodio(s.id, 1, opcoes)).bloqueios, [], 'servidor reiniciou: interrompido');
    const original = render.statusRender;
    render.statusRender = async () => ({ status: 'montando' });
    try {
        await assert.rejects(lixeira.refazerRoteiro(s.id, 1, {}, opcoes), (e) => e.status === 409 && /sendo montado/.test(e.message));
        await assert.rejects(lixeira.apagarSerie(s.id, 'Montando Agora', opcoes), (e) => e.status === 409);
    } finally {
        render.statusRender = original;
    }
    assert.ok(fs.existsSync(path.join(s.pe, 'saida', 'ep01.mp4')));
});

// ---------------------------------------------------------------- episódio
test('apagar episódio com votos registrados é recusado', async () => {
    const s = await montarSerie('Ja Votado');
    await episodios.registrarVotacao(s.id, 1, { A: 12, B: 7 }, opcoes);
    const p = await lixeira.preverApagarEpisodio(s.id, 1, opcoes);
    assert.strictEqual(p.votado, true);
    assert.match(p.bloqueios[0], /12 x 7/);
    await assert.rejects(lixeira.apagarEpisodio(s.id, 1, opcoes), (e) => e.status === 409 && /votação registrada \(12 x 7\)/.test(e.message));
    assert.ok(fs.existsSync(s.pe));
    assert.ok(lerJ(path.join(s.pastaSerie, 'serie.json')).episodios.some((e) => e.n === 1));
});

test('apagar episódio: pasta (com takes pagos) na lixeira, sai do serie.json e da bíblia; restaurar devolve tudo', async () => {
    const s = await montarSerie('Ep Que Sai');
    await episodios.criarEpisodio(s.id, 2, 'Segundo', opcoes);
    const p = await lixeira.preverApagarEpisodio(s.id, 'ep01', opcoes);
    assert.strictEqual(p.takes, 1);
    assert.strictEqual(p.takesPagos, 1);
    assert.strictEqual(p.gastoUsd, 0.12);
    assert.deepStrictEqual(p.bloqueios, []);

    const r = await lixeira.apagarEpisodio(s.id, 1, opcoes);
    assert.strictEqual(r.ok, true);
    assert.match(r.lixeira, /^_lixeira\/\d{4}-\d{2}-\d{2}_\d{6}-ep-que-sai-ep01$/);
    assert.ok(!fs.existsSync(s.pe));
    assert.strictEqual(ler(path.join(raiz, r.lixeira, 'ep01', 'takes', 'p03', 'take_01.mp4')), 'take-pago');
    const serie = lerJ(path.join(s.pastaSerie, 'serie.json'));
    assert.deepStrictEqual(serie.episodios.map((e) => e.n), [2]);
    assert.ok(!lerJ(path.join(s.pastaSerie, 'biblia.json')).escolhas.some((x) => x.ep === 1));
    assert.strictEqual(fs.readFileSync(path.join(s.pastaSerie, 'custos.jsonl'), 'utf8').includes('job-1'), true, 'o gasto continua registrado');
    const motivo = lerJ(path.join(raiz, r.lixeira, 'motivo.json'));
    assert.strictEqual(motivo.tipo, 'episodio');
    assert.strictEqual(motivo.ep, 1);
    assert.strictEqual(motivo.entrada.titulo, 'Primeiro');
    assert.strictEqual(motivo.escolha.A, 'ACENDER');

    await lixeira.restaurarDaLixeira(r.item, opcoes);
    assert.strictEqual(ler(path.join(s.pe, 'takes', 'p03', 'take_01.mp4')), 'take-pago');
    assert.deepStrictEqual(lerJ(path.join(s.pastaSerie, 'serie.json')).episodios.map((e) => e.n), [1, 2]);
    assert.ok(lerJ(path.join(s.pastaSerie, 'biblia.json')).escolhas.some((x) => x.ep === 1 && x.A === 'ACENDER'));
});

test('restaurar episódio recusa quando já existe outro com o mesmo número', async () => {
    const s = await montarSerie('Ep Ocupado');
    const r = await lixeira.apagarEpisodio(s.id, 1, opcoes);
    await episodios.criarEpisodio(s.id, 1, 'Novo', opcoes);
    await assert.rejects(lixeira.restaurarDaLixeira(r.item, opcoes), (e) => e.status === 409);
    assert.ok(fs.existsSync(path.join(raiz, r.lixeira, 'ep01', 'roteiro.json')));
});

// ---------------------------------------------------------------- refazer o roteiro do zero
test('refazer roteiro: versão guardada em _versoes, takes pagos ficam, episódio volta para "roteiro"', async () => {
    const s = await montarSerie('Refazer Tudo');
    const antesTake = ler(path.join(s.pe, 'takes', 'p03', 'take_01.mp4'));
    const previa = await lixeira.preverRefazerRoteiro(s.id, 1, {}, opcoes);
    assert.deepStrictEqual(previa.vaiParaVersoes.map((i) => i.nome).sort(),
        ['.edicao', 'audio', 'edicao.json', 'falas.json', 'legendas.srt', 'roteiro.json', 'saida'].sort());
    assert.deepStrictEqual(previa.preservados.map((i) => i.nome).sort(), ['mesa.json', 'planos.json', 'quadros', 'takes']);

    const r = await lixeira.refazerRoteiro(s.id, 1, { duracaoAlvoS: '15', semEscolha: true }, opcoes);
    assert.strictEqual(r.ok, true);
    assert.match(r.versao, /^series\/refazer-tudo\/episodios\/ep01\/_versoes\/\d{4}-\d{2}-\d{2}_\d{6}$/);
    const versao = path.join(raiz, r.versao);
    // o que saiu está inteiro na versão (recuperável)
    assert.strictEqual(lerJ(path.join(versao, 'roteiro.json')).titulo, 'Primeiro');
    assert.strictEqual(ler(path.join(versao, 'audio', 'abc.wav')), 'RIFF-fala');
    assert.strictEqual(ler(path.join(versao, 'saida', 'ep01.mp4')), 'video-montado');
    assert.ok(fs.existsSync(path.join(versao, '.edicao', 'historico.json')));
    const motivo = lerJ(path.join(versao, 'motivo.json'));
    assert.strictEqual(motivo.tipo, 'refazerRoteiro');
    assert.strictEqual(motivo.escolhaAntes.A, 'ACENDER');
    // o episódio ficou limpo
    for (const nome of ['roteiro.json', 'falas.json', 'audio', 'edicao.json', '.edicao', 'legendas.srt', 'saida']) {
        assert.ok(!fs.existsSync(path.join(s.pe, nome)), `${nome} saiu do episódio`);
    }
    // takes pagos, quadros, planos e mesa NUNCA saem
    assert.strictEqual(ler(path.join(s.pe, 'takes', 'p03', 'take_01.mp4')), antesTake);
    assert.ok(fs.existsSync(path.join(s.pe, 'takes', 'p03', 'take_01.bruto.mp4')));
    assert.ok(fs.existsSync(path.join(s.pe, 'quadros', 'p01.png')));
    assert.ok(fs.existsSync(path.join(s.pe, 'planos.json')));
    assert.ok(fs.existsSync(path.join(s.pe, 'mesa.json')));
    assert.deepStrictEqual(r.preservados.sort(), ['mesa.json', 'planos.json', 'quadros', 'takes']);
    // serie.json e bíblia
    const entrada = lerJ(path.join(s.pastaSerie, 'serie.json')).episodios.find((e) => e.n === 1);
    assert.strictEqual(entrada.status, 'roteiro');
    assert.strictEqual(entrada.duracaoAlvoS, 15);
    assert.strictEqual(entrada.semEscolha, true);
    assert.ok(!lerJ(path.join(s.pastaSerie, 'biblia.json')).escolhas.some((x) => x.ep === 1));
    // o episódio continua legível (sem roteiro) e aceita um roteiro novo
    const ep = await episodios.lerEpisodio(s.id, 1, opcoes);
    assert.strictEqual(ep.roteiro, null);
});

test('refazer roteiro sem apagarDerivados só guarda o roteiro; com votos, a votação continua', async () => {
    const s = await montarSerie('So O Roteiro');
    await episodios.registrarVotacao(s.id, 1, { A: 3, B: 5 }, opcoes);
    const r = await lixeira.refazerRoteiro(s.id, 1, { apagarDerivados: 'false' }, opcoes);
    assert.deepStrictEqual(r.movidos, ['roteiro.json']);
    assert.ok(fs.existsSync(path.join(s.pe, 'falas.json')));
    assert.ok(fs.existsSync(path.join(s.pe, 'edicao.json')));
    assert.ok(fs.existsSync(path.join(s.pe, 'votacao.json')), 'votação é resultado real: fica');
    assert.match(r.avisos.join(' '), /3 x 5/);
    assert.ok(lerJ(path.join(s.pastaSerie, 'biblia.json')).escolhas.some((x) => x.ep === 1 && x.vencedora === 'B'));
    assert.strictEqual(lerJ(path.join(s.pastaSerie, 'serie.json')).episodios[0].duracaoAlvoS, 60, 'sem duração nova, fica a de antes');
});

test('duas versões seguidas no mesmo segundo não se sobrescrevem', async () => {
    const s = await montarSerie('Duas Versoes');
    const r1 = await lixeira.refazerRoteiro(s.id, 1, {}, opcoes);
    escrever(path.join(s.pe, 'roteiro.json'), { versao: 1, n: 1, titulo: 'Segundo roteiro', planos: [] });
    const r2 = await lixeira.refazerRoteiro(s.id, 1, {}, opcoes);
    assert.notStrictEqual(r1.versao, r2.versao);
    assert.strictEqual(lerJ(path.join(raiz, r1.versao, 'roteiro.json')).titulo, 'Primeiro');
    assert.strictEqual(lerJ(path.join(raiz, r2.versao, 'roteiro.json')).titulo, 'Segundo roteiro');
    // sem nada para guardar: não cria versão vazia
    const r3 = await lixeira.refazerRoteiro(s.id, 1, {}, opcoes);
    assert.strictEqual(r3.versao, null);
});

// ---------------------------------------------------------------- caminhos e entradas inválidas
test('caminhos e entradas inválidos são recusados', async () => {
    await assert.rejects(lixeira.apagarSerie('../fora', 'x', opcoes), (e) => e.status === 400);
    await assert.rejects(lixeira.apagarSerie('nao-existe', 'x', opcoes), (e) => e.status === 404);
    const s = await montarSerie('Caminhos');
    await assert.rejects(lixeira.apagarEpisodio(s.id, 'ep01/../..', opcoes), (e) => e.status === 400);
    await assert.rejects(lixeira.apagarEpisodio(s.id, 42, opcoes), (e) => e.status === 404);
    await assert.rejects(lixeira.refazerRoteiro(s.id, 1, { duracaoAlvoS: 9999 }, opcoes), (e) => e.status === 400);
    await assert.rejects(lixeira.restaurarDaLixeira('../../series', opcoes), (e) => e.status === 400);
    await assert.rejects(lixeira.restaurarDaLixeira('2026-11-04_120000-nao-tem', opcoes), (e) => e.status === 404);
    assert.ok(fs.existsSync(s.pe));
});

// ---------------------------------------------------------------- controllers (padrão { Error })
test('controllers: ApagarSerie, ApagarEpisodio, RefazerRoteiro, PreverApagar, ListarLixeira, RestaurarDaLixeira', async () => {
    const app = express();
    app.use(express.json());
    for (const nome of ['ApagarSerie', 'ApagarEpisodio', 'RefazerRoteiro', 'PreverApagar', 'RestaurarDaLixeira']) app.post(`/${nome}`, require(`../src/controllers/${nome}`).REST);
    for (const nome of ['PreverApagar', 'ListarLixeira']) app.get(`/${nome}`, require(`../src/controllers/${nome}`).REST);
    const servidor = app.listen(0, '127.0.0.1');
    await new Promise((r) => servidor.once('listening', r));
    const base = `http://127.0.0.1:${servidor.address().port}`;
    const post = async (rota, corpo) => {
        const r = await fetch(`${base}/${rota}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
        return { status: r.status, json: await r.json() };
    };
    try {
        const s = await montarSerie('Pelos Controllers');
        let r = await fetch(`${base}/PreverApagar?serie=${s.id}`);
        let j = await r.json();
        assert.strictEqual(j.acao, 'serie');
        assert.strictEqual(j.serie.titulo, 'Pelos Controllers');

        r = await fetch(`${base}/PreverApagar?serie=${s.id}&ep=1&acao=roteiro`);
        j = await r.json();
        assert.strictEqual(j.acao, 'roteiro');
        assert.strictEqual(j.episodio.duracaoAlvoS, 60);

        let p = await post('ApagarSerie', { serie: s.id, confirmacao: 'errado' });
        assert.strictEqual(p.status, 400);
        assert.match(p.json.Error, /Pelos Controllers/);

        p = await post('ApagarEpisodio', { serie: s.id });
        assert.strictEqual(p.status, 400);

        p = await post('RefazerRoteiro', { serie: s.id, ep: 1, duracaoAlvoS: 30, semEscolha: false });
        assert.strictEqual(p.status, 200);
        assert.strictEqual(p.json.episodio.duracaoAlvoS, 30);
        assert.ok(p.json.preservados.includes('takes'));

        p = await post('ApagarEpisodio', { serie: s.id, ep: 1 });
        assert.strictEqual(p.status, 200);
        const itemEp = p.json.item;

        p = await post('ApagarSerie', { serie: s.id, confirmacao: 'Pelos Controllers' });
        assert.strictEqual(p.status, 200);
        assert.ok(p.json.lixeira.startsWith('_lixeira/'));

        r = await fetch(`${base}/ListarLixeira`);
        j = await r.json();
        assert.ok(j.itens.some((i) => i.item === p.json.item && i.tipo === 'serie'));

        // ordem certa: a série primeiro, depois o episódio
        let q = await post('RestaurarDaLixeira', { item: itemEp });
        assert.strictEqual(q.status, 409);
        assert.match(q.json.Error, /restaure a série primeiro/);
        q = await post('RestaurarDaLixeira', { item: p.json.item });
        assert.strictEqual(q.status, 200);
        q = await post('RestaurarDaLixeira', { item: itemEp });
        assert.strictEqual(q.status, 200);
        assert.ok(fs.existsSync(path.join(s.pe, 'takes', 'p03', 'take_01.mp4')));
    } finally {
        servidor.close();
    }
});
