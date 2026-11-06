# PROGRESSO — Estúdio de Séries Web (sem backend, PC e celular)

Registro vivo do trabalho. Sempre atualizado: o que ficou pronto, o que estou fazendo agora e os próximos passos.

## Pedido
- **05/11/2026, Rafael:** "continue e faça tudo que está pendente". A tarefa é tirar do papel as **etapas 1 a 4** de `docs/PUBLICAR-SEM-BACKEND.md`:
  1. base do Pages (`base`, `HashRouter`, Actions, CSP, modo simulado como padrão);
  2. adaptador "backend no navegador";
  3. armazém (pasta real no PC/Android, OPFS no celular, mídia por `blob:`, `persist()`);
  4. OpenRouter no navegador (chave colada ou login PKCE, cotação em 2 passos, livro de custos, jobs, retomar, download).
- Regras do brief: o projeto novo fica em `EstudioSeriesWeb`, **sem mexer no `EstudioSeries` original** (outro agente trabalha nele). Publicar no GitHub da conta **UPraggy**, autor só o Rafael, sem co-autor Claude. Repositório **público só com o OK dele**. Login no GitHub, repositório público e gasto real: perguntar a ele.

## Estado (05/11/2026, manhã)
**Etapas 1 a 4: feitas e NO AR.** Site: **https://series.rafaelmr.com.br/** (desde 06/11; o antigo upraggy.github.io/EstudioSeriesWeb redireciona) · Repositório público: **https://github.com/UPraggy/EstudioSeriesWeb** (publica sozinho a cada push na `main`, depois dos testes).

| Etapa | Situação |
|---|---|
| 1. Base do Pages | ✅ `base: './'`, `HashRouter`, `.nojekyll`, CSP por `<meta>` no build, workflow do Actions que roda `npm run test:ci` antes de publicar, modo simulado como padrão (sem chave) |
| 2. Backend no navegador | ✅ o próprio backend empacotado pelo esbuild (`vite-plugin-motor.js`), com substitutos de `fs`, `path`, `crypto`, `os`, `stream`, `child_process`, `process` e `Buffer` |
| 3. Armazém | ✅ OPFS (padrão), pasta real do computador (`showDirectoryPicker`, com tela "Reabrir a pasta"), IndexedDB (Safari), `persist()`, mídias por service worker com Range |
| 4. OpenRouter no navegador | ✅ chave colada (lembrar ou só na aba), "Entrar com OpenRouter" (PKCE), modo simulado forçado, cotação em 2 passos, tetos, livro, jobs gravados, retomar pendentes ao abrir, download |
| Testes | ✅ `npm test`: **257/257** (250 do backend + 3 dos substitutos + 10 do sistema de arquivos virtual + 7 de ponta a ponta do motor, que empacota e roda o motor no Node) |
| Navegador | ✅ conferido no navegador do app (PC e 375 px): criar série, Sala, recarregar e continuar lá, Geração simples simulada com vídeo tocando pelo service worker, Custos, Configurações, gerações pendentes; console sem erros |

## Feito (com hora)
- **06:00** — cópia do `EstudioSeries` (estado de 04/11 à noite) para `EstudioSeriesWeb`, sem `logs/`, `dist/` e `dist-pages/`.
- **06:05** — varredura de segredos: nenhuma chave real. `sk-or-` só na chave **falsa** dos testes, no filtro de `erros.js` e em textos de tela/doc.
- **06:06** — `git init` (branch `main`), autor `Rafael Moreira Ramos De Rezende <100146657+UPraggy@users.noreply.github.com>`, gancho `.githooks/commit-msg` contra co-autor de IA. Commit `c9474cc` (ponto de partida).
- **06:30** — substitutos `buffer.js`, `caminho.js`, `cripto.js` (SHA-1/SHA-256/HMAC síncronos), comparados com o Node.
- **06:50** — `vfs.js` (sistema de arquivos virtual com fila de gravação) e `armazens.js` (memória, OPFS/pasta, IndexedDB). Casos difíceis cobertos: gravação atômica (tmp + rename), lixeira movendo pasta com vídeo grande duas vezes antes da fila andar, erro de disco que não some.
- **07:10** — `backend/src/routes.js` dividido: o mapa de rotas foi para `controllersMapa.js` (o motor usa o mesmo mapa sem o Express). Backend: 250/250.
- **07:20** — `vite-plugin-motor.js` + `entrada.js`: pacote do backend para o navegador (742 KB sem minificar; 157 KB gzip no site). Teste de ponta a ponta no Node: séries, catálogo, imagem e vídeo simulados com token de uso único, lixeira e restauração, e **modo real com fetch falso** (a chave só no `Authorization`, um único POST pago, vídeo baixado, custo no livro, chave em nenhum arquivo). Commit `c7bb57d`.
- **07:20** — corrigido texto com acentos quebrados em `backend/src/edicao/midia.js` (bug que já existia no original: "nÃ£o").
- **07:50** — telas: `motor.js` com o motor `navegador`, `fetchFunc.js`, service worker `sw-midia.js`, `Configuracoes.jsx`, `MotorTelas.jsx`, `SemMotor.jsx` com "Usar só o navegador", Séries e Custos falando onde as séries/chave ficam, link "Configurações" no menu. CSP e workflow novo. Commit `d5c87e7`.
- **08:10** — documentação: `MOTOR-NAVEGADOR.md` (novo), `PUBLICAR-NO-PAGES.md` (reescrito para esta versão), README, CLAUDE.md, andamento no topo do `PUBLICAR-SEM-BACKEND.md`.
- **08:30** — risco achado na revisão: duas abas abertas sobrescreveriam uma à outra. Agora o motor trava em **uma aba por vez** (Web Locks) com "Usar nesta aba"; a aba antiga para na hora. Conferido com duas abas reais.

