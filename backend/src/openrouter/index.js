// Cliente OpenRouter do Estúdio de Séries — ponto de entrada para os outros módulos.
//
// Uso típico (showrunner / séries):
//   const or = require('../openrouter');
//   const ctx = await or.obterContexto({ serie: 'o-ultimo-farol' });
//   const { dados } = await or.completarJSON({ modelo, sistema, prompt, schema }, ctx);
//   const cot = await or.cotarVideo(pedido, ctx);              // custo + teto (sem gastar)
//   const r = await or.gerarVideo(pedido, ctx);                // abre o job (só depois do clique de confirmação)
//
// Para a interface, use os controllers (CotarGeracao → token → GerarVideo/GerarImagem), que exigem o token.
// O núcleo de séries pode plugar o livro de custos dele com definirFabricaLivro(fn).
const ambiente = require('./ambiente');
const erros = require('./erros');
const { criarCliente } = require('./cliente');
const { criarClienteSimulado, exemploDoSchema } = require('./simulado');
const catalogo = require('./catalogo');
const orcamento = require('./orcamento');
const { criarJobs } = require('./jobs');
const livro = require('./livro');
const video = require('./video');
const imagem = require('./imagem');
const texto = require('./texto');
const contexto = require('./contexto');

module.exports = {
    ...erros,
    modoSimulado: ambiente.modoSimulado,
    temChave: ambiente.temChave,
    raizDados: ambiente.raizDados,
    criarCliente,
    criarClienteSimulado,
    exemploDoSchema,
    catalogo,
    precoVideo: catalogo.precoVideo,
    orcamento,
    verificarOrcamento: orcamento.verificar,
    criarConfirmador: orcamento.criarConfirmador,
    criarJobs,
    criarLivroJsonl: livro.criarLivroJsonl,
    definirFabricaLivro: livro.definirFabricaLivro,
    obterContexto: contexto.obterContexto,
    cotarVideo: video.cotarVideo,
    gerarVideo: video.gerarVideo,
    cotarImagem: imagem.cotarImagem,
    gerarImagem: imagem.gerarImagem,
    completarJSON: texto.completarJSON,
};
