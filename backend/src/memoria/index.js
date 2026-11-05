// Memória da série: fatos canônicos, estado do mundo, resumos e glossário (pasta memoria/ da série).
// Ver docs/MEMORIA.md.
const arquivos = require('./arquivos');
const estado = require('./estado');
const { montarContexto, FINALIDADES, LIMITE_PADRAO } = require('./contexto');
const { consolidarEpisodio, semearDaBiblia } = require('./consolidar');
const { verificarContinuidade } = require('./continuidade');

module.exports = {
    montarContexto, consolidarEpisodio, semearDaBiblia, verificarContinuidade,
    carregarSerie: arquivos.carregarSerie,
    carregarMemoria: arquivos.carregarMemoria,
    caminhoSerie: arquivos.caminhoSerie,
    fatosVigentes: arquivos.fatosVigentes,
    aplicarProposta: arquivos.aplicarProposta,
    lerProposta: arquivos.lerProposta,
    estadoInicial: estado.estadoInicial,
    FINALIDADES, LIMITE_PADRAO,
};
