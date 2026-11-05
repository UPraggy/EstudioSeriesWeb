// MESA (edição): montagem "narração primeiro", desfazer/refazer no servidor, trecho (duração pedida, quadros,
// troca do segmento), regeração SIMULADA (sem rede, sem custo), regeração de fala com motor falso,
// tradução para o motor NarradorVideo, ASS e um render real pequeno com ffmpeg.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), 'estudio-mesa-'));
process.env.ESTUDIO_DADOS = DADOS;
process.env.ESTUDIO_SIMULADO = '1';

const E = require('../src/edicao/edicao');
const T = require('../src/edicao/trecho');
const R = require('../src/edicao/render');
const midia = require('../src/edicao/midia');
const { normalizarPalavra } = require('../src/audio/parametros');

test.after(() => fs.rmSync(DADOS, { recursive: true, force: true }));

const SERIE = 'farol-mesa';
const PASTA = path.join(DADOS, 'series', SERIE);

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

function mp4Teste(arquivo, segundos = 5, cor = 'testsrc') {
    fs.mkdirSync(path.dirname(arquivo), { recursive: true });
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `${cor}=size=72x128:rate=24`, '-f', 'lavfi', '-i', `sine=frequency=330:duration=${segundos}`,
        '-t', String(segundos), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', arquivo], { windowsHide: true });
}

const gravar = (rel, obj) => {
    const a = path.join(PASTA, rel);
    fs.mkdirSync(path.dirname(a), { recursive: true });
    fs.writeFileSync(a, JSON.stringify(obj, null, 2));
};

function falaFalsa(id, plano, quem, texto, duracaoS, extra = {}) {
    const palavras = texto.split(' ').map((p, i) => ({ p: normalizarPalavra(p), t: Math.round((0.05 + i * 0.4) * 1000) / 1000 }));
    return {
        id, plano, ordem: plano, quem, via: quem === 'narrador' ? 'narracao' : 'em_cena', voz: 'pt-BR-ThalitaMultilingualNeural', intencao: 'neutra',
        textoExibido: texto, textoFalado: texto, frases: [{ texto, textoFalado: texto, pausaDepoisS: 0 }], tom: '+0Hz', velocidade: '+0%', volume: 1,
        pausa: { antesS: 0.3, depoisS: 0.3, entreFrasesS: 0.35 }, filtro: '', duracaoS, palavras, arquivo: `episodios/ep01/audio/${id}.wav`,
        status: 'pronta', ...extra,
    };
}

function roteiroTeste() {
    const tempos = [[0, 4], [4, 8], [8, 12]];
    return {
        versao: 1, n: 1, titulo: 'Teste da Mesa', duracaoAlvoS: 12,
        planos: tempos.map(([de, ate], i) => ({
            n: i + 1, deS: de, ateS: ate, tipo: i === 1 ? 'apresentador' : 'video_ia', local: i === 1 ? 'biblioteca' : 'farol',
            elenco: i === 1 ? ['narrador'] : ['mara'], objetos: [], visual: i === 1 ? 'Narrador fala na poltrona.' : 'Mara olha o farol.',
            tela: ['O ÚLTIMO FAROL', '', 'CARTÕES A / B'][i],
            falas: [{ quem: i === 1 ? 'narrador' : 'mara', texto: 'Uma fala curta e clara.', via: 'em_cena' }],
        })),
        escolhas: { A: { texto: 'ACENDER', detalhe: 'guia o irmão' }, B: { texto: 'APAGAR', detalhe: 'protege a ilhota' } },
    };
}

