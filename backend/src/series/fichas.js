// Fichas de elenco, locais e objetos: <serie>/<elenco|locais|objetos>/<id>/ficha.json + ref/ (imagens de referência).
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const validar = require('./validar');
const armazem = require('./armazem');

const { erro } = armazem;

// Pasta → tipo gravado na ficha.
const TIPO_DA_PASTA = { elenco: 'personagem', locais: 'local', objetos: 'objeto' };
const PASTA_DO_TIPO = { personagem: 'elenco', local: 'locais', objeto: 'objetos' };
const EXTENSOES_IMAGEM = ['.png', '.jpg', '.jpeg', '.webp'];
const CAMPOS_CONTRATO = ['versao', 'id', 'tipo', 'nome', 'papel', 'ancora', 'voz', 'tom', 'onde', 'estados', 'estadoAtual', 'canonica', 'origem'];

function pastaDoTipo(tipo) {
    if (TIPO_DA_PASTA[tipo]) return tipo;
    if (PASTA_DO_TIPO[tipo]) return PASTA_DO_TIPO[tipo];
    throw erro(`Tipo de ficha inválido ("${String(tipo).slice(0, 30)}"): use elenco, locais ou objetos.`);
}

function pastaFicha(serie, tipo, id, opcoes = {}) {
    const pastaSerie = armazem.pastaSerie(serie, opcoes);
    armazem.exigirId(id, 'id da ficha');
    return path.join(pastaSerie, pastaDoTipo(tipo), id);
}

// Monta a ficha no formato do CONTRATOS (campos extras, como "obs" e "candidatas", são mantidos no fim).
function montarFicha(tipo, dados = {}) {
    const pasta = pastaDoTipo(tipo);
    const tipoFicha = TIPO_DA_PASTA[pasta];
    const id = dados.id || armazem.slug(dados.nome);
    const estados = Array.isArray(dados.estados) && dados.estados.length
        ? dados.estados
        : [{ id: 'padrao', desde: dados.desde || null, descricao: '', refs: {} }];
    const f = {
        versao: 1,
        id,
        tipo: tipoFicha,
        nome: dados.nome !== undefined ? String(dados.nome).trim() : '',
        papel: dados.papel || '',
        ancora: dados.ancora || '',
    };
    if (tipoFicha === 'personagem') {
        f.voz = dados.voz || null;
        f.tom = dados.tom || (f.voz && f.voz.startsWith('piper:') ? '+0st' : '+0Hz');
    }
    if (tipoFicha === 'objeto') f.onde = dados.onde || '';
    f.estados = estados;
    f.estadoAtual = dados.estadoAtual || estados[0].id;
    f.canonica = dados.canonica || null;
    f.origem = dados.origem || 'importada';
    for (const [k, v] of Object.entries(dados)) {
        if (!CAMPOS_CONTRATO.includes(k) && k !== 'desde') f[k] = v;
    }
    return f;
}

function caminhoFicha(serie, tipo, id, opcoes) {
    return path.join(pastaFicha(serie, tipo, id, opcoes), 'ficha.json');
}

async function criarFicha(serie, tipo, dados = {}, opcoes = {}) {
    await armazem.exigirSerie(serie, opcoes);
    const ficha = montarFicha(tipo, dados);
    armazem.exigirId(ficha.id, 'id da ficha');
    armazem.exigirValido(validar.validarFicha(ficha), 'ficha.json');
    const pasta = pastaFicha(serie, tipo, ficha.id, opcoes);
    const caminho = path.join(pasta, 'ficha.json');
    return armazem.comTrava(caminho, async () => {
        if (fs.existsSync(caminho)) throw erro(`Já existe a ficha "${ficha.id}" em ${pastaDoTipo(tipo)}.`, 409);
        await fsp.mkdir(path.join(pasta, 'ref'), { recursive: true });
        await armazem.gravarNaSerie(armazem.pastaSerie(serie, opcoes), caminho, ficha);
        return ficha;
    });
}

async function lerFicha(serie, tipo, id, opcoes = {}) {
    await armazem.exigirSerie(serie, opcoes);
    const caminho = caminhoFicha(serie, tipo, id, opcoes);
    if (!fs.existsSync(caminho)) throw erro(`Ficha não encontrada: ${pastaDoTipo(tipo)}/${id}.`, 404);
    return armazem.lerJson(caminho);
}

