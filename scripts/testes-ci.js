// Testes para máquinas sem as ferramentas do PC do Rafael (GitHub Actions): roda todos os de backend/test,
// menos os que precisam do vozes.json do NarradorVideo (E:\projects\...\NarradorVideo), do ffmpeg e do Python.
// No PC, `npm test` roda tudo (inclusive estes). Conferido em 05/11/2026 simulando a máquina sem essas ferramentas.
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PASTA = path.join(__dirname, '..', 'backend', 'test');
const PRECISAM_DO_PC = new Set([
    'audio-falas.test.js',      // vozes.json do NarradorVideo
    'audio-tratamento.test.js', // ffmpeg de verdade
    'edicao.test.js',           // ffmpeg + vozes.json (Mesa, render)
    'externo.test.js',          // ffmpeg/ffprobe (vídeo feito fora, conferido e aparado) — chegou na atualização de 06/11
    'producao.test.js',         // ffmpeg + vozes.json (do roteiro ao vídeo) — chegou na atualização de 06/11
]);

const arquivos = fs.readdirSync(PASTA)
    .filter((n) => n.endsWith('.test.js') && !PRECISAM_DO_PC.has(n))
    .sort()
    .map((n) => path.join('backend', 'test', n));

console.log(`Testes sem as ferramentas do PC: ${arquivos.length} arquivos (fora: ${[...PRECISAM_DO_PC].join(', ')}).`);
const r = spawnSync(process.execPath, ['--test', ...arquivos], { stdio: 'inherit', cwd: path.join(__dirname, '..') });
process.exit(r.status === null ? 1 : r.status);
