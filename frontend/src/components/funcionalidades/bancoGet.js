// Uma função por rota do backend (padrão do Rafael). Rotas novas entram aqui.
import { fetchGet, fetchPost } from './fetchFunc';
import { fetchBinario } from './fetchFunc';

export const Saude = () => fetchGet('/Saude');
export const ListarSeries = () => fetchGet('/ListarSeries');
export const LerSerie = ({ id }) => fetchGet('/LerSerie', { id });
export const CriarSerie = ({ titulo, genero, ideia }) => fetchPost('/CriarSerie', { titulo, genero, ideia });
export const LerEpisodio = ({ id, serie, n }) => fetchGet('/LerEpisodio', { serie: serie || id, n }); // o controller lê "serie"
export const SalvarFicha = (dados) => fetchPost('/SalvarFicha', dados);
export const DefinirCanonica = (dados) => fetchPost('/DefinirCanonica', dados);
export const SalvarRoteiro = (dados) => fetchPost('/SalvarRoteiro', dados);
// Episódio novo com duração livre (s). n opcional (próximo número). semEscolha: sem votação A/B (padrão: < 20 s).
export const CriarEpisodio = ({ serie, n, titulo, duracaoAlvoS, semEscolha }) => fetchPost('/CriarEpisodio', { serie, n, titulo, duracaoAlvoS, semEscolha });
export const RegistrarVotacao = (dados) => fetchPost('/RegistrarVotacao', dados);

// ---- Sala do showrunner, Geração simples e Custos ----
export const AdicionarReferencia = (dados) => fetchPost('/AdicionarReferencia', dados);
export const IntencoesFala = () => fetchGet('/IntencoesFala');
export const SaldoOpenRouter = () => fetchGet('/SaldoOpenRouter');
export const CatalogoVideo = () => fetchGet('/CatalogoVideo');
// Dinheiro em 2 passos: cotar devolve { custoPrevistoUsd, token }; gerar só roda com o token do mesmo pedido.
export const CotarGeracao = ({ tipo, serie, pedido }) => fetchPost('/CotarGeracao', { tipo, serie, pedido });
export const GerarImagem = ({ serie, pedido, token }) => fetchPost('/GerarImagem', { serie, pedido, token });
export const GerarVideo = ({ serie, pedido, token }) => fetchPost('/GerarVideo', { serie, pedido, token });
export const StatusJob = ({ jobId, serie }) => fetchPost('/StatusJob', { jobId, serie });
export const CotarGeracaoSimples = (dados) => fetchPost('/CotarGeracaoSimples', dados);
export const GerarGeracaoSimples = ({ id, token }) => fetchPost('/GerarGeracaoSimples', { id, token });
// Controllers novos da interface (SalvarBiblia, ListarCustos, ListarGeracoesSimples, MidiaSimples).
export const SalvarBiblia = ({ serie, campos }) => fetchPost('/SalvarBiblia', { serie, campos });
export const ListarCustos = ({ serie } = {}) => fetchGet('/ListarCustos', serie ? { serie } : undefined);
export const ListarGeracoesSimples = () => fetchGet('/ListarGeracoesSimples');
// Showrunner (IA) e memória: a proposta volta para aprovação, nada é gravado sozinho.
export const ExecutarEtapa = ({ etapa, serieId, contexto = {}, tetoUsd }) => fetchPost('/ShowrunnerEtapa', { etapa, serieId, contexto, tetoUsd });
export const ProporMemoria = ({ serieId, ep }) => fetchPost('/MemoriaConsolidar', { serieId, ep });

// Rota ainda não registrada no backend (o Express devolve 404 sem JSON).
export const rotaIndisponivel = (r) => Boolean(r && r['ERROR SERVER'] === 'HTTP 404');

