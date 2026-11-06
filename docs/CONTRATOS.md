# Contratos de dados (versão 1)

Todo arquivo JSON tem `"versao": 1`. Datas em ISO 8601. Dinheiro em US$ (número). Caminhos de mídia **relativos à pasta da série**.

## Raiz de dados
`ESTUDIO_DADOS` (padrão `E:\EstudioSeriesDados`):
```
<ESTUDIO_DADOS>/
  series/<serie-id>/          # uma pasta por série (id = slug do título: minúsculas, sem acento, hífens)
  geracao-simples/<id>/       # gerações avulsas
  catalogo/videos.json        # cache do GET /api/v1/videos/models (com data)
```

## series/<serie-id>/serie.json
```json
{ "versao": 1, "id": "o-ultimo-farol", "titulo": "O Último Farol", "genero": "Sobrevivência · apocalipse zumbi",
  "idioma": "pt-BR", "formato": { "largura": 1080, "altura": 1920, "proporcao": "9:16" }, "duracaoAlvoS": 60,
  "criadaEm": "2026-11-04T12:00:00Z",
  "orcamento": { "tetoPlanoUsd": 1.0, "tetoEpisodioUsd": 4.0, "tetoSerieUsd": 40.0 },
  "modelos": { "texto": "openai/gpt-6-luna", "imagem": "google/gemini-3.1-flash-image",
               "videoRascunho": "bytedance/seedance-1-5-pro", "videoFinal": "google/veo-3.1-lite", "apresentador": "heygen/avatar-iv" },
  "vozes": { "narrador": "de-DE-FlorianMultilingualNeural", "mara": "pt-BR-ThalitaMultilingualNeural", "davi": "piper:pt_BR-cadu-medium", "alerta": "en-US-BrianMultilingualNeural" },
  "tons": { "alerta": "-6Hz" },
  "etapa": "roteiro",
  "episodios": [ { "n": 1, "id": "ep01", "titulo": "Sete Quilômetros", "status": "roteiro" } ] }
```
`etapa` / `status` ∈ `ideia | biblia | roteiro | elenco | decupagem | geracao | audio | montagem | votacao | publicado`.

## biblia.json
```json
{ "versao": 1, "premissa": "...", "regras": ["..."],
  "cronologia": [ { "ep": 1, "evento": "..." } ],
  "recursos": { "agua": "...", "comida": "...", "energia": "...", "comunicacao": "..." },
  "objetos": [ { "id": "barra", "onde": "porta do cais" } ],
  "personagens": [ { "id": "mara", "estado": "sem ferimentos", "sabe": ["..."] } ],
  "segredos": { "personagens": ["..."], "publico": ["..."] },
  "misterios": ["..."],
  "escolhas": [ { "ep": 1, "A": "...", "B": "...", "vencedora": null, "votos": { "A": 0, "B": 0 } } ],
  "temporada": [ { "n": 1, "titulo": "...", "fase": "...", "resumo": "...", "status": "roteiro" } ] }
```

## elenco/<id>/ficha.json · locais/<id>/ficha.json · objetos/<id>/ficha.json
```json
{ "versao": 1, "id": "mara", "tipo": "personagem", "nome": "Mara", "papel": "...",
  "ancora": "mulher de ~30 anos, cabelo escuro preso, jaqueta de trabalho impermeável escura, botas",
  "voz": "pt-BR-ThalitaMultilingualNeural", "tom": "+0Hz",
  "estados": [ { "id": "padrao", "desde": "ep01", "descricao": "sem ferimentos",
                 "refs": { "frente": "ref/padrao-frente.png", "perfil": "ref/padrao-perfil.png", "corpo": "ref/padrao-corpo.png" } } ],
  "estadoAtual": "padrao", "canonica": "ref/padrao-frente.png", "origem": "importada|gerada" }
```
Locais e objetos usam o mesmo formato com `tipo` = `local` | `objeto`, sem `voz`/`tom`; objeto tem `onde`.

## episodios/epNN/roteiro.json (etapa 3)
```json
{ "versao": 1, "n": 1, "titulo": "Sete Quilômetros", "objetivo": "...", "resumo": "...", "gancho": "...", "duracaoAlvoS": 60,
  "planos": [ { "n": 1, "deS": 0, "ateS": 5, "tipo": "video_ia|apresentador|grafico|reaproveitar",
                "local": "farol", "elenco": ["mara"], "objetos": [], "visual": "...", "tela": "O ÚLTIMO FAROL",
                "falas": [ { "quem": "narrador", "texto": "...", "via": "narracao|radio|telefone|em_cena" } ] } ],
  "escolhas": { "A": { "texto": "ACENDER O FAROL", "detalhe": "...", "consequencia": "..." },
                "B": { "texto": "DEIXAR APAGADO", "detalhe": "...", "consequencia": "..." } },
  "cta": "Comente A ou B. A mais votada decide o próximo episódio.",
  "aprovado": null }
```
Regras de validação: soma das durações ≈ `duracaoAlvoS` (tolerância de 10% do alvo, entre ±0,5 s e ±3 s: 5 s → ±0,5; 60 s → ±3); cada plano 2–10 s (num episódio menor que 2 s, o plano pode ter a duração toda); fala ≤ ~15 palavras por 8 s; `quem` existe no elenco ou é `narrador`/`alerta`; escolhas A e B diferentes.

