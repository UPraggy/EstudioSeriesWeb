// Registro das requisições HTTP (método, rota, status, ms — nunca o corpo nem a query inteira).
// Rotas "barulhentas" (mídia, miniaturas, onda, consultas de andamento, o próprio Registro) não viram uma linha
// cada: são somadas e gravadas a cada minuto num evento "agregado". Erros (status >= 400) sempre têm linha própria.
// Também registra o evento de domínio das rotas que mudam coisas (apagar, restaurar, salvar edição...), com
// campos pequenos escolhidos do pedido e da resposta (tabela EVENTOS_ROTA).
const R = require('./registro');

const SILENCIOSAS = new Set([
    'Midia', 'MidiaSimples', 'MiniaturasClipe', 'OndaAudio', 'ExtrairQuadro', 'OuvirFala',
    'Saude', 'StatusJob', 'StatusRender', 'StatusRegeracao', 'Registro', 'RegistroResumo',
]);
const INTERVALO_AGREGADO_MS = 60 * 1000;

// Nome da rota sem /api e sem a query ("/api/LerSerie?serie=x" → "LerSerie"); arquivos do site viram "(site)".
function nomeDaRota(req) {
    const p = String(req.path || req.url || '').split('?')[0].replace(/^\/api(?=\/)/, '');
    const m = /^\/([A-Za-z][A-Za-z0-9]*)\/?$/.exec(p);
    if (m) return m[1];
    return p === '/' || /\.[a-z0-9]{1,5}$/i.test(p) || p.startsWith('/assets/') ? '(site)' : R.limparTexto(p, 80);
}

const primeiro = (...v) => v.find((x) => x !== undefined && x !== null && x !== '');

// serie/ep do pedido (só esses dois campos saem do corpo/query)
function contextoDoPedido(req) {
    const q = req.query || {};
    const b = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    const ctx = b.contexto && typeof b.contexto === 'object' ? b.contexto : {};
    const serie = primeiro(b.serie, b.serieId, q.serie, q.serieId);
    return {
        serie: typeof serie === 'string' ? serie : undefined,
        ep: primeiro(b.ep, b.episodio, b.n, ctx.ep, q.ep, q.episodio),
    };
}

// revisão da edição: as rotas da Mesa devolvem { edicao: { revisao }, historico }
const rev = (r) => (r && r.edicao && r.edicao.revisao !== undefined ? r.edicao.revisao : r && r.revisao);
const n = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const tamanho = (v) => (Array.isArray(v) ? v.length : undefined);

/**
 * Eventos de domínio por rota (só com resposta 2xx): area, evento, msg e os campos pequenos.
 * fn(pedido, resposta) → { msg?, dados?, serie?, ep?, nivel? }
 */