let preparado = false;
function prepararSerie() {
    if (preparado) return;
    preparado = true;
    gravar('serie.json', {
        versao: 1, id: SERIE, titulo: 'Farol Mesa', genero: 'Sobrevivência', formato: { largura: 1080, altura: 1920 },
        orcamento: { tetoPlanoUsd: 1, tetoEpisodioUsd: 4, tetoSerieUsd: 40 },
        modelos: { videoFinal: 'google/veo-3.1-lite', videoRascunho: 'bytedance/seedance-1-5-pro' },
        vozes: { narrador: 'de-DE-FlorianMultilingualNeural', mara: 'pt-BR-ThalitaMultilingualNeural' },
    });
    gravar('episodios/ep01/roteiro.json', roteiroTeste());
    const falas = [
        falaFalsa('p01-f01', 1, 'mara', 'Uma fala curta e clara.', 2.0),
        falaFalsa('p02-f01', 2, 'narrador', 'O narrador fala um pouco mais aqui agora.', 4.6, { voz: 'de-DE-FlorianMultilingualNeural' }),
        falaFalsa('p03-f01', 3, 'mara', 'Fim.', 0.8),
    ];
    for (const f of falas) wavSeno(path.join(PASTA, f.arquivo), f.duracaoS);
    gravar('episodios/ep01/falas.json', { versao: 1, falas });
    mp4Teste(path.join(PASTA, 'acervo', 'farol_a.mp4'), 5, 'testsrc');
    mp4Teste(path.join(PASTA, 'acervo', 'narrador_b.mp4'), 5, 'smptebars');
    gravar('acervo/acervo.json', {
        versao: 1,
        clipes: [
            { arquivo: 'acervo/farol_a.mp4', duracaoS: 5, descricao: 'Mara olha o farol à noite', elenco: ['mara'], local: 'farol' },
            { arquivo: 'acervo/narrador_b.mp4', duracaoS: 5, descricao: 'Narrador fala na poltrona', elenco: ['narrador'], local: 'biblioteca', obs: 'Usar mudo' },
        ],
    });
}

// ---------- montagem (pura) ----------
test('narração primeiro: plano nunca corta fala e o total fica no alvo', () => {
    const planos = [{ n: 1, deS: 0, ateS: 5 }, { n: 2, deS: 5, ateS: 10 }, { n: 3, deS: 10, ateS: 15 }];
    const falas = new Map([[1, [{ duracaoS: 2, pausa: { antesS: 0.3, depoisS: 0.3 } }]], [2, [{ duracaoS: 7.4, pausa: { antesS: 0.3, depoisS: 0.3 } }]]]);
    const { duracoes, audio } = E.duracoesDosPlanos(planos, falas, 15);
    assert.ok(Math.abs(audio[1] - 8) < 1e-9, 'cobertura = 0,3 + 7,4 + 0,3');
    assert.ok(duracoes[1] >= 8 - 1e-9, 'o plano 2 cresce para caber a fala');
    assert.ok(Math.abs(duracoes.reduce((s, d) => s + d, 0) - 15) < 1e-6, 'as folgas dos outros planos pagam a diferença');
    duracoes.forEach((d, i) => assert.ok(d >= audio[i] - 1e-9));
    assert.strictEqual(E.coberturaDoPlano([]), 0);
});

test('montarEdicao: episódio sem votação ("escolhas": null) não ganha cartões A/B', () => {
    const roteiro = { ...roteiroTeste(), escolhas: null, cta: '' };
    roteiro.planos = roteiro.planos.map((p) => ({ ...p, tela: /CART/i.test(p.tela || '') ? '' : p.tela }));
    const doc = E.montarEdicao({ roteiro, falas: [], acervo: { clipes: [] }, serie: {}, serieId: SERIE, epId: 'ep99' });
    assert.deepStrictEqual(doc.faixas.ab, []);
});