**Duração livre (04/11/2026):** `duracaoAlvoS` vai de 1 a 600 s e vem do episódio (`serie.json` → `episodios[].duracaoAlvoS`), senão da série, senão 60. `"escolhas": null` = episódio **sem votação** (padrão abaixo de 20 s; também teste ou último): não entra em `biblia.escolhas` e o CTA fica vazio. Criar episódio: `POST /CriarEpisodio { serie, n?, titulo?, duracaoAlvoS?, semEscolha? }` → `{ ok, episodio: { n, id, titulo, status, duracaoAlvoS, semEscolha } }` (sem `n` = próximo número). O showrunner ajusta o prompt ao alvo: até 8 s pede 1 a 2 planos, até 20 s 2 a 4, até 45 s 4 a 7, acima 6 a 9; a curva de retenção é proporcional.

## episodios/epNN/planos.json (etapa 5 e 6)
```json
{ "versao": 1, "planos": [ {
    "n": 3, "tipo": "video_ia", "duracaoS": 8, "prompt": "...", "ancoras": ["mara", "sala", "radio"],
    "quadroChave": { "origem": "imagem_ia|ref|ultimo_quadro", "caminho": "quadros/p03.png", "aprovado": false },
    "quadroFinal": null, "modelo": "google/veo-3.1-lite", "resolucao": "720p", "audio": false,
    "custoPrevistoUsd": 0.24, "dependeDe": [1],
    "takes": [ { "id": "take_01", "fase": "rascunho|final", "caminho": "takes/p03/take_01.mp4", "jobId": "...",
                 "modelo": "...", "custoUsd": 0.09, "status": "pendente|pronto|falhou", "criadoEm": "..." } ],
    "takeEscolhido": null } ] }
```

## custos.jsonl (uma linha por chamada paga, só acrescenta)
```json
{"em":"2026-11-04T12:00:00Z","serie":"o-ultimo-farol","ep":1,"etapa":"geracao","tipo":"video","modelo":"google/veo-3.1-lite","previstoUsd":0.24,"realUsd":0.24,"jobId":"...","ref":"p03/take_02"}
```

## jobs.json (jobs de vídeo em andamento; retomar depois de reiniciar)
```json
{ "versao": 1, "jobs": [ { "jobId": "...", "modelo": "...", "pedidoHash": "sha1 do pedido", "destino": "episodios/ep01/takes/p03/take_02.mp4", "criadoEm": "...", "status": "pendente" } ] }
```
O mesmo `pedidoHash` nunca abre um segundo job pago.

## episodios/epNN/votacao.json
```json
{ "versao": 1, "ep": 1, "votos": { "A": 0, "B": 0 }, "vencedora": "A|B|empate", "fonte": "manual|youtube", "registradaEm": "..." }
```
Nunca inventar resultado: só o Rafael (ou uma contagem real de comentários) preenche.

## geracao-simples/<id>/pedido.json
```json
{ "versao": 1, "id": "2026-11-04-1200-a1b2", "texto": "...", "anexos": [ { "tipo": "imagem|video|texto", "arquivo": "anexos/x.png", "papel": "primeiro_quadro|ultimo_quadro|referencia|video_entrada" } ],
  "modelo": "...", "duracaoS": 8, "proporcao": "9:16", "resolucao": "720p", "audio": false, "custoPrevistoUsd": 0.24,
  "resultado": { "caminho": "resultado.mp4", "custoUsd": 0.24, "status": "pronto" } }
```

