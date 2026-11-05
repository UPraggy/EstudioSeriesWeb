// executarEtapa com LLM FALSO (respostas enlatadas): prompts, parse, validação, consertos e nova tentativa.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { executarEtapa } = require('../src/showrunner');
const V = require('../src/showrunner/validar');
const { carregarSerie } = require('../src/memoria');

const DOCS = path.join(__dirname, '..', '..', 'docs', 'exemplos');
const ler = (arq) => JSON.parse(fs.readFileSync(path.join(DOCS, arq), 'utf8'));
const CTA = 'Comente A ou B. A mais votada decide o próximo episódio.';

// LLM falso: devolve as respostas na ordem e guarda cada chamada.
function falso(...respostas) {
    const chamadas = [];
    const f = async (mensagens, op) => {
        chamadas.push({ mensagens, op });
        const r = respostas[Math.min(chamadas.length - 1, respostas.length - 1)];
        return { conteudo: typeof r === 'string' ? r : JSON.stringify(r), custoUsd: 0.001 };
    };
    f.chamadas = chamadas;
    return f;
}

function serieTemporaria() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'showrunner-'));
    const pasta = path.join(dir, 'o-ultimo-farol');
    fs.cpSync(path.join(DOCS, 'o-ultimo-farol'), pasta, { recursive: true });
    return { pasta, limpar: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

const ideia = (i) => ({
    titulo: `Ideia ${i}`, genero: 'suspense', logline: 'Alguém quer algo e algo impede.', protagonista: 'Ana', ameaca: 'a maré',
    gancho: 'Uma porta bate sozinha.', primeiraEscolha: { A: 'abrir a porta', B: 'fugir' }, misterioCentral: 'Quem bateu?',
    cenariosRecorrentes: 'casa, praia', potencialRetencao: 'curiosidade',
});

test('exemplos do Farol (roteiro e decupagem escritos à mão) passam na validação sem erro', () => {
    const s = carregarSerie(path.join(DOCS, 'o-ultimo-farol'));
    const roteiro = ler('farol-ep01-roteiro.json');
    const r = V.validarRoteiro(roteiro, { ep: 1, elencoIds: Object.keys(s.fichas.elenco), locaisIds: Object.keys(s.fichas.locais) });
    assert.deepStrictEqual(r.erros, []);
    assert.deepStrictEqual(r.avisos, []);
    const d = V.validarDecupagem(ler('farol-ep01-planos.json'), { ep: 1, roteiro, modelos: s.serie.modelos });
    assert.deepStrictEqual(d.erros, []);
    assert.deepStrictEqual(d.consertos, []);
    assert.deepStrictEqual(d.valor.ordemGeracao, [3, 6, 5, 2, 8]);
    assert.strictEqual(d.valor.resumoCusto.totalUsd, 1.64);
});

test('chamarLLM é obrigatório e etapa desconhecida falha', async () => {
    await assert.rejects(executarEtapa('ideias', {}, {}), /chamarLLM/);
    await assert.rejects(executarEtapa('montagem', {}, { chamarLLM: falso({}) }), /Etapa desconhecida/);
});

test('ideias Modo A: cerca, sinônimos e excesso de ideias são consertados', async () => {
    const llm = falso('```json\n' + JSON.stringify({ ideias: [1, 2, 3, 4, 5, 6].map(ideia) }) + '\n```');
    const r = await executarEtapa('ideias', { modo: 'A', preferencias: 'terror sugerido' }, { chamarLLM: llm });
    assert.strictEqual(r.ok, true, r.erros.join('; '));
    assert.strictEqual(r.resultado.ideias.length, 5);
    assert.strictEqual(r.resultado.ideias[0].ganchoEp1, 'Uma porta bate sozinha.');
    assert.strictEqual(r.resultado.ideias[0].primeiraEscolha.A, 'ABRIR A PORTA');
    assert.deepStrictEqual(r.resultado.ideias[0].cenariosRecorrentes, ['casa', 'praia']);
    assert.ok(r.consertos.some((c) => /cerca/.test(c)));
    assert.ok(r.consertos.some((c) => /5 primeiras/.test(c)));
    assert.strictEqual(llm.chamadas[0].op.json, true);
    assert.strictEqual(llm.chamadas[0].op.modelo, 'openai/gpt-6-luna');
    assert.match(llm.chamadas[0].mensagens[0].content, /Português do Brasil em tudo/);
    assert.match(llm.chamadas[0].mensagens[1].content, /terror sugerido/);
});

test('ideias: com erro pede correção uma vez (2 chamadas, custo somado)', async () => {
    const llm = falso({ ideias: [1, 2, 3].map(ideia) }, { ideias: [1, 2, 3, 4, 5].map(ideia) });
    const r = await executarEtapa('ideias', { modo: 'A' }, { chamarLLM: llm });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.tentativas, 2);
    assert.strictEqual(r.custoUsd, 0.002);
    const pedido = llm.chamadas[1].mensagens.at(-1).content;
    assert.match(pedido, /Corrija estes problemas/);
    assert.match(pedido, /Vieram 3 ideias/);
});

