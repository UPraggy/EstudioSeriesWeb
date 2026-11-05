// montarContexto: só o relevante por finalidade, corte por tamanho com prioridade, imagens multimodais.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { montarContexto } = require('../src/memoria');

const DOCS = path.join(__dirname, '..', '..', 'docs', 'exemplos');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const ler = (arq) => JSON.parse(fs.readFileSync(path.join(DOCS, arq), 'utf8'));

// Cópia do Farol numa pasta temporária, com Ep. 1 aprovado e algumas referências (PNG 1x1).
function serieTemporaria({ refs = true, quadroP03Aprovado = false } = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'memoria-ctx-'));
    const pasta = path.join(dir, 'o-ultimo-farol');
    fs.cpSync(path.join(DOCS, 'o-ultimo-farol'), pasta, { recursive: true });
    const ep = path.join(pasta, 'episodios', 'ep01');
    fs.mkdirSync(ep, { recursive: true });
    const roteiro = { ...ler('farol-ep01-roteiro.json'), aprovado: true };
    const planos = ler('farol-ep01-planos.json');
    if (quadroP03Aprovado) {
        planos.planos.find((p) => p.n === 3).quadroChave.aprovado = true;
        fs.mkdirSync(path.join(ep, 'quadros'), { recursive: true });
        fs.writeFileSync(path.join(ep, 'quadros', 'p03.png'), PNG);
    }
    fs.writeFileSync(path.join(ep, 'roteiro.json'), JSON.stringify(roteiro));
    fs.writeFileSync(path.join(ep, 'planos.json'), JSON.stringify(planos));
    if (refs) {
        for (const rel of ['elenco/mara/ref/padrao-frente.png', 'elenco/mara/ref/padrao-corpo.png', 'elenco/mara/ref/padrao-perfil.png',
            'locais/sala/ref/sala.png', 'objetos/radio/ref/radio.png']) {
            fs.mkdirSync(path.dirname(path.join(pasta, rel)), { recursive: true });
            fs.writeFileSync(path.join(pasta, rel), PNG);
        }
    }
    return { dir, pasta, roteiro, planos, limpar: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

const textoUsuario = (pacote) => {
    const c = pacote.mensagens.find((m) => m.role === 'user').content;
    return typeof c === 'string' ? c : c.filter((p) => p.type === 'text').map((p) => p.text).join('\n');
};

test('roteiro: premissa, regras, estado e escolhas; posições não se repetem como fato', async () => {
    const t = serieTemporaria();
    try {
        const p = await montarContexto(t.pasta, 'roteiro', { ep: 1 });
        const u = textoUsuario(p);
        assert.strictEqual(p.mensagens[0].role, 'system');
        assert.match(u, /Só se chega de barco/);
        assert.match(u, /ESTADO DO MUNDO NO INÍCIO DO EP\. 1/);
        assert.match(u, /Primeiro episódio: ainda não há escolhas/);
        assert.match(u, /Mistério: Por que o surto começou/);
        assert.doesNotMatch(u, /Mara começa em/); // fato de posição já está no estado
        assert.ok(p.tamanho.caracteres <= p.tamanho.limite);
        assert.deepStrictEqual(p.imagens, []);
    } finally { t.limpar(); }
});

test('roteiro: com limite pequeno corta o menos importante primeiro e mantém o essencial', async () => {
    const t = serieTemporaria();
    try {
        const p = await montarContexto(t.pasta, 'roteiro', { ep: 1, limiteCaracteres: 1600 });
        const u = textoUsuario(p);
        assert.ok(p.tamanho.caracteres <= 1600, `ficou com ${p.tamanho.caracteres}`);
        assert.match(u, /SÉRIE E EPISÓDIO/); // seção fixa
        assert.match(u, /Só se chega de barco/); // regra importância 3
        assert.doesNotMatch(u, /LOCAIS E OBJETOS/); // prioridade 4 saiu
        const secoes = p.cortes.map((c) => c.secao);
        assert.ok(secoes.includes('ids') && secoes.includes('temporada'));
        assert.ok(p.cortes.every((c) => c.quantidade >= 1 && Array.isArray(c.itens)));
    } finally { t.limpar(); }
});

test('decupagem: roteiro aprovado fixo + âncoras de quem/onde aparece + referências disponíveis', async () => {
    const t = serieTemporaria();
    try {
        const p = await montarContexto(t.pasta, 'decupagem', { ep: 1 });
        const u = textoUsuario(p);
        assert.match(u, /ROTEIRO APROVADO/);
        assert.match(u, /P6 · 37–46 s/);
        assert.match(u, /woman in her early 30s/); // âncora EN da Mara
        assert.match(u, /yellow rain jacket/); // âncora do Davi
        assert.match(u, /frente=elenco\/mara\/ref\/padrao-frente\.png/);
        assert.deepStrictEqual(p.avisos.filter((a) => /não está aprovado/.test(a)), []);
    } finally { t.limpar(); }
});

test('quadroChave: mensagem multimodal com data URL, identidade primeiro, limite de imagens', async () => {
    const t = serieTemporaria();
    try {
        const p = await montarContexto(t.pasta, 'quadroChave', { ep: 1, plano: 3, maxImagens: 3 });
        const partes = p.mensagens[1].content;
        assert.ok(Array.isArray(partes));
        const imgs = partes.filter((x) => x.type === 'image_url');
        assert.strictEqual(imgs.length, 3);
        assert.match(imgs[0].image_url.url, /^data:image\/png;base64,/);
        assert.deepStrictEqual(p.imagens.map((i) => i.caminho), [
            'elenco/mara/ref/padrao-frente.png', 'locais/sala/ref/sala.png', 'elenco/mara/ref/padrao-corpo.png']);
        assert.match(p.imagens[0].papel, /identidade de Mara/);
        assert.ok(partes.some((x) => x.type === 'text' && /^Imagem 1 — identidade/.test(x.text)));
        const corte = p.cortes.find((c) => c.motivo === 'limite_imagens');
        assert.strictEqual(corte.quantidade, 2); // rádio e perfil ficaram de fora
        assert.match(textoUsuario(p), /seen in profile/);
        assert.ok(p.tamanho.bytesImagens > 0);
    } finally { t.limpar(); }
});

test('quadroChave: referência que não existe é cortada (arquivo_ausente) com dataUrl', async () => {
    const t = serieTemporaria({ refs: false });
    try {
        const p = await montarContexto(t.pasta, 'quadroChave', { ep: 1, plano: 5 });
        assert.strictEqual(p.imagens.length, 0);
        assert.ok(p.cortes.some((c) => c.motivo === 'arquivo_ausente'));
        assert.strictEqual(typeof p.mensagens[1].content, 'string');
        // sem dataUrl (revisão humana) a lista aparece com existe:false
        const r = await montarContexto(t.pasta, 'quadroChave', { ep: 1, plano: 5, dataUrl: false });
        assert.ok(r.imagens.length > 0 && r.imagens.every((i) => i.existe === false));
        assert.match(r.mensagens[1].content.find((x) => x.type === 'image_url').image_url.url, /^arquivo:/);
    } finally { t.limpar(); }
});

test('video: com quadro-chave aprovado, só o primeiro quadro vai (referências cortadas)', async () => {
    const t = serieTemporaria({ quadroP03Aprovado: true });
    try {
        const p = await montarContexto(t.pasta, 'video', { ep: 1, plano: 3 });
        assert.deepStrictEqual(p.imagens.map((i) => [i.caminho, i.papel]), [['episodios/ep01/quadros/p03.png', 'primeiro_quadro']]);
        assert.ok(p.cortes.some((c) => c.motivo === 'primeiro_quadro_vence' && c.quantidade >= 3));
        assert.deepStrictEqual(p.pedido.anexos, [{ tipo: 'imagem', arquivo: 'episodios/ep01/quadros/p03.png', papel: 'primeiro_quadro' }]);
        assert.strictEqual(p.pedido.modelo, 'google/veo-3.1-lite');
        assert.strictEqual(p.pedido.duracaoS, 8);
        assert.ok(p.pedido.prompt.length <= 1500);
        assert.match(p.pedido.prompt, /^Camera: Medium shot/);
        assert.doesNotMatch(p.pedido.prompt, /##/); // prompt de vídeo sem cabeçalhos
    } finally { t.limpar(); }
});

test('video: sem quadro-chave aprovado avisa e vai só com referências', async () => {
    const t = serieTemporaria();
    try {
        const p = await montarContexto(t.pasta, 'video', { ep: 1, plano: 5 });
        assert.ok(p.avisos.some((a) => /não tem quadro-chave aprovado/.test(a)));
        assert.ok(p.pedido.anexos.every((a) => a.papel === 'referencia'));
        assert.ok(p.imagens.length <= 2);
    } finally { t.limpar(); }
});

test('verificacao e consolidacao: prompt pede JSON e traz o roteiro inteiro', async () => {
    const t = serieTemporaria();
    try {
        const v = await montarContexto(t.pasta, 'verificacao', { ep: 1 });
        assert.match(v.mensagens[0].content, /"contradicoes"/);
        assert.match(textoUsuario(v), /ROTEIRO A VERIFICAR/);
        const c = await montarContexto(t.pasta, 'consolidacao', { ep: 1, votacao: null });
        assert.match(c.mensagens[0].content, /"fatosNovos"/);
        assert.match(textoUsuario(c), /Votação ainda NÃO registrada/);
    } finally { t.limpar(); }
});

test('erros claros: finalidade desconhecida e plano inexistente', async () => {
    const t = serieTemporaria();
    try {
        await assert.rejects(montarContexto(t.pasta, 'audio', { ep: 1 }), /Finalidade desconhecida/);
        await assert.rejects(montarContexto(t.pasta, 'quadroChave', { ep: 1, plano: 42 }), /Plano 42 não encontrado/);
    } finally { t.limpar(); }
});

test('imagem com caminho fora da pasta da série nunca é lida', async () => {
    const t = serieTemporaria();
    try {
        const arq = path.join(t.pasta, 'elenco', 'mara', 'ficha.json');
        const f = JSON.parse(fs.readFileSync(arq, 'utf8'));
        f.estados[0].refs.frente = '../../../../segredo.png';
        fs.writeFileSync(arq, JSON.stringify(f));
        fs.writeFileSync(path.join(t.dir, 'segredo.png'), PNG);
        const p = await montarContexto(t.pasta, 'quadroChave', { ep: 1, plano: 3 });
        assert.ok(p.cortes.some((c) => c.motivo === 'fora_da_pasta_da_serie'));
        assert.ok(p.imagens.every((i) => !i.caminho.includes('..')));
    } finally { t.limpar(); }
});
