// Gerado fora do Estúdio: ver pedido/prompt sem gastar e anexar o que foi gerado em outra plataforma (custo 0).
// Rotas de verdade (routes.js num Express de teste), dados numa pasta temporária, modo simulado e LLM nunca chamado.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { PNG_1PX } = require('./series-ajuda');

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), 'estudio-externo-'));
process.env.ESTUDIO_DADOS = DADOS;
process.env.ESTUDIO_SIMULADO = '1';

const DOCS = path.join(__dirname, '..', '..', 'docs', 'exemplos');
const roteiroExemplo = () => JSON.parse(fs.readFileSync(path.join(DOCS, 'farol-ep01-roteiro.json'), 'utf8'));
const SERIE = 'o-ultimo-farol';
const PASTA = path.join(DADOS, 'series', SERIE);

const express = require('express');
const routes = require('../src/routes');

let servidor;
let base;
test.before(async () => {
    fs.cpSync(path.join(DOCS, SERIE), PASTA, { recursive: true });
    const arqBiblia = path.join(PASTA, 'biblia.json');
    const biblia = JSON.parse(fs.readFileSync(arqBiblia, 'utf8'));
    (biblia.temporada || []).forEach((e) => { if (e.status === 'planejado') e.status = 'ideia'; });
    fs.writeFileSync(arqBiblia, JSON.stringify(biblia));
    // episódio curto com edição (2 planos de 4 s) para os takes
    fs.mkdirSync(path.join(PASTA, 'episodios', 'ep02'), { recursive: true });
    fs.writeFileSync(path.join(PASTA, 'episodios', 'ep02', 'roteiro.json'), JSON.stringify({
        versao: 1, n: 2, titulo: 'T', duracaoAlvoS: 8,
        planos: [{ n: 1, deS: 0, ateS: 4, tipo: 'video_ia', local: 'farol', elenco: [], falas: [] }, { n: 2, deS: 4, ateS: 8, tipo: 'video_ia', local: 'farol', elenco: [], tela: 'CARTÕES A / B', falas: [] }],
        escolhas: { A: { texto: 'A1' }, B: { texto: 'B1' } },
    }));
    fs.mkdirSync(path.join(PASTA, 'episodios', 'ep01'), { recursive: true });
    const app = express();
    app.use(express.json({ limit: '100mb' }));
    app.use(routes);
    await new Promise((r) => { servidor = app.listen(0, '127.0.0.1', r); });
    base = `http://127.0.0.1:${servidor.address().port}`;
});
test.after(() => { servidor.close(); fs.rmSync(DADOS, { recursive: true, force: true }); });

