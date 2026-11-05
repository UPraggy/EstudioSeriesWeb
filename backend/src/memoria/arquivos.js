// Leitura e gravação da série e da memória (pasta `memoria/` dentro da série).
// Só leitura de serie.json/biblia.json/fichas/episódios; a escrita aqui é SÓ na pasta memoria/.
const fs = require('fs');
const path = require('path');
const {
    epNum, epTag, lerJson, lerTexto, gravarJson, gravarTexto, lerJsonl, acrescentarJsonl, clonar, paraPosix,
} = require('./util');

const DADOS_PADRAO = 'E:\\EstudioSeriesDados';
const TIPOS_FATO = ['regra', 'evento', 'personagem', 'objeto', 'local', 'relacao', 'segredo', 'misterio'];
const PASTAS_FICHA = { elenco: 'personagem', locais: 'local', objetos: 'objeto' };

function raizDados() {
    return process.env.ESTUDIO_DADOS || DADOS_PADRAO;
}

// id = slug (minúsculas, sem acento, hífens): impede sair da pasta de dados.
function caminhoSerie(id) {
    if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,80}$/.test(id)) {
        throw new Error('serieId inválido (use o slug da série: minúsculas, números e hífens).');
    }
    return path.join(raizDados(), 'series', id);
}

function caminhosMemoria(pastaSerie) {
    const base = path.join(pastaSerie, 'memoria');
    return {
        base,
        fatos: path.join(base, 'fatos.jsonl'),
        estado: path.join(base, 'estado.json'),
        glossario: path.join(base, 'glossario.json'),
        resumos: path.join(base, 'resumos'),
        propostas: path.join(base, 'propostas'),
        historico: path.join(base, 'historico'),
    };
}

// Várias linhas com o mesmo id: a última vence (campo a campo). Assim o arquivo só cresce
// e "encerrar" um fato é acrescentar {id, ate}.
function colapsarFatos(linhas) {
    const mapa = new Map();
    for (const f of linhas || []) {
        if (!f || typeof f !== 'object' || !f.id) continue;
        mapa.set(f.id, { ...(mapa.get(f.id) || {}), ...f });
    }
    return [...mapa.values()];
}

// Fatos que valem no INÍCIO do episódio `ep` (o que o roteiro do ep pode assumir).
// desde = episódio em que passou a valer (bíblia = ep00); ate = episódio em que deixou de valer.
// Sem `ep`: fatos em aberto (ate = null) — "o mundo agora".
function fatosVigentes(fatos, ep) {
    const n = ep == null ? null : epNum(ep);
    return (fatos || []).filter((f) => {
        const desde = epNum(f.desde) ?? 0;
        const ate = f.ate == null ? null : epNum(f.ate);
        if (n == null) return ate == null;
        return desde < n && (ate == null || ate >= n);
    });
}

function lerResumos(pasta) {
    const resumos = {};
    let nomes = [];
    try {
        nomes = fs.readdirSync(pasta);
    } catch (e) {
        if (e.code !== 'ENOENT') throw e;
    }
    for (const nome of nomes) {
        const m = nome.match(/^ep(\d+)\.md$/i);
        if (m) resumos[Number(m[1])] = lerTexto(path.join(pasta, nome), '').trim();
    }
    return resumos;
}

function carregarMemoria(pastaSerie) {
    const c = caminhosMemoria(pastaSerie);
    const { itens, erros } = lerJsonl(c.fatos);
    return {
        fatos: colapsarFatos(itens),
        errosFatos: erros,
        estado: lerJson(c.estado, null),
        resumos: lerResumos(c.resumos),
        glossario: lerJson(c.glossario, { versao: 1, termos: [] }),
    };
}

