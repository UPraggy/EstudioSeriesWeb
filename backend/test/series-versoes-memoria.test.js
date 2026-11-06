// Versões do roteiro (voltar a uma versão guardada pela tela) e a memória da série ao apagar episódio / refazer
// roteiro: os fatos e o resumo que vieram do episódio saem da memória viva, ficam guardados junto e voltam ao restaurar.
// Tudo numa pasta temporária (ESTUDIO_DADOS também aponta para ela: nunca a raiz real).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const express = require('express');
const { pastaTemporaria, apagar } = require('./series-ajuda');
const armazem = require('../src/series/armazem');
const episodios = require('../src/series/episodios');
const lixeira = require('../src/series/lixeira');
const render = require('../src/edicao/render');
const { carregarMemoria } = require('../src/memoria/arquivos');
const memoriaEp = require('../src/memoria/doEpisodio');

let raiz;
let antes;
let opcoes;

test.before(() => {
    raiz = pastaTemporaria('estudio-versoes-');
    antes = process.env.ESTUDIO_DADOS;
    process.env.ESTUDIO_DADOS = raiz;
    opcoes = { raiz };
});

test.after(() => {
    if (antes === undefined) delete process.env.ESTUDIO_DADOS;
    else process.env.ESTUDIO_DADOS = antes;
    apagar(raiz);
});

const escrever = (arq, conteudo) => {
    fs.mkdirSync(path.dirname(arq), { recursive: true });
    fs.writeFileSync(arq, typeof conteudo === 'string' ? conteudo : JSON.stringify(conteudo, null, 2));
};
const ler = (arq) => fs.readFileSync(arq, 'utf8');
const lerJ = (arq) => JSON.parse(ler(arq));
const jsonl = (linhas) => linhas.map((l) => JSON.stringify(l)).join('\n') + '\n';

const roteiro = (titulo, duracaoAlvoS = 60, extra = {}) => ({
    versao: 1, n: 1, titulo, duracaoAlvoS,
    // planos de 5 s (a validação pede de 2 a 10 s cada)
    planos: Array.from({ length: Math.ceil(duracaoAlvoS / 5) }, (_, i) => ({
        n: i + 1, deS: i * 5, ateS: Math.min(duracaoAlvoS, (i + 1) * 5), tipo: 'video_ia', local: 'farol', elenco: [], objetos: [], visual: 'x', tela: '', falas: [],
    })),
    escolhas: { A: { texto: `A de ${titulo}` }, B: { texto: `B de ${titulo}` } },
    aprovado: true,
    ...extra,
});

// Série com o Ep. 1 cheio (roteiro + derivados + takes pagos) e o Ep. 2 vazio.
async function montarSerie(titulo) {
    const serie = await armazem.criarSerie({ titulo, genero: 'Teste' }, opcoes);
    await episodios.criarEpisodio(serie.id, 1, 'Primeiro', opcoes, { duracaoAlvoS: 60 });
    await episodios.criarEpisodio(serie.id, 2, 'Segundo', opcoes);
    const pastaSerie = armazem.pastaSerie(serie.id, opcoes);
    const pe = episodios.pastaEpisodio(serie.id, 1, opcoes);
    escrever(path.join(pe, 'roteiro.json'), roteiro('Primeiro'));
    escrever(path.join(pe, 'falas.json'), { versao: 1, falas: [{ id: 'v1' }] });
    escrever(path.join(pe, 'audio', 'a.wav'), 'fala-v1');
    escrever(path.join(pe, 'edicao.json'), { versao: 1, revisao: 1 });
    escrever(path.join(pe, 'saida', 'ep01.mp4'), 'montado-v1');
    escrever(path.join(pe, 'takes', 'p01', 'take_01.mp4'), 'take-pago');
    escrever(path.join(pe, 'planos.json'), { versao: 1, planos: [] });
    escrever(path.join(pe, 'mesa.json'), { versao: 1, regeracoes: [], takes: {} });
    escrever(path.join(pastaSerie, 'jobs.json'), { versao: 1, jobs: [{ jobId: 'job-1', status: 'pronto', ep: 1, destino: 'episodios/ep01/takes/p01/take_01.mp4' }] });
    await armazem.atualizarBiblia(serie.id, (b) => {
        b.escolhas.push({ ep: 1, A: 'A de Primeiro', B: 'B de Primeiro', vencedora: null, votos: { A: 0, B: 0 } });
        return b;
    }, opcoes);
    return { id: serie.id, pastaSerie, pe, mem: path.join(pastaSerie, 'memoria') };
}