test('montarEdicao: falas nos tempos reais, vídeo do acervo cobrindo cada plano, texto, A/B e legenda', () => {
    const roteiro = roteiroTeste();
    const falas = [
        falaFalsa('p01-f01', 1, 'mara', 'Uma fala curta e clara.', 2.0),
        falaFalsa('p02-f01', 2, 'narrador', 'O narrador fala bem mais tempo do que o plano tinha.', 6.0),
        falaFalsa('p03-f01', 3, 'mara', 'Fim.', 0.8),
    ];
    const acervo = { clipes: [
        { arquivo: 'acervo/farol_a.mp4', duracaoS: 5, descricao: 'Mara olha o farol', elenco: ['mara'], local: 'farol' },
        { arquivo: 'acervo/narrador_b.mp4', duracaoS: 5, descricao: 'Narrador fala', elenco: ['narrador'], local: 'biblioteca', obs: 'Usar mudo' },
    ] };
    const doc = E.montarEdicao({ roteiro, falas, acervo, serie: { modelos: { videoFinal: 'google/veo-3.1-lite' } }, serieId: SERIE, epId: 'ep01' });
    assert.strictEqual(doc.planos.length, 3);
    assert.ok(Math.abs(doc.duracaoS - 12) < 0.05, `total ${doc.duracaoS}`);
    const p2 = doc.planos[1];
    assert.ok(p2.ateS - p2.deS >= 6.6 - 0.05, 'plano 2 cobre a fala (0,3 + 6 + 0,3)');
    const fala2 = doc.faixas.narracao.find((f) => f.fala === 'p02-f01');
    assert.ok(Math.abs(fala2.inicioS - (p2.deS + 0.3)) < 0.002, 'fala começa no plano + pausa antes');
    for (const p of doc.planos) {
        const segs = doc.faixas.video.filter((v) => v.plano === p.n);
        const coberto = segs.reduce((s, v) => s + v.duracaoS, 0);
        assert.ok(Math.abs(coberto - (p.ateS - p.deS)) < 0.05, `plano ${p.n} coberto pelo vídeo`);
        segs.forEach((v) => assert.strictEqual(v.origem, 'acervo'));
    }
    assert.strictEqual(doc.faixas.video.find((v) => v.plano === 2).arquivo, 'acervo/narrador_b.mp4', 'apresentador pega o clipe do narrador');
    assert.strictEqual(doc.faixas.video.find((v) => v.plano === 2).mudo, true, 'clipe do narrador entra mudo');
    assert.ok(doc.faixas.video.filter((v) => v.plano === 2).length >= 2, 'plano maior que o clipe recebe outro trecho');
    assert.deepStrictEqual(doc.faixas.texto.map((t) => t.texto), ['O ÚLTIMO FAROL'], '"CARTÕES A / B" não vira texto');
    assert.ok(Math.abs(doc.faixas.ab[0].inicioS - doc.planos[2].deS) < 1e-6, 'A/B começa no plano dos cartões');
    assert.strictEqual(doc.faixas.ab[0].A.texto, 'ACENDER');
    assert.ok(doc.legenda.length >= 3 && doc.legenda.every((b) => b.linhas.length && b.fim > b.ini));
    assert.deepStrictEqual(E.validarEdicao(doc), []);
});

test('fala sem áudio é estimada (2,5 palavras/s) e marcada sem_audio', () => {
    const f = E.estimarFala({ id: 'x', textoExibido: 'uma duas três quatro cinco', frases: [{ pausaDepoisS: 0 }] });
    assert.strictEqual(f.duracaoS, 2);
    assert.strictEqual(f.status, 'sem_audio');
    assert.strictEqual(f.palavras.length, 5);
});

// ---------- operações da linha do tempo ----------
function docSimples() {
    return {
        versao: 1, duracaoS: 10, fps: 24, planos: [{ n: 1, deS: 0, ateS: 6 }, { n: 2, deS: 6, ateS: 10 }],
        faixas: {
            video: [
                { id: 'v1', plano: 1, arquivo: 'acervo/a.mp4', inicioS: 0, duracaoS: 6, entradaS: 1, origem: 'acervo' },
                { id: 'v2', plano: 2, arquivo: 'acervo/b.mp4', inicioS: 6, duracaoS: 4, entradaS: 0, origem: 'acervo' },
            ],
            narracao: [], falas: [], efeitos: [], ambiente: [], texto: [], ab: [],
        },
        legenda: [],
    };
}

test('trecho: cruzar dois planos vira dois pedidos; quadro no tempo respeita a entrada do clipe', () => {
    const doc = docSimples();
    assert.deepStrictEqual(E.planosDoTrecho(doc, 5, 7.5), [{ plano: 1, deS: 5, ateS: 6 }, { plano: 2, deS: 6, ateS: 7.5 }]);
    assert.deepStrictEqual(E.planosDoTrecho(doc, 5.9, 8), [{ plano: 2, deS: 6, ateS: 8 }], 'pedaço menor que 0,25 s é ignorado');
    const q = T.quadroNoTempo(doc, 2.5);
    assert.strictEqual(q.arquivo, 'acervo/a.mp4');
    assert.strictEqual(q.tArquivo, 3.5);
});