## Lixeira recuperável e `_versoes` (05/11/2026)
Regra: **"apagar" nunca destrói**. Nada sai do disco; só muda de pasta (rename no mesmo disco: ou move inteiro, ou nada acontece).
```
<ESTUDIO_DADOS>/
  _lixeira/<AAAA-MM-DD_HHmmss>-<serie>/              # série apagada
    motivo.json
    <serie>/                                         # a pasta da série inteira, com o nome original
  _lixeira/<AAAA-MM-DD_HHmmss>-<serie>-epNN/         # episódio apagado
    motivo.json
    epNN/                                            # a pasta episodios/epNN inteira (takes pagos inclusive)
    memoria/                                         # o que a memória da série tinha deste episódio (se tinha)
  series/<serie>/episodios/epNN/_versoes/<AAAA-MM-DD_HHmmss>/   # roteiro antigo (refazer do zero / antes de voltar a outra versão)
    motivo.json  roteiro.json  falas.json  audio/  edicao.json  .edicao/  legendas.*  saida/
    memoria/                                         # fatos e resumo que vieram deste roteiro (se tinha)
```
**`memoria/` guardada** (código: `backend/src/memoria/doEpisodio.js`): `fatos.jsonl` (as linhas tiradas do `memoria/fatos.jsonl` da série, na ordem original), `resumos/epNN.md`, `propostas/epNN.json` e `manifesto.json` `{ versao, ep, retiradoEm, fatos, encerramentos, ids, resumo, proposta, avisos, comoDevolver }`. Ver `docs/MEMORIA.md` → "Apagar episódio, refazer e restaurar".
A data é a hora local. Dois no mesmo segundo viram `<nome>-2`, `-3`…

**motivo.json da lixeira:** `{ versao, tipo: "serie"|"episodio", apagadoEm, serie, titulo, tituloSerie?, ep?, entrada? (a linha do serie.json), escolha? (biblia.escolhas, sem votos), episodios?, arquivos, bytes, takes?, gastoUsd, origem, pasta, comoRestaurar }`.
O motivo.json do episódio ganha `memoria?: { fatos, encerramentos, resumo, pasta }` quando a memória foi junto.
**motivo.json da versão:** `{ versao, tipo: "refazerRoteiro"|"antesDeRestaurar", serie, ep, guardadoEm, restaurouVersao? (só em antesDeRestaurar: o nome da versão que voltou), roteiro: { titulo, duracaoAlvoS, aprovado }, entradaAntes, escolhaAntes, movidos: [...], preservados: [...], memoria: { fatos, encerramentos, resumo } | null, comoRestaurar }`.

**Voltar a uma versão do roteiro (05/11/2026):** antes de tudo, a versão ATUAL (`roteiro.json` + todos os derivados que existirem) vai para uma pasta **nova** de `_versoes` (`tipo: "antesDeRestaurar"`), junto com a memória que veio dela; só então os arquivos da versão escolhida voltam para o episódio e a memória guardada nela volta para a memória viva. A pasta da versão restaurada some (o conteúdo voltou inteiro; se sobrar algo desconhecido nela, ela fica e vem um aviso). `serie.json`: título, duração e `semEscolha` passam a ser os da versão (o `status` volta ao de quando ela foi guardada, senão `"roteiro"`). `biblia.escolhas`: sem votos, a escolha A/B passa a ser a da versão (`escolhaAntes` do motivo, senão a do `roteiro.escolhas`; roteiro com `escolhas: null` tira a escolha); **com votos, nada muda** (aviso). Takes, quadros, `planos.json`, `mesa.json` e `votacao.json` não mudam. Mesmas travas do refazer (409).

**Memória da série:** apagar episódio e refazer o roteiro tiram da memória viva os fatos e o resumo que vieram daquele episódio (guardados em `memoria/` junto); restaurar da lixeira e voltar a uma versão devolvem. Outros episódios e a bíblia nunca são mexidos. Fato sem origem identificável, termos do glossário e `estado.json` ficam (com aviso). Se, ao restaurar da lixeira, a memória viva já tiver fatos/resumo novos do mesmo episódio, nada é misturado: a memória guardada vai para `memoria/historico/epNN-nao-devolvida-<data>/` (aviso).

**Travas (409):** job pago `enviando`/`pendente` no `jobs.json` (da série ou do episódio), trecho `gerando` no `mesa.json`, montagem rodando agora (`StatusRender` = `montando`; um `render.json` "montando" de antes de reiniciar não trava). Job `incerto` não trava: só avisa (o registro vai junto). Episódio com votação registrada (`votacao.json` ou votos na `biblia.escolhas`) **não** é apagado: é resultado real do público.

**Refazer o roteiro do zero** move para `_versoes`: `roteiro.json` e, com `apagarDerivados` (padrão), `falas.json`, `audio/`, `edicao.json`, `.edicao/`, `legendas.srt`, `legendas.ass`, `legendas-palavra.ass`, `saida/`. **Nunca** move: `takes/`, `quadros/`, `planos.json`, `mesa.json`, `votacao.json`. O episódio volta a `status: "roteiro"` (duração e `semEscolha` podem mudar) e a escolha A/B sem votos sai da `biblia.escolhas` (o roteiro novo cria a dele ao ser salvo). O gasto continua no `custos.jsonl` em todos os casos.

