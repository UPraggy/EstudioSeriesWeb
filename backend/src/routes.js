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
    'SalvarModelos': require('./controllers/SalvarModelos'),
    'CotarQuadrosChave': require('./controllers/CotarQuadrosChave'),
    'GerarQuadrosChave': require('./controllers/GerarQuadrosChave'),
    'AprovarBiblia': require('./controllers/AprovarBiblia'),
    'SalvarIdeiaSerie': require('./controllers/SalvarIdeiaSerie'),
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
    // lixeira recuperável: apagar série/episódio, refazer o roteiro do zero e voltar a uma versão dele (nada é destruído; ver docs/CONTRATOS.md)
    'ApagarSerie': require('./controllers/ApagarSerie'),
    'ApagarEpisodio': require('./controllers/ApagarEpisodio'),
    'RefazerRoteiro': require('./controllers/RefazerRoteiro'),
    'PreverApagar': require('./controllers/PreverApagar'),
    'RestaurarDaLixeira': require('./controllers/RestaurarDaLixeira'),
    'RestaurarVersaoRoteiro': require('./controllers/RestaurarVersaoRoteiro'),
    'ListarVersoesRoteiro': require('./controllers/ListarVersoesRoteiro'),
    // notas do roteiro por episódio: observações + histórico de propostas (episodios/epNN/notas.json)
    'SalvarNotasEpisodio': require('./controllers/SalvarNotasEpisodio'),
    'LerNotasEpisodio': require('./controllers/LerNotasEpisodio'),
    // gerado fora (outra plataforma): ver o pedido/prompt sem gastar e anexar o resultado com custo 0 (docs/CONTRATOS.md)
    'VerPedidoGeracao': require('./controllers/VerPedidoGeracao'),
    'AnexarImagemFicha': require('./controllers/AnexarImagemFicha'),
    'AnexarQuadroChave': require('./controllers/AnexarQuadroChave'),
    'VerPromptEtapa': require('./controllers/VerPromptEtapa'),
    'ProporResultadoExterno': require('./controllers/ProporResultadoExterno'),
    // do roteiro ao vídeo (06/11/2026): duração do episódio, falas com a voz nova, decupagem salva, vídeo dos planos em lote
    'AlterarDuracaoEpisodio': require('./controllers/AlterarDuracaoEpisodio'),
    'ConferirVozesFalas': require('./controllers/ConferirVozesFalas'),
    'RegerarFalasVoz': require('./controllers/RegerarFalasVoz'),
    'EstadoProducao': require('./controllers/EstadoProducao'),
    'SalvarDecupagem': require('./controllers/SalvarDecupagem'),
    'CotarVideoPlanos': require('./controllers/CotarVideoPlanos'),
    'GerarVideoPlanos': require('./controllers/GerarVideoPlanos'),
};
const controllersGet = {
    'Saude': require('./controllers/Saude'),
    'ListarSeries': require('./controllers/ListarSeries'),
    'LerSerie': require('./controllers/LerSerie'),
    'LerEpisodio': require('./controllers/LerEpisodio'),
    'CatalogoVideo': require('./controllers/CatalogoVideo'),
    'CatalogoModelos': require('./controllers/CatalogoModelos'),
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
    'ListarVersoesRoteiro': require('./controllers/ListarVersoesRoteiro'),
    // registro (log/histórico de como o Estúdio está rodando; ver docs/REGISTRO.md)
    'Registro': require('./controllers/Registro'),
    'RegistroResumo': require('./controllers/RegistroResumo'),
    // notas do roteiro por episódio (só leitura)
    'LerNotasEpisodio': require('./controllers/LerNotasEpisodio'),
    // do roteiro ao vídeo (só leitura)
    'ConferirVozesFalas': require('./controllers/ConferirVozesFalas'),
    'EstadoProducao': require('./controllers/EstadoProducao'),
};

Object.keys(controllers).forEach((rota) => routes.post(`/${rota}`, controllers[rota].REST));
Object.keys(controllersGet).forEach((rota) => routes.get(`/${rota}`, controllersGet[rota].REST));

// AnexarVideoTrecho aceita JSON (base64) ou o corpo binário do vídeo (até 300 MB, metadados na query).
routes.post('/AnexarVideoTrecho', require('express').raw({ type: ['application/octet-stream', 'video/*'], limit: '300mb' }), require('./controllers/AnexarVideoTrecho').REST);

module.exports = routes;
