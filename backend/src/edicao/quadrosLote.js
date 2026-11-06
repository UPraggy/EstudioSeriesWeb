// Quadros-chave em lote: uma imagem por plano, feita a partir das fichas (rosto canônico do elenco + local), para o
// vídeo começar nessa imagem (primeiro quadro) e o personagem ficar igual em todos os planos.
// cotarQuadrosLote → cotações com token (nada pago); gerarQuadrosLote → PAGO só com os tokens; registra o quadro no
// plano (planos.json → quadroChave.caminho, relativo ao episódio) e na edição (plano.quadroChave.arquivo).
const fs = require('fs');
const path = require('path');
const U = require('./util');
const E = require('./edicao');

const PASTA = { personagem: 'elenco', local: 'locais', objeto: 'objetos' };
const pad2 = (n) => String(n).padStart(2, '0');

// Referências da ficha que existem no disco (rosto/imagem canônica), relativas à pasta da série.
function referenciaDaFicha(pastaSerie, f) {
    if (!f || !f.canonica || !PASTA[f.tipo]) return null;
    const rel = `${PASTA[f.tipo]}/${f.id}/${f.canonica}`;
    return fs.existsSync(path.join(pastaSerie, rel)) ? rel : null;
}

function promptDoQuadro(plano, fichas) {
    const base = String(plano.prompt || plano.visual || '').trim();
    const ancoras = (plano.ancoras || []).map((id) => fichas[id]).filter((f) => f && f.ancora).map((f) => `${f.nome}: ${f.ancora}`);
    return [
        'Single still photograph: the FIRST FRAME of this shot (not a collage, not a storyboard).',
        base,
        ancoras.length ? `Keep exactly the same face, hair, clothes and place as the reference images. ${ancoras.join('; ')}.` : '',
        'Vertical 9:16, photorealistic cinematic still, no text, no subtitles, no logos.',
    ].filter(Boolean).join(' ').replace(/\.\./g, '.');
}

/**
 * cotarQuadrosLote({ serie, ep, planos? }) — cota um quadro-chave por plano (padrão: os planos sem quadro).
 * → { cotacoes: [{ plano, pedido, token, custoPrevistoUsd, referencias, avisos }], totalUsd, simulado }
 */
async function cotarQuadrosLote({ serie, ep, planos = null } = {}) {
    const servico = require('../openrouter/servico');
    const c = U.caminhos(serie, ep);
    const edicao = await U.lerJson(c.edicao, null);
    if (!edicao) throw U.erro('Este episódio ainda não tem edição: gere as falas primeiro.', 404);
    const serieDados = await U.lerJson(path.join(c.pastaSerie, 'serie.json'), {});
    const modelo = (serieDados.modelos && serieDados.modelos.imagem) || 'google/gemini-3.1-flash-image';
    const fichas = await E.fichasPorId(c.pastaSerie);
    const alvo = (edicao.planos || []).filter((p) => (Array.isArray(planos) && planos.length ? planos.includes(p.n) : !(p.quadroChave && (p.quadroChave.arquivo || p.quadroChave.caminho))));
    if (!alvo.length) throw U.erro('Todos os planos já têm quadro-chave.', 409);
    const cotacoes = [];
    for (const p of alvo) {
        const ids = [...new Set([...(p.elenco || []), ...(p.ancoras || []), p.local].filter(Boolean))];
        const ordem = ids.map((id) => fichas[id]).filter(Boolean).sort((a, b) => (a.tipo === 'personagem' ? 0 : 1) - (b.tipo === 'personagem' ? 0 : 1));
        const referencias = ordem.map((f) => referenciaDaFicha(c.pastaSerie, f)).filter(Boolean).slice(0, 4);
        const avisos = [];
        if ((p.elenco || []).length && !referencias.length) avisos.push(`Plano ${p.n}: personagem sem imagem canônica: o rosto pode sair diferente.`);
        const pedido = {
            modelo,
            prompt: promptDoQuadro(p, fichas),
            proporcao: '9:16',
            destino: `episodios/${c.epId}/quadros/p${pad2(p.n)}-${U.novoId('q')}.png`,
            ep: c.n,
            etapa: 'quadroChave',
            ref: `p${pad2(p.n)}/quadro`,
            ...(referencias.length ? { referencias } : {}),
        };
        const cot = await servico.cotarGeracao({ tipo: 'imagem', serie, pedido });
        cotacoes.push({ plano: p.n, pedido, token: cot.token, custoPrevistoUsd: cot.custoPrevistoUsd, estimativa: Boolean(cot.estimativa), simulado: Boolean(cot.simulado), referencias, orcamento: cot.orcamento, avisos: [...avisos, ...(cot.avisos || [])] });
    }
    const totalUsd = Math.round(cotacoes.reduce((s, x) => s + (Number(x.custoPrevistoUsd) || 0), 0) * 1e6) / 1e6;
    return { cotacoes, totalUsd, simulado: cotacoes.some((x) => x.simulado), modelo };
}

/**
 * gerarQuadrosLote({ serie, ep, confirmacoes: [{ plano, pedido, token }] }) — PAGO (só com o token de cada cotação).
 * Gera em sequência e registra cada quadro no plano; para no primeiro erro (o que já saiu fica registrado).
 */
async function gerarQuadrosLote({ serie, ep, confirmacoes = [] } = {}) {
    const servico = require('../openrouter/servico');
    if (!Array.isArray(confirmacoes) || !confirmacoes.length) throw U.erro('Confirme a cotação antes de gerar (falta o token).');
    if (confirmacoes.some((x) => !x || !x.token || !x.pedido)) throw U.erro('Falta o token de confirmação: nada é gerado sem confirmar o custo.');
    const c = U.caminhos(serie, ep);
    const feitos = [];
    let erro = null;
    for (const x of confirmacoes) {
        try {
            const r = await servico.gerar({ tipo: 'imagem', serie, pedido: x.pedido, token: x.token });
            const arquivo = (r.arquivos && r.arquivos[0]) || (r.job && r.job.arquivos && r.job.arquivos[0]) || x.pedido.destino;
            feitos.push({ plano: x.plano, arquivo, custoUsd: r.job && r.job.custoUsd != null ? r.job.custoUsd : null });
        } catch (e) {
            erro = `Plano ${x.plano}: ${e.message}`;
            break;
        }
    }
    if (feitos.length) {
        // edição: o plano passa a começar no quadro novo
        await E.atualizarEdicao(serie, ep, (doc) => {
            for (const f of feitos) {
                const p = (doc.planos || []).find((q) => q.n === f.plano);
                if (p) p.quadroChave = { arquivo: f.arquivo, origem: 'imagem_ia', aprovado: true };
            }
            return doc;
        });
        // planos.json (decupagem): mesmo quadro, caminho relativo ao episódio
        const planosDoc = await U.lerJson(c.planos, null);
        if (planosDoc && Array.isArray(planosDoc.planos)) {
            const prefixo = `episodios/${c.epId}/`;
            for (const f of feitos) {
                const p = planosDoc.planos.find((q) => q.n === f.plano);
                if (p) p.quadroChave = { origem: 'imagem_ia', caminho: f.arquivo.startsWith(prefixo) ? f.arquivo.slice(prefixo.length) : f.arquivo, aprovado: true };
            }
            await U.gravarJson(c.planos, planosDoc);
        }
    }
    return { feitos, erro, total: confirmacoes.length };
}

module.exports = { cotarQuadrosLote, gerarQuadrosLote, promptDoQuadro, referenciaDaFicha };