### Rotas
| Rota | Corpo / query | Resposta |
|---|---|---|
| `GET\|POST /PreverApagar` | `{ serie, ep?, acao?: serie\|episodio\|roteiro, apagarDerivados? }` (só leitura) | `{ acao, serie: {id,titulo}, episodios?, episodio?, takes, imagens, takesPagos, gastoUsd, arquivos, tamanhoMb, votado?, vaiParaVersoes?, preservados?, origem, destino, bloqueios: [], avisos: [] }` |
| `POST /ApagarSerie` | `{ serie, confirmacao }` — `confirmacao` = título exato | `{ ok, lixeira: "_lixeira/<item>", item, motivo }` · 400 nome errado · 409 trava |
| `POST /ApagarEpisodio` | `{ serie, ep }` (`ep`: 1, "01" ou "ep01") | `{ ok, lixeira, item, episodio: { n, titulo }, avisos }` · 409 votos/trava |
| `POST /RefazerRoteiro` | `{ serie, ep, duracaoAlvoS?, semEscolha?, apagarDerivados = true }` | `{ ok, versao: "series/.../_versoes/<data>" \| null, movidos, preservados, episodio, avisos }` · 409 trava. Não chama a IA: o roteiro novo sai pelo `ShowrunnerEtapa` (`contexto.duracaoAlvoS`, `semEscolha`, `instrucoes`) com a confirmação de custo da tela. |
| `GET /ListarLixeira` | — | `{ itens: [ { item, tipo, serie, titulo, tituloSerie, ep, apagadoEm, arquivos, tamanhoMb, gastoUsd, origem } ] }` (mais novo primeiro) |
| `POST /RestaurarDaLixeira` | `{ item }` | `{ ok, tipo, serie, ep?, titulo, memoria?: { devolvida, fatos, encerramentos, resumo, proposta, historico }, avisos? }` · 409 se já existe série/episódio no lugar (nunca sobrescreve) ou se o episódio é de uma série que ainda está na lixeira |
| `GET /ListarVersoesRoteiro` | `{ serie, ep }` (só leitura) | `{ serie: {id,titulo}, episodio: { n, titulo, roteiroAtual: { titulo, duracaoAlvoS, aprovado, duracaoPlanosS, planos } \| null, memoriaAtual: { fatos, encerramentos, resumo, vazia } }, versoes: [ { versao, guardadoEm, tipo, deVersao, titulo, duracaoAlvoS, duracaoPlanosS, planos, semEscolha, aprovado, temRoteiro, arquivos: [{nome,o}], memoria: { fatos, encerramentos, resumo, retiradoEm } \| null, tamanhoMb, pasta } ], pasta, bloqueios: [], avisos: [] }` (mais nova primeiro) |
| `POST /RestaurarVersaoRoteiro` | `{ serie, ep, versao }` (`versao` = nome da pasta, ex. `2026-11-04_223015`) | `{ ok, restaurada, guardada: "series/.../_versoes/<data>" \| null, trazidos, guardados, preservados, episodio, memoria: { guardada, devolvida }, avisos }` · 400 versão inválida/sem roteiro.json · 404 versão inexistente · 409 trava (`erros`) |

`PreverApagar` (episódio e roteiro), `ApagarEpisodio` e `RefazerRoteiro` também devolvem `memoria` (`{ fatos, encerramentos, resumo, vazia }` na prévia; `{ guardada, fatos, encerramentos, resumo, proposta }` depois de feito).

Código: `backend/src/series/lixeira.js` e `backend/src/memoria/doEpisodio.js`; testes: `backend/test/series-lixeira.test.js` e `backend/test/series-versoes-memoria.test.js`. Tela: `frontend/src/components/sala/VersoesRoteiro.jsx` ("⋯" → "Versões do roteiro" na página do episódio).

## Notas do roteiro: observações, ajustes e histórico de propostas (05/11/2026)
Pedido do Rafael: "fazer observações antes e após gerar o roteiro, podendo regerar, para mudar um pouco a história".

