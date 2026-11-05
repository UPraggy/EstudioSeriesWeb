// Jobs pagos persistidos em jobs.json (CONTRATOS): o mesmo pedidoHash nunca abre 2 jobs,
// a reserva é gravada ANTES do POST e o id logo depois; retomada após reiniciar; download; custo real no livro.
const path = require('path');
const { ErroJob, limparSegredos } = require('./erros');
const { numeroEp } = require('./livro');
const util = require('./util');

const STATUS_ATIVOS = ['enviando', 'pendente', 'incerto'];
const FALHAS_API = { failed: 'falhou', cancelled: 'foi cancelado', expired: 'expirou' };
const MSG_INTERROMPIDO = 'O envio foi interrompido sem resposta do OpenRouter (pode ter sido cobrado).';
const MSG_INCERTO = 'Um envio anterior deste mesmo pedido foi interrompido sem resposta e pode ter sido cobrado. '
    + 'Confira em https://openrouter.ai/activity antes de tentar de novo (depois libere o pedido com liberarIncerto).';

// Envios em andamento NESTE processo (o que sobrar de outro processo é "incerto").
const enviandoAgora = new Set();

/**
 * criarJobs({ base, arquivo, cliente, livro, serie, dormir, relogio, esperaInicialMs, esperaMaxMs, fatorEspera, limiteMs })
 *  base = pasta da série (ou geracao-simples); destino dos jobs é relativo a ela.
 */