test('duração pedida = menor aceita pelo modelo ≥ trecho; ajuste acelera ou apara', () => {
    const veo = { id: 'google/veo-3.1-lite', supported_durations: [8, 4, 6] };
    assert.strictEqual(T.duracaoPedida(veo, 2.8), 4);
    assert.strictEqual(T.duracaoPedida(veo, 4), 4);
    assert.strictEqual(T.duracaoPedida(veo, 4.2), 6);
    assert.throws(() => T.duracaoPedida(veo, 9), /máximo/);
    assert.strictEqual(T.duracaoPedida({ id: 'x' }, 2.3), 3, 'sem lista: arredonda para cima');
    assert.deepStrictEqual(T.decidirAjuste({ trechoS: 3.2, duracaoPedidaS: 4, aceitaUltimo: true }), { ajuste: 'acelerar', fator: 1.25, usarUltimo: true });
    assert.deepStrictEqual(T.decidirAjuste({ trechoS: 2.0, duracaoPedidaS: 4, aceitaUltimo: true }), { ajuste: 'aparar', fator: 2, usarUltimo: false });
    assert.deepStrictEqual(T.decidirAjuste({ trechoS: 3.2, duracaoPedidaS: 4, aceitaUltimo: false }), { ajuste: 'aparar', fator: 1.25, usarUltimo: false });
    assert.strictEqual(T.decidirAjuste({ trechoS: 4, duracaoPedidaS: 4, aceitaUltimo: true }).ajuste, 'exato');
    assert.match(T.cadeiaAjuste({ ajuste: 'acelerar', duracaoBrutaS: 4, trechoS: 3.2 }), /setpts=PTS\*0\.80000/);
    assert.match(T.cadeiaAjuste({ ajuste: 'aparar', duracaoBrutaS: 2, trechoS: 3 }), /tpad=stop_mode=clone/, 'clipe curto segura o último quadro');
    assert.strictEqual(T.proximoTake(['take_01.mp4', 'take_03.bruto.mp4'], [{ id: 'take_02' }], ['take_04']), 'take_05');
});

test('troca só o pedaço do trecho na faixa de vídeo (o resto do plano fica)', () => {
    const doc = docSimples();
    E.substituirTrechoVideo(doc, 2, 4, { id: 'novo', plano: 1, arquivo: 'episodios/ep01/takes/p01/take_01.mp4', entradaS: 0, origem: 'take' });
    const v = doc.faixas.video;
    assert.deepStrictEqual(v.map((x) => [x.inicioS, x.duracaoS, x.arquivo.split('/').pop()]), [
        [0, 2, 'a.mp4'], [2, 2, 'take_01.mp4'], [4, 2, 'a.mp4'], [6, 4, 'b.mp4'],
    ]);
    assert.strictEqual(v[2].entradaS, 5, 'o pedaço depois continua de onde estava no arquivo (1 + 4)');
    assert.strictEqual(new Set(v.map((x) => x.id)).size, v.length, 'ids únicos');
    assert.ok(Math.abs(v.reduce((s, x) => s + x.duracaoS, 0) - 10) < 1e-9, 'a duração total não muda');
});

test('linha de vídeo: buraco vira preto e sobreposição é resolvida (vence quem começa depois)', () => {
    const doc = docSimples();
    doc.faixas.video[1].inicioS = 7; // buraco de 6 a 7
    doc.faixas.video.push({ id: 'v3', arquivo: 'acervo/c.mp4', inicioS: 4, duracaoS: 1, entradaS: 0 });
    const l = E.linhaDeVideo(doc, 11);
    assert.deepStrictEqual(l.map((p) => [p.inicioS, p.duracaoS, p.arquivo]), [
        [0, 4, 'acervo/a.mp4'], [4, 1, 'acervo/c.mp4'], [5, 1, 'acervo/a.mp4'], [6, 1, null], [7, 4, 'acervo/b.mp4'],
    ]);
    assert.strictEqual(l[2].entradaS, 6, 'a.mp4 retomado no ponto certo (1 + 5)');
});

test('dividir item ajusta a entrada no arquivo', () => {
    const [a, b] = E.dividirItem({ id: 'v1', inicioS: 2, duracaoS: 4, entradaS: 1 }, 3.5, 'v9');
    assert.deepStrictEqual([a.duracaoS, b.inicioS, b.duracaoS, b.entradaS, b.id], [1.5, 3.5, 2.5, 2.5, 'v9']);
    assert.strictEqual(E.dividirItem({ id: 'v1', inicioS: 2, duracaoS: 4 }, 2).length, 1, 'na borda não divide');
});