test('ideias Modo B sem a ideia do Rafael não chama o LLM', async () => {
    const llm = falso({});
    const r = await executarEtapa('ideias', { modo: 'B' }, { chamarLLM: llm });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(llm.chamadas.length, 0);
    const r2 = await executarEtapa('ideias', { modo: 'B', ideia: 'Um farol isolado no apocalipse' }, { chamarLLM: falso({ ...ideia(1), ajustes: ['x'] }) });
    assert.strictEqual(r2.ok, true, r2.erros.join('; '));
    assert.ok(r2.consertos.some((c) => /embrulhada/.test(c)));
});

test('bíblia: votação inventada é zerada, ids viram slug, fases preenchidas, voz fora da lista sai', async () => {
    const temporada = Array.from({ length: 10 }, (_, i) => ({ n: i + 1, titulo: `Ep ${i + 1}` }));
    const resposta = {
        biblia: {
            premissa: 'Uma técnica sozinha num farol.', regras: ['Só de barco.', 'Mordida mata.', 'Luz atrai.'],
            objetos: [{ id: 'Barra de Metal', onde: 'porta do cais' }], personagens: [],
            escolhas: [{ ep: 1, vencedora: 'A', votos: { A: 900, B: 2 } }], temporada,
        },
        elenco: [{ id: 'Mára', nome: 'Mara', ancora: 'mulher', ancoraEn: 'woman', vozSugerida: 'pt-BR-FranciscaNeural' }],
        locais: [{ id: 'porta', nome: 'Porta', ancora: 'porta de aço' }],
    };
    const r = await executarEtapa('biblia', { ideia: { titulo: 'O Último Farol' } }, { chamarLLM: falso(resposta) });
    assert.strictEqual(r.ok, true, r.erros.join('; '));
    const b = r.resultado.biblia;
    assert.deepStrictEqual(b.escolhas, []);
    assert.ok(r.consertos.some((c) => /nunca inventar votação/.test(c)));
    assert.strictEqual(r.resultado.elenco[0].id, 'mara');
    assert.strictEqual(r.resultado.elenco[0].vozSugerida, null);
    assert.strictEqual(b.objetos[0].id, 'barra-de-metal');
    assert.strictEqual(b.objetos[0].onde, 'porta');
    assert.strictEqual(b.temporada[0].fase, 'Introdução + incidente');
    assert.ok(b.personagens.some((p) => p.id === 'mara'));
});

