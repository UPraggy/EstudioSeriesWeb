// Falas do episódio com um motor FALSO (sem rede): roteiro → falas.json, cache por hash, linha do tempo,
// recusa de voz fora da lista e os controllers do módulo de áudio.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), 'estudio-falas-'));
process.env.ESTUDIO_DADOS = DADOS;

const express = require('express');
const F = require('../src/audio/falas');
const cfg = require('../src/audio/config');
const { normalizarPalavra } = require('../src/audio/parametros');

test.after(() => fs.rmSync(DADOS, { recursive: true, force: true }));

// wav mono 16 bits 44,1 kHz de silêncio
function wavSilencio(arquivo, segundos) {
    const n = Math.round(segundos * 44100);
    const b = Buffer.alloc(44 + n * 2);
    b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12);
    b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(44100, 24);
    b.writeUInt32LE(88200, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
    fs.mkdirSync(path.dirname(arquivo), { recursive: true });
    fs.writeFileSync(arquivo, b);
}

// motor falso: 0,4 s por palavra + pausas, palavras com tempo; registra os pedidos
function motorFalso() {
    const pedidos = [];
    const executor = async (pedido) => {
        pedidos.push(pedido);
        return {
            ok: true,
            itens: pedido.itens.map((it) => {
                let t = 0;
                const palavras = [];
                it.frases.forEach((fr, k) => {
                    fr.texto.split(' ').forEach((w) => { palavras.push({ p: normalizarPalavra(w), t: Math.round((t + 0.05) * 1000) / 1000, frase: k }); t += 0.4; });
                    t += fr.pausa_depois || 0;
                });
                wavSilencio(it.saida, t);
                // o motor real devolve o texto com o dicionário aplicado; o falso não sabe, então não devolve
                return { ok: true, arquivo: it.saida, duracao: t, voz: it.voz, texto_falado: null, palavras, frases: [], estimado: it.voz.startsWith('piper:') };
            }),
        };
    };
    return { executor, pedidos };
}

function criarSerie(id, roteiro, extra = {}) {
    const pasta = path.join(DADOS, 'series', id);
    cfg.gravarJson(path.join(pasta, 'serie.json'), {
        versao: 1, id, titulo: 'O Último Farol', genero: 'Sobrevivência · apocalipse zumbi',
        vozes: { narrador: 'de-DE-FlorianMultilingualNeural', mara: 'pt-BR-ThalitaMultilingualNeural', davi: 'piper:pt_BR-cadu-medium', alerta: 'piper:pt_BR-cadu-medium' },
        tons: { alerta: '-6Hz' }, ...extra,
    });
    cfg.gravarJson(path.join(pasta, 'episodios', 'ep01', 'roteiro.json'), roteiro);
    return pasta;
}

const ROTEIRO = {
    versao: 1, n: 1, titulo: 'Sete Quilômetros', duracaoAlvoS: 20,
    planos: [
        { n: 1, deS: 0, ateS: 6, tipo: 'video_ia', falas: [{ quem: 'narrador', texto: 'Sete km de mar separam Mara do fim do mundo.', via: 'narracao' }] },
        { n: 2, deS: 6, ateS: 14, tipo: 'video_ia', falas: [
            { quem: 'alerta', texto: 'Alerta no terminal. Ataques violentos e ferimentos por mordida. Balsas suspensas. Não se aproximem dos feridos.', via: 'radio' },
            { quem: 'mara', texto: 'Davi, atende.', via: 'em_cena', intencao: 'sussurro' },
        ] },
        { n: 3, deS: 14, ateS: 20, tipo: 'video_ia', falas: [{ quem: 'davi', texto: 'Acende o farol! Agora!', via: 'radio', intencao: 'grito' }] },
    ],
};

