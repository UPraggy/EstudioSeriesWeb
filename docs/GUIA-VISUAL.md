# Guia visual do Estúdio de Séries (tema escuro)

Pedido do Rafael em 04/11/2026: interface **escura por padrão**, **ícones**, **mais movimento e microinterações**, pensada em UX/UI e **sem cara de IA**. Este guia substitui a casca clara do `GUIA-VISUAL.md` das maquetes. Medido com o VisualInspector antes da reforma: Séries 75, Sala 74 e Mesa 76 (nota C), com motion 0 nas três.

## A ideia
É uma **ilha de edição**. O fundo é grafite **neutro**, sem puxar para o azul nem para o marrom, porque um fundo tingido muda a cor que você enxerga no vídeo (é o que o DaVinci e o Avid fazem). A interface fica monocromática, em **branco-papel**, e a cor sobra para o que importa: miniaturas, personagens e estados.

- **Ação** = branco-papel. O botão principal é cheio (`.btn.primario`); o resto é contorno (`.btn`) ou só texto (`.btn.fantasma`). No máximo **um** botão principal por área.
- **Vermelho `--sinal`** = cursor da linha do tempo, "gravando" e "gerando". Não use em outro lugar.
- **Estados** (`--ok`, `--aviso`, `--perigo`) aparecem sempre com **ícone + texto**, nunca só pela cor.
- **Cores de personagem** (`--cor-narrador`, `--cor-mara`…) só aparecem em faixas, legendas e fichas do personagem.
- **Camadas:** `--fundo` → `--superficie` → `--superficie-2` → `--superficie-3`. Quanto mais alto, mais claro. Nada de sombra em cartão; sombra (`--sombra-flutuante`) só no que flutua: diálogo, menu, aviso.
- **Raio cresce com a camada:** controle 4 px (`--raio-sm`), painel 8 px (`--raio`), diálogo 12 px (`--raio-lg`).

## Moderno e vendável, sem cara de IA (pedido do Rafael, 04/11/2026)
Tem que parecer **produto** (Frame.io, Runway, um app de streaming), não painel de administração. O que faz isso aqui:

- **A mídia é o herói.** Onde existir imagem da série (capa, quadro-chave, miniatura de clipe, ficha de personagem), ela aparece **grande** e a interface recua. Formato da casa: **pôster 9:16**, porque o produto é vídeo vertical.
- **Pôster de série:** imagem cheia, título embaixo em Archivo **bem condensado e pesado** (`font-stretch: 70%`, peso 800, tamanho grande), sobre um **véu escuro** (degradê de transparente para `rgba(0,0,0,.8)` só para dar leitura ao texto: isso é função, não enfeite). No hover, a imagem aproxima devagar (`scale(1.03)`, 400 ms) e a ação aparece; no foco, anel visível.
- **"Continuar de onde parou"** na entrada: a série mais recente em destaque, com o quadro do episódio, onde você parou (Sala ou Mesa) e o botão que leva direto para lá.
- **Cabeçalho de cena** na Sala: faixa com a capa da série escurecida atrás do título.
- **Números grandes** onde o número é a notícia (saldo, custo do episódio, duração), em algarismos tabulares e com `<Contador>`.
- **Miniatura que "esfrega" (scrub):** passar o mouse por cima de um clipe percorre os quadros (rota `MiniaturasClipe`). É a microinteração que mais vende uma ferramenta de vídeo.
- **Atalhos visíveis:** dica de tecla (`<kbd>`) no `title` e nos menus (Espaço = tocar, Ctrl+Z = desfazer…).
- **Marca:** a palavra "Estúdio de Séries" em Archivo condensado, com um símbolo simples (um quadro 9:16 com marcas de registro de filme). Sem brilho.

**Proibido (cara de IA):** degradê roxo/azul, vidro fosco (glassmorphism), borda que brilha, ícone de faísca (sparkles), emoji, texto "com IA"/"mágico", título com uma palavra colorida, rótulo em CAIXA ALTA espaçada, cartões idênticos com a mesma sombra, "→" no fim de botão, fonte mono em rótulo pequeno.