**`episodios/epNN/notas.json`** (criado na primeira gravação; sem ele, as notas são vazias):
```json
{ "versao": 1, "observacoes": "Comece apresentando a Helena...", "observacoesEm": "2026-11-05T11:46:04Z",
  "historico": [ { "id": "v2", "versao": 2, "em": "...", "tipo": "escrever|ajuste", "base": null|"proposta"|"salvo", "baseVersao": 1|null,
                   "observacoes": "...", "ajustes": "...", "duracaoAlvoS": 30, "semEscolha": false, "titulo": "...",
                   "custoUsd": 0.0024, "modelo": "...", "ok": true, "erros": [], "resultado": { ...roteiro proposto inteiro... } } ] }
```
- `observacoes`: o que o Rafael quer na história, tom, o que evitar (até 4000 caracteres). Entram como `contexto.instrucoes` em todo pedido de roteiro do episódio (escrever, ajustar, refazer e a ação da Visão geral).
- `historico`: cada proposta de roteiro devolvida pelo `ShowrunnerEtapa` (com `serieId`) entra aqui sozinha, inclusive as com problemas (custo > 0). Até 40 por episódio (as mais velhas saem). Nunca grava o `roteiro.json`.
- Código: `backend/src/series/notas.js`; testes: `backend/test/roteiro-notas.test.js`.

**Revisão com ajustes** (`ShowrunnerEtapa`, etapa `roteiro`): `contexto.roteiroBase` (o JSON da proposta na tela) + `contexto.ajustes` (texto: o que mudar) + `contexto.baseVersao?` (a versão do histórico, só para registro). Sem `roteiroBase` e com `ajustes`, a base é o `roteiro.json` salvo. O prompt vira de REVISÃO ("MODO REVISÃO": aplicar os ajustes, manter o resto, devolver o JSON completo); duração, planos, regras e validação são os de sempre; o teto por etapa (US$ 0,05) e a confirmação de custo também. `roteiroBase` sem `ajustes`, ou `ajustes` sem roteiro → erro sem chamar a IA. A resposta ganha `historico: { id, versao, tipo, base, baseVersao, ... }` (sem o roteiro).

**Salvar um roteiro ajustado por cima do salvo:** `POST /SalvarRoteiro { serie, n, roteiro, guardarAnterior: true, apagarDerivados = true }` confere o roteiro novo antes (400 e nada sai do lugar se não passar); depois o atual vai para `_versoes/<data>/` pelo mesmo caminho do "Refazer roteiro" (`motivo.tipo = "antesDeAjuste"`, voltável em "Versões do roteiro"; com `apagarDerivados`, falas, áudio, edição, legendas e montagem vão junto; a memória do roteiro antigo também) e grava o novo. Resposta ganha `versaoGuardada`. Sem `guardarAnterior` (ex.: "Aprovar roteiro") continua só regravando com backup em `.bak`.

| Rota | Corpo / query | Resposta |
|---|---|---|
| `GET\|POST /LerNotasEpisodio` | `{ serie, ep, resumido? }` (`resumido=1` tira o roteiro de cada proposta e põe `temRoteiro`) | `{ notas: { ep, versao, observacoes, observacoesEm, historico } }` · 404 episódio inexistente |
| `POST /SalvarNotasEpisodio` | `{ serie, ep, observacoes }` (texto; vazio limpa) | `{ ok, notas }` · 400 sem `observacoes` ou texto longo · 404 episódio inexistente |

**Regras do roteiro (05/11/2026, caso real "sem introdução, sem nexo"):** o prompt trata o Ep. 1 como **piloto** (plano 1 com gancho + frase que situe; até ~35% do tempo o narrador apresenta a protagonista pelo nome, onde ela está, o que aconteceu com o mundo e o que ela quer/teme; depois um problema concreto); do Ep. 2 em diante abre com "Antes: …". Em todos: cada plano é consequência do anterior, nada sem apresentação, mistério novo com pista, a escolha nasce do problema, nada de mais de ~3 s sem fala. **Cartões e CTA:** no plano da escolha, `tela` = exatamente `"CARTÕES A / B"` e o narrador LÊ as duas opções; o CTA é falado pelo narrador no último plano. A validação (`showrunner/validar.js`) conserta sozinha: opções A/B escritas no `tela` → `"CARTÕES A / B"` (e acrescenta a leitura "Opção A ou opção B?" se couber no limite de palavras); CTA no `tela` → `tela` limpo e o CTA vira fala do narrador no último plano (se couber; senão aviso). Avisos novos: piloto sem o nome da protagonista nas falas dos primeiros 35%; plano (fora o 1) sem fala com mais de 3 s; nenhum plano com os cartões.