test('roteiro → falas: ids, vozes da lista, intenção pela via, pronúncia e frases', () => {
    const falas = F.montarFalas({ roteiro: ROTEIRO, serie: { genero: 'suspense', tons: { alerta: '-6Hz' } }, vozesCfg: cfg.carregarVozes() });
    assert.deepStrictEqual(falas.map((f) => f.id), ['p01-f01', 'p02-f01', 'p02-f02', 'p03-f01']);
    const [narr, alerta, mara, davi] = falas;
    assert.strictEqual(narr.voz, 'de-DE-FlorianMultilingualNeural');
    assert.strictEqual(narr.intencao, 'narracao_suspense');
    assert.strictEqual(narr.textoExibido, 'Sete km de mar separam Mara do fim do mundo.');
    assert.strictEqual(narr.textoFalado, 'Sete quilômetros de mar separam Mára do fim do mundo.');
    assert.strictEqual(alerta.intencao, 'radio');
    // alerta = Cadu (Piper) desde 06/11/2026: o tom do papel em Hz vira semitons (-6Hz ≈ -1st) + rádio (+0)
    assert.strictEqual(alerta.motor, 'piper');
    assert.strictEqual(alerta.tom, '-1st');
    assert.match(alerta.filtro, /acrusher/);
    assert.ok(alerta.frases.length >= 2, 'fala longa dividida em frases');
    assert.strictEqual(alerta.frases.map((f) => f.texto).join(' '), alerta.textoExibido);
    assert.strictEqual(alerta.frases.at(-1).pausaDepoisS, 0);
    assert.strictEqual(mara.intencao, 'sussurro');
    assert.strictEqual(mara.volume, 0.7);
    assert.strictEqual(davi.motor, 'piper');
    assert.strictEqual(davi.intencao, 'grito_urgencia');
    assert.strictEqual(davi.volume, 1.625); // 1,3 do Cadu × 1,25 do grito (vai para o motor)
    assert.strictEqual(davi.volumeAlvo, 1.25); // alvo de loudness: só o grito (+1,9 dB), sem a compensação do Piper
    assert.match(davi.tom, /st$/);
});

test('recusa voz fora de vozes.json vinda do roteiro', () => {
    const roteiro = { planos: [{ n: 1, falas: [{ quem: 'mara', texto: 'Oi.', voz: 'pt-BR-FranciscaNeural' }] }] };
    assert.throws(() => F.montarFalas({ roteiro, vozesCfg: cfg.carregarVozes() }), /fora da lista de vozes\.json/);
});

test('linha do tempo: começa no plano, respeita pausas e avisa quando a fala passa do plano', () => {
    const p = (antesS, depoisS) => ({ antesS, depoisS, entreFrasesS: 0.3 });
    const falas = [
        { id: 'a', plano: 1, quem: 'n', duracaoS: 3, pausa: p(0.4, 0.5) },
        { id: 'b', plano: 2, quem: 'm', duracaoS: 2, pausa: p(0.3, 0.3) },
        { id: 'c', plano: 2, quem: 'd', duracaoS: 5, pausa: p(0.2, 0.2) },
    ];
    const r = F.calcularLinhaDoTempo(falas, [{ n: 1, deS: 0, ateS: 5 }, { n: 2, deS: 5, ateS: 10 }], 10);
    assert.strictEqual(falas[0].inicioS, 0.4);
    assert.strictEqual(falas[1].inicioS, 5.3);
    assert.strictEqual(falas[2].inicioS, 7.8); // 7,3 (fim de b) + 0,3 + 0,2
    assert.strictEqual(falas[2].fimS, 12.8);
    assert.strictEqual(r.avisos.length, 1);
    assert.match(r.avisos[0], /c \(d\) termina em 12\.80 s/);
    assert.strictEqual(r.duracaoS, 13);
});

test('gera falas.json do episódio e reaproveita o cache na 2ª vez', async () => {
    const pastaSerie = criarSerie('farol-teste', ROTEIRO, { pronuncia: { farol: 'faról' } });
    const m = motorFalso();
    const { arquivo, doc } = await F.gerarFalasEpisodio('farol-teste', 1, { tratar: false, executor: m.executor });
    assert.ok(fs.existsSync(arquivo));
    assert.strictEqual(m.pedidos.length, 1); // um processo para o lote todo
    assert.strictEqual(m.pedidos[0].acao, 'lote');
    assert.strictEqual(m.pedidos[0].itens.length, 4);
    assert.deepStrictEqual(m.pedidos[0].itens[0].pronuncia, { farol: 'faról' }); // dicionário da série vai para o motor
    assert.strictEqual(doc.falas[0].textoFalado, 'Sete quilômetros de mar separam Mára do fim do mundo.');
    assert.strictEqual(doc.versao, 1);
    assert.strictEqual(doc.episodio, 'ep01');
    for (const f of doc.falas) {
        assert.strictEqual(f.status, 'pronta');
        assert.ok(f.arquivo.startsWith('episodios/ep01/audio/'), f.arquivo);
        assert.ok(fs.existsSync(path.join(pastaSerie, f.arquivo)));
        assert.ok(f.palavras.length > 0);
        assert.ok(f.inicioS >= 0 && f.duracaoS > 0);
        for (const k of ['id', 'plano', 'quem', 'voz', 'intencao', 'textoExibido', 'textoFalado', 'tom', 'velocidade', 'volume', 'pausa', 'filtro']) assert.ok(k in f, k);
        assert.ok(!Object.keys(f).some((k) => k.startsWith('_')));
    }
    assert.ok(doc.falas[1].inicioS >= 6); // plano 2 começa em 6 s
    assert.ok(doc.avisos.some((a) => a.includes('depois do fim do plano'))); // alerta longo não cabe no plano 2

    const m2 = motorFalso();
    const segunda = await F.gerarFalasEpisodio('farol-teste', 'ep01', { tratar: false, executor: m2.executor });
    assert.strictEqual(m2.pedidos.length, 0);
    assert.ok(segunda.doc.falas.every((f) => f.doCache));

    // mudou o texto de UMA fala → só ela volta para o motor
    const rot = cfg.lerJson(path.join(pastaSerie, 'episodios', 'ep01', 'roteiro.json'));
    rot.planos[0].falas[0].texto = 'Sete km de mar separam Mara do resto do mundo.';
    cfg.gravarJson(path.join(pastaSerie, 'episodios', 'ep01', 'roteiro.json'), rot);
    const m3 = motorFalso();
    await F.gerarFalasEpisodio('farol-teste', 1, { tratar: false, executor: m3.executor });
    assert.strictEqual(m3.pedidos[0].itens.length, 1);
});