test('roteiro com a pasta da série: memória no prompt, consertos do óbvio e verificação de continuidade', async () => {
    const t = serieTemporaria();
    try {
        const bruto = ler('farol-ep01-roteiro.json');
        bruto.aprovado = true; // a IA não aprova
        bruto.cta = 'Comenta aí!';
        bruto.n = 7;
        bruto.planos[0].tipo = 'VÍDEO IA';
        bruto.planos[2].falas[0].via = 'rádio';
        delete bruto.planos[6].falas[0].via;
        bruto.planos[3].fala = undefined;
        bruto.escolhas.A.texto = 'acender o farol';
        bruto.escolhas.vencedora = 'A';
        bruto.planos[1].deS = 6; // buraco de 1 s entre P1 e P2 (P2 continua com 10 s)
        bruto.planos[1].ateS = 16;
        const llm = falso('Aqui está o roteiro:\n' + JSON.stringify(bruto));
        const r = await executarEtapa('roteiro', { ep: 1, pasta: t.pasta, instrucoes: 'mais tensão no rádio' }, { chamarLLM: llm });
        assert.strictEqual(r.ok, true, r.erros.join('; '));
        const msgs = llm.chamadas[0].mensagens;
        assert.match(msgs[0].content, /RETENÇÃO: 0–5 s gancho/);
        assert.match(msgs[0].content, /SOBRE A MEMÓRIA/);
        assert.match(msgs[1].content, /MEMÓRIA DA SÉRIE — para escrever o roteiro do Ep\. 1/);
        assert.match(msgs[1].content, /Só se chega de barco/);
        assert.match(msgs[1].content, /mais tensão no rádio/);
        const rot = r.resultado;
        assert.strictEqual(rot.n, 1);
        assert.strictEqual(rot.aprovado, null);
        assert.strictEqual(rot.cta, CTA);
        assert.strictEqual(rot.planos[0].tipo, 'video_ia');
        assert.strictEqual(rot.planos[2].falas[0].via, 'radio');
        assert.strictEqual(rot.planos[6].falas[0].via, 'narracao');
        assert.strictEqual(rot.escolhas.A.texto, 'ACENDER O FAROL');
        assert.ok(!('vencedora' in rot.escolhas));
        assert.strictEqual(rot.planos[1].deS, 5);
        assert.strictEqual(rot.planos.at(-1).ateS, 60);
        for (const c of [/aprovado/, /CTA/, /VÍDEO IA/, /via "rádio"/, /sem via válida/, /caixa alta/, /votação inventado/, /contínuos/]) {
            assert.ok(r.consertos.some((x) => c.test(x)), `faltou conserto ${c}`);
        }
        assert.ok(r.continuidade && r.continuidade.ok);
        assert.ok(r.avisos.some((a) => /continuidade \(plano 6\)/.test(a)));
    } finally { t.limpar(); }
});

test('roteiro: contradição com a memória volta para correção', async () => {
    const t = serieTemporaria();
    try {
        const errado = ler('farol-ep01-roteiro.json');
        errado.planos[4].objetos = ['barra', 'radio']; // rádio fixo na sala aparecendo na porta
        const certo = ler('farol-ep01-roteiro.json');
        const llm = falso(errado, certo);
        const r = await executarEtapa('roteiro', { ep: 1, pasta: t.pasta }, { chamarLLM: llm });
        assert.strictEqual(r.ok, true);
        assert.strictEqual(r.tentativas, 2);
        assert.match(llm.chamadas[1].mensagens.at(-1).content, /continuidade \(plano 5\): Rádio marítimo VHF é fixo/);
    } finally { t.limpar(); }
});

