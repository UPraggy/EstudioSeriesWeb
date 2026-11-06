// ANEXAR O QUE FOI GERADO FORA (Midjourney, Runway, Kling, Flow...): o arquivo entra no MESMO lugar e com o MESMO
// registro de uma geração interna, sem custo.
//  - imagem de ficha  → <pasta>/<id>/ref/<estado>-<vista>.<ext> + estados[].refs[vista] (+ canônica se faltar)
//  - vídeo de trecho  → episodios/epNN/takes/pNN/take_XX.mp4 (aparado ao trecho, como os takes gerados) + mesa.json
//  - quadro-chave     → episodios/epNN/quadros/pNN-externo-<id>.<ext> (a tela grava o quadroChave no plano)
// Tudo confere o tipo pelo CONTEÚDO (assinatura), o tamanho e o caminho (nunca sai da série). Registro: "anexo-externo".
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const armazem = require('../series/armazem');
const fichas = require('../series/fichas');
const registro = require('../log/registro');

const MAX_IMAGEM = 25 * 1024 * 1024;
const MAX_VIDEO = 300 * 1024 * 1024;

const erro = (msg, status = 400) => armazem.erro(msg, status);

// ---------------------------------------------------------------- tipo pelo conteúdo
function tipoDoConteudo(buf) {
    if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
    if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { tipo: 'imagem', ext: '.png' };
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { tipo: 'imagem', ext: '.jpg' };
    if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return { tipo: 'imagem', ext: '.webp' };
    if (buf.toString('ascii', 4, 8) === 'ftyp') {
        const marca = buf.toString('ascii', 8, 12);
        return { tipo: 'video', ext: marca === 'qt  ' ? '.mov' : '.mp4' };
    }
    if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return { tipo: 'video', ext: '.webm' };
    return null;
}

/**
 * Lê o upload: { arquivo: { nome, base64 } } (JSON) OU { buffer, nome } (corpo binário).
 * Confere o tipo esperado ('imagem' | 'video') pelo conteúdo e o tamanho. → { buffer, ext, nome, tamanho }
 */
function lerUpload({ arquivo, buffer, nome } = {}, esperado) {
    let buf = buffer;
    let nomeOriginal = nome;
    if (!Buffer.isBuffer(buf)) {
        if (!arquivo || typeof arquivo !== 'object' || typeof arquivo.base64 !== 'string') {
            throw erro('Envie o arquivo: "arquivo" { nome, base64 } ou o corpo binário com ?nome=.');
        }
        buf = Buffer.from(arquivo.base64.replace(/^data:[^,]*,/, ''), 'base64');
        nomeOriginal = arquivo.nome;
    }
    nomeOriginal = path.basename(String(nomeOriginal || (esperado === 'video' ? 'video.mp4' : 'imagem.png'))).slice(0, 160);
    if (!buf.length) throw erro('Arquivo vazio.');
    const max = esperado === 'video' ? MAX_VIDEO : MAX_IMAGEM;
    if (buf.length > max) throw erro(`${esperado === 'video' ? 'Vídeo' : 'Imagem'} maior que ${Math.round(max / 1024 / 1024)} MB.`, 413);
    const t = tipoDoConteudo(buf);
    if (!t || t.tipo !== esperado) {
        throw erro(esperado === 'video'
            ? 'O arquivo não parece um vídeo MP4, MOV ou WEBM.'
            : 'O arquivo não parece uma imagem PNG, JPEG ou WEBP.', 415);
    }
    return { buffer: buf, ext: t.ext, nome: nomeOriginal, tamanho: buf.length };
}

async function comTemporario(up, fn) {
    const tmp = path.join(os.tmpdir(), `estudio-anexo-${crypto.randomBytes(6).toString('hex')}${up.ext}`);
    await fsp.writeFile(tmp, up.buffer);
    try {
        return await fn(tmp);
    } finally {
        await fsp.rm(tmp, { force: true }).catch(() => {});
    }
}

function logAnexo(area, { serie, ep, msg, dados }) {
    registro.registrar({ area, evento: 'anexo-externo', serie, ep, msg, dados: { origem: 'externo', custoUsd: 0, ...dados } });
}

// ---------------------------------------------------------------- imagem da ficha (elenco, locais, objetos)
async function anexarImagemFicha({ serie, tipo, id, estado, vista, upload } = {}) {
    const up = lerUpload(upload, 'imagem');
    const r = await comTemporario(up, (tmp) => fichas.adicionarReferencia(serie, tipo, id, tmp, {
        estado: estado || undefined,
        vista: vista || undefined,
        nomeOriginal: up.nome,
        canonicaSeFaltar: true,
        externo: { original: up.nome, em: new Date().toISOString() },
    }));
    const pasta = fichas.pastaDoTipo(tipo);
    logAnexo('serie', {
        serie,
        msg: `Imagem de fora anexada em ${pasta}/${id} (${r.caminho})`,
        dados: { ficha: `${pasta}/${id}`, vista: vista || null, estado: estado || null, caminho: r.caminho, original: up.nome, bytes: up.tamanho, copiado: r.copiado },
    });
    return { ok: true, ficha: r.ficha, caminho: r.caminho, caminhoSerie: `${pasta}/${id}/${r.caminho}`, copiado: r.copiado, origem: 'externo', custoUsd: 0 };
}

