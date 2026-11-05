// Controllers da Mesa (o routes.js registra estes nomes: POST /<Nome> e GET /<Nome>).
// Mesma lista que vai no routes.js; serve também ao servidor de verificação da Mesa.
const post = {
    LerEdicao: require('../controllers/LerEdicao'),
    SalvarEdicao: require('../controllers/SalvarEdicao'),
    DesfazerEdicao: require('../controllers/DesfazerEdicao'),
    RefazerEdicao: require('../controllers/RefazerEdicao'),
    EdicaoInicial: require('../controllers/EdicaoInicial'),
    ExtrairQuadro: require('../controllers/ExtrairQuadro'),
    CotarTrecho: require('../controllers/CotarTrecho'),
    RegerarTrecho: require('../controllers/RegerarTrecho'),
    RegerarFala: require('../controllers/RegerarFala'),
    RegerarLegenda: require('../controllers/RegerarLegenda'),
    RenderizarEpisodio: require('../controllers/RenderizarEpisodio'),
};
const get = {
    LerEdicao: require('../controllers/LerEdicao'),
    MiniaturasClipe: require('../controllers/MiniaturasClipe'),
    OndaAudio: require('../controllers/OndaAudio'),
    StatusRegeracao: require('../controllers/StatusRegeracao'),
    StatusRender: require('../controllers/StatusRender'),
};

// Registra num Router/app do Express (as mesmas rotas que o routes.js teria).
function registrar(router) {
    Object.keys(post).forEach((r) => router.post(`/${r}`, post[r].REST));
    Object.keys(get).forEach((r) => router.get(`/${r}`, get[r].REST));
    return router;
}

module.exports = { post, get, registrar };