// Memória com fatos da bíblia (ep00), do Ep. 1 e do Ep. 2, encerramentos cruzados e um fato sem origem.
function montarMemoria(mem) {
    escrever(path.join(mem, 'fatos.jsonl'), jsonl([
        { id: 'ep00-001', tipo: 'regra', texto: 'Ninguém atravessa a ponte.', fonte: 'biblia', desde: 'ep00', ate: null, importancia: 3, sobre: [] },
        { id: 'ep00-002', tipo: 'personagem', texto: 'Mara começa no farol.', fonte: 'biblia', desde: 'ep00', ate: null, importancia: 1, sobre: ['mara'], chave: 'personagem:mara:onde' },
        { id: 'ep00-002', ate: 'ep01', motivoFim: 'substituído por ep01-002', registradoEm: '2026-11-01T10:00:00.000Z' },
        { id: 'ep01-001', tipo: 'evento', texto: 'Mara acende o farol.', fonte: 'ep01/p03', desde: 'ep01', ate: null, importancia: 3, sobre: ['mara'] },
        { id: 'ep01-002', tipo: 'personagem', texto: 'Mara termina o Ep. 1 no cais.', fonte: 'ep01', desde: 'ep01', ate: null, importancia: 1, sobre: ['mara'], chave: 'personagem:mara:onde' },
        { id: 'ep02-001', tipo: 'evento', texto: 'A lancha chega.', fonte: 'ep02', desde: 'ep02', ate: null, importancia: 2, sobre: [] },
        { id: 'ep01-001', ate: 'ep02', motivoFim: 'o farol apagou', registradoEm: '2026-11-02T10:00:00.000Z' },
        { id: 'manual-1', tipo: 'evento', texto: 'Anotado à mão, sem origem.', importancia: 1, sobre: [] },
    ]));
    escrever(path.join(mem, 'resumos', 'ep01.md'), '# Ep. 1\n\nMara acende o farol.\n');
    escrever(path.join(mem, 'resumos', 'ep02.md'), '# Ep. 2\n\nA lancha chega.\n');
    escrever(path.join(mem, 'propostas', 'ep01.json'), { versao: 1, ep: 'ep01', aprovada: true, glossarioNovo: [{ termo: 'Davi' }] });
    escrever(path.join(mem, 'estado.json'), { versao: 1, atualizadoAte: 'ep02', personagens: {} });
}

const porId = (fatos) => Object.fromEntries(fatos.map((f) => [f.id, f]));

