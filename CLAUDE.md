# CLAUDE.md — Estúdio de Séries

Projeto pessoal do Rafael: sistema para criar **séries** de vídeos verticais (9:16, episódios de **duração livre** — padrão 60 s com escolhas A/B; abaixo de 20 s sem votação) usando IA pelo OpenRouter. **Entrar por `docs/PROGRESSO.md`** (estado atual, pendências, mapa dos docs). Plano completo: `E:\projects\ClaudeCode\ClaudCodeCodes\NarradorVideo\docs\PLANO-ESTUDIO-DE-SERIES.md`. Contratos de dados: `docs/CONTRATOS.md`. Versão sem backend: projeto irmão `..\EstudioSeriesWeb` (não mexer nele daqui).

## Regras
- **Nada da Babita**: nem código, nem dados, nem o conector Memória Babita (ferramentas `mcp__d8fcf5b5…`). Diretriz do Rafael.
- Stack: **Node.js + Express (CommonJS, `require`)** no backend; **React + Vite em JSX** no frontend (depois que a maquete for aprovada). **Sem TypeScript.** Testes com `node --test`. Dependências mínimas.
- Padrão do Rafael no backend: `backend/src/index.js` (Express, json 100mb, cors), `backend/src/routes.js` mapeia controllers; cada controller em `backend/src/controllers/NomeRota.js` exporta `.REST` assíncrono e responde `{ Error: "..." }` em falha.
- Nomes em português, camelCase para funções/variáveis, PascalCase para controllers.
- **Chave do OpenRouter** só no ambiente do servidor (`ASE_OPENROUTER_KEY` ou `OPENROUTER_API_KEY`). Nunca em arquivo, log, resposta HTTP ou commit.
- **Dinheiro:** nenhuma chamada paga (imagem, vídeo) sem confirmação explícita do Rafael; custo previsto antes; teto por plano/episódio/série; job gravado logo após criado (nunca pagar 2x). Testes usam `fetch` falso. Chamadas GET gratuitas (catálogo, saldo) são permitidas.
- **Dados das séries fora do repositório:** `ESTUDIO_DADOS` (padrão `E:\EstudioSeriesDados`). Uma pasta por série (ver CONTRATOS).
- Montagem de vídeo, TTS e títulos: usar o motor Python existente do NarradorVideo (`E:\projects\ClaudeCode\ClaudCodeCodes\NarradorVideo\narrar.ps1`) por subprocesso; só as vozes de `NarradorVideo\vozes.json`, todas em português. O Rafael NÃO quer voz com sotaque carregado: o Brian foi removido em 06/11/2026 (alerta = Cadu); se ele reclamar de outra, tire da lista e acrescente em `VOZES_REMOVIDAS` (`backend/src/series/armazem.js`).
- Backend mudou → o Estúdio precisa ser fechado e aberto (o site recarrega sozinho, o backend não). Arquivo de frontend salvo pela metade derruba o site do Rafael na hora: salve componentes completos.
- Scripts que falam com o backend usam a porta 5190 (a 4190 é "porta proibida" para `fetch` no Node).
- **Não copiar código** do StickEnglish nem do AutoShortEditor (só ideias). Repositórios de terceiros: só ideias.
- Idioma: português do Brasil em código, docs e mensagens.
- Sem git por enquanto: não fazer commit.
- Interface: **tema escuro**, ícones pelo mapa `icones.js`, movimento por `Movimento.jsx`, moderna e vendável mas sem "cara de IA" — regras em `docs/GUIA-VISUAL.md` (substitui o guia claro das maquetes).

## Como rodar
- **Sem terminal:** duplo clique em `Abrir Estudio.vbs` (sobe backend + frontend escondidos e abre http://127.0.0.1:5190); `Parar Estudio.vbs` para. `criar-atalho.ps1` cria os dois atalhos com ícone na Área de Trabalho. Log em `logs\estudio-<data>.log`.
- `npm run dev` (modo REAL: gerações pagas só com confirmação na tela) · `npm run dev:simulado` (sem gasto) · `npm run parar`. Portas: `PORTA` (4190) e `PORTA_WEB` (5190).
- Agentes testando: use o `.claude\launch.json` (o backend sobe SIMULADO) ou `npm run dev:simulado`.
- `npm install` (raiz e `frontend\`) · `npm test` · `npm start` (só o backend, porta 4190)
- Site do GitHub Pages (motor híbrido: usa o Estúdio do PC em 127.0.0.1:4190): `npm --prefix frontend run build:pages` e `preview:pages` (porta 5196). Todo acesso ao backend passa por `GlobalVar.serverBase` (trocado em `funcionalidades/motor.js`): nunca escreva `/api` fixo numa tela. Ver `docs/PUBLICAR-NO-PAGES.md`.
- Avast reassina o TLS: se `npm install` ou `fetch` falharem com certificado, use `NODE_EXTRA_CA_CERTS=E:\AutoShortEditorDados\ferramentas\ca-com-avast.pem`.
