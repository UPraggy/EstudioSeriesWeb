# Memória da série (versão 1)

> Pedido do Rafael: "uma forma de organizar essa memória". Código em `backend/src/memoria/`, exemplo completo em `docs/exemplos/o-ultimo-farol/memoria/`.

## Por que existe

O LLM não lembra de nada entre chamadas, o contexto é caro e limitado, e o modelo de imagem/vídeo só mantém a Mara igual se receber as **referências certas**. A bíblia (`biblia.json`) é o plano; a **memória** é o que **de fato aconteceu** na tela, episódio a episódio, com origem e validade. Dela sai, para cada chamada, um **pacote pequeno com só o que importa** (`montarContexto`).

## Pasta `memoria/` dentro da série

```
series/<serie-id>/memoria/
  fatos.jsonl          # fatos canônicos, um por linha (só cresce)
  estado.json          # o mundo AGORA (fim do último episódio consolidado)
  resumos/ep01.md      # resumo canônico curto de cada episódio publicado
  glossario.json       # nomes, grafia, pronúncia, o que cada voz não fala
  propostas/ep01.json  # rascunho da consolidação (NÃO é canônico até ser aprovado)
  historico/           # cópia do estado.json antes de cada aprovação (dá para voltar)
```

### `fatos.jsonl` — fatos canônicos

```json
{"id":"ep01-003","tipo":"objeto","texto":"Barra de metal está na porta do cais.","fonte":"ep01/p05","desde":"ep01","ate":null,"importancia":2,"sobre":["barra","porta"],"chave":"objeto:barra:onde"}
```

| Campo | Significado |
|---|---|
| `id` | `epNN-NNN` (bíblia = `ep00`). |
| `tipo` | `regra` · `evento` · `personagem` · `objeto` · `local` · `relacao` · `segredo` · `misterio` |
| `texto` | O fato, curto, em pt-BR. |
| `fonte` | De onde veio: `biblia`, `ep01`, `ep01/p05` (plano), `ep01/votacao`. |
| `desde` / `ate` | Vale no **início** do episódio N se `desde < N` e (`ate` nulo ou `ate ≥ N`). `ate: "ep03"` = deixou de valer **durante** o Ep. 3. |
| `importancia` | **3** muda a história (regras, mortes, escolhas) · **2** útil · **1** detalhe. Decide o que sai primeiro quando o pacote não cabe. |
| `sobre` | ids de personagens/locais/objetos (para filtrar por relevância). |
| `chave` (opcional) | Fatos **exclusivos**: um fato novo com a mesma chave **encerra** o antigo (ex.: `objeto:barra:onde`, `personagem:davi:vivo`). |
| `proibido` (opcional, regras) | Termos que quebram a regra se aparecerem **sem negação** no roteiro (ex.: `["ponte"]`: "SEM PONTE" não acusa). |

**Só acrescenta:** encerrar um fato é acrescentar `{"id":"ep00-011","ate":"ep02"}`. Na leitura, a última linha de cada `id` vence campo a campo. Linha quebrada é ignorada com aviso (não derruba nada).

### `estado.json` — o mundo agora

```json
{ "versao": 1, "atualizadoAte": "ep01",
  "personagens": { "mara": { "nome": "Mara", "onde": "sala", "vivo": true, "condicao": "sem ferimentos, em choque",
                             "ferimentos": [], "estadoFicha": "padrao", "carrega": [], "sabe": ["mordida mata e o morto se levanta"] } },
  "objetos": { "barra": { "nome": "Barra de metal", "onde": "porta", "estado": "travando a porta do cais", "comQuem": null, "fixo": false } },
  "locais": {}, "recursos": { "agua": "...", "comida": "5 dias" },
  "segredos": [ { "id": "publico-1", "texto": "...", "sabem": [], "publicoSabe": true } ],
  "misteriosAbertos": ["..."],
  "escolhas": [ { "ep": 1, "vencedora": "A", "texto": "ACENDER O FAROL", "votos": { "A": 120, "B": 80 }, "fonte": "manual" } ],
  "consequenciasPendentes": [ { "paraEp": 2, "texto": "a lancha acha o canal, mas o feixe é visto da cidade...", "origem": "ep01/A" } ] }
```

