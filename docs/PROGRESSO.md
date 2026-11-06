# Estúdio de Séries — estado do projeto e como continuar

Última atualização: **06/11/2026**. Este é o documento de entrada para retomar o projeto (pessoa ou IA). Leia nesta ordem: este arquivo → `CLAUDE.md` (regras) → `docs/INTERFACE.md` (telas e fluxo) → `docs/CONTRATOS.md` (arquivos e rotas).

---

## 1. O que é
App pessoal do Rafael para criar **minisséries verticais (9:16)** com IA pelo **OpenRouter**:
- o showrunner (IA de texto) escreve ideia → bíblia → roteiro;
- o elenco e os locais têm fichas com imagem de referência (mesmo rosto em todos os planos);
- a narração sai em português com vozes escolhidas (TTS grátis);
- o vídeo é gerado por plano em cima da narração;
- a Mesa edita e monta o episódio;
- a temporada tem 10 episódios com votação A/B do público.

**Stack:** Node.js 26 + Express (CommonJS) no backend · React 18 + Vite 5 em JSX no frontend · ffmpeg e Python (edge-tts, Piper) via o motor do `NarradorVideo` · testes `node --test` · **sem TypeScript, sem banco** (tudo em JSON no disco) · **sem git** neste projeto.

---

## 2. Como abrir e fechar
| Jeito | Como |
|---|---|
| Sem terminal | Duplo clique em **`Abrir Estudio.vbs`** (sobe backend + site escondidos e abre `http://127.0.0.1:5190`). Para fechar: **`Parar Estudio.vbs`**. Atalhos com ícone na Área de Trabalho: rodar `criar-atalho.ps1`. |
| Terminal | `npm run dev` (modo REAL: só gasta depois da confirmação na tela) · `npm run dev:simulado` (nada é cobrado) · `npm run parar` · `npm test` |
| Primeira vez numa máquina | `npm install` na raiz e em `frontend\` |

- **Portas:** backend `4190` (`PORTA`), site `5190` (`PORTA_WEB`). O site repassa `/api` ao backend.
- **Depois de mudar código do backend**, feche e abra o Estúdio. O site recarrega sozinho, o backend não.
- **Logs:** console em `logs\estudio-<data>.log`; histórico estruturado em `logs\registro-<data>.jsonl` (aba **Registro**; ver `docs/REGISTRO.md`).
- **Avast:** ele reassina o TLS. O `scripts/dev.js` já define `NODE_EXTRA_CA_CERTS=E:\AutoShortEditorDados\ferramentas\ca-com-avast.pem`.

---

## 3. Como produzir um episódio (o caminho na tela)
1. **Séries → Nova série**: título, gênero e a **ideia** (até 20 mil caracteres; pode colar um prompt inteiro). Para editar depois: Visão geral → card "Premissa" → Editar.
2. **Visão geral → Gerar bíblia e mapa** → leia a proposta → **Aprovar e salvar bíblia**. Isso grava premissa, regras, personagens e os 10 episódios, e cria as fichas de elenco e locais. Atalhos: "Ver prompt" (copiar e usar fora) e "Colar resposta de fora".
3. **Elenco e locais**:
   - **"Gerar imagens que faltam"** (uma cotação para tudo) ou "Gerar de novo" por ficha, depois de mudar a âncora;
   - em cada ficha: escolha a voz, clique em **Ouvir** e ajuste o tom (Edge em Hz, Piper em st);
   - **"Prompt e anexar"** para usar imagem feita em outra plataforma.
4. **Novo episódio**: duração livre (1–600 s; abaixo de 20 s fica sem votação). A duração pode ser mudada depois no selo "Duração" do episódio.
5. **Página do episódio**:
   - "Observações para o roteiro" → escrever o roteiro (confirmação de custo, teto US$ 0,05);
   - **"Pedir ajustes"** quantas vezes quiser;
   - "Propostas deste episódio" para comparar e escolher → Salvar → Aprovar.
6. **Próximo passo** (painel na página do episódio e no topo da Mesa):
   1. falas (TTS grátis);
   2. **decupar** (a IA escreve o pedido de vídeo de cada plano);
   3. quadros-chave (opcional);
   4. **"Gerar vídeo dos N planos"** (uma confirmação com o total) ou plano a plano, ou "Anexar vídeo gerado fora";
   5. **Montar**.
7. **Mesa**: ajustar tempos e trechos, "Regerar trecho" (pago, com cotação), "Regerar falas" quando uma voz mudar, montar.

**Sobre dinheiro:** NADA pago roda sem a tela de confirmação, que mostra o custo previsto. O servidor confere um token de cotação de uso único, válido por 10 min, e os tetos por plano, episódio e série (`serie.json → orcamento`).

---

## 4. O que está pronto (e como foi conferido)
| Área | O que tem | Conferido |
|---|---|---|
| Séries | pôsteres 9:16, "Continuar de onde parou", nova série com ideia longa, apagar (lixeira) | tela + VisualInspector 95 (A) |
| Sala | cabeçalho de cena; abas Visão geral / Temporada / Bíblia / Elenco e locais / Episódios; **etapas calculadas pelo estado real** (série + uma linha por episódio + "Próximo:") | tela + VisualInspector 90 (A) |
| Bíblia | proposta legível + **Aprovar e salvar** (cria fichas, nunca sobrescreve as suas); editar ideia | testes `aprovar-biblia.test.js` |
| Elenco e locais | fichas com imagem; lote "Gerar imagens que faltam"; "Gerar de novo" (a antiga fica como `<vista>-anterior-N`); voz com **Ouvir**; "Prompt e anexar" | 10 imagens reais geradas em 05/11 (US$ 0,67) + Farol refeito pela tela (US$ 0,074) |
| Roteiro | duração livre; piloto apresenta a protagonista; regra de nexo; cartões A/B e CTA falados; observações, ajustes, histórico de propostas, versões (`_versoes`) | testes + roteiros reais |
| Do roteiro ao vídeo | duração editável, aviso de voz mudada + "Regerar falas", **Próximo passo**, decupagem, **lote de vídeo** | 11 testes `producao.test.js` + lote simulado de 6 planos |
| Mesa | linha do tempo por personagem, miniatura que percorre os quadros, inspetor, regerar trecho, anexar vídeo de fora, montar | tela + VisualInspector 90 (A) |
| Geração paga | imagem (Nano Banana 2) e vídeo (Veo 3.1 Lite) com cotação + token, jobs retomáveis, livro de custos | Ep. 99 de teste (5 s, US$ 0,25) e imagens reais |
| Gerado fora | ver o prompt/pedido sem gastar e anexar/colar o que foi feito fora, em imagem, vídeo, quadro-chave, geração simples e etapas de texto | 7 testes `externo.test.js` |
| Modelos | trocar os modelos da série pelo catálogo do OpenRouter (Visão geral → Modelos → Trocar) | testes + tela |
| Áudio | TTS só com as vozes de `NarradorVideo\vozes.json`, intenções, tratamento −14 LUFS, legendas | episódios reais |
| Custos e saldo | saldo da chave, gasto por série e por mês, "Atualizar saldo" (topo e Custos) | tela |
| Registro | log de tudo (30 dias, sem chave), aba Registro com filtros | 14 testes |
| Lixeira e versões | apagar série/episódio vai para `_lixeira` (restaurável); versões do roteiro; a memória sai e volta junto | 33 testes |
| Visual | tema escuro, ícones (`icones.js`), movimento (`Movimento.jsx`); regras em `GUIA-VISUAL.md` | VisualInspector 90–96 (A) |
| GitHub Pages (híbrido) | `npm --prefix frontend run build:pages` gera um site que usa o Estúdio do PC | simulado; **não publicado** |

**Testes: 296 passando** (`npm test`). Build do frontend sem erro.

---

## 5. Estado atual dos dados (06/11/2026)
- **Série ativa:** `o-ultimo-farol-apocalipse` ("O Ultimo Farol Apocalipse").
  - Bíblia aprovada (Mara e Davi, 10 episódios no mapa).
  - Fichas com imagem: Mara e Davi (frente/perfil/corpo) e 6 locais. O Farol foi refeito com neblina e mistério.
- **Ep. 1 "A luz na costa":**
  - roteiro aprovado de 30 s, mas a **duração foi mudada para 60 s**: falta "Ajustar o roteiro para 60 s";
  - falas regeradas (Davi = Remy, alerta = Cadu);
  - **sem vídeo** e não montado.
- **Gasto da série:** US$ 0,91 (26 chamadas).
- **Chave do OpenRouter:** limite de US$ 10, restam ~US$ 3,50 (06/11). O limite é da chave: recarregar a conta não o aumenta; mude em openrouter.ai → Settings → Keys.
- **Lixeira:** a série antiga "O Último Farol" (com o Ep. 99 de teste de 5 s) e o Ep. 1 antigo da série nova. O vídeo do teste também está em `logs\ep99-teste-5s.mp4`.

---

## 6. Próximos passos (por ordem)
1. **Ep. 1 da série nova até o fim, pela tela:**
   - "Ajustar o roteiro para 60 s" → revisar → aprovar;
   - regerar falas;
   - decupar;
   - "Gerar vídeo dos N planos" (Veo 3.1 Lite ≈ US$ 0,24 por 8 s sem áudio; um episódio de 60 s fica em torno de US$ 2–3);
   - montar e assistir.

   É o primeiro teste real dos botões pagos de vídeo pela interface.
2. **Ajustes conhecidos ainda abertos:**
   - "Continuar de onde parou" (Séries) ainda calcula o progresso pelo campo antigo `serie.etapa`; use o mesmo cálculo de `sala/producaoUtil.js`;
   - o diálogo "Colar resposta de fora" mostra exemplo de roteiro também na decupagem;
   - sem decupagem não existe `planos.json`: os takes do lote ficam só em `mesa.json` e na edição, e "Montar de novo a partir do roteiro" tira esses takes da edição (eles continuam na lista);
   - `estado.json` da memória não volta sozinho ao apagar um episódio (só avisa).
3. **Porta 4190 e o site do Pages:** a 4190 está na lista de portas que o `fetch` bloqueia (o Node recusa; o Chrome provavelmente também). Antes de publicar o modo híbrido, teste no Chrome; se bloquear, troque a porta padrão do backend (ex.: 4290) em `scripts/dev.js`, `frontend/vite.config.js`, `frontend/.env.pages` e nos docs.
4. Publicar o modo híbrido no Pages, se quiser (`docs/PUBLICAR-NO-PAGES.md`). Hoje o site publicado é o do projeto irmão (abaixo).

---

## 7. Mapa do código
### Backend (`backend/src`)
| Pasta | O que faz |
|---|---|
| `index.js`, `routes.js` | Express (json 100 MB, CORS para a máquina e o Pages, log de requisições) e o mapa de rotas: `POST /<Rota>` e `GET /<Rota>`, também em `/api/<Rota>` |
| `controllers/` | ~80 rotas, uma por arquivo, exportando `.REST` (padrão do Rafael; erro = `{ Error }`) |
| `series/` | armazém em disco (`armazem.js`: travas, backup, validação, migração de vozes removidas), fichas, episódios, notas do roteiro, lixeira e versões, validação dos arquivos |
| `showrunner/` | etapas de IA (`etapas.js`), prompts (`prompts.js`), validação e consertos das respostas (`validar.js`), preços |
| `openrouter/` | cliente (só `https://openrouter.ai/api/v1`), catálogo de modelos, cotação + token, jobs de vídeo, imagem, texto, livro de custos, modo simulado |
| `memoria/` | memória da série (fatos, estado, resumos, glossário) e o contexto enviado à IA |
| `audio/` | falas (TTS via NarradorVideo), intenções, tratamento, legendas, troca de voz |
| `edicao/` | `edicao.json` (linha do tempo), regerar trecho, produção em lote, render com ffmpeg |
| `externo/` | ver pedido e anexar/colar o que foi gerado fora |
| `log/` | registro JSONL e leitor para a aba Registro |