// ---------------------------------------------------------------- vídeo como take de um trecho da Mesa
async function anexarVideoTrecho({ serie, ep, deS, ateS, plano, instrucao = '', upload, aplicar = true } = {}) {
    const U = require('../edicao/util');
    const E = require('../edicao/edicao');
    const T = require('../edicao/trecho');
    const up = lerUpload(upload, 'video');
    const c = U.caminhos(serie, ep);
    const doc = await E.lerEdicao(serie, ep);
    if (!doc) throw erro('Este episódio ainda não tem edição: abra a Mesa antes de anexar um take.', 404);
    let de = Number(deS);
    let ate = Number(ateS);
    let partes;
    if (Number.isFinite(de) && Number.isFinite(ate)) {
        if (ate - de < 0.2) throw erro('Selecione um trecho de pelo menos 0,2 s.');
        if (de < -1e-6 || ate > doc.duracaoS + 0.05) throw erro('O trecho passa dos limites do episódio.');
        partes = E.planosDoTrecho(doc, de, ate);
    } else if (plano !== undefined && plano !== null && plano !== '') {
        const lim = E.limitesPlanos(doc).find((l) => l.n === Number(plano));
        if (!lim) throw erro(`Plano ${plano} não encontrado na edição.`, 404);
        partes = [{ plano: lim.n, deS: lim.deS, ateS: lim.ateS }];
    } else {
        throw erro('Informe o trecho (deS e ateS) ou o plano.');
    }
    if (!partes.length) throw erro('O trecho não cai em nenhum plano com vídeo.');
    if (partes.length > 1) throw erro(`O trecho cruza ${partes.length} planos (${partes.map((p) => p.plano).join(' e ')}): anexe um vídeo por plano.`);
    const parte = partes[0];
    de = parte.deS;
    ate = parte.ateS;
    const len = U.arred(ate - de);
    const pasta = `episodios/${c.epId}/takes/p${String(parte.plano).padStart(2, '0')}`;
    const pastaAbs = U.absolutoNaSerie(c.pastaSerie, pasta);
    await fsp.mkdir(pastaAbs, { recursive: true });

    // Reserva o número do take sob a trava da mesa (não colide com cotações em aberto nem com outro anexo).
    const mesa0 = await E.lerMesa(serie, ep);
    let nomes = [];
    try { nomes = await fsp.readdir(pastaAbs); } catch { nomes = []; }
    const reservados = mesa0.regeracoes.filter((r) => r.plano === parte.plano && ['cotado', 'gerando'].includes(r.status)).map((r) => r.take && r.take.id);
    const takeId = T.proximoTake(nomes, (mesa0.takes || {})[parte.plano] || [], reservados);
    const brutoRel = `${pasta}/${takeId}.externo${up.ext}`;
    const finalRel = `${pasta}/${takeId}.mp4`;
    const brutoAbs = U.absolutoNaSerie(c.pastaSerie, brutoRel);
    const finalAbs = U.absolutoNaSerie(c.pastaSerie, finalRel);
    if (fs.existsSync(brutoAbs) || fs.existsSync(finalAbs)) throw erro('Já existe um take com esse número: tente de novo.', 409);
    await fsp.writeFile(brutoAbs, up.buffer, { flag: 'wx' });

    let info;
    try {
        info = await U.infoMidia(brutoAbs);
    } catch (e) {
        await fsp.rm(brutoAbs, { force: true }).catch(() => {});
        throw erro(`Não consegui ler o vídeo (ffprobe): ${e.message}`);
    }
    if (!info.temVideo || !(info.duracaoS > 0)) {
        await fsp.rm(brutoAbs, { force: true }).catch(() => {});
        throw erro('O arquivo não tem uma faixa de vídeo legível.');
    }
    const avisos = [];
    const proporcao = info.largura && info.altura ? info.largura / info.altura : null;
    const vertical = proporcao !== null && Math.abs(proporcao - 9 / 16) < 0.02;
    if (!vertical) {
        avisos.push(info.largura && info.altura
            ? `O vídeo é ${info.largura}×${info.altura}, não 9:16: ele foi cortado no centro para caber no quadro vertical.`
            : 'Não consegui ler a resolução do vídeo: confira o enquadramento.');
    }
    if (info.duracaoS > len + 0.05) avisos.push(`O vídeo tem ${info.duracaoS.toFixed(2).replace('.', ',')} s: foi aparado para ${len.toFixed(2).replace('.', ',')} s (o tamanho do trecho).`);
    if (info.duracaoS < len - 0.05) avisos.push(`O vídeo tem ${info.duracaoS.toFixed(2).replace('.', ',')} s, menos que o trecho (${len.toFixed(2).replace('.', ',')} s): o último quadro fica parado até o fim.`);

    const fps = doc.fps || U.FPS_PADRAO;
    const vf = T.cadeiaAjuste({ ajuste: 'aparar', duracaoBrutaS: info.duracaoS, trechoS: len, fps });
    await U.rodarFfmpeg(['-y', '-i', brutoAbs, '-an', '-vf', vf, '-t', len.toFixed(3), '-c:v', 'libx264', '-crf', '18', '-preset', 'fast', finalAbs]);

    const agora = new Date().toISOString();
    const regId = U.novoId('x');
    const take = {
        id: takeId, arquivo: finalRel, bruto: brutoRel, origem: 'externo', nomeOriginal: up.nome, plano: parte.plano,
        deS: de, ateS: ate, duracaoS: len, modelo: null, instrucao: String(instrucao || '') || `Anexado: ${up.nome}`,
        custoUsd: 0, simulado: false, criadoEm: agora,
        original: { largura: info.largura, altura: info.altura, duracaoS: info.duracaoS, bytes: up.tamanho, vertical },
    };
    let segmento = null;
    if (aplicar) {
        segmento = {
            id: U.novoId('v'), plano: parte.plano, arquivo: finalRel, entradaS: 0, duracaoArquivoS: len,
            origem: 'take', take: takeId, mudo: true, volume: 0.6, descricao: take.instrucao,
        };
    }
    await E.atualizarMesa(serie, ep, (m) => {
        const k = String(parte.plano);
        m.takes[k] = [...(m.takes[k] || []).filter((t) => t.id !== takeId), take];
        m.regeracoes.push({
            id: regId, faixa: 'video', status: 'pronto', etapa: 'pronto', origem: 'externo', plano: parte.plano, deS: de, ateS: ate,
            duracaoS: len, instrucao: take.instrucao, modelo: null, nomeOriginal: up.nome, custoPrevistoUsd: 0, custoUsd: 0,
            take: { id: takeId, arquivo: finalRel, bruto: brutoRel }, criadoEm: agora, concluidoEm: agora,
            ...(segmento ? { segmento: segmento.id } : {}),
        });
    });
    let edicao = null;
    if (segmento) edicao = await E.atualizarEdicao(serie, ep, (d) => E.substituirTrechoVideo(d, de, ate, segmento));
    // o plano INTEIRO anexado (vídeo dos planos → "Anexar de fora") também vira o take escolhido no planos.json
    const planoInteiro = !(Number.isFinite(Number(deS)) && Number.isFinite(Number(ateS)));
    if (segmento && planoInteiro) {
        await require('../edicao/producao').registrarTakeNoPlano(serie, ep, take, { escolher: true, fase: 'final' }).catch(() => false);
    }
    logAnexo('edicao', {
        serie, ep: c.n,
        msg: `Vídeo de fora anexado como ${takeId} do plano ${parte.plano} (${de}–${ate} s)`,
        dados: { plano: parte.plano, take: takeId, deS: de, ateS: ate, original: up.nome, bytes: up.tamanho, largura: info.largura, altura: info.altura, duracaoS: info.duracaoS, vertical, aplicado: Boolean(segmento) },
    });
    return { ok: true, take, avisos, aplicado: Boolean(segmento), ...(edicao ? { edicao: edicao.edicao, historico: edicao.historico } : {}) };
}