## Tipografia
- **Archivo** (variável, com largura) em toda a interface. Títulos levemente condensados (`font-stretch: var(--largura-titulo)`, peso 640), como crédito de filme.
- **Courier Prime** é a única ousadia: aparece **só** na página de roteiro (falas, rubricas), porque roteiro de cinema é escrito em Courier. Nome do personagem em caixa alta ali é convenção de roteiro, então pode.
- Timecode e números que mudam: `.num` (algarismos tabulares). Fonte mono (`--fonte-mono`) só para timecode do editor.
- **Evitar:** rótulo em CAIXA ALTA espaçada acima de título, uma palavra destacada no meio do título, "→" no fim de botão, frases ligadas por "·" como enfeite.

## Ícones
- Biblioteca: `lucide-react`, mas **sempre** pelo mapa `src/components/subComponents/icones.js` (`<Ico.regerar/>`, `<Ico.series/>`…). Assim a mesma ação tem sempre o mesmo desenho. Se faltar um ícone, acrescente no mapa, não importe direto.
- Botão com ícone: ícone **antes** do texto, 16 px (o CSS do `.btn` já cuida). Botão só com ícone (`.btn.icone`) precisa de `aria-label` e `title`.
- Ícone decorativo leva `aria-hidden="true"`.
- O ícone reage ao passar o mouse pelas classes `ico-girar` (regerar), `ico-avancar` / `ico-voltar` (navegar) e `ico-pular` (novo, enviar).

## Movimento
Tokens em `colors.css` (gerados pelo VisualInspector, `motion_tokens_generate`): `--motion-fast` 160 ms, `--motion-base` 240 ms, `--motion-slow` 400 ms; `--ease-emphasized` para entrar e `--ease-standard` para o resto. No JS, use `MOV` de `Movimento.jsx`.

Regra: **o movimento responde a uma ação** (abrir, trocar, confirmar, carregar) ou faz **uma** entrada orquestrada por tela. Nada piscando sozinho, nada de "sobe e aparece" em cada seção.

Peças prontas (`src/components/subComponents/Movimento.jsx`):

| Peça | Para quê |
|---|---|
| `<Pagina>` | entrada da página (já está em `routes.jsx`; não repita nas telas) |
| `<Lista>` + `<Item>` | uma cascata na primeira carga (cartões de séries, planos, takes) |
| `<Abas>` | abas com sublinhado que desliza e navegação por setas |
| `<Trocar chave=…>` | troca de conteúdo com cross-fade curto (aba ativa, painel do inspetor) |
| `<Expandir aberto>` | abrir/fechar com altura animada |
| `<Contador valor formatar>` | número que corre até o valor novo (saldo, custo, duração) |
| `<Visto/>` | visto que se desenha (salvo, aprovado) |
| `<Girador/>` + `aria-busy` | botão ocupado: `<button className="btn" aria-busy={ocupado}>{ocupado && <Girador/>}…</button>` |
| `<Esqueleto linhas altura/>` | lugar do conteúdo enquanto carrega (troque "Carregando…") |
| `<Vazio icone titulo texto>` | tela vazia com uma ação |
| `avisar(texto, tipo)` | aviso flutuante ("Roteiro salvo", "Falhou: …"); o `<Avisos/>` já está em `routes.jsx` |

Microinterações que já vêm do CSS: aperto no botão (`scale(.97)`), ícone que reage, foco visível em branco-papel, linha de tabela que acende, campo com anel suave no foco.

**Movimento reduzido:** `MotionConfig reducedMotion="user"` em `routes.jsx` e a regra em `Principais.css` deixam tudo instantâneo para quem pede.

## Texto
Frase curta, verbo no imperativo no botão ("Gerar falas", "Regerar trecho"), o mesmo nome do começo ao fim do fluxo ("Montar episódio" → aviso "Episódio montado"). Erro diz o que houve e como resolver, sem pedir desculpa. Tela vazia convida a agir.

## Conferir
1. `npm run build` dentro de `frontend\` sem erro.
2. VisualInspector (`http://localhost:3000`, `POST /api/tool/design_radar` com `{url}`) nas três telas: Séries, Sala (`/serie/o-ultimo-farol`) e Mesa (`/serie/o-ultimo-farol/ep/1`). Comparar com o "antes" (75 / 74 / 76).
3. `audit_accessibility` para contraste: texto comum ≥ 4,5:1.