test('roteiro: fala longa demais e soma errada são erros (sem pasta, só com a bíblia)', async () => {
    const rot = ler('farol-ep01-roteiro.json');
    rot.planos[0].falas[0].texto = 'Sete quilômetros de mar escuro e gelado separam Mara, a técnica do farol, do fim do mundo inteiro.';
    rot.planos[7].ateS = 70;
    const r = await executarEtapa('roteiro', { ep: 1, biblia: ler('o-ultimo-farol/biblia.json') }, { chamarLLM: falso(rot), maxTentativas: 1 });
    assert.strictEqual(r.ok, false);
    assert.ok(r.erros.some((e) => /plano 1: \d+ palavras em 5 s \(máximo 10/.test(e)));
    assert.ok(r.erros.some((e) => /somam 70 s/.test(e)));
    assert.ok(r.erros.some((e) => /plano 8: 16 s/.test(e)));
});

test('roteiro do último episódio: sem A/B e CTA de fechamento', async () => {
    const rot = ler('farol-ep01-roteiro.json');
    rot.escolhas = null;
    rot.cta = '';
    const r = await executarEtapa('roteiro', { ep: 10, biblia: ler('o-ultimo-farol/biblia.json') }, { chamarLLM: falso(rot) });
    assert.strictEqual(r.resultado.cta, 'Comente qual escolha você mudaria.');
    assert.ok(!r.erros.some((e) => /escolhas/.test(e)));
});

test('decupagem: exige roteiro aprovado; conserta prompt, duração, quadro-chave, modelo e custo', async () => {
    const t = serieTemporaria();
    try {
        const roteiro = ler('farol-ep01-roteiro.json');
        const llm0 = falso({});
        const r0 = await executarEtapa('decupagem', { ep: 1, pasta: t.pasta, roteiro }, { chamarLLM: llm0 });
        assert.strictEqual(r0.ok, false);
        assert.strictEqual(llm0.chamadas.length, 0);

        const planos = ler('farol-ep01-planos.json');
        const p3 = planos.planos.find((p) => p.n === 3);
        delete p3.prompt;
        p3.duracaoS = 10;
        p3.quadroChave.aprovado = true;
        p3.custoPrevistoUsd = 9;
        const p5 = planos.planos.find((p) => p.n === 5);
        delete p5.modelo;
        delete p5.quadroChave;
        p5.dependeDe = [5, 99, 3];
        planos.planos.find((p) => p.n === 1).modelo = 'google/veo-3.1-lite';
        planos.planos.push({ n: 42, tipo: 'video_ia', prompt: 'extra' });
        const llm = falso(planos.planos); // lista solta
        const r = await executarEtapa('decupagem', { ep: 1, pasta: t.pasta, roteiro: { ...roteiro, aprovado: true } }, { chamarLLM: llm });
        assert.strictEqual(r.ok, true, r.erros.join('; '));
        const d = r.resultado;
        const q3 = d.planos.find((p) => p.n === 3);
        assert.match(q3.prompt, /^Camera: Medium shot/);
        assert.strictEqual(q3.duracaoS, 8);
        assert.strictEqual(q3.quadroChave.aprovado, false);
        assert.strictEqual(q3.custoPrevistoUsd, 0.24);
        const q5 = d.planos.find((p) => p.n === 5);
        assert.strictEqual(q5.modelo, 'google/veo-3.1-lite');
        assert.deepStrictEqual(q5.quadroChave, { origem: 'imagem_ia', caminho: 'quadros/p05.png', aprovado: false });
        assert.deepStrictEqual(q5.dependeDe, [3]);
        assert.strictEqual(d.planos.find((p) => p.n === 1).modelo, null);
        assert.ok(!d.planos.some((p) => p.n === 42));
        assert.deepStrictEqual(d.ordemGeracao, [3, 6, 5, 2, 8]);
        assert.match(llm.chamadas[0].mensagens[1].content, /ÂNCORAS VISUAIS/);
        assert.match(llm.chamadas[0].mensagens[0].content, /Camera \+ Subject \+ Action \+ Context \+ Style/);
        for (const c of [/embrulhada/, /prompt montado/, /10 s → 8 s/, /não aprovado/, /custo previsto recalculado/, /dependências inválidas/, /removido o plano 42/, /não usa modelo pago/]) {
            assert.ok(r.consertos.some((x) => c.test(x)), `faltou conserto ${c}`);
        }
    } finally { t.limpar(); }
});

test('decupagem: sangue no prompt é erro; "no blood" não; dependência circular é erro', async () => {
    const roteiro = { ...ler('farol-ep01-roteiro.json'), aprovado: true };
    const planos = ler('farol-ep01-planos.json');
    planos.planos.find((p) => p.n === 3).prompt += ' Blood splatter on the window.';
    planos.planos.find((p) => p.n === 3).dependeDe = [5];
    const r = await executarEtapa('decupagem', { ep: 1, roteiro }, { chamarLLM: falso(planos), maxTentativas: 1 });
    assert.strictEqual(r.ok, false);
    assert.ok(r.erros.some((e) => /plano 3: prompt com sangue/.test(e)));
    assert.ok(r.erros.some((e) => /circular/.test(e)));
    assert.ok(!r.erros.some((e) => /plano 5: prompt com sangue/.test(e))); // "no blood" é negação
});

test('atualizarMundo: sem votação real não chama o LLM; empate exige desempate', async () => {
    const base = { ep: 1, biblia: ler('o-ultimo-farol/biblia.json'), roteiro: ler('farol-ep01-roteiro.json') };
    const llm = falso({});
    const r = await executarEtapa('atualizarMundo', base, { chamarLLM: llm });
    assert.strictEqual(r.ok, false);
    assert.match(r.erros[0], /Votação não registrada/);
    const r2 = await executarEtapa('atualizarMundo', { ...base, votacao: { vencedora: 'empate', fonte: 'manual', votos: { A: 5, B: 5 } } }, { chamarLLM: llm });
    assert.match(r2.erros[0], /desempate/);
    assert.strictEqual(llm.chamadas.length, 0);
});

test('atualizarMundo: aplica a escolha REAL; a IA não muda votos nem o passado', async () => {
    const base = { ep: 1, biblia: ler('o-ultimo-farol/biblia.json'), roteiro: ler('farol-ep01-roteiro.json') };
    const votacao = { ep: 1, votos: { A: 120, B: 80 }, vencedora: 'A', fonte: 'manual' };
    const patch = {
        cronologia: [{ ep: 1, evento: 'Mara acende o farol.' }, { ep: 0, evento: 'reescrevendo o passado' }],
        personagens: [{ id: 'davi', onde: 'porta', estado: 'encharcado' }],
        objetos: [{ id: 'interruptor', estado: 'feixe aceso' }],
        temporada: [{ n: 1, titulo: 'Mudado' }, { n: 2, titulo: 'A Luz Chama', resumo: 'Os mortos vêm.' }],
        escolhas: [{ ep: 1, vencedora: 'B' }],
        consequencia: 'Os corpos boiam em direção à ilhota.',
        mudancas: ['farol aceso'],
    };
    const llm = falso(patch);
    const r = await executarEtapa('atualizarMundo', { ...base, votacao }, { chamarLLM: llm });
    assert.strictEqual(r.ok, true, r.erros.join('; '));
    const b = r.resultado.biblia;
    assert.deepStrictEqual(b.escolhas, [{ ep: 1, A: 'ACENDER O FAROL', B: 'DEIXAR APAGADO', vencedora: 'A', votos: { A: 120, B: 80 }, fonte: 'manual' }]);
    assert.deepStrictEqual(b.cronologia, [{ ep: 1, evento: 'Mara acende o farol.' }]);
    assert.strictEqual(b.temporada[0].titulo, 'Sete Quilômetros');
    assert.strictEqual(b.temporada[0].status, 'publicado');
    assert.strictEqual(b.temporada[1].titulo, 'A Luz Chama');
    assert.strictEqual(b.personagens.find((p) => p.id === 'davi').onde, 'porta');
    assert.strictEqual(r.resultado.consequencia, 'Os corpos boiam em direção à ilhota.');
    assert.match(llm.chamadas[0].mensagens[1].content, /VOTAÇÃO REAL \(manual\): venceu A — ACENDER O FAROL \(A 120 × B 80\)/);
    for (const c of [/Ep\. 0 ignorada/, /Ep\. 1 não muda/, /votação vindo da IA/]) assert.ok(r.consertos.some((x) => c.test(x)), `faltou ${c}`);
});

test('roteiro: cartão A/B longo é erro (com histórico da tentativa); apresentador no gancho e demais é aviso', async () => {
    const rot = ler('farol-ep01-roteiro.json');
    rot.escolhas.A.texto = 'ACENDER O FEIXE DO FAROL PARA TENTAR GUIAR DAVI.';
    rot.planos[0].tipo = 'apresentador';
    rot.planos[0].elenco = ['narrador'];
    rot.planos[3].tipo = 'apresentador';
    const r = await executarEtapa('roteiro', { ep: 1, biblia: ler('o-ultimo-farol/biblia.json') }, { chamarLLM: falso(rot, ler('farol-ep01-roteiro.json')) });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.tentativas, 2);
    assert.match(r.historico[0].erros[0], /Escolha A longa demais \(9 palavras\)/);
    const v = V.validarRoteiro(rot, { ep: 1 });
    assert.ok(v.consertos.includes('escolha A sem ponto final'));
    assert.ok(v.avisos.some((a) => /gancho \(plano 1\) é o apresentador/.test(a)));
    assert.ok(v.avisos.some((a) => /4 planos de apresentador \(27 s de lip-sync ≈ US\$ 1,35\)/.test(a)));
});

