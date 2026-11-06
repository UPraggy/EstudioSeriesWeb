// DO ROTEIRO AO VÍDEO (06/11/2026): duração do episódio editável (+ revisão com a duração nova), falas regeradas com a
// voz nova sem perder a edição, estado das etapas, decupagem salva e o LOTE "Gerar vídeo dos N planos" no modo
// SIMULADO (sem rede, sem custo; token obrigatório; teto conferido pela soma antes do primeiro job).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const express = require('express');

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), 'estudio-producao-'));
process.env.ESTUDIO_DADOS = DADOS;
process.env.ESTUDIO_SIMULADO = '1';

const E = require('../src/edicao/edicao');
const P = require('../src/edicao/producao');
const T = require('../src/edicao/trecho');
const V = require('../src/audio/vozesFalas');
const episodios = require('../src/series/episodios');
const { prepararEtapa } = require('../src/showrunner/etapas');
const { normalizarPalavra } = require('../src/audio/parametros');

const SERIE = 'farol-producao';
const PASTA = path.join(DADOS, 'series', SERIE);
const DOCS = path.join(__dirname, '..', '..', 'docs', 'exemplos');

let servidor;
let base;
test.before(async () => {
    const app = express();
    app.use(express.json({ limit: '100mb' }));
    for (const nome of ['AlterarDuracaoEpisodio', 'ConferirVozesFalas', 'RegerarFalasVoz', 'EstadoProducao', 'SalvarDecupagem', 'CotarVideoPlanos', 'GerarVideoPlanos']) {
        app.post(`/${nome}`, require(`../src/controllers/${nome}`).REST);
    }
    for (const nome of ['ConferirVozesFalas', 'EstadoProducao']) app.get(`/${nome}`, require(`../src/controllers/${nome}`).REST);
    servidor = app.listen(0, '127.0.0.1');
    await new Promise((r) => servidor.once('listening', r));
    base = `http://127.0.0.1:${servidor.address().port}`;
});
test.after(() => {
    servidor.close();
    fs.rmSync(DADOS, { recursive: true, force: true });
});