## Publicação
- **08:40 — Rafael decidiu: repositório PÚBLICO + Pages** ("Público + Pages", eu crio pelo navegador logado).
- O primeiro Chrome conectado era o de **outro computador** (deviceId `3dd22683…`): não usei. Depois o Chrome desta máquina (`642ad326…`, "ACER_RAFAEL") conectou, já logado como UPraggy.
- **09:00** — criado `https://github.com/UPraggy/EstudioSeriesWeb` (público, sem README). Antes do push: `git grep "sk-or-"` só com a chave falsa dos testes e textos de tela; nenhum outro padrão de segredo; todos os commits com autor só o Rafael, nenhum co-autor. Push da `main`.
- **09:05** — Settings → Pages → Source: **GitHub Actions**. O primeiro push não disparou o workflow (repositório novo); disparado à mão (execução #1). **Falhou nos testes**, mas não pelo código novo: 3 arquivos de teste antigos (`audio-falas`, `audio-tratamento`, `edicao`) precisam do `vozes.json` do NarradorVideo em E:, do ffmpeg e do Python, que o servidor do GitHub não tem. Os testes do motor do navegador e os de dinheiro passaram lá.
- **09:15** — `npm run test:ci` (`scripts/testes-ci.js`): roda todos menos esses 3 (simulado aqui sem as ferramentas: 225 testes, 0 falhas). O workflow usa ele; no PC, `npm test` continua rodando tudo.
- **09:20** — execução #2 (disparada pelo push `d454c55`): testes, build e deploy **ok**. Site aberto no Chrome do Rafael: carrega o motor do navegador em modo simulado (o que também prova o service worker funcionando no Pages). Descrição do repositório corrigida e link do site posto no "About". Contribuidor listado: só UPraggy.

## Atualização com o original (06/11/2026)
- **Pedido do Rafael:** "veja o que atualizou e atualize esse site web e quero que vá no Cloudflare e adicione esse site".
- O `EstudioSeries` original mudou muito desde a cópia: **78 arquivos novos e 70 alterados** (estado de 06/11 à noite). Entre eles: da ideia ao vídeo pela tela (Próximo passo, decupagem, quadros-chave em lote, vídeo dos planos em lote), versões do roteiro, notas do roteiro, modelos por série, "gerado fora" (ver o prompt e anexar o resultado), aba **Registro** (log), vozes sem sotaque (Brian removido), duração do episódio. O estado dele está em `docs/PROGRESSO-ESTUDIO-PC.md`.
- Merge de 3 vias a partir do ponto da cópia (`c9474cc`): ramo `original` com o retrato do original, fins de linha normalizados (o original passou a salvar alguns arquivos em CRLF), merge no `main`. Conflitos resolvidos mantendo os dois lados: rotas (o mapa novo voltou para `controllersMapa.js`, com `AnexarVideoTrecho` à parte por causa do corpo binário), menu (Registro + Configurações), `bancoGet.js`, `routes.jsx`, `CLAUDE.md` e README.
- Ajustes para o navegador: o registro (log) grava em `/dados/_registro` (fica junto das séries; aba Registro funciona); `fetchBinario` (novo) passa pelo motor; **vídeo dos planos, regerar trecho, anexar vídeo feito fora e regerar falas com voz nova são recusados ANTES da cotação**, porque o vídeo pago é aparado com ffmpeg depois de baixado (no navegador cobraria e quebraria no fim). Quadros-chave em lote (só imagem) funcionam.
- Testes: `npm test` **322/322**; motor do navegador 22/22 (2 novos: recusa antes de cotar e registro no armazém). Conferido no navegador: Séries, Sala nova, Registro, sem erro no console.

- Push `a7559e6` (com o ramo `original`): o CI ganhou mais 2 exclusões (`externo.test.js` e `producao.test.js`, novos do original, precisam de ffmpeg/vozes); simulado aqui sem as ferramentas: 270 testes, 0 falhas.

### Endereço próprio: series.rafaelmr.com.br (escolhido pelo Rafael em 06/11)
- Código pronto: o Estúdio do PC libera `https://series.rafaelmr.com.br` como origem (teste em `saude.test.js`); o site troca `http://` por `https://` sozinho (o Cloudflare da zona não redireciona e sem https o service worker não funciona).
- O Rafael entrou no Cloudflare. Criado `CNAME series → upraggy.github.io` (proxy ligado; não havia registro "series" antes; a zona foi de 42 para 43 registros). Depois, no GitHub, Custom domain = `series.rafaelmr.com.br` (salvo, "DNS check successful"; "Enforce HTTPS" indisponível por causa do proxy, igual aos outros sites).
- **Conferido:** https://series.rafaelmr.com.br/ abre o site pelo Cloudflare (`server: cloudflare`, CSP no HTML, `sw-midia.js` servido); `http://series.rafaelmr.com.br/#/configuracoes` vira `https://` mantendo a tela; o endereço antigo responde 301 para o novo. No Chrome do Rafael a tela foi "O Estúdio está aberto em outra aba": havia outra aba dele no endereço novo, então não tomei a vez dela.
- Publicação #3 do Actions (com a atualização do original) passou: testes, build e deploy.
- Os dados das séries no navegador ficam por endereço: o que foi criado em `upraggy.github.io` não aparece em `series.rafaelmr.com.br` (exportar/importar `.zip` é a etapa 8).

### Como trazer as atualizações do original (da próxima vez)
1. `git worktree add <pasta-temporária> original` (o ramo `original` guarda o último retrato do `EstudioSeries`).
2. Na pasta temporária: apagar tudo menos `.git` e `.githooks`, copiar o `EstudioSeries` sem `node_modules`, `logs`, `frontend/dist*` e `.tmp`.
3. Converter CRLF→LF nos arquivos de texto, `git add -A`, commit "Atualização do Estúdio de Séries original (data)".
4. No `main`: `git merge original`. Conflitos típicos: `backend/src/routes.js` (refazer `controllersMapa.js` com o mapa novo), menu e rotas das telas (manter os dois), `CLAUDE.md`/README (manter as regras da versão web), `docs/PROGRESSO.md` (manter o do site; o do original vai para `docs/PROGRESSO-ESTUDIO-PC.md`).
5. Conferir no código novo: `require` de módulo do Node sem substituto, `fetch` direto nas telas, e rota paga que use ffmpeg depois de pagar (entra em `ROTAS_SO_NO_PC` de `entrada.js`). Rodar `npm test`, `build:pages` e olhar no navegador.

## Próximos passos
1. **Rafael:** no site, Configurações → "Entrar com OpenRouter" (ou colar uma chave com limite de crédito). A chave é dele e só ele pode pôr.
2. **Rafael (gasto real, com OK e custo antes):** 1ª geração paga pelo navegador para confirmar o download do vídeo (domínio do arquivo e CORS) e o `frame_images` com data URL.
3. Testar no S23 (Chrome) e, se houver, no iPhone.
4. Etapa 5: Mesa sem ffmpeg (miniaturas, onda e quadro por canvas e Web Audio).
5. Etapa 6: voz (Piper Cadu em WASM; Edge só no Edge) e tratamento do áudio.
6. Etapa 8: PWA (instalar e offline) + exportar/importar `.zip` (inclusive para levar séries do OPFS para a pasta e vice-versa).
7. Etapa 7: render (ffmpeg.wasm), depois 10 (WebCodecs).

## Decisões
- **Mesmo código, não porte à mão.** Em vez de reescrever ~11 mil linhas do backend em ESM, o esbuild empacota os módulos CommonJS do backend para o navegador e troca `fs`, `path`, `crypto` etc. por versões do navegador. Uma única fonte de verdade: os testes do backend continuam valendo para o motor do navegador.
- **No Pages, o padrão é o motor do navegador.** O "Estúdio do PC" (127.0.0.1) virou opção em Configurações, para o visitante comum não receber a pergunta de "acesso à rede local" do Chrome.
- **Mídias por service worker**, não por URLs `blob:`: as telas continuam montando URLs comuns (nenhuma tela mudou para isso) e o `<video>` ganha Range de verdade.
- **Portas desta pasta:** 5296 (prévia do Pages) e 5297 (desenvolvimento); o original usa 5196/4190.
- **Chave "lembrada" por padrão** ao colar (com aviso e opção de não lembrar): sem isso, cada recarga pediria a chave de novo. A proteção real é o limite de crédito da chave.

## Pendências fora desta pasta (para o `EstudioSeries` original, não mexi)
- O mesmo acento quebrado em `backend/src/edicao/midia.js` ("Arquivo nÃ£o encontrado").