const EVENTOS_ROTA = {
    CriarSerie: { area: 'serie', evento: 'criar', fn: (p, r) => ({ serie: r.serie && r.serie.id, msg: `Série criada: ${(r.serie && r.serie.titulo) || p.titulo || ''}` }) },
    CriarEpisodio: { area: 'serie', evento: 'criar-episodio', fn: (p, r) => ({ ep: r.episodio && r.episodio.n, msg: `Episódio ${r.episodio && r.episodio.n} criado`, dados: { duracaoAlvoS: r.episodio && r.episodio.duracaoAlvoS, semEscolha: r.episodio && r.episodio.semEscolha } }) },
    SalvarRoteiro: { area: 'serie', evento: 'salvar-roteiro', fn: (p, r) => ({ ep: primeiro(p.n, p.roteiro && p.roteiro.n), msg: 'Roteiro salvo', dados: { avisos: tamanho(r.avisos) } }) },
    SalvarBiblia: { area: 'serie', evento: 'salvar-biblia', fn: (p) => ({ msg: 'Bíblia salva', dados: { campos: Object.keys(p.campos || {}) } }) },
    SalvarFicha: { area: 'serie', evento: 'salvar-ficha', fn: (p) => ({ msg: `Ficha salva (${p.tipo || '?'})`, dados: { tipo: p.tipo, id: p.ficha && p.ficha.id } }) },
    AdicionarReferencia: { area: 'serie', evento: 'adicionar-referencia', fn: (p) => ({ msg: 'Referência adicionada', dados: { tipo: p.tipo, id: p.id } }) },
    DefinirCanonica: { area: 'serie', evento: 'definir-canonica', fn: (p) => ({ msg: 'Referência canônica definida', dados: { tipo: p.tipo, id: p.id } }) },
    RegistrarVotacao: { area: 'serie', evento: 'votacao', fn: (p) => ({ msg: `Votação registrada: ${(p.votacao && p.votacao.vencedora) || p.vencedora || '?'}`, dados: { vencedora: (p.votacao && p.votacao.vencedora) || p.vencedora, fonte: (p.votacao && p.votacao.fonte) || p.fonte } }) },
    SalvarEdicao: { area: 'edicao', evento: 'salvar', fn: (p, r) => ({ msg: `Edição salva (revisão ${rev(r) ?? '?'})`, dados: { revisao: rev(r), revisaoBase: p.revisaoBase } }) },
    DesfazerEdicao: { area: 'edicao', evento: 'desfazer', fn: (p, r) => ({ msg: `Desfazer: voltou para a revisão ${rev(r) ?? '?'}`, dados: { revisao: rev(r), historico: r.historico } }) },
    RefazerEdicao: { area: 'edicao', evento: 'refazer', fn: (p, r) => ({ msg: `Refazer: avançou para a revisão ${rev(r) ?? '?'}`, dados: { revisao: rev(r), historico: r.historico } }) },
    EdicaoInicial: { area: 'edicao', evento: 'edicao-inicial', fn: (p, r) => ({ msg: `Edição inicial montada (revisão ${rev(r) ?? '?'})`, dados: { revisao: rev(r), gerarFalas: p.gerarFalas === true || p.gerarFalas === 'true', forcar: p.forcar === true || p.forcar === 'true', duracaoS: n(r.edicao && r.edicao.duracaoS) } }) },
    RegerarFala: { area: 'edicao', evento: 'regerar-fala', fn: (p, r) => ({ msg: `Fala ${p.id} regerada`, dados: { id: p.id, intencao: p.intencao, revisao: rev(r), doCache: r.doCache, delta: n(r.delta) } }) },
    RegerarLegenda: { area: 'legenda', evento: 'regerar-trecho', fn: (p, r) => ({ msg: 'Legenda do trecho recalculada', dados: { deS: p.deS, ateS: p.ateS, revisao: rev(r), falas: n(r.falas) } }) },
    CotarTrecho: { area: 'edicao', evento: 'cotar-trecho', fn: (p, r) => ({ msg: `Trecho ${p.deS}–${p.ateS} s cotado`, dados: { deS: p.deS, ateS: p.ateS, modelo: p.modelo, previstoUsd: n(r.totalUsd), planos: tamanho(r.cotacoes), simulado: r.simulado === true } }) },
    RegerarTrecho: { area: 'edicao', evento: 'regerar-trecho', fn: (p) => ({ msg: 'Regeração de trecho confirmada', dados: { planos: tamanho(p.confirmacoes) } }) },
    ApagarSerie: { area: 'lixeira', evento: 'apagar-serie', fn: (p, r) => ({ msg: 'Série movida para a lixeira', dados: { item: r.item } }) },
    ApagarEpisodio: { area: 'lixeira', evento: 'apagar-episodio', fn: (p, r) => ({ msg: `Episódio ${(r.episodio && r.episodio.n) ?? ''} movido para a lixeira`, dados: { item: r.item, avisos: r.avisos } }) },
    RefazerRoteiro: { area: 'lixeira', evento: 'refazer-roteiro', fn: (p, r) => ({ msg: 'Roteiro guardado em versão e episódio voltou para "roteiro"', dados: { versao: r.versao, movidos: tamanho(r.movidos), preservados: tamanho(r.preservados) } }) },
    RestaurarDaLixeira: { area: 'lixeira', evento: 'restaurar', fn: (p, r) => ({ serie: r.serie, ep: r.ep, msg: `Restaurado da lixeira: ${r.titulo || p.item}`, dados: { item: p.item, tipo: r.tipo } }) },
    RestaurarVersaoRoteiro: { area: 'lixeira', evento: 'restaurar-versao', fn: (p, r) => ({ msg: `Versão do roteiro restaurada: ${p.versao}`, dados: { versao: p.versao, guardada: r.guardada, avisos: r.avisos } }) },
    MemoriaConsolidar: { area: 'memoria', evento: 'consolidar', fn: (p, r) => ({ msg: p.aprovar === true ? 'Memória do episódio gravada (aprovada)' : 'Proposta de memória gerada', dados: { aprovar: p.aprovar === true, usarLLM: p.usarLLM === true, ok: r.ok, custoUsd: n(r.custoUsd), avisos: tamanho(r.avisos) } }) },
    MemoriaVerificar: { area: 'memoria', evento: 'verificar', fn: (p, r) => ({ nivel: r.ok === false ? 'aviso' : 'info', msg: r.ok === false ? `Continuidade: ${tamanho(r.problemas) || 0} problema(s)` : 'Continuidade conferida sem problemas', dados: { ok: r.ok, problemas: tamanho(r.problemas), usarLLM: p.usarLLM === true } }) },
    MemoriaSemear: { area: 'memoria', evento: 'semear', fn: (p) => ({ msg: p.aprovar === true ? 'Memória inicial gravada' : 'Proposta de memória inicial gerada', dados: { aprovar: p.aprovar === true } }) },
    MixarAudio: { area: 'audio', evento: 'mixar', fn: (p, r) => ({ msg: 'Áudio do episódio mixado', dados: { duracaoS: n(r.duracaoS), tipo: r.tipo } }) },
    TestarPronuncia: { area: 'audio', evento: 'testar-pronuncia', fn: (p) => ({ msg: 'Pronúncia testada', dados: { voz: p.voz } }) },
};

