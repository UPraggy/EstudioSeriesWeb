// Mapeamento dinâmico de controllers (padrão do Rafael): POST /<NomeRota> e GET /<NomeRota>.
// Cada módulo novo registra seus controllers aqui, um por linha.
const routes = require('express').Router();

const controllers = {
    // núcleo de séries
    'CriarSerie': require('./controllers/CriarSerie'),
    'LerSerie': require('./controllers/LerSerie'),
    'SalvarFicha': require('./controllers/SalvarFicha'),
    'AdicionarReferencia': require('./controllers/AdicionarReferencia'),
    'DefinirCanonica': require('./controllers/DefinirCanonica'),
    'SalvarRoteiro': require('./controllers/SalvarRoteiro'),
    'CriarEpisodio': require('./controllers/CriarEpisodio'),
    'LerEpisodio': require('./controllers/LerEpisodio'),
    'RegistrarVotacao': require('./controllers/RegistrarVotacao'),
    // OpenRouter (cotação em 2 passos: nada pago sem token de confirmação)
    'CotarGeracao': require('./controllers/CotarGeracao'),
    'GerarVideo': require('./controllers/GerarVideo'),
    'GerarImagem': require('./controllers/GerarImagem'),
    'StatusJob': require('./controllers/StatusJob'),
    'RetomarJobs': require('./controllers/RetomarJobs'),
    'CotarGeracaoSimples': require('./controllers/CotarGeracaoSimples'),
    'GerarGeracaoSimples': require('./controllers/GerarGeracaoSimples'),
    // áudio: narração, falas, entonação, tratamento, legenda
    'GerarFalas': require('./controllers/GerarFalas'),
    'OuvirFala': require('./controllers/OuvirFala'),
    'GerarLegendas': require('./controllers/GerarLegendas'),
    'TestarPronuncia': require('./controllers/TestarPronuncia'),
    'MixarAudio': require('./controllers/MixarAudio'),
    // showrunner (etapas por IA) e memória da série — propostas só valem depois de aprovadas
    'ShowrunnerEtapa': require('./controllers/ShowrunnerEtapa'),
    'MemoriaContexto': require('./controllers/MemoriaContexto'),
    'MemoriaConsolidar': require('./controllers/MemoriaConsolidar'),
    'MemoriaVerificar': require('./controllers/MemoriaVerificar'),
    'MemoriaSemear': require('./controllers/MemoriaSemear'),
    // interface (Sala do showrunner, Custos, Geração simples)
    'SalvarBiblia': require('./controllers/SalvarBiblia'),
    // Mesa de decupagem / editor (edicao.json, regerar trecho, montar episódio)
    'LerEdicao': require('./controllers/LerEdicao'),
    'SalvarEdicao': require('./controllers/SalvarEdicao'),
    'DesfazerEdicao': require('./controllers/DesfazerEdicao'),
    'RefazerEdicao': require('./controllers/RefazerEdicao'),
    'EdicaoInicial': require('./controllers/EdicaoInicial'),
    'ExtrairQuadro': require('./controllers/ExtrairQuadro'),
    'CotarTrecho': require('./controllers/CotarTrecho'),
    'RegerarTrecho': require('./controllers/RegerarTrecho'),
    'RegerarFala': require('./controllers/RegerarFala'),
    'RegerarLegenda': require('./controllers/RegerarLegenda'),
    'RenderizarEpisodio': require('./controllers/RenderizarEpisodio'),
    // lixeira recuperável: apagar série/episódio e refazer o roteiro do zero (nada é destruído; ver docs/CONTRATOS.md)
    'ApagarSerie': require('./controllers/ApagarSerie'),
    'ApagarEpisodio': require('./controllers/ApagarEpisodio'),
    'RefazerRoteiro': require('./controllers/RefazerRoteiro'),
    'PreverApagar': require('./controllers/PreverApagar'),
    'RestaurarDaLixeira': require('./controllers/RestaurarDaLixeira'),
};
const controllersGet = {
    'Saude': require('./controllers/Saude'),
    'ListarSeries': require('./controllers/ListarSeries'),
    'LerSerie': require('./controllers/LerSerie'),
    'LerEpisodio': require('./controllers/LerEpisodio'),
    'CatalogoVideo': require('./controllers/CatalogoVideo'),
    'SaldoOpenRouter': require('./controllers/SaldoOpenRouter'),
    'IntencoesFala': require('./controllers/IntencoesFala'),
    'Midia': require('./controllers/Midia'),
    'MemoriaLer': require('./controllers/MemoriaLer'),
    'ListarCustos': require('./controllers/ListarCustos'),
    'ListarGeracoesSimples': require('./controllers/ListarGeracoesSimples'),
    'MidiaSimples': require('./controllers/MidiaSimples'),
    'LerEdicao': require('./controllers/LerEdicao'),
    'MiniaturasClipe': require('./controllers/MiniaturasClipe'),
    'OndaAudio': require('./controllers/OndaAudio'),
    'StatusRegeracao': require('./controllers/StatusRegeracao'),
    'StatusRender': require('./controllers/StatusRender'),
    // lixeira recuperável (só leitura)
    'PreverApagar': require('./controllers/PreverApagar'),
    'ListarLixeira': require('./controllers/ListarLixeira'),
};

Object.keys(controllers).forEach((rota) => routes.post(`/${rota}`, controllers[rota].REST));
Object.keys(controllersGet).forEach((rota) => routes.get(`/${rota}`, controllersGet[rota].REST));

module.exports = routes;
