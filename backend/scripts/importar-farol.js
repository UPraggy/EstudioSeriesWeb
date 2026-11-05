#!/usr/bin/env node
// Importa a série "O Último Farol" do NarradorVideo para <ESTUDIO_DADOS>/series/o-ultimo-farol/.
// Fonte: NarradorVideo/docs/maquetes/dados-farol.js (+ img/) e NarradorVideo/entrada/farol-ep1/*.mp4.
// IDEMPOTENTE: rodar de novo só preenche o que estiver faltando/vazio; nunca apaga, nunca sobrescreve
// o que já tem conteúdo e nunca copia a mesma imagem/clipe duas vezes. Os originais NÃO são movidos.
//
// Uso: node backend/scripts/importar-farol.js [--raiz <pasta de dados>] [--narrador <pasta do NarradorVideo>] [--sem-acervo]
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');
const armazem = require('../src/series/armazem');
const fichas = require('../src/series/fichas');
const episodios = require('../src/series/episodios');

const PASTA_NARRADOR_PADRAO = path.resolve(__dirname, '..', '..', '..', 'NarradorVideo');
const ID_SERIE = 'o-ultimo-farol';
const VOZ_ALERTA = 'en-US-BrianMultilingualNeural';

// Descrição curta (pt-BR) de cada clipe do Flow, pelo prefixo do nome do arquivo.
const CLIPES_CONHECIDOS = [
    ['Boat_navigating_dark_ocean_waters', 'Lancha navegando no mar escuro', [], 'canal'],
    ['City_lights_flicker_and_blackout', 'Luzes da cidade piscam e apagam', [], 'cidade'],
    ['Figure_lunging_at_paramedic', 'Vulto avança sobre o socorrista no cais', [], 'cidade'],
    ['Gloved_hand_hovering_over_switch', 'Mão de luva pairando sobre o interruptor', ['mara'], 'sala'],
    ['Hand_hovering_over_lighthouse_sw', 'Mão pairando sobre o interruptor do farol', ['mara'], 'sala'],
    ['Lighthouse_beam_striking_figures', 'Feixe do farol ilumina vultos', [], 'farol'],
    ['Man_looking_up_in_library', 'Narrador olha para cima na biblioteca', ['narrador'], 'biblioteca'],
    ['Man_pointing_at_camera_speaking', 'Narrador aponta para a câmera e fala', ['narrador'], 'biblioteca'],
    ['Man_thinking_before_speaking', 'Narrador pensa antes de falar', ['narrador'], 'biblioteca'],
    ['Mara_holding_phone_listening', 'Mara ouve ao telefone', ['mara'], 'sala'],
    ['Mara_inspecting_control_room', 'Mara inspeciona o painel da sala de controle', ['mara'], 'sala'],
    ['Mara_locking_dock_door', 'Mara trava a porta do cais', ['mara'], 'porta'],
    ['Mara_looking_out_lighthouse_window', 'Mara olha pela janela do farol', ['mara'], 'sala'],
    ['Narrator_breathing_in_neutral_pose', 'Narrador respira, pose neutra', ['narrador'], 'biblioteca'],
    ['Narrator_gesturing_in_armchair', 'Narrador gesticula na poltrona', ['narrador'], 'biblioteca'],
    ['Narrator_leaning_in_with_suspense', 'Narrador se inclina, suspense', ['narrador'], 'biblioteca'],
    ['Narrator_looking_at_camera', 'Narrador olha para a câmera', ['narrador'], 'biblioteca'],
    ['Narrator_sitting_in_library_armc', 'Narrador sentado na poltrona da biblioteca', ['narrador'], 'biblioteca'],
    ['Narrator_speaking_in_library_arm', 'Narrador fala na poltrona da biblioteca', ['narrador'], 'biblioteca'],
    ['Narrator_speaking_with_concern', 'Narrador fala preocupado', ['narrador'], 'biblioteca'],
    ['Narrator_speaking_with_hand_move', 'Narrador fala movendo as mãos', ['narrador'], 'biblioteca'],
    ['Narrator_whispering_mysterious', 'Narrador sussurra, misterioso', ['narrador'], 'biblioteca'],
    ['North_Point_Lighthouse_at_night', 'Farol da Ponta Norte à noite', [], 'farol'],
    ['Survival_supplies_on_wooden_table', 'Suprimentos sobre a mesa de madeira', [], 'deposito'],
];