- `onde` usa **ids de local**. `estadoFicha` diz qual folha de referência usar (muda quando muda figurino/ferimento).
- `escolhas` e `consequenciasPendentes` vêm **só** da votação real (`votacao.json`, fonte `manual|youtube`). A IA nunca escreve nelas.
- Sem `estado.json` (série nova), o estado inicial sai da bíblia (`estadoInicial`).

### `resumos/epNN.md`
3–6 frases do que aconteceu + a linha da escolha do público. É o que o próximo roteiro lê dos episódios antigos (o anterior com prioridade alta, os mais velhos saem primeiro).

### `glossario.json`
```json
{ "versao": 1, "termos": [
  { "id": "mara", "termo": "Mara", "tipo": "personagem", "grafia": "Mara", "pronuncia": "Mára", "pronunciaPiper": "Mara",
    "variantesErradas": ["Maria"], "nota": "Thalita lia \"mar\"" },
  { "id": "davi", "termo": "Davi", "tipo": "personagem", "evitarNaFalaDe": ["davi"], "nota": "a voz do Davi (Cadu/Piper) fala \"dali\"" } ] }
```
`pronuncia` segue a regra do `vozes.json` do NarradorVideo (só acento que mantém a tônica); a montagem pode copiar para o `"pronuncia"` do projeto. `variantesErradas` e `evitarNaFalaDe` são conferidos pela verificação.

## Ciclo de vida

```
bíblia aprovada ──semearDaBiblia──▶ fatos ep00 + estado inicial + glossário   (proposta → aprovar)
   │
   ▼ para cada episódio N
montarContexto('roteiro', N) ──▶ showrunner escreve o roteiro ──▶ verificarContinuidade ──▶ Rafael aprova
montarContexto('decupagem', N) ──▶ planos.json ──▶ Rafael aprova
montarContexto('quadroChave', N, plano) ──▶ imagem ──▶ Rafael aprova o quadro
montarContexto('video', N, plano) ──▶ pedido de vídeo (primeiro quadro)
publicação ──▶ votação REAL (votacao.json)
consolidarEpisodio(N) ──▶ proposta (fatos novos, encerrados, estado, resumo, glossário) ──▶ Rafael aprova ──▶ grava
```

Nada canônico muda sem aprovação: `consolidarEpisodio` e `semearDaBiblia` só gravam com `aprovar: true` (o rascunho fica em `propostas/`).

## `montarContexto(serie, finalidade, { ep, plano, limiteCaracteres, maxImagens, dataUrl })`

`serie` = caminho da pasta, série carregada (`carregarSerie`) ou só a memória. Opcionais: `roteiro`, `planos`, `votacao` (para usar uma versão ainda não gravada).