function criarMiddleware({ intervaloMs = INTERVALO_AGREGADO_MS } = {}) {
    let agregado = new Map(); // rota → { quantidade, somaMs, maxMs }
    let total = 0;

    function descarregar() {
        if (!total) return;
        const rotas = {};
        for (const [rota, a] of agregado) rotas[rota] = { n: a.quantidade, msMedio: Math.round(a.somaMs / a.quantidade), msMax: a.maxMs };
        R.registrar({ area: 'http', evento: 'agregado', msg: `${total} requisições de mídia/andamento no último minuto`, dados: { quantidade: total, rotas } });
        agregado = new Map();
        total = 0;
    }
    const timer = setInterval(descarregar, intervaloMs);
    if (timer.unref) timer.unref();

    function middleware(req, res, next) {
        const fim = R.cronometro();
        let corpo = null;
        const json = res.json.bind(res);
        res.json = (b) => { corpo = b; return json(b); };
        let feito = false;
        const concluir = (abortado) => {
            if (feito) return;
            feito = true;
            try {
                const ms = fim();
                const rota = nomeDaRota(req);
                const status = abortado ? 0 : res.statusCode;
                const metodo = req.method;
                if (metodo === 'OPTIONS' || ((SILENCIOSAS.has(rota) || rota === '(site)') && status > 0 && status < 400)) {
                    const chave = metodo === 'OPTIONS' ? '(pré-voo)' : rota;
                    const a = agregado.get(chave) || { quantidade: 0, somaMs: 0, maxMs: 0 };
                    a.quantidade += 1; a.somaMs += ms; a.maxMs = Math.max(a.maxMs, ms);
                    agregado.set(chave, a);
                    total += 1;
                    return;
                }
                const ctx = contextoDoPedido(req);
                const erroMsg = corpo && typeof corpo === 'object' && corpo.Error ? R.limparTexto(corpo.Error, 400) : null;
                const nivel = abortado ? 'aviso' : status >= 500 ? 'erro' : status >= 400 ? 'aviso' : 'info';
                R.registrar({
                    nivel, area: 'http', evento: 'requisicao', serie: ctx.serie, ep: ctx.ep, ms,
                    msg: `${metodo} /${rota} → ${abortado ? 'cancelada pelo navegador' : status}${erroMsg ? `: ${erroMsg}` : ''}`,
                    dados: { metodo, rota, status },
                });
                const def = EVENTOS_ROTA[rota];
                if (def && metodo === 'POST' && status >= 200 && status < 300 && corpo && typeof corpo === 'object') {
                    const pedido = req.body && typeof req.body === 'object' ? req.body : {};
                    let extra = {};
                    try { extra = def.fn(pedido, corpo) || {}; } catch { extra = {}; }
                    R.registrar({
                        area: def.area, evento: def.evento, serie: extra.serie || ctx.serie, ep: extra.ep ?? ctx.ep,
                        nivel: extra.nivel || 'info', msg: extra.msg || def.evento, dados: extra.dados, ms,
                    });
                } else if (def && metodo === 'POST' && (status >= 400 || abortado)) {
                    // a falha também aparece na área da operação (filtrar por "lixeira" mostra o apagar que deu errado)
                    R.registrar({
                        area: def.area, evento: `${def.evento}-falhou`, serie: ctx.serie, ep: ctx.ep, ms,
                        nivel: status >= 500 || abortado ? 'erro' : 'aviso', msg: erroMsg || `falhou (${status || 'cancelada'})`, dados: { status },
                    });
                }
            } catch { /* registrar nunca derruba a requisição */ }
        };
        res.on('finish', () => concluir(false));
        res.on('close', () => concluir(!res.writableFinished));
        next();
    }
    middleware.descarregar = descarregar;
    middleware.parar = () => { clearInterval(timer); descarregar(); };
    return middleware;
}

module.exports = { criarMiddleware, nomeDaRota, contextoDoPedido, EVENTOS_ROTA, SILENCIOSAS };