// ---- Mesa de decupagem / editor (backend/src/edicao) ----
export const LerEdicao = ({ serie, ep }) => fetchGet('/LerEdicao', { serie, ep });
export const SalvarEdicao = ({ serie, ep, edicao, revisaoBase }) => fetchPost('/SalvarEdicao', { serie, ep, edicao, revisaoBase });
export const DesfazerEdicao = ({ serie, ep }) => fetchPost('/DesfazerEdicao', { serie, ep });
export const RefazerEdicao = ({ serie, ep }) => fetchPost('/RefazerEdicao', { serie, ep });
export const EdicaoInicial = ({ serie, ep, gerarFalas = false, forcar = false }) => fetchPost('/EdicaoInicial', { serie, ep, gerarFalas, forcar });
export const MiniaturasClipe = ({ serie, caminho, n, altura }) => fetchGet('/MiniaturasClipe', { serie, caminho, ...(n ? { n } : {}), ...(altura ? { altura } : {}) });
export const OndaAudio = ({ serie, caminho }) => fetchGet('/OndaAudio', { serie, caminho });
export const ExtrairQuadro = ({ serie, caminho, tS, largura }) => fetchPost('/ExtrairQuadro', { serie, caminho, tS, largura });
// Regerar só um trecho: cotar (custo + token, não gasta) → confirmar com o token → acompanhar.
export const CotarTrecho = ({ serie, ep, deS, ateS, instrucao, modelo }) => fetchPost('/CotarTrecho', { serie, ep, deS, ateS, instrucao, modelo });
export const RegerarTrecho = ({ serie, ep, confirmacoes }) => fetchPost('/RegerarTrecho', { serie, ep, confirmacoes });
export const StatusRegeracao = ({ serie, ep }) => fetchGet('/StatusRegeracao', { serie, ep });
export const RegerarFala = (dados) => fetchPost('/RegerarFala', dados);
export const RegerarLegenda = ({ serie, ep, deS, ateS }) => fetchPost('/RegerarLegenda', { serie, ep, deS, ateS });
export const RenderizarEpisodio = ({ serie, ep, motor }) => fetchPost('/RenderizarEpisodio', { serie, ep, motor });
export const StatusRender = ({ serie, ep }) => fetchGet('/StatusRender', { serie, ep });