| Finalidade | O que entra (prioridade de corte: 1 fica, 5 sai primeiro) | Limite padrão | Imagens |
|---|---|---|---|
| `roteiro` | série/episódio (fixo) · premissa e regras (1) · escolhas reais e consequência pendente (1) · estado do mundo (1–2; mortos fixos) · resumo do ep. anterior (2) e mais antigos (4) · personagens (2) · mistérios e segredos (2) · outros fatos por importância (2/3/5) · próximos eps. do mapa (3/4) · glossário (3) · ids de locais/objetos (4) | 12 000 | — |
| `decupagem` | roteiro aprovado (fixo) · prompt âncora (PT + EN) e estado de quem/onde/o que aparece (1) · estado (2) · referências disponíveis (3) · regras (3) · fatos relevantes (3) · glossário (4) | 10 000 | — |
| `quadroChave` | o plano (fixo: prompt, visual, quem fala fora de quadro) · âncoras (1) · estado (2) · continuidade com o plano de que depende (2) · fatos úteis (4) | 4 000 | até 4, em ordem: identidade do personagem (frente) · cenário · corpo/figurino · quadro aprovado do plano anterior · objeto · perfil |
| `video` | prompt de movimento (fixo) · âncoras em texto que o prompt ainda não traz (1) · estilo (3). Sem títulos: o texto vira o `pedido.prompt` | 1 500 | **quadro-chave aprovado = primeiro quadro** (+ último quadro aprovado, se houver). As referências são cortadas com motivo `primeiro_quadro_vence` (no OpenRouter primeiro quadro e referências não vão juntos). Sem quadro aprovado: aviso + referências |
| `verificacao` | roteiro (fixo) · regras, escolhas, estado de quem aparece (1) · fatos (2) · resto do estado, resumos, glossário (3) | 12 000 | — |
| `consolidacao` | roteiro aprovado e votação real (fixos) · estado (1) · fatos vigentes (2) · glossário (3) · ids (4) | 12 000 | — |

**Relevância antes do tamanho:** fatos de quem/onde não aparece no plano ficam de fora (`motivo: "irrelevante"`); fatos de posição (`chave …:onde`) não se repetem porque o estado já diz.
**Corte por tamanho:** remove, um a um, o item de maior número de prioridade (e menor peso: o mais antigo/menos importante) até caber. Seções fixas nunca saem.

**Saída:**
```json
{ "finalidade": "quadroChave", "ep": 1, "plano": 3,
  "mensagens": [ { "role": "system", "content": "..." },
                 { "role": "user", "content": [ { "type": "text", "text": "..." },
                                                 { "type": "text", "text": "Imagem 1 — identidade de Mara: rosto, cabelo e idade" },
                                                 { "type": "image_url", "image_url": { "url": "data:image/png;base64,..." } } ] } ],
  "imagens": [ { "caminho": "elenco/mara/ref/padrao-frente.png", "papel": "identidade de Mara: ...", "existe": true, "bytes": 81234 } ],
  "tamanho": { "caracteres": 2442, "limite": 4000, "sistema": 404, "imagens": 4, "maxImagens": 4, "bytesImagens": 320000 },
  "cortes": [ { "secao": "imagens", "motivo": "limite_imagens", "quantidade": 1, "itens": ["elenco/mara/ref/padrao-perfil.png (perfil de Mara)"] } ],
  "avisos": [], "secoes": ["plano", "ancoras", "estado", "fatos"],
  "pedido": { "...": "só na finalidade video: modelo, duracaoS, resolucao, audio, proporcao, prompt, anexos [{tipo, arquivo, papel}]" } }
```
- `mensagens` vai direto para chat completions (multimodal só quando há imagem). Com `dataUrl: false` (prévia/revisão) a imagem vira `arquivo:<caminho>`.
- `limiteCaracteres` vale para o texto da memória (a mensagem do usuário); imagens contam à parte (`maxImagens`). Imagem acima de 4 MB gera aviso.
- **Caminhos de mídia** (resolvidos para relativos à pasta da série): nas fichas, relativos à pasta da ficha (`ref/x.png` → `elenco/mara/ref/x.png`); no `planos.json`, relativos à pasta do episódio (`quadros/p03.png` → `episodios/ep01/quadros/p03.png`); começando com `elenco/`, `locais/`, `objetos/`, `episodios/` já são da série. Nada fora da pasta da série é lido.
- No showrunner, o pacote entra como a mensagem do usuário e o `system` da memória é acrescentado ao prompt da etapa.

## `consolidarEpisodio(serie, ep, { roteiroAprovado, votacao, chamarLLM, aprovar, proposta })`

