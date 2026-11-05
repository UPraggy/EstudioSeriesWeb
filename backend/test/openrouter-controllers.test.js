// Controllers do OpenRouter por HTTP (modo simulado): geração simples ponta a ponta, token, erros { Error } e a chave nunca sai.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const express = require('express');
const aj = require('./fixtures/openrouter-ajuda');

const RAIZ = aj.pastaTemp('ctrl-');
process.env.ESTUDIO_DADOS = RAIZ;
process.env.ESTUDIO_SIMULADO = '1';
process.env.ASE_OPENROUTER_KEY = aj.CHAVE_TESTE;
globalThis.fetch = async () => { throw new Error('sem rede nos testes'); };

const POST = ['CotarGeracao', 'GerarVideo', 'GerarImagem', 'StatusJob', 'RetomarJobs', 'CotarGeracaoSimples', 'GerarGeracaoSimples'];
const GET = ['CatalogoVideo', 'SaldoOpenRouter'];

let base;
let servidor;
const respostas = [];

test.before(async () => {
    const app = express();
    app.use(express.json({ limit: '100mb' }));
    for (const r of POST) app.post(`/${r}`, require(`../src/controllers/${r}`).REST);
    for (const r of GET) app.get(`/${r}`, require(`../src/controllers/${r}`).REST);
    servidor = app.listen(0, '127.0.0.1');
    await new Promise((r) => servidor.once('listening', r));
    base = `http://127.0.0.1:${servidor.address().port}`;
});
test.after(() => {
    servidor.close();
    const tudo = respostas.join('\n');
    assert.ok(!tudo.includes(aj.CHAVE_TESTE), 'a chave nunca aparece numa resposta');
});

// O http nativo do Node (o fetch global está bloqueado de propósito).
async function chamar(rota, corpo) {
    const http = require('http');
    const url = new URL(`${base}/${rota}`);
    const dados = corpo === undefined ? null : JSON.stringify(corpo);
    const { status, texto } = await new Promise((resolve, reject) => {
        const req = http.request(url, { method: dados ? 'POST' : 'GET', headers: dados ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(dados) } : {} }, (res) => {
            let t = '';
            res.setEncoding('utf8');
            res.on('data', (c) => { t += c; });
            res.on('end', () => resolve({ status: res.statusCode, texto: t }));
        });
        req.on('error', reject);
        if (dados) req.write(dados);
        req.end();
    });
    respostas.push(texto);
    return { status, json: JSON.parse(texto) };
}

test('GET /CatalogoVideo e /SaldoOpenRouter (simulado)', async () => {
    const c = await chamar('CatalogoVideo');
    assert.strictEqual(c.status, 200);
    assert.strictEqual(c.json.simulado, true);
    const veo = c.json.modelos.find((m) => m.id === 'google/veo-3.1-lite');
    assert.strictEqual(veo.precoExemplo.semAudioUsd, 0.24);
    assert.deepStrictEqual(veo.quadros, ['first_frame', 'last_frame']);
    const up = c.json.modelos.find((m) => m.id === 'black-forest-labs/flux-video-upscale');
    assert.match(up.precoExemplo.erro, /Não sei calcular/);
    const s = await chamar('SaldoOpenRouter');
    assert.strictEqual(s.status, 200);
    assert.strictEqual(s.json.simulado, true);
});

test('geração simples de vídeo: cotar → gerar com token → pedido.json com resultado', async () => {
    const cot = await chamar('CotarGeracaoSimples', {
        texto: 'Mara olha o mar pela janela do farol',
        anexos: [{ tipo: 'imagem', papel: 'primeiro_quadro', nome: 'quadro Mára.png', base64: aj.PNG_1PX.toString('base64') },
            { tipo: 'texto', texto: 'Noite, chuva fina, luz do farol girando.' }],
        modelo: 'google/veo-3.1-lite', duracaoS: 8, proporcao: '9:16', resolucao: '720p', audio: false,
    });
    assert.strictEqual(cot.status, 200, cot.json.Error);
    assert.match(cot.json.id, /^\d{4}-\d{2}-\d{2}-\d{4}-[0-9a-f]{4}$/);
    assert.strictEqual(cot.json.custoPrevistoUsd, 0.24);
    const pasta = path.join(RAIZ, 'geracao-simples', cot.json.id);
    const pj = JSON.parse(fs.readFileSync(path.join(pasta, 'pedido.json'), 'utf8'));
    assert.strictEqual(pj.versao, 1);
    assert.deepStrictEqual(pj.anexos, [
        { tipo: 'imagem', arquivo: 'anexos/01-quadro-Mara.png', papel: 'primeiro_quadro' },
        { tipo: 'texto', arquivo: 'anexos/02-texto.txt', papel: 'referencia' },
    ]);
    assert.ok(fs.existsSync(path.join(pasta, 'anexos', '01-quadro-Mara.png')));
    assert.strictEqual(pj.custoPrevistoUsd, 0.24);
    assert.strictEqual(pj.resultado, null);

    const errado = await chamar('GerarGeracaoSimples', { id: cot.json.id, token: 'x.y' });
    assert.strictEqual(errado.status, 500);
    assert.match(errado.json.Error, /Confirmação inválida/);

    const g = await chamar('GerarGeracaoSimples', { id: cot.json.id, token: cot.json.token });
    assert.strictEqual(g.status, 200, g.json.Error);
    assert.strictEqual(g.json.simulado, true);
    assert.strictEqual(g.json.job.status, 'pronto');
    assert.deepStrictEqual(g.json.pedido.resultado, { caminho: 'resultado.mp4', custoUsd: 0, status: 'pronto', jobId: g.json.job.jobId, simulado: true });
    assert.ok(fs.statSync(path.join(pasta, 'resultado.mp4')).size > 1000);

    const deNovo = await chamar('GerarGeracaoSimples', { id: cot.json.id, token: cot.json.token });
    assert.match(deNovo.json.Error, /já foi usada/);

    const st = await chamar('StatusJob', { jobId: g.json.job.jobId });
    assert.strictEqual(st.json.job.status, 'pronto');
});

