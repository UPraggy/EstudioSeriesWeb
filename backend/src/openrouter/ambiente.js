// Leitura do ambiente: raiz de dados, chave (nunca exposta) e modo simulado.
const RAIZ_PADRAO = 'E:\\EstudioSeriesDados';

function raizDados() {
    return process.env.ESTUDIO_DADOS || RAIZ_PADRAO;
}

// Lista das chaves presentes (só para uso interno: autenticar e limpar mensagens).
function lerChaves() {
    return [process.env.ASE_OPENROUTER_KEY, process.env.OPENROUTER_API_KEY].filter(Boolean);
}

function lerChave() {
    return process.env.ASE_OPENROUTER_KEY || process.env.OPENROUTER_API_KEY || '';
}

function temChave() {
    return Boolean(lerChave());
}

// Simulado quando ESTUDIO_SIMULADO=1 ou quando não há chave: nada vai para a rede.
function modoSimulado() {
    return process.env.ESTUDIO_SIMULADO === '1' || !temChave();
}

module.exports = { RAIZ_PADRAO, raizDados, lerChave, lerChaves, temChave, modoSimulado };
