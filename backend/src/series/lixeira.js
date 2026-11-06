// Lixeira recuperável do Estúdio: "apagar" NUNCA destrói nada (pedido do Rafael, 04/11/2026).
//  - Série ou episódio apagado vai para <ESTUDIO_DADOS>/_lixeira/<AAAA-MM-DD_HHmmss>-<id>/, com um motivo.json
//    (o que era, quando, de onde veio) e a pasta original dentro (o nome dela não muda).
//  - "Refazer o roteiro do zero" guarda a versão atual em episodios/epNN/_versoes/<AAAA-MM-DD_HHmmss>/ e limpa o
//    episódio. Takes de vídeo/imagem pagos (takes/, quadros/, planos.json, mesa.json) NUNCA saem do lugar.
//  - Restaurar = mover a pasta de volta (à mão ou por restaurarDaLixeira). Voltar a uma versão do roteiro =
//    restaurarVersaoRoteiro (a versão ATUAL vai antes para uma pasta nova de _versoes: nada é sobrescrito).
//  - Memória da série: ao apagar o episódio ou refazer/restaurar o roteiro, os fatos e o resumo que VIERAM daquele
//    episódio saem da memória viva e ficam guardados junto (<item da lixeira>/memoria/ ou _versoes/<data>/memoria/);
//    restaurar devolve. Ver memoria/doEpisodio.js.
// Travas: nada é movido com geração paga em andamento, com montagem rodando ou (episódio) com votação registrada.
// Todas as funções aceitam { raiz } nas opções (testes usam pasta temporária); sem ela vale ESTUDIO_DADOS.
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const armazem = require('./armazem');
const episodios = require('./episodios');
const validar = require('./validar');
const { criarLivroCustos } = require('./custos');
const memoriaEp = require('../memoria/doEpisodio');

const { erro } = armazem;

const PASTA_LIXEIRA = '_lixeira';
const PASTA_VERSOES = '_versoes';
// Jobs que ainda vão gravar resultado na pasta ("incerto" não grava nada: só pede conferência no painel).
const STATUS_JOB_ATIVO = ['enviando', 'pendente'];
const RE_VIDEO = /\.(mp4|mov|webm|mkv|m4v)$/i;
const RE_IMAGEM = /\.(png|jpe?g|webp|gif)$/i;
const RE_ITEM = /^\d{4}-\d{2}-\d{2}_\d{6}-[a-z0-9-]+$/;
const RE_VERSAO = /^\d{4}-\d{2}-\d{2}_\d{6}(-\d{1,2})?$/;

// O que sai do episódio ao refazer o roteiro: o roteiro e o que foi feito a partir dele (refaz de graça).
const DERIVADOS = [
    { nome: 'falas.json', o: 'Falas do roteiro (falas.json)' },
    { nome: 'audio', o: 'Áudio das falas (audio/)' },
    { nome: 'edicao.json', o: 'Edição da Mesa (edicao.json)' },
    { nome: '.edicao', o: 'Histórico de desfazer da Mesa (.edicao/)' },
    { nome: 'legendas.srt', o: 'Legenda (legendas.srt)' },
    { nome: 'legendas.ass', o: 'Legenda (legendas.ass)' },
    { nome: 'legendas-palavra.ass', o: 'Legenda palavra a palavra (legendas-palavra.ass)' },
    { nome: 'saida', o: 'Episódio montado (saida/)' },
];
// O que NUNCA sai do episódio ao refazer o roteiro (pago ou resultado real).
const PRESERVADOS = [
    { nome: 'takes', o: 'Takes de vídeo (takes/)' },
    { nome: 'quadros', o: 'Quadros e imagens (quadros/)' },
    { nome: 'planos.json', o: 'Decupagem e registro dos takes (planos.json)' },
    { nome: 'mesa.json', o: 'Takes regerados na Mesa (mesa.json)' },
    { nome: 'votacao.json', o: 'Votação registrada (votacao.json)' },
];

// ---------------------------------------------------------------- utilidades
const doisDig = (n) => String(n).padStart(2, '0');

// "2026-11-04_223015" na hora local (é o que o Rafael vê no Explorer).
function carimbo(data = new Date()) {
    return `${data.getFullYear()}-${doisDig(data.getMonth() + 1)}-${doisDig(data.getDate())}_`
        + `${doisDig(data.getHours())}${doisDig(data.getMinutes())}${doisDig(data.getSeconds())}`;
}

function pastaLixeira(opcoes = {}) {
    return path.join(armazem.raizDados(opcoes), PASTA_LIXEIRA);
}

const relDados = (opcoes, alvo) => armazem.relativoPosix(armazem.raizDados(opcoes), alvo);

// Aceita 1, "1", "01" ou "ep01".
function numeroDoEp(ep) {
    if (typeof ep === 'string') {
        const m = /^\s*(?:ep)?0*(\d{1,3})\s*$/i.exec(ep);
        if (m) return episodios.numeroEpisodio(Number(m[1]));
    }
    return episodios.numeroEpisodio(ep);
}

function lerBool(valor, padrao) {
    if (valor === undefined || valor === null || valor === '') return padrao;
    if (typeof valor === 'boolean') return valor;
    if (valor === 'true' || valor === '1' || valor === 1) return true;
    if (valor === 'false' || valor === '0' || valor === 0) return false;
    throw erro(`Valor inválido ("${String(valor).slice(0, 20)}"): use true ou false.`);
}