// ---------- persistência ----------
test('edicaoInicial + desfazer/refazer no servidor + conflito de revisão', async () => {
    prepararSerie();
    const r = await E.edicaoInicial(SERIE, 1);
    assert.strictEqual(r.edicao.revisao, 1);
    assert.ok(fs.existsSync(path.join(PASTA, 'episodios', 'ep01', 'edicao.json')));
    assert.strictEqual(r.edicao.origem.falas, 'falas.json');
    assert.strictEqual(r.edicao.faixas.narracao.length, 1);
    assert.strictEqual(r.edicao.faixas.falas.length, 2);
    assert.deepStrictEqual(r.historico, { podeDesfazer: false, podeRefazer: false, versoes: 1, posicao: 0 });
    await assert.rejects(E.edicaoInicial(SERIE, 1), /já existe/);

    const v1 = r.edicao;
    const mudado = JSON.parse(JSON.stringify(v1));
    mudado.faixas.texto[0].texto = 'NOVO TÍTULO';
    const s2 = await E.salvarEdicao(SERIE, 1, mudado, { revisaoBase: 1 });
    assert.strictEqual(s2.edicao.revisao, 2);
    assert.strictEqual(s2.historico.podeDesfazer, true);

    await assert.rejects(E.salvarEdicao(SERIE, 1, mudado, { revisaoBase: 1 }), (e) => e.status === 409 && /mudou no servidor/.test(e.message));

    const d = await E.desfazerEdicao(SERIE, 1);
    assert.strictEqual(d.edicao.faixas.texto[0].texto, 'O ÚLTIMO FAROL');
    assert.strictEqual(d.edicao.revisao, 3, 'a revisão sempre cresce');
    assert.deepStrictEqual([d.historico.podeDesfazer, d.historico.podeRefazer], [false, true]);
    await assert.rejects(E.desfazerEdicao(SERIE, 1), /Nada para desfazer/);

    const f = await E.refazerEdicao(SERIE, 1);
    assert.strictEqual(f.edicao.faixas.texto[0].texto, 'NOVO TÍTULO');
    await assert.rejects(E.refazerEdicao(SERIE, 1), /Nada para refazer/);

    // salvar depois de desfazer descarta o "refazer"
    await E.desfazerEdicao(SERIE, 1);
    const outro = JSON.parse(JSON.stringify((await E.lerEdicao(SERIE, 1))));
    outro.faixas.texto[0].texto = 'OUTRO';
    const s3 = await E.salvarEdicao(SERIE, 1, outro, { revisaoBase: outro.revisao });
    assert.strictEqual(s3.historico.podeRefazer, false);
    assert.ok(fs.readdirSync(path.join(PASTA, '.bak', 'episodios', 'ep01')).some((n) => n.startsWith('edicao.json.')), 'backup na .bak da série');

    await assert.rejects(E.salvarEdicao(SERIE, 1, { faixas: { video: [{ inicioS: -1, duracaoS: 0 }] } }), /inválido/);
    await assert.rejects(E.salvarEdicao(SERIE, 1, { faixas: { video: [{ inicioS: 0, duracaoS: 1, arquivo: '../../fora.mp4' }] } }), /relativo/);
    // volta ao inicial para os próximos testes
    await E.edicaoInicial(SERIE, 1, { forcar: true });
});

// ---------- mídia ----------
test('miniaturas, onda e quadro (ffmpeg real, com cache)', async () => {
    prepararSerie();
    const m = await midia.miniaturas({ serie: SERIE, caminho: 'acervo/farol_a.mp4', n: 6, altura: 64 });
    assert.strictEqual(m.n, 6);
    assert.ok(fs.existsSync(path.join(PASTA, m.arquivo)));
    const o = await midia.onda({ serie: SERIE, caminho: 'episodios/ep01/audio/p01-f01.wav' });
    assert.ok(Math.abs(o.picos.length - 200) <= 2, `100 picos/s em 2 s (${o.picos.length})`);
    assert.ok(Math.max(...o.picos) === 1);
    const q = await midia.extrairQuadro({ serie: SERIE, caminho: 'acervo/farol_a.mp4', tS: 1.2 });
    assert.ok(fs.existsSync(path.join(PASTA, q.arquivo)));
    await assert.rejects(midia.onda({ serie: SERIE, caminho: '../../x.wav' }), /fora da série/);
    const m2 = await midia.miniaturas({ serie: SERIE, caminho: 'acervo/farol_a.mp4', n: 6, altura: 64 });
    assert.strictEqual(m2.arquivo, m.arquivo, 'cache');
});

