// verificarContinuidade: contradições determinísticas + verificação opcional por LLM falso.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { verificarContinuidade, carregarSerie } = require('../src/memoria');
const { ocorrenciasAfirmativas } = require('../src/memoria/continuidade');

const DOCS = path.join(__dirname, '..', '..', 'docs', 'exemplos');
const SERIE = path.join(DOCS, 'o-ultimo-farol');
const roteiroBase = () => JSON.parse(fs.readFileSync(path.join(DOCS, 'farol-ep01-roteiro.json'), 'utf8'));
const tipos = (r) => r.problemas.map((p) => `${p.nivel}:${p.tipo}`);

// Série em memória (sem disco): o exemplo com o estado alterado.
function serieCom(alterar) {
    const s = carregarSerie(SERIE);
    s.memoria.estado = JSON.parse(JSON.stringify(s.memoria.estado));
    alterar(s);
    return s;
}

test('o roteiro de exemplo do Ep. 1 passa (só o aviso de Davi chegar ao canal)', async () => {
    const r = await verificarContinuidade(roteiroBase(), SERIE);
    assert.strictEqual(r.ok, true);
    assert.deepStrictEqual(tipos(r), ['aviso:personagem_deslocado']);
    assert.strictEqual(r.problemas[0].fatoId, 'ep00-007');
    assert.ok(Array.isArray(r.prompt) && r.prompt[0].role === 'system');
    assert.strictEqual(r.custoUsd, 0);
});

test('personagem morto em cena é erro', async () => {
    const s = serieCom((x) => { x.memoria.estado.personagens.davi.vivo = false; });
    const r = await verificarContinuidade(roteiroBase(), s);
    assert.strictEqual(r.ok, false);
    assert.ok(tipos(r).includes('erro:morto_em_cena'));
});

test('objeto fixo fora do lugar é erro; objeto levado por quem estava com ele não é', async () => {
    const rot = roteiroBase();
    rot.planos[4].objetos = ['barra', 'radio']; // rádio é fixo na sala e aparece na porta
    const r = await verificarContinuidade(rot, SERIE);
    assert.ok(r.problemas.some((p) => p.nivel === 'erro' && p.tipo === 'objeto_fora_do_lugar' && p.plano === 5 && /Rádio/.test(p.texto)));

    const rot2 = roteiroBase();
    rot2.planos[4].objetos = ['barra', 'binoculos']; // Mara estava na sala (onde ficam os binóculos) e foi à porta
    const r2 = await verificarContinuidade(rot2, SERIE);
    assert.ok(!r2.problemas.some((p) => p.tipo === 'objeto_fora_do_lugar'));

    const rot3 = roteiroBase();
    rot3.planos[5].objetos = ['lancha', 'bolsa']; // bolsa está no depósito; Davi nunca esteve lá
    const r3 = await verificarContinuidade(rot3, SERIE);
    assert.ok(r3.problemas.some((p) => p.nivel === 'erro' && p.tipo === 'objeto_fora_do_lugar' && /Bolsa/.test(p.texto)));
});

test('regra com termo proibido: "ponte" acusa, "sem ponte" não', async () => {
    assert.strictEqual(ocorrenciasAfirmativas('7 KM · SEM PONTE', 'ponte'), 0);
    assert.strictEqual(ocorrenciasAfirmativas('Mara corre pela ponte', 'ponte'), 1);
    assert.strictEqual(ocorrenciasAfirmativas('Não há pontes', 'ponte'), 0);
    const rot = roteiroBase();
    rot.planos[4].visual = 'Mara atravessa a ponte velha até o cais.';
    const r = await verificarContinuidade(rot, SERIE);
    const p = r.problemas.find((x) => x.tipo === 'regra_quebrada');
    assert.ok(p && p.plano === 5 && p.fatoId === 'ep00-001');
});