// ---------------------------------------------------------------- versões do roteiro
test('voltar a uma versão: a atual fica guardada numa pasta nova, a escolhida volta inteira', async () => {
    const s = await montarSerie('Volta Versao');
    const r1 = await lixeira.refazerRoteiro(s.id, 1, { duracaoAlvoS: 15 }, opcoes);
    const v1 = path.basename(r1.versao);
    // roteiro novo (o que o showrunner escreveria) + derivados novos
    await episodios.salvarRoteiro(s.id, 1, roteiro('Segundo roteiro', 15, { escolhas: null, aprovado: null }), opcoes);
    escrever(path.join(s.pe, 'falas.json'), { versao: 1, falas: [{ id: 'v2' }] });

    const lista = await lixeira.listarVersoesRoteiro(s.id, 1, opcoes);
    assert.strictEqual(lista.versoes.length, 1);
    const item = lista.versoes[0];
    assert.strictEqual(item.versao, v1);
    assert.strictEqual(item.tipo, 'refazerRoteiro');
    assert.strictEqual(item.titulo, 'Primeiro');
    assert.strictEqual(item.duracaoAlvoS, 60);
    assert.strictEqual(item.duracaoPlanosS, 60);
    assert.strictEqual(item.planos, 12);
    assert.strictEqual(item.temRoteiro, true);
    assert.deepStrictEqual(item.arquivos.map((i) => i.nome).sort(), ['audio', 'edicao.json', 'falas.json', 'roteiro.json', 'saida']);
    assert.ok(item.guardadoEm && !Number.isNaN(Date.parse(item.guardadoEm)));
    assert.strictEqual(lista.episodio.roteiroAtual.titulo, 'Segundo roteiro');
    assert.deepStrictEqual(lista.bloqueios, []);

    const r = await lixeira.restaurarVersaoRoteiro(s.id, 1, v1, opcoes);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.restaurada, v1);
    assert.match(r.guardada, /^series\/volta-versao\/episodios\/ep01\/_versoes\/\d{4}-\d{2}-\d{2}_\d{6}(-\d+)?$/);
    assert.notStrictEqual(path.basename(r.guardada), v1);
    // a versão escolhida voltou para o episódio
    assert.strictEqual(lerJ(path.join(s.pe, 'roteiro.json')).titulo, 'Primeiro');
    assert.strictEqual(lerJ(path.join(s.pe, 'falas.json')).falas[0].id, 'v1');
    assert.strictEqual(ler(path.join(s.pe, 'audio', 'a.wav')), 'fala-v1');
    assert.strictEqual(ler(path.join(s.pe, 'saida', 'ep01.mp4')), 'montado-v1');
    assert.ok(!fs.existsSync(path.join(raiz, r1.versao)), 'a pasta da versão restaurada some (o conteúdo voltou)');
    // a versão que estava valendo ficou guardada (nada sobrescrito)
    const guardada = path.join(raiz, r.guardada);
    assert.strictEqual(lerJ(path.join(guardada, 'roteiro.json')).titulo, 'Segundo roteiro');
    assert.strictEqual(lerJ(path.join(guardada, 'falas.json')).falas[0].id, 'v2');
    const motivo = lerJ(path.join(guardada, 'motivo.json'));
    assert.strictEqual(motivo.tipo, 'antesDeRestaurar');
    assert.strictEqual(motivo.restaurouVersao, v1);
    assert.strictEqual(motivo.roteiro.titulo, 'Segundo roteiro');
    // takes pagos nunca mudam
    assert.strictEqual(ler(path.join(s.pe, 'takes', 'p01', 'take_01.mp4')), 'take-pago');
    assert.ok(fs.existsSync(path.join(s.pe, 'planos.json')));
    // serie.json e bíblia voltaram ao que eram com a versão antiga
    const entrada = lerJ(path.join(s.pastaSerie, 'serie.json')).episodios.find((e) => e.n === 1);
    assert.strictEqual(entrada.titulo, 'Primeiro');
    assert.strictEqual(entrada.duracaoAlvoS, 60);
    assert.strictEqual(entrada.semEscolha, false);
    const escolha = lerJ(path.join(s.pastaSerie, 'biblia.json')).escolhas.find((x) => x.ep === 1);
    assert.strictEqual(escolha.A, 'A de Primeiro');

    // e dá para ir e voltar: a lista agora mostra a guardada, e voltar a ela troca de novo
    const lista2 = await lixeira.listarVersoesRoteiro(s.id, 1, opcoes);
    assert.deepStrictEqual(lista2.versoes.map((v) => v.versao), [path.basename(r.guardada)]);
    assert.strictEqual(lista2.versoes[0].tipo, 'antesDeRestaurar');
    assert.strictEqual(lista2.versoes[0].deVersao, v1);
    const volta = await lixeira.restaurarVersaoRoteiro(s.id, 1, path.basename(r.guardada), opcoes);
    assert.strictEqual(lerJ(path.join(s.pe, 'roteiro.json')).titulo, 'Segundo roteiro');
    assert.strictEqual(lerJ(path.join(raiz, volta.guardada, 'roteiro.json')).titulo, 'Primeiro');
    const entrada2 = lerJ(path.join(s.pastaSerie, 'serie.json')).episodios.find((e) => e.n === 1);
    assert.strictEqual(entrada2.semEscolha, true, 'o roteiro sem votação volta sem votação');
    assert.ok(!lerJ(path.join(s.pastaSerie, 'biblia.json')).escolhas.some((x) => x.ep === 1), 'escolha A/B sai junto com o roteiro que a tinha');
});

