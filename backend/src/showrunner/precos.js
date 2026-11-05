// Estimativa LOCAL de custo por plano (catálogo do OpenRouter consultado em 04/11/2026, 9:16).
// Serve só para a decupagem mostrar "custo previsto"; o preço oficial e o teto ficam no cliente OpenRouter.
const MODELOS_VIDEO = {
    'google/veo-3.1-lite': { usdSeg: { '720p': 0.03, '1080p': 0.05 }, usdSegAudio: { '720p': 0.05 }, duracoes: [4, 6, 8] },
    'google/veo-3.1-fast': { usdSeg: { '720p': 0.08 }, usdSegAudio: { '720p': 0.10 }, duracoes: [4, 6, 8] },
    'bytedance/seedance-1-5-pro': { usdSeg: { '480p': 0.01125, '720p': 0.02625 }, usdSegAudio: { '720p': 0.05125 }, duracoes: [4, 5, 6, 7, 8, 9, 10, 11, 12], estimado: true },
    'x-ai/grok-imagine-video-1.5-lite': { usdSeg: { '480p': 0.02, '720p': 0.03 }, duracoes: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
    'bytedance/seedance-2.0-mini': { usdSeg: { '480p': 0.03375, '720p': 0.075 }, usdSegAudio: { '720p': 0.075 }, duracoes: [4, 5, 6, 7, 8, 9, 10], estimado: true },
    'kwaivgi/kling-v3.0-std': { usdSeg: { '720p': 0.08375 }, usdSegAudio: { '720p': 0.12625 }, duracoes: [3, 4, 5, 6, 7, 8, 9, 10] },
    'heygen/avatar-iv': { usdSeg: { '720p': 0.05 }, usdSegAudio: { '720p': 0.05 }, duracoes: null },
};
const USD_QUADRO_CHAVE = 0.04; // imagem de referência/quadro-chave (estimativa; medir na 1ª chamada)

function infoModelo(modelo) {
    return MODELOS_VIDEO[modelo] || null;
}

// Custo previsto de UM take do plano. null = modelo desconhecido (sem estimativa).
function custoPrevisto(modelo, duracaoS, resolucao = '720p', audio = false) {
    const m = infoModelo(modelo);
    if (!m || !duracaoS) return null;
    const tabela = (audio && m.usdSegAudio) || m.usdSeg;
    const porSeg = tabela[resolucao] ?? tabela['720p'] ?? Object.values(tabela)[0];
    return Math.round(porSeg * duracaoS * 10000) / 10000;
}

// Duração aceita pelo modelo mais próxima, dentro de [min, max] (padrão 4–8 s).
function ajustarDuracao(modelo, duracaoS, min = 4, max = 8) {
    const alvo = Math.min(max, Math.max(min, Number(duracaoS) || max));
    const m = infoModelo(modelo);
    const aceitas = (m?.duracoes || []).filter((d) => d >= min && d <= max);
    if (!aceitas.length) return Math.round(alvo);
    const acima = aceitas.filter((d) => d >= alvo);
    return acima.length ? Math.min(...acima) : Math.max(...aceitas);
}

module.exports = { MODELOS_VIDEO, USD_QUADRO_CHAVE, infoModelo, custoPrevisto, ajustarDuracao };