test('fala que falha no motor fica marcada e as outras seguem', async () => {
    criarSerie('farol-falha', ROTEIRO);
    const m = motorFalso();
    const executor = async (pedido) => {
        const r = await m.executor(pedido);
        r.itens[1] = { ok: false, erro: 'edge-tts nao devolveu audio' };
        return r;
    };
    const { doc } = await F.gerarFalasEpisodio('farol-falha', 1, { tratar: false, executor });
    assert.strictEqual(doc.falas[1].status, 'falhou');
    assert.strictEqual(doc.falas[1].arquivo, null);
    assert.strictEqual(doc.falas.filter((f) => f.status === 'pronta').length, 3);
});

test('série/episódio inválidos não saem da pasta de dados', async () => {
    await assert.rejects(F.gerarFalasEpisodio('../fora', 1, { executor: motorFalso().executor }), /Série inválida/);
    await assert.rejects(F.gerarFalasEpisodio('farol-teste', '../x', { executor: motorFalso().executor }), /Episódio inválido/);
    await assert.rejects(F.gerarFalasEpisodio('nao-existe', 1, { executor: motorFalso().executor }), /Série não encontrada/);
});

test('controllers: GerarLegendas grava SRT/ASS, IntencoesFala lista, OuvirFala recusa voz fora da lista', async () => {
    const app = express();
    app.use(express.json());
    app.post('/GerarLegendas', require('../src/controllers/GerarLegendas').REST);
    app.post('/OuvirFala', require('../src/controllers/OuvirFala').REST);
    app.post('/GerarFalas', require('../src/controllers/GerarFalas').REST);
    app.get('/IntencoesFala', require('../src/controllers/IntencoesFala').REST);
    const servidor = app.listen(0, '127.0.0.1');
    await new Promise((r) => servidor.once('listening', r));
    const url = `http://127.0.0.1:${servidor.address().port}`;
    const post = (rota, corpo) => fetch(`${url}/${rota}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) });
    const erroOriginal = console.error;
    console.error = () => {};
    try {
        criarSerie('farol-leg', ROTEIRO);
        await F.gerarFalasEpisodio('farol-leg', 1, { tratar: false, executor: motorFalso().executor });
        const r = await post('GerarLegendas', { serie: 'farol-leg', episodio: 1, modo: 'palavra' });
        const j = await r.json();
        assert.strictEqual(r.status, 200, JSON.stringify(j));
        assert.ok(j.blocos > 3);
        const pastaEp = path.join(DADOS, 'series', 'farol-leg', 'episodios', 'ep01');
        for (const nome of ['legendas.srt', 'legendas.ass', 'legendas-palavra.ass']) assert.ok(fs.existsSync(path.join(pastaEp, nome)), nome);
        assert.match(fs.readFileSync(path.join(pastaEp, 'legendas.srt'), 'utf8'), /^﻿1\n00:00:/);

        const ri = await fetch(`${url}/IntencoesFala`);
        const ji = await ri.json();
        assert.strictEqual(ji.intencoes.length, 10);
        assert.ok(ji.vozes.some((v) => v.id === 'de-DE-FlorianMultilingualNeural'));

        const ro = await post('OuvirFala', { texto: 'Oi.', voz: 'pt-BR-FranciscaNeural' });
        assert.strictEqual(ro.status, 500);
        assert.match((await ro.json()).Error, /fora da lista de vozes\.json/);

        const r400 = await post('GerarFalas', { serie: 'farol-leg' });
        assert.strictEqual(r400.status, 400);
    } finally {
        console.error = erroOriginal;
        servidor.close();
    }
});
