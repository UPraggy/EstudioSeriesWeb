# Registro (log e histórico do Estúdio)

Pedido do Rafael (05/11/2026): "quero bastante log, para poder ter histórico de como está rodando".

## Onde fica
- `logs\registro-AAAA-MM-DD.jsonl`, na pasta `logs\` do projeto (já está no `.gitignore`). Um arquivo por dia, pela **data do PC** (não UTC).
- Outra pasta: `ESTUDIO_LOGS=C:\caminho`.
- O console também mostra cada evento numa linha legível (`08:35:30 ERRO [render] falhou (farol ep1) — ...`). O `scripts/dev.js` grava esse console em `logs\estudio-<data>.log`.

## Formato (uma linha JSON por evento)
```json
{"em":"2026-11-05T11:35:30.621Z","nivel":"erro","area":"render","evento":"falhou","serie":"o-ultimo-farol","ep":1,"ms":2300,"msg":"Montagem falhou na etapa \"montando o vídeo\": ...","dados":{"motor":"ffmpeg"}}
```
| Campo | O que é |
|---|---|
| `em` | quando (ISO, UTC) |
| `nivel` | `info`, `aviso` ou `erro` |
| `area` | `http`, `showrunner`, `openrouter`, `job`, `audio`, `legenda`, `edicao`, `render`, `lixeira`, `memoria`, `serie`, `sistema` |
| `evento` | nome curto (`requisicao`, `etapa`, `job-criado`, `concluido`...) |
| `serie`, `ep` | quando houver |
| `ms` | duração |
| `custoUsd` | **só dinheiro gasto de verdade** neste evento (IA de texto respondeu, job pronto). Cotação e previsto ficam em `dados.previstoUsd`. Simulado nunca tem `custoUsd`. |
| `msg` | frase em português |
| `dados` | objeto pequeno (até ~4 KB) |

## O que nunca entra
A chave do OpenRouter (do ambiente ou qualquer `sk-or-...`), `Bearer ...`, campos chamados token/chave/key/authorization/senha/secret/cookie (o valor vira `[oculto]`), corpo de requisição, base64/data URL (vira `[data URL, N caracteres]`), áudio/Buffer (`[binário, N bytes]`), prompt e mensagens inteiras. Textos longos são cortados. Tudo passa pelo `limparSegredos` do `openrouter/erros.js`. Testado em `backend/test/registro.test.js`.

## O que é registrado
| Área | Eventos |
|---|---|
| `sistema` | `inicio` (porta, modo real/simulado, se há chave, versão do Node, pasta do registro), `fim` (Ctrl+C/SIGTERM), `excecao-sem-tratamento` e `promessa-sem-tratamento` (o servidor continua de pé), `erro-fatal` (porta ocupada: aí sai), `erro-express` |
| `http` | `requisicao`: método, rota, status, ms, série/ep, e a mensagem do `{ Error }` quando falha (sem corpo, sem query). Rotas barulhentas (Midia, MidiaSimples, MiniaturasClipe, OndaAudio, ExtrairQuadro, OuvirFala, Saude, StatusJob, StatusRender, StatusRegeracao, Registro, RegistroResumo, arquivos do site, pré-voo OPTIONS) viram um `agregado` por minuto (quantas, ms médio e máximo por rota); se derem erro, ganham linha própria |
| `showrunner` | `etapa`: etapa, modelo, tentativas, ok, erros de validação (primeiros 5 e por tentativa), continuidade, custo em `dados.custoUsd`; `etapa-falhou` |
| `openrouter` | `cotacao` (modelo, previsto), `cotacao-falhou`/`geracao-falhou` (teto, confirmação inválida), `job-criado`, `job-recusado`, `job-incerto`, `texto` (IA de texto: modelo, previsto, real, tokens), `texto-falhou`, `saldo` (só números), `saldo-falhou`, `repetindo` (429/5xx/rede), `erro-api` |
| `job` | `job-estado` (mudou de status), `download` (bytes, ms), `download-falhou`, `job-pronto` (custo real), `job-falhou`, `job-reaproveitado` (mesmo pedido: nada pago 2x), `job-liberado` |
| `audio` | `falas` e `fala-avulsa` (quantas, do cache, geradas, falhas, vozes, ms), `falas-falhou`, `tratamento` (mixagem: duração, LUFS, ms), `mixar`, `testar-pronuncia` |
| `legenda` | `gerar` (blocos, modo), `regerar-trecho` |
| `edicao` | `salvar`, `desfazer`, `refazer` (com a revisão), `edicao-inicial`, `regerar-fala`, `cotar-trecho`, `regerar-trecho`, `regeracao-pronta`, `regeracao-falhou`, `regeracao-pendente` |
| `render` | `inicio` (motor, revisão), `etapa` (cada etapa com o tempo da anterior), `concluido` (duração, MB, ms), `falhou` |
| `lixeira` | `apagar-serie`, `apagar-episodio`, `refazer-roteiro`, `restaurar`, `restaurar-versao` |
| `memoria` | `consolidar`, `verificar`, `semear` |
| `serie` | `criar`, `criar-episodio`, `salvar-roteiro`, `salvar-biblia`, `salvar-ficha`, `adicionar-referencia`, `definir-canonica`, `votacao` |

Toda operação da tabela acima que falha pela rota também aparece na própria área como `<evento>-falhou` (filtrar "Lixeira" mostra o apagar que deu errado). A tabela rota → evento fica em `backend/src/log/http.js` (`EVENTOS_ROTA`): rota nova que muda coisa entra lá numa linha.

## Como ler
- **Na tela:** aba **Registro** no topo (ao lado de Custos). Números dos últimos 7 dias (requisições, erros, gasto real, montagem média), faixa por dia (clique filtra o dia), filtros (dia, nível, área, série, busca), linha do tempo com detalhe de cada evento (e "Copiar evento"), "Carregar mais", "Atualizar" e "Atualizar sozinho" (a cada 5 s, só enquanto a aba está visível).
- **Pelas rotas:**
  - `GET /Registro?dia=&nivel=&area=&serie=&busca=&limite=&antesDe=` → `{ eventos, temMais, proximoAntesDe, dias }`. Mais recentes primeiro; `limite` padrão 100 (máx. 500); `nivel`/`area`/`serie` aceitam vários (`nivel=aviso,erro`); "carregar mais" = mandar `antesDe=<proximoAntesDe>`.
  - `GET /RegistroResumo?dias=7` → `{ dias: [{ dia, eventos, requisicoes, errosHttp, erros, avisos, gastoUsd, geracoes, chamadasIa, renders, rendersFalhos, renderMedioMs, porArea }], totais, diasComRegistro }`.
- **No terminal:** `Get-Content logs\registro-2026-11-05.jsonl -Tail 20` ou `Select-String -Path logs\registro-*.jsonl -Pattern '"nivel":"erro"'`.

## Retenção
Ao iniciar, o servidor apaga `registro-AAAA-MM-DD.jsonl` e `estudio-AAAA-MM-DD.log` com mais de **30 dias** (`ESTUDIO_LOG_DIAS=N` muda). Nenhum outro arquivo da pasta `logs\` é tocado.

## Ambiente
| Variável | Efeito |
|---|---|
| `ESTUDIO_LOGS` | pasta do registro |
| `ESTUDIO_LOG_DIAS` | dias guardados (padrão 30) |
| `ESTUDIO_LOG_CONSOLE` | `0` tira o espelho no console |
| `ESTUDIO_LOG_DESLIGADO` | `1` não grava nada |

Dentro do `node --test` o registro fica desligado, a não ser que o teste defina `ESTUDIO_LOGS`: os testes não sujam `logs\`.

## Código
- `backend/src/log/registro.js`: gravar (`registrar`, `info`, `aviso`, `erro`, `medir`, `cronometro`), limpar segredos e retenção.
- `backend/src/log/leitor.js`: ler com filtros e paginação, resumo por dia (com cache por arquivo).
- `backend/src/log/http.js`: middleware das requisições + eventos de domínio por rota.
- Controllers `Registro.js` e `RegistroResumo.js`. Tela `frontend/src/components/Registro.jsx` + `assets/css/Registro.css`.

## Limites conhecidos
- O "Parar Estudio" mata o processo à força (`taskkill /F`): nesse caso não sai a linha `fim`. O próximo `inicio` mostra que o servidor voltou.
- O resumo conta requisições a partir do registro: rotas agregadas entram pela soma do `agregado` (descarregado a cada minuto), então o número de hoje pode atrasar até 1 min.
- Se a IA de texto cobrar e a resposta vier inválida, o gasto vai para o `custos.jsonl`, mas o evento `texto-falhou` não leva o `custoUsd`.
