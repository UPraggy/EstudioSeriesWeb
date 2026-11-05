# PROGRESSO — Estúdio de Séries Web (sem backend, PC e celular)

Registro vivo do trabalho. Sempre atualizado: o que ficou pronto, o que estou fazendo agora e os próximos passos.

## Pedido
- **05/11/2026, Rafael:** "continue e faça tudo que está pendente". A tarefa é tirar do papel as **etapas 1 a 4** de `docs/PUBLICAR-SEM-BACKEND.md`:
  1. base do Pages (`base`, `HashRouter`, Actions, CSP, modo simulado como padrão);
  2. adaptador "backend no navegador";
  3. armazém (pasta real no PC/Android, OPFS no celular, mídia por `blob:`, `persist()`);
  4. OpenRouter no navegador (chave colada ou login PKCE, cotação em 2 passos, livro de custos, jobs, retomar, download).
- Regras do brief: o projeto novo fica em `EstudioSeriesWeb`, **sem mexer no `EstudioSeries` original** (outro agente trabalha nele). Publicar no GitHub da conta **UPraggy**, autor só o Rafael, sem co-autor Claude. Repositório **público só com o OK dele**. Login no GitHub, repositório público e gasto real: perguntar a ele.

## Feito
- **05/11 06:00** — cópia do `EstudioSeries` (estado de 04/11 à noite) para `EstudioSeriesWeb`, sem `logs/`, `dist/` e `dist-pages/`.
- **05/11 06:05** — varredura de segredos na cópia: nenhuma chave real. A única ocorrência de `sk-or-` em código é a chave **falsa** dos testes (`backend/test/fixtures/openrouter-ajuda.js`) e o filtro que apaga chaves das mensagens (`backend/src/openrouter/erros.js`).
- **05/11 06:06** — `git init` local (branch `main`), autor `Rafael Moreira Ramos De Rezende <100146657+UPraggy@users.noreply.github.com>` (credita na conta UPraggy) e o gancho `.githooks/commit-msg` que recusa co-autor de IA.

## Fazendo agora
- Motor do navegador (etapas 2 e 3): o **mesmo código do backend** roda no navegador, empacotado pelo esbuild, com um sistema de arquivos virtual por cima do OPFS ou de uma pasta real. Desenho em `docs/MOTOR-NAVEGADOR.md`.

## Próximos passos
1. Sistema de arquivos virtual + armazéns (memória, OPFS, pasta real) com testes.
2. Substitutos de `Buffer`, `path`, `crypto` (SHA-1, SHA-256, HMAC) e `process` com testes.
3. Pacote do backend para o navegador (plugin do Vite) + teste de ponta a ponta no Node.
4. Frontend: motor "navegador" no `motor.js`/`fetchFunc.js`, service worker para as mídias, tela de Configurações (motor, armazém, chave, login OpenRouter).
5. Etapa 1: CSP, workflow do GitHub Actions, modo simulado como padrão.
6. Conferir no navegador (PC e largura de celular).
7. Publicar: criar o repositório na UPraggy (perguntar ao Rafael), push, Pages.

## Decisões
- **Mesmo código, não porte à mão.** Em vez de reescrever ~11 mil linhas do backend em ESM, o esbuild empacota os módulos CommonJS do backend para o navegador e troca `fs`, `path`, `crypto` etc. por versões do navegador. Uma única fonte de verdade: os testes do backend continuam valendo para o motor do navegador.
- **No Pages, o padrão é o motor do navegador.** O "Estúdio do PC" (ajudante em 127.0.0.1) vira opção na tela de Configurações, para o visitante comum não receber a pergunta de "acesso à rede local" do Chrome.
