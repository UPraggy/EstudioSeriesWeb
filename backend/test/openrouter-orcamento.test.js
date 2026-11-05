// Tetos (plano/episódio/série) e confirmação em dois passos (token assinado, 10 min, deste pedido, uso único).
const test = require('node:test');
const assert = require('node:assert');
const { verificar, criarConfirmador } = require('../src/openrouter/orcamento');
const { ErroOrcamento, ErroConfirmacao } = require('../src/openrouter/erros');
const aj = require('./fixtures/openrouter-ajuda');

test('teto por plano estourado', async () => {
    await assert.rejects(verificar(0.4, { tetos: { plano: 0.3 } }), (e) => e instanceof ErroOrcamento && e.limite === 'plano' && /US\$ 0,40 passa do teto por plano \(US\$ 0,30\)/.test(e.message));
    const ok = await verificar(0.3, { tetos: { plano: 0.3 } });
    assert.strictEqual(ok.ok, true);
});

test('teto do episódio conta o livro e os jobs pendentes', async () => {
    const livro = aj.livroMemoria();
    livro.registrar({ ep: 1, realUsd: 3.5 });
    livro.registrar({ ep: 2, realUsd: 9 });
    const tetos = { plano: 1, episodio: 4, serie: 40 };
    const r = await verificar(0.24, { tetos, livro, ep: 1 });
    assert.strictEqual(r.gastoEpisodioUsd, 3.5);
    assert.strictEqual(r.sobraEpisodioUsd, 0.26);
    await assert.rejects(verificar(0.24, { tetos, livro, ep: 1, pendentes: { episodioUsd: 0.3, serieUsd: 0.3 } }),
        (e) => e.limite === 'episodio' && /Episódio 1: já gasto\/reservado US\$ 3,80/.test(e.message) && /Sobra US\$ 0,20/.test(e.message));
});

test('teto da série estourado', async () => {
    const livro = aj.livroMemoria();
    livro.registrar({ ep: 1, realUsd: 39.9 });
    await assert.rejects(verificar(0.24, { tetos: { serie: 40 }, livro, ep: 2 }), (e) => e.limite === 'serie' && /teto da série \(US\$ 40,00\)/.test(e.message));
});

test('teto de episódio/série sem livro: recusa (não dá para conferir)', async () => {
    await assert.rejects(verificar(0.1, { tetos: { serie: 10 } }), /Sem o livro de custos/);
    await assert.rejects(verificar(-1, {}), /inválido/);
});

test('confirmação: cotar → executar roda uma vez; o mesmo token não paga 2x', async () => {
    const conf = criarConfirmador();
    const pedido = { tipo: 'video', modelo: 'google/veo-3.1-lite', prompt: 'farol', duracaoS: 8 };
    const cot = await conf.cotar(pedido, async () => ({ custoPrevistoUsd: 0.24, detalhe: [] }));
    assert.strictEqual(cot.custoPrevistoUsd, 0.24);
    assert.match(cot.token, /^[\w-]+\.[\w-]+$/);
    let rodou = 0;
    const r = await conf.executar({ ...pedido }, cot.token, async (_p, info) => { rodou++; return info.custoPrevistoUsd; });
    assert.strictEqual(r, 0.24);
    await assert.rejects(conf.executar(pedido, cot.token, async () => { rodou++; }), (e) => e instanceof ErroConfirmacao && e.motivo === 'usado');
    assert.strictEqual(rodou, 1);
});

test('confirmação: token inválido, adulterado, expirado ou de outro pedido não roda nada', async () => {
    let t = 1_000_000;
    const conf = criarConfirmador({ agora: () => t });
    const pedido = { tipo: 'video', modelo: 'm', prompt: 'a' };
    const cot = await conf.cotar(pedido, async () => ({ custoPrevistoUsd: 0.4 }));
    let rodou = 0;
    const rodar = async () => { rodou++; };
    await assert.rejects(conf.executar(pedido, 'lixo', rodar), (e) => e.motivo === 'invalido');
    await assert.rejects(conf.executar(pedido, undefined, rodar), (e) => e.motivo === 'invalido');
    // adulterar o custo dentro do token quebra a assinatura
    const [corpo, assin] = cot.token.split('.');
    const dados = JSON.parse(Buffer.from(corpo, 'base64url').toString());
    dados.c = 0.01;
    const falso = `${Buffer.from(JSON.stringify(dados)).toString('base64url')}.${assin}`;
    await assert.rejects(conf.executar(pedido, falso, rodar), (e) => e.motivo === 'invalido');
    // outro pedido (mudou o prompt)
    await assert.rejects(conf.executar({ ...pedido, prompt: 'b' }, cot.token, rodar), (e) => e.motivo === 'outro_pedido' && /outro pedido/.test(e.message));
    // token de outro processo (outro segredo)
    const outro = criarConfirmador({ agora: () => t });
    await assert.rejects(outro.executar(pedido, cot.token, rodar), (e) => e.motivo === 'invalido');
    // expirou (10 min)
    t += 10 * 60 * 1000 + 1;
    await assert.rejects(conf.executar(pedido, cot.token, rodar), (e) => e.motivo === 'expirado' && /expirou/.test(e.message));
    assert.strictEqual(rodou, 0);
});

test('confirmação: a ordem das chaves do pedido não importa', async () => {
    const conf = criarConfirmador();
    const cot = await conf.cotar({ a: 1, b: { c: 2, d: 3 } }, async () => ({ custoPrevistoUsd: 0 }));
    const r = await conf.executar({ b: { d: 3, c: 2 }, a: 1 }, cot.token, async () => 'ok');
    assert.strictEqual(r, 'ok');
});
