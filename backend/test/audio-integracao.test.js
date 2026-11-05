// Integração REAL: 2 falas curtas (narrador = Florian e Mara = Thalita) pelo motor do NarradorVideo
// (fala_cli.py → narrar.fala_para_wav → edge-tts, grátis), tratamento com ffmpeg, legendas e master.
// Precisa de internet (Edge TTS). Sem rede: ESTUDIO_SEM_REDE=1 pula este teste.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), 'estudio-integ-'));
process.env.ESTUDIO_DADOS = DADOS;

const cfg = require('../src/audio/config');
const F = require('../src/audio/falas');
const L = require('../src/audio/legendas');
const T = require('../src/audio/tratamento');

const pular = process.env.ESTUDIO_SEM_REDE === '1' ? 'ESTUDIO_SEM_REDE=1'
    : !fs.existsSync(cfg.pythonMotor()) ? `Python não encontrado: ${cfg.pythonMotor()}`
        : !fs.existsSync(path.join(cfg.pastaNarrador(), 'fala_cli.py')) ? 'fala_cli.py não encontrado' : false;

test.after(() => fs.rmSync(DADOS, { recursive: true, force: true }));

test('gera 2 falas reais (narrador e Mara), trata, legenda e masteriza', { skip: pular, timeout: 300000 }, async () => {
    const pastaSerie = path.join(DADOS, 'series', 'teste-integracao');
    cfg.gravarJson(path.join(pastaSerie, 'serie.json'), {
        versao: 1, id: 'teste-integracao', titulo: 'Teste', genero: 'suspense',
        vozes: { narrador: 'de-DE-FlorianMultilingualNeural', mara: 'pt-BR-ThalitaMultilingualNeural' },
    });
    cfg.gravarJson(path.join(pastaSerie, 'episodios', 'ep01', 'roteiro.json'), {
        versao: 1, n: 1, duracaoAlvoS: 6,
        planos: [{ n: 1, deS: 0, ateS: 6, tipo: 'video_ia', falas: [
            { quem: 'narrador', texto: 'O farol apagou.', via: 'narracao' },
            { quem: 'mara', texto: 'Davi, atende.', via: 'em_cena' },
        ] }],
    });

    const { doc } = await F.gerarFalasEpisodio('teste-integracao', 1);
    assert.strictEqual(doc.falas.length, 2);
    const [narr, mara] = doc.falas;
    for (const f of doc.falas) {
        assert.strictEqual(f.status, 'pronta', f.erro);
        const arq = path.join(pastaSerie, f.arquivo);
        assert.ok(fs.existsSync(arq), arq);
        assert.ok(f.duracaoS > 0.5 && f.duracaoS < 5, `duração ${f.duracaoS}`);
        assert.strictEqual(f.palavrasEstimadas, false); // Edge devolve o tempo de cada palavra
        assert.ok(f.palavras.length >= 2);
        assert.ok(f.tratamento && Number.isFinite(f.tratamento.ganhoDb));
        const medido = await T.medirLoudness(arq);
        assert.ok(Math.abs(medido.I - f.tratamento.alvoLufs) < 2, `${f.id}: ${medido.I} LUFS, alvo ${f.tratamento.alvoLufs}`);
    }
    assert.strictEqual(narr.voz, 'de-DE-FlorianMultilingualNeural');
    assert.strictEqual(narr.intencao, 'narracao_suspense');
    assert.strictEqual(narr.tom, '-6Hz');
    assert.strictEqual(mara.voz, 'pt-BR-ThalitaMultilingualNeural');
    assert.strictEqual(mara.textoFalado, 'Davi, atende.');
    assert.ok(mara.inicioS > narr.fimS);

    // 2ª vez: tudo do cache, sem chamar o Python
    const segunda = await F.gerarFalasEpisodio('teste-integracao', 1);
    assert.ok(segunda.doc.falas.every((f) => f.doCache));

    const leg = L.gerarLegendasEpisodio('teste-integracao', 1, { modo: 'palavra' });
    const srt = fs.readFileSync(leg.arquivos['legendas.srt'], 'utf8');
    assert.match(srt, /O farol apagou\./);
    assert.match(srt, /Davi, atende\./);

    const mix = await T.mixarEpisodio({
        falas: doc.falas.map((f) => ({ arquivo: path.join(pastaSerie, f.arquivo), inicioS: f.inicioS, duracaoS: f.duracaoS })),
        duracaoS: doc.duracaoS, ambiente: 0.1, saida: path.join(pastaSerie, 'episodios', 'ep01', 'audio', 'episodio.wav'),
    });
    const final = await T.medirLoudness(mix.saida);
    assert.ok(Math.abs(final.I - -14) < 1.5, `master em ${final.I} LUFS`);
    assert.ok(final.TP <= -1.0, `pico ${final.TP} dBTP`);
});