// Cria ou substitui a ficha inteira (com backup do anterior). Devolve { ficha, avisos }.
async function salvarFicha(serie, tipo, dados = {}, opcoes = {}) {
    await armazem.exigirSerie(serie, opcoes);
    const ficha = montarFicha(tipo, dados);
    armazem.exigirId(ficha.id, 'id da ficha');
    const resultado = armazem.exigirValido(validar.validarFicha(ficha), 'ficha.json');
    const pasta = pastaFicha(serie, tipo, ficha.id, opcoes);
    const caminho = path.join(pasta, 'ficha.json');
    await armazem.comTrava(caminho, async () => {
        await fsp.mkdir(path.join(pasta, 'ref'), { recursive: true });
        await armazem.gravarNaSerie(armazem.pastaSerie(serie, opcoes), caminho, ficha);
    });
    return { ficha, avisos: resultado.avisos };
}

async function atualizarFicha(serie, tipo, id, mutar, opcoes = {}) {
    await armazem.exigirSerie(serie, opcoes);
    const caminho = caminhoFicha(serie, tipo, id, opcoes);
    if (!fs.existsSync(caminho)) throw erro(`Ficha não encontrada: ${pastaDoTipo(tipo)}/${id}.`, 404);
    return armazem.atualizarNaSerie(armazem.pastaSerie(serie, opcoes), caminho, mutar, { validador: validar.validarFicha });
}

