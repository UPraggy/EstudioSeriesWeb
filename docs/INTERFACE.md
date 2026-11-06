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

## Roteiro do episódio: observações, ajustes e propostas (05/11/2026)
Sala → Episódios → pôster do episódio. Na mesa de luz, acima da folha:
1. **Observações para o roteiro** (recolhível; aberto quando ainda não há roteiro): texto livre (o que quer na história, tom, o que evitar). Guarda ao sair do campo, no botão "Guardar observações" e antes de gerar; o estado aparece com ícone + texto (Guardadas / Não guardadas). Vem preenchido ao abrir de novo e também no diálogo "Refazer roteiro do zero".
2. **Pedir ajustes** (com uma proposta na tela ou um roteiro salvo): campo "O que mudar" + **Regerar com ajustes** (proposta) ou **Ajustar roteiro salvo**. Abre a mesma confirmação de custo (até US$ 0,05). A proposta nova entra na tela; repita quantas vezes quiser.
3. **Propostas deste episódio** (recolhido): v1, v2… com origem ("Escrito do zero", "Ajuste da v1", "Ajuste do roteiro salvo"), data, custo, título, ajustes e observações usados; **Comparar** (duas folhas lado a lado a partir de 1100 px, alternar abaixo disso; planos diferentes marcados com "mudou") e **Usar esta** (vira a proposta na tela).
4. **Salvar roteiro** por cima de um salvo: o atual vai para "Versões do roteiro" (caixa "Guardar junto falas, edição, legendas e montagem", marcada por padrão).
A ação "Escrever o roteiro" da Visão geral também usa as observações do episódio e deixa a proposta pronta na página dele.

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

## Gerado fora: ver o prompt e anexar o resultado (06/11/2026)
Em todo lugar que gera, dá para **ver exatamente o que vai para a IA** (sem gastar) e **anexar o que foi gerado em outra plataforma** (sem custo). Peças: `subComponents/PedidoExterno.jsx` (bloco do pedido com "Copiar prompt", "Copiar tudo (JSON)" e imagens com "Baixar"; botão "Anexar …" que confere tipo e tamanho) e `subComponents/PromptEtapa.jsx` (diálogo "Ver prompt / Colar resposta de fora").
- **Elenco e locais** → em cada ficha, **"Prompt e anexar"** (`sala/PedidoFicha.jsx`): uma linha por vista (frente, perfil, corpo, ou geral) com a imagem atual, o prompt exato (com a frase do rosto canônico quando há), modelo, proporção, onde grava, a referência que vai junto (baixável), "Copiar tudo (JSON)" e **"Anexar imagem"** / "Trocar por imagem de fora". O rodapé copia a ficha e todos os pedidos. O "Gerar imagens que faltam" e a geração por ficha usam o mesmo pedido (`pedidoDaVista`).
- **Mesa → trecho → "Regerar vídeo deste trecho"**: "Cotar e ver o pedido" (grátis) mostra 1º e último quadro, modelo, duração pedida, resolução, proporção, áudio, o prompt inteiro (abre ao clicar), "Copiar prompt", "Copiar tudo (JSON)" e baixar os quadros. **"Anexar vídeo gerado fora"** (no formulário e na cotação) vira um take novo do trecho, aparado ao tamanho dele, e entra na linha do tempo; os avisos (não 9:16, aparado) aparecem como aviso flutuante.
- **Mesa → inspetor do plano → Quadro-chave**: "Anexar imagem", "Baixar" e "Copiar prompt do quadro" (prompt do plano + âncoras). Takes anexados aparecem com a etiqueta "de fora" e são escolhidos como os outros.
- **Geração simples**: "Ver pedido completo" (abaixo de "Ver custo e gerar") cota sem gastar e abre o pedido inteiro; "Gerar aqui" leva para a confirmação de sempre.
- **Showrunner (texto)**: na Visão geral, cada etapa paga tem dois ícones ao lado de "Executar": **Ver prompt** e **Colar resposta de fora**. Na página do episódio, abaixo de "Pedir ajustes": "Usar outra IA (escrever do zero | com os ajustes acima): Ver prompt · Colar resposta de fora". O prompt vem completo (instruções + pedido), com "Copiar formato (JSON)", "Só as instruções" e "Só o pedido". A resposta colada vira uma proposta normal ("Proposta colada de fora", sem custo); no histórico aparece como "Colado de fora".

