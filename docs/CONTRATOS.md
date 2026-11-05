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