const post = async (rota, corpo) => {
    const r = await fetch(`${base}/${rota}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    return { status: r.status, corpo: await r.json() };
};
const lerJson = (...p) => JSON.parse(fs.readFileSync(path.join(PASTA, ...p), 'utf8'));
const primeiraFicha = (pasta) => fs.readdirSync(path.join(PASTA, pasta)).find((n) => fs.existsSync(path.join(PASTA, pasta, n, 'ficha.json')));

// Vídeo pequeno de verdade (ffmpeg lavfi): horizontal de propósito, para o aviso de 9:16.
function criarVideo(arquivo, { largura = 128, altura = 72, segundos = 3 } = {}) {
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `testsrc=size=${largura}x${altura}:rate=24`, '-t', String(segundos),
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', arquivo]);
    return fs.readFileSync(arquivo);
}

// ---------------------------------------------------------------- imagem da ficha
test('anexar imagem na ficha: grava em ref/<estado>-<vista>, registra em estados[].refs e vira canônica se faltar', async () => {
    const id = primeiraFicha('locais');
    assert.ok(id, 'o exemplo tem um local');
    const antes = lerJson('locais', id, 'ficha.json');
    // tira a canônica e as refs para ver a regra "canônica se faltar"
    fs.writeFileSync(path.join(PASTA, 'locais', id, 'ficha.json'), JSON.stringify({ ...antes, canonica: null, estados: [{ id: 'padrao', desde: null, descricao: '', refs: {} }], estadoAtual: 'padrao' }));
    const r = await post('AnexarImagemFicha', { serie: SERIE, tipo: 'locais', id, vista: 'geral', arquivo: { nome: 'midjourney farol.png', base64: PNG_1PX.toString('base64') } });
    assert.strictEqual(r.status, 200, JSON.stringify(r.corpo));
    assert.strictEqual(r.corpo.caminho, 'ref/padrao-geral.png');
    assert.strictEqual(r.corpo.custoUsd, 0);
    assert.ok(fs.existsSync(path.join(PASTA, 'locais', id, 'ref', 'padrao-geral.png')));
    const f = lerJson('locais', id, 'ficha.json');
    assert.strictEqual(f.estados[0].refs.geral, 'ref/padrao-geral.png');
    assert.strictEqual(f.canonica, 'ref/padrao-geral.png');
    assert.strictEqual(f.anexosExternos.at(-1).original, 'midjourney farol.png');
    assert.strictEqual(f.anexosExternos.at(-1).origem, 'externo');
    // uma segunda imagem na mesma vista não apaga a primeira (vira -2) e a canônica acompanha a troca
    const outra = Buffer.concat([PNG_1PX, Buffer.from('v2')]);
    const r2 = await post('AnexarImagemFicha', { serie: SERIE, tipo: 'locais', id, vista: 'geral', arquivo: { nome: 'outra.png', base64: outra.toString('base64') } });
    assert.strictEqual(r2.corpo.caminho, 'ref/padrao-geral-2.png');
    assert.ok(fs.existsSync(path.join(PASTA, 'locais', id, 'ref', 'padrao-geral.png')));
    assert.strictEqual(lerJson('locais', id, 'ficha.json').canonica, 'ref/padrao-geral-2.png');
    assert.strictEqual(lerJson('locais', id, 'ficha.json').estados[0].refs.geral, 'ref/padrao-geral-2.png');
});

test('anexar imagem: recusa tipo errado (conteúdo), vazio e id/caminho fora da série', async () => {
    const id = primeiraFicha('locais');
    const falso = await post('AnexarImagemFicha', { serie: SERIE, tipo: 'locais', id, arquivo: { nome: 'x.png', base64: Buffer.from('não sou imagem nenhuma').toString('base64') } });
    assert.strictEqual(falso.status, 415);
    assert.match(falso.corpo.Error, /não parece uma imagem/);
    const vazio = await post('AnexarImagemFicha', { serie: SERIE, tipo: 'locais', id, arquivo: { nome: 'x.png', base64: '' } });
    assert.strictEqual(vazio.status, 400);
    const fora = await post('AnexarImagemFicha', { serie: SERIE, tipo: 'locais', id: '../../fora', arquivo: { nome: 'x.png', base64: PNG_1PX.toString('base64') } });
    assert.strictEqual(fora.status, 400);
    const vistaRuim = await post('AnexarImagemFicha', { serie: SERIE, tipo: 'locais', id, vista: '../x', arquivo: { nome: 'x.png', base64: PNG_1PX.toString('base64') } });
    assert.strictEqual(vistaRuim.status, 400);
    const serieRuim = await post('AnexarImagemFicha', { serie: '..', tipo: 'locais', id, arquivo: { nome: 'x.png', base64: PNG_1PX.toString('base64') } });
    assert.strictEqual(serieRuim.status, 400);
    assert.ok(!fs.existsSync(path.join(DADOS, 'fora')));
});

// ---------------------------------------------------------------- ver pedido (sem gastar)
test('ver pedido de imagem/vídeo: monta o corpo do OpenRouter com caminhos (sem base64), sem cotar nem gastar', async () => {
    const id = primeiraFicha('locais');
    const custosAntes = fs.existsSync(path.join(PASTA, 'custos.jsonl')) ? fs.readFileSync(path.join(PASTA, 'custos.jsonl'), 'utf8') : '';
    const img = await post('VerPedidoGeracao', {
        tipo: 'imagem', serie: SERIE,
        pedido: { modelo: 'google/gemini-3.1-flash-image', prompt: 'Referência de cenário.', proporcao: '9:16', referencias: [`locais/${id}/ref/padrao-geral.png`], destino: `locais/${id}/ref/padrao-geral.png` },
    });
    assert.strictEqual(img.status, 200, JSON.stringify(img.corpo));
    assert.strictEqual(img.corpo.gasto, 0);
    assert.strictEqual(img.corpo.endpoint, 'https://openrouter.ai/api/v1/images');
    assert.deepStrictEqual(img.corpo.corpo.aspect_ratio, '9:16');
    assert.strictEqual(img.corpo.arquivos[0].caminho, `locais/${id}/ref/padrao-geral.png`);
    assert.strictEqual(img.corpo.arquivos[0].existe, true);
    assert.match(img.corpo.corpo.input_references[0].image_url.url, /^<arquivo: locais\//);
    assert.ok(!JSON.stringify(img.corpo).includes('base64,'));
    const vid = await post('VerPedidoGeracao', {
        tipo: 'video', serie: SERIE,
        pedido: { modelo: 'google/veo-3.1-lite', prompt: 'Ela vira para a janela.', duracaoS: 4, resolucao: '720p', proporcao: '9:16', quadros: { primeiro: `locais/${id}/ref/padrao-geral.png` } },
    });
    assert.strictEqual(vid.corpo.corpo.duration, 4);
    assert.strictEqual(vid.corpo.corpo.frame_images[0].frame_type, 'first_frame');
    assert.strictEqual(vid.corpo.arquivos[0].papel, 'primeiro_quadro');
    const fora = await post('VerPedidoGeracao', { tipo: 'imagem', serie: SERIE, pedido: { modelo: 'x', prompt: 'p', referencias: ['../../segredo.png'] } });
    assert.strictEqual(fora.status, 400);
    const custosDepois = fs.existsSync(path.join(PASTA, 'custos.jsonl')) ? fs.readFileSync(path.join(PASTA, 'custos.jsonl'), 'utf8') : '';
    assert.strictEqual(custosDepois, custosAntes);
    assert.ok(!fs.existsSync(path.join(PASTA, 'jobs.json')) || !JSON.parse(fs.readFileSync(path.join(PASTA, 'jobs.json'), 'utf8')).jobs.length);
});

// ---------------------------------------------------------------- vídeo como take
test('anexar vídeo como take: binário, aparado ao trecho, aviso de 9:16, entra em mesa.json e na edição; recusa inválidos', async () => {
    const ini = await post('EdicaoInicial', { serie: SERIE, ep: 2 });
    assert.strictEqual(ini.status, 200, JSON.stringify(ini.corpo));
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'estudio-video-'));
    try {
        const video = criarVideo(path.join(tmp, 'runway.mp4'));
        const q = new URLSearchParams({ serie: SERIE, ep: '2', deS: '1', ateS: '3', nome: 'runway gen4.mp4' });
        const r = await fetch(`${base}/AnexarVideoTrecho?${q}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: video });
        const corpo = await r.json();
        assert.strictEqual(r.status, 200, JSON.stringify(corpo));
        assert.strictEqual(corpo.take.origem, 'externo');
        assert.strictEqual(corpo.take.custoUsd, 0);
        assert.strictEqual(corpo.take.nomeOriginal, 'runway gen4.mp4');
        assert.strictEqual(corpo.take.plano, 1);
        assert.strictEqual(corpo.take.duracaoS, 2);
        assert.ok(corpo.avisos.some((a) => /não 9:16/.test(a)), corpo.avisos.join(' | '));
        assert.ok(corpo.avisos.some((a) => /aparado/.test(a)));
        const final = path.join(PASTA, corpo.take.arquivo);
        assert.ok(fs.existsSync(final));
        assert.ok(fs.existsSync(path.join(PASTA, corpo.take.bruto)), 'o original fica guardado');
        const dur = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', final]).toString().trim());
        assert.ok(Math.abs(dur - 2) < 0.15, `duração ${dur}`);
        const mesa = lerJson('episodios', 'ep02', 'mesa.json');
        assert.strictEqual(mesa.takes['1'].at(-1).id, corpo.take.id);
        assert.ok(mesa.regeracoes.some((x) => x.origem === 'externo' && x.status === 'pronto' && x.take.id === corpo.take.id));
        const ed = lerJson('episodios', 'ep02', 'edicao.json');
        assert.ok(ed.faixas.video.some((v) => v.take === corpo.take.id && Math.abs(v.inicioS - 1) < 1e-6 && Math.abs(v.duracaoS - 2) < 1e-6));

        // JSON base64 pelo plano inteiro, sem aplicar na linha do tempo (só fica nos takes para escolher)
        const r2 = await post('AnexarVideoTrecho', { serie: SERIE, ep: 2, plano: 2, aplicar: false, arquivo: { nome: 'kling.mp4', base64: video.toString('base64') } });
        assert.strictEqual(r2.status, 200, JSON.stringify(r2.corpo));
        assert.strictEqual(r2.corpo.aplicado, false);
        assert.strictEqual(r2.corpo.take.plano, 2);

        const cruza = await post('AnexarVideoTrecho', { serie: SERIE, ep: 2, deS: 2, ateS: 6, arquivo: { nome: 'x.mp4', base64: video.toString('base64') } });
        assert.strictEqual(cruza.status, 400);
        assert.match(cruza.corpo.Error, /cruza 2 planos/);
        const imagem = await post('AnexarVideoTrecho', { serie: SERIE, ep: 2, deS: 1, ateS: 2, arquivo: { nome: 'x.mp4', base64: PNG_1PX.toString('base64') } });
        assert.strictEqual(imagem.status, 415);
        const fora = await post('AnexarVideoTrecho', { serie: '../x', ep: 2, deS: 1, ateS: 2, arquivo: { nome: 'x.mp4', base64: video.toString('base64') } });
        assert.strictEqual(fora.status, 400);
    } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
    }
});

