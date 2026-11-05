const test = require('node:test');
const assert = require('node:assert');
const v = require('../src/series/validar');
const armazem = require('../src/series/armazem');
const { roteiroValido } = require('./series-ajuda');

const ctx = { elenco: ['mara', 'narrador', 'davi'], locais: ['farol'], objetos: [] };

test('roteiro válido de 60 s passa sem erros', () => {
    const r = v.validarRoteiro(roteiroValido(), ctx);
    assert.deepStrictEqual(r.erros, []);
    assert.strictEqual(r.ok, true);
});

test('soma das durações fora de 60 ±3 s é erro; dentro da tolerância passa', () => {
    const curto = roteiroValido();
    curto.planos = curto.planos.slice(0, 6); // termina em 47 s
    const r = v.validarRoteiro(curto, ctx);
    assert.strictEqual(r.ok, false);
    assert.ok(r.erros.some((e) => e.includes('somam 47 s') && e.includes('60 s')));

    const quase = roteiroValido();
    quase.planos[7].ateS = 57; // soma 57 = 60 - 3
    assert.strictEqual(v.validarRoteiro(quase, ctx).ok, true);
});

test('plano com menos de 2 s ou mais de 10 s é erro', () => {
    const r1 = roteiroValido();
    r1.planos = [
        { n: 1, deS: 0, ateS: 1, tipo: 'video_ia', falas: [] },
        ...Array.from({ length: 6 }, (_, i) => ({ n: i + 2, deS: 1 + i * 10, ateS: 11 + i * 10, tipo: 'video_ia', falas: [] })),
    ];
    const r = v.validarRoteiro(r1, ctx);
    assert.ok(r.erros.some((e) => e.startsWith('plano 1:') && e.includes('de 2 a 10 s')));

    const r2 = roteiroValido();
    r2.planos[4].ateS = 40; // 28→40 = 12 s
    r2.planos[5].deS = 40;
    r2.planos[5].ateS = 47; // mantém a soma
    const res2 = v.validarRoteiro(r2, ctx);
    assert.ok(res2.erros.some((e) => e.startsWith('plano 5:') && e.includes('12 s')));
});

test('fala longa: aviso acima de ~15 palavras por 8 s e erro quando não cabe', () => {
    const r = roteiroValido();
    r.planos[1].falas = [{ quem: 'narrador', texto: Array(19).fill('palavra').join(' '), via: 'em_cena' }]; // 8 s
    const res = v.validarRoteiro(r, ctx);
    assert.strictEqual(res.ok, true);
    assert.ok(res.avisos.some((a) => a.startsWith('plano 2:') && a.includes('19 palavras')));

    r.planos[1].falas[0].texto = Array(30).fill('palavra').join(' ');
    const res2 = v.validarRoteiro(r, ctx);
    assert.strictEqual(res2.ok, false);
    assert.ok(res2.erros.some((e) => e.startsWith('plano 2:') && e.includes('não cabem')));
});

test('"quem" precisa existir no elenco (ou ser narrador/alerta)', () => {
    const r = roteiroValido();
    r.planos[2].falas = [{ quem: 'fantasma', texto: 'Oi.', via: 'radio' }];
    const res = v.validarRoteiro(r, ctx);
    assert.ok(res.erros.some((e) => e.includes('"fantasma" não existe no elenco')));
    r.planos[2].falas = [{ quem: 'alerta', texto: 'Alerta no terminal.', via: 'radio' }];
    assert.strictEqual(v.validarRoteiro(r, ctx).ok, true);
});

test('escolhas A e B iguais (ignorando acento e caixa) são erro', () => {
    const r = roteiroValido();
    r.escolhas.B.texto = 'acender o farol';
    const res = v.validarRoteiro(r, ctx);
    assert.ok(res.erros.some((e) => e.includes('A e B são iguais')));
    delete r.escolhas.B;
    assert.ok(v.validarRoteiro(r, ctx).erros.some((e) => e.includes('escolha B precisa de "texto"')));
});