// ---------- regeração de trecho (SIMULADA: sem rede, sem custo) ----------
async function esperar(fn, ms = 30000) {
    const fim = Date.now() + ms;
    for (;;) {
        const v = await fn();
        if (v) return v;
        if (Date.now() > fim) throw new Error('tempo esgotado');
        await new Promise((r) => setTimeout(r, 150));
    }
}

test('cotar e regerar um trecho no modo simulado: token obrigatório, take novo aparado, só o pedaço trocado', async () => {
    prepararSerie();
    const antes = await E.lerEdicao(SERIE, 1);
    const p1 = antes.planos[0];
    const de = Math.round((p1.deS + 0.5) * 100) / 100;
    const ate = Math.round((de + 1.6) * 100) / 100;
    const cot = await T.cotarTrecho({ serie: SERIE, ep: 1, deS: de, ateS: ate, instrucao: 'ela vira para a janela' });
    assert.strictEqual(cot.cotacoes.length, 1);
    const c = cot.cotacoes[0];
    assert.strictEqual(c.modelo, 'google/veo-3.1-lite');
    assert.strictEqual(c.duracaoPedidaS, 4, 'veo gera 4/6/8 s: 1,6 s pede 4 s');
    assert.strictEqual(c.ajuste, 'aparar', '4 s em 1,6 s acelera demais: apara e manda só o primeiro quadro');
    assert.ok(c.quadros.primeiro && fs.existsSync(path.join(PASTA, c.quadros.primeiro)), 'primeiro quadro extraído');
    assert.strictEqual(c.quadros.ultimo, null);
    assert.ok(c.custoPrevistoUsd > 0 && c.token, 'custo e token');
    assert.ok(c.simulado);
    assert.match(c.prompt, /Neste trecho: ela vira para a janela/);

    await assert.rejects(T.regerarTrecho({ serie: SERIE, ep: 1, confirmacoes: [{ id: c.id }] }), /token/);
    await assert.rejects(T.regerarTrecho({ serie: SERIE, ep: 1, confirmacoes: [{ id: c.id, token: 'falso.falso' }] }), /Confirmação inválida/);

    const g = await T.regerarTrecho({ serie: SERIE, ep: 1, confirmacoes: [{ id: c.id, token: c.token }] });
    assert.strictEqual(g.regeracoes[0].status, 'gerando');
    const pronto = await esperar(async () => {
        const st = await T.statusRegeracoes(SERIE, 1);
        const r = st.regeracoes.find((x) => x.id === c.id);
        if (r.status === 'falhou') throw new Error(r.erro);
        return r.status === 'pronto' ? st : null;
    });
    const depois = await E.lerEdicao(SERIE, 1);
    const novo = depois.faixas.video.find((v) => v.regeracao === c.id);
    assert.ok(novo, 'segmento novo na faixa');
    assert.deepStrictEqual([novo.inicioS, novo.duracaoS, novo.origem], [de, Math.round((ate - de) * 1000) / 1000, 'take']);
    const take = pronto.takes['1'].find((t) => t.regeracao === c.id);
    assert.ok(fs.existsSync(path.join(PASTA, take.arquivo)) && fs.existsSync(path.join(PASTA, take.bruto)), 'take final e bruto guardados');
    const info = await require('../src/edicao/util').infoMidia(path.join(PASTA, take.arquivo));
    assert.ok(Math.abs(info.duracaoS - (ate - de)) < 0.1, `take aparado para o trecho (${info.duracaoS})`);
    const antesDoTrecho = depois.faixas.video.find((v) => v.plano === 1 && v.inicioS === p1.deS);
    assert.ok(antesDoTrecho && antesDoTrecho.duracaoS === Math.round((de - p1.deS) * 1000) / 1000, 'o começo do plano ficou como estava');
    const total = depois.faixas.video.reduce((s, v) => s + v.duracaoS, 0);
    assert.ok(Math.abs(total - antes.faixas.video.reduce((s, v) => s + v.duracaoS, 0)) < 0.01);
    await assert.rejects(T.regerarTrecho({ serie: SERIE, ep: 1, confirmacoes: [{ id: c.id, token: c.token }] }), /já foi/);
    // desfazer a troca não apaga o take pago (mesa.json fica fora do histórico)
    await E.desfazerEdicao(SERIE, 1);
    assert.ok((await E.lerMesa(SERIE, 1)).takes['1'].some((t) => t.id === take.id));
});