// ---- Lixeira recuperável: "apagar" nunca destrói (vai para <dados>\_lixeira; o roteiro velho vai para _versoes) ----
// Antes de apagar/refazer: o que vai junto, takes pagos, gasto e o que impede agora (só leitura).
export const PreverApagar = ({ serie, ep, acao, apagarDerivados }) => fetchGet('/PreverApagar', {
    serie, ...(ep !== undefined && ep !== null ? { ep } : {}), ...(acao ? { acao } : {}), ...(apagarDerivados !== undefined ? { apagarDerivados } : {}),
});
// Só apaga se "confirmacao" for exatamente o título da série.
export const ApagarSerie = ({ serie, confirmacao }) => fetchPost('/ApagarSerie', { serie, confirmacao });
export const ApagarEpisodio = ({ serie, ep }) => fetchPost('/ApagarEpisodio', { serie, ep });
// Guarda o roteiro (e os derivados) em episodios/epNN/_versoes/<data>/; takes pagos ficam. Não chama a IA.
export const RefazerRoteiro = ({ serie, ep, duracaoAlvoS, semEscolha, apagarDerivados = true }) => fetchPost('/RefazerRoteiro', { serie, ep, duracaoAlvoS, semEscolha, apagarDerivados });
export const ListarLixeira = () => fetchGet('/ListarLixeira');
export const RestaurarDaLixeira = ({ item }) => fetchPost('/RestaurarDaLixeira', { item });
// Versões do roteiro (episodios\epNN\_versoes): listar é só leitura; voltar guarda antes a versão atual.
export const ListarVersoesRoteiro = ({ serie, ep }) => fetchGet('/ListarVersoesRoteiro', { serie, ep });
export const RestaurarVersaoRoteiro = ({ serie, ep, versao }) => fetchPost('/RestaurarVersaoRoteiro', { serie, ep, versao });
// ---- Modelos da série (tudo pelo OpenRouter): catálogo por papel e troca ----
export const CatalogoModelos = ({ forcar } = {}) => fetchGet('/CatalogoModelos', forcar ? { forcar: '1' } : undefined);
export const SalvarModelos = ({ serie, modelos }) => fetchPost('/SalvarModelos', { serie, modelos });
// ---- Registro (log): histórico de como o Estúdio está rodando (logs/registro-AAAA-MM-DD.jsonl) ----
// filtros: dia (AAAA-MM-DD), nivel/area/serie (vários separados por vírgula), busca, limite, antesDe (paginação).
export const Registro = (filtros = {}) => fetchGet('/Registro', Object.fromEntries(Object.entries(filtros).filter(([, v]) => v !== undefined && v !== null && v !== '')));
export const RegistroResumo = ({ dias = 7 } = {}) => fetchGet('/RegistroResumo', { dias });
// ---- Notas do roteiro por episódio: observações (antes de gerar) + histórico de propostas (episodios/epNN/notas.json) ----
export const LerNotasEpisodio = ({ serie, ep }) => fetchGet('/LerNotasEpisodio', { serie, ep });
export const SalvarNotasEpisodio = ({ serie, ep, observacoes }) => fetchPost('/SalvarNotasEpisodio', { serie, ep, observacoes });
// ---- Bíblia aprovada e ideia da série ----
export const AprovarBiblia = ({ serie, proposta }) => fetchPost('/AprovarBiblia', { serie, proposta });
export const SalvarIdeiaSerie = ({ serie, ideia }) => fetchPost('/SalvarIdeiaSerie', { serie, ideia });
// ---- Gerado fora (outra plataforma): ver o pedido/prompt SEM gastar e anexar o resultado com custo 0 ----
export const VerPedidoGeracao = ({ tipo, serie, pedido }) => fetchPost('/VerPedidoGeracao', { tipo, serie, pedido });
export const AnexarImagemFicha = ({ serie, tipo, id, estado, vista, arquivo }) => fetchPost('/AnexarImagemFicha', { serie, tipo, id, estado, vista, arquivo });
export const AnexarQuadroChave = ({ serie, ep, plano, arquivo }) => fetchPost('/AnexarQuadroChave', { serie, ep, plano, arquivo });
// Vídeo vai como corpo binário (até 300 MB); trecho por deS/ateS ou o plano inteiro.
export const AnexarVideoTrecho = ({ serie, ep, deS, ateS, plano, instrucao, aplicar = true, arquivo }) => fetchBinario('/AnexarVideoTrecho', Object.fromEntries(Object.entries({
    serie, ep, deS, ateS, plano, instrucao, aplicar: aplicar ? '1' : 'false', nome: arquivo && arquivo.name,
}).filter(([, v]) => v !== undefined && v !== null && v !== '')), arquivo, (arquivo && arquivo.type) || 'application/octet-stream');
export const VerPromptEtapa = ({ etapa, serieId, contexto = {} }) => fetchPost('/VerPromptEtapa', { etapa, serieId, contexto });
export const ProporResultadoExterno = ({ etapa, serieId, contexto = {}, texto }) => fetchPost('/ProporResultadoExterno', { etapa, serieId, contexto, texto });
// ---- Do roteiro ao vídeo (06/11/2026): duração do episódio, voz nova nas falas, estado das etapas, decupagem e vídeo dos planos ----
export const AlterarDuracaoEpisodio = ({ serie, ep, duracaoAlvoS, semEscolha }) => fetchPost('/AlterarDuracaoEpisodio', { serie, ep, duracaoAlvoS, ...(semEscolha !== undefined ? { semEscolha } : {}) });
export const ConferirVozesFalas = ({ serie, ep }) => fetchGet('/ConferirVozesFalas', { serie, ep });
// TTS grátis: regera as falas com a voz/tom atuais (quem = só esse personagem). A edição troca só as falas (Ctrl+Z desfaz).
export const RegerarFalasVoz = ({ serie, ep, quem }) => fetchPost('/RegerarFalasVoz', { serie, ep, ...(quem ? { quem } : {}) });
export const EstadoProducao = ({ serie, ep }) => fetchGet('/EstadoProducao', { serie, ep });
export const SalvarDecupagem = ({ serie, ep, decupagem }) => fetchPost('/SalvarDecupagem', { serie, ep, decupagem });
// Vídeo dos planos em lote: cotar (grátis, um token por plano) → gerar com os tokens → acompanhar por StatusRegeracao.
export const CotarVideoPlanos = ({ serie, ep, planos, modelo }) => fetchPost('/CotarVideoPlanos', { serie, ep, ...(planos ? { planos } : {}), ...(modelo ? { modelo } : {}) });
export const GerarVideoPlanos = ({ serie, ep, confirmacoes }) => fetchPost('/GerarVideoPlanos', { serie, ep, confirmacoes });
// ---- Quadros-chave em lote (uma imagem por plano a partir das fichas; o vídeo começa nela) ----
export const CotarQuadrosChave = ({ serie, ep, planos }) => fetchPost('/CotarQuadrosChave', { serie, ep, planos });
export const GerarQuadrosChave = ({ serie, ep, confirmacoes }) => fetchPost('/GerarQuadrosChave', { serie, ep, confirmacoes });
