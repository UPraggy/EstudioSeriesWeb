// Entonação: prioridade dos parâmetros, limites naturais, recusa de voz fora de vozes.json, frases e pronúncia.
const test = require('node:test');
const assert = require('node:assert');
const P = require('../src/audio/parametros');

// vozes.json mínimo (mesma forma do NarradorVideo), para o teste não depender do arquivo real
const VOZES = {
    permitidas: [
        { id: 'de-DE-FlorianMultilingualNeural', tom: '-4Hz', velocidade: '-3%', volume: 1.0 },
        { id: 'pt-BR-ThalitaMultilingualNeural', tom: '+0Hz', velocidade: '+0%', volume: 1.0 },
        { id: 'piper:pt_BR-cadu-medium', tom: '+0st', velocidade: '+0%', volume: 1.3 },
        { id: 'en-US-BrianMultilingualNeural', tom: '+0Hz', velocidade: '+0%', volume: 1.0 },
    ],
    papeis: {
        narrador: { voz: 'de-DE-FlorianMultilingualNeural' },
        mara: { voz: 'pt-BR-ThalitaMultilingualNeural' },
        davi: { voz: 'piper:pt_BR-cadu-medium' },
        alerta: { voz: 'en-US-BrianMultilingualNeural' },
    },
    pronuncia: { Mara: 'Mára', km: 'quilômetros', 'Dr.': 'doutor', turno: 'túrno' },
    pronuncia_piper: { porto: 'pórto', km: 'quilômetros' },
};
const FLORIAN = 'de-DE-FlorianMultilingualNeural';
const CADU = 'piper:pt_BR-cadu-medium';

test('padrão da voz + ajuste da intenção (sem papel nem fala)', () => {
    const r = P.resolverParametros({ vozId: FLORIAN, intencao: 'narracao_suspense', vozesCfg: VOZES });
    assert.strictEqual(r.tom, '-6Hz'); // -4 da voz + (-2) da intenção
    assert.strictEqual(r.velocidade, '-10%'); // -3 + (-7)
    assert.strictEqual(r.volume, 0.95);
    assert.match(r.origem.tom, /^voz/);
});

test('papel no projeto vence o padrão da voz', () => {
    const r = P.resolverParametros({ vozId: FLORIAN, intencao: 'neutra', papel: { tom: '+6Hz', velocidade: '+2%' }, vozesCfg: VOZES });
    assert.strictEqual(r.tom, '+6Hz');
    assert.strictEqual(r.velocidade, '+2%');
    assert.match(r.origem.tom, /^papel/);
});

test('intenção ajusta por cima do papel (não apaga a diferença entre papéis com a mesma voz)', () => {
    const r = P.resolverParametros({ vozId: FLORIAN, intencao: 'sussurro', papel: { tom: '-6Hz' }, vozesCfg: VOZES });
    assert.strictEqual(r.tom, '-9Hz'); // -6 do papel + (-3) do sussurro
    assert.strictEqual(r.velocidade, '-15%'); // -3 da voz + (-12)
    assert.strictEqual(r.volume, 0.7);
    assert.ok(r.filtro.includes('highshelf'));
});

test('a fala vence tudo (tom, velocidade, volume, pausa e filtro)', () => {
    const r = P.resolverParametros({
        vozId: FLORIAN, intencao: 'grito_urgencia', papel: { tom: '-6Hz', velocidade: '-5%', volume: 0.5 },
        fala: { tom: '+2Hz', velocidade: '-1%', volume: 1.1, pausa: 0.9, filtro: '' }, vozesCfg: VOZES,
    });
    assert.strictEqual(r.tom, '+2Hz');
    assert.strictEqual(r.velocidade, '-1%');
    assert.strictEqual(r.volume, 1.1);
    assert.strictEqual(r.pausa.antesS, 0.9);
    assert.strictEqual(r.filtro, ''); // "" na fala = sem filtro, mesmo com intenção que tem filtro
    assert.match(r.origem.tom, /^fala/);
});