## Do roteiro ao vídeo: duração, voz nova e "Próximo passo" (06/11/2026)
Pedidos do Rafael com o Ep. 1 de `o-ultimo-farol-apocalipse`: "o episódio ficou muito curto, quero poder reeditar o tempo", "mudei a voz do Davi, quero regerar na Mesa", "não ficou claro onde gero o vídeo" e "a barra de etapas não faz sentido".

- **Duração do episódio** (Sala → Episódios → episódio): o chip "30 s · Duração" abre o editor (número livre de 1 a 600 s + atalhos 15/30/45/60/90 s, "Sem votação A/B"). Salvar troca só o `serie.json` (`AlterarDuracaoEpisodio`, grátis). Enquanto o roteiro salvo tiver outra duração (ou outra regra de votação), aparece o aviso "O roteiro tem 30 s e o episódio agora tem 60 s" com **Ajustar o roteiro para 60 s** (o "Pedir ajustes" de sempre, com o texto pronto "Reescreva para 60 s mantendo a história; acrescente cenas de introdução e desenvolvimento…", a duração nova no contexto e a confirmação de custo) e **Refazer roteiro do zero**. A tela passa a mostrar a duração do episódio (`serie.json`), não a do roteiro (`sala/serieUtil.js → duracaoDoEpisodio`).
- **Voz mudou** (perto do selo "Falas" na página do episódio e no topo da Mesa): "A voz de Davi mudou (Cadu → Remy): 1 fala com a voz antiga" + **Regerar falas de Davi** (TTS grátis). Com mais de um personagem, "Regerar todas as falas". A Mesa também tem "⋯ → Regerar todas as falas" e "Montar de novo a partir do roteiro". A edição troca só os itens de fala (vídeo, takes, cortes e texto de tela ficam; a fala anda dentro do plano e a legenda acompanha); Ctrl+Z desfaz. Tom ajustado à mão numa fala (inspetor) é mantido e não conta como "voz mudou".
- **Próximo passo** (`producao/ProximoPasso.jsx`; na página do episódio, abaixo do cabeçalho; na Mesa, uma faixa abaixo da barra com "Ver as etapas"): as etapas reais em ordem — 1. Roteiro aprovado, 2. Falas, 3. Decupagem, 4. Quadros-chave (opcional), 5. Vídeos, 6. Montado, 7. Votação —, cada uma com estado por ícone + texto (Feito / Falta / Atenção / Em andamento / Falhou / Depois / Opcional), o motivo em uma linha e o botão certo. Só a próxima etapa ganha o botão principal. Vídeos gerando ou montagem rodando: relê sozinho a cada 4 s.
  - **Decupar** (`producao/Decupar.jsx`): confirmação de custo (teto da etapa) → a IA escreve o pedido de vídeo de cada plano → revisão (plano, tipo, duração, descrição em português, pedido em inglês, âncoras) → **Salvar decupagem**. Ícones "Ver prompt" e "Colar resposta de fora" na linha da etapa. A proposta fica guardada no navegador até salvar ou descartar.
  - **Quadros-chave**: opcional; na Mesa seleciona o primeiro plano sem quadro e o inspetor faz o resto (quadro do cursor, referência ou anexar).
  - **Gerar vídeo dos N planos** (`producao/LoteVideo.jsx`): lista dos planos (marcados os que não têm vídeo; estado, quadro-chave, prompt com "Copiar"), modelo (padrão: o `videoFinal` da série), **Só este** (um plano) e **Anexar de fora** por plano. "Cotar" (grátis) → a confirmação de custo de sempre com UMA soma e uma linha por plano ("Plano 5 · 9,3 s → pede 8 s e segura o fim") e o teto do episódio → os jobs saem juntos e cada vídeo entra sozinho na edição.
  - **Montar**: na Mesa abre a montagem; da Sala vai para a Mesa com `?montar=1`.
- **Visão geral → Etapas** (no lugar do trilho de 10 etapas do `serie.etapa`): **Série** (Ideia → Bíblia aprovada → Elenco e locais com imagem, do estado real: premissa + personagens; fichas com canônica/refs) e **Episódios** (uma linha por episódio criado com as 7 etapas acima em chips). Uma só **"Próximo: …"** com botão. O `serie.etapa` continua sendo gravado, mas nenhuma tela decide por ele (o cabeçalho da Sala mostra "Falta bíblia aprovada" / "Base da série pronta"). A lista antiga "Próximos passos" virou **Pendências**.
- Sem as rotas novas (backend não reiniciado), as telas caem no `LerEdicao` com menos detalhe e avisam "Reinicie o Estúdio".