async function post(rota, corpo) {
    const r = await fetch(`${base}/${rota}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    return { status: r.status, json: await r.json() };
}

// ---------- ajudantes ----------
function wavSeno(arquivo, segundos, freq = 220) {
    const n = Math.round(segundos * 44100);
    const b = Buffer.alloc(44 + n * 2);
    b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12);
    b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(44100, 24);
    b.writeUInt32LE(88200, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
    for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin((2 * Math.PI * freq * i) / 44100) * 9000), 44 + i * 2);
    fs.mkdirSync(path.dirname(arquivo), { recursive: true });
    fs.writeFileSync(arquivo, b);
}
const gravar = (rel, obj) => {
    const a = path.join(PASTA, rel);
    fs.mkdirSync(path.dirname(a), { recursive: true });
    fs.writeFileSync(a, JSON.stringify(obj, null, 2));
};
const ler = (rel) => JSON.parse(fs.readFileSync(path.join(PASTA, rel), 'utf8'));

function falaFalsa(id, plano, quem, voz, tom, texto, duracaoS) {
    const palavras = texto.split(' ').map((p, i) => ({ p: normalizarPalavra(p), t: Math.round((0.05 + i * 0.4) * 1000) / 1000 }));
    return {
        id, plano, ordem: plano, quem, via: quem === 'narrador' ? 'narracao' : 'radio', voz, intencao: 'neutra', textoExibido: texto, textoFalado: texto,
        frases: [{ texto, textoFalado: texto, pausaDepoisS: 0 }], tom, velocidade: '+0%', volume: 1,
        pausa: { antesS: 0.3, depoisS: 0.3, entreFrasesS: 0.35 }, filtro: '', duracaoS, palavras, arquivo: `episodios/ep01/audio/${id}.wav`, status: 'pronta',
    };
}

function motorFalso(segundosPorPalavra = 0.5) {
    const pedidos = [];
    const executor = async (pedido) => {
        pedidos.push(pedido);
        return {
            ok: true,
            itens: pedido.itens.map((it) => {
                let t = 0;
                const palavras = [];
                it.frases.forEach((fr) => {
                    fr.texto.split(' ').forEach((w) => { palavras.push({ p: normalizarPalavra(w), t: Math.round((t + 0.05) * 1000) / 1000 }); t += segundosPorPalavra; });
                    t += fr.pausa_depois || 0;
                });
                wavSeno(it.saida, t, 180);
                return { ok: true, arquivo: it.saida, duracao: t, voz: it.voz, texto_falado: null, palavras, frases: [], estimado: false };
            }),
        };
    };
    return { executor, pedidos };
}

async function esperar(fn, ms = 60000) {
    const fim = Date.now() + ms;
    for (;;) {
        const r = await fn();
        if (r) return r;
        if (Date.now() > fim) throw new Error('tempo esgotado');
        await new Promise((r2) => setTimeout(r2, 150));
    }
}

let preparado = false;
async function prepararSerie() {
    if (preparado) return;
    preparado = true;
    gravar('serie.json', {
        versao: 1, id: SERIE, titulo: 'Farol Produção', genero: 'Sobrevivência', idioma: 'pt-BR', etapa: 'roteiro', criadaEm: '2026-11-06T10:00:00Z', formato: { largura: 1080, altura: 1920 }, duracaoAlvoS: 60,
        orcamento: { tetoPlanoUsd: 1, tetoEpisodioUsd: 4, tetoSerieUsd: 40 },
        modelos: { videoFinal: 'google/veo-3.1-lite', videoRascunho: 'bytedance/seedance-1-5-pro' },
        vozes: { narrador: 'de-DE-FlorianMultilingualNeural' },
        episodios: [{ n: 1, id: 'ep01', titulo: 'A luz', status: 'roteiro', duracaoAlvoS: 12, semEscolha: true }],
    });
    gravar('elenco/mara/ficha.json', { versao: 1, id: 'mara', tipo: 'personagem', nome: 'Mara', voz: 'pt-BR-ThalitaMultilingualNeural', tom: '+0Hz', estados: [] });
    // a voz do Davi foi trocada na ficha (Cadu → Remy) DEPOIS de as falas serem geradas
    gravar('elenco/davi/ficha.json', { versao: 1, id: 'davi', tipo: 'personagem', nome: 'Davi', voz: 'fr-FR-RemyMultilingualNeural', tom: '+0Hz', estados: [] });
    const tempos = [[0, 4], [4, 8], [8, 12]];
    gravar('episodios/ep01/roteiro.json', {
        versao: 1, n: 1, titulo: 'A luz', duracaoAlvoS: 12, aprovado: true, escolhas: null, cta: '',
        planos: tempos.map(([de, ate], i) => ({
            n: i + 1, deS: de, ateS: ate, tipo: 'video_ia', local: 'farol', elenco: i === 1 ? ['mara'] : [], objetos: [], visual: `Plano ${i + 1} no farol.`, tela: '',
            falas: [{ quem: ['narrador', 'davi', 'mara'][i], texto: 'Uma fala curta e clara.', via: i === 1 ? 'radio' : 'narracao' }],
        })),
    });
    const falas = [
        falaFalsa('p01-f01', 1, 'narrador', 'de-DE-FlorianMultilingualNeural', '-4Hz', 'Uma fala curta e clara.', 2.0),
        falaFalsa('p02-f01', 2, 'davi', 'piper:pt_BR-cadu-medium', '+0st', 'Mara, você me ouve?', 1.6),
        falaFalsa('p03-f01', 3, 'mara', 'pt-BR-ThalitaMultilingualNeural', '+0Hz', 'Estou aqui.', 1.2),
    ];
    for (const f of falas) wavSeno(path.join(PASTA, f.arquivo), f.duracaoS);
    gravar('episodios/ep01/falas.json', { versao: 1, falas });
    await E.edicaoInicial(SERIE, 1, {});
}

// ---------- 1. duração do episódio ----------
test('AlterarDuracaoEpisodio: grava a duração nova, liga a votação ao passar de 20 s e avisa que o roteiro precisa de ajuste', async () => {
    await prepararSerie();
    const r = await post('AlterarDuracaoEpisodio', { serie: SERIE, ep: 1, duracaoAlvoS: 30 });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(r.json.episodio.duracaoAlvoS, 30);
    assert.strictEqual(r.json.episodio.semEscolha, false, 'era curto (sem votação automática); com 30 s volta a ter A/B');
    assert.deepStrictEqual(r.json.antes, { duracaoAlvoS: 12, semEscolha: true });
    assert.strictEqual(r.json.precisaAjustar, true);
    assert.strictEqual(r.json.roteiro.duracaoPlanosS, 12);
    assert.strictEqual(ler('serie.json').episodios[0].duracaoAlvoS, 30);
    assert.strictEqual(ler('episodios/ep01/roteiro.json').duracaoAlvoS, 12, 'o roteiro não é mexido');
    const sem = await post('AlterarDuracaoEpisodio', { serie: SERIE, ep: 1, duracaoAlvoS: 30, semEscolha: true });
    assert.strictEqual(sem.json.episodio.semEscolha, true, 'semEscolha explícito vence');
    assert.strictEqual((await post('AlterarDuracaoEpisodio', { serie: SERIE, ep: 1, duracaoAlvoS: 0 })).status, 400);
    assert.strictEqual((await post('AlterarDuracaoEpisodio', { serie: SERIE, ep: 1, duracaoAlvoS: 700 })).status, 400);
    assert.strictEqual((await post('AlterarDuracaoEpisodio', { serie: SERIE, ep: 9, duracaoAlvoS: 20 })).status, 404);
    // volta ao estado do resto dos testes
    await episodios.alterarDuracao(SERIE, 1, { duracaoAlvoS: 12, semEscolha: true });
});

test('revisão do roteiro usa a duração NOVA do episódio e pede para acrescentar cenas', async () => {
    const pasta = path.join(DADOS, 'series', 'o-ultimo-farol');
    fs.cpSync(path.join(DOCS, 'o-ultimo-farol'), pasta, { recursive: true });
    const roteiro = JSON.parse(fs.readFileSync(path.join(DOCS, 'farol-ep01-roteiro.json'), 'utf8'));
    fs.mkdirSync(path.join(pasta, 'episodios', 'ep01'), { recursive: true });
    fs.writeFileSync(path.join(pasta, 'episodios', 'ep01', 'roteiro.json'), JSON.stringify(roteiro));
    await episodios.alterarDuracao('o-ultimo-farol', 1, { duracaoAlvoS: 90 });
    const { prep } = await prepararEtapa('roteiro', { ep: 1, pasta, ajustes: 'Reescreva para 90 segundos mantendo a história.' });
    assert.deepStrictEqual(prep.erros || [], []);
    assert.strictEqual(prep.ctxValidacao.duracaoAlvoS, 90, 'validação com a duração nova');
    assert.match(prep.usuario, /DURAÇÃO NOVA: o roteiro atual foi escrito para 60 s/);
    assert.match(prep.usuario, /agora tem 90 s/);
    assert.match(prep.usuario, /acrescente cenas de introdução e desenvolvimento/);
    assert.match(prep.usuario, /"duracaoAlvoS":90/, 'a base vai com a duração nova');
    // pedido explícito na tela ainda vence (contexto.duracaoAlvoS)
    const { prep: p2 } = await prepararEtapa('roteiro', { ep: 1, pasta, duracaoAlvoS: 45, ajustes: 'Mais curto.' });
    assert.strictEqual(p2.ctxValidacao.duracaoAlvoS, 45);
    assert.match(p2.usuario, /corte ou junte planos/);
});

// ---------- 2. voz mudou ----------
test('ConferirVozesFalas: acha a fala do Davi com a voz antiga (Cadu → Remy) e nada mais', async () => {
    await prepararSerie();
    const r = await post('ConferirVozesFalas', { serie: SERIE, ep: 1 });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(r.json.fonte, 'edicao');
    assert.strictEqual(r.json.mudancas.length, 1, JSON.stringify(r.json.mudancas));
    const m = r.json.mudancas[0];
    assert.deepStrictEqual([m.quem, m.nome, m.nomeVozAntes, m.nomeVozAgora, m.mudouVoz, m.falas.length], ['davi', 'Davi', 'Cadu', 'Remy', true, 1]);
});

// ---------- 3. estado + decupagem + lote de vídeo ----------
test('EstadoProducao: roteiro aprovado, falas prontas, sem decupagem e 0 de 3 vídeos', async () => {
    await prepararSerie();
    const r = await post('EstadoProducao', { serie: SERIE, ep: 1 });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    const e = r.json;
    assert.strictEqual(e.roteiro.aprovado, true);
    assert.deepStrictEqual([e.falas.total, e.falas.prontas], [3, 3]);
    assert.strictEqual(e.falas.vozesMudaram.length, 1);
    assert.deepStrictEqual([e.decupagem.existe, e.decupagem.decupados, e.decupagem.total], [false, 0, 3]);
    assert.deepStrictEqual([e.videos.prontos, e.videos.total], [0, 3]);
    assert.strictEqual(e.render.status, 'nenhum');
    assert.strictEqual(e.modelos.videoFinal, 'google/veo-3.1-lite');
});

test('SalvarDecupagem: grava planos.json e leva o prompt para a edição sem mexer nos tempos', async () => {
    await prepararSerie();
    const antes = await E.lerEdicao(SERIE, 1);
    const decupagem = { planos: [1, 2, 3].map((n) => ({ n, tipo: 'video_ia', duracaoS: 4, prompt: `Wide shot ${n}, lighthouse at dusk, cinematic.`, ancoras: ['farol'], modelo: 'google/veo-3.1-lite', resolucao: '720p', audio: false, quadroChave: null })) };
    const r = await post('SalvarDecupagem', { serie: SERIE, ep: 1, decupagem });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(ler('episodios/ep01/planos.json').planos.length, 3);
    const depois = await E.lerEdicao(SERIE, 1);
    assert.match(depois.planos[0].prompt, /Wide shot 1/);
    assert.deepStrictEqual(depois.planos.map((p) => [p.deS, p.ateS]), antes.planos.map((p) => [p.deS, p.ateS]));
    const ruim = await post('SalvarDecupagem', { serie: SERIE, ep: 1, decupagem: { planos: [{ n: 1, tipo: 'video_ia', duracaoS: 40 }] } });
    assert.strictEqual(ruim.status, 400, 'planos.json inválido não grava');
});

test('duração pedida do plano inteiro: menor aceita ≥ plano; acima do máximo, segura o último quadro', () => {
    const veo = { supported_durations: [8, 4, 6] };
    assert.deepStrictEqual(P.duracaoDoPlano(veo, 3.2), { duracaoPedidaS: 4, ajuste: 'aparar', curto: false });
    assert.deepStrictEqual(P.duracaoDoPlano(veo, 6), { duracaoPedidaS: 6, ajuste: 'exato', curto: false });
    assert.deepStrictEqual(P.duracaoDoPlano(veo, 9.4), { duracaoPedidaS: 8, ajuste: 'segurar', curto: true });
});

test('lote de vídeo (simulado): UMA cotação, token obrigatório, teto pela soma, takes na edição e no planos.json', async () => {
    await prepararSerie();
    const cot = await post('CotarVideoPlanos', { serie: SERIE, ep: 1 });
    assert.strictEqual(cot.status, 200, JSON.stringify(cot.json));
    const c = cot.json;
    assert.strictEqual(c.cotacoes.length, 3, 'os 3 planos sem vídeo');
    assert.ok(c.simulado);
    assert.ok(c.cotacoes.every((x) => x.token && x.custoPrevistoUsd > 0 && x.modelo === 'google/veo-3.1-lite' && x.lote));
    assert.ok(c.cotacoes.every((x) => x.duracaoPedidaS >= x.duracaoS && [4, 6, 8].includes(x.duracaoPedidaS)), 'menor duração aceita ≥ plano');
    assert.ok(Math.abs(c.totalUsd - c.cotacoes.reduce((s, x) => s + x.custoPrevistoUsd, 0)) < 1e-6);
    assert.strictEqual(c.teto.passa, null);
    assert.match(c.cotacoes[0].prompt, /Wide shot 1/, 'prompt da decupagem');

    // sem token: nada é gerado
    const semToken = await post('GerarVideoPlanos', { serie: SERIE, ep: 1, confirmacoes: c.cotacoes.map((x) => ({ id: x.id })) });
    assert.strictEqual(semToken.status, 400);
    // teto do episódio menor que a SOMA (cada plano cabe sozinho): recusa antes do primeiro job
    const s = ler('serie.json');
    gravar('serie.json', { ...s, orcamento: { ...s.orcamento, tetoEpisodioUsd: c.totalUsd - c.cotacoes[0].custoPrevistoUsd / 2 } });
    const teto = await post('GerarVideoPlanos', { serie: SERIE, ep: 1, confirmacoes: c.cotacoes.map((x) => ({ id: x.id, token: x.token })) });
    assert.strictEqual(teto.status, 409, JSON.stringify(teto.json));
    assert.match(teto.json.Error, /Nada foi gerado/);
    assert.ok(!(await E.lerMesa(SERIE, 1)).regeracoes.some((r) => r.status === 'gerando'));
    gravar('serie.json', s);

    const g = await post('GerarVideoPlanos', { serie: SERIE, ep: 1, confirmacoes: c.cotacoes.map((x) => ({ id: x.id, token: x.token })) });
    assert.strictEqual(g.status, 200, JSON.stringify(g.json));
    assert.strictEqual(g.json.regeracoes.length, 3);
    await esperar(async () => {
        const st = await T.statusRegeracoes(SERIE, 1);
        const meus = st.regeracoes.filter((r) => c.cotacoes.some((x) => x.id === r.id));
        const falhou = meus.find((r) => r.status === 'falhou');
        if (falhou) throw new Error(falhou.erro);
        return meus.every((r) => r.status === 'pronto');
    });
    const ed = await E.lerEdicao(SERIE, 1);
    for (const p of ed.planos) {
        const seg = ed.faixas.video.find((v) => v.plano === p.n && v.origem === 'take');
        assert.ok(seg && fs.existsSync(path.join(PASTA, seg.arquivo)), `plano ${p.n} com take na edição`);
        assert.ok(Math.abs(seg.duracaoS - (p.ateS - p.deS)) < 0.01, 'cobre o plano inteiro');
    }
    const planos = ler('episodios/ep01/planos.json').planos;
    for (const p of planos) {
        assert.ok(p.takeEscolhido, `plano ${p.n} com take escolhido`);
        const t = p.takes.find((x) => x.id === p.takeEscolhido);
        assert.ok(t && t.status === 'pronto' && t.caminho.startsWith('takes/'), 'caminho relativo ao episódio');
    }
    const e = await P.estadoProducao(SERIE, 1);
    assert.deepStrictEqual([e.videos.prontos, e.videos.total], [3, 3]);
    // tudo pronto: cotar de novo sem escolher planos não tem o que gerar; escolhendo, regera aquele
    assert.strictEqual((await post('CotarVideoPlanos', { serie: SERIE, ep: 1 })).status, 400);
    const um = await post('CotarVideoPlanos', { serie: SERIE, ep: 1, planos: [2] });
    assert.strictEqual(um.json.cotacoes.length, 1);
    assert.ok(um.json.cotacoes[0].avisos.some((a) => /já tem um take/.test(a)));
});

test('RegerarFalasVoz: só as falas do Davi, com a voz nova; vídeo e takes ficam; dá para desfazer', async () => {
    await prepararSerie();
    const antes = await E.lerEdicao(SERIE, 1);
    const m = motorFalso(0.5);
    const r = await V.regerarFalasVoz({ serie: SERIE, ep: 1, quem: 'davi', executor: m.executor });
    assert.strictEqual(r.modo, 'edicao');
    assert.strictEqual(m.pedidos.length, 1);
    assert.deepStrictEqual(m.pedidos[0].itens.map((i) => i.voz), ['fr-FR-RemyMultilingualNeural']);
    assert.strictEqual(r.regeradas.length, 1);
    const davi = r.edicao.faixas.falas.find((f) => f.quem === 'davi');
    assert.strictEqual(davi.voz, 'fr-FR-RemyMultilingualNeural');
    assert.strictEqual(davi.vozAnterior, 'piper:pt_BR-cadu-medium');
    assert.ok(fs.existsSync(path.join(PASTA, davi.arquivo)));
    assert.deepStrictEqual(r.edicao.faixas.video, antes.faixas.video.map((v) => ({ ...v })), 'vídeo intocado');
    const mara = r.edicao.faixas.falas.find((f) => f.quem === 'mara');
    assert.strictEqual(mara.arquivo, antes.faixas.falas.find((f) => f.quem === 'mara').arquivo, 'a Mara não foi regerada');
    assert.strictEqual(ler('episodios/ep01/falas.json').falas.find((f) => f.id === 'p02-f01').voz, 'fr-FR-RemyMultilingualNeural', 'falas.json acompanha');
    assert.strictEqual((await V.conferirVozes(SERIE, 1)).mudancas.length, 0, 'nada mais com voz antiga');
    assert.ok(r.historico.podeDesfazer);
    const d = await E.desfazerEdicao(SERIE, 1);
    assert.strictEqual(d.edicao.faixas.falas.find((f) => f.quem === 'davi').voz, 'piper:pt_BR-cadu-medium', 'Ctrl+Z volta a voz antiga');
    await E.refazerEdicao(SERIE, 1);
});

test('tom ajustado à mão não conta como "voz mudou"; série que fixa a voz vence a ficha (aviso)', async () => {
    await prepararSerie();
    await E.atualizarEdicao(SERIE, 1, (d) => {
        const mara = d.faixas.falas.find((f) => f.quem === 'mara');
        mara.tom = '+12Hz';
        mara.ajusteManual = { tom: '+12Hz' };
        return d;
    });
    assert.strictEqual((await V.conferirVozes(SERIE, 1)).mudancas.length, 0);
    const s = ler('serie.json');
    gravar('serie.json', { ...s, vozes: { ...s.vozes, davi: 'piper:pt_BR-cadu-medium' } });
    const r = await V.conferirVozes(SERIE, 1);
    assert.ok(r.erros.some((e) => /a série fixa Cadu/.test(e)), JSON.stringify(r.erros));
    assert.strictEqual(r.mudancas[0].nomeVozAgora, 'Cadu', 'vale a voz da série');
    gravar('serie.json', s);
});

test('rotas novas recusam pedido sem série/episódio', async () => {
    for (const rota of ['EstadoProducao', 'ConferirVozesFalas', 'RegerarFalasVoz', 'CotarVideoPlanos', 'GerarVideoPlanos', 'SalvarDecupagem', 'AlterarDuracaoEpisodio']) {
        const r = await post(rota, {});
        assert.strictEqual(r.status, 400, rota);
        assert.ok(r.json.Error, rota);
    }
});


test('atualizarEdicao: duas gravações do servidor ao mesmo tempo não se perdem (relê e aplica de novo no 409)', async () => {
    await prepararSerie();
    const marcar = (k) => (d) => { d.marcas = [...(d.marcas || []), k]; return d; };
    await Promise.all([1, 2, 3, 4].map((k) => E.atualizarEdicao(SERIE, 1, marcar(k))));
    const d = await E.lerEdicao(SERIE, 1);
    assert.deepStrictEqual([...d.marcas].sort(), [1, 2, 3, 4]);
});