test('tipo de plano e via inválidos são erro', () => {
    const r = roteiroValido();
    r.planos[0].tipo = 'VÍDEO IA';
    r.planos[0].falas[0].via = 'grito';
    const res = v.validarRoteiro(r, ctx);
    assert.ok(res.erros.some((e) => e.startsWith('plano 1:') && e.includes('"tipo"')));
    assert.ok(res.erros.some((e) => e.startsWith('plano 1, fala 1:') && e.includes('"via"')));
});

test('contarPalavras conta palavras com acento e ignora pontuação', () => {
    assert.strictEqual(v.contarPalavras('Mara, é o Davi! Acende o farol pra eu achar o canal…'), 12);
    assert.strictEqual(v.contarPalavras('Ele estava morto…'), 3);
    assert.strictEqual(v.contarPalavras(''), 0);
});

test('caminhoRelativoSeguro recusa absolutos e ".."', () => {
    assert.strictEqual(v.caminhoRelativoSeguro('ref/padrao-frente.png'), true);
    for (const ruim of ['../x.png', 'ref/../../x', 'C:\\x.png', '/etc/passwd', '\\\\servidor\\x', '']) {
        assert.strictEqual(v.caminhoRelativoSeguro(ruim), false, ruim);
    }
});

test('serie e bíblia vazias criadas pelo armazém são válidas', () => {
    const s = armazem.modeloSerie({ id: 'teste', titulo: 'Teste' });
    assert.strictEqual(v.validarSerie(s).ok, true);
    assert.strictEqual(v.validarBiblia(armazem.bibliaVazia()).ok, true);
    s.vozes.mara = 'pt-BR-AntonioNeural';
    assert.ok(v.validarSerie(s).erros.some((e) => e.includes('não está na lista recomendada')));
});

test('ficha: voz fora da lista, estadoAtual inexistente e canônica com ".." são erro', () => {
    const f = {
        versao: 1, id: 'mara', tipo: 'personagem', nome: 'Mara', papel: '', ancora: 'mulher',
        voz: 'pt-BR-FranciscaNeural', tom: '+0Hz',
        estados: [{ id: 'padrao', refs: { frente: 'ref/a.png' } }], estadoAtual: 'ferida',
        canonica: '../../segredo.png', origem: 'importada',
    };
    const r = v.validarFicha(f);
    assert.strictEqual(r.ok, false);
    assert.ok(r.erros.some((e) => e.includes('lista recomendada')));
    assert.ok(r.erros.some((e) => e.includes('estadoAtual')));
    assert.ok(r.erros.some((e) => e.includes('canonica')));
});

test('planos: dependência inexistente, ciclo e take escolhido inexistente são erro', () => {
    const doc = {
        versao: 1,
        planos: [
            { n: 1, tipo: 'video_ia', duracaoS: 8, prompt: 'x', dependeDe: [2], takes: [], takeEscolhido: null },
            { n: 2, tipo: 'video_ia', duracaoS: 8, prompt: 'y', dependeDe: [1, 9], takes: [{ id: 'take_01', fase: 'rascunho', caminho: 'takes/p02/take_01.mp4', status: 'pronto' }], takeEscolhido: 'take_02' },
        ],
    };
    const r = v.validarPlanos(doc);
    assert.ok(r.erros.some((e) => e.includes('plano 9, que não existe')));
    assert.ok(r.erros.some((e) => e.includes('dependência circular')));
    assert.ok(r.erros.some((e) => e.includes('takeEscolhido')));
});

test('votação: vencedora precisa bater com os votos', () => {
    const ok = { versao: 1, ep: 1, votos: { A: 10, B: 3 }, vencedora: 'A', fonte: 'manual', registradaEm: '2026-11-04T12:00:00Z' };
    assert.strictEqual(v.validarVotacao(ok).ok, true);
    assert.strictEqual(v.validarVotacao({ ...ok, vencedora: 'B' }).ok, false);
    assert.strictEqual(v.calcularVencedora(5, 5), 'empate');
});
