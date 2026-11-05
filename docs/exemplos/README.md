# Exemplos — O Último Farol, Ep. 1

Escritos à mão seguindo as regras do showrunner (e conferidos pelos mesmos validadores: zero erro). Os testes usam estes arquivos.

| Arquivo | O que é |
|---|---|
| `farol-ep01-roteiro.json` | Roteiro de 60 s, 8 planos, linear (base: §6 do plano). `aprovado: null` = esperando o Rafael. |
| `farol-ep01-planos.json` | Decupagem: prompt por plano, âncoras, quadro-chave, modelo, custo, ordem de geração. |
| `farol-ep01-contexto-quadrochave-p03.json` | Saída de `montarContexto` para o quadro-chave do plano 3, para revisão (imagens como `arquivo:` em vez de base64). Regerar: `node docs/exemplos/gerar-contexto-p03.js`. |
| `o-ultimo-farol/` | Série de exemplo no formato do CONTRATOS (serie, bíblia, fichas) + `memoria/` semeada da bíblia. As imagens `ref/*.png` ainda não existem (o rosto da Mara está para ser escolhido). |

## Escolhas do roteiro

- **Retenção:** P1 0–5 gancho · P2 5–15 contexto (Narrador) · P3–P5 15–37 desenvolvimento · P6 37–46 virada (Davi no rádio) · P7 46–54 A/B (cartões aos 48 s) · P8 54–60 CTA.
- **Produção barata (Prompt Mestre: 2–3 clipes novos de IA):** só P3 (Mara no rádio), P5 (Mara trava a porta) e P6 (Davi na lancha) são `video_ia`. P1 (farol), P4 (POV dos binóculos) e P7 (mão no interruptor) são `reaproveitar`: clipes do Flow que já existem e **não mostram rosto**, então não têm o problema da Mara com 4 rostos. Para voltar ao §6 do plano (6 clipes de IA), é só trocar o tipo — o custo sobe ~US$ 0,72.
- **Falas dentro do limite** (~15 palavras / 8 s) e sem lábio: Narrador em cena só como apresentador; alerta e Davi pelo **rádio**; Mara em off no POV; Davi de costas.
- **Segredo do público em vez de fala:** no §6 o Davi dizia "um deles foi mordido", mas a bíblia guarda isso como segredo do público. Aqui a câmera mostra o passageiro escondendo o pulso enfaixado (terror sugerido, sem sangue) e o Davi não sabe.
- **A fala do Davi não tem "Davi"** (a voz Cadu/Piper fala "dali"; ver glossário). "Mara, sou eu!" no lugar de "Mara, é o Davi!".
- P6 tem 9 s e o clipe 8 s (o Veo aceita 4/6/8): a montagem estica 1,13× num plano de ambiente (aviso, não erro).

## Por que os prompts de vídeo estão em inglês

- Os modelos de vídeo/imagem (Veo, Seedance, Kling, Nano Banana) foram treinados e avaliados principalmente com prompts em inglês: câmera, luz e ação saem mais fiéis. O próprio Veo diz que outros idiomas "não foram avaliados".
- Nada do que vai em inglês aparece para o público: **falas e textos de tela continuam em português** e não entram no prompt do vídeo (a voz é TTS e o texto é título da montagem, com `audio: false` e "no on-screen text" no prompt).
- Para revisão humana, cada plano tem `descricaoPt` (uma linha em português) e as fichas têm a âncora nas duas línguas (`ancora` e `ancoraEn`).
- O quadro-chave (imagem) recebe instruções em português + o prompt do plano em inglês; os modelos de imagem entendem os dois.