test('voltar a uma versão: travas (job pago, regeração, montagem) recusam com 409 e nada sai do lugar', async () => {
    const s = await montarSerie('Versao Travada');
    const r1 = await lixeira.refazerRoteiro(s.id, 1, {}, opcoes);
    const v1 = path.basename(r1.versao);
    await episodios.salvarRoteiro(s.id, 1, roteiro('Novo'), opcoes);
    const conferirIntacto = () => {
        assert.strictEqual(lerJ(path.join(s.pe, 'roteiro.json')).titulo, 'Novo');
        assert.ok(fs.existsSync(path.join(raiz, r1.versao, 'roteiro.json')));
        assert.deepStrictEqual(fs.readdirSync(path.join(s.pe, '_versoes')), [v1], 'nenhuma pasta nova');
    };

    const jobs = lerJ(path.join(s.pastaSerie, 'jobs.json'));
    jobs.jobs.push({ jobId: 'job-2', status: 'pendente', ep: 1, destino: 'episodios/ep01/takes/p02/take_01.mp4', ref: 'p02/take_01' });
    escrever(path.join(s.pastaSerie, 'jobs.json'), jobs);
    await assert.rejects(lixeira.restaurarVersaoRoteiro(s.id, 1, v1, opcoes), (e) => e.status === 409 && /geração paga em andamento/.test(e.message));
    assert.ok((await lixeira.listarVersoesRoteiro(s.id, 1, opcoes)).bloqueios.length > 0);
    conferirIntacto();
    jobs.jobs.pop();
    escrever(path.join(s.pastaSerie, 'jobs.json'), jobs);

    escrever(path.join(s.pe, 'mesa.json'), { versao: 1, regeracoes: [{ id: 'r1', status: 'gerando' }], takes: {} });
    await assert.rejects(lixeira.restaurarVersaoRoteiro(s.id, 1, v1, opcoes), (e) => e.status === 409 && /regerado/.test(e.message));
    conferirIntacto();
    escrever(path.join(s.pe, 'mesa.json'), { versao: 1, regeracoes: [], takes: {} });

    escrever(path.join(s.pe, 'saida', 'render.json'), { status: 'montando' });
    const original = render.statusRender;
    render.statusRender = async () => ({ status: 'montando' });
    try {
        await assert.rejects(lixeira.restaurarVersaoRoteiro(s.id, 1, v1, opcoes), (e) => e.status === 409 && /sendo montado/.test(e.message));
    } finally {
        render.statusRender = original;
    }
    conferirIntacto();
});

test('voltar a uma versão: nome inválido, versão inexistente e versão sem roteiro', async () => {
    const s = await montarSerie('Versao Invalida');
    for (const v of ['../..', 'ep01', '2026-11-04_120000/../..', '', 42]) {
        await assert.rejects(lixeira.restaurarVersaoRoteiro(s.id, 1, v, opcoes), (e) => e.status === 400);
    }
    await assert.rejects(lixeira.restaurarVersaoRoteiro(s.id, 1, '2026-11-04_120000', opcoes), (e) => e.status === 404);
    fs.mkdirSync(path.join(s.pe, '_versoes', '2026-11-04_120001'), { recursive: true });
    escrever(path.join(s.pe, '_versoes', '2026-11-04_120001', 'falas.json'), {});
    await assert.rejects(lixeira.restaurarVersaoRoteiro(s.id, 1, '2026-11-04_120001', opcoes), (e) => e.status === 400 && /não tem roteiro/.test(e.message));
    assert.strictEqual(lerJ(path.join(s.pe, 'roteiro.json')).titulo, 'Primeiro');
    const lista = await lixeira.listarVersoesRoteiro(s.id, 1, opcoes);
    assert.strictEqual(lista.versoes[0].temRoteiro, false);
    assert.strictEqual(lista.versoes[0].tipo, 'desconhecido');
});

test('voltar a uma versão com votação registrada: a votação continua valendo', async () => {
    const s = await montarSerie('Versao Votada');
    await episodios.registrarVotacao(s.id, 1, { A: 4, B: 9 }, opcoes);
    const r1 = await lixeira.refazerRoteiro(s.id, 1, {}, opcoes);
    await episodios.salvarRoteiro(s.id, 1, roteiro('Novo'), opcoes);
    const r = await lixeira.restaurarVersaoRoteiro(s.id, 1, path.basename(r1.versao), opcoes);
    assert.match(r.avisos.join(' '), /4 x 9/);
    const escolha = lerJ(path.join(s.pastaSerie, 'biblia.json')).escolhas.find((x) => x.ep === 1);
    assert.strictEqual(escolha.vencedora, 'B');
    assert.ok(fs.existsSync(path.join(s.pe, 'votacao.json')));
});

