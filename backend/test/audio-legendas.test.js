// Legendas com tempos falsos: quebra, duração mínima/máxima, cores por personagem, zona segura e palavra a palavra.
const test = require('node:test');
const assert = require('node:assert');
const L = require('../src/audio/legendas');
const { normalizarPalavra } = require('../src/audio/parametros');

// Fala com tempos falsos do TTS: uma palavra a cada `ritmo` segundos.
function fala(id, quem, inicioS, texto, { ritmo = 0.38, intencao = 'neutra', via = 'em_cena' } = {}) {
    const ws = texto.split(' ');
    return {
        id, quem, intencao, via, inicioS, status: 'pronta', textoExibido: texto,
        duracaoS: ws.length * ritmo + 0.3,
        palavras: ws.map((w, i) => ({ p: normalizarPalavra(w), t: 0.1 + i * ritmo })),
    };
}

const FALAS = [
    fala('p02-f01', 'narrador', 0.5, 'Quarenta e cinco minutos antes, Mara estava sozinha no Farol da Ponta Norte, numa ilhota a sete quilômetros da cidade. Não havia ponte, nem caminho na maré baixa. Só mar aberto.', { intencao: 'narracao_suspense', via: 'narracao' }),
    fala('p03-f01', 'mara', 13.5, 'Davi, atende.'),
    fala('p03-f02', 'davi', 15.2, 'Mara! Ele saiu da cabine!', { via: 'radio', intencao: 'radio' }),
    fala('p04-f01', 'alerta', 18, 'Alerta no terminal. Ataques violentos e ferimentos por mordida. Balsas suspensas. Não se aproximem dos feridos.', { ritmo: 0.42, via: 'radio', intencao: 'radio' }),
    fala('p05-f01', 'ze', 25, 'Eu vi tudo.'),
];

test('blocos: até 2 linhas de ~32 caracteres que cabem na largura da zona segura', () => {
    const o = L.opcoesCompletas();
    const g = L.geometria(o);
    const blocos = L.montarBlocos(FALAS);
    assert.ok(blocos.length >= 8);
    for (const b of blocos) {
        assert.ok(b.linhas.length >= 1 && b.linhas.length <= 2, JSON.stringify(b.linhas));
        for (const l of b.linhas) {
            assert.ok(l.length <= 32, `linha longa: "${l}"`);
            assert.ok(L.larguraTexto(l, o.tamanhoFonte) <= g.larguraMax, `linha larga: "${l}"`);
        }
    }
    // o texto inteiro de cada fala aparece, na ordem, sem perder palavra
    const juntado = blocos.filter((b) => b.falaId === 'p02-f01').map((b) => b.linhas.join(' ')).join(' ');
    assert.strictEqual(juntado, FALAS[0].textoExibido);
});

test('blocos: duração entre 1 s e 4,5 s, sem sobreposição', () => {
    const blocos = L.montarBlocos(FALAS);
    blocos.forEach((b, i) => {
        const d = b.fim - b.ini;
        assert.ok(d >= 1 - 0.011 && d <= 4.5 + 0.011, `bloco ${i} com ${d.toFixed(2)} s: ${b.linhas.join(' / ')}`);
        if (i > 0) assert.ok(b.ini >= blocos[i - 1].fim - 0.001, `bloco ${i} sobrepõe o anterior`);
    });
    // fala curtinha ganha o mínimo de 1 s
    const curta = blocos.find((b) => b.falaId === 'p05-f01');
    assert.ok(curta.fim - curta.ini >= 0.99);
    // fala longa e lenta é cortada em blocos de no máximo 4,5 s
    const lenta = L.montarBlocos([fala('x', 'narrador', 0, 'um dois três quatro cinco seis sete oito nove dez onze doze', { ritmo: 0.9 })]);
    assert.ok(lenta.length >= 3);
    for (const b of lenta) assert.ok(b.fim - b.ini <= 4.5 + 0.011);
});

test('quebra na pontuação: fim de frase fecha o bloco e não corta no meio de "Farol da Ponta"', () => {
    const blocos = L.montarBlocos(FALAS).filter((b) => b.falaId === 'p02-f01');
    for (const b of blocos.slice(0, -1)) {
        assert.match(b.linhas.at(-1), /[.,!?;:…]$/, `bloco termina sem pontuação: ${b.linhas.join(' / ')}`);
    }
    assert.ok(blocos.some((b) => b.linhas.at(-1).endsWith('cidade.')));
    assert.ok(!blocos.some((b) => /\bda$/.test(b.linhas.at(-1))));
    // "Mara!" curtinho não vira um bloco sozinho
    const davi = L.montarBlocos(FALAS).filter((b) => b.falaId === 'p03-f02');
    assert.strictEqual(davi.length, 1);
});

