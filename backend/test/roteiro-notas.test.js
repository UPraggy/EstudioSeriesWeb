// Observações do roteiro, revisão com ajustes, histórico de propostas e as regras de piloto/nexo/cartões.
// LLM FALSO (nada pago); dados numa pasta temporária.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const { executarEtapa } = require('../src/showrunner');
const V = require('../src/showrunner/validar');
const { SISTEMA } = require('../src/showrunner/prompts');

const DOCS = path.join(__dirname, '..', '..', 'docs', 'exemplos');
const roteiroExemplo = () => JSON.parse(fs.readFileSync(path.join(DOCS, 'farol-ep01-roteiro.json'), 'utf8'));
const CTA = 'Comente A ou B. A mais votada decide o próximo episódio.';

function falso(...respostas) {
    const chamadas = [];
    const f = async (mensagens, op) => {
        chamadas.push({ mensagens, op });
        const r = respostas[Math.min(chamadas.length - 1, respostas.length - 1)];
        return { conteudo: typeof r === 'string' ? r : JSON.stringify(r), custoUsd: 0.0012 };
    };
    f.chamadas = chamadas;
    return f;
}

function dadosTemporarios() {
    const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'estudio-notas-'));
    const pasta = path.join(dados, 'series', 'o-ultimo-farol');
    fs.cpSync(path.join(DOCS, 'o-ultimo-farol'), pasta, { recursive: true });
    // o exemplo usa "planejado" no mapa da temporada; o armazém só aceita os status do CONTRATOS ao gravar a bíblia
    const arqBiblia = path.join(pasta, 'biblia.json');
    const biblia = JSON.parse(fs.readFileSync(arqBiblia, 'utf8'));
    (biblia.temporada || []).forEach((e) => { if (e.status === 'planejado') e.status = 'ideia'; });
    fs.writeFileSync(arqBiblia, JSON.stringify(biblia));
    fs.mkdirSync(path.join(pasta, 'episodios', 'ep01'), { recursive: true });
    return { dados, pasta, limpar: () => fs.rmSync(dados, { recursive: true, force: true }) };
}

// ---------------------------------------------------------------- prompts
test('prompt do roteiro: Ep. 1 é piloto (apresenta a protagonista), Ep. 2+ abre com "Antes:", nexo e cartões em todos', () => {
    const piloto = SISTEMA.roteiro(false, 30, false, 1);
    assert.match(piloto, /PILOTO \(Ep\. 1\)/);
    assert.match(piloto, /nome da protagonista/);
    assert.match(piloto, /Até ~11 s/); // 35% de 30 s
    assert.match(piloto, /NEXO/);
    assert.match(piloto, /consequência do anterior|CONSEQUÊNCIA do anterior/i);
    assert.match(piloto, /"tela" é EXATAMENTE "CARTÕES A \/ B"/);
    assert.match(piloto, /NARRADOR LÊ as duas opções/);
    assert.match(piloto, /CTA é FALADO pelo narrador/);
    const ep2 = SISTEMA.roteiro(false, 60, false, 2);
    assert.match(ep2, /"Antes: …"/);
    assert.doesNotMatch(ep2, /PILOTO/);
    const curto = SISTEMA.roteiro(false, 5, true, 1);
    assert.match(curto, /UMA frase que situe/);
    assert.doesNotMatch(curto, /CARTÕES A \/ B/); // sem votação, sem cartões
});