test('trecho maior que o máximo do modelo é recusado com mensagem clara', async () => {
    prepararSerie();
    const doc = await E.lerEdicao(SERIE, 1);
    await assert.rejects(T.cotarTrecho({ serie: SERIE, ep: 1, deS: 0, ateS: Math.min(doc.duracaoS, 3.9), modelo: 'tbc/mischief-1' }), /9:16|máximo/);
    await assert.rejects(T.cotarTrecho({ serie: SERIE, ep: 1, deS: 1, ateS: 1.1 }), /0,2 s/);
});

// ---------- regeração de fala (motor falso, sem rede) ----------
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

test('regerar fala: mesma voz, nova intenção/texto, faixa e legenda se ajustam', async () => {
    prepararSerie();
    await E.edicaoInicial(SERIE, 1, { forcar: true });
    const doc = await E.lerEdicao(SERIE, 1);
    const fala = doc.faixas.narracao[0];
    const m = motorFalso(0.5);
    const r = await T.regerarFala({ serie: SERIE, ep: 1, id: fala.id, intencao: 'sussurro', texto: 'Agora o narrador sussurra só isto.', executor: m.executor });
    assert.strictEqual(m.pedidos.length, 1);
    assert.strictEqual(m.pedidos[0].itens[0].voz, fala.voz, 'mesma voz');
    const novo = r.edicao.faixas.narracao.find((f) => f.id === fala.id);
    assert.strictEqual(novo.intencao, 'sussurro');
    assert.strictEqual(novo.texto, 'Agora o narrador sussurra só isto.');
    assert.ok(Math.abs(novo.duracaoS - 3.0) < 0.05, `6 palavras × 0,5 s (${novo.duracaoS})`);
    assert.ok(fs.existsSync(path.join(PASTA, novo.arquivo)));
    assert.strictEqual(novo.inicioS, fala.inicioS, 'começa no mesmo lugar');
    const blocos = r.edicao.legenda.filter((b) => b.item === fala.id);
    assert.ok(blocos.length && blocos.map((b) => b.linhas.join(' ')).join(' ').includes('sussurra'), 'legenda acompanha o texto novo');
    assert.ok(r.edicao.revisao > doc.revisao);

    // texto falado diferente do exibido
    const r2 = await T.regerarFala({ serie: SERIE, ep: 1, id: fala.id, textoFalado: 'sete quilômetros', executor: motorFalso().executor });
    assert.strictEqual(r2.fala.texto, 'Agora o narrador sussurra só isto.');
    assert.ok(Math.abs(r2.fala.duracaoS - 1.0) < 0.05);
    await assert.rejects(T.regerarFala({ serie: SERIE, ep: 1, id: 'nao-existe', executor: m.executor }), /não encontrada/);
});

test('ripple: fala mais longa empurra as seguintes do mesmo plano e a legenda delas', () => {
    const doc = docSimples();
    doc.faixas.falas = [
        { id: 'a', plano: 1, quem: 'mara', texto: 'Um dois.', inicioS: 0.3, duracaoS: 1, palavras: [{ p: 'um', t: 0 }, { p: 'dois', t: 0.5 }] },
        { id: 'b', plano: 1, quem: 'mara', texto: 'Três.', inicioS: 1.8, duracaoS: 1, palavras: [{ p: 'tres', t: 0 }] },
        { id: 'c', plano: 2, quem: 'mara', texto: 'Quatro.', inicioS: 6.3, duracaoS: 1, palavras: [{ p: 'quatro', t: 0 }] },
    ];
    E.recalcularLegenda(doc);
    const r = T.aplicarFalaNova(doc, 'a', { duracaoS: 1.5, texto: 'Um dois agora.', palavras: [{ p: 'um', t: 0 }, { p: 'dois', t: 0.5 }, { p: 'agora', t: 1 }] });
    assert.strictEqual(r.delta, 0.5);
    assert.deepStrictEqual(r.movidos, ['b']);
    assert.strictEqual(doc.faixas.falas[1].inicioS, 2.3);
    assert.strictEqual(doc.faixas.falas[2].inicioS, 6.3, 'outro plano não anda');
});

