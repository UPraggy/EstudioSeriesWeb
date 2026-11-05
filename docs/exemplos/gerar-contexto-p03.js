// Gera farol-ep01-contexto-quadrochave-p03.json: a saída de montarContexto para o quadro-chave do plano 3,
// para revisão humana. As imagens vão como "arquivo:<caminho>" (dataUrl: false) em vez do base64.
// Rodar da raiz do EstudioSeries:  node docs/exemplos/gerar-contexto-p03.js
const fs = require('fs');
const path = require('path');
const { montarContexto } = require('../../backend/src/memoria');

(async () => {
    const pasta = path.join(__dirname, 'o-ultimo-farol');
    const roteiro = JSON.parse(fs.readFileSync(path.join(__dirname, 'farol-ep01-roteiro.json'), 'utf8'));
    const planos = JSON.parse(fs.readFileSync(path.join(__dirname, 'farol-ep01-planos.json'), 'utf8'));
    const pacote = await montarContexto(pasta, 'quadroChave', { ep: 1, plano: 3, roteiro, planos, dataUrl: false });
    const saida = path.join(__dirname, 'farol-ep01-contexto-quadrochave-p03.json');
    fs.writeFileSync(saida, JSON.stringify(pacote, null, 2) + '\n');
    console.log(`ok: ${path.basename(saida)} · ${pacote.tamanho.caracteres} caracteres · ${pacote.imagens.length} imagens · ${pacote.cortes.length} cortes`);
})().catch((e) => { console.error(e); process.exit(1); });