test('anexar quadro-chave: imagem vai para quadros/ do episódio; recusa tipo errado', async () => {
    const r = await post('AnexarQuadroChave', { serie: SERIE, ep: 2, plano: 1, arquivo: { nome: 'flow.png', base64: PNG_1PX.toString('base64') } });
    assert.strictEqual(r.status, 200, JSON.stringify(r.corpo));
    assert.match(r.corpo.arquivo, /^episodios\/ep02\/quadros\/p01-externo-[a-z0-9]+\.png$/);
    assert.strictEqual(r.corpo.quadroChave.origem, 'externo');
    assert.ok(fs.existsSync(path.join(PASTA, r.corpo.arquivo)));
    const ruim = await post('AnexarQuadroChave', { serie: SERIE, ep: 2, plano: 1, arquivo: { nome: 'x.png', base64: Buffer.from('texto').toString('base64') } });
    assert.strictEqual(ruim.status, 415);
});

// ---------------------------------------------------------------- showrunner: ver prompt e colar resposta de fora
test('ver prompt da etapa: sistema + usuário + formato, sem chamar a IA', async () => {
    const r = await post('VerPromptEtapa', { etapa: 'roteiro', serieId: SERIE, contexto: { ep: 1, duracaoAlvoS: 60, instrucoes: 'Quero a Mara com medo do mar.' } });
    assert.strictEqual(r.status, 200, JSON.stringify(r.corpo));
    assert.strictEqual(r.corpo.ok, true, (r.corpo.erros || []).join(' | '));
    assert.strictEqual(r.corpo.gasto, 0);
    assert.match(r.corpo.sistema, /FORMATO:/);
    assert.match(r.corpo.usuario, /medo do mar/);
    assert.match(r.corpo.formato, /^\{"versao":1/);
    assert.ok(r.corpo.maxTokens > 0);
    assert.ok(r.corpo.promptCompleto.includes(r.corpo.sistema) && r.corpo.promptCompleto.includes(r.corpo.usuario));
    assert.strictEqual(r.corpo.mensagens.length, 2);
    const ideias = await post('VerPromptEtapa', { etapa: 'ideias', contexto: { modo: 'A' } });
    assert.strictEqual(ideias.corpo.ok, true);
    const falta = await post('VerPromptEtapa', { etapa: 'biblia', serieId: SERIE, contexto: {} });
    assert.strictEqual(falta.corpo.ok, false);
    assert.match(falta.corpo.erros[0], /ideia/);
    const ruim = await post('VerPromptEtapa', { etapa: 'apagarTudo' });
    assert.strictEqual(ruim.status, 400);
    const fora = await post('VerPromptEtapa', { etapa: 'roteiro', serieId: '../..', contexto: { ep: 1 } });
    assert.strictEqual(fora.status, 400);
});

test('colar resposta de fora: roteiro com texto em volta passa pela validação, custo 0, entra no histórico como externo', async () => {
    const texto = `Claro! Aqui está o roteiro:\n\`\`\`json\n${JSON.stringify(roteiroExemplo(), null, 2)}\n\`\`\`\nQualquer coisa me avise.`;
    const r = await post('ProporResultadoExterno', { etapa: 'roteiro', serieId: SERIE, contexto: { ep: 1, duracaoAlvoS: 60 }, texto });
    assert.strictEqual(r.status, 200, JSON.stringify(r.corpo));
    assert.strictEqual(r.corpo.ok, true, (r.corpo.erros || []).join(' | '));
    assert.strictEqual(r.corpo.origem, 'externo');
    assert.strictEqual(r.corpo.custoUsd, 0);
    assert.ok(Array.isArray(r.corpo.resultado.planos));
    assert.ok(r.corpo.historico && r.corpo.historico.versao >= 1);
    const notas = lerJson('episodios', 'ep01', 'notas.json');
    const h = notas.historico.at(-1);
    assert.strictEqual(h.origem, 'externo');
    assert.strictEqual(h.custoUsd, 0);
    assert.ok(!fs.existsSync(path.join(PASTA, 'episodios', 'ep01', 'roteiro.json')), 'nada é salvo como roteiro');

    // resposta inválida: volta com erro, sem tentar de novo e sem custo
    const ruim = await post('ProporResultadoExterno', { etapa: 'roteiro', serieId: SERIE, contexto: { ep: 1 }, texto: 'Desculpe, não consigo.' });
    assert.strictEqual(ruim.status, 200);
    assert.strictEqual(ruim.corpo.ok, false);
    assert.strictEqual(ruim.corpo.tentativas, 1);
    assert.strictEqual(ruim.corpo.custoUsd, 0);
    // bíblia colada: valida e devolve a proposta (o salvar continua no AprovarBiblia)
    const biblia = await post('ProporResultadoExterno', { etapa: 'biblia', serieId: SERIE, contexto: { ideia: 'Uma faroleira isolada.' }, texto: JSON.stringify({ biblia: lerJson('biblia.json'), elenco: [], locais: [] }) });
    assert.strictEqual(biblia.status, 200, JSON.stringify(biblia.corpo));
    assert.strictEqual(biblia.corpo.origem, 'externo');
    assert.ok(biblia.corpo.resultado && biblia.corpo.resultado.biblia);
    const vazio = await post('ProporResultadoExterno', { etapa: 'roteiro', serieId: SERIE, contexto: { ep: 1 }, texto: '   ' });
    assert.strictEqual(vazio.status, 400);
});