## Modelos da série (05/11/2026)
`serie.json → modelos`: `{ texto, imagem, videoRascunho, videoFinal, apresentador }`, ids do catálogo do **OpenRouter** (o prefixo `openai/`, `google/`… é só o fornecedor dentro do OpenRouter; toda chamada vai para `https://openrouter.ai/api/v1` com a chave do OpenRouter).
- `GET /CatalogoModelos[?forcar=1]` → `{ papeis, texto: { modelos: [{ id, nome, contexto, entradaUsdMilhao, saidaUsdMilhao }] }, imagem: { modelos: [{ id, nome, referencias, vertical }] }, video: { modelos: [...resumo do CatalogoVideo com precoExemplo] }, simulado }`. Texto só lista modelos que aceitam saída estruturada (o showrunner usa `json_schema`). Grátis, cache de 24 h.
- `POST /SalvarModelos { serie, modelos: { papel: id, ... } }` → `{ ok, modelos, mudou: [{ papel, de, para }], avisos }`. Cada id é conferido no catálogo do tipo do papel (400 se não estiver); catálogo fora do ar grava pelo formato do id, com aviso. Não gasta nada; as próximas cotações já mostram o preço do modelo novo.
- Tela: Sala → Visão geral → card "Modelos" → "Trocar".

## Gerado fora: ver o pedido sem gastar e anexar o resultado (06/11/2026)
Pedido do Rafael: "nessas partes de geração quero poder ver o prompt que gera e os dados, e poder anexar o que gero, pois posso querer usar uma plataforma externa para isso" (+ "seja em imagem, personagens, locais, roteiro, bíblia e outros"). Tudo aqui tem **custo 0**: nada vai para o OpenRouter, nada entra no `custos.jsonl` nem no `jobs.json`.

**Anexo de fora entra no MESMO lugar e registro da geração interna:**
- **Imagem de ficha** → `<elenco|locais|objetos>/<id>/ref/<estado>-<vista>.<png|jpg|webp>` (se já existe, vira `-2`, `-3`…; nada é apagado) e `estados[estado].refs[vista]`. A `canonica` passa a ser a imagem nova quando a ficha não tinha canônica ou quando a canônica era a imagem anterior desta mesma vista. A ficha ganha `anexosExternos: [{ caminho, original, estado, vista, origem: "externo", custoUsd: 0, em }]` (últimos 60).
- **Vídeo de trecho/plano (Mesa)** → um **take novo** do plano: o original fica em `episodios/epNN/takes/pNN/take_XX.externo.<mp4|mov|webm>` e o take aparado (mesma cadeia ffmpeg dos takes gerados: 720×1280, sem áudio, corte no centro se não for 9:16, último quadro parado se for curto) em `take_XX.mp4`. `mesa.json → takes[plano]` recebe `{ id, arquivo, bruto, origem: "externo", nomeOriginal, plano, deS, ateS, duracaoS, modelo: null, instrucao, custoUsd: 0, simulado: false, criadoEm, original: { largura, altura, duracaoS, bytes, vertical } }` e `regeracoes` ganha um registro `status: "pronto", origem: "externo", custoUsd: 0`. Com `aplicar` (padrão) o take substitui só aquele pedaço da faixa de vídeo do `edicao.json` (como a regeração); sem `aplicar`, fica só nos takes para escolher no inspetor. O número do take respeita cotações em aberto (`cotado`/`gerando`).
- **Quadro-chave de plano (Mesa)** → `episodios/epNN/quadros/pNN-externo-<id>.<ext>`; a Mesa grava no plano `quadroChave: { arquivo, origem: "externo", original, custoUsd: 0 }`.
- **Resposta de texto de fora (showrunner)** → passa pelo MESMO caminho da etapa (`extrairJson` → `validar`/consertos → continuidade), com uma tentativa só e custo 0. Volta igual ao `ShowrunnerEtapa` + `origem: "externo"`. Roteiro com `serieId` entra no histórico do episódio (`notas.json`, entrada com `origem: "externo"`, `custoUsd: 0`, `modelo: "externo"`). Nada é salvo além disso: a bíblia continua no "Aprovar e salvar bíblia" (`AprovarBiblia`) e o roteiro no "Salvar roteiro".

**Conferências:** o tipo é lido pelo **conteúdo** (PNG/JPEG/WEBP; MP4/MOV pelo `ftyp`, WEBM pelo EBML), não pela extensão (415 se não bater); imagem ≤ 25 MB, vídeo ≤ 300 MB (413); série, ficha, estado e vista só com slug (400 em `..`); caminhos sempre dentro da série. O vídeo passa pelo `ffprobe` (duração, resolução) e volta com avisos: não 9:16, aparado, mais curto que o trecho. Trecho que cruza dois planos: 400 (um vídeo por plano).
**Registro:** evento `anexo-externo` (área `serie` para fichas, `edicao` para take e quadro-chave) e `resultado-externo` (área `showrunner`), com `origem: "externo"` e `custoUsd: 0`.

