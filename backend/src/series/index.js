// Núcleo de séries: ponto único de entrada para os outros módulos (showrunner, openrouter, montagem).
module.exports = {
    armazem: require('./armazem'),
    fichas: require('./fichas'),
    episodios: require('./episodios'),
    validar: require('./validar'),
    custos: require('./custos'),
};
