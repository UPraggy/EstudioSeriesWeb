# Interface aprovada (04/11/2026)

O Rafael escolheu a **Sala do showrunner** (maquete B) **mais** a **Mesa de decupagem com editor de vídeo** (maquete C). Referências visuais (protótipos HTML, só para olhar — não copiar o código):
- B: `E:\projects\ClaudeCode\ClaudCodeCodes\NarradorVideo\docs\maquetes\modelo-b-showrunner.html` (+ `.md`)
- C: `E:\projects\ClaudeCode\ClaudCodeCodes\NarradorVideo\docs\maquetes\modelo-c-decupagem.html` (+ `.md`)
- Guia visual: `NarradorVideo\docs\maquetes\GUIA-VISUAL.md` + tokens em `frontend\src\assets\css\colors.css`

Pedido dele: "edite a interface para ter **mais cuidado e ficar mais bonita**", "quero poder **clicar e regerar somente um trecho**", e o fluxo "**criar a história, o roteiro, e o vídeo depois em cima da narração**; claro que depois tem uma **revisão e sincronização**".

## Fluxo de um episódio (narração primeiro)
1. **Roteiro** aprovado (Sala do showrunner).
2. **Narração e falas** geradas (módulo de áudio, vozes recomendadas, intenções) → os tempos reais das falas definem a duração de cada plano.
3. **Decupagem**: cada plano recebe prompt, âncoras (elenco/local), quadro-chave e modelo; a duração vem do áudio (arredondada para as durações aceitas pelo modelo e depois aparada).
4. **Vídeo por plano** gerado em cima da narração (rascunho barato → final), sempre com custo confirmado.
5. **Revisão e sincronização na Mesa**: aparar, mover, dividir, trocar take, deslizar a fala, ajustar o corte na palavra.
6. **Regerar só um trecho** (vídeo ou fala) quando algo saiu errado.
7. **Montar o episódio** na duração dele (5 s, 60 s, 90 s… — duração livre desde 04/11/2026) e exportar.

## Telas
- **Topo** (todas): nome do app, migalhas ("Séries › O Último Farol › Ep. 1"), links Séries · Geração simples · Custos, saldo da chave (texto discreto).
- **Séries** (`/`): lista/cartões simples das séries + "Nova série" (cria a pasta).
- **Sala do showrunner** (`/serie/:id`): abas sublinhadas **Visão geral · Temporada · Bíblia · Elenco e locais · Episódios**. Mapa da temporada com nós A/B e registro de votação real; quadro de episódios por status; bíblia editável; fichas com referências (escolher rosto canônico da Mara; gerar folha do Davi com custo); botão "Abrir na Mesa" em cada episódio.
- **Mesa** (`/serie/:id/ep/:n`): área escura de editor.
  - Esquerda: **acervo** (elenco, locais, objetos, takes, clipes do acervo da série) — arrastar para a linha do tempo ou para o inspetor.
  - Centro: **prévia 9:16** que TOCA de verdade (vídeo do take + áudio das falas sincronizados), com texto de tela e legenda por cima; controles ◀ ▶ ⏯, tempo, velocidade, J/K/L e espaço.
  - Embaixo: **linha do tempo** do tamanho do episódio (o zoom inicial faz caber na largura) com régua, zoom, cursor, faixas **Vídeo · Narração · Falas (uma por personagem) · Rádio/efeito · Ambiente · Texto de tela · A/B**. Clipes com miniatura (vídeo) e forma de onda (áudio). Aparar pelas bordas, arrastar para mover, dividir no cursor (S), imã nas palavras da fala, desfazer/refazer (Ctrl+Z / Ctrl+Shift+Z).
  - Direita: **inspetor** do item selecionado (plano: prompt, âncoras, quadro-chave, modelo, takes rascunho/final; fala: quem, voz, intenção, tom, velocidade, texto falado/exibido).
  - **Seleção de trecho**: arrastar na régua (ou I/O) marca um trecho; a barra de ação mostra **"Regerar vídeo deste trecho"**, **"Regerar fala"**, **"Regerar legenda"**, com custo previsto.
- **Geração simples** (`/geracao-simples`): anexar vídeo/imagem/texto, pedido, modelo filtrado pelo anexo, duração, formato, áudio, custo, gerar, galeria com "Usar na série".
- **Custos** (`/custos`): saldo, tetos, lançamentos (`custos.jsonl`).

## Regerar só um trecho (regra)
- Trecho = `[deS, ateS]` na linha do tempo, dentro de um plano (ou cruzando dois: vira dois pedidos).
- **Vídeo:** o novo clipe usa como **primeiro quadro** o quadro do take atual em `deS` (extraído com ffmpeg) e, se o modelo aceitar, como **último quadro** o quadro em `ateS` — assim emenda sem pulo. A duração pedida é a menor duração aceita pelo modelo ≥ (ateS − deS); depois é aparada. O prompt é o do plano + a instrução do trecho ("ela vira para a janela"). Custo cotado antes; nada pago sem clique.
- O resultado vira um **take novo** (o antigo fica guardado) que substitui só aquele pedaço na faixa de vídeo (o plano passa a ter segmentos).
- **Fala:** regera só aquela fala (mesma voz; pode mudar intenção/tom/velocidade/texto falado); a faixa se ajusta e a legenda acompanha.

## edicao.json (por episódio) — fonte da verdade da Mesa
```json
{ "versao": 1, "duracaoS": 60, "fps": 24,
  "faixas": {
    "video":   [ { "id": "v1", "plano": 1, "arquivo": "takes/p01/take_02.mp4", "inicioS": 0, "duracaoS": 5, "entradaS": 0.4, "origem": "take|acervo|quadro" } ],
    "narracao":[ { "id": "f1", "fala": "p01-f1", "arquivo": "audio/p01-f1.wav", "inicioS": 0.3, "duracaoS": 3.9 } ],
    "falas":   [ { "id": "f4", "fala": "p04-f1", "quem": "mara", "arquivo": "audio/p04-f1.wav", "inicioS": 23.1, "duracaoS": 1.6 } ],
    "efeitos": [], "ambiente": [ { "id": "a1", "arquivo": "...", "inicioS": 0, "duracaoS": 60, "volume": 0.12 } ],
    "texto":   [ { "id": "t1", "plano": 1, "texto": "O ÚLTIMO FAROL", "inicioS": 0.5, "duracaoS": 3.5 } ],
    "ab":      [ { "id": "ab", "inicioS": 47, "duracaoS": 13 } ] },
  "regeracoes": [ { "id": "r1", "faixa": "video", "deS": 31.2, "ateS": 34.0, "instrucao": "...", "modelo": "...", "status": "cotado|gerando|pronto|falhou", "take": "takes/p05/take_04.mp4" } ] }
```
Caminhos relativos à pasta do episódio. Toda edição grava com backup (desfazer no servidor também).

## Visual ("mais cuidado e mais bonita", sem cara de IA)
- Casca clara (tokens de `colors.css`), editor escuro neutro. Uma cor de ação. Sem gradiente, brilho, vidro, emoji.
- Tipografia do sistema com hierarquia por peso; números de tempo em monoespaçada; alinhamento numa grade de 8 px; bordas de 1 px; raio 4–6 px.
- Estados em texto pequeno maiúsculo (APROVADO / PENDENTE), não em pílulas coloridas.
- Micro-interações discretas (hover, foco visível, transição ≤ 120 ms). Nada pisca.
- Responsivo: a Mesa é para desktop (≥ 1200 px); no celular mostra a prévia e a lista de planos.