test('volume da intenção multiplica o da voz (Cadu 1,3)', () => {
    const r = P.resolverParametros({ vozId: CADU, intencao: 'sussurro', vozesCfg: VOZES });
    assert.strictEqual(r.volume, 0.91); // 1,3 × 0,7
});

test('limite natural: Edge ±10 Hz e Piper ±2 st, com aviso', () => {
    const edge = P.resolverParametros({ vozId: FLORIAN, intencao: 'grito_urgencia', papel: { tom: '+9Hz' }, vozesCfg: VOZES });
    assert.strictEqual(edge.tom, '+10Hz');
    assert.ok(edge.avisos.some((a) => a.includes('limite natural')));
    const piper = P.resolverParametros({ vozId: CADU, intencao: 'grito_urgencia', papel: { tom: '+1st' }, vozesCfg: VOZES });
    assert.strictEqual(piper.tom, '+2st');
    const fala = P.resolverParametros({ vozId: FLORIAN, intencao: 'neutra', fala: { tom: '-30Hz' }, vozesCfg: VOZES });
    assert.strictEqual(fala.tom, '-10Hz');
});

test('Piper fala em semitons; Edge em Hz inteiros (conversão 6 Hz ≈ 1 st)', () => {
    const piper = P.resolverParametros({ vozId: CADU, intencao: 'neutra', papel: { tom: '+6Hz' }, vozesCfg: VOZES });
    assert.strictEqual(piper.tom, '+1st');
    assert.strictEqual(piper.motor, 'piper');
    const edge = P.resolverParametros({ vozId: FLORIAN, intencao: 'neutra', fala: { tom: '+1st' }, vozesCfg: VOZES });
    assert.strictEqual(edge.tom, '+6Hz');
    assert.match(P.resolverParametros({ vozId: CADU, intencao: 'medo', vozesCfg: VOZES }).tom, /^[+-][\d.]+st$/);
});

test('recusa voz fora de vozes.json (na fala, na série ou na ficha)', () => {
    assert.throws(() => P.resolverVoz({ quem: 'mara', vozFala: 'pt-BR-FranciscaNeural', vozesCfg: VOZES }), /fora da lista de vozes\.json/);
    assert.throws(() => P.resolverVoz({ quem: 'mara', serie: { vozes: { mara: 'pt-BR-AntonioNeural' } }, vozesCfg: VOZES }), /fora da lista/);
    assert.throws(() => P.resolverVoz({ quem: 'ze', ficha: { voz: 'en-US-JennyNeural' }, vozesCfg: VOZES }), /fora da lista/);
    assert.throws(() => P.resolverVoz({ quem: 'desconhecido', vozesCfg: VOZES }), /Sem voz/);
});

test('voz: fala > serie.json > ficha > papel da casa; apelido vira id', () => {
    assert.strictEqual(P.resolverVoz({ quem: 'mara', vozesCfg: VOZES }).id, 'pt-BR-ThalitaMultilingualNeural');
    assert.strictEqual(P.resolverVoz({ quem: 'mara', serie: { vozes: { mara: 'en-US-BrianMultilingualNeural' } }, vozesCfg: VOZES }).id, 'en-US-BrianMultilingualNeural');
    assert.strictEqual(P.resolverVoz({ quem: 'mara', vozFala: 'davi', vozesCfg: VOZES }).id, CADU);
    const v = P.resolverVoz({ quem: 'ze', ficha: { voz: FLORIAN }, vozesCfg: VOZES });
    assert.strictEqual(v.id, FLORIAN);
    assert.match(v.origem, /ficha/);
});

