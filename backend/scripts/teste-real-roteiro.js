// Teste REAL e barato da etapa "roteiro" do showrunner (texto, sem imagem/vídeo), com a memória do exemplo do Farol.
// Usa fetch direto no OpenRouter com a chave do ambiente (ASE_OPENROUTER_KEY ou OPENROUTER_API_KEY) — nunca imprime a chave.
// Teto: US$ 0,02 no total (a saída máxima de cada chamada é calculada pelo preço do catálogo).
// Uso (da raiz do EstudioSeries):
//   node backend/scripts/teste-real-roteiro.js --confirmar [--modelo openai/gpt-6-luna] [--saida arquivo.json]
// Avast: se der erro de certificado, rode com NODE_EXTRA_CA_CERTS=E:\AutoShortEditorDados\ferramentas\ca-com-avast.pem
const fs = require('fs');
const os = require('os');
const path = require('path');
const { executarEtapa } = require('../src/showrunner');

const URL_BASE = 'https://openrouter.ai/api/v1';
const TETO_USD = 0.02;
const args = process.argv.slice(2);
const arg = (nome, padrao) => { const i = args.indexOf(nome); return i >= 0 && args[i + 1] ? args[i + 1] : padrao; };
const MODELO = arg('--modelo', 'openai/gpt-6-luna');
const SAIDA = arg('--saida', path.join(os.tmpdir(), 'teste-real-roteiro.json'));
const SERIE = path.join(__dirname, '..', '..', 'docs', 'exemplos', 'o-ultimo-farol');

const chave = (process.env.ASE_OPENROUTER_KEY || process.env.OPENROUTER_API_KEY || '').trim();
const limpar = (t) => (chave ? String(t).split(chave).join('***') : String(t));

async function precoDoModelo() {
    const r = await fetch(`${URL_BASE}/models`, { headers: { 'User-Agent': 'EstudioSeries-teste' } });
    if (!r.ok) throw new Error(`catálogo respondeu ${r.status}`);
    const m = (await r.json()).data.find((x) => x.id === MODELO);
    if (!m) throw new Error(`modelo ${MODELO} não está no catálogo`);
    return { entrada: Number(m.pricing?.prompt || 0), saida: Number(m.pricing?.completion || 0) };
}

(async () => {
    if (!args.includes('--confirmar')) {
        console.log(`Chamada paga (texto, teto US$ ${TETO_USD}). Rode de novo com --confirmar.`);
        return;
    }
    if (!chave) throw new Error('Chave do OpenRouter não configurada no ambiente.');
    const preco = await precoDoModelo();
    let gasto = 0;
    const usos = [];
    const chamarLLM = async (mensagens, { modelo, maxTokens }) => {
        const tokensEntrada = Math.ceil(JSON.stringify(mensagens).length / 3) + 50;
        const custoEntrada = tokensEntrada * preco.entrada;
        const sobra = TETO_USD - gasto - custoEntrada;
        const maxSaida = preco.saida > 0 ? Math.min(maxTokens, Math.floor(sobra / preco.saida)) : maxTokens;
        if (maxSaida < 1500) throw new Error(`teto de US$ ${TETO_USD} não deixa espaço para a resposta (gasto até aqui US$ ${gasto.toFixed(5)})`);
        const corpo = {
            model: modelo, messages: mensagens, max_tokens: maxSaida, temperature: 0.7,
            response_format: { type: 'json_object' }, usage: { include: true }, reasoning: { effort: 'low' },
        };
        const r = await fetch(`${URL_BASE}/chat/completions`, {
            method: 'POST', body: JSON.stringify(corpo),
            headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json', 'X-Title': 'EstudioSeries teste', 'User-Agent': 'EstudioSeries-teste' },
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || j.error) throw new Error(`OpenRouter ${r.status}: ${limpar(j.error?.message || JSON.stringify(j).slice(0, 300))}`);
        const custo = Number(j.usage?.cost ?? (j.usage ? j.usage.prompt_tokens * preco.entrada + j.usage.completion_tokens * preco.saida : 0));
        gasto += custo;
        usos.push({ entrada: j.usage?.prompt_tokens, saida: j.usage?.completion_tokens, custoUsd: custo, fim: j.choices?.[0]?.finish_reason });
        const conteudo = j.choices?.[0]?.message?.content;
        return { conteudo: Array.isArray(conteudo) ? conteudo.map((p) => p.text || '').join('') : conteudo, custoUsd: custo };
    };

    const r = await executarEtapa('roteiro', { ep: 1, pasta: SERIE, instrucoes: 'Siga a memória. Ep. 1 da série.' }, { chamarLLM, modelo: MODELO, maxTentativas: 2, tetoUsd: TETO_USD });
    fs.writeFileSync(SAIDA, JSON.stringify({ ...r, usos }, null, 2));
    console.log(JSON.stringify({
        ok: r.ok, modelo: MODELO, tentativas: r.tentativas, custoUsd: Number(gasto.toFixed(6)), usos,
        erros: r.erros, avisos: r.avisos, consertos: r.consertos.length, planos: r.resultado?.planos?.length ?? null,
        titulo: r.resultado?.titulo ?? null, saida: SAIDA,
    }, null, 2));
})().catch((e) => { console.error('Falhou:', limpar(e.message)); process.exit(1); });