| Rota | Corpo / query | Resposta |
|---|---|---|
| `POST /VerPedidoGeracao` | `{ tipo: imagem\|video, serie, pedido }` (o mesmo `pedido` do `CotarGeracao`) | `{ tipo, endpoint, modelo, prompt, parametros, arquivos: [{ papel: primeiro_quadro\|ultimo_quadro\|referencia, caminho (relativo à série), existe }], destino, corpo (o JSON do OpenRouter com "<arquivo: caminho>" no lugar do base64), gasto: 0 }` · 400 caminho fora |
| `POST /AnexarImagemFicha` | `{ serie, tipo: elenco\|locais\|objetos, id, estado?, vista?, arquivo: { nome, base64 } }` | `{ ok, ficha, caminho (relativo à ficha), caminhoSerie, copiado, origem: "externo", custoUsd: 0 }` |
| `POST /AnexarVideoTrecho` | JSON `{ serie, ep, deS, ateS \| plano, instrucao?, aplicar = true, arquivo: { nome, base64 } }` **ou** corpo binário (`application/octet-stream` ou `video/*`, até 300 MB) com `?serie&ep&deS&ateS\|plano&nome&instrucao&aplicar` | `{ ok, take, avisos, aplicado, edicao?, historico? }` |
| `POST /AnexarQuadroChave` | `{ serie, ep, plano, arquivo: { nome, base64 } }` | `{ ok, arquivo, quadroChave }` |
| `POST /VerPromptEtapa` | `{ etapa: ideias\|biblia\|roteiro\|decupagem\|atualizarMundo, serieId?, contexto?, modelo? }` (o mesmo `contexto` do `ShowrunnerEtapa`) | `{ ok, etapa, modelo, maxTokens, sistema, usuario, promptCompleto, formato (o "FORMATO:" do prompt), mensagens, tamanhoPrompt, avisos, cortesMemoria, erros, gasto: 0 }`; faltando dado (ex.: bíblia sem ideia): `ok: false, erros` |
| `POST /ProporResultadoExterno` | `{ etapa, serieId?, contexto?, texto }` (JSON puro ou texto com JSON dentro, até 400 mil caracteres) | o mesmo do `ShowrunnerEtapa` + `origem: "externo"`, `custoUsd: 0`, `tentativas: 1` (+ `historico` no roteiro) · 400 sem texto |

`CotarGeracaoSimples` passou a devolver também `pedidoVisto` (o mesmo formato do `VerPedidoGeracao`; caminhos relativos a `geracao-simples/`). `CotarTrecho` já devolvia o prompt, os quadros e o pedido inteiro de cada plano.
Código: `backend/src/externo/` (`anexos.js`, `showrunner.js`) e `backend/src/openrouter/pedidoVisivel.js`; `fichas.adicionarReferencia` ganhou `canonicaSeFaltar` e `externo`; `showrunner/etapas.js` exporta `prepararEtapa`; `notas.registrarProposta` aceita `origem: "externo"`. Testes: `backend/test/externo.test.js`.

## Do roteiro ao vídeo: duração, voz nova, estado das etapas e vídeo dos planos em lote (06/11/2026)
Código: `backend/src/edicao/producao.js` (estado, decupagem, lote), `backend/src/audio/vozesFalas.js` (voz mudou), `series/episodios.js → alterarDuracao`. Testes: `backend/test/producao.test.js` (11). Tela: `docs/INTERFACE.md` → "Do roteiro ao vídeo".

**Duração do episódio:** `serie.json → episodios[].duracaoAlvoS` é a duração do episódio e **vence a do roteiro** na tela e no showrunner (salvar um roteiro grava a dele ali). `semEscolha` sem valor: abaixo de 20 s fica sem votação; quem era "sem votação" só por ser curto volta a ter A/B ao passar de 20 s. Na revisão (`ShowrunnerEtapa` roteiro com `ajustes`), a duração vem do pedido > episódio > base; a base vai com `duracaoAlvoS` novo e o pedido ganha a linha **"DURAÇÃO NOVA: o roteiro atual foi escrito para X s e o episódio agora tem Y s…"** (acrescentar cenas de introdução/desenvolvimento ao aumentar; cortar/juntar ao diminuir; manter ou criar A/B conforme `semEscolha`).

**Voz mudou:** compara cada fala gravada (itens de fala do `edicao.json`; sem edição, `falas.json`) com a voz/tom que `prepararFala` daria AGORA (`serie.json → vozes/tons` > ficha `voz/tom` > `vozes.json → papeis`). Item de fala ganha `ajusteManual: { tom?, velocidade?, volume? }` quando o `RegerarFala` recebe esses campos (o tom à mão não conta como mudança e é mantido na regeração, salvo troca de motor Edge↔Piper, com aviso) e `vozAnterior` depois de regerado. `falas.json` acompanha a regeração.