test('Ep. 2 que ignora a consequência pendente da escolha recebe aviso', async () => {
    const s = serieCom((x) => {
        x.memoria.estado.atualizadoAte = 'ep01';
        x.memoria.estado.consequenciasPendentes = [{ paraEp: 2, texto: 'A lancha acha o canal, mas o feixe atrai corpos para a ilhota.' }];
    });
    const rot = roteiroBase();
    rot.n = 2;
    rot.titulo = 'Outro assunto';
    rot.resumo = 'Mara conserta o gerador.';
    rot.objetivo = '';
    rot.gancho = '';
    rot.planos = rot.planos.map((p) => ({ ...p, visual: 'Mara mexe no gerador.', tela: '', falas: [] }));
    const r = await verificarContinuidade(rot, s);
    assert.ok(r.problemas.some((p) => p.tipo === 'escolha_ignorada'));
    const ok = await verificarContinuidade({ ...rot, resumo: 'O feixe aceso atrai corpos e a lancha chega ao canal.' }, s);
    assert.ok(!ok.problemas.some((p) => p.tipo === 'escolha_ignorada'));
});

test('glossário: nome que a voz não fala e grafia errada', async () => {
    const rot = roteiroBase();
    rot.planos[5].falas[0].texto = 'Mara, é o Davi! Acende o farol!';
    rot.planos[0].tela = 'O ÚLTIMO FAROL · MARIA';
    const r = await verificarContinuidade(rot, SERIE);
    assert.ok(r.problemas.some((p) => p.tipo === 'pronuncia' && p.plano === 6));
    assert.ok(r.problemas.some((p) => p.tipo === 'grafia' && p.plano === 1));
});

test('ferimento que o visual não mostra vira aviso', async () => {
    const s = serieCom((x) => { x.memoria.estado.personagens.mara.ferimentos = [{ onde: 'braço esquerdo', descricao: 'corte enfaixado' }]; });
    const r = await verificarContinuidade(roteiroBase(), s);
    assert.ok(r.problemas.some((p) => p.tipo === 'ferimento' && p.plano === 3));
    const rot = roteiroBase();
    rot.planos[2].visual += ' O braço esquerdo enfaixado.';
    rot.planos[4].visual += ' Curativo no braço.';
    const r2 = await verificarContinuidade(rot, s);
    assert.ok(!r2.problemas.some((p) => p.tipo === 'ferimento'));
});

test('verificação por LLM falso soma contradições (origem llm) e custo', async () => {
    const chamarLLM = async (mensagens) => {
        assert.match(mensagens[0].content, /supervisor de continuidade/);
        return { conteudo: '{"contradicoes":[{"plano":6,"tipo":"segredo_revelado","gravidade":"erro","texto":"Davi não sabe da mordida.","fatoId":"ep00-015"}]}', custoUsd: 0.0004 };
    };
    const r = await verificarContinuidade(roteiroBase(), SERIE, { chamarLLM });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.custoUsd, 0.0004);
    assert.ok(r.problemas.some((p) => p.origem === 'llm' && p.tipo === 'segredo_revelado' && p.plano === 6));
    const ruim = await verificarContinuidade(roteiroBase(), SERIE, { chamarLLM: async () => ({ conteudo: 'nada', custoUsd: 0 }) });
    assert.ok(ruim.problemas.some((p) => p.tipo === 'llm_invalido'));
});

test('aceita só a memória (sem série no disco)', async () => {
    const memoria = {
        fatos: [{ id: 'f1', tipo: 'regra', texto: 'Ninguém atravessa a ponte.', desde: 'ep00', ate: null, importancia: 3, proibido: ['ponte'] }],
        estado: { personagens: { mara: { nome: 'Mara', onde: 'sala', vivo: false } }, objetos: {} },
    };
    const rot = { n: 1, planos: [{ n: 1, deS: 0, ateS: 5, tipo: 'video_ia', local: 'sala', elenco: ['mara'], objetos: [], visual: 'Mara na ponte.', falas: [] }] };
    const r = await verificarContinuidade(rot, memoria);
    assert.ok(tipos(r).includes('erro:morto_em_cena'));
    assert.ok(tipos(r).includes('aviso:regra_quebrada'));
});