// ---------------------------------------------------------------- validação: cartões, CTA, piloto, silêncio
test('validação: opções A/B no "tela" viram "CARTÕES A / B" e o narrador passa a ler as opções; CTA sai do "tela" e vira fala', () => {
    const r = roteiroExemplo();
    r.planos[6].tela = 'A: ACENDER O FAROL\nB: DEIXAR APAGADO';
    r.planos[6].falas = [{ quem: 'narrador', texto: 'A luz guia o irmão.', via: 'narracao' }];
    r.planos[7].tela = 'COMENTE A OU B. A MAIS VOTADA DECIDE.';
    r.planos[7].falas = []; // o caso real: CTA só no "tela", sem fala nenhuma
    const v = V.validarRoteiro(r, { ep: 1 });
    assert.deepStrictEqual(v.erros, []);
    assert.strictEqual(v.valor.planos[6].tela, 'CARTÕES A / B');
    assert.ok(v.consertos.some((c) => /plano 7: opções A\/B escritas no "tela"/.test(c)));
    const falas7 = v.valor.planos[6].falas.map((f) => f.texto).join(' ');
    assert.match(falas7, /Acender o farol ou deixar apagado\?/);
    assert.strictEqual(v.valor.planos[7].tela, '');
    assert.ok(v.valor.planos[7].falas.some((f) => f.quem === 'narrador' && f.texto === CTA));
    assert.ok(v.consertos.some((c) => /CTA que estava no "tela" virou fala/.test(c)));
    assert.ok(!v.avisos.some((a) => /não fala o CTA/.test(a)));
    // fala que não cabe: o CTA sai do "tela" e vem um aviso (nunca passa do limite de palavras)
    const r2 = roteiroExemplo();
    r2.planos[7].tela = 'COMENTE A OU B';
    r2.planos[7].falas = [{ quem: 'narrador', texto: 'Agora é com você, decida.', via: 'narracao' }];
    const v2 = V.validarRoteiro(r2, { ep: 1 });
    assert.strictEqual(v2.valor.planos[7].tela, '');
    assert.ok(v2.avisos.some((a) => /CTA estava no "tela" e não coube/.test(a)));
});

test('validação: aviso de piloto sem a protagonista no começo e de plano mudo com mais de 3 s', () => {
    const r = roteiroExemplo();
    r.planos[0].falas = [{ quem: 'narrador', texto: 'O farol acendeu sozinho.', via: 'narracao' }];
    r.planos[1].falas = [{ quem: 'narrador', texto: 'Quem está batendo no vidro?', via: 'narracao' }];
    r.planos[2].falas = [];
    const v = V.validarRoteiro(r, { ep: 1, protagonista: { id: 'mara', nome: 'Mara' } });
    assert.ok(v.avisos.some((a) => /piloto\): o nome da protagonista \(Mara\) não aparece nas falas dos primeiros 21 s/.test(a)), v.avisos.join('\n'));
    assert.ok(v.avisos.some((a) => /plano 3: 8 s sem fala nenhuma/.test(a)));
    // gancho mudo é permitido; Ep. 2 não cobra a apresentação
    const r2 = roteiroExemplo();
    r2.planos[0].falas = [];
    const v2 = V.validarRoteiro(r2, { ep: 2, protagonista: { nome: 'Mara' } });
    assert.ok(!v2.avisos.some((a) => /sem fala nenhuma|piloto/.test(a)), v2.avisos.join('\n'));
});