**planos.json:** a decupagem salva mantém `takes`/`takeEscolhido` que já existiam. O lote grava cada take pronto em `takes` (`{ id, fase: final|rascunho, caminho: "takes/pNN/take_XX.mp4" (relativo ao episódio), jobId, modelo, custoUsd, status: "pronto", criadoEm, simulado? }`) e marca `takeEscolhido`; o "Anexar de fora" do plano inteiro também. **mesa.json → regeracoes[]** do lote: os campos do "regerar trecho" + `lote: true`, `fase`, `ajuste: aparar|exato|segurar` (segurar = plano maior que o máximo do modelo: pede o máximo e o último quadro fica parado).

**Gravações concorrentes:** `edicao.atualizarEdicao` relê e reaplica a mudança quando bate no 409 de revisão (até 6 vezes): vários planos do lote terminando juntos não se perdem.

| Rota | Corpo / query | Resposta |
|---|---|---|
| `POST /AlterarDuracaoEpisodio` | `{ serie, ep, duracaoAlvoS, semEscolha? }` | `{ ok, episodio, antes: { duracaoAlvoS, semEscolha }, roteiro: { duracaoAlvoS, duracaoPlanosS, planos, aprovado, semEscolha } \| null, precisaAjustar, avisos }` · 400 fora de 1–600 · 404 episódio |
| `GET\|POST /ConferirVozesFalas` | `{ serie, ep }` (só leitura) | `{ fonte: edicao\|falas\|null, total, mudancas: [{ quem, nome, vozAntes, vozAgora, nomeVozAntes, nomeVozAgora, tomAntes, tomAgora, mudouVoz, mudouTom, origemVoz: serie\|ficha\|casa, falas: [{ id, fala, texto }] }], erros }` (erros = configuração, ex.: a série fixa uma voz e a ficha pede outra) |
| `POST /RegerarFalasVoz` | `{ serie, ep, quem? }` (TTS grátis; sem `quem` = todas, as iguais vêm do cache) | com edição: `{ modo: "edicao", edicao, historico, regeradas: [{ id, fala, quem, voz, vozAntes, duracaoS, delta, doCache }], doCache, avisos }`; sem edição: `{ modo: "falas", total, doCache, regeradas, avisos }` |
| `GET\|POST /EstadoProducao` | `{ serie, ep }` (só leitura, grátis) | `{ ep, titulo, status, duracaoAlvoS, semEscolha, modelos: { videoFinal, videoRascunho }, orcamento, roteiro: { existe, aprovado, planos, duracaoAlvoS, duracaoPlanosS, foraDaDuracao }, falas: { existe, total, prontas, estimadas, vozesMudaram, errosVoz }, decupagem: { existe, decupados, total, faltam }, quadros: { com, total }, videos: { total, prontos, comTake, gerando, planos: [{ n, tipo, deS, ateS, duracaoS, fonte: take\|acervo\|null, take, pronto, gerando, falhou, quadroChave, decupado, prompt, modelo }] }, edicao: { existe, revisao, duracaoS }, render: { status, saida, duracaoS, pct }, votacao: { semEscolha, registrada, vencedora } }` — `pronto` = take gerado/anexado (ou clipe do acervo num plano "reaproveitar") |
| `POST /SalvarDecupagem` | `{ serie, ep, decupagem: { planos: [...] } }` (o resultado da etapa `decupagem`) | `{ ok, planos, avisos, edicao, historico }` · 400 com `erros` (validação do `planos.json`) — prompt/modelo/âncoras/quadro-chave vão para `edicao.planos`; tempos não mudam |
| `POST /CotarVideoPlanos` | `{ serie, ep, planos?: [n], modelo? }` (grátis; sem `planos` = os que ainda não têm vídeo) | `{ cotacoes: [{ id, plano, deS, ateS, duracaoS, duracaoPedidaS, ajuste, modelo, nomeModelo, prompt, quadros, custoPrevistoUsd, token, avisos, orcamento }], totalUsd, simulado, teto: { totalUsd, tetos, gastoEpisodioUsd, gastoSerieUsd, passa: texto\|null }, avisos }` · 409 sem edição ou plano já gerando · 400 nada a gerar. Modelo: pedido > do plano > `videoFinal` > `videoRascunho` (9:16; quadro-chave do plano como 1º quadro quando o modelo aceita). |
| `POST /GerarVideoPlanos` | `{ serie, ep, confirmacoes: [{ id, token }] }` — **PAGO** só com os tokens | `{ regeracoes: [...] }` · 400 sem token · 409 se a soma passa do teto do episódio/série (conferida ANTES do primeiro job: nada é gerado). Acompanhar por `GET /StatusRegeracao` ou `/EstadoProducao`. |

O simulador do OpenRouter passou a dar um id de vídeo único por envio (antes, o mesmo corpo caía no job antigo de outro take).