- **Por regras (sempre, custo zero):** posição final de personagens/objetos pelos planos (só quem mudou de lugar vira fato com `chave`), o bloco `continuidade` do roteiro (`fatosNovos`, `estadoDepois`), a escolha e a consequência **da votação real**, resumo a partir do roteiro.
- **Com LLM injetado (opcional):** resumo melhor, fatos que as regras não pegam (relações, segredos), fatos que deixaram de valer, glossário. Fato sobre votação vindo da IA é descartado; posição que os planos mostraram vence a da IA.
- Devolve a proposta `{ ep, resumo, fatosNovos, fatosEncerrados, estadoNovo, glossarioNovo, mudancas, avisos, consertos, custoUsd }` e grava o rascunho em `propostas/epNN.json`. Com `aprovar: true` (e de preferência a `proposta` revisada/editada pelo Rafael) grava `fatos.jsonl`, `estado.json`, `resumos/epNN.md`, `glossario.json` e guarda o estado anterior em `historico/`.

## `verificarContinuidade(roteiro, memoria, { chamarLLM })`

Determinístico (sempre):

| Tipo | Nível | Quando |
|---|---|---|
| `morto_em_cena` | erro | personagem com `vivo: false` em cena ou falando |
| `objeto_fora_do_lugar` | erro | objeto fixo em outro local; ou objeto em outro local sem ninguém em cena que estivesse com ele/no lugar dele (movimentos dentro do episódio são acompanhados) |
| `personagem_deslocado` | aviso | 1ª aparição do personagem num local diferente de onde terminou o episódio anterior |
| `ferimento` | aviso | personagem ferido em cena sem o ferimento no visual |
| `regra_quebrada` | aviso | termo `proibido` de uma regra aparece sem negação |
| `escolha_ignorada` | aviso | o roteiro não toca na consequência pendente / escolha vencedora do episódio anterior |
| `grafia` / `pronuncia` | aviso | variante errada do glossário; nome que a voz daquele personagem não fala |
| `personagem_desconhecido` / `objeto_desconhecido` | aviso | id sem ficha nem memória |

Com `chamarLLM`: envia o pacote `verificacao` (sempre devolvido em `prompt`) e soma as contradições da IA com `origem: "llm"`. No showrunner, os **erros** de continuidade voltam para o LLM corrigir o roteiro.

## Rotas (controllers)

| Rota | Faz |
|---|---|
| `POST /MemoriaContexto` | prévia do pacote (`dataUrl` falso por padrão) |
| `POST /MemoriaVerificar` | confere um roteiro (`usarLLM` opcional) |
| `POST /MemoriaConsolidar` | 1ª chamada gera a proposta; `{ aprovar: true }` grava a proposta guardada (ou a editada no corpo) |
| `POST /MemoriaSemear` | memória inicial a partir da bíblia (`aprovar: true` grava) |
| `GET /MemoriaLer?serieId=&ep=` | fatos vigentes, estado, resumos, glossário |
| `POST /ShowrunnerEtapa` | etapa do showrunner com a memória da série (`serieId`) |

## Campos novos propostos para o `CONTRATOS.md` (usados aqui, todos opcionais)

- `roteiro.json`: `pov` no plano (quem olha, fora do quadro) e o bloco `continuidade` (`fatosNovos`, `estadoDepois`).
- Fichas: `ancoraEn` (âncora em inglês para prompts), `apresentador: true` (fica fora do mundo da história), `fixo` em objetos.
- `biblia.json`: `onde` em `personagens` e `fixo`/`estado` em `objetos` (estado inicial).
- `planos.json`: `promptPartes` (câmera, sujeito, ação, contexto, estilo), `descricaoPt`, e no topo `ordemGeracao` e `resumoCusto`.
- Ambiguidade a decidir: o CONTRATOS diz "caminhos relativos à pasta da série", mas as fichas usam `ref/…` e o `planos.json` usa `quadros/…`. A memória aceita os três jeitos (ver "Caminhos de mídia").