// Objetos citados no visual de cada plano (para a continuidade).
const PISTAS_OBJETO = [
    ['radio', /r[aá]dio/i],
    ['barra', /\bbarra\b/i],
    ['binoculos', /bin[oó]culos/i],
    ['bolsa', /\bbolsa\b/i],
    ['interruptor', /interruptor/i],
    ['lancha', /lancha/i],
];

function carregarDadosFarol(arquivo) {
    const codigo = fs.readFileSync(arquivo, 'utf8');
    const sandbox = { window: {} };
    vm.runInNewContext(codigo, sandbox, { filename: arquivo, timeout: 2000 });
    if (!sandbox.window.ESTUDIO) throw new Error(`${arquivo} não definiu window.ESTUDIO.`);
    return JSON.parse(JSON.stringify(sandbox.window.ESTUDIO)); // traz para o "realm" do Node
}

function ehVazio(v) {
    if (v === undefined || v === null || v === '') return true;
    if (Array.isArray(v)) return v.length === 0;
    if (typeof v === 'object') return Object.keys(v).length === 0;
    return false;
}

function ehObjetoSimples(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// Preenche em "alvo" só o que está vazio (desce em objetos); nunca troca o que já tem conteúdo.
function preencherVazios(alvo, fonte) {
    for (const [k, v] of Object.entries(fonte)) {
        if (ehVazio(alvo[k])) {
            if (!ehVazio(v)) alvo[k] = structuredClone(v);
            else if (alvo[k] === undefined) alvo[k] = structuredClone(v);
        } else if (ehObjetoSimples(alvo[k]) && ehObjetoSimples(v)) {
            preencherVazios(alvo[k], v);
        }
    }
    return alvo;
}

function semAcento(t) {
    return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function tipoDoPlano(tipo) {
    const t = semAcento(tipo);
    if (t.includes('apresentador')) return 'apresentador';
    if (t.includes('reaproveitar')) return 'reaproveitar';
    if (t.includes('video')) return 'video_ia';
    if (t.includes('grafico')) return 'grafico';
    return 'video_ia';
}

function viaDaFala(quem, plano, tipo) {
    if (quem === 'alerta') return 'radio';
    if (quem === 'narrador') return tipo === 'apresentador' ? 'em_cena' : 'narracao';
    if (/r[aá]dio/i.test(`${plano.visual} ${plano.tela}`)) return 'radio';
    if (/telefone/i.test(`${plano.visual} ${plano.tela}`)) return 'telefone';
    return 'em_cena';
}

// episodio1 do dados-farol → roteiro.json do CONTRATOS.
function montarRoteiroEp1(E) {
    const ep = E.episodio1;
    const planos = ep.planos.map((p) => {
        const tipo = tipoDoPlano(p.tipo);
        return {
            n: p.n,
            deS: p.de,
            ateS: p.ate,
            tipo,
            local: p.local,
            elenco: [...(p.elenco || [])],
            objetos: PISTAS_OBJETO.filter(([, re]) => re.test(p.visual || '')).map(([id]) => id),
            visual: p.visual,
            tela: p.tela || '',
            falas: (p.fala || []).map((f) => ({ quem: f.quem, texto: f.txt, via: viaDaFala(f.quem, p, tipo) })),
        };
    });
    const gancho = planos[0] && planos[0].falas[0] ? planos[0].falas[0].texto : '';
    return {
        versao: 1,
        n: 1,
        titulo: ep.titulo,
        // objetivo e resumo: do §6 do PLANO-ESTUDIO-DE-SERIES.md (episódio 1 reescrito para 60 s).
        objetivo: 'Apresentar Mara, a ilhota sem ponte e o surto, e terminar na escolha da luz do farol.',
        resumo: 'Linear, sem flashback: o Narrador apresenta Mara sozinha no farol; o rádio dá o alerta, ela vê um morto se levantar no cais, tranca o acesso e conta os suprimentos; Davi pede pelo rádio que ela acenda o farol.',
        gancho,
        duracaoAlvoS: ep.duracaoAlvo || 60,
        planos,
        escolhas: {
            A: { texto: ep.escolhas.A.texto, detalhe: ep.escolhas.A.detalhe || '', consequencia: '' },
            B: { texto: ep.escolhas.B.texto, detalhe: ep.escolhas.B.detalhe || '', consequencia: '' },
        },
        cta: ep.cta,
        aprovado: null,
    };
}

function descreverClipe(nome) {
    const conhecido = CLIPES_CONHECIDOS.find(([prefixo]) => nome.startsWith(prefixo));
    if (conhecido) {
        const [, descricao, elenco, local] = conhecido;
        const info = { descricao, elenco: [...elenco], local };
        if (nome.startsWith('Mara_')) info.obs = 'Rosto da Mara não canônico (cada clipe antigo tem um rosto).';
        if (elenco.includes('narrador')) info.obs = 'Usar mudo: a voz é a do Narrador (Florian).';
        return info;
    }
    const base = path.parse(nome).name.replace(/_[0-9a-f]{8}$/i, '').replace(/[_…]+/g, ' ').trim();
    return { descricao: base, elenco: [], local: null };
}

function sondarVideo(arquivo) {
    try {
        const saida = execFileSync('ffprobe', [
            '-v', 'error', '-select_streams', 'v:0',
            '-show_entries', 'stream=width,height:format=duration', '-of', 'json', arquivo,
        ], { encoding: 'utf8', timeout: 30000, windowsHide: true });
        const j = JSON.parse(saida);
        const d = Number(j.format && j.format.duration);
        const st = (j.streams || [])[0] || {};
        return { duracaoS: Number.isFinite(d) ? Math.round(d * 100) / 100 : null, largura: st.width || null, altura: st.height || null };
    } catch {
        return { duracaoS: null, largura: null, altura: null };
    }
}

async function garantirFicha(tipo, dados, opcoes, relatorio) {
    try {
        await fichas.lerFicha(ID_SERIE, tipo, dados.id, opcoes);
    } catch (e) {
        if (e.status !== 404) throw e;
        await fichas.criarFicha(ID_SERIE, tipo, dados, opcoes);
        relatorio.criados.push(`${tipo}/${dados.id}`);
        return;
    }
    await fichas.atualizarFicha(ID_SERIE, tipo, dados.id, (f) => preencherVazios(f, fichas.montarFicha(tipo, dados)), opcoes);
    relatorio.mantidos.push(`${tipo}/${dados.id}`);
}

async function adicionarRef(tipo, id, arquivo, extra, opcoes, relatorio) {
    if (!fs.existsSync(arquivo)) {
        relatorio.avisos.push(`imagem não encontrada: ${arquivo}`);
        return null;
    }
    const r = await fichas.adicionarReferencia(ID_SERIE, tipo, id, arquivo, { ...opcoes, ...extra });
    if (r.copiado) relatorio.imagensCopiadas++;
    return r;
}

async function importarAcervo(pastaClipes, opcoes, relatorio) {
    if (!fs.existsSync(pastaClipes)) {
        relatorio.avisos.push(`pasta de clipes não encontrada: ${pastaClipes}`);
        return;
    }
    const pastaSerie = armazem.pastaSerie(ID_SERIE, opcoes);
    const pastaAcervo = path.join(pastaSerie, 'acervo');
    await fsp.mkdir(pastaAcervo, { recursive: true });
    const nomes = (await fsp.readdir(pastaClipes)).filter((n) => n.toLowerCase().endsWith('.mp4')).sort();
    const presentes = [];
    for (const nome of nomes) {
        const origem = path.join(pastaClipes, nome);
        const destino = path.join(pastaAcervo, nome);
        if (fs.existsSync(destino)) {
            if (fs.statSync(destino).size !== fs.statSync(origem).size) {
                relatorio.avisos.push(`acervo/${nome} já existe com outro conteúdo: mantido como está.`);
            }
        } else {
            await fsp.copyFile(origem, destino, fs.constants.COPYFILE_EXCL);
            relatorio.clipesCopiados++;
        }
        presentes.push(nome);
    }
    const origemTexto = 'Flow (NarradorVideo/entrada/farol-ep1)';
    await armazem.atualizarNaSerie(pastaSerie, path.join(pastaAcervo, 'acervo.json'), (doc) => {
        doc.versao = doc.versao || 1;
        doc.clipes = Array.isArray(doc.clipes) ? doc.clipes : [];
        for (const nome of presentes) {
            const arquivo = `acervo/${nome}`;
            let item = doc.clipes.find((c) => c.arquivo === arquivo);
            if (!item) {
                item = { arquivo };
                doc.clipes.push(item);
            }
            if (item.duracaoS === undefined || item.duracaoS === null) Object.assign(item, sondarVideo(path.join(pastaAcervo, nome)));
            preencherVazios(item, { ...descreverClipe(nome), origem: origemTexto });
        }
        doc.clipes.sort((a, b) => a.arquivo.localeCompare(b.arquivo));
        return doc;
    }, { padrao: { versao: 1, clipes: [] } });
}

async function importarFarol({ raiz, pastaNarrador = PASTA_NARRADOR_PADRAO, comAcervo = true } = {}) {
    const opcoes = raiz ? { raiz } : {};
    const E = carregarDadosFarol(path.join(pastaNarrador, 'docs', 'maquetes', 'dados-farol.js'));
    const pastaImg = path.join(pastaNarrador, 'docs', 'maquetes', 'img');
    const img = (rel) => path.join(pastaImg, path.basename(rel));
    const relatorio = { serie: ID_SERIE, pasta: armazem.pastaSerie(ID_SERIE, opcoes), criados: [], mantidos: [], imagensCopiadas: 0, clipesCopiados: 0, avisos: [] };
    const info = E.series.find((s) => s.id === ID_SERIE) || { titulo: 'O Último Farol', genero: '' };

    // 1. serie.json
    try {
        await armazem.lerSerie(ID_SERIE, opcoes);
        relatorio.mantidos.push('serie.json');
    } catch (e) {
        if (e.status !== 404) throw e;
        await armazem.criarSerie({ titulo: info.titulo, genero: info.genero, ideia: E.biblia.premissa }, opcoes);
        relatorio.criados.push('serie.json');
    }
    const vozes = { alerta: VOZ_ALERTA };
    for (const el of E.elenco) if (el.voz) vozes[el.id] = el.voz;
    const vozAlerta = (E.vozes || []).find((v) => v.id === VOZ_ALERTA);
    await armazem.atualizarSerie(ID_SERIE, (s) => {
        preencherVazios(s, { genero: info.genero, ideia: E.biblia.premissa, vozes, tons: { alerta: (vozAlerta && vozAlerta.tom) || '-6Hz' } });
        if (s.etapa === 'ideia') s.etapa = 'roteiro'; // a série já chega com bíblia e roteiro do ep. 1
        return s;
    }, opcoes);

    // 2. biblia.json
    await armazem.atualizarBiblia(ID_SERIE, (b) => preencherVazios(b, {
        premissa: E.biblia.premissa,
        regras: E.biblia.regras,
        recursos: E.biblia.recursos,
        objetos: E.objetos.map((o) => ({ id: o.id, onde: o.onde })),
        personagens: E.elenco.filter((el) => el.id !== 'narrador').map((el) => ({ id: el.id, estado: 'sem ferimentos', sabe: [] })),
        segredos: { personagens: [], publico: E.biblia.segredos_publico || [] },
        misterios: E.biblia.misterios,
        temporada: E.temporada.map((t) => ({ n: t.n, titulo: t.titulo, fase: t.fase, resumo: '', status: t.status === 'planejado' ? 'ideia' : t.status })),
    }), opcoes);

    // 3. Elenco (narrador com refs fixas; Mara com 4 rostos → candidatas; Davi ainda sem imagem)
    for (const el of E.elenco) {
        await garantirFicha('elenco', {
            id: el.id, nome: el.nome, papel: el.papel, ancora: el.ancora, voz: el.voz, tom: el.tom,
            estados: [{ id: 'padrao', desde: 'ep01', descricao: el.id === 'narrador' ? '' : 'sem ferimentos', refs: {} }],
            origem: 'importada', obs: el.obs,
        }, opcoes, relatorio);
        const refs = el.refs || [];
        if (el.consistente) {
            let primeira = null;
            for (const rel of refs) {
                const nome = path.parse(rel).name;
                const vista = nome === el.id ? 'frente' : armazem.slug(nome.replace(new RegExp(`^${el.id}-`), '')) || 'frente';
                const r = await adicionarRef('elenco', el.id, img(rel), { estado: 'padrao', vista }, opcoes, relatorio);
                if (r && !primeira) primeira = r.caminho;
            }
            const ficha = await fichas.lerFicha(ID_SERIE, 'elenco', el.id, opcoes);
            if (!ficha.canonica && primeira) await fichas.definirCanonica(ID_SERIE, 'elenco', el.id, primeira, opcoes);
        } else {
            for (const rel of refs) await adicionarRef('elenco', el.id, img(rel), { candidata: true }, opcoes, relatorio);
        }
    }

    // 4. Locais (cada um com a imagem do local) e objetos
    for (const loc of E.locais) {
        await garantirFicha('locais', {
            id: loc.id, nome: loc.nome, papel: '', ancora: loc.ancora,
            estados: [{ id: 'padrao', desde: 'ep01', descricao: '', refs: {} }], origem: 'importada',
        }, opcoes, relatorio);
        if (loc.img) {
            const r = await adicionarRef('locais', loc.id, img(loc.img), { estado: 'padrao', vista: 'geral' }, opcoes, relatorio);
            const ficha = await fichas.lerFicha(ID_SERIE, 'locais', loc.id, opcoes);
            if (r && !ficha.canonica) await fichas.definirCanonica(ID_SERIE, 'locais', loc.id, r.caminho, opcoes);
        }
    }
    for (const obj of E.objetos) {
        await garantirFicha('objetos', {
            id: obj.id, nome: obj.nome, papel: '', ancora: '', onde: obj.onde,
            estados: [{ id: 'padrao', desde: 'ep01', descricao: '', refs: {} }], origem: 'importada',
        }, opcoes, relatorio);
    }

    // 5. Acervo (clipes antigos reaproveitáveis; cópia, os originais ficam onde estão)
    if (comAcervo) await importarAcervo(path.join(pastaNarrador, 'entrada', 'farol-ep1'), opcoes, relatorio);

    // 6. Episódio 1 (roteiro de 60 s)
    const serie = await armazem.lerSerie(ID_SERIE, opcoes);
    if (!(serie.episodios || []).some((e) => e.n === 1) && !fs.existsSync(episodios.pastaEpisodio(ID_SERIE, 1, opcoes))) {
        await episodios.criarEpisodio(ID_SERIE, 1, E.episodio1.titulo, opcoes);
    }
    if (await episodios.lerRoteiro(ID_SERIE, 1, opcoes)) {
        relatorio.mantidos.push('episodios/ep01/roteiro.json');
    } else {
        const { avisos } = await episodios.salvarRoteiro(ID_SERIE, 1, montarRoteiroEp1(E), opcoes);
        relatorio.criados.push('episodios/ep01/roteiro.json');
        for (const a of avisos) relatorio.avisos.push(`roteiro ep01: ${a}`);
    }
    return relatorio;
}

if (require.main === module) {
    const args = process.argv.slice(2);
    const valor = (nome) => {
        const i = args.indexOf(nome);
        return i >= 0 ? args[i + 1] : undefined;
    };
    importarFarol({
        raiz: valor('--raiz'),
        pastaNarrador: valor('--narrador') || PASTA_NARRADOR_PADRAO,
        comAcervo: !args.includes('--sem-acervo'),
    }).then((r) => {
        console.log(`Série importada em ${r.pasta}`);
        console.log(`Criados (${r.criados.length}): ${r.criados.join(', ') || '-'}`);
        console.log(`Já existiam, só completados (${r.mantidos.length}): ${r.mantidos.join(', ') || '-'}`);
        console.log(`Imagens copiadas agora: ${r.imagensCopiadas} · clipes copiados agora: ${r.clipesCopiados}`);
        for (const a of r.avisos) console.log(`Aviso: ${a}`);
    }).catch((e) => {
        console.error('Erro:', e.message);
        if (Array.isArray(e.erros)) for (const x of e.erros) console.error(` - ${x}`);
        process.exit(1);
    });
}

module.exports = { importarFarol, carregarDadosFarol, montarRoteiroEp1, descreverClipe, preencherVazios, PASTA_NARRADOR_PADRAO };
