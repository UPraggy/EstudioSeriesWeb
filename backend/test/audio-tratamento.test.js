// Tratamento: cadeias de filtro por intenção, mixagem (ducking/ambiente) e loudness real com o ffmpeg local.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const T = require('../src/audio/tratamento');

test('cadeia de filtro por intenção', () => {
    const radio = T.cadeiaIntencao('radio');
    assert.match(radio, /highpass=f=400/);
    assert.match(radio, /lowpass=f=3000/);
    assert.match(radio, /acrusher=bits=8/); // passa-banda + crush leve
    assert.match(T.cadeiaIntencao('telefone'), /^highpass=f=300,lowpass=f=3400/);
    assert.match(T.cadeiaIntencao('pensamento'), /aecho=/); // eco curto
    assert.match(T.cadeiaIntencao('sussurro'), /highshelf/);
    assert.match(T.cadeiaIntencao('medo'), /tremolo/);
    assert.match(T.cadeiaIntencao('grito_urgencia'), /acompressor/);
    assert.strictEqual(T.cadeiaIntencao('neutra'), '');
    assert.throws(() => T.cadeiaIntencao('inexistente'), /desconhecida/);
});

test('EQ de diálogo leve e cadeia completa da fala para o motor', () => {
    const eq = T.cadeiaDialogo();
    assert.match(eq, /^highpass=f=80,/); // passa-alta 80 Hz
    assert.match(eq, /equalizer=f=3000/); // presença
    assert.match(eq, /deesser/);
    assert.strictEqual(T.cadeiaFalaMotor('neutra'), eq);
    assert.strictEqual(T.cadeiaFalaMotor('radio'), `${T.cadeiaIntencao('radio')},${eq}`);
    assert.ok(!T.cadeiaFalaMotor('radio').endsWith(',')); // o motor acrescenta ",aresample=...,volume=..."
});

test('master -14 LUFS / -1,5 dBTP e cadeias exportadas', () => {
    assert.strictEqual(T.cadeiaMaster(), 'loudnorm=I=-14:TP=-1.5:LRA=11');
    assert.strictEqual(T.cadeiaMaster({ TP: -1 }), 'loudnorm=I=-14:TP=-1:LRA=11');
    const c = T.exportarCadeias();
    assert.strictEqual(Object.keys(c.intencoes).length, 10);
    assert.match(c.ducking, /sidechaincompress=.*attack=40:release=450/);
    assert.match(c.ambiente, /^anoisesrc=c=brown/);
    assert.strictEqual(T.cadeiaGanho(-3.456), 'volume=-3.46dB,alimiter=limit=0.891:attack=5:release=50:level=0');
    assert.ok(Math.abs(T.ganhoDb(0.7) - -3.098) < 0.01);
});

test('mixagem: falas no tempo, fundo com ducking e corte de 1–3 kHz', () => {
    const m = T.montarMixagem({
        falas: [{ arquivo: 'a.wav', inicioS: 0.4, duracaoS: 2 }, { arquivo: 'b.wav', inicioS: 3.25, duracaoS: 2 }],
        duracaoS: 10, clipe: { arquivo: 'v.mp4', volume: 1.4 }, ambiente: 0.12,
    });
    assert.deepStrictEqual(m.entradas, ['-i', 'a.wav', '-i', 'b.wav', '-i', 'v.mp4']);
    assert.match(m.filtro, /adelay=400:all=1\[f0\]/);
    assert.match(m.filtro, /adelay=3250:all=1\[f1\]/);
    assert.match(m.filtro, /\[2:a\].*volume=1\.4/);
    assert.match(m.filtro, /anoisesrc=c=brown.*volume=0\.12/);
    assert.match(m.filtro, /equalizer=f=2000/);
    assert.match(m.filtro, /\[vozK\]sidechaincompress=/);
    assert.match(m.filtro, /\[saida\]$/);
    assert.strictEqual(m.duracaoS, 10);
});

test('mixagem só de voz não tem ducking; duração cresce para caber as falas', () => {
    const m = T.montarMixagem({ falas: [{ arquivo: 'a.wav', inicioS: 8, duracaoS: 4 }], duracaoS: 5 });
    assert.ok(!m.filtro.includes('sidechaincompress'));
    assert.strictEqual(m.duracaoS, 12.5);
    assert.throws(() => T.montarMixagem({}), /Nada para mixar/);
});

test('ffmpeg real: a cadeia de TODAS as intenções roda e não corta a fala (eco só soma a cauda)', async () => {
    const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'estudio-cad-'));
    try {
        const tom = path.join(pasta, 'tom.wav');
        await T.rodarFfmpeg(['-y', '-f', 'lavfi', '-i', 'sine=frequency=180:duration=1.5', '-ar', '24000', '-ac', '1', tom]);
        for (const id of Object.keys(T.exportarCadeias().intencoes)) {
            const saida = await T.aplicarCadeia(tom, path.join(pasta, `${id}.wav`), `${T.cadeiaFalaMotor(id)},aresample=44100,volume=1.0`);
            const d = await T.duracaoArquivo(saida);
            assert.ok(d >= 1.5 - 0.02 && d <= 1.5 + 0.15, `${id}: ${d} s`);
        }
    } finally {
        fs.rmSync(pasta, { recursive: true, force: true });
    }
});

test('ffmpeg real: fala normalizada pelo alvo da intenção e master em -14 LUFS', async () => {
    const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'estudio-trat-'));
    try {
        const tom = path.join(pasta, 'tom.wav');
        // "fala" sintética: tom modulado e baixo (~-37 LUFS), 3 s
        await T.rodarFfmpeg(['-y', '-f', 'lavfi', '-i', 'sine=frequency=220:duration=3', '-af', 'volume=-12dB,tremolo=f=4:d=0.6', '-ar', '44100', '-ac', '1', tom]);
        const normal = await T.normalizarFala(tom, path.join(pasta, 'n.wav'), { volume: 1 });
        const sussurro = await T.normalizarFala(tom, path.join(pasta, 's.wav'), { volume: 0.7 });
        const mn = await T.medirLoudness(normal.saida);
        const ms = await T.medirLoudness(sussurro.saida);
        assert.ok(Math.abs(mn.I - T.ALVO_FALA_LUFS) < 1.0, `fala normal em ${mn.I} LUFS`);
        assert.ok(Math.abs(ms.I - mn.I - T.ganhoDb(0.7)) < 0.6, `sussurro ${ms.I} vs normal ${mn.I}`);

        const r = await T.mixarEpisodio({
            falas: [{ arquivo: normal.saida, inicioS: 0.5, duracaoS: 3 }, { arquivo: sussurro.saida, inicioS: 4, duracaoS: 3 }],
            duracaoS: 8, ambiente: 0.1, saida: path.join(pasta, 'ep.wav'),
        });
        const final = await T.medirLoudness(r.saida);
        assert.ok(Math.abs(final.I - -14) < 1.0, `master em ${final.I} LUFS`);
        assert.ok(final.TP <= -1.0, `pico ${final.TP} dBTP`);
        assert.ok(Math.abs((await T.duracaoArquivo(r.saida)) - 8) < 0.1);
        assert.ok(!fs.existsSync(path.join(pasta, 'ep.mix.wav')));
    } finally {
        fs.rmSync(pasta, { recursive: true, force: true });
    }
});
