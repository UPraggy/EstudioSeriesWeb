# OpenRouter: o que a API real exige (pesquisa de 04/11/2026)

Fontes lidas (docs oficiais) e conferidas com GET gratuitos na API real:

- Guia de vídeo: https://openrouter.ai/docs/guides/overview/multimodal/video-generation
- Criar vídeo: https://openrouter.ai/docs/api/api-reference/video-generation/submit-a-video-generation-request.md
- Status: https://openrouter.ai/docs/api/api-reference/video-generation/poll-video-generation-status.md
- Download: https://openrouter.ai/docs/api/api-reference/video-generation/download-generated-video-content.md
- Modelos de vídeo: https://openrouter.ai/docs/api/api-reference/video-generation/list-all-video-generation-models.md
- Imagem→vídeo (cookbook): https://openrouter.ai/docs/cookbook/video-generation/image-to-video.md
- Escolher modelo de vídeo: https://openrouter.ai/docs/cookbook/video-generation/choose-video-model.md
- Guia de imagem: https://openrouter.ai/docs/guides/overview/multimodal/image-generation
- Gerar imagem: https://openrouter.ai/docs/api/api-reference/images/generate-an-image.md
- Chat completions: https://openrouter.ai/docs/api/api-reference/chat/create-a-chat-completion.md
- Créditos: https://openrouter.ai/docs/api/api-reference/credits/get-remaining-credits.md
- Chave atual: https://openrouter.ai/docs/api/api-reference/api-keys/get-current-api-key.md
- Índice: https://openrouter.ai/docs/llms.txt e https://openrouter.ai/docs/_llms/api-reference.txt

Base: `https://openrouter.ai/api/v1`, cabeçalho `Authorization: Bearer <chave>`. Erros vêm como
`{ "error": { "code": 402, "message": "...", "metadata": {...} } }`.

## Vídeo (assíncrono, com job)

| Ação | Chamada |
|---|---|
| Criar job (PAGO) | `POST /videos` → **202** `{ id, polling_url, status: "pending" }` |
| Consultar | `GET /videos/{id}` (é o `polling_url`) |
| Baixar | `GET /videos/{id}/content?index=0` (com a chave) → bytes `video/mp4` |
| Catálogo (grátis) | `GET /videos/models` → `{ data: [...] }` |

Corpo do `POST /videos` (só `model` é obrigatório; `prompt` é obrigatório para quase todos):
`model`, `prompt`, `duration` (inteiro, s), `resolution` (`360p 480p 720p 768p 1080p 1K 2K 4K`),
`aspect_ratio` (`16:9 9:16 1:1 4:3 3:4 3:2 2:3 21:9 9:21`), `size` (`"720x1280"`, alternativa a resolution+aspect_ratio),
`generate_audio` (bool; **padrão = true nos modelos com áudio** — por isso o cliente sempre manda explícito),
`seed`, `frame_images`, `input_references`, `previous_job_id` (continuar/editar), `callback_url` (webhook HTTPS), `provider`.

- `frame_images`: `[{ "type": "image_url", "image_url": { "url": "..." }, "frame_type": "first_frame" | "last_frame" }]`.
  O modelo precisa listar o tipo em `supported_frame_images`.
- `input_references`: `[{ "type": "image_url", "image_url": { "url": "..." } }]` (sem `frame_type`). Áudio/vídeo de
  referência só em alguns provedores (Seedance 2+); o formato do item de vídeo **não está documentado**.
- **Quadro + referência juntos:** "frame_images tem precedência" — o OpenRouter trata como imagem→vídeo e as
  referências podem ser ignoradas. Por isso o cliente **recusa** pedido com os dois (mande o quadro-chave já com a
  identidade, ou só referências).
- Data URL (`data:image/png;base64,...`) em vídeo: os exemplos oficiais só usam https; a skill oficial
  `openrouter-video` monta data URL para arquivo local. O cliente manda data URL para arquivo local — **confirmar na
  1ª geração paga** (se der 400, não é cobrado).
- Valor fora do suportado (duração, resolução, proporção) → **400** listando os valores aceitos. O cliente valida antes
  pelo catálogo.

Resposta do status: `id`, `generation_id`, `polling_url`, `status` (`pending | in_progress | completed | failed |
cancelled | expired`), `unsigned_urls` (exigem a chave), `urls` (assinadas, **não exigem chave** até `expires_at` —
tratar como segredo: o cliente nunca grava nem devolve), `usage: { cost, is_byok }` (custo real em US$, quando concluído),
`error`. A doc sugere consultar a cada ~30 s; geração leva de 30 s a vários minutos. Geração que falha não é cobrada.
Baixar: usar `unsigned_urls[0]` (só se for `https://openrouter.ai/api/...`, aí manda a chave) ou `/videos/{id}/content`.

Erros do POST: 400, 401, 402 (sem crédito), 403, 404, 413 (payload grande), 429, 499, 500, 503.
O cliente **não repete** POST pago em 5xx/timeout (pode ter sido criado); só repete em 429. Timeout no POST marca o job
como `incerto` (conferir no painel antes de tentar de novo).

### Catálogo e `pricing_skus`

Campos por modelo: `id`, `name`, `supported_resolutions`, `supported_aspect_ratios`, `supported_sizes`,
`supported_durations`, `supported_frame_images`, `generate_audio` (true/false/null), `seed`, `pricing_skus`
(strings), `allowed_passthrough_parameters`. **A doc não diz a unidade dos `pricing_skus`.** Pelo nome e conferindo com
os preços do site (plano §5):