// ---------------------------------------------------------------- etapa roteiro: revisão
test('etapa roteiro em revisão: manda o roteiro atual + ajustes, mantém as regras e valida igual', async () => {
    const base = { ...roteiroExemplo(), aprovado: true };
    const revisado = { ...roteiroExemplo(), titulo: 'Sete Quilômetros de Neblina' };
    const llm = falso(revisado);
    const r = await executarEtapa('roteiro', {
        ep: 1, biblia: { personagens: [{ id: 'mara' }] }, roteiroBase: base,
        ajustes: 'Troque o título e deixe a Mara mais calma.', instrucoes: 'Tom de suspense, sem correria.',
    }, { chamarLLM: llm });
    assert.strictEqual(r.ok, true, r.erros.join(' | '));
    assert.strictEqual(r.resultado.titulo, 'Sete Quilômetros de Neblina');
    assert.strictEqual(r.resultado.aprovado, null);
    const [sis, usu] = llm.chamadas[0].mensagens;
    assert.match(sis.content, /MODO REVISÃO/);
    assert.match(sis.content, /MANTENHA todo o resto/);
    assert.match(sis.content, /ETAPA 3 — ROTEIRO DE UM EPISÓDIO \(60 s\)/); // duração/planos/regras de sempre
    assert.match(usu.content, /ROTEIRO ATUAL DO EP\. 1 \(JSON\)/);
    assert.match(usu.content, /"titulo":"Sete Quilômetros"/);
    assert.match(usu.content, /"aprovado":null/); // a base vai sem a aprovação
    assert.match(usu.content, /AJUSTES PEDIDOS PELO RAFAEL \(aplique todos\):\nTroque o título/);
    assert.match(usu.content, /OBSERVAÇÕES GERAIS DO RAFAEL PARA ESTE EPISÓDIO \(continuam valendo\): Tom de suspense/);
});

test('etapa roteiro: base sem ajustes, ajustes sem base e base inválida são recusados sem chamar a IA', async () => {
    const llm = falso({});
    const biblia = { personagens: [] };
    const a = await executarEtapa('roteiro', { ep: 1, biblia, roteiroBase: roteiroExemplo() }, { chamarLLM: llm });
    assert.match(a.erros[0], /Diga o que mudar/);
    const b = await executarEtapa('roteiro', { ep: 1, biblia, ajustes: 'mais curto' }, { chamarLLM: llm });
    assert.match(b.erros[0], /Sem roteiro para ajustar/);
    const c = await executarEtapa('roteiro', { ep: 1, biblia, roteiroBase: { titulo: 'x' }, ajustes: 'x' }, { chamarLLM: llm });
    assert.match(c.erros[0], /roteiroBase precisa ser o roteiro/);
    assert.strictEqual(llm.chamadas.length, 0);
});

test('etapa roteiro: "ajustar o roteiro salvo" sem roteiroBase usa o roteiro.json do episódio', async () => {
    const t = dadosTemporarios();
    try {
        fs.writeFileSync(path.join(t.pasta, 'episodios', 'ep01', 'roteiro.json'), JSON.stringify({ ...roteiroExemplo(), titulo: 'Título Salvo' }));
        const llm = falso(roteiroExemplo());
        const r = await executarEtapa('roteiro', { ep: 1, pasta: t.pasta, ajustes: 'Mais silêncio no começo.' }, { chamarLLM: llm });
        assert.strictEqual(r.erros.length, 0, r.erros.join(' | '));
        assert.match(llm.chamadas[0].mensagens[1].content, /"titulo":"Título Salvo"/);
        assert.match(llm.chamadas[0].mensagens[0].content, /PILOTO \(Ep\. 1\)/);
    } finally { t.limpar(); }
});

// ---------------------------------------------------------------- controllers: notas, histórico e salvar ajustado
function montarApp(chamarLLM) {
    const app = express();
    app.use(express.json({ limit: '10mb' }));
    app.post('/ShowrunnerEtapa', require('../src/controllers/ShowrunnerEtapa').criarREST({ chamarLLM }));
    app.post('/SalvarNotasEpisodio', require('../src/controllers/SalvarNotasEpisodio').REST);
    app.get('/LerNotasEpisodio', require('../src/controllers/LerNotasEpisodio').REST);
    app.post('/SalvarRoteiro', require('../src/controllers/SalvarRoteiro').REST);
    app.get('/ListarVersoesRoteiro', require('../src/controllers/ListarVersoesRoteiro').REST);
    return app;
}

