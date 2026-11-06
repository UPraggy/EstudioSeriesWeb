// Etapas de TEXTO do showrunner com plataforma de fora (ChatGPT, Claude, Gemini...):
//  - verPromptEtapa: roda o MESMO preparar da etapa e devolve sistema + usuário + modelo + limite + formato esperado,
//    sem chamar a IA (custo 0);
//  - proporResultadoExterno: recebe o texto colado (JSON puro ou com texto em volta) e passa pelo MESMO caminho da
//    etapa (extrairJson → validar/consertar → continuidade), só que com um "LLM" que devolve o texto colado, uma
//    tentativa e custo 0. Volta como uma proposta normal; o roteiro entra no histórico do episódio com origem "externo".
const { prepararEtapa, executarEtapa } = require('../showrunner/etapas');
const { caminhoSerie } = require('../memoria');
const notas = require('../series/notas');
const armazem = require('../series/armazem');
const registro = require('../log/registro');

const ETAPAS_TEXTO = ['ideias', 'biblia', 'roteiro', 'decupagem', 'atualizarMundo'];
const MAX_TEXTO_COLADO = 400000;

function exigirEtapa(etapa) {
    if (!etapa) throw armazem.erro('Informe "etapa".');
    if (!ETAPAS_TEXTO.includes(etapa)) throw armazem.erro(`Etapa desconhecida: ${etapa}. Use: ${ETAPAS_TEXTO.join(', ')}.`);
}

// Mesmo saneamento do ShowrunnerEtapa: caminho de pasta só vem do serieId.
function contextoSeguro(serieId, contexto = {}) {
    const ctx = { ...(contexto && typeof contexto === 'object' ? contexto : {}) };
    delete ctx.pasta;
    if (ctx.serie && typeof ctx.serie === 'object') ctx.serie = { ...ctx.serie, pasta: undefined };
    if (serieId) {
        armazem.exigirId(serieId, 'serieId');
        ctx.pasta = caminhoSerie(serieId);
    }
    return ctx;
}

// O "FORMATO:" do fim do prompt de sistema (o JSON que a etapa espera de volta).
function formatoDe(sistema) {
    const s = String(sistema || '');
    const i = s.lastIndexOf('FORMATO:');
    if (i < 0) return '';
    const resto = s.slice(i + 'FORMATO:'.length);
    const fim = resto.search(/\n\s*(?:SOBRE A MEMÓRIA|MODO REVISÃO)/);
    return (fim >= 0 ? resto.slice(0, fim) : resto).trim();
}

/**
 * verPromptEtapa({ etapa, serieId, contexto, modelo }) → { ok, etapa, modelo, maxTokens, sistema, usuario,
 *   promptCompleto, formato, mensagens, tamanhoPrompt, avisos, cortesMemoria, erros, gasto: 0 }
 */
async function verPromptEtapa({ etapa, serieId, contexto = {}, modelo } = {}) {
    exigirEtapa(etapa);
    const ctx = contextoSeguro(serieId, contexto);
    const { prep, modelo: mod, maxTokens } = await prepararEtapa(etapa, ctx, { modelo });
    if (prep.erros && prep.erros.length) return { ok: false, etapa, modelo: mod, maxTokens, erros: prep.erros, gasto: 0 };
    const formato = formatoDe(prep.sistema);
    const promptCompleto = [
        '### INSTRUÇÕES (mensagem de sistema)',
        prep.sistema,
        '',
        '### PEDIDO (mensagem do usuário)',
        prep.usuario,
        '',
        '### RESPOSTA',
        'Responda SÓ com o objeto JSON completo, no FORMATO indicado acima, sem texto antes ou depois.',
    ].join('\n');
    return {
        ok: true,
        etapa,
        modelo: mod,
        maxTokens,
        sistema: prep.sistema,
        usuario: prep.usuario,
        promptCompleto,
        formato,
        mensagens: [{ role: 'system', content: prep.sistema }, { role: 'user', content: prep.usuario }],
        tamanhoPrompt: prep.sistema.length + prep.usuario.length,
        avisos: prep.avisos || [],
        cortesMemoria: prep.cortes || [],
        erros: [],
        gasto: 0,
        nota: 'Só leitura: a IA não foi chamada. Cole a resposta de fora em "Colar resposta de fora".',
    };
}

/**
 * proporResultadoExterno({ etapa, serieId, contexto, texto }) → o mesmo formato do ShowrunnerEtapa
 * ({ ok, resultado, erros, avisos, consertos, custoUsd: 0, ... }) + origem: "externo" (+ historico no roteiro).
 */
async function proporResultadoExterno({ etapa, serieId, contexto = {}, texto } = {}) {
    exigirEtapa(etapa);
    if (typeof texto !== 'string' || !texto.trim()) throw armazem.erro('Cole a resposta (campo "texto").');
    if (texto.length > MAX_TEXTO_COLADO) throw armazem.erro(`Resposta grande demais (${texto.length} caracteres; máximo ${MAX_TEXTO_COLADO}).`, 413);
    const ctx = contextoSeguro(serieId, contexto);
    const colado = async () => ({ conteudo: texto, custoUsd: 0 });
    const r = await executarEtapa(etapa, ctx, { chamarLLM: colado, maxTentativas: 1, modelo: 'externo' });
    r.origem = 'externo';
    r.custoUsd = 0;
    if (etapa === 'roteiro' && serieId && r.resultado) {
        const revisao = Boolean(typeof ctx.ajustes === 'string' && ctx.ajustes.trim());
        try {
            r.historico = await notas.registrarProposta(serieId, ctx.ep, {
                tipo: revisao ? 'ajuste' : 'escrever',
                base: ctx.roteiroBase ? 'proposta' : 'salvo',
                baseVersao: Number.isInteger(ctx.baseVersao) ? ctx.baseVersao : undefined,
                observacoes: typeof ctx.instrucoes === 'string' ? ctx.instrucoes : '',
                ajustes: revisao ? ctx.ajustes.trim() : '',
                duracaoAlvoS: ctx.duracaoAlvoS ?? r.resultado.duracaoAlvoS,
                semEscolha: ctx.semEscolha,
                custoUsd: 0, modelo: 'externo', ok: r.ok, erros: r.erros, resultado: r.resultado, origem: 'externo',
            });
        } catch (e) {
            r.avisos = [...(r.avisos || []), `Não guardei esta proposta no histórico do episódio: ${e.message}`];
        }
    }
    registro.registrar({
        nivel: r.ok ? 'info' : 'aviso', area: 'showrunner', evento: 'resultado-externo', serie: serieId || undefined, ep: ctx.ep,
        msg: r.ok ? `Resposta de fora aceita na etapa "${etapa}"` : `Resposta de fora na etapa "${etapa}" com ${(r.erros || []).length} problema(s): ${(r.erros || []).slice(0, 2).join(' | ')}`,
        dados: { etapa, ok: r.ok, caracteres: texto.length, erros: (r.erros || []).slice(0, 5), consertos: (r.consertos || []).length, custoUsd: 0, origem: 'externo', historico: r.historico ? r.historico.versao : undefined },
    });
    return r;
}

module.exports = { ETAPAS_TEXTO, verPromptEtapa, proporResultadoExterno, formatoDe, contextoSeguro };