// ---------------------------------------------------------------- memória
test('memória: separar linhas acha a origem por id, desde e fonte; encerramentos feitos pelo episódio saem', () => {
    const texto = jsonl([
        { id: 'ep00-001', tipo: 'regra', texto: 'a', desde: 'ep00' },
        { id: 'x-1', tipo: 'evento', texto: 'b', desde: 'ep01' },
        { id: 'x-2', tipo: 'evento', texto: 'c', fonte: 'ep01/votacao' },
        { id: 'ep00-001', ate: 'ep01' },
        { id: 'ep02-001', tipo: 'evento', texto: 'd', desde: 'ep02' },
        { id: 'sem', tipo: 'evento', texto: 'e' },
    ]) + '{quebrada\n';
    const r = memoriaEp.separarLinhas(texto, 1);
    assert.deepStrictEqual(r.ids.sort(), ['x-1', 'x-2']);
    assert.strictEqual(r.fatos, 2);
    assert.strictEqual(r.encerramentos, 1);
    assert.deepStrictEqual(r.semOrigem, ['sem']);
    assert.strictEqual(r.fica.length, 4, 'ep00-001, ep02-001, sem e a linha quebrada ficam');
    assert.ok(r.fica.includes('{quebrada'));
});

test('memória: apagar o episódio tira só o que veio dele (guardado na lixeira) e restaurar devolve igual', async () => {
    const s = await montarSerie('Memoria Lixeira');
    montarMemoria(s.mem);
    const antesMem = porId(carregarMemoria(s.pastaSerie).fatos);

    const previa = await lixeira.preverApagarEpisodio(s.id, 1, opcoes);
    assert.deepStrictEqual({ ...previa.memoria }, { fatos: 2, encerramentos: 1, resumo: true, vazia: false });
    assert.match(previa.avisos.join(' '), /manual-1/);

    const r = await lixeira.apagarEpisodio(s.id, 1, opcoes);
    assert.strictEqual(r.memoria.guardada, true);
    assert.strictEqual(r.memoria.fatos, 2);
    assert.strictEqual(r.memoria.encerramentos, 1);
    const avisos = r.avisos.join(' ');
    assert.match(avisos, /manual-1/, 'fato sem origem: fica e avisa');
    assert.match(avisos, /Davi/, 'glossário não guarda origem: avisa');
    assert.match(avisos, /estado\.json/, 'estado consolidado até depois: avisa');

    const viva = porId(carregarMemoria(s.pastaSerie).fatos);
    assert.deepStrictEqual(Object.keys(viva).sort(), ['ep00-001', 'ep00-002', 'ep02-001', 'manual-1']);
    assert.strictEqual(viva['ep00-002'].ate, null, 'o encerramento feito pelo Ep. 1 saiu: o fato da bíblia volta a valer');
    assert.ok(!fs.existsSync(path.join(s.mem, 'resumos', 'ep01.md')));
    assert.ok(fs.existsSync(path.join(s.mem, 'resumos', 'ep02.md')), 'resumo de outro episódio fica');
    assert.ok(!fs.existsSync(path.join(s.mem, 'propostas', 'ep01.json')));
    assert.ok(fs.existsSync(path.join(s.mem, 'estado.json')));

    // guardado junto, na pasta da lixeira do episódio
    const guarda = path.join(raiz, r.lixeira, 'memoria');
    assert.strictEqual(ler(path.join(guarda, 'resumos', 'ep01.md')), '# Ep. 1\n\nMara acende o farol.\n');
    assert.strictEqual(ler(path.join(guarda, 'fatos.jsonl')).trim().split('\n').length, 4);
    assert.strictEqual(lerJ(path.join(guarda, 'manifesto.json')).ep, 'ep01');
    assert.strictEqual(lerJ(path.join(raiz, r.lixeira, 'motivo.json')).memoria.fatos, 2);

    const volta = await lixeira.restaurarDaLixeira(r.item, opcoes);
    assert.strictEqual(volta.memoria.devolvida, true);
    assert.deepStrictEqual(porId(carregarMemoria(s.pastaSerie).fatos), antesMem, 'a memória colapsada é a mesma de antes');
    assert.ok(fs.existsSync(path.join(s.mem, 'resumos', 'ep01.md')));
    assert.ok(fs.existsSync(path.join(s.mem, 'propostas', 'ep01.json')));
    assert.ok(!fs.existsSync(path.join(raiz, r.lixeira)), 'o item some da lixeira');
});