test('cores por personagem no ASS: narrador osso, Mara âmbar, Davi azul-frio, rádio vermelho-claro', () => {
    const blocos = L.montarBlocos(FALAS);
    const ass = L.gerarAss(blocos);
    const estilo = (nome) => ass.split('\n').find((l) => l.startsWith(`Style: ${nome},`)).split(',');
    assert.strictEqual(estilo('narrador')[3], L.corAss('#EFE7D6'));
    assert.strictEqual(estilo('mara')[3], L.corAss('#FFB547'));
    assert.strictEqual(estilo('davi')[3], L.corAss('#9AD8F2'));
    assert.strictEqual(estilo('alerta')[3], L.corAss('#FF8F87'));
    assert.strictEqual(L.corAss('#FFB547'), '&H0047B5FF'); // &HAABBGGRR
    // quem não tem cor própria e fala por rádio fica vermelho-claro; senão cor extra fixa
    assert.strictEqual(L.corDaFala({ quem: 'operador', intencao: 'radio' }, L.opcoesCompletas()), '#FF8F87');
    const ze = L.corDaFala({ quem: 'ze' }, L.opcoesCompletas());
    assert.ok(L.PADRAO.coresExtras.includes(ze));
    assert.strictEqual(L.corDaFala({ quem: 'ze' }, L.opcoesCompletas()), ze);
    // fonte e contorno legíveis
    assert.strictEqual(estilo('mara')[1], 'Arial');
    assert.strictEqual(estilo('mara')[7], '-1'); // negrito
    assert.ok(Number(estilo('mara')[16]) >= 3); // contorno
});

test('zona segura do 9:16 (x 65–888, y 290–1248): margens e caixa da legenda dentro dela', () => {
    for (const posicao of ['baixo', 'centro', 'alto']) {
        const o = L.opcoesCompletas({ posicao });
        const g = L.geometria(o);
        assert.ok(g.margemL >= 65, `${posicao} margem esquerda`);
        assert.ok(g.margemR >= 1080 - 888, `${posicao} margem direita (botões)`);
        assert.ok(g.caixa.x0 >= 65 && g.caixa.x1 <= 888, `${posicao} x`);
        assert.ok(g.caixa.y0 >= 290 && g.caixa.y1 <= 1248, `${posicao} y ${g.caixa.y0}–${g.caixa.y1}`);
    }
    const g = L.geometria(L.opcoesCompletas());
    assert.ok(g.margemV >= 672, 'base fora da faixa de 672 px do Shorts/Reels');
    assert.ok(g.caixa.y0 >= 1050, 'legenda na faixa y 1050–1240 da pesquisa');
    const ass = L.gerarAss(L.montarBlocos(FALAS));
    assert.match(ass, /PlayResX: 1080\nPlayResY: 1920/);
    assert.match(ass, /,2,85,212,680,1$/m); // alinhamento 2, margens L/R/V
    // configurável
    const outra = L.geometria(L.opcoesCompletas({ zonaSegura: { yMax: 1200 }, baseLegendaY: 1300 }));
    assert.ok(outra.caixa.y1 <= 1200);
});

test('SRT: numeração, tempo HH:MM:SS,mmm e linhas', () => {
    const srt = L.gerarSrt(L.montarBlocos(FALAS));
    assert.match(srt, /^1\n00:00:00,600 --> 00:00:0\d,\d{3}\nQuarenta e cinco minutos antes,\n/);
    assert.ok(!srt.includes('<font'));
    assert.match(L.gerarSrt(L.montarBlocos(FALAS), { corSrt: true }), /<font color="#FFB547">Davi, atende\.<\/font>/);
    assert.strictEqual(L.tempoSrt(3725.0456), '01:02:05,046');
    assert.strictEqual(L.tempoAss(3725.0456), '1:02:05.05');
});

test('palavra a palavra: um evento por palavra, a falada em destaque, as próximas apagadas, sem pular de lugar', () => {
    const blocos = L.montarBlocos([fala('a', 'mara', 1, 'Me avisa quando sair do terminal.')]);
    const ass = L.gerarAss(blocos, { modo: 'palavra' });
    const eventos = ass.split('\n').filter((l) => l.startsWith('Dialogue:'));
    assert.strictEqual(eventos.length, 6);
    assert.ok(eventos[0].includes('{\\1c&HFFFFFF&}Me{\\1c&H47B5FF&}'));
    assert.ok(eventos[0].includes('{\\1a&H80&\\3a&H80&}terminal.'));
    assert.ok(eventos[5].includes('{\\1c&HFFFFFF&}terminal.'));
    const semTags = (l) => l.split(',,')[1].replace(/\{[^}]*\}/g, '');
    assert.ok(eventos.every((e) => semTags(e) === semTags(eventos[0]))); // mesmo texto em todos
    const tempos = eventos.map((e) => e.split(',').slice(1, 3));
    for (let i = 1; i < tempos.length; i++) assert.strictEqual(tempos[i][0], tempos[i - 1][1]); // contínuo
});

test('alinha o texto exibido com as palavras do TTS quando o dicionário muda a contagem', () => {
    // "7 km" foi falado "sete quilômetros" e o travessão não tem palavra no TTS
    const tts = [
        { p: 'mara', t: 0.1 }, { p: 'remou', t: 0.5 }, { p: 'sete', t: 0.9 }, { p: 'quilometros', t: 1.2 },
        { p: 'sozinha', t: 1.9 }, { p: 'de', t: 2.4 }, { p: 'noite', t: 2.6 },
    ];
    const al = L.alinharPalavras('Mara remou 7km — sozinha de noite.', tts, 3.2);
    assert.deepStrictEqual(al.map((a) => a.texto), ['Mara', 'remou', '7km', '—', 'sozinha', 'de', 'noite.']);
    assert.strictEqual(al[0].ini, 0.1);
    assert.strictEqual(al[4].ini, 1.9);
    for (let i = 1; i < al.length; i++) assert.ok(al[i].ini >= al[i - 1].ini);
    assert.ok(al[2].ini > 0.5 && al[2].ini < 1.9);
    assert.ok(al.at(-1).fim <= 3.2);
    for (const a of al) assert.ok(a.fim > a.ini);
});