test('geração simples de imagem (Nano Banana 2) grava resultado.png', async () => {
    const cot = await chamar('CotarGeracaoSimples', { tipo: 'imagem', texto: 'Farol na ilhota, noite', modelo: 'google/gemini-3.1-flash-image', resolucao: '1K' });
    assert.strictEqual(cot.status, 200, cot.json.Error);
    assert.strictEqual(cot.json.estimativa, true);
    assert.ok(cot.json.custoPrevistoUsd > 0.06 && cot.json.custoPrevistoUsd < 0.08);
    const g = await chamar('GerarGeracaoSimples', { id: cot.json.id, token: cot.json.token });
    assert.strictEqual(g.json.pedido.resultado.caminho, 'resultado.png');
    assert.ok(fs.existsSync(path.join(RAIZ, 'geracao-simples', cot.json.id, 'resultado.png')));
});

test('geração simples recusa vídeo de entrada e pedido inválido (sem deixar pasta)', async () => {
    const antes = fs.readdirSync(path.join(RAIZ, 'geracao-simples')).length;
    const v = await chamar('CotarGeracaoSimples', { texto: 'x', modelo: 'google/veo-3.1-lite', duracaoS: 8, anexos: [{ tipo: 'video', papel: 'video_entrada', base64: 'AAAA' }] });
    assert.strictEqual(v.status, 500);
    assert.match(v.json.Error, /vídeo de entrada ainda não é suportado/);
    const d = await chamar('CotarGeracaoSimples', { texto: 'x', modelo: 'google/veo-3.1-lite', duracaoS: 7 });
    assert.match(d.json.Error, /duração de 7 s não suportada \(aceita: 4, 6, 8 s\)/);
    assert.strictEqual(fs.readdirSync(path.join(RAIZ, 'geracao-simples')).length, antes);
});

test('série: CotarGeracao → GerarVideo → StatusJob → RetomarJobs', async () => {
    const pastaSerie = path.join(RAIZ, 'series', 'o-ultimo-farol');
    fs.mkdirSync(path.join(pastaSerie, 'episodios', 'ep01'), { recursive: true });
    fs.writeFileSync(path.join(pastaSerie, 'serie.json'), JSON.stringify({ versao: 1, id: 'o-ultimo-farol', orcamento: { tetoPlanoUsd: 1, tetoEpisodioUsd: 4, tetoSerieUsd: 40 } }));
    const pedido = { modelo: 'bytedance/seedance-1-5-pro', prompt: 'mar à noite', duracaoS: 8, resolucao: '480p', destino: 'episodios/ep01/takes/p01/take_01.mp4', ep: 1, ref: 'p01/take_01' };
    const cot = await chamar('CotarGeracao', { tipo: 'video', serie: 'o-ultimo-farol', pedido });
    assert.strictEqual(cot.status, 200, cot.json.Error);
    assert.strictEqual(cot.json.estimativa, true);
    assert.ok(cot.json.orcamento.sobraEpisodioUsd > 3.8);
    const semToken = await chamar('GerarVideo', { serie: 'o-ultimo-farol', pedido });
    assert.match(semToken.json.Error, /Confirmação inválida/);
    const g = await chamar('GerarVideo', { serie: 'o-ultimo-farol', pedido, token: cot.json.token });
    assert.strictEqual(g.status, 200, g.json.Error);
    assert.strictEqual(g.json.job.status, 'pendente');
    const r = await chamar('RetomarJobs', { serie: 'o-ultimo-farol' });
    assert.strictEqual(r.json.consultados[0].status, 'pronto');
    const st = await chamar('StatusJob', { serie: 'o-ultimo-farol', jobId: g.json.job.jobId });
    assert.strictEqual(st.json.job.status, 'pronto');
    assert.ok(fs.existsSync(path.join(pastaSerie, 'episodios', 'ep01', 'takes', 'p01', 'take_01.mp4')));
    const inexistente = await chamar('CotarGeracao', { tipo: 'video', serie: 'nao-existe', pedido });
    assert.match(inexistente.json.Error, /não existe/);
    const invalida = await chamar('CotarGeracao', { tipo: 'video', serie: '../fora', pedido });
    assert.match(invalida.json.Error, /Série inválida/);
});