test('memória: restaurar da lixeira não mistura com memória nova do mesmo episódio (vai para historico/)', async () => {
    const s = await montarSerie('Memoria Conflito');
    montarMemoria(s.mem);
    const r = await lixeira.apagarEpisodio(s.id, 1, opcoes);
    fs.appendFileSync(path.join(s.mem, 'fatos.jsonl'), `${JSON.stringify({ id: 'ep01-001', tipo: 'evento', texto: 'Fato novo do Ep. 1.', desde: 'ep01', ate: null })}\n`);
    const volta = await lixeira.restaurarDaLixeira(r.item, opcoes);
    assert.strictEqual(volta.ok, true, 'o episódio volta mesmo assim');
    assert.strictEqual(volta.memoria.devolvida, false);
    assert.match(volta.avisos.join(' '), /não misturei/);
    assert.match(volta.memoria.historico, /^memoria\/historico\/ep01-nao-devolvida-/);
    assert.ok(fs.existsSync(path.join(s.pastaSerie, volta.memoria.historico, 'resumos', 'ep01.md')), 'a memória antiga ficou guardada');
    assert.strictEqual(porId(carregarMemoria(s.pastaSerie).fatos)['ep01-001'].texto, 'Fato novo do Ep. 1.', 'a viva não mudou');
    assert.ok(!fs.existsSync(path.join(raiz, r.lixeira)));
});

test('memória: refazer o roteiro guarda a memória na versão; voltar à versão troca as memórias', async () => {
    const s = await montarSerie('Memoria Versao');
    montarMemoria(s.mem);
    const antesMem = porId(carregarMemoria(s.pastaSerie).fatos);

    const previa = await lixeira.preverRefazerRoteiro(s.id, 1, {}, opcoes);
    assert.strictEqual(previa.memoria.fatos, 2);
    const r1 = await lixeira.refazerRoteiro(s.id, 1, {}, opcoes);
    assert.strictEqual(r1.memoria.guardada, true);
    const v1 = path.join(raiz, r1.versao);
    assert.ok(fs.existsSync(path.join(v1, 'memoria', 'fatos.jsonl')));
    assert.ok(fs.existsSync(path.join(v1, 'memoria', 'resumos', 'ep01.md')));
    assert.strictEqual(lerJ(path.join(v1, 'motivo.json')).memoria.fatos, 2);
    assert.ok(!('ep01-001' in porId(carregarMemoria(s.pastaSerie).fatos)));

    // roteiro novo consolidado: memória nova do Ep. 1 (mesmos ids, outro texto)
    await episodios.salvarRoteiro(s.id, 1, roteiro('Novo'), opcoes);
    fs.appendFileSync(path.join(s.mem, 'fatos.jsonl'), `${JSON.stringify({ id: 'ep01-001', tipo: 'evento', texto: 'Mara foge de barco.', fonte: 'ep01', desde: 'ep01', ate: null })}\n`);
    escrever(path.join(s.mem, 'resumos', 'ep01.md'), '# Ep. 1\n\nMara foge.\n');

    const lista = await lixeira.listarVersoesRoteiro(s.id, 1, opcoes);
    assert.strictEqual(lista.versoes[0].memoria.fatos, 2);
    assert.strictEqual(lista.versoes[0].memoria.resumo, true);
    assert.strictEqual(lista.episodio.memoriaAtual.fatos, 1, 'a tela mostra o que vai junto do roteiro atual');
    assert.strictEqual(lista.episodio.memoriaAtual.resumo, true);

    const r = await lixeira.restaurarVersaoRoteiro(s.id, 1, path.basename(r1.versao), opcoes);
    assert.strictEqual(r.memoria.devolvida.devolvida, true);
    assert.strictEqual(r.memoria.guardada.guardada, true);
    assert.strictEqual(r.memoria.guardada.fatos, 1);
    assert.deepStrictEqual(porId(carregarMemoria(s.pastaSerie).fatos), antesMem, 'a memória do roteiro antigo voltou igual');
    assert.match(ler(path.join(s.mem, 'resumos', 'ep01.md')), /acende o farol/);
    // a memória do roteiro que estava valendo foi junto para a versão guardada
    const g = path.join(raiz, r.guardada, 'memoria');
    assert.match(ler(path.join(g, 'fatos.jsonl')), /foge de barco/);
    assert.match(ler(path.join(g, 'resumos', 'ep01.md')), /Mara foge/);
    // outros episódios intactos
    assert.ok(fs.existsSync(path.join(s.mem, 'resumos', 'ep02.md')));
    assert.ok('ep02-001' in porId(carregarMemoria(s.pastaSerie).fatos));
});

