# Motor do navegador (o Estúdio sem backend)

Etapas 1 a 4 de `docs/PUBLICAR-SEM-BACKEND.md`, feitas em 05/11/2026. O site publicado (GitHub Pages) roda **sozinho no navegador**, no PC e no celular. Não há servidor: o próprio código do backend roda dentro da aba.

## Em uma frase
O esbuild empacota os controllers do backend (`backend/src`, CommonJS) para o navegador e troca `fs`, `path`, `crypto`, `os`, `stream` e `child_process` por versões do navegador. O `fs` vira um **sistema de arquivos virtual** que guarda as séries no **OPFS** (pasta interna do site), no **IndexedDB** (plano B do Safari) ou numa **pasta real do computador** escolhida pelo usuário.

Por que assim, e não reescrever o backend em ESM (como o plano sugeria): uma fonte de verdade só. A regra de dinheiro (cotação → token → gerar, tetos, livro de custos, job gravado antes de esperar) é **o mesmo código** testado pelos 250 testes do backend. Nada foi copiado e adaptado à mão.

## Peças

| Arquivo | O que faz |
|---|---|
| `frontend/vite-plugin-motor.js` | Plugin do Vite: entrega o módulo `virtual:motor-navegador`, que é o esbuild empacotando `src/motorNavegador/entrada.js` + `backend/src`. Troca os módulos do Node pelos de `ponte/`, injeta `process` e `Buffer` próprios, define `__dirname` por arquivo e embute `backend/src/openrouter/amostras` (modo simulado). Também usado pelo teste de ponta a ponta. |
| `frontend/src/motorNavegador/entrada.js` | Entrada do pacote. `iniciar({ armazem })`, `chamar(metodo, rota, { query, body })` (req/res falsos com a cara do Express), `lerMidia(rota, query)` (mesmas travas de caminho do backend), `definirChave`, `definirSimulado`, `ROTAS_SO_NO_PC`. Só responde depois que tudo foi gravado no armazém. |
| `frontend/src/motorNavegador/vfs.js` | Sistema de arquivos virtual. Índice inteiro + conteúdo dos arquivos pequenos na memória (leitura síncrona funciona); arquivos grandes ficam "preguiçosos" (só o tamanho). Toda escrita muda a memória na hora e entra numa fila que grava no armazém na mesma ordem; `liberar()` espera a fila. Erros de gravação não somem: voltam no `liberar()` e viram erro na resposta. |
| `frontend/src/motorNavegador/armazens.js` | Armazéns: `armazemDiretorio` (OPFS e pasta real, mesma API do File System Access), `armazemIndexedDB` (plano B), `armazemMemoria` (testes). Também guarda a pasta escolhida no IndexedDB. |
| `frontend/src/motorNavegador/buffer.js`, `caminho.js`, `cripto.js` | `Buffer`, `path` POSIX e `crypto` síncrono (SHA-1, SHA-256, HMAC). Testados contra o Node em `backend/test/navegador-shims.test.js`. |
| `frontend/src/motorNavegador/ponte/*.cjs` | O que o backend recebe no lugar de `require('fs')`, `require('path')`... `child_process` lança um erro claro ("precisa do Estúdio do PC"). |
| `frontend/src/motorNavegador/estado.js` | Peças únicas: o sistema de arquivos virtual e o `process` do motor (`ESTUDIO_DADOS=/dados`). Nada do ambiente da máquina entra. |
| `frontend/src/motorNavegador/cliente.js` | Lado da tela: escolhe o armazém, carrega o pacote sob demanda, liga o service worker das mídias, pede `persist()`, consulta jobs pendentes ao abrir (`RetomarJobs`, grátis). |
| `frontend/src/motorNavegador/chave.js` | Chave do OpenRouter: colar (lembrar neste navegador ou só nesta aba), "Entrar com OpenRouter" (OAuth PKCE, sem servidor), esquecer, modo simulado forçado. |
| `frontend/public/sw-midia.js` | Service worker: as telas usam URLs comuns (`./__motor/Midia?serie=...`), ele intercepta e pede o arquivo à aba. Suporta Range (o `<video>` avança e volta). Não guarda cache. |
| `frontend/src/components/funcionalidades/motor.js` | Decide o motor: `local` (Abrir Estudio.vbs), `navegador` (padrão no site) ou `ajudante` (Estúdio do PC em 127.0.0.1, opção em Configurações). Estados de passagem: `iniciando`, `precisa-permissao`, `procurando`, `sem-motor`, `erro`. |
| `frontend/src/components/Configuracoes.jsx` | Tela de Configurações: onde roda, onde ficam as séries, chave/login, gerações pendentes, o que ainda precisa do PC. |
| `frontend/src/components/MotorTelas.jsx` | Telas "Abrindo o Estúdio", "Reabrir a pasta" e "Não abriu neste navegador". |

## Como o dado anda
1. A tela chama `fetchGet('/LerSerie', { id })` como sempre (`bancoGet.js`).
2. `fetchFunc.js` vê o motor `navegador` e chama `chamarNavegador('GET', '/LerSerie', ...)`.
3. `entrada.chamar` roda o controller `LerSerie.REST(req, res)` do backend. Ele lê `/dados/series/<id>/serie.json` pelo `fs` virtual.
4. Antes de responder, `vfs.liberar()` espera tudo que a rota escreveu chegar ao OPFS/pasta. O corpo passa por JSON, igual à rede.
5. Mídia: `<img src="./__motor/Midia?serie=x&caminho=y">` → service worker → mensagem para a aba → `lerMidia` → `Blob` do OPFS/pasta (sem copiar para a memória) → resposta com Range.