function criarJobs({
    base, arquivo, cliente, livro = null, serie = null, dormir = util.dormir, relogio = Date.now,
    esperaInicialMs = 5000, esperaMaxMs = 30000, fatorEspera = 1.5, limiteMs = 15 * 60 * 1000,
} = {}) {
    if (!base) throw new Error('criarJobs: informe a pasta base');
    const arq = arquivo || path.join(base, 'jobs.json');
    const consultando = new Map();
    const agoraIso = () => new Date(relogio()).toISOString();
    const copia = (j) => (j ? JSON.parse(JSON.stringify(j)) : null);
    const chaveEnvio = (h) => `${arq}|${h}`;

    async function ler() {
        const d = await util.lerJson(arq, null);
        if (!d) return { versao: 1, jobs: [] };
        if (!Array.isArray(d.jobs)) d.jobs = [];
        if (!d.versao) d.versao = 1;
        return d;
    }

    function mudar(fn) {
        return util.emSerie(arq, async () => {
            const doc = await ler();
            const r = await fn(doc);
            await util.escreverJsonAtomico(arq, doc);
            return r;
        });
    }

    function atualizar(filtro, campos) {
        return mudar((doc) => {
            const j = doc.jobs.find(filtro);
            if (!j) return null;
            Object.assign(j, campos, { atualizadoEm: agoraIso() });
            for (const k of Object.keys(j)) if (j[k] === undefined) delete j[k];
            return copia(j);
        });
    }
    const atualizarPorHash = (h, c) => atualizar((j) => j.pedidoHash === h, c);
    const atualizarPorId = (id, c) => atualizar((j) => j.jobId === id, c);

    function destinoRelativo(destino) {
        if (!destino) throw new ErroJob('Informe o destino do resultado.');
        const abs = path.resolve(base, destino);
        const rel = path.relative(base, abs);
        return rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? rel.split(path.sep).join('/') : abs;
    }
    const destinoAbsoluto = (d) => (path.isAbsolute(d) ? d : path.resolve(base, d));

    async function listar() {
        return (await ler()).jobs.map(copia);
    }
    async function acharPorId(id) {
        return copia((await ler()).jobs.find((j) => j.jobId === id));
    }
    async function acharPorHash(h) {
        return copia((await ler()).jobs.find((j) => j.pedidoHash === h));
    }

    // Custo previsto dos jobs que ainda podem cobrar (ainda fora do livro).
    async function comprometido({ ep } = {}) {
        const ativos = (await ler()).jobs.filter((j) => STATUS_ATIVOS.includes(j.status));
        const soma = (l) => util.arredondarUsd(l.reduce((s, j) => s + (Number(j.previstoUsd) || 0), 0));
        const alvo = numeroEp(ep);
        return { serieUsd: soma(ativos), episodioUsd: alvo === null ? 0 : soma(ativos.filter((j) => numeroEp(j.ep) === alvo)) };
    }

    /**
     * abrir(info, criar): info = { pedidoHash, tipo, modelo, destino, previstoUsd, ep, etapa, ref, simulado }
     * criar() faz o POST pago e devolve { id, status, usage?, pronto?, extra? }.
     * → { job, novo }  (novo=false: já existia um job deste pedido, nada foi pago de novo)
     */
    async function abrir(info, criar) {
        if (!info || !info.pedidoHash) throw new ErroJob('abrir: falta o pedidoHash.');
        const h = info.pedidoHash;
        const destino = destinoRelativo(info.destino);
        const decisao = await mudar((doc) => {
            const i = doc.jobs.findIndex((j) => j.pedidoHash === h);
            const ex = i >= 0 ? doc.jobs[i] : null;
            if (ex) {
                if (ex.status === 'pronto' || ex.status === 'pendente') return { existente: copia(ex) };
                if (ex.status === 'enviando' && enviandoAgora.has(chaveEnvio(h))) return { existente: copia(ex) };
                if (ex.status === 'enviando' || ex.status === 'incerto') {
                    ex.status = 'incerto';
                    ex.erro = ex.erro || MSG_INTERROMPIDO;
                    ex.atualizadoEm = agoraIso();
                    return { erro: new ErroJob(MSG_INCERTO, { jobId: ex.jobId, pedidoHash: h }) };
                }
                // 'falhou': falha não é cobrada, então pode tentar de novo (guarda o histórico).
            }
            const novo = {
                jobId: null,
                tipo: info.tipo || 'video',
                modelo: info.modelo,
                pedidoHash: h,
                destino,
                criadoEm: agoraIso(),
                status: 'enviando',
                serie: info.serie !== undefined ? info.serie : serie,
                ep: info.ep !== undefined ? info.ep : null,
                etapa: info.etapa || 'geracao',
                ref: info.ref || null,
                previstoUsd: util.arredondarUsd(Number(info.previstoUsd) || 0),
            };
            if (info.simulado) novo.simulado = true;
            if (ex) {
                novo.historico = [...(ex.historico || []), { jobId: ex.jobId, status: ex.status, erro: ex.erro, criadoEm: ex.criadoEm }];
                doc.jobs[i] = novo;
            } else {
                doc.jobs.push(novo);
            }
            enviandoAgora.add(chaveEnvio(h));
            return { novo: copia(novo) };
        });
        if (decisao.erro) throw decisao.erro;
        if (decisao.existente) return { job: decisao.existente, novo: false };

        let r;
        try {
            r = await criar();
        } catch (e) {
            const incerto = Boolean(e && e.incerto);
            await atualizarPorHash(h, { status: incerto ? 'incerto' : 'falhou', erro: limparSegredos(e && e.message) });
            enviandoAgora.delete(chaveEnvio(h));
            throw e;
        }
        if (!r || !r.id) {
            await atualizarPorHash(h, { status: 'incerto', erro: 'O OpenRouter aceitou o pedido mas não devolveu o id do job.' });
            enviandoAgora.delete(chaveEnvio(h));
            throw new ErroJob('O OpenRouter aceitou o pedido mas não devolveu o id do job: confira no painel antes de repetir.');
        }
        let job = await atualizarPorHash(h, { jobId: r.id, status: 'pendente', statusApi: r.status || 'pending', ...(r.extra || {}) });
        enviandoAgora.delete(chaveEnvio(h));
        if (r.pronto) job = await concluir(job, r.usage);
        else if (FALHAS_API[r.status]) job = await falhar(job, r.error, r.usage, r.status);
        return { job, novo: true };
    }

    async function registrarNoLivro(job, valor, estimado) {
        if (!livro || job.simulado || !(valor > 0)) return;
        await livro.registrar({
            em: agoraIso(),
            serie: job.serie !== undefined ? job.serie : serie,
            ep: job.ep !== undefined ? job.ep : null,
            etapa: job.etapa || 'geracao',
            tipo: job.tipo || 'video',
            modelo: job.modelo,
            previstoUsd: job.previstoUsd,
            realUsd: util.arredondarUsd(valor),
            jobId: job.jobId,
            ref: job.ref || job.destino,
            ...(estimado ? { realEstimado: true } : {}),
        });
    }

    async function concluir(job, usage) {
        const custo = usage && typeof usage.cost === 'number' && Number.isFinite(usage.cost) ? usage.cost : null;
        const atual = (await acharPorId(job.jobId)) || job;
        if (!atual.custoRegistrado) {
            await registrarNoLivro(atual, custo !== null ? custo : atual.previstoUsd, custo === null);
        }
        return atualizarPorId(job.jobId, {
            status: 'pronto', statusApi: 'completed', custoUsd: custo, custoConfirmado: custo !== null,
            custoRegistrado: true, concluidoEm: agoraIso(), erroDownload: undefined,
        });
    }

    async function falhar(job, erro, usage, statusApi) {
        const custo = usage && typeof usage.cost === 'number' && Number.isFinite(usage.cost) ? usage.cost : null;
        const atual = (await acharPorId(job.jobId)) || job;
        if (custo > 0 && !atual.custoRegistrado) await registrarNoLivro(atual, custo, false);
        const motivo = erro ? limparSegredos(typeof erro === 'string' ? erro : JSON.stringify(erro)) : `O job ${FALHAS_API[statusApi] || 'falhou'}.`;
        return atualizarPorId(job.jobId, {
            status: 'falhou', statusApi, erro: motivo, custoUsd: custo, custoRegistrado: custo > 0 ? true : atual.custoRegistrado, concluidoEm: agoraIso(),
        });
    }

    async function baixarResultado(job, r) {
        const u = Array.isArray(r.unsigned_urls) ? r.unsigned_urls[0] : null;
        // Só a URL da própria API (com a chave); as `urls` assinadas nunca são usadas nem gravadas.
        const alvo = u && /^https:\/\/openrouter\.ai\/api\//.test(u) ? u : `/videos/${encodeURIComponent(job.jobId)}/content?index=0`;
        await cliente.baixar(alvo, destinoAbsoluto(job.destino));
    }

    async function consultarAgora(jobId) {
        const job = await acharPorId(jobId);
        if (!job) throw new ErroJob(`Job ${jobId} não encontrado em ${path.basename(arq)}.`);
        if (job.status !== 'pendente' || (job.tipo && job.tipo !== 'video')) return job;
        const r = await cliente.pedirJson('GET', `/videos/${encodeURIComponent(jobId)}`);
        const st = (r && r.status) || 'pending';
        if (st === 'completed') {
            try {
                await baixarResultado(job, r);
            } catch (e) {
                return atualizarPorId(jobId, { statusApi: st, erroDownload: limparSegredos(e.message) });
            }
            return concluir(job, r.usage);
        }
        if (FALHAS_API[st]) return falhar(job, r.error, r.usage, st);
        return atualizarPorId(jobId, { statusApi: st, consultadoEm: agoraIso() });
    }

    // Consultas simultâneas do mesmo job viram uma só (não baixa nem registra custo 2x).
    function consultar(jobId) {
        if (consultando.has(jobId)) return consultando.get(jobId);
        const p = consultarAgora(jobId).finally(() => consultando.delete(jobId));
        consultando.set(jobId, p);
        return p;
    }

    // Consulta com espera crescente (5 s, 7,5 s, ... até 30 s) até terminar ou passar do limite.
    async function acompanhar(jobId, { limiteMs: lim = limiteMs, aoAtualizar } = {}) {
        const inicio = relogio();
        let espera = esperaInicialMs;
        for (;;) {
            const job = await consultar(jobId);
            if (aoAtualizar) aoAtualizar(job);
            if (job.status !== 'pendente') return job;
            if (relogio() - inicio + espera > lim) return job;
            await dormir(espera);
            espera = Math.min(Math.round(espera * fatorEspera), esperaMaxMs);
        }
    }

    // Depois de reiniciar: 'enviando' órfão vira 'incerto'; 'pendente' volta a ser consultado (e baixado).
    async function retomarPendentes({ aguardar = false, limiteMs: lim = limiteMs } = {}) {
        const doc = await ler();
        const resultado = { consultados: [], incertos: [], erros: [] };
        for (const j of doc.jobs) {
            if (j.status === 'enviando' && !enviandoAgora.has(chaveEnvio(j.pedidoHash))) {
                resultado.incertos.push(await atualizarPorHash(j.pedidoHash, { status: 'incerto', erro: MSG_INTERROMPIDO }));
            } else if (j.status === 'incerto') {
                resultado.incertos.push(copia(j));
            } else if (j.status === 'pendente' && j.jobId && (!j.tipo || j.tipo === 'video')) {
                try {
                    resultado.consultados.push(aguardar ? await acompanhar(j.jobId, { limiteMs: lim }) : await consultar(j.jobId));
                } catch (e) {
                    resultado.erros.push({ jobId: j.jobId, erro: limparSegredos(e.message) });
                }
            }
        }
        return resultado;
    }

    // Depois de conferir no painel que o envio interrompido NÃO foi cobrado: libera para tentar de novo.
    async function liberarIncerto(idOuHash) {
        const j = await atualizar((x) => (x.jobId === idOuHash || x.pedidoHash === idOuHash) && x.status === 'incerto',
            { status: 'falhou', erro: 'Envio incerto liberado à mão (conferido no painel do OpenRouter).' });
        if (!j) throw new ErroJob(`Nenhum job incerto com ${idOuHash}.`);
        return j;
    }

    return {
        arquivo: arq, base, listar, acharPorId, acharPorHash, comprometido, abrir, consultar, acompanhar,
        retomarPendentes, liberarIncerto, destinoAbsoluto,
    };
}

module.exports = { criarJobs, MSG_INCERTO };