async function comServidor(app, fn) {
    const servidor = app.listen(0, '127.0.0.1');
    await new Promise((r) => servidor.once('listening', r));
    const base = `http://127.0.0.1:${servidor.address().port}`;
    const post = async (rota, corpo) => {
        const r = await fetch(base + rota, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
        return { status: r.status, json: await r.json() };
    };
    const get = async (rota) => {
        const r = await fetch(base + rota);
        return { status: r.status, json: await r.json() };
    };
    try { await fn({ post, get }); } finally { servidor.close(); }
}

test('notas do episódio: observações salvas e lidas, cada proposta entra no histórico (versão, custo, ajustes)', async () => {
    const t = dadosTemporarios();
    const anterior = process.env.ESTUDIO_DADOS;
    process.env.ESTUDIO_DADOS = t.dados;
    const propostas = [roteiroExemplo(), { ...roteiroExemplo(), titulo: 'Versão Dois' }];
    let i = 0;
    const llm = async () => ({ conteudo: JSON.stringify(propostas[Math.min(i++, 1)]), custoUsd: 0.0021 });
    try {
        await comServidor(montarApp(llm), async ({ post, get }) => {
            const vazio = await get('/LerNotasEpisodio?serie=o-ultimo-farol&ep=1');
            assert.strictEqual(vazio.status, 200);
            assert.deepStrictEqual({ obs: vazio.json.notas.observacoes, h: vazio.json.notas.historico }, { obs: '', h: [] });

            const semCampo = await post('/SalvarNotasEpisodio', { serie: 'o-ultimo-farol', ep: 1 });
            assert.strictEqual(semCampo.status, 400);
            const salvo = await post('/SalvarNotasEpisodio', { serie: 'o-ultimo-farol', ep: 1, observacoes: '  Quero a Mara com medo do mar.\r\nEvitar correria.  ' });
            assert.strictEqual(salvo.json.ok, true);
            const lido = await get('/LerNotasEpisodio?serie=o-ultimo-farol&ep=01');
            assert.strictEqual(lido.json.notas.observacoes, 'Quero a Mara com medo do mar.\nEvitar correria.');
            assert.ok(lido.json.notas.observacoesEm);
            assert.ok(fs.existsSync(path.join(t.pasta, 'episodios', 'ep01', 'notas.json')));

            const inexistente = await post('/SalvarNotasEpisodio', { serie: 'o-ultimo-farol', ep: 7, observacoes: 'x' });
            assert.strictEqual(inexistente.status, 404);

            const p1 = await post('/ShowrunnerEtapa', { etapa: 'roteiro', serieId: 'o-ultimo-farol', contexto: { ep: 1, instrucoes: 'Quero a Mara com medo do mar.' } });
            assert.strictEqual(p1.status, 200);
            assert.strictEqual(p1.json.historico.versao, 1);
            assert.strictEqual(p1.json.historico.tipo, 'escrever');
            const p2 = await post('/ShowrunnerEtapa', {
                etapa: 'roteiro', serieId: 'o-ultimo-farol',
                contexto: { ep: 1, roteiroBase: p1.json.resultado, ajustes: 'Outro título.', baseVersao: 1, instrucoes: 'Quero a Mara com medo do mar.' },
            });
            assert.strictEqual(p2.json.historico.versao, 2);
            assert.deepStrictEqual(
                { tipo: p2.json.historico.tipo, base: p2.json.historico.base, baseVersao: p2.json.historico.baseVersao, ajustes: p2.json.historico.ajustes, titulo: p2.json.historico.titulo },
                { tipo: 'ajuste', base: 'proposta', baseVersao: 1, ajustes: 'Outro título.', titulo: 'Versão Dois' },
            );

            const notas = (await get('/LerNotasEpisodio?serie=o-ultimo-farol&ep=1')).json.notas;
            assert.strictEqual(notas.historico.length, 2);
            assert.strictEqual(notas.historico[0].observacoes, 'Quero a Mara com medo do mar.');
            assert.strictEqual(notas.historico[0].custoUsd, 0.0021);
            assert.strictEqual(notas.historico[1].resultado.titulo, 'Versão Dois');
            assert.strictEqual(notas.observacoes, 'Quero a Mara com medo do mar.\nEvitar correria.'); // o histórico não mexe nas observações
            const resumido = (await get('/LerNotasEpisodio?serie=o-ultimo-farol&ep=1&resumido=1')).json.notas;
            assert.strictEqual(resumido.historico[1].resultado, undefined);
            assert.strictEqual(resumido.historico[1].temRoteiro, true);
            // o roteiro.json nunca é gravado pelo showrunner
            assert.ok(!fs.existsSync(path.join(t.pasta, 'episodios', 'ep01', 'roteiro.json')));
        });
    } finally {
        if (anterior === undefined) delete process.env.ESTUDIO_DADOS; else process.env.ESTUDIO_DADOS = anterior;
        t.limpar();
    }
});

test('salvar roteiro ajustado por cima do salvo: confere antes, guarda o atual em _versoes (antesDeAjuste) e grava o novo', async () => {
    const t = dadosTemporarios();
    const anterior = process.env.ESTUDIO_DADOS;
    process.env.ESTUDIO_DADOS = t.dados;
    const pastaEp = path.join(t.pasta, 'episodios', 'ep01');
    try {
        await comServidor(montarApp(async () => ({ conteudo: '{}', custoUsd: 0 })), async ({ post, get }) => {
            const primeiro = await post('/SalvarRoteiro', { serie: 'o-ultimo-farol', n: 1, roteiro: roteiroExemplo() });
            assert.strictEqual(primeiro.status, 200, JSON.stringify(primeiro.json));
            assert.strictEqual(primeiro.json.versaoGuardada, undefined);
            fs.writeFileSync(path.join(pastaEp, 'falas.json'), JSON.stringify({ versao: 1, falas: [] }));

            // inválido: nada sai do lugar
            const ruim = await post('/SalvarRoteiro', { serie: 'o-ultimo-farol', n: 1, guardarAnterior: true, roteiro: { ...roteiroExemplo(), planos: [] } });
            assert.strictEqual(ruim.status, 400);
            assert.ok(fs.existsSync(path.join(pastaEp, 'roteiro.json')));
            assert.ok(!fs.existsSync(path.join(pastaEp, '_versoes')));

            const novo = await post('/SalvarRoteiro', { serie: 'o-ultimo-farol', n: 1, guardarAnterior: true, apagarDerivados: false, roteiro: { ...roteiroExemplo(), titulo: 'Ajustado' } });
            assert.strictEqual(novo.status, 200, JSON.stringify(novo.json));
            assert.match(novo.json.versaoGuardada, /_versoes/);
            assert.strictEqual(JSON.parse(fs.readFileSync(path.join(pastaEp, 'roteiro.json'), 'utf8')).titulo, 'Ajustado');
            assert.ok(fs.existsSync(path.join(pastaEp, 'falas.json')), 'apagarDerivados: false mantém as falas');

            const versoes = await get('/ListarVersoesRoteiro?serie=o-ultimo-farol&ep=1');
            assert.strictEqual(versoes.json.versoes.length, 1);
            assert.strictEqual(versoes.json.versoes[0].tipo, 'antesDeAjuste');
            assert.strictEqual(versoes.json.versoes[0].titulo, 'Sete Quilômetros');

            // aprovar (sem guardarAnterior) continua só regravando, sem versão nova
            const aprovar = await post('/SalvarRoteiro', { serie: 'o-ultimo-farol', n: 1, roteiro: { ...roteiroExemplo(), titulo: 'Ajustado', aprovado: true } });
            assert.strictEqual(aprovar.status, 200);
            assert.strictEqual((await get('/ListarVersoesRoteiro?serie=o-ultimo-farol&ep=1')).json.versoes.length, 1);
        });
    } finally {
        if (anterior === undefined) delete process.env.ESTUDIO_DADOS; else process.env.ESTUDIO_DADOS = anterior;
        t.limpar();
    }
});
