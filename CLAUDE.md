# CLAUDE.md — Estúdio de Séries Web

Projeto pessoal do Rafael: sistema para criar **séries** de vídeos verticais (9:16, episódios de **duração livre** — padrão 60 s com escolhas A/B; abaixo de 20 s sem votação) usando IA pelo OpenRouter. Plano completo: `E:\projects\ClaudeCode\ClaudCodeCodes\NarradorVideo\docs\PLANO-ESTUDIO-DE-SERIES.md`. Contratos de dados: `docs/CONTRATOS.md`.

**Esta pasta (`EstudioSeriesWeb`) é a versão que roda sem backend** (GitHub Pages, PC e celular), copiada do `EstudioSeries` em 05/11/2026. O `EstudioSeries` original segue separado. Entrar por `docs/PROGRESSO.md` e `docs/MOTOR-NAVEGADOR.md`.

## Regras
- **Nada da Babita**: nem código, nem dados, nem o conector Memória Babita (ferramentas `mcp__d8fcf5b5…`). Diretriz do Rafael.
- Stack: **Node.js + Express (CommonJS, `require`)** no backend; **React + Vite em JSX** no frontend (depois que a maquete for aprovada). **Sem TypeScript.** Testes com `node --test`. Dependências mínimas.
- Padrão do Rafael no backend: `backend/src/index.js` (Express, json 100mb, cors), `backend/src/routes.js` mapeia controllers; cada controller em `backend/src/controllers/NomeRota.js` exporta `.REST` assíncrono e responde `{ Error: "..." }` em falha.
- Nomes em português, camelCase para funções/variáveis, PascalCase para controllers.
- **Chave do OpenRouter** só no ambiente do servidor (`ASE_OPENROUTER_KEY` ou `OPENROUTER_API_KEY`). Nunca em arquivo, log, resposta HTTP ou commit.
- **Dinheiro:** nenhuma chamada paga (imagem, vídeo) sem confirmação explícita do Rafael; custo previsto antes; teto por plano/episódio/série; job gravado logo após criado (nunca pagar 2x). Testes usam `fetch` falso. Chamadas GET gratuitas (catálogo, saldo) são permitidas.
- **Dados das séries fora do repositório:** `ESTUDIO_DADOS` (padrão `E:\EstudioSeriesDados`). Uma pasta por série (ver CONTRATOS).
- Montagem de vídeo, TTS e títulos: usar o motor Python existente do NarradorVideo (`E:\projects\ClaudeCode\ClaudCodeCodes\NarradorVideo\narrar.ps1`) por subprocesso; só as vozes de `NarradorVideo\vozes.json`, todas em português.
- **Não copiar código** do StickEnglish nem do AutoShortEditor (só ideias). Repositórios de terceiros: só ideias.
- Idioma: português do Brasil em código, docs e mensagens.
- **Git:** repositório próprio (branch `main`). Autor só o Rafael (`git config user.email` = `100146657+UPraggy@users.noreply.github.com`), **nunca** co-autor Claude/IA; o gancho `.githooks/commit-msg` recusa (`git config core.hooksPath .githooks` numa cópia nova). Doc em `docs/` se commita na hora; antes de cada push, `git grep -n "sk-or-"` só pode achar a chave falsa dos testes e o filtro de `erros.js`.
- **Motor do navegador:** o código do backend também roda no navegador (empacotado pelo esbuild, `frontend/vite-plugin-motor.js`). Por isso: nada de dependência nova de Node no backend sem substituto em `frontend/src/motorNavegador/`; `fs` síncrono só em arquivos de texto (JSON, JSONL, MD, SRT, ASS); o resto pelo `fs/promises`.
- Interface: **tema escuro**, ícones pelo mapa `icones.js`, movimento por `Movimento.jsx`, moderna e vendável mas sem "cara de IA" — regras em `docs/GUIA-VISUAL.md` (substitui o guia claro das maquetes).

## Como rodar
- **Sem terminal:** duplo clique em `Abrir Estudio.vbs` (sobe backend + frontend escondidos e abre http://127.0.0.1:5190); `Parar Estudio.vbs` para. `criar-atalho.ps1` cria os dois atalhos com ícone na Área de Trabalho. Log em `logs\estudio-<data>.log`.
- `npm run dev` (modo REAL: gerações pagas só com confirmação na tela) · `npm run dev:simulado` (sem gasto) · `npm run parar`. Portas: `PORTA` (4190) e `PORTA_WEB` (5190).
- Agentes testando: use o `.claude\launch.json` (o backend sobe SIMULADO) ou `npm run dev:simulado`.
- `npm install` (raiz e `frontend\`) · `npm test` · `npm start` (só o backend, porta 4190)
- Site do GitHub Pages (motor híbrido: usa o Estúdio do PC em 127.0.0.1:4190): `npm --prefix frontend run build:pages` e `preview:pages` (porta 5196). Todo acesso ao backend passa por `GlobalVar.serverBase` (trocado em `funcionalidades/motor.js`): nunca escreva `/api` fixo numa tela. Ver `docs/PUBLICAR-NO-PAGES.md`.
- Avast reassina o TLS: se `npm install` ou `fetch` falharem com certificado, use `NODE_EXTRA_CA_CERTS=E:\AutoShortEditorDados\ferramentas\ca-com-avast.pem`.