| Formato da chave | Unidade | Exemplo real |
|---|---|---|
| `duration_seconds[_with_audio\|_without_audio][_<res>]` | US$ por segundo | Veo 3.1 Lite `duration_seconds_without_audio_720p` = 0.03 → 8 s = **US$ 0,24** |
| `text_to_video_duration_seconds_<res>`, `image_to_video_...` | US$/s por modo | Kling 3.0 Std 720p 0.084 → 8 s = 0,67 |
| `cents_per_video_output_second_<res>`, `cents_per_second_output[_<res>]` | **centavos** por segundo | Grok Imagine 1.5 Lite 480p = 2 → 8 s = **US$ 0,16** |
| `video_tokens[_<res>][_without_audio\|_with_video_input]` | US$ por token | Seedance 1.5 Pro sem áudio 0.0000012 |
| `minimum_cents_per_generation` | centavos, mínimo por geração | Runway Aleph 2 = 56 |
| `cents_per_image_input` | centavos por imagem de entrada | Grok = 1 |
| `reference_input_images`, `reference_images` | US$ por imagem de referência | HeyGen, Hailuo 3 = 0.04 |

Tokens de vídeo (Seedance): `largura × altura × 24 × segundos ÷ 1024` — **ESTIMATIVA** (fórmula da BytePlus; o
valor real vem em `usage.cost`). Ex.: Seedance 1.5 Pro 480p 9:16 (480×854) 8 s sem áudio ≈ US$ 0,09.
Chaves que o cliente ainda não sabe calcular (ex.: `cents_per_megapixel_second_*`, `long_duration_*`,
`*_video_continuation_*`) → erro "não sei calcular o preço" (nunca gera com preço desconhecido).

## Imagem (síncrona)

`POST /images` (PAGO) — corpo: `model`, `prompt` (obrigatórios), `n` (1–10), `resolution` (`512 768 1K 1.5K 2K 4K`),
`aspect_ratio` (inclui `9:16`, `auto`), `size`, `quality`, `output_format` (`png jpeg webp`), `seed`,
`input_references` (até 16 na doc; o catálogo diz o máximo de cada modelo — Nano Banana 2 e Seedream 4.5: **14**),
cada item `{ "type": "image_url", "image_url": { "url": "https://... ou data:image/png;base64,..." } }` (data URL
**aceito** em imagem). Resposta: `{ created, data: [{ b64_json, media_type }], usage: { cost, ... } }` — só base64,
sem URL. Falha/cancelada não é cobrada (502).

Catálogo (grátis): `GET /images/models` (`supported_parameters` com enums de `resolution`, `aspect_ratio`, faixa de
`n` e de `input_references`) e `GET /images/models/{autor}/{slug}/endpoints` (preço por provedor em
`pricing: [{ billable, unit, cost_usd }]`). Lido em 04/11/2026:

| Modelo | Preço | Observação |
|---|---|---|
| `google/gemini-3.1-flash-image` (Nano Banana 2) | US$ 0,00006 por token de imagem de saída (AI Studio; Vertex us 0,000066) | resolução 512/1K/2K/4K; n = 1; até 14 refs. Tokens por imagem (512≈747, 1K≈1120, 2K≈1680, 4K≈2520) = **ESTIMATIVA** pela tabela do Google → 1K ≈ US$ 0,07 |
| `bytedance-seed/seedream-4.5` | US$ 0,04 por imagem de saída; entrada grátis | resolução 1K/2K/4K; n até 10; até 14 refs |

O cliente usa o endpoint **mais caro** do modelo para cotar (o roteamento pode escolher qualquer um).

## Texto (JSON)

`POST /chat/completions` com `messages`, `max_completion_tokens` (`max_tokens` é obsoleto), `temperature`,
`response_format`: `{ "type": "json_schema", "json_schema": { "name", "strict": true, "schema" } }` ou
`{ "type": "json_object" }`, e `provider: { "require_parameters": true }` (só provedores que suportam o formato).
Resposta: `choices[0].message.content` (texto JSON), `choices[0].finish_reason` (`length` = cortou),
`usage: { prompt_tokens, completion_tokens, total_tokens, cost }` — o uso completo vem sempre (o antigo
`usage: { include: true }` não é mais necessário). Catálogo de texto (grátis): `GET /models` → `pricing.prompt` /
`pricing.completion` em US$ por token (strings).

## Saldo (grátis)

- `GET /key` (qualquer chave): `data.limit`, `data.limit_remaining`, `data.limit_reset`, `data.usage`,
  `usage_daily/weekly/monthly`, `is_free_tier`. O campo `label` traz parte da chave mascarada: **nunca devolver**.
- `GET /credits`: `data.total_credits`, `data.total_usage` (saldo da conta = diferença). A doc diz que exige **chave de
  gerenciamento** (403 com chave comum) — o controller trata e mostra só o `/key`.

## Pendente para a 1ª geração paga (só com OK do Rafael)

1. Confirmar que `frame_images` com **data URL** funciona no vídeo (senão, subir a imagem para uma URL pública).
2. Confirmar `usage.cost` real × previsto: Veo 3.1 Lite 720p sem áudio (previsto 0,24), Seedance 1.5 Pro 480p
   (estimativa por token ~0,09), Nano Banana 2 1K (estimativa ~0,07) e Seedream 4.5 (0,04).
3. Formato de `input_references` com **vídeo** (papel `video_entrada`): hoje recusado até documentar.
4. Ver se o OpenRouter devolve `unsigned_urls` apontando para `/api/v1/videos/{id}/content` (o cliente cai nesse
   caminho se não).