function lerFichas(pastaSerie) {
    const fichas = { elenco: {}, locais: {}, objetos: {} };
    for (const [pasta, tipo] of Object.entries(PASTAS_FICHA)) {
        let ids = [];
        try {
            ids = fs.readdirSync(path.join(pastaSerie, pasta), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
        } catch (e) {
            if (e.code !== 'ENOENT') throw e;
        }
        for (const id of ids) {
            const ficha = lerJson(path.join(pastaSerie, pasta, id, 'ficha.json'), null);
            if (ficha) fichas[pasta][ficha.id || id] = { tipo, ...ficha, id: ficha.id || id, _pasta: `${pasta}/${id}` };
        }
    }
    return fichas;
}

function lerEpisodios(pastaSerie) {
    const episodios = {};
    let nomes = [];
    try {
        nomes = fs.readdirSync(path.join(pastaSerie, 'episodios'));
    } catch (e) {
        if (e.code !== 'ENOENT') throw e;
    }
    for (const nome of nomes) {
        const m = nome.match(/^ep(\d+)$/i);
        if (!m) continue;
        const dir = path.join(pastaSerie, 'episodios', nome);
        episodios[Number(m[1])] = {
            roteiro: lerJson(path.join(dir, 'roteiro.json'), null),
            planos: lerJson(path.join(dir, 'planos.json'), null),
            votacao: lerJson(path.join(dir, 'votacao.json'), null),
        };
    }
    return episodios;
}

// Carrega tudo o que a memória usa de uma pasta de série (só leitura).
function carregarSerie(pastaSerie) {
    if (!pastaSerie || !fs.existsSync(pastaSerie)) throw new Error(`Pasta da série não encontrada: ${pastaSerie}`);
    return {
        pasta: pastaSerie,
        serie: lerJson(path.join(pastaSerie, 'serie.json'), {}) || {},
        biblia: lerJson(path.join(pastaSerie, 'biblia.json'), {}) || {},
        fichas: lerFichas(pastaSerie),
        episodios: lerEpisodios(pastaSerie),
        memoria: carregarMemoria(pastaSerie),
    };
}

function pareceMemoria(obj) {
    return obj && typeof obj === 'object' && !obj.memoria && (Array.isArray(obj.fatos) || 'estado' in obj || 'glossario' in obj);
}

// Aceita: caminho da pasta, série já carregada (de carregarSerie) ou só a memória ({fatos, estado, ...}).
function obterSerie(entrada) {
    if (typeof entrada === 'string') return carregarSerie(entrada);
    if (!entrada || typeof entrada !== 'object') throw new Error('Série inválida: passe o caminho da pasta ou a série carregada.');
    const s = pareceMemoria(entrada) ? { memoria: entrada } : entrada;
    const mem = s.memoria || {};
    return {
        pasta: s.pasta || null,
        serie: s.serie || {},
        biblia: s.biblia || {},
        fichas: { elenco: {}, locais: {}, objetos: {}, ...(s.fichas || {}) },
        episodios: s.episodios || {},
        memoria: {
            fatos: colapsarFatos(mem.fatos || []),
            errosFatos: mem.errosFatos || [],
            estado: mem.estado || null,
            resumos: mem.resumos || {},
            glossario: mem.glossario || { versao: 1, termos: [] },
        },
    };
}

// Procura a ficha de um id em elenco, locais e objetos (nessa ordem, ou só no tipo pedido).
function acharFicha(serie, id, tipo) {
    if (!id) return null;
    const ordem = tipo === 'personagem' ? ['elenco'] : tipo === 'local' ? ['locais'] : tipo === 'objeto' ? ['objetos'] : ['elenco', 'locais', 'objetos'];
    for (const p of ordem) {
        const f = serie.fichas?.[p]?.[id];
        if (f) return f;
    }
    return null;
}

// Grava uma proposta aprovada nos arquivos canônicos. Devolve a lista do que foi gravado.
function aplicarProposta(pastaSerie, proposta) {
    if (!pastaSerie) throw new Error('Sem pasta da série: não dá para gravar a memória.');
    if (!proposta || typeof proposta !== 'object') throw new Error('Proposta inválida.');
    const c = caminhosMemoria(pastaSerie);
    const tag = proposta.ep != null ? epTag(proposta.ep) : null;
    const gravados = [];
    const agora = new Date().toISOString();

    const novos = (proposta.fatosNovos || []).map((f) => ({ ...f, registradoEm: f.registradoEm || agora }));
    const encerrados = (proposta.fatosEncerrados || []).filter((e) => e && e.id && e.ate).map((e) => ({
        id: e.id, ate: e.ate, motivoFim: e.motivo || null, registradoEm: agora,
    }));
    if (encerrados.length || novos.length) {
        acrescentarJsonl(c.fatos, [...encerrados, ...novos]);
        gravados.push(paraPosix(path.relative(pastaSerie, c.fatos)));
    }

    if (proposta.estadoNovo) {
        const anterior = lerJson(c.estado, null);
        if (anterior) {
            const snap = path.join(c.historico, `estado-antes-${tag || 'semear'}-${agora.replace(/[:.]/g, '-')}.json`);
            gravarJson(snap, anterior);
            gravados.push(paraPosix(path.relative(pastaSerie, snap)));
        }
        gravarJson(c.estado, { ...proposta.estadoNovo, versao: 1, atualizadoEm: agora });
        gravados.push(paraPosix(path.relative(pastaSerie, c.estado)));
    }

    if (proposta.resumo && tag && tag !== 'ep00') {
        const arq = path.join(c.resumos, `${tag}.md`);
        gravarTexto(arq, String(proposta.resumo).trim() + '\n');
        gravados.push(paraPosix(path.relative(pastaSerie, arq)));
    }

    if (proposta.glossarioNovo && proposta.glossarioNovo.length) {
        const g = lerJson(c.glossario, { versao: 1, termos: [] }) || { versao: 1, termos: [] };
        const termos = Array.isArray(g.termos) ? g.termos : [];
        for (const t of proposta.glossarioNovo) {
            const i = termos.findIndex((x) => (x.id && x.id === t.id) || x.termo === t.termo);
            if (i >= 0) termos[i] = { ...termos[i], ...t };
            else termos.push(t);
        }
        gravarJson(c.glossario, { versao: 1, termos });
        gravados.push(paraPosix(path.relative(pastaSerie, c.glossario)));
    }

    const registro = { ...clonar(proposta), aprovada: true, aprovadaEm: agora };
    const arqProp = path.join(c.propostas, `${tag || 'semear'}.json`);
    gravarJson(arqProp, registro);
    gravados.push(paraPosix(path.relative(pastaSerie, arqProp)));
    return gravados;
}

function gravarProposta(pastaSerie, proposta) {
    const c = caminhosMemoria(pastaSerie);
    const tag = proposta.ep != null ? epTag(proposta.ep) : 'semear';
    const arq = path.join(c.propostas, `${tag}.json`);
    gravarJson(arq, proposta);
    return paraPosix(path.relative(pastaSerie, arq));
}

function lerProposta(pastaSerie, ep) {
    const tag = ep == null ? 'semear' : epTag(ep);
    return lerJson(path.join(caminhosMemoria(pastaSerie).propostas, `${tag}.json`), null);
}

module.exports = {
    TIPOS_FATO, raizDados, caminhoSerie, caminhosMemoria, colapsarFatos, fatosVigentes,
    carregarMemoria, carregarSerie, obterSerie, acharFicha, aplicarProposta, gravarProposta, lerProposta,
};