## Dinheiro no navegador (etapa 4)
- **Sem chave = modo simulado**, padrão para qualquer visitante: tudo funciona com resultados de exemplo e custo zero.
- **Chave**: colada (Configurações → "Colar uma chave") ou criada pelo **login do OpenRouter** (PKCE: `openrouter.ai/auth` → volta com `?code=` → `POST /api/v1/auth/keys`). Ela vai só para o `process.env` do motor (memória) e, se o usuário quiser, para o `localStorage`. Nunca para arquivo de série, log ou código.
- **Cotação em 2 passos, tetos, livro de custos, job gravado antes de esperar, token de uso único**: é o código do backend (`orcamento.js`, `servico.js`, `jobs.js`, `custos.js`). O segredo do token é aleatório por aba; recarregar a página invalida cotações abertas (igual a reiniciar o servidor).
- **O teto que nenhum código da página fura**: o limite de crédito da própria chave no painel do OpenRouter. A tela recomenda criar uma chave só para o site, com limite.
- **Aba fechada no meio de um vídeo**: o job continua no OpenRouter. Ao abrir o site, o Estúdio consulta os pendentes (GET grátis) e baixa o que ficou pronto. Também dá para conferir em Configurações → "Conferir agora". Envio interrompido vira "incerto" (conferir no painel antes de repetir), como no PC.
- **CSP** (`vite.config.js`): `connect-src` só libera o próprio site, `openrouter.ai`/`*.openrouter.ai` e `127.0.0.1`/`localhost` (Estúdio do PC). Se a primeira geração paga mostrar que o vídeo pronto é baixado de outro domínio, esse domínio entra na lista. Enquanto isso, o download falho **não perde o vídeo**: o job fica "pendente" com `erroDownload` e é tentado de novo.

## Onde ficam as séries
- **Padrão: dentro do navegador (OPFS)**, pasta `estudio-series`. Não aparece no Explorer. O site pede `navigator.storage.persist()` para o navegador não apagar quando faltar espaço (Configurações mostra se foi aceito).
- **Pasta do computador** (Chrome/Edge no PC; Chrome 132+ no Android): Configurações → "Usar uma pasta do computador". Escolhendo `E:\EstudioSeriesDados`, o site trabalha com **as mesmas séries do Estúdio do PC**, no mesmo formato. O navegador pede para reconfirmar o acesso a cada visita (tela "Reabrir a pasta"), a não ser que o site seja instalado como app. **Não** use o site e o `Abrir Estudio.vbs` na mesma pasta ao mesmo tempo.
- **Safari antigo** (sem gravação no OPFS pela página): IndexedDB.
- Trocar de lugar **não copia** as séries. Exportar/importar `.zip` é a etapa 8.

## O que ainda não roda no navegador
Rotas que chamam ffmpeg ou Python respondem com o erro "Esta função ainda precisa do Estúdio do PC": `GerarFalas`, `OuvirFala`, `TestarPronuncia`, `MixarAudio`, `RegerarFala`, `MiniaturasClipe`, `OndaAudio`, `ExtrairQuadro`, `RenderizarEpisodio` (lista em `entrada.js` → `ROTAS_SO_NO_PC`). Em Configurações isso aparece em "Ainda precisa do Estúdio do PC". São as etapas 5 a 7 do plano.

## Regras para quem mexer no backend
- Dependência nova de Node no backend precisa de substituto em `ponte/` (o plugin recusa `express`, `cors`, `http`, `https`, `net`, `worker_threads` de propósito).
- `fs` síncrono só em arquivo pequeno de texto (JSON, JSONL, MD, SRT, ASS). Para mídia, `fs/promises`.
- Antes de commitar: `npm test` (inclui `navegador-shims`, `navegador-vfs` e `navegador-motor`, que empacota e roda o motor no Node).

## Testar
- `npm test` na raiz: 257 testes (backend + motor do navegador), sem rede.
- Site como publicado: `npm --prefix frontend run build:pages` e `npm --prefix frontend run preview:pages` → http://127.0.0.1:5296/ (no app do Claude: `estudio-web-pages`).
- Desenvolvimento do site com recarga: `npm --prefix frontend run dev:pages` → http://127.0.0.1:5297/.
- Conferido em 05/11 no navegador do app (Chromium), PC e 375 px: criar série, abrir a Sala, recarregar (continua lá), Geração simples simulada (cotação → token → vídeo de exemplo tocando pelo service worker), Custos, Configurações, conferir pendentes. Console sem erros.

## Não testado ainda
- **Pasta real** escolhida pelo `showDirectoryPicker` (a janela de escolha é do sistema; o código é o mesmo do OPFS).
- **Login do OpenRouter** de ponta a ponta (precisa da conta do Rafael) e **geração paga** pelo navegador (precisa do OK dele, com custo).
- **Modo "Estúdio do PC"** pelo site novo (é o motor híbrido de 04/11, quase sem mudança).
- Aparelhos reais: S23 (Chrome) e iPhone (Safari).
