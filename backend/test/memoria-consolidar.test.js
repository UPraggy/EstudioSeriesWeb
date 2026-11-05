// consolidarEpisodio: gera PROPOSTA (regras e/ou LLM falso); só grava com aprovar=true; votação nunca vem da IA.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { consolidarEpisodio, semearDaBiblia, carregarMemoria, fatosVigentes, montarContexto } = require('../src/memoria');

const DOCS = path.join(__dirname, '..', '..', 'docs', 'exemplos');
const ROTEIRO = { ...JSON.parse(fs.readFileSync(path.join(DOCS, 'farol-ep01-roteiro.json'), 'utf8')), aprovado: true };
const VOTO_A = { versao: 1, ep: 1, votos: { A: 120, B: 80 }, vencedora: 'A', fonte: 'manual', registradaEm: '2026-11-10T12:00:00Z' };

function serieTemporaria() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'memoria-cons-'));
    const pasta = path.join(dir, 'o-ultimo-farol');
    fs.cpSync(path.join(DOCS, 'o-ultimo-farol'), pasta, { recursive: true });
    fs.mkdirSync(path.join(pasta, 'episodios', 'ep01'), { recursive: true });
    fs.writeFileSync(path.join(pasta, 'episodios', 'ep01', 'roteiro.json'), JSON.stringify(ROTEIRO));
    return { pasta, limpar: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

const lerFatos = (pasta) => fs.readFileSync(path.join(pasta, 'memoria', 'fatos.jsonl'), 'utf8');

test('proposta por regras: não toca nos arquivos canônicos e guarda o rascunho', async () => {
    const t = serieTemporaria();
    try {
        const antes = lerFatos(t.pasta);
        const estadoAntes = fs.readFileSync(path.join(t.pasta, 'memoria', 'estado.json'), 'utf8');
        const p = await consolidarEpisodio(t.pasta, 1, { votacao: VOTO_A });
        assert.strictEqual(p.aprovada, false);
        assert.strictEqual(p.origem, 'regras');
        assert.strictEqual(lerFatos(t.pasta), antes);
        assert.strictEqual(fs.readFileSync(path.join(t.pasta, 'memoria', 'estado.json'), 'utf8'), estadoAntes);
        assert.strictEqual(p.arquivo, 'memoria/propostas/ep01.json');
        // posições: Davi foi para o canal (fato com chave encerra o antigo); Mara terminou onde começou (sem fato)
        const davi = p.fatosNovos.find((f) => f.chave === 'personagem:davi:onde');
        assert.match(davi.texto, /Davi termina o Ep\. 1 em .*canal/);
        assert.ok(p.fatosEncerrados.some((e) => e.id === 'ep00-007' && e.ate === 'ep01'));
        assert.ok(!p.fatosNovos.some((f) => f.chave === 'personagem:mara:onde'));
        assert.strictEqual(p.estadoNovo.personagens.mara.onde, 'sala');
        assert.strictEqual(p.estadoNovo.objetos.barra.estado, 'travando a porta do cais');
        // escolha real + consequência pendente para o Ep. 2
        assert.ok(p.fatosNovos.some((f) => f.fonte === 'ep01/votacao' && /escolheu A: ACENDER O FAROL/.test(f.texto)));
        assert.deepStrictEqual(p.estadoNovo.escolhas.map((e) => [e.ep, e.vencedora]), [[1, 'A']]);
        assert.strictEqual(p.estadoNovo.consequenciasPendentes[0].paraEp, 2);
        assert.match(p.resumo, /Escolha do público: A — ACENDER O FAROL \(A 120 × B 80\)/);
        assert.ok(p.fatosNovos.every((f, i) => f.id === `ep01-${String(i + 1).padStart(3, '0')}`));
        assert.ok(p.mudancas.some((m) => /Davi · onde: cidade → canal/.test(m)));
    } finally { t.limpar(); }
});

test('sem votação registrada: nenhuma escolha é inventada', async () => {
    const t = serieTemporaria();
    try {
        const p = await consolidarEpisodio(t.pasta, 1, { votacao: null, salvarProposta: false });
        assert.deepStrictEqual(p.estadoNovo.escolhas, []);
        assert.ok(!p.fatosNovos.some((f) => /escolheu/.test(f.texto)));
        assert.ok(p.avisos.some((a) => /Votação ainda não registrada/.test(a)));
        const falsa = await consolidarEpisodio(t.pasta, 1, { votacao: { vencedora: 'A' }, salvarProposta: false }); // sem fonte
        assert.deepStrictEqual(falsa.estadoNovo.escolhas, []);
    } finally { t.limpar(); }
});

test('com LLM falso: resumo e fatos da IA entram; votação e posição dos planos não são da IA', async () => {
    const t = serieTemporaria();
    const chamadas = [];
    const chamarLLM = async (mensagens, op) => {
        chamadas.push({ mensagens, op });
        return {
            custoUsd: 0.0007,
            conteudo: '```json\n' + JSON.stringify({
                resumo: 'Mara vê o surto começar e Davi pede a luz do farol.',
                fatosNovos: [
                    { tipo: 'relacao', texto: 'Davi confia que Mara vai acender o farol.', sobre: ['davi', 'mara'], importancia: 2 },
                    { tipo: 'evento', texto: 'O público escolheu B na votação.', importancia: 3 },
                    { tipo: 'esquisito', texto: 'Tipo inválido vira evento.', importancia: 7 },
                ],
                fatosEncerrados: [{ id: 'nao-existe', motivo: 'x' }],
                estado: {
                    personagens: { davi: { onde: 'sala', condicao: 'com frio' } },
                    escolhas: [{ ep: 1, vencedora: 'B' }],
                },
                glossario: [{ termo: 'Ponta Norte' }, { termo: 'Canal Leste', tipo: 'local' }],
            }) + '\n```',
        };
    };
    try {
        const p = await consolidarEpisodio(t.pasta, 1, { votacao: VOTO_A, chamarLLM, salvarProposta: false });
        assert.strictEqual(chamadas.length, 1);
        assert.strictEqual(chamadas[0].op.json, true);
        assert.strictEqual(p.origem, 'regras+llm');
        assert.strictEqual(p.custoUsd, 0.0007);
        assert.match(p.resumo, /Davi pede a luz do farol/);
        assert.match(p.resumo, /Escolha do público: A/); // linha da escolha sempre da votação real
        assert.ok(p.fatosNovos.some((f) => f.tipo === 'relacao'));
        assert.ok(!p.fatosNovos.some((f) => /escolheu B/.test(f.texto)));
        assert.ok(p.fatosNovos.some((f) => f.texto === 'Tipo inválido vira evento.' && f.tipo === 'evento' && f.importancia === 3));
        assert.strictEqual(p.estadoNovo.personagens.davi.onde, 'canal'); // o que os planos mostraram vence
        assert.strictEqual(p.estadoNovo.personagens.davi.condicao, 'com frio');
        assert.deepStrictEqual(p.estadoNovo.escolhas.map((e) => e.vencedora), ['A']);
        assert.deepStrictEqual(p.glossarioNovo.map((g) => g.termo), ['Canal Leste']);
        assert.ok(p.consertos.some((c) => /votação vindo da IA/.test(c)));
        assert.ok(p.consertos.some((c) => /nao-existe/.test(c)));
    } finally { t.limpar(); }
});

test('IA com JSON quebrado: fica só a proposta por regras, com aviso', async () => {
    const t = serieTemporaria();
    try {
        const p = await consolidarEpisodio(t.pasta, 1, { votacao: VOTO_A, chamarLLM: async () => ({ conteudo: 'desculpe, não sei', custoUsd: 0.0001 }), salvarProposta: false });
        assert.strictEqual(p.origem, 'regras');
        assert.ok(p.avisos.some((a) => /não devolveu JSON válido/.test(a)));
    } finally { t.limpar(); }
});

test('aprovar grava; o próximo roteiro já recebe a escolha, a consequência e o resumo', async () => {
    const t = serieTemporaria();
    try {
        const proposta = await consolidarEpisodio(t.pasta, 1, { votacao: VOTO_A });
        proposta.resumo = proposta.resumo.replace('Mara está sozinha', 'Mara (editado pelo Rafael) está sozinha');
        const r = await consolidarEpisodio(t.pasta, 1, { aprovar: true, proposta });
        assert.strictEqual(r.aprovada, true);
        assert.ok(r.gravados.includes('memoria/fatos.jsonl'));
        const m = carregarMemoria(t.pasta);
        assert.strictEqual(m.estado.atualizadoAte, 'ep01');
        assert.match(m.resumos[1], /editado pelo Rafael/);
        const vig2 = fatosVigentes(m.fatos, 2).map((f) => f.id);
        assert.ok(vig2.includes('ep01-001'));
        assert.ok(!vig2.includes('ep00-007')); // posição antiga do Davi encerrada
        const ctx = await montarContexto(t.pasta, 'roteiro', { ep: 2 });
        const u = ctx.mensagens[1].content;
        assert.match(u, /PENDENTE para o Ep\. 2: Ep\. 2: a lancha acha o canal/);
        assert.match(u, /Ep\. 1: venceu A — ACENDER O FAROL/);
        assert.match(u, /editado pelo Rafael/);
        assert.match(u, /Davi \(davi\): vivo · em Canal leste/);
    } finally { t.limpar(); }
});

test('aprovar com proposta de outro episódio é recusado', async () => {
    const t = serieTemporaria();
    try {
        await assert.rejects(consolidarEpisodio(t.pasta, 2, { aprovar: true, proposta: { ep: 'ep01' } }), /é do ep01/);
    } finally { t.limpar(); }
});

test('semearDaBiblia: regras viram fatos ep00 de importância 3 e o estado inicial sai da bíblia', () => {
    const t = serieTemporaria();
    try {
        fs.rmSync(path.join(t.pasta, 'memoria'), { recursive: true, force: true });
        const p = semearDaBiblia(t.pasta);
        assert.strictEqual(p.aprovada, false);
        assert.ok(!fs.existsSync(path.join(t.pasta, 'memoria', 'fatos.jsonl')));
        const regras = p.fatosNovos.filter((f) => f.tipo === 'regra');
        assert.strictEqual(regras.length, 5);
        assert.ok(regras.every((f) => f.importancia === 3 && f.desde === 'ep00'));
        assert.strictEqual(p.estadoNovo.objetos.barra.onde, 'porta');
        assert.strictEqual(p.estadoNovo.personagens.mara.onde, 'sala');
        assert.ok(!p.estadoNovo.personagens.narrador); // apresentador fora do mundo
        semearDaBiblia(t.pasta, { aprovar: true });
        assert.ok(carregarMemoria(t.pasta).fatos.length >= 10);
    } finally { t.limpar(); }
});