test('memória vazia: refazer e apagar não criam pasta memoria/ e não avisam à toa', async () => {
    const s = await montarSerie('Sem Memoria');
    const r1 = await lixeira.refazerRoteiro(s.id, 1, {}, opcoes);
    assert.strictEqual(r1.memoria.guardada, false);
    assert.ok(!fs.existsSync(path.join(raiz, r1.versao, 'memoria')));
    assert.deepStrictEqual(r1.avisos, []);
    const r = await lixeira.apagarEpisodio(s.id, 2, opcoes);
    assert.strictEqual(r.memoria.guardada, false);
    assert.ok(!fs.existsSync(path.join(raiz, r.lixeira, 'memoria')));
});

// ---------------------------------------------------------------- controllers (padrão { Error })
test('controllers: ListarVersoesRoteiro e RestaurarVersaoRoteiro', async () => {
    const app = express();
    app.use(express.json());
    app.post('/RestaurarVersaoRoteiro', require('../src/controllers/RestaurarVersaoRoteiro').REST);
    app.get('/ListarVersoesRoteiro', require('../src/controllers/ListarVersoesRoteiro').REST);
    const servidor = app.listen(0, '127.0.0.1');
    await new Promise((r) => servidor.once('listening', r));
    const base = `http://127.0.0.1:${servidor.address().port}`;
    const post = async (rota, corpo) => {
        const r = await fetch(`${base}/${rota}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
        return { status: r.status, json: await r.json() };
    };
    try {
        const s = await montarSerie('Versoes Controllers');
        const r1 = await lixeira.refazerRoteiro(s.id, 1, {}, opcoes);
        await episodios.salvarRoteiro(s.id, 1, roteiro('Novo'), opcoes);

        let r = await fetch(`${base}/ListarVersoesRoteiro?serie=${s.id}`);
        assert.strictEqual(r.status, 400);
        assert.match((await r.json()).Error, /episódio/);
        r = await fetch(`${base}/ListarVersoesRoteiro?serie=${s.id}&ep=1`);
        const j = await r.json();
        assert.strictEqual(j.versoes.length, 1);
        assert.strictEqual(j.versoes[0].titulo, 'Primeiro');

        let p = await post('RestaurarVersaoRoteiro', { serie: s.id, ep: 1 });
        assert.strictEqual(p.status, 400);
        assert.match(p.json.Error, /versao/);
        p = await post('RestaurarVersaoRoteiro', { serie: s.id, ep: 1, versao: '../../x' });
        assert.strictEqual(p.status, 400);

        const jobs = lerJ(path.join(s.pastaSerie, 'jobs.json'));
        jobs.jobs.push({ jobId: 'job-9', status: 'enviando', ep: 1, destino: 'episodios/ep01/takes/p09/take_01.mp4' });
        escrever(path.join(s.pastaSerie, 'jobs.json'), jobs);
        p = await post('RestaurarVersaoRoteiro', { serie: s.id, ep: 1, versao: j.versoes[0].versao });
        assert.strictEqual(p.status, 409);
        assert.ok(Array.isArray(p.json.erros));
        jobs.jobs.pop();
        escrever(path.join(s.pastaSerie, 'jobs.json'), jobs);

        p = await post('RestaurarVersaoRoteiro', { serie: s.id, ep: 'ep01', versao: path.basename(r1.versao) });
        assert.strictEqual(p.status, 200);
        assert.strictEqual(p.json.restaurada, path.basename(r1.versao));
        assert.ok(p.json.guardada);
        assert.strictEqual(p.json.episodio.titulo, 'Primeiro');
    } finally {
        servidor.close();
    }
});