// ---------- tradução para o motor + ASS + render ----------
test('tradução para o motor NarradorVideo: cena por plano, clipes ini/dur, mudo, atraso das falas, títulos na zona segura', async () => {
    prepararSerie();
    await E.edicaoInicial(SERIE, 1, { forcar: true });
    const doc = await E.lerEdicao(SERIE, 1);
    const p = R.traduzirParaMotor(doc, { pastaSerie: PASTA, serie: { vozes: { mara: 'pt-BR-ThalitaMultilingualNeural' } } });
    assert.strictEqual(p.cenas.length, doc.planos.length);
    assert.strictEqual(p.largura, 1080);
    assert.strictEqual(p.folga_apos_fala, 0);
    const c2 = p.cenas[1];
    const plano2 = doc.planos[1];
    assert.ok(c2.clipes.every((k) => path.isAbsolute(k.v) && k.mudo === true), 'clipes do narrador mudos e com caminho absoluto');
    assert.ok(Math.abs(c2.clipes.reduce((s, k) => s + k.dur, 0) - (plano2.ateS - plano2.deS)) < 0.05, 'ini/dur cobrem o plano');
    assert.strictEqual(c2.audio_original, false);
    assert.ok(Math.abs(c2.minimo - (plano2.ateS - plano2.deS)) < 0.01);
    const f2 = doc.faixas.narracao[0];
    assert.ok(Math.abs(c2.falas[0].atraso - (f2.inicioS - plano2.deS - 0.25)) < 0.002, 'atraso = início absoluto − começo da cena − 0,25 s do motor');
    assert.strictEqual(c2.falas[0].pausa, 0);
    const t = p.cenas[0].titulos.find((x) => x.tipo === 'texto');
    assert.ok(t && t.y * 1920 >= 290 && t.y * 1920 <= 1248, 'texto de tela na zona segura');
    const cartoes = p.cenas[2].titulos.filter((x) => x.tipo === 'cartao');
    assert.deepStrictEqual(cartoes.map((x) => x.letra), ['A', 'B']);
    cartoes.forEach((x) => assert.ok(x.y * 1920 >= 290 && x.y * 1920 <= 1248));
});

test('ASS da Mesa: legenda + texto de tela + cartões', async () => {
    prepararSerie();
    const doc = await E.lerEdicao(SERIE, 1);
    const ass = R.montarAss(doc);
    assert.match(ass, /Style: Tela,League Gothic/);
    assert.match(ass, /Style: Cartao,Barlow Condensed/);
    assert.match(ass, /Dialogue: 1,[^,]+,[^,]+,Tela,,0,0,0,,\{\\fad\(180,180\)\}O ÚLTIMO FAROL/);
    assert.match(ass, /ACENDER/);
    assert.match(ass, /WrapStyle: 1/);
    assert.ok((ass.match(/^Dialogue: 0,/gm) || []).length >= 3, 'blocos de legenda');
});

test('render real (ffmpeg, tamanho reduzido): mp4 com vídeo e áudio na duração da edição', async () => {
    prepararSerie();
    await E.edicaoInicial(SERIE, 1, { forcar: true });
    const doc = await E.lerEdicao(SERIE, 1);
    doc.largura = 360;
    doc.altura = 640;
    await E.salvarEdicao(SERIE, 1, doc);
    const plano = R.planoDeRender(doc);
    assert.ok(plano.falas.length === 3 && plano.somClipes.every((s) => !/narrador_b/.test(s.arquivo)), 'clipe mudo fica fora do som');
    const f = R.filtroVideo(plano.pedacos, { largura: 360, altura: 640 });
    assert.match(f.filtro, /concat=n=\d+:v=1:a=0\[base\];\[base\]ass=mesa\.ass:fontsdir=fontes\[v\]/);
    const st = await R.renderizar({ serie: SERIE, ep: 1 });
    assert.strictEqual(st.status, 'montando');
    const fim = await esperar(async () => {
        const s = await R.statusRender(SERIE, 1);
        if (s.status === 'falhou') throw new Error(s.erro);
        return s.status === 'pronto' ? s : null;
    }, 120000);
    assert.strictEqual(fim.saida, 'episodios/ep01/saida/ep01.mp4');
    const info = await require('../src/edicao/util').infoMidia(path.join(PASTA, fim.saida));
    assert.ok(info.temVideo && info.temAudio);
    assert.ok(Math.abs(info.duracaoS - doc.duracaoS) < 0.25, `duração ${info.duracaoS} ≈ ${doc.duracaoS}`);
    assert.deepStrictEqual([info.largura, info.altura], [360, 640]);
});
