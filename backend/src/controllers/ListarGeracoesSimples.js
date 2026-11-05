// GET /ListarGeracoesSimples — gerações avulsas (<ESTUDIO_DADOS>/geracao-simples/<id>/pedido.json), mais recentes primeiro.
// Só leitura: inclui as cotadas e não geradas (resultado null) para a interface mostrar o estado.
const fsp = require('fs/promises');
const path = require('path');
const armazem = require('../series/armazem');
const { responderErro } = require('../series/http');

const RE_ID = /^\d{4}-\d{2}-\d{2}-\d{4}-[0-9a-f]{4}$/;
const LIMITE = 60;
const CAMPOS = ['id', 'tipo', 'texto', 'anexos', 'modelo', 'duracaoS', 'proporcao', 'resolucao', 'audio', 'custoPrevistoUsd', 'resultado', 'criadoEm'];

exports.REST = async (req, res) => {
    try {
        const base = path.join(armazem.raizDados(), 'geracao-simples');
        let nomes;
        try {
            nomes = (await fsp.readdir(base, { withFileTypes: true })).filter((e) => e.isDirectory() && RE_ID.test(e.name)).map((e) => e.name);
        } catch (e) {
            if (e.code === 'ENOENT') return res.json({ geracoes: [] });
            throw e;
        }
        nomes.sort().reverse();
        const geracoes = [];
        for (const id of nomes.slice(0, LIMITE)) {
            const pj = await armazem.lerJson(path.join(base, id, 'pedido.json'), null).catch(() => null);
            if (!pj) continue;
            const g = {};
            for (const c of CAMPOS) if (pj[c] !== undefined) g[c] = pj[c];
            g.id = id;
            geracoes.push(g);
        }
        return res.json({ geracoes, total: nomes.length });
    } catch (error) {
        return responderErro(res, error);
    }
};