function lerDuracao(valor) {
    if (valor === undefined || valor === null || valor === '') return undefined;
    const d = typeof valor === 'string' ? Number(valor.replace(',', '.')) : valor;
    if (!Number.isFinite(d) || d < validar.DURACAO_MIN_S || d > validar.DURACAO_MAX_S) {
        throw erro(`Duração inválida: use de ${validar.DURACAO_MIN_S} a ${validar.DURACAO_MAX_S} segundos.`);
    }
    return Math.round(d * 10) / 10;
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// Move (rename) com retentativa: no Windows o antivírus ou um vídeo tocando seguram o arquivo por um instante.
// Nunca cai para "copiar e apagar": ou a pasta muda de lugar inteira, ou nada acontece.
async function mover(de, para) {
    for (let tentativa = 0; ; tentativa++) {
        try {
            await fsp.rename(de, para);
            return;
        } catch (e) {
            if (!['EPERM', 'EBUSY', 'EACCES', 'ENOTEMPTY'].includes(e.code)) throw e;
            if (tentativa >= 8) {
                throw erro(`Não consegui mover "${path.basename(de)}": algum arquivo dele está aberto (um vídeo tocando na Mesa ou no navegador?). Feche e tente de novo.`, 409);
            }
            await esperar(60 * (tentativa + 1));
        }
    }
}

// Cria <base>/<nome> sem sobrescrever nada (mesmo segundo: <nome>-2, -3...). Devolve o caminho criado.
async function criarPastaNova(base, nome) {
    await fsp.mkdir(base, { recursive: true });
    for (let i = 1; i <= 50; i++) {
        const alvo = path.join(base, i === 1 ? nome : `${nome}-${i}`);
        try {
            await fsp.mkdir(alvo);
            return alvo;
        } catch (e) {
            if (e.code !== 'EEXIST') throw e;
        }
    }
    throw erro('Não consegui criar a pasta na lixeira (nomes repetidos demais).', 500);
}

// Arquivos e bytes de uma pasta (recursivo). Pasta ausente = zero.
async function medir(alvo) {
    const r = { arquivos: 0, bytes: 0 };
    let st;
    try { st = await fsp.stat(alvo); } catch { return r; }
    if (!st.isDirectory()) return { arquivos: 1, bytes: st.size };
    const pilha = [alvo];
    while (pilha.length) {
        const atual = pilha.pop();
        let nomes = [];
        try { nomes = await fsp.readdir(atual, { withFileTypes: true }); } catch { continue; }
        for (const d of nomes) {
            const c = path.join(atual, d.name);
            if (d.isDirectory()) pilha.push(c);
            else if (d.isFile()) {
                r.arquivos += 1;
                try { r.bytes += (await fsp.stat(c)).size; } catch { /* sumiu no meio */ }
            }
        }
    }
    return r;
}

// Arquivos de mídia (recursivo) de uma pasta que batem com a expressão.
async function listarMidia(alvo, re) {
    const achados = [];
    const pilha = [alvo];
    while (pilha.length) {
        const atual = pilha.pop();
        let nomes = [];
        try { nomes = await fsp.readdir(atual, { withFileTypes: true }); } catch { continue; }
        for (const d of nomes) {
            const c = path.join(atual, d.name);
            if (d.isDirectory()) pilha.push(c);
            else if (d.isFile() && re.test(d.name)) achados.push(c);
        }
    }
    return achados;
}

// Takes de um episódio: um take = um arquivo de vídeo (o ".bruto" do mesmo take não conta de novo).
async function contarTakes(pastaEp) {
    const videos = await listarMidia(path.join(pastaEp, 'takes'), RE_VIDEO);
    return new Set(videos.map((v) => v.replace(/\.bruto(\.[^.]+)$/i, '$1').toLowerCase())).size;
}

async function contarImagens(pastaEp) {
    return (await listarMidia(path.join(pastaEp, 'quadros'), RE_IMAGEM)).length;
}

async function lerJobs(pastaSerie) {
    const d = await armazem.lerJson(path.join(pastaSerie, 'jobs.json'), null);
    return d && Array.isArray(d.jobs) ? d.jobs : [];
}

const prefixoEp = (n) => `episodios/${episodios.idEpisodio(n)}/`;

function jobDoEp(job, n) {
    if (n === null || n === undefined) return true;
    const destino = String(job.destino || '').replace(/\\/g, '/');
    if (destino.startsWith(prefixoEp(n))) return true;
    const m = job.ep === undefined || job.ep === null ? null : /\d+/.exec(String(job.ep));
    return Boolean(m) && Number(m[0]) === n;
}

// Takes pagos de verdade (job pronto, não simulado) com destino dentro do episódio (ou da série, sem n).
function takesPagos(jobs, n = null) {
    return jobs.filter((j) => j.status === 'pronto' && !j.simulado && jobDoEp(j, n)).length;
}

const temVotos = (escolha) => Boolean(escolha && (
    (escolha.votos && (Number(escolha.votos.A) > 0 || Number(escolha.votos.B) > 0)) || escolha.vencedora
));

// Episódios que existem (entrada no serie.json ou pasta epNN).
async function numerosDosEpisodios(pastaSerie, serie) {
    const ns = new Set((serie.episodios || []).map((e) => e.n).filter(Number.isInteger));
    let nomes = [];
    try { nomes = await fsp.readdir(path.join(pastaSerie, 'episodios')); } catch { nomes = []; }
    for (const nome of nomes) {
        const m = /^ep(\d{1,3})$/i.exec(nome);
        if (m) ns.add(Number(m[1]));
    }
    return [...ns].sort((a, b) => a - b);
}

// Montagem rodando AGORA neste servidor (render.json "montando" sozinho pode ser de antes de reiniciar).
async function renderRodando(serie, n, pastaEp) {
    const st = await armazem.lerJson(path.join(pastaEp, 'saida', 'render.json'), null).catch(() => null);
    if (!st || st.status !== 'montando') return false;
    try {
        const vivo = await require('../edicao/render').statusRender(serie, n);
        return vivo.status === 'montando';
    } catch {
        return true; // na dúvida, trava
    }
}

/**
 * O que impede mover agora: geração paga em andamento, regeração de trecho rodando ou montagem rodando.
 * n = null olha a série inteira. Devolve uma lista de mensagens (vazia = pode).
 */
async function bloqueios(serieId, pastaSerie, n = null) {
    const msgs = [];
    const ativos = (await lerJobs(pastaSerie)).filter((j) => STATUS_JOB_ATIVO.includes(j.status) && jobDoEp(j, n));
    if (ativos.length) {
        const refs = ativos.slice(0, 3).map((j) => j.ref || j.destino || j.jobId).filter(Boolean).join(', ');
        msgs.push(`${ativos.length === 1 ? 'Há 1 geração paga em andamento' : `Há ${ativos.length} gerações pagas em andamento`}`
            + `${refs ? ` (${refs})` : ''}. Espere terminar: o resultado ainda vai ser gravado nesta pasta.`);
    }
    const serie = await armazem.lerJson(path.join(pastaSerie, 'serie.json'), { episodios: [] });
    const ns = n === null ? await numerosDosEpisodios(pastaSerie, serie) : [n];
    for (const num of ns) {
        const pastaEp = path.join(pastaSerie, 'episodios', episodios.idEpisodio(num));
        if (await renderRodando(serieId, num, pastaEp)) {
            msgs.push(`O Ep. ${num} está sendo montado agora. Espere a montagem terminar.`);
        }
        const mesa = await armazem.lerJson(path.join(pastaEp, 'mesa.json'), null).catch(() => null);
        const gerando = mesa && Array.isArray(mesa.regeracoes) ? mesa.regeracoes.filter((r) => r.status === 'gerando').length : 0;
        if (gerando && !ativos.length) {
            msgs.push(`O Ep. ${num} tem ${gerando === 1 ? '1 trecho sendo regerado' : `${gerando} trechos sendo regerados`} na Mesa. Espere terminar.`);
        }
    }
    return msgs;
}

const motivoBase = (tipo, extra) => ({ versao: 1, tipo, apagadoEm: new Date().toISOString(), ...extra });

// ---------------------------------------------------------------- memória da série (o que veio do episódio)
// Nunca derruba a operação principal (o que já mudou de pasta continua guardado): falha vira aviso.
function contarMemoria(pastaSerie, n, avisos) {
    try {
        const m = memoriaEp.contarMemoriaDoEpisodio(pastaSerie, n);
        avisos.push(...m.avisos);
        return { fatos: m.fatos, encerramentos: m.encerramentos, resumo: m.resumo, vazia: m.vazia };
    } catch (e) {
        avisos.push(`Não consegui ler a memória da série (${e.message}).`);
        return null;
    }
}

function retirarMemoria(pastaSerie, n, pastaGuarda, avisos) {
    try {
        const m = memoriaEp.retirarMemoriaDoEpisodio(pastaSerie, n, pastaGuarda);
        avisos.push(...m.avisos);
        return { guardada: m.guardada, fatos: m.fatos, encerramentos: m.encerramentos, resumo: m.resumo, proposta: m.proposta };
    } catch (e) {
        avisos.push(`A memória da série ficou como estava: não consegui tirar o que veio do Ep. ${n} (${e.message}).`);
        return null;
    }
}

function devolverMemoria(pastaSerie, n, pastaGuarda, avisos) {
    try {
        const m = memoriaEp.devolverMemoriaDoEpisodio(pastaSerie, n, pastaGuarda);
        avisos.push(...m.avisos);
        return { devolvida: m.devolvida, fatos: m.fatos, encerramentos: m.encerramentos, resumo: m.resumo, proposta: m.proposta, historico: m.historico || null };
    } catch (e) {
        avisos.push(`A memória guardada do Ep. ${n} não voltou sozinha (${e.message}): ela continua em ${path.join(pastaGuarda, memoriaEp.PASTA_GUARDA)}.`);
        return null;
    }
}

// ---------------------------------------------------------------- série
/** O que acontece se apagar a série (só leitura): tamanho, episódios, takes, gasto e travas. */
async function preverApagarSerie(serieId, opcoes = {}) {
    const pasta = await armazem.exigirSerie(serieId, opcoes);
    const serie = await armazem.lerSerie(serieId, opcoes);
    const ns = await numerosDosEpisodios(pasta, serie);
    let takes = 0;
    let imagens = 0;
    for (const n of ns) {
        const pastaEp = path.join(pasta, 'episodios', episodios.idEpisodio(n));
        takes += await contarTakes(pastaEp);
        imagens += await contarImagens(pastaEp);
    }
    const jobs = await lerJobs(pasta);
    const tamanho = await medir(pasta);
    const incertos = jobs.filter((j) => j.status === 'incerto').length;
    return {
        acao: 'serie',
        serie: { id: serieId, titulo: serie.titulo },
        episodios: ns.length,
        takes,
        imagens,
        takesPagos: takesPagos(jobs),
        gastoUsd: await criarLivroCustos(pasta).total(),
        arquivos: tamanho.arquivos,
        tamanhoMb: Math.round((tamanho.bytes / 1048576) * 10) / 10,
        origem: relDados(opcoes, pasta),
        destino: `${PASTA_LIXEIRA}/<data>-${serieId}/${serieId}`,
        bloqueios: await bloqueios(serieId, pasta, null),
        avisos: incertos
            ? [`${incertos === 1 ? 'Há 1 envio pago incerto' : `Há ${incertos} envios pagos incertos`} (pode ter sido cobrado): confira em openrouter.ai/activity. O registro vai junto, no jobs.json.`]
            : [],
    };
}

/**
 * Apaga a série: só com confirmacao === título exato. Move a pasta inteira para a lixeira.
 * → { ok, lixeira: "_lixeira/<item>", item, motivo }
 */
async function apagarSerie(serieId, confirmacao, opcoes = {}) {
    const pasta = await armazem.exigirSerie(serieId, opcoes);
    const serieJson = path.join(pasta, 'serie.json');
    const bibliaJson = path.join(pasta, 'biblia.json');
    return armazem.comTrava(`serie:${pasta}`, () => armazem.comTrava(serieJson, () => armazem.comTrava(bibliaJson, async () => {
        if (!fs.existsSync(serieJson)) throw erro(`Série não encontrada: ${serieId}.`, 404);
        const serie = await armazem.lerJson(serieJson);
        const titulo = String(serie.titulo || serieId);
        if (typeof confirmacao !== 'string' || confirmacao !== titulo) {
            throw erro(`Para apagar, digite o nome da série exatamente como está: "${titulo}".`, 400);
        }
        const travas = await bloqueios(serieId, pasta, null);
        if (travas.length) throw erro(`Não apaguei a série. ${travas.join(' ')}`, 409, { erros: travas });

        const ns = await numerosDosEpisodios(pasta, serie);
        const tamanho = await medir(pasta);
        const lixeira = pastaLixeira(opcoes);
        const item = await criarPastaNova(lixeira, `${carimbo()}-${serieId}`);
        const destino = path.join(item, serieId);
        const motivo = motivoBase('serie', {
            serie: serieId,
            titulo,
            episodios: ns,
            arquivos: tamanho.arquivos,
            bytes: tamanho.bytes,
            gastoUsd: await criarLivroCustos(pasta).total(),
            origem: relDados(opcoes, pasta),
            pasta: relDados(opcoes, destino),
            comoRestaurar: `Mova a pasta "${relDados(opcoes, destino)}" de volta para "${relDados(opcoes, pasta)}" (ou use "Restaurar" na lixeira do Estúdio).`,
        });
        try {
            await armazem.escreverJsonAtomico(path.join(item, 'motivo.json'), motivo);
            await mover(pasta, destino);
        } catch (e) {
            if (!fs.existsSync(destino)) await fsp.rm(item, { recursive: true, force: true }); // só o motivo.json que acabamos de criar
            throw e;
        }
        return { ok: true, lixeira: relDados(opcoes, item), item: path.basename(item), motivo };
    })));
}

// ---------------------------------------------------------------- episódio
async function dadosDoEpisodio(serieId, ep, opcoes) {
    const pastaSerie = await armazem.exigirSerie(serieId, opcoes);
    const n = numeroDoEp(ep);
    const serie = await armazem.lerSerie(serieId, opcoes);
    const pastaEp = episodios.pastaEpisodio(serieId, n, opcoes);
    const entrada = (serie.episodios || []).find((e) => e.n === n) || null;
    if (!entrada && !fs.existsSync(pastaEp)) throw erro(`Episódio ${n} não encontrado na série ${serieId}.`, 404);
    const biblia = await armazem.lerBiblia(serieId, opcoes);
    const escolha = (Array.isArray(biblia.escolhas) ? biblia.escolhas : []).find((x) => x.ep === n) || null;
    const votacao = await armazem.lerJson(path.join(pastaEp, 'votacao.json'), null).catch(() => null);
    return { pastaSerie, n, serie, pastaEp, entrada, escolha, votacao };
}

function textoVotos(escolha, votacao) {
    const v = (votacao && votacao.votos) || (escolha && escolha.votos) || {};
    return `${Number(v.A) || 0} x ${Number(v.B) || 0}`;
}

/** O que acontece se apagar o episódio (só leitura). */
async function preverApagarEpisodio(serieId, ep, opcoes = {}) {
    const d = await dadosDoEpisodio(serieId, ep, opcoes);
    const jobs = await lerJobs(d.pastaSerie);
    const tamanho = await medir(d.pastaEp);
    const travas = await bloqueios(serieId, d.pastaSerie, d.n);
    const votado = temVotos(d.escolha) || Boolean(d.votacao);
    if (votado) {
        travas.unshift(`O Ep. ${d.n} já tem votação registrada (${textoVotos(d.escolha, d.votacao)}). É resultado real do público e decide o próximo episódio: não dá para apagar.`);
    }
    const avisos = [];
    const memoria = contarMemoria(d.pastaSerie, d.n, avisos);
    return {
        acao: 'episodio',
        serie: { id: serieId, titulo: d.serie.titulo },
        episodio: { n: d.n, titulo: (d.entrada && d.entrada.titulo) || '', temPasta: fs.existsSync(d.pastaEp) },
        takes: await contarTakes(d.pastaEp),
        imagens: await contarImagens(d.pastaEp),
        takesPagos: takesPagos(jobs, d.n),
        gastoUsd: await criarLivroCustos(d.pastaSerie).total({ ep: d.n }),
        arquivos: tamanho.arquivos,
        tamanhoMb: Math.round((tamanho.bytes / 1048576) * 10) / 10,
        votado,
        origem: relDados(opcoes, d.pastaEp),
        destino: `${PASTA_LIXEIRA}/<data>-${serieId}-${episodios.idEpisodio(d.n)}/${episodios.idEpisodio(d.n)}`,
        memoria,
        bloqueios: travas,
        avisos,
    };
}

/**
 * Apaga o episódio: move episodios/epNN para a lixeira, tira a entrada do serie.json e a escolha (sem votos) da
 * biblia.escolhas. Recusa com votos registrados, geração paga em andamento ou montagem rodando.
 * → { ok, lixeira, item, episodio, avisos }
 */
async function apagarEpisodio(serieId, ep, opcoes = {}) {
    const pastaSerie = await armazem.exigirSerie(serieId, opcoes);
    const n = numeroDoEp(ep);
    const pastaEp = episodios.pastaEpisodio(serieId, n, opcoes);
    const chaves = [`eps:${serieId}`, path.join(pastaEp, 'roteiro.json'), path.join(pastaEp, 'edicao.json'), path.join(pastaEp, 'mesa.json')];
    const comTravas = (fn) => chaves.reduceRight((dentro, chave) => () => armazem.comTrava(chave, dentro), fn)();
    return comTravas(async () => {
        const d = await dadosDoEpisodio(serieId, n, opcoes);
        if (temVotos(d.escolha) || d.votacao) {
            throw erro(`O Ep. ${n} já tem votação registrada (${textoVotos(d.escolha, d.votacao)}). É resultado real do público e decide o próximo episódio: não apaguei.`, 409);
        }
        const travas = await bloqueios(serieId, pastaSerie, n);
        if (travas.length) throw erro(`Não apaguei o Ep. ${n}. ${travas.join(' ')}`, 409, { erros: travas });

        const idEp = episodios.idEpisodio(n);
        const temPasta = fs.existsSync(pastaEp);
        const tamanho = await medir(pastaEp);
        const item = await criarPastaNova(pastaLixeira(opcoes), `${carimbo()}-${serieId}-${idEp}`);
        const destino = path.join(item, idEp);
        const motivo = motivoBase('episodio', {
            serie: serieId,
            tituloSerie: d.serie.titulo,
            ep: n,
            titulo: (d.entrada && d.entrada.titulo) || '',
            entrada: d.entrada,
            escolha: d.escolha,
            temPasta,
            arquivos: tamanho.arquivos,
            bytes: tamanho.bytes,
            takes: await contarTakes(pastaEp),
            gastoUsd: await criarLivroCustos(pastaSerie).total({ ep: n }),
            origem: relDados(opcoes, pastaEp),
            pasta: temPasta ? relDados(opcoes, destino) : null,
            comoRestaurar: temPasta
                ? `Mova a pasta "${relDados(opcoes, destino)}" de volta para "${relDados(opcoes, pastaEp)}" e devolva a entrada (campo "entrada") ao "episodios" do serie.json (ou use "Restaurar" na lixeira do Estúdio).`
                : 'O episódio não tinha pasta: devolva a entrada (campo "entrada") ao "episodios" do serie.json (ou use "Restaurar" na lixeira do Estúdio).',
        });
        try {
            await armazem.escreverJsonAtomico(path.join(item, 'motivo.json'), motivo);
            if (temPasta) await mover(pastaEp, destino);
        } catch (e) {
            if (!fs.existsSync(destino)) await fsp.rm(item, { recursive: true, force: true });
            throw e;
        }
        try {
            await armazem.atualizarSerie(serieId, (s) => {
                s.episodios = (Array.isArray(s.episodios) ? s.episodios : []).filter((e) => e.n !== n);
                return s;
            }, opcoes);
        } catch (e) {
            // Desfaz: a pasta volta e a lixeira fica como estava (o item só some se não sobrou nada além do motivo.json).
            if (temPasta && fs.existsSync(destino) && !fs.existsSync(pastaEp)) await mover(destino, pastaEp).catch(() => {});
            if (!fs.existsSync(destino)) await fsp.rm(item, { recursive: true, force: true });
            throw e;
        }
        const avisos = [];
        if (d.escolha) {
            try {
                await armazem.atualizarBiblia(serieId, (b) => {
                    b.escolhas = (Array.isArray(b.escolhas) ? b.escolhas : []).filter((x) => x.ep !== n || temVotos(x));
                    return b;
                }, opcoes);
            } catch (e) {
                avisos.push(`A escolha A/B do Ep. ${n} ficou na bíblia (${e.message}).`);
            }
        }
        // Fatos e resumo que vieram deste episódio saem da memória viva e vão junto (<item>/memoria/).
        const memoria = retirarMemoria(pastaSerie, n, item, avisos);
        if (memoria && memoria.guardada) {
            motivo.memoria = { fatos: memoria.fatos, encerramentos: memoria.encerramentos, resumo: memoria.resumo, pasta: relDados(opcoes, path.join(item, memoriaEp.PASTA_GUARDA)) };
            await armazem.escreverJsonAtomico(path.join(item, 'motivo.json'), motivo).catch(() => {});
        }
        return { ok: true, lixeira: relDados(opcoes, item), item: path.basename(item), episodio: { n, titulo: motivo.titulo }, memoria, avisos };
    });
}

// ---------------------------------------------------------------- refazer o roteiro do zero
function itensParaVersao(pastaEp, apagarDerivados) {
    const lista = [{ nome: 'roteiro.json', o: 'Roteiro (roteiro.json)' }, ...(apagarDerivados ? DERIVADOS : [])];
    return lista.filter((i) => fs.existsSync(path.join(pastaEp, i.nome)));
}

/** O que vai para _versoes e o que fica (só leitura). */
async function preverRefazerRoteiro(serieId, ep, { apagarDerivados = true } = {}, opcoes = {}) {
    const d = await dadosDoEpisodio(serieId, ep, opcoes);
    const derivados = lerBool(apagarDerivados, true);
    const jobs = await lerJobs(d.pastaSerie);
    const avisos = [];
    if (temVotos(d.escolha) || d.votacao) {
        avisos.push(`O Ep. ${d.n} já tem votação registrada (${textoVotos(d.escolha, d.votacao)}): ela continua valendo e fica no episódio.`);
    }
    const memoria = contarMemoria(d.pastaSerie, d.n, avisos);
    return {
        acao: 'roteiro',
        serie: { id: serieId, titulo: d.serie.titulo },
        episodio: {
            n: d.n,
            titulo: (d.entrada && d.entrada.titulo) || '',
            duracaoAlvoS: (d.entrada && d.entrada.duracaoAlvoS) || d.serie.duracaoAlvoS || 60,
            semEscolha: Boolean(d.entrada && d.entrada.semEscolha),
            status: (d.entrada && d.entrada.status) || 'roteiro',
        },
        vaiParaVersoes: itensParaVersao(d.pastaEp, derivados),
        preservados: PRESERVADOS.filter((i) => fs.existsSync(path.join(d.pastaEp, i.nome))),
        takes: await contarTakes(d.pastaEp),
        imagens: await contarImagens(d.pastaEp),
        takesPagos: takesPagos(jobs, d.n),
        destino: `${prefixoEp(d.n)}${PASTA_VERSOES}/<data>`,
        memoria,
        bloqueios: await bloqueios(serieId, d.pastaSerie, d.n),
        avisos,
    };
}

/**
 * Refaz o roteiro do zero: guarda roteiro.json (e, com apagarDerivados, falas, áudio, edição, legendas e montagem)
 * em episodios/epNN/_versoes/<data>/ e deixa o episódio pronto para um roteiro novo (status "roteiro").
 * Pode trocar a duração e o "sem votação". Takes/quadros/planos.json/mesa.json/votacao.json ficam onde estão.
 * → { ok, versao, movidos, preservados, episodio, avisos }
 */
// tipo: 'refazerRoteiro' (padrão) | 'antesDeAjuste' (o roteiro salvo foi ajustado e a versão nova vai ser salva).
async function refazerRoteiro(serieId, ep, { duracaoAlvoS, semEscolha, apagarDerivados = true, tipo = 'refazerRoteiro' } = {}, opcoes = {}) {
    await armazem.exigirSerie(serieId, opcoes);
    const n = numeroDoEp(ep);
    const duracao = lerDuracao(duracaoAlvoS);
    const semVotacao = semEscolha === undefined || semEscolha === null || semEscolha === '' ? undefined : lerBool(semEscolha);
    const derivados = lerBool(apagarDerivados, true);
    const pastaEp = episodios.pastaEpisodio(serieId, n, opcoes);
    const chaves = [path.join(pastaEp, 'roteiro.json'), path.join(pastaEp, 'edicao.json'), path.join(pastaEp, 'falas.json')];
    const comTravas = (fn) => chaves.reduceRight((dentro, chave) => () => armazem.comTrava(chave, dentro), fn)();
    return comTravas(async () => {
        const d = await dadosDoEpisodio(serieId, n, opcoes);
        const travas = await bloqueios(serieId, d.pastaSerie, n);
        if (travas.length) throw erro(`Não refiz o roteiro do Ep. ${n}. ${travas.join(' ')}`, 409, { erros: travas });

        const itens = itensParaVersao(pastaEp, derivados);
        const preservados = PRESERVADOS.filter((i) => fs.existsSync(path.join(pastaEp, i.nome)));
        const roteiroAntes = await armazem.lerJson(path.join(pastaEp, 'roteiro.json'), null).catch(() => null);
        const memoriaAntes = contarMemoria(d.pastaSerie, n, []);
        let versao = null;
        const movidos = [];
        if (itens.length || (memoriaAntes && !memoriaAntes.vazia)) {
            versao = await criarPastaNova(path.join(pastaEp, PASTA_VERSOES), carimbo());
            try {
                for (const i of itens) {
                    await mover(path.join(pastaEp, i.nome), path.join(versao, i.nome));
                    movidos.push(i);
                }
            } catch (e) {
                // Desfaz o que já foi: tudo volta para o lugar e a versão (vazia) some.
                for (const i of movidos.reverse()) {
                    if (!fs.existsSync(path.join(pastaEp, i.nome))) await mover(path.join(versao, i.nome), path.join(pastaEp, i.nome)).catch(() => {});
                }
                await fsp.rmdir(versao).catch(() => {});
                throw e;
            }
        }

        const avisos = [];
        const votado = temVotos(d.escolha) || Boolean(d.votacao);
        if (votado) avisos.push(`A votação registrada do Ep. ${n} (${textoVotos(d.escolha, d.votacao)}) continua valendo.`);
        const semFinal = semVotacao !== undefined ? semVotacao
            : (duracao !== undefined && duracao < 20 ? true : Boolean(d.entrada && d.entrada.semEscolha));
        let entrada;
        await armazem.atualizarSerie(serieId, (s) => {
            s.episodios = Array.isArray(s.episodios) ? s.episodios : [];
            entrada = s.episodios.find((e) => e.n === n);
            if (!entrada) {
                entrada = { n, id: episodios.idEpisodio(n), titulo: '', status: 'roteiro' };
                s.episodios.push(entrada);
                s.episodios.sort((a, b) => a.n - b.n);
            }
            entrada.status = 'roteiro';
            if (duracao !== undefined) entrada.duracaoAlvoS = duracao;
            entrada.semEscolha = semFinal;
            return s;
        }, opcoes);
        // A escolha A/B do roteiro velho sai da bíblia (o roteiro novo cria a dele ao salvar); com votos, fica.
        if (d.escolha && !votado) {
            await armazem.atualizarBiblia(serieId, (b) => {
                b.escolhas = (Array.isArray(b.escolhas) ? b.escolhas : []).filter((x) => x.ep !== n || temVotos(x));
                return b;
            }, opcoes);
        }
        // Fatos e resumo que vieram do roteiro antigo saem da memória viva e ficam na versão (<versao>/memoria/).
        const memoria = versao ? retirarMemoria(d.pastaSerie, n, versao, avisos) : null;
        if (versao) {
            await armazem.escreverJsonAtomico(path.join(versao, 'motivo.json'), {
                versao: 1,
                tipo: tipo === 'antesDeAjuste' ? 'antesDeAjuste' : 'refazerRoteiro',
                memoria: memoria && memoria.guardada ? { fatos: memoria.fatos, encerramentos: memoria.encerramentos, resumo: memoria.resumo } : null,
                serie: serieId,
                ep: n,
                guardadoEm: new Date().toISOString(),
                roteiro: roteiroAntes ? { titulo: roteiroAntes.titulo || '', duracaoAlvoS: roteiroAntes.duracaoAlvoS, aprovado: roteiroAntes.aprovado ?? null } : null,
                entradaAntes: d.entrada,
                escolhaAntes: votado ? null : d.escolha,
                movidos: movidos.map((i) => i.nome),
                preservados: preservados.map((i) => i.nome),
                comoRestaurar: `Use "Versões do roteiro" na página do episódio (a versão atual fica guardada). À mão: mova os itens desta pasta de volta para "${relDados(opcoes, pastaEp)}" (antes, guarde o roteiro novo) e devolva memoria/ à memória da série.`,
            });
        }
        return {
            ok: true,
            versao: versao ? relDados(opcoes, versao) : null,
            movidos: movidos.map((i) => i.nome),
            preservados: preservados.map((i) => i.nome),
            episodio: { ...entrada },
            memoria,
            avisos,
        };
    });
}

// ---------------------------------------------------------------- versões do roteiro (_versoes)
const ITENS_VERSAO = [{ nome: 'roteiro.json', o: 'Roteiro (roteiro.json)' }, ...DERIVADOS];

// "2026-11-04_223015[-2]" → ISO (hora local), para versões sem motivo.json.
function dataDoNome(nome) {
    const m = /^(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})(\d{2})/.exec(nome);
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]));
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// Duração que os planos somam (o fim do último plano), ou null.
function duracaoDosPlanos(roteiro) {
    const planos = roteiro && Array.isArray(roteiro.planos) ? roteiro.planos : [];
    const fins = planos.map((p) => Number(p && p.ateS)).filter(Number.isFinite);
    return fins.length ? Math.round(Math.max(...fins) * 10) / 10 : null;
}