async function listarFichas(serie, tipo, opcoes = {}) {
    const pasta = path.join(await armazem.exigirSerie(serie, opcoes), pastaDoTipo(tipo));
    let entradas;
    try {
        entradas = await fsp.readdir(pasta, { withFileTypes: true });
    } catch (e) {
        if (e.code === 'ENOENT') return [];
        throw e;
    }
    const fichas = [];
    for (const ent of entradas) {
        if (!ent.isDirectory() || !validar.ehSlug(ent.name)) continue;
        const caminho = path.join(pasta, ent.name, 'ficha.json');
        if (!fs.existsSync(caminho)) continue;
        try {
            fichas.push(await armazem.lerJson(caminho));
        } catch (e) {
            fichas.push({ id: ent.name, erro: e.message });
        }
    }
    return fichas.sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

// ---------- Referências (imagens) ----------
function ehAssinaturaDeImagem(buf) {
    if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return true; // PNG
    if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true; // JPEG
    if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return true; // WEBP
    return false;
}

async function conferirImagem(caminho) {
    const ext = path.extname(caminho).toLowerCase();
    if (!EXTENSOES_IMAGEM.includes(ext)) throw erro(`Só imagens ${EXTENSOES_IMAGEM.join(', ')} viram referência (recebi "${ext || 'sem extensão'}").`);
    let st;
    try {
        st = await fsp.stat(caminho);
    } catch (e) {
        if (e.code === 'ENOENT') throw erro(`Arquivo não encontrado: ${caminho}`, 404);
        throw e;
    }
    if (!st.isFile()) throw erro('O caminho não é um arquivo.');
    const fh = await fsp.open(caminho, 'r');
    try {
        const buf = Buffer.alloc(12);
        const { bytesRead } = await fh.read(buf, 0, 12, 0);
        if (!ehAssinaturaDeImagem(buf.subarray(0, bytesRead))) throw erro('O arquivo não parece uma imagem PNG, JPEG ou WEBP.');
    } finally {
        await fh.close();
    }
    return { ext: ext === '.jpeg' ? '.jpg' : ext, tamanho: st.size };
}

async function sha1(caminho) {
    return crypto.createHash('sha1').update(await fsp.readFile(caminho)).digest('hex');
}

// Procura em "pasta" (sem descer) um arquivo com o mesmo conteúdo: evita copiar a mesma imagem duas vezes.
async function acharIgual(pasta, hash, tamanho) {
    let nomes;
    try {
        nomes = await fsp.readdir(pasta, { withFileTypes: true });
    } catch (e) {
        if (e.code === 'ENOENT') return null;
        throw e;
    }
    for (const ent of nomes) {
        if (!ent.isFile()) continue;
        const c = path.join(pasta, ent.name);
        const st = await fsp.stat(c);
        if (st.size === tamanho && (await sha1(c)) === hash) return c;
    }
    return null;
}

function nomeLivre(pasta, base, ext) {
    let nome = `${base}${ext}`;
    for (let i = 2; fs.existsSync(path.join(pasta, nome)); i++) nome = `${base}-${i}${ext}`;
    return nome;
}

/**
 * Copia uma imagem para <tipo>/<id>/ref/ e registra na ficha.
 * - normal: vai para ref/<estado>-<vista>.<ext> e vira estados[estado].refs[vista].
 * - { candidata: true }: vai para ref/candidatas/<nome original> e entra em ficha.candidatas (ex.: rostos da Mara a escolher).
 * A mesma imagem (mesmo conteúdo) nunca é copiada duas vezes. Devolve { ficha, caminho, copiado }.
 */
async function adicionarReferencia(serie, tipo, id, caminhoArquivo, opcoes = {}) {
    // canonicaSeFaltar: a imagem vira a canônica se a ficha ainda não tem (igual à geração da folha);
    // externo: { original, em } = anexada pelo Rafael (gerada fora do Estúdio), registrada em ficha.anexosExternos.
    const { estado, vista, candidata = false, nomeOriginal, canonicaSeFaltar = false, externo = null } = opcoes;
    if (typeof caminhoArquivo !== 'string' || !caminhoArquivo.trim()) throw erro('Informe o caminho da imagem.');
    const origem = path.resolve(caminhoArquivo);
    const { ext, tamanho } = await conferirImagem(origem);
    const fichaAtual = await lerFicha(serie, tipo, id, opcoes);
    const pasta = pastaFicha(serie, tipo, id, opcoes);
    const estadoId = estado || fichaAtual.estadoAtual || 'padrao';
    const vistaId = vista || (TIPO_DA_PASTA[pastaDoTipo(tipo)] === 'personagem' ? 'frente' : 'geral');
    if (!candidata) {
        armazem.exigirId(estadoId, 'estado');
        armazem.exigirId(vistaId, 'vista');
    }
    const nomeOrig = nomeOriginal || path.basename(origem);
    const pastaDestino = candidata ? path.join(pasta, 'ref', 'candidatas') : path.join(pasta, 'ref');
    const caminhoFichaJson = path.join(pasta, 'ficha.json');

    // A cópia fica sob a trava da ficha: duas chamadas iguais ao mesmo tempo não geram -2.
    return armazem.comTrava(`ref:${caminhoFichaJson}`, async () => {
        await fsp.mkdir(pastaDestino, { recursive: true });
        const hash = await sha1(origem);
        let destino = await acharIgual(pastaDestino, hash, tamanho);
        const copiado = !destino;
        if (!destino) {
            const base = candidata ? (armazem.slug(path.parse(nomeOrig).name) || 'candidata') : `${estadoId}-${vistaId}`;
            destino = path.join(pastaDestino, nomeLivre(pastaDestino, base, ext));
            await fsp.copyFile(origem, destino, fs.constants.COPYFILE_EXCL);
        }
        const rel = armazem.relativoPosix(pasta, destino);
        const ficha = await atualizarFicha(serie, tipo, id, (f) => {
            if (candidata) {
                f.candidatas = Array.isArray(f.candidatas) ? f.candidatas : [];
                if (!f.candidatas.some((c) => c.caminho === rel)) f.candidatas.push({ caminho: rel, original: nomeOrig });
            } else {
                f.estados = Array.isArray(f.estados) ? f.estados : [];
                let est = f.estados.find((e) => e.id === estadoId);
                if (!est) {
                    est = { id: estadoId, desde: null, descricao: '', refs: {} };
                    f.estados.push(est);
                    if (!f.estadoAtual) f.estadoAtual = estadoId;
                }
                est.refs = est.refs && typeof est.refs === 'object' ? est.refs : {};
                const anterior = est.refs[vistaId];
                est.refs[vistaId] = rel;
                // a canônica acompanha a troca quando era a imagem anterior desta mesma vista
                if (canonicaSeFaltar && (!f.canonica || (anterior && f.canonica === anterior))) f.canonica = rel;
            }
            if (externo) {
                f.anexosExternos = Array.isArray(f.anexosExternos) ? f.anexosExternos : [];
                f.anexosExternos.push({ caminho: rel, original: nomeOrig, estado: candidata ? null : estadoId, vista: candidata ? null : vistaId, origem: 'externo', custoUsd: 0, em: externo.em || new Date().toISOString() });
                if (f.anexosExternos.length > 60) f.anexosExternos = f.anexosExternos.slice(-60);
            }
            return f;
        }, opcoes);
        return { ficha, caminho: rel, copiado };
    });
}

// Define a imagem canônica da ficha (caminho relativo à pasta da ficha, ex.: "ref/candidatas/mara-sala.jpg").
async function definirCanonica(serie, tipo, id, caminhoRelativo, opcoes = {}) {
    const pasta = pastaFicha(serie, tipo, id, opcoes);
    const alvo = armazem.resolverDentro(pasta, caminhoRelativo);
    await conferirImagem(alvo);
    const rel = armazem.relativoPosix(pasta, alvo);
    return atualizarFicha(serie, tipo, id, (f) => { f.canonica = rel; return f; }, opcoes);
}

module.exports = {
    TIPO_DA_PASTA,
    PASTA_DO_TIPO,
    EXTENSOES_IMAGEM,
    pastaDoTipo,
    pastaFicha,
    montarFicha,
    criarFicha,
    lerFicha,
    salvarFicha,
    atualizarFicha,
    listarFichas,
    adicionarReferencia,
    definirCanonica,
    ehAssinaturaDeImagem,
};