// ---------------------------------------------------------------- quadro-chave de um plano (Mesa)
async function anexarQuadroChave({ serie, ep, plano, upload } = {}) {
    const U = require('../edicao/util');
    const up = lerUpload(upload, 'imagem');
    const n = Number(plano);
    if (!Number.isInteger(n) || n < 1 || n > 999) throw erro('Informe o plano (número).');
    const c = U.caminhos(serie, ep);
    if (!fs.existsSync(c.pastaEp)) throw erro('Episódio não encontrado.', 404);
    const rel = `episodios/${c.epId}/quadros/p${String(n).padStart(2, '0')}-externo-${Date.now().toString(36)}${up.ext}`;
    const abs = U.absolutoNaSerie(c.pastaSerie, rel);
    await fsp.mkdir(path.dirname(abs), { recursive: true });
    await fsp.writeFile(abs, up.buffer, { flag: 'wx' });
    logAnexo('edicao', { serie, ep: c.n, msg: `Quadro-chave de fora anexado no plano ${n} (${rel})`, dados: { plano: n, caminho: rel, original: up.nome, bytes: up.tamanho } });
    return { ok: true, arquivo: rel, quadroChave: { arquivo: rel, origem: 'externo', original: up.nome, custoUsd: 0 } };
}

module.exports = { MAX_IMAGEM, MAX_VIDEO, tipoDoConteudo, lerUpload, anexarImagemFicha, anexarVideoTrecho, anexarQuadroChave };