const resumoRoteiro = (r) => (r ? {
    titulo: r.titulo || '',
    duracaoAlvoS: r.duracaoAlvoS ?? null,
    aprovado: r.aprovado ?? null,
} : null);

/**
 * Versões guardadas do roteiro do episódio (só leitura), da mais nova para a mais velha, com o que cada uma tem.
 * → { serie, episodio: { n, titulo, roteiroAtual }, versoes: [ { versao, guardadoEm, tipo, deVersao, titulo,
 *     duracaoAlvoS, duracaoPlanosS, planos, aprovado, temRoteiro, arquivos: [{nome,o}], memoria, tamanhoMb, pasta } ],
 *     bloqueios, avisos }
 */
async function listarVersoesRoteiro(serieId, ep, opcoes = {}) {
    const d = await dadosDoEpisodio(serieId, ep, opcoes);
    const base = path.join(d.pastaEp, PASTA_VERSOES);
    let nomes = [];
    try { nomes = await fsp.readdir(base, { withFileTypes: true }); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    const versoes = [];
    for (const dir of nomes) {
        if (!dir.isDirectory() || !RE_VERSAO.test(dir.name)) continue;
        const pasta = path.join(base, dir.name);
        const motivo = await armazem.lerJson(path.join(pasta, 'motivo.json'), null).catch(() => null);
        const roteiro = await armazem.lerJson(path.join(pasta, 'roteiro.json'), null).catch(() => null);
        const tamanho = await medir(pasta);
        versoes.push({
            versao: dir.name,
            guardadoEm: (motivo && motivo.guardadoEm) || dataDoNome(dir.name),
            tipo: (motivo && motivo.tipo) || 'desconhecido',
            deVersao: (motivo && motivo.restaurouVersao) || null,
            titulo: (roteiro && roteiro.titulo) || (motivo && motivo.roteiro && motivo.roteiro.titulo) || '',
            duracaoAlvoS: (roteiro && roteiro.duracaoAlvoS) ?? (motivo && motivo.roteiro && motivo.roteiro.duracaoAlvoS) ?? null,
            duracaoPlanosS: duracaoDosPlanos(roteiro),
            planos: roteiro && Array.isArray(roteiro.planos) ? roteiro.planos.length : 0,
            semEscolha: roteiro ? roteiro.escolhas === null : null,
            aprovado: roteiro ? roteiro.aprovado ?? null : null,
            temRoteiro: fs.existsSync(path.join(pasta, 'roteiro.json')),
            arquivos: ITENS_VERSAO.filter((i) => fs.existsSync(path.join(pasta, i.nome))),
            memoria: memoriaEp.lerMemoriaGuardada(pasta),
            tamanhoMb: Math.round((tamanho.bytes / 1048576) * 10) / 10,
            pasta: relDados(opcoes, pasta),
        });
    }
    versoes.sort((a, b) => String(b.versao).localeCompare(String(a.versao)));
    const atual = await armazem.lerJson(path.join(d.pastaEp, 'roteiro.json'), null).catch(() => null);
    const avisos = [];
    if (temVotos(d.escolha) || d.votacao) {
        avisos.push(`O Ep. ${d.n} já tem votação registrada (${textoVotos(d.escolha, d.votacao)}): ela continua valendo com qualquer versão.`);
    }
    return {
        serie: { id: serieId, titulo: d.serie.titulo },
        episodio: {
            n: d.n,
            titulo: (d.entrada && d.entrada.titulo) || '',
            roteiroAtual: atual ? { ...resumoRoteiro(atual), duracaoPlanosS: duracaoDosPlanos(atual), planos: Array.isArray(atual.planos) ? atual.planos.length : 0 } : null,
            memoriaAtual: contarMemoria(d.pastaSerie, d.n, avisos),
        },
        versoes,
        pasta: relDados(opcoes, base),
        bloqueios: await bloqueios(serieId, d.pastaSerie, d.n),
        avisos,
    };
}

/**
 * Volta o episódio para uma versão guardada do roteiro. ANTES guarda a versão atual (roteiro e o que foi feito dele:
 * falas, áudio, edição, legendas, montagem) numa pasta NOVA de _versoes, junto com a memória que veio dela; depois
 * devolve os arquivos e a memória da versão escolhida (a pasta dela some, o conteúdo voltou inteiro).
 * Takes/quadros/planos.json/mesa.json/votacao.json não mudam. Recusa (409) com geração paga, regeração ou montagem.
 * → { ok, restaurada, guardada: "series/.../_versoes/<data>" | null, trazidos, guardados, episodio, memoria: { guardada, devolvida }, avisos }
 */
async function restaurarVersaoRoteiro(serieId, ep, versaoNome, opcoes = {}) {
    await armazem.exigirSerie(serieId, opcoes);
    const n = numeroDoEp(ep);
    if (typeof versaoNome !== 'string' || !RE_VERSAO.test(versaoNome)) throw erro('Versão inválida: use o nome da pasta em _versoes (ex.: 2026-11-04_223015).');
    const pastaEp = episodios.pastaEpisodio(serieId, n, opcoes);
    const base = path.join(pastaEp, PASTA_VERSOES);
    const pastaV = armazem.resolverDentro(base, versaoNome);
    const chaves = [path.join(pastaEp, 'roteiro.json'), path.join(pastaEp, 'edicao.json'), path.join(pastaEp, 'falas.json')];
    const comTravas = (fn) => chaves.reduceRight((dentro, chave) => () => armazem.comTrava(chave, dentro), fn)();
    return comTravas(async () => {
        const d = await dadosDoEpisodio(serieId, n, opcoes);
        if (!fs.existsSync(pastaV)) throw erro(`A versão ${versaoNome} não existe mais no Ep. ${n}.`, 404);
        if (!fs.existsSync(path.join(pastaV, 'roteiro.json'))) throw erro(`A versão ${versaoNome} não tem roteiro.json: restaure à mão.`, 400);
        const travas = await bloqueios(serieId, d.pastaSerie, n);
        if (travas.length) throw erro(`Não voltei à versão do Ep. ${n}. ${travas.join(' ')}`, 409, { erros: travas });

        const motivoV = await armazem.lerJson(path.join(pastaV, 'motivo.json'), null).catch(() => null);
        const roteiroV = await armazem.lerJson(path.join(pastaV, 'roteiro.json'), null).catch(() => null);
        const roteiroAntes = await armazem.lerJson(path.join(pastaEp, 'roteiro.json'), null).catch(() => null);
        const atuais = itensParaVersao(pastaEp, true);
        const daVersao = ITENS_VERSAO.filter((i) => fs.existsSync(path.join(pastaV, i.nome)));
        const preservados = PRESERVADOS.filter((i) => fs.existsSync(path.join(pastaEp, i.nome)));
        const memoriaAtual = contarMemoria(d.pastaSerie, n, []);

        // 1) a versão atual vai para uma pasta nova de _versoes (nunca sobrescreve sem guardar)
        let nova = null;
        const guardados = [];
        if (atuais.length || (memoriaAtual && !memoriaAtual.vazia)) nova = await criarPastaNova(base, carimbo());
        const desfazerGuardados = async () => {
            for (const i of [...guardados].reverse()) {
                if (!fs.existsSync(path.join(pastaEp, i.nome))) await mover(path.join(nova, i.nome), path.join(pastaEp, i.nome)).catch(() => {});
            }
            if (nova) await fsp.rmdir(nova).catch(() => {});
        };
        try {
            for (const i of atuais) {
                await mover(path.join(pastaEp, i.nome), path.join(nova, i.nome));
                guardados.push(i);
            }
        } catch (e) {
            await desfazerGuardados();
            throw e;
        }
        // 2) os arquivos da versão escolhida voltam para o episódio
        const trazidos = [];
        try {
            for (const i of daVersao) {
                await mover(path.join(pastaV, i.nome), path.join(pastaEp, i.nome));
                trazidos.push(i);
            }
        } catch (e) {
            for (const i of [...trazidos].reverse()) {
                if (!fs.existsSync(path.join(pastaV, i.nome))) await mover(path.join(pastaEp, i.nome), path.join(pastaV, i.nome)).catch(() => {});
            }
            await desfazerGuardados();
            throw e;
        }

        // 3) memória: a do roteiro atual vai com ele; a da versão volta
        const avisos = [];
        const memoriaGuardada = nova ? retirarMemoria(d.pastaSerie, n, nova, avisos) : null;
        const memoriaDevolvida = devolverMemoria(d.pastaSerie, n, pastaV, avisos);

        // 4) serie.json: título, duração e "sem votação" da versão; status de quando ela foi guardada
        const entradaV = motivoV && motivoV.entradaAntes && typeof motivoV.entradaAntes === 'object' ? motivoV.entradaAntes : null;
        let entrada;
        await armazem.atualizarSerie(serieId, (s) => {
            s.episodios = Array.isArray(s.episodios) ? s.episodios : [];
            entrada = s.episodios.find((e) => e.n === n);
            if (!entrada) {
                entrada = { n, id: episodios.idEpisodio(n), titulo: '', status: 'roteiro' };
                s.episodios.push(entrada);
                s.episodios.sort((a, b) => a.n - b.n);
            }
            const titulo = (roteiroV && roteiroV.titulo) || (entradaV && entradaV.titulo);
            if (titulo) entrada.titulo = titulo;
            entrada.status = (entradaV && entradaV.status) || 'roteiro';
            const dur = (roteiroV && Number(roteiroV.duracaoAlvoS)) || (entradaV && Number(entradaV.duracaoAlvoS));
            if (dur) entrada.duracaoAlvoS = dur;
            if (roteiroV && 'escolhas' in roteiroV) entrada.semEscolha = roteiroV.escolhas === null;
            else if (entradaV && typeof entradaV.semEscolha === 'boolean') entrada.semEscolha = entradaV.semEscolha;
            return s;
        }, opcoes);

        // 5) bíblia: a escolha A/B sem votos passa a ser a da versão; com votos, a votação continua valendo
        const votado = temVotos(d.escolha) || Boolean(d.votacao);
        const escolhaAtual = votado ? null : d.escolha;
        if (votado) {
            avisos.push(`A votação registrada do Ep. ${n} (${textoVotos(d.escolha, d.votacao)}) continua valendo: a escolha A/B da bíblia não mudou.`);
        } else {
            const escolhasV = roteiroV && roteiroV.escolhas && roteiroV.escolhas.A && roteiroV.escolhas.B ? roteiroV.escolhas : null;
            const daVersaoEscolha = (motivoV && motivoV.escolhaAntes)
                || (escolhasV ? { ep: n, A: escolhasV.A.texto, B: escolhasV.B.texto, vencedora: null, votos: { A: 0, B: 0 } } : null);
            if (d.escolha || daVersaoEscolha) {
                await armazem.atualizarBiblia(serieId, (b) => {
                    b.escolhas = (Array.isArray(b.escolhas) ? b.escolhas : []).filter((x) => x.ep !== n || temVotos(x));
                    if (daVersaoEscolha && !b.escolhas.some((x) => x.ep === n)) {
                        b.escolhas.push({ ...daVersaoEscolha, ep: n });
                        b.escolhas.sort((x, y) => x.ep - y.ep);
                    }
                    return b;
                }, opcoes);
            }
        }

        // 6) registro da versão guardada agora
        if (nova) {
            await armazem.escreverJsonAtomico(path.join(nova, 'motivo.json'), {
                versao: 1,
                tipo: 'antesDeRestaurar',
                serie: serieId,
                ep: n,
                guardadoEm: new Date().toISOString(),
                restaurouVersao: versaoNome,
                roteiro: resumoRoteiro(roteiroAntes),
                entradaAntes: d.entrada,
                escolhaAntes: escolhaAtual,
                movidos: guardados.map((i) => i.nome),
                preservados: preservados.map((i) => i.nome),
                memoria: memoriaGuardada && memoriaGuardada.guardada ? { fatos: memoriaGuardada.fatos, encerramentos: memoriaGuardada.encerramentos, resumo: memoriaGuardada.resumo } : null,
                comoRestaurar: `Use "Versões do roteiro" na página do episódio. À mão: mova os itens desta pasta de volta para "${relDados(opcoes, pastaEp)}" (antes, guarde o roteiro atual).`,
            });
        }
        // 7) a pasta da versão restaurada some (o conteúdo voltou inteiro); se sobrou algo desconhecido, ela fica
        await fsp.rm(path.join(pastaV, 'motivo.json'), { force: true });
        try {
            await fsp.rmdir(pastaV);
        } catch {
            const sobra = await fsp.readdir(pastaV).catch(() => []);
            if (sobra.length) avisos.push(`Sobrou em ${relDados(opcoes, pastaV)}: ${sobra.slice(0, 5).join(', ')}. Ficou lá, intacto.`);
        }
        return {
            ok: true,
            restaurada: versaoNome,
            guardada: nova ? relDados(opcoes, nova) : null,
            trazidos: trazidos.map((i) => i.nome),
            guardados: guardados.map((i) => i.nome),
            preservados: preservados.map((i) => i.nome),
            episodio: { ...entrada },
            memoria: { guardada: memoriaGuardada, devolvida: memoriaDevolvida },
            avisos,
        };
    });
}

// ---------------------------------------------------------------- listar e restaurar
async function listarLixeira(opcoes = {}) {
    const base = pastaLixeira(opcoes);
    let nomes = [];
    try { nomes = await fsp.readdir(base, { withFileTypes: true }); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    const itens = [];
    for (const d of nomes) {
        if (!d.isDirectory() || !RE_ITEM.test(d.name)) continue;
        const m = await armazem.lerJson(path.join(base, d.name, 'motivo.json'), null).catch(() => null);
        if (!m) { itens.push({ item: d.name, tipo: 'desconhecido', erro: 'Sem motivo.json: restaure à mão.' }); continue; }
        itens.push({
            item: d.name,
            tipo: m.tipo,
            serie: m.serie,
            titulo: m.tipo === 'serie' ? m.titulo : (m.titulo || ''),
            tituloSerie: m.tipo === 'serie' ? m.titulo : (m.tituloSerie || m.serie),
            ep: m.ep ?? null,
            apagadoEm: m.apagadoEm,
            arquivos: m.arquivos || 0,
            tamanhoMb: Math.round(((m.bytes || 0) / 1048576) * 10) / 10,
            gastoUsd: m.gastoUsd || 0,
            origem: m.origem,
        });
    }
    return itens.sort((a, b) => String(b.item).localeCompare(String(a.item)));
}

/** Devolve o item da lixeira para onde ele estava. Nunca sobrescreve nada que exista hoje. */
async function restaurarDaLixeira(item, opcoes = {}) {
    if (typeof item !== 'string' || !RE_ITEM.test(item)) throw erro('Item da lixeira inválido.');
    const base = pastaLixeira(opcoes);
    const pastaItem = armazem.resolverDentro(base, item);
    const motivo = await armazem.lerJson(path.join(pastaItem, 'motivo.json'), null);
    if (!motivo) throw erro('Este item não tem motivo.json: restaure à mão (mova a pasta de volta).', 404);
    const serieId = armazem.exigirId(motivo.serie, 'id da série');

    if (motivo.tipo === 'serie') {
        const destino = armazem.pastaSerie(serieId, opcoes);
        const origem = path.join(pastaItem, serieId);
        if (!fs.existsSync(origem)) throw erro('A pasta da série não está mais neste item da lixeira.', 404);
        return armazem.comTrava(`serie:${destino}`, async () => {
            if (fs.existsSync(destino)) throw erro(`Já existe uma série "${serieId}". Renomeie ou apague a atual antes de restaurar.`, 409);
            await fsp.mkdir(path.dirname(destino), { recursive: true });
            await mover(origem, destino);
            await fsp.rm(path.join(pastaItem, 'motivo.json'), { force: true });
            await fsp.rmdir(pastaItem).catch(() => {});
            return { ok: true, tipo: 'serie', serie: serieId, titulo: motivo.titulo };
        });
    }
    if (motivo.tipo === 'episodio') {
        const n = numeroDoEp(motivo.ep);
        if (!fs.existsSync(path.join(armazem.pastaSerie(serieId, opcoes), 'serie.json'))) {
            throw erro(`A série "${serieId}" não existe mais: restaure a série primeiro.`, 409);
        }
        const destino = episodios.pastaEpisodio(serieId, n, opcoes);
        const idEp = episodios.idEpisodio(n);
        const origem = path.join(pastaItem, idEp);
        return armazem.comTrava(`eps:${serieId}`, async () => {
            const serie = await armazem.lerSerie(serieId, opcoes);
            if (fs.existsSync(destino) || (serie.episodios || []).some((e) => e.n === n)) {
                throw erro(`A série já tem um Ep. ${n}. Apague ou renumere o atual antes de restaurar.`, 409);
            }
            if (motivo.temPasta !== false) {
                if (!fs.existsSync(origem)) throw erro('A pasta do episódio não está mais neste item da lixeira.', 404);
                await fsp.mkdir(path.dirname(destino), { recursive: true });
                await mover(origem, destino);
            }
            await armazem.atualizarSerie(serieId, (s) => {
                s.episodios = Array.isArray(s.episodios) ? s.episodios : [];
                s.episodios.push(motivo.entrada && motivo.entrada.n === n ? motivo.entrada : { n, id: idEp, titulo: motivo.titulo || '', status: 'roteiro' });
                s.episodios.sort((a, b) => a.n - b.n);
                return s;
            }, opcoes);
            if (motivo.escolha) {
                await armazem.atualizarBiblia(serieId, (b) => {
                    b.escolhas = Array.isArray(b.escolhas) ? b.escolhas : [];
                    if (!b.escolhas.some((x) => x.ep === n)) {
                        b.escolhas.push(motivo.escolha);
                        b.escolhas.sort((x, y) => x.ep - y.ep);
                    }
                    return b;
                }, opcoes);
            }
            // A memória que saiu com o episódio volta (ou, se já há memória nova do Ep. N, vai para memoria/historico/).
            const avisos = [];
            const memoria = devolverMemoria(armazem.pastaSerie(serieId, opcoes), n, pastaItem, avisos);
            await fsp.rm(path.join(pastaItem, 'motivo.json'), { force: true });
            await fsp.rmdir(pastaItem).catch(() => {});
            return { ok: true, tipo: 'episodio', serie: serieId, ep: n, titulo: motivo.titulo || '', memoria, avisos };
        });
    }
    throw erro(`Tipo de item desconhecido (${motivo.tipo}): restaure à mão.`);
}

module.exports = {
    PASTA_LIXEIRA,
    PASTA_VERSOES,
    DERIVADOS,
    PRESERVADOS,
    carimbo,
    pastaLixeira,
    bloqueios,
    preverApagarSerie,
    apagarSerie,
    preverApagarEpisodio,
    apagarEpisodio,
    preverRefazerRoteiro,
    refazerRoteiro,
    listarVersoesRoteiro,
    restaurarVersaoRoteiro,
    listarLixeira,
    restaurarDaLixeira,
};