test('roteiro: personagem visível falando ao telefone sem estar de costas recebe aviso', () => {
    const rot = ler('farol-ep01-roteiro.json');
    rot.planos[5].visual = 'Davi na lancha, olhando para a câmera, fala ao rádio.';
    const v = V.validarRoteiro(rot, { ep: 1 });
    assert.ok(v.avisos.some((a) => /plano 6: davi aparece falando \(radio\) sem lip-sync/.test(a)));
});

test('roteiro de 5 s: um plano basta, sem votação nem CTA (mesmo no "último" episódio) e prompt com o alvo certo', async () => {
    const base = ler('farol-ep01-roteiro.json');
    const curto = {
        ...base, n: 99, duracaoAlvoS: 5, cta: 'Comente qual escolha você mudaria.',
        planos: [{ ...base.planos[0], n: 1, deS: 0, ateS: 5, elenco: [], falas: [{ quem: 'narrador', texto: 'A luz chamou algo que não devia.', via: 'narracao' }] }],
    };
    const v = V.validarRoteiro(curto, { ep: 99, duracaoAlvoS: 5, ultimo: true });
    assert.deepStrictEqual(v.erros, []);
    assert.strictEqual(v.valor.escolhas, null);
    assert.strictEqual(v.valor.cta, '');
    // 6,5 s num alvo de 5 s estoura a tolerância proporcional (±0,5)
    const longo = { ...curto, planos: [{ ...curto.planos[0], ateS: 6.5 }] };
    assert.ok(V.validarRoteiro(longo, { ep: 99, duracaoAlvoS: 5 }).erros.some((e) => /alvo é 5 s \(±0.5\)/.test(e)));
    // o prompt do sistema acompanha a duração e não pede A/B
    const llm = falso(curto);
    await executarEtapa('roteiro', { ep: 99, duracaoAlvoS: 5, biblia: ler('o-ultimo-farol/biblia.json') }, { chamarLLM: llm });
    const sistema = llm.chamadas[0].mensagens.find((m) => m.role === 'system').content;
    assert.match(sistema, /ROTEIRO DE UM EPISÓDIO \(5 s\)/);
    assert.match(sistema, /1 a 2 planos/);
    assert.match(sistema, /SEM votação/);
    assert.doesNotMatch(sistema, /soma = 60 s/);
});

test('teto de custo interrompe novas tentativas', async () => {
    const llm = falso({ ideias: [] });
    const r = await executarEtapa('ideias', { modo: 'A' }, { chamarLLM: llm, maxTentativas: 3, tetoUsd: 0.001 });
    assert.strictEqual(llm.chamadas.length, 1);
    assert.ok(r.avisos.some((a) => /Teto/.test(a)));
});