test('intenção padrão pela via, pelo plano e pelo gênero da série', () => {
    assert.strictEqual(P.intencaoPadrao({ via: 'radio', quem: 'davi' }), 'radio');
    assert.strictEqual(P.intencaoPadrao({ via: 'telefone', quem: 'mara' }), 'telefone');
    assert.strictEqual(P.intencaoPadrao({ via: 'em_cena', quem: 'mara' }), 'neutra');
    assert.strictEqual(P.intencaoPadrao({ via: 'narracao', quem: 'narrador', genero: 'Sobrevivência · apocalipse zumbi' }), 'narracao_suspense');
    assert.strictEqual(P.intencaoPadrao({ via: 'narracao', quem: 'narrador', genero: 'comédia' }), 'neutra');
    assert.strictEqual(P.intencaoPadrao({ via: 'narracao', quem: 'narrador', tipoPlano: 'apresentador' }), 'apresentador');
    assert.strictEqual(P.resolverIntencao('Grito'), 'grito_urgencia');
    assert.strictEqual(P.resolverIntencao('narração-suspense'), 'narracao_suspense');
    assert.strictEqual(P.resolverIntencao('voz interna'), 'pensamento');
    assert.throws(() => P.resolverIntencao('cantando'), /Intenção desconhecida/);
});

test('todas as intenções pedidas existem, com parâmetros dos dois motores', () => {
    for (const id of ['neutra', 'narracao_suspense', 'sussurro', 'grito_urgencia', 'medo', 'cansaco', 'radio', 'telefone', 'pensamento', 'apresentador']) {
        const i = P.INTENCOES.intencoes[id];
        assert.ok(i, id);
        assert.match(i.edge.tom, /^[+-]\d+Hz$/, `${id} edge tom`);
        assert.match(i.piper.tom, /^[+-][\d.]+st$/, `${id} piper tom`);
        for (const k of ['volume', 'pausaAntesS', 'pausaDepoisS', 'pausaFrasesS']) assert.strictEqual(typeof i[k], 'number', `${id}.${k}`);
        assert.strictEqual(typeof i.filtro, 'string');
    }
});

test('divide fala longa em frases SEM mudar o texto; curta fica inteira', () => {
    const texto = 'Quarenta e cinco minutos antes, Mara estava sozinha no Farol da Ponta Norte, numa ilhota a sete quilômetros da cidade. Não havia ponte, nem caminho na maré baixa. Só mar aberto.';
    const frases = P.dividirEmFrases(texto);
    assert.strictEqual(frases.length, 3);
    assert.strictEqual(frases.map((f) => f.texto).join(' '), texto);
    assert.deepStrictEqual(P.dividirEmFrases('Davi, atende.'), [{ texto: 'Davi, atende.', pontuacao: '.' }]);
    // abreviação não corta frase
    const comAbrev = 'Fale com o Dr. Silva agora mesmo, antes que a maré suba e o bote não consiga mais sair do cais. Depressa.';
    const f2 = P.dividirEmFrases(comAbrev);
    assert.ok(f2.every((f) => !/Dr\.$/.test(f.texto)));
    assert.strictEqual(f2.map((f) => f.texto).join(' '), comAbrev);
    // frase longa demais sem ponto: corta na vírgula
    const corrida = 'Ela correu pela escada, empurrou a porta pesada do cais, travou a barra de ferro com as duas mãos, contou as garrafas de água e as latas de comida e respirou fundo';
    const f3 = P.dividirEmFrases(corrida);
    assert.ok(f3.length >= 2);
    assert.strictEqual(f3.map((f) => f.texto).join(' '), corrida);
});

test('pausa entre frases = respiro da intenção × pontuação; a última é zero', () => {
    const frases = [{ texto: 'a.', pontuacao: '.' }, { texto: 'b…', pontuacao: '…' }, { texto: 'c!', pontuacao: '!' }];
    assert.deepStrictEqual(P.pausasEntreFrases(frases, 0.5), [0.5, 0.8, 0]);
});

test('dicionário de pronúncia: só a palavra inteira, Edge e Piper separados, série vence', () => {
    assert.strictEqual(P.aplicarPronuncia('Mara andou 7 km com o Dr. Silva. Marapé.', 'edge', VOZES), 'Mára andou 7 quilômetros com o doutor Silva. Marapé.');
    assert.strictEqual(P.aplicarPronuncia('Mara foi ao porto.', 'piper', VOZES), 'Mara foi ao pórto.');
    assert.strictEqual(P.aplicarPronuncia('Mara chegou.', 'edge', VOZES, { pronuncia: { Mara: 'Máara' } }), 'Máara chegou.');
});
