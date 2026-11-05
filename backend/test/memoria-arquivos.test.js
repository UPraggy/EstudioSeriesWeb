// Memória: leitura/gravação (fatos.jsonl só cresce, última linha vence, vigência por episódio).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const A = require('../src/memoria/arquivos');
const { acrescentarJsonl, lerJsonl } = require('../src/memoria/util');

const EXEMPLO = path.join(__dirname, '..', '..', 'docs', 'exemplos', 'o-ultimo-farol');

function copiaDoExemplo() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'memoria-arq-'));
    const pasta = path.join(dir, 'o-ultimo-farol');
    fs.cpSync(EXEMPLO, pasta, { recursive: true });
    return { dir, pasta };
}

test('colapsarFatos: a última linha com o mesmo id vence campo a campo', () => {
    const f = A.colapsarFatos([
        { id: 'ep00-001', tipo: 'regra', texto: 'Sem ponte.', desde: 'ep00', ate: null },
        { id: 'ep00-002', tipo: 'objeto', texto: 'Barra na porta.', desde: 'ep00', ate: null },
        { id: 'ep00-002', ate: 'ep02', motivoFim: 'levada' },
    ]);
    assert.strictEqual(f.length, 2);
    const barra = f.find((x) => x.id === 'ep00-002');
    assert.strictEqual(barra.texto, 'Barra na porta.');
    assert.strictEqual(barra.ate, 'ep02');
});

test('fatosVigentes: vale no INÍCIO do episódio (desde < ep <= ate)', () => {
    const fatos = [
        { id: 'a', desde: 'ep00', ate: null },
        { id: 'b', desde: 'ep01', ate: null },
        { id: 'c', desde: 'ep00', ate: 'ep02' },
    ];
    const ids = (ep) => A.fatosVigentes(fatos, ep).map((f) => f.id).sort().join(',');
    assert.strictEqual(ids(1), 'a,c'); // o que acontece no ep01 ainda não vale no início dele
    assert.strictEqual(ids(2), 'a,b,c'); // "c" deixou de valer DURANTE o ep02
    assert.strictEqual(ids(3), 'a,b');
    assert.strictEqual(ids(null), 'a,b'); // agora = em aberto
});

test('JSONL: acrescenta mesmo sem quebra de linha final e não quebra com linha inválida', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'memoria-jsonl-'));
    const arq = path.join(dir, 'fatos.jsonl');
    fs.writeFileSync(arq, '{"id":"x"}'); // editado à mão, sem \n
    acrescentarJsonl(arq, [{ id: 'y' }]);
    fs.appendFileSync(arq, 'isto não é json\n');
    const { itens, erros } = lerJsonl(arq);
    assert.deepStrictEqual(itens.map((i) => i.id), ['x', 'y']);
    assert.strictEqual(erros.length, 1);
    fs.rmSync(dir, { recursive: true, force: true });
});

test('carregarSerie lê série, bíblia, fichas e memória do exemplo do Farol', () => {
    const s = A.carregarSerie(EXEMPLO);
    assert.strictEqual(s.serie.id, 'o-ultimo-farol');
    assert.ok(s.fichas.elenco.mara && s.fichas.locais.sala && s.fichas.objetos.radio);
    assert.strictEqual(s.fichas.elenco.mara._pasta, 'elenco/mara');
    assert.ok(s.memoria.fatos.length >= 10);
    assert.strictEqual(s.memoria.estado.atualizadoAte, 'ep00');
    assert.ok(s.memoria.glossario.termos.some((t) => t.termo === 'Davi'));
});

test('aplicarProposta: acrescenta fatos, encerra por id, grava estado/resumo e guarda o estado anterior', () => {
    const { dir, pasta } = copiaDoExemplo();
    const antes = fs.readFileSync(path.join(pasta, 'memoria', 'fatos.jsonl'), 'utf8');
    const gravados = A.aplicarProposta(pasta, {
        ep: 'ep01',
        fatosNovos: [{ id: 'ep01-001', tipo: 'evento', texto: 'Teste.', fonte: 'ep01', desde: 'ep01', ate: null, importancia: 2, sobre: [] }],
        fatosEncerrados: [{ id: 'ep00-011', ate: 'ep01', motivo: 'teste' }],
        estadoNovo: { versao: 1, atualizadoAte: 'ep01', personagens: {}, objetos: {} },
        resumo: '# Ep. 1\n\nResumo.',
        glossarioNovo: [{ termo: 'Novo', tipo: 'personagem' }],
    });
    const depois = fs.readFileSync(path.join(pasta, 'memoria', 'fatos.jsonl'), 'utf8');
    assert.ok(depois.startsWith(antes), 'o arquivo de fatos só cresce');
    const m = A.carregarMemoria(pasta);
    assert.strictEqual(m.fatos.find((f) => f.id === 'ep00-011').ate, 'ep01');
    assert.strictEqual(m.estado.atualizadoAte, 'ep01');
    assert.match(m.resumos[1], /Resumo/);
    assert.ok(m.glossario.termos.some((t) => t.termo === 'Novo'));
    assert.ok(gravados.some((g) => g.startsWith('memoria/historico/estado-antes-ep01')));
    assert.ok(fs.existsSync(path.join(pasta, 'memoria', 'propostas', 'ep01.json')));
    fs.rmSync(dir, { recursive: true, force: true });
});

test('caminhoSerie só aceita slug (não sai da pasta de dados)', () => {
    assert.throws(() => A.caminhoSerie('../segredo'), /serieId inválido/);
    assert.throws(() => A.caminhoSerie('C:\\Windows'), /serieId inválido/);
    assert.match(A.caminhoSerie('o-ultimo-farol'), /series[\\/]o-ultimo-farol$/);
});
