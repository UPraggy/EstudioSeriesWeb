// Importação do Farol numa pasta temporária, com os dados reais do NarradorVideo e clipes FALSOS
// (arquivos .mp4 minúsculos, para não copiar 80 MB no teste). Pula se o NarradorVideo não estiver na máquina.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { importarFarol, PASTA_NARRADOR_PADRAO, montarRoteiroEp1, carregarDadosFarol, preencherVazios } = require('../scripts/importar-farol');
const validar = require('../src/series/validar');
const { pastaTemporaria, apagar } = require('./series-ajuda');

const DADOS = path.join(PASTA_NARRADOR_PADRAO, 'docs', 'maquetes', 'dados-farol.js');
const temNarrador = fs.existsSync(DADOS);

function listarTudo(pasta) {
    const saida = [];
    const andar = (p) => {
        for (const ent of fs.readdirSync(p, { withFileTypes: true })) {
            const c = path.join(p, ent.name);
            if (ent.isDirectory()) andar(c);
            else saida.push(path.relative(pasta, c));
        }
    };
    andar(pasta);
    return saida.sort();
}

// Monta um "NarradorVideo" falso: docs/maquetes reais (link por cópia) + entrada/farol-ep1 com 2 clipes falsos.
function narradorFalso(tmp) {
    const pasta = path.join(tmp, 'NarradorVideo');
    fs.cpSync(path.join(PASTA_NARRADOR_PADRAO, 'docs', 'maquetes'), path.join(pasta, 'docs', 'maquetes'), { recursive: true });
    const clipes = path.join(pasta, 'entrada', 'farol-ep1');
    fs.mkdirSync(clipes, { recursive: true });
    fs.writeFileSync(path.join(clipes, 'Mara_locking_dock_door_e3077df8.mp4'), 'falso');
    fs.writeFileSync(path.join(clipes, 'Clipe_desconhecido_0123abcd.mp4'), 'falso2');
    return pasta;
}

test('roteiro do ep01 gerado do dados-farol passa na validação do CONTRATOS', { skip: !temNarrador }, () => {
    const E = carregarDadosFarol(DADOS);
    const rot = montarRoteiroEp1(E);
    const r = validar.validarRoteiro(rot, { elenco: E.elenco.map((x) => x.id) });
    assert.deepStrictEqual(r.erros, []);
    assert.strictEqual(rot.planos.length, 8);
    assert.strictEqual(rot.planos[2].falas[0].via, 'radio');
    assert.strictEqual(rot.planos[1].tipo, 'apresentador');
});

test('importarFarol cria a série completa e é idempotente', { skip: !temNarrador }, async () => {
    const tmp = pastaTemporaria();
    try {
        const raiz = path.join(tmp, 'dados');
        const pastaNarrador = narradorFalso(tmp);
        const r1 = await importarFarol({ raiz, pastaNarrador });
        assert.ok(r1.criados.includes('serie.json'));
        assert.ok(r1.criados.includes('episodios/ep01/roteiro.json'));
        assert.strictEqual(r1.clipesCopiados, 2);

        const serie = path.join(raiz, 'series', 'o-ultimo-farol');
        const ler = (rel) => JSON.parse(fs.readFileSync(path.join(serie, rel), 'utf8'));
        const s = ler('serie.json');
        assert.strictEqual(s.titulo, 'O Último Farol');
        assert.strictEqual(s.vozes.mara, 'pt-BR-ThalitaMultilingualNeural');
        assert.strictEqual(s.tons.alerta, '-6Hz');
        assert.deepStrictEqual(s.episodios, [{ n: 1, id: 'ep01', titulo: 'Sete Quilômetros', status: 'roteiro', duracaoAlvoS: 60, semEscolha: false }]);
        const b = ler('biblia.json');
        assert.strictEqual(b.regras.length, 5);
        assert.strictEqual(b.temporada.length, 10);
        assert.strictEqual(b.escolhas[0].A, 'ACENDER O FAROL');
        assert.strictEqual(validar.validarBiblia(b).ok, true);
        const mara = ler('elenco/mara/ficha.json');
        assert.strictEqual(mara.candidatas.length, 4);
        assert.strictEqual(mara.canonica, null);
        assert.ok(fs.existsSync(path.join(serie, 'elenco', 'mara', 'ref', 'candidatas', 'mara-sala.jpg')));
        const narrador = ler('elenco/narrador/ficha.json');
        assert.strictEqual(narrador.canonica, 'ref/padrao-frente.jpg');
        assert.strictEqual(narrador.voz, 'de-DE-FlorianMultilingualNeural');
        assert.strictEqual(ler('locais/farol/ficha.json').canonica, 'ref/padrao-geral.jpg');
        assert.strictEqual(ler('objetos/barra/ficha.json').onde, 'porta do cais');
        const acervo = ler('acervo/acervo.json');
        assert.deepStrictEqual(acervo.clipes.map((c) => c.arquivo), ['acervo/Clipe_desconhecido_0123abcd.mp4', 'acervo/Mara_locking_dock_door_e3077df8.mp4']);
        assert.strictEqual(acervo.clipes[1].descricao, 'Mara trava a porta do cais');
        assert.strictEqual(acervo.clipes[0].descricao, 'Clipe desconhecido');
        assert.ok(fs.existsSync(path.join(pastaNarrador, 'entrada', 'farol-ep1', 'Mara_locking_dock_door_e3077df8.mp4')), 'original não foi movido');

        // Rafael mexe em algo; a 2ª importação não pode desfazer nem duplicar.
        const caminhoSerie = path.join(serie, 'serie.json');
        const editado = { ...s, genero: 'Terror' };
        fs.writeFileSync(caminhoSerie, JSON.stringify(editado, null, 2));
        const antes = listarTudo(serie);
        const r2 = await importarFarol({ raiz, pastaNarrador });
        assert.deepStrictEqual(r2.criados, []);
        assert.strictEqual(r2.imagensCopiadas, 0);
        assert.strictEqual(r2.clipesCopiados, 0);
        assert.deepStrictEqual(listarTudo(serie), antes);
        assert.strictEqual(ler('serie.json').genero, 'Terror');
        assert.strictEqual(ler('elenco/mara/ficha.json').candidatas.length, 4);
        assert.strictEqual(ler('biblia.json').escolhas.length, 1);
        assert.strictEqual(ler('acervo/acervo.json').clipes.length, 2);
    } finally {
        apagar(tmp);
    }
});

test('preencherVazios só completa o que está vazio', () => {
    const alvo = { a: '', b: 'mantém', c: { x: 1 }, d: [], e: null };
    preencherVazios(alvo, { a: 'novo', b: 'troca?', c: { x: 2, y: 3 }, d: [1], e: 'ok', f: [] });
    assert.deepStrictEqual(alvo, { a: 'novo', b: 'mantém', c: { x: 1, y: 3 }, d: [1], e: 'ok', f: [] });
});