### Frontend (`frontend/src/components`)
| Pasta/arquivo | Tela |
|---|---|
| `Series.jsx`, `TopMenu.jsx`, `Custos.jsx`, `Registro.jsx`, `GeracaoSimples.jsx`, `Lixeira.jsx`, `SemMotor.jsx` | páginas da casca |
| `SalaShowrunner.jsx` + `sala/*` | a Sala: Visão geral, Bíblia, Temporada, Elenco e locais, Episódios, roteiro, versões, duração, modelos, ideia, apagar |
| `mesa/*` | a Mesa (editor) |
| `producao/*` | Próximo passo, decupar, lote de vídeo, aviso de vozes |
| `subComponents/` | `icones.js` (mapa único de ícones), `Movimento.jsx` (animações), `Dialogo`, `ConfirmarCusto`, `PedidoExterno`, `PromptEtapa`, `GlobalVar` |
| `funcionalidades/` | `fetchFunc.js` (ponto único de acesso ao backend), `bancoGet.js` (uma função por rota), `motor.js` (motor híbrido do Pages) |

### Dados (`E:\EstudioSeriesDados`)
- `series\<id>\`:
  - `serie.json`, `biblia.json`, `custos.jsonl`, `jobs.json`;
  - `elenco\`, `locais\`, `objetos\` (ficha + `ref\` com imagens);
  - `memoria\`;
  - `episodios\epNN\`: `roteiro.json`, `notas.json`, `falas.json`, `audio\`, `planos.json`, `edicao.json`, `mesa.json`, `takes\`, `quadros\`, `saida\` e `_versoes\`.
- `_lixeira\`: o que foi apagado (restaurável).
- `catalogo\`: cache de 24 h dos modelos do OpenRouter.
- Formato completo em `docs/CONTRATOS.md`.

---

## 8. Regras que valem sempre (resumo do `CLAUDE.md`)
- Nada da Babita (nem código nem o conector "Memória Babita").
- A chave do OpenRouter só no ambiente do PC (`ASE_OPENROUTER_KEY`), nunca em arquivo, log ou resposta.
- Nada pago sem a confirmação com custo. Testes usam `fetch` falso ou o modo simulado.
- **Vozes:** só as de `NarradorVideo\vozes.json`, todas falando português.
  - Atuais: Florian (narrador), Thalita (mulher), Cadu (pt-BR nativo, alerta de rádio), William, Andrew, Remy, Giuseppe e Hyunsu.
  - O **Brian foi removido** em 06/11 a pedido (sotaque).
  - Amostras para ouvir em `logs\amostras-vozes`.
- Interface: tema escuro, sem "cara de IA" (sem degradê roxo, sem sparkles nem emoji).
- Português do Brasil em código, docs e telas.
- Não copiar código do StickEnglish nem do AutoShortEditor.

---

## 9. Projeto irmão: versão sem backend
- **Estúdio de Séries Web** (`E:\projects\ClaudeCode\ClaudCodeCodes\EstudioSeriesWeb`) roda inteiro no navegador, no PC e no celular.
- **No ar:** https://upraggy.github.io/EstudioSeriesWeb/ (código público em https://github.com/UPraggy/EstudioSeriesWeb).
- Entrada: `EstudioSeriesWeb\docs\PROGRESSO.md`.
- Ainda não testado lá: login no OpenRouter, geração paga e celular de verdade.
- Os dois projetos são separados: mudança aqui não vai para lá sozinha.

---

## 10. Lições aprendidas
- **Bíblia que não é salva vira roteiro sem nexo:** a IA inventa nomes, como a "Helena" no lugar da Mara. Sempre aprovar a bíblia antes do roteiro (agora há botão e aviso).
- **Modelos que "pensam" gastam tokens raciocinando.** O limite de resposta do roteiro cresce com a duração, e um corte gera nova tentativa sozinho com o dobro.
- O Veo 3.1 Lite levou ~17 min num clipe de 6 s. O `GerarVideo` devolve o id em `job.jobId`.
- **O Whisper não mede sotaque:** entendeu todas as vozes quase sem erro. Quem decide é o ouvido do Rafael.
- **Porta 4190 é "porta proibida" para `fetch`** (Node e navegadores). Scripts falam com o backend pela 5190.
- O radar do VisualInspector só conta animação CSS (`@keyframes`) como motion.
- O PowerShell 5.1 grava JSON com BOM: tire o `\uFEFF` antes de ler.
- O Vite do `Abrir Estudio.vbs` pode perder o esbuild depois de muitas edições seguidas: feche e abra de novo.
- **Arquivo de frontend salvo pela metade derruba o site inteiro**, porque o Vite recarrega na hora. Salve componentes sempre completos.

---

## 11. Mapa dos documentos
| Doc | Para quê |
|---|---|
| `PROGRESSO.md` | este: estado, como continuar, mapa |
| `../CLAUDE.md` | regras do projeto e como rodar |
| `../README.md` | como abrir, onde ficam as coisas, apagar/restaurar |
| `INTERFACE.md` | telas e fluxo (narração primeiro, do roteiro ao vídeo) |
| `CONTRATOS.md` | formato de todos os arquivos e rotas (inclui lixeira, notas, modelos, gerado fora, produção) |
| `GUIA-VISUAL.md` | tema escuro, ícones, movimento, o que é proibido |
| `MEMORIA.md` | memória da série e o contexto enviado à IA |
| `AUDIO.md` | vozes, intenções, tratamento e legendas |
| `REGISTRO.md` | o log/histórico |
| `PROMPT-MESTRE-1.md` | o prompt do showrunner |
| `PESQUISA-2026-11-04.md` | modelos, preços e repositórios pesquisados |
| `PUBLICAR-SEM-BACKEND.md` | estudo de rodar sem backend (PC e celular) |
| `PUBLICAR-NO-PAGES.md` | publicar o modo híbrido no GitHub Pages |
