# Módulo de áudio: narração, entonação, tratamento e legendas

Pedido do Rafael: "a parte de legenda e narração com as vozes que separei, entonação e tratamento".

O código fica em `backend/src/audio/`. O TTS é feito pelo **motor Python do NarradorVideo**, por meio da ponte `NarradorVideo/fala_cli.py`. Ela importa o `narrar.py` sem alterar nada e usa `fala_para_wav`. Por isso valem as mesmas regras do motor: `vozes.json`, dicionário de pronúncia, tom do Edge em Hz e do Piper em semitons, filtro e cache de TTS em `NarradorVideo/.tmp/cache`.

| Arquivo | O que faz |
|---|---|
| `intencoes.json` | Tabela de intenções. Cada uma define tom, velocidade, volume, pausas e filtro, por motor de voz |
| `parametros.js` | Escolhe voz e intenção, aplica a prioridade dos parâmetros, os limites naturais, o dicionário e a divisão em frases |
| `falas.js` | Lê o roteiro, monta `falas.json`, gera e trata cada fala (com cache por hash) e calcula a linha do tempo |
| `motor.js` | Ponte com o `fala_cli.py`: JSON no stdin e JSON no stdout. O lote roda num único processo Python |
| `tratamento.js` | Cadeias ffmpeg (texto), loudness por fala, EQ de diálogo, ducking, cama de ambiente e master |
| `legendas.js` | Gera SRT e ASS a partir dos tempos do TTS, com cor por personagem, zona segura e modo palavra a palavra |
| `qa.js` | Whisper (`qa_pronuncia.py`) numa fala: devolve a nota e as palavras trocadas |
| `config.js` | Caminhos: `ESTUDIO_DADOS`, `NARRADOR_DIR`, `ESTUDIO_PYTHON` e o CA do Avast |

## 1. Vozes

São **só as de `NarradorVideo/vozes.json`**, todas falando português. Qualquer outra é **recusada** com erro, seja na fala, no `serie.json` ou na ficha do elenco. O `fala_cli.py` também recusa, como segunda barreira.

A voz é escolhida nesta ordem: `voz` escrita na fala, depois `serie.json → vozes[quem]`, depois a ficha do elenco (`elenco/<quem>/ficha.json → voz`) e, por fim, o papel da casa em `vozes.json → papeis`. A fala pode usar um apelido (`"voz": "davi"`).

## 2. Intenções

A coluna "Edge" vale para as vozes do Edge, que usam tom em Hz e velocidade em %. A coluna "Piper" vale para o Cadu, que usa tom em semitons (st). Os valores de tom e velocidade são **ajustes** somados à base, que é o papel ou, na falta dele, o padrão da voz. Os números de pausa (pausa antes, pausa depois e respiro entre frases) estão em segundos.

| Intenção | Edge: tom / velocidade | Piper: tom / velocidade | Volume | Antes / depois / respiro (s) | Filtro |
|---|---|---|---|---|---|
| `neutra` | +0 Hz / +0% | +0 st / +0% | 1,0 | 0,30 / 0,30 / 0,35 | — |
| `narracao_suspense` | −2 Hz / −7% | −0,5 st / −7% | 0,95 | 0,40 / 0,50 / 0,55 | `lowshelf` +2 dB em 160 Hz (corpo) |
| `sussurro` | −3 Hz / −12% | −1 st / −12% | 0,70 | 0,35 / 0,40 / 0,45 | passa-alta em 150 Hz, `highshelf` +3 dB (ar) e compressor |
| `grito_urgencia` | +5 Hz / +8% | +1,5 st / +8% | 1,25 | 0,10 / 0,20 / 0,15 | compressor rápido e `highshelf` +2 dB |
| `medo` | +3 Hz / +4% | +1 st / +4% | 0,90 | 0,35 / 0,35 / 0,50 | `vibrato` e `tremolo` leves (voz trêmula) |
| `cansaco` | −3 Hz / −10% | −1 st / −10% | 0,85 | 0,45 / 0,50 / 0,60 | `lowpass` em 6,5 kHz (abafado) |
| `radio` | +0 Hz / +3% | +0 st / +3% | 1,0 | 0,20 / 0,30 / 0,30 | passa-banda de 400 a 3000 Hz, `acrusher` leve e `tremolo` (o filtro da casa) |
| `telefone` | +0 Hz / +0% | +0 st / +0% | 1,0 | 0,25 / 0,30 / 0,30 | banda de 300 a 3400 Hz e compressor |
| `pensamento` | −1 Hz / −4% | −0,5 st / −4% | 0,85 | 0,40 / 0,45 / 0,50 | eco curto (`aecho` de 45 e 90 ms) e `lowpass` em 7,5 kHz |
| `apresentador` | +1 Hz / +2% | +0,5 st / +2% | 1,0 | 0,25 / 0,30 / 0,35 | presença +2 dB em 3 kHz |

Também são aceitos os apelidos `grito`, `urgencia`, `suspense`, `voz interna` e `narração-suspense`.

**Intenção quando a fala não diz qual:**
- A via decide primeiro: `radio` vira rádio, `telefone` vira telefone e `pensamento` vira pensamento.
- Se o plano é do tipo `apresentador` e quem fala é o narrador, vale `apresentador`.
- Se o narrador está em `narracao` e o gênero da série tem suspense, terror, apocalipse ou sobrevivência, vale `narracao_suspense`. Para fixar outra, use `serie.json → audio.intencaoNarrador`.
- Em qualquer outro caso, vale `neutra`.

O Edge TTS não aceita SSML nem estilos (whispering e fearful só existem na Azure paga; ver `docs/PESQUISA-2026-11-04.md` §4). Por isso a entonação é feita com velocidade e tom por frase, pausas e filtro.

### Prioridade dos parâmetros: fala > intenção > papel no projeto > padrão da voz

- **Tom e velocidade.** Um valor escrito **na fala** é absoluto e vence tudo. Sem ele, o valor final é a base mais o ajuste da intenção. A base é o tom do **papel no projeto** (`serie.json → tons/velocidades[quem]` ou a ficha do elenco) e, na falta dele, o **padrão da voz** em `vozes.json`. A intenção é somada por cima e não apaga a diferença entre dois papéis que usam a mesma voz. Exemplo: o papel `alerta` com −6 Hz e intenção sussurro (−3 Hz) dá −9 Hz.
- **Volume.** O da fala vence. Sem ele, o volume é o do papel (ou da voz) vezes o volume da intenção.
- **Pausas e filtro.** Os da fala vencem os da intenção. `"filtro": ""` na fala tira o filtro. `"pausa"` na fala é a pausa antes, como no motor.
- **Limite natural** (fica preso nele, com aviso em `avisos`):
  - tom do Edge entre ±10 Hz e do Piper entre ±2 st;
  - velocidade entre −25% e +20%;
  - volume entre 0,3 e 2,0.

  O Edge só aceita inteiros, e os valores são arredondados. Um tom em Hz usado numa voz Piper, ou o contrário, é convertido na base de **6 Hz ≈ 1 semitom**.
- Cada fala registra em `origem` de onde veio cada valor. Exemplo: `"voz (-4Hz) + intenção narracao_suspense (-2Hz)"`.

### Frases para respirar

Uma fala com mais de 12 palavras é dividida nos sinais `. ! ? … ; :`, sem cortar em `Dr.`, `Sr.` e `Ep.`. Uma frase com mais de 20 palavras é cortada também na vírgula. **O texto não muda:** juntar as frases com espaço devolve o original.

Cada frase vira um TTS separado. Entre duas frases entra um silêncio igual ao respiro da intenção multiplicado pelo fator da pontuação:

| Pontuação | `.` | `!` | `?` | `…` | `;` | `:` | `,` |
|---|---|---|---|---|---|---|---|
| Fator | 1,0 | 0,8 | 1,0 | 1,6 | 0,7 | 0,6 | 0,5 |

O `fala_cli.py` junta as frases num único wav, como o `gerar_falas` do motor.

## 3. falas.json (`episodios/epNN/falas.json`)

O arquivo é gerado por `POST /GerarFalas` a partir de `roteiro.json → planos[].falas`. Cada fala aceita, além de `quem`, `texto` e `via`, os campos opcionais `intencao`, `voz`, `tom`, `velocidade`, `volume`, `pausa`, `pausaDepoisS` e `filtro`.

```json
{ "versao": 1, "serie": "o-ultimo-farol", "episodio": "ep01", "geradoEm": "...", "duracaoS": 60, "fimFalasS": 57.2,
  "tratamento": { "alvoFalaLufs": -16, "dialogo": "highpass=f=80,...", "master": "loudnorm=I=-14:TP=-1.5:LRA=11" },
  "falas": [ { "id": "p01-f01", "plano": 1, "ordem": 1, "quem": "narrador", "via": "narracao",
    "voz": "de-DE-FlorianMultilingualNeural", "motor": "edge", "intencao": "narracao_suspense",
    "textoExibido": "Sete km de mar separam Mara do fim do mundo.",
    "textoFalado": "Sete quilômetros de mar separam Mára do fim do mundo.",
    "frases": [ { "texto": "...", "textoFalado": "...", "pausaDepoisS": 0 } ],
    "tom": "-6Hz", "velocidade": "-10%", "volume": 0.95, "volumeAlvo": 0.95,
    "pausa": { "antesS": 0.4, "depoisS": 0.5, "entreFrasesS": 0.55 }, "filtro": "lowshelf=f=160:g=2",
    "origem": { "voz": "papel (serie.json)", "tom": "voz (-4Hz) + intenção narracao_suspense (-2Hz)", "...": "..." },
    "avisos": [], "hash": "…", "arquivo": "episodios/ep01/audio/<hash>.wav", "arquivoBruto": "episodios/ep01/audio/<hash>.bruto.wav",
    "duracaoS": 3.42, "palavras": [ { "p": "sete", "t": 0.05 } ], "palavrasEstimadas": false,
    "tratamento": { "medidoLufs": -21.3, "alvoLufs": -16.4, "ganhoDb": 4.9 },
    "inicioS": 0.4, "fimS": 3.82, "status": "pronta|falhou", "erro": null, "doCache": false } ],
  "avisos": [ "p02-f01 (alerta) termina em 14.30 s, depois do fim do plano 2 (14 s): ..." ] }
```

- **Cache.** O hash junta voz, frases do texto falado, pausas, tom, velocidade, volume, filtro e o dicionário da série. Uma fala que não mudou não é gerada de novo. O `.bruto.wav` sai do motor e o `.wav` é a versão tratada. O motor ainda reaproveita o próprio cache de TTS (`.tmp/cache`).
- **Linha do tempo.** A primeira fala de um plano começa em `plano.deS + pausa antes`. Entre duas falas seguidas, o intervalo é a pausa depois da anterior mais a pausa antes da próxima. Quando uma fala passa do `ateS` do plano, aparece um aviso pedindo para encurtar o texto. A duração do plano não é alterada: isso é tarefa da montagem.
- **Piper.** Ele não informa o tempo de cada palavra. Os tempos são estimados pelo tamanho (`palavrasEstimadas: true`).

## 4. Tratamento

Os números vêm de `docs/PESQUISA-2026-11-04.md` §3.

1. **Fala.** Recebe a cadeia da intenção, aplicada pelo motor antes do volume.
2. **EQ de diálogo leve:** `highpass=f=80`, −2 dB em 250 Hz (som embolado), +2 dB em 3 kHz (presença) e `deesser=i=0.3`.
3. **Loudness por fala.** São duas passadas com ganho **linear**, que não esmaga a dinâmica: a primeira mede e a segunda aplica `volume = alvo − medido`, com limitador de pico em −1 dBFS.
   - O alvo é **−16 LUFS + 20·log10(volumeAlvo)**.
   - O `volumeAlvo` é o volume dividido pelo volume padrão da voz. O 1,3 do Cadu em `vozes.json` só compensa o nível cru do Piper e não pode deixar o Davi mais alto depois de normalizar.
   - Resultado: o sussurro fica cerca de 3 dB abaixo e o grito cerca de 2 dB acima.
4. **Mixagem** (`montarMixagem` e `mixarEpisodio`).
   - Cada fala entra no seu `inicioS` (`adelay`).
   - O fundo é o som do clipe e/ou uma cama de ambiente: ruído marrom do motor ou um arquivo em loop. Ele recebe um corte de −4 dB em 2 kHz (faixa de 1 a 3 kHz) para abrir espaço para a voz.
   - O **ducking** usa `sidechaincompress=threshold=0.02:ratio=3:attack=40:release=450`. Com a voz em cerca de −16 LUFS, isso dá de 8 a 10 dB de redução (a pesquisa pede de 6 a 12 dB, com ataque de 30 a 80 ms e release de 250 a 700 ms).
5. **Master** em **−14 LUFS integrado e −1,5 dBTP** (padrão Shorts), com `loudnorm` em duas passadas (`linear=true` quando dá) e LRA 11. A pesquisa cita −1 dBTP, mas o pedido foi −1,5, que é mais conservador. O valor pode ser mudado em `masterizar(..., { TP: -1 })`.

As cadeias também saem em **texto** para o `projeto.json` do motor, por `exportarCadeias()`:
- `intencoes.<id>.filtro` e `filtroComDialogo`, que vão para o `"filtro"` de cada fala;
- `dialogo`, `ducking`, `corteFundo`, `ambiente` e `master`.

`aplicarCadeia(entrada, saida, cadeia)` roda o ffmpeg num arquivo.

## 5. Legendas (`legendas.srt`, `legendas.ass`, `legendas-palavra.ass`)

As legendas usam os **tempos das palavras do TTS**, sem Whisper. O texto **exibido** é casado com as palavras do TTS. Quando a contagem bate, a ligação é por índice. Quando o dicionário muda a contagem (por exemplo, "7km" falado como "sete quilômetros"), entra a maior subsequência comum, e o restante é interpolado pelo tamanho da palavra.

- **Blocos:** até **2 linhas de 32 caracteres**, que também precisam caber em largura. A largura é estimada pela métrica da Arial Bold e tem de ficar dentro da zona segura: no máximo 783 px no tamanho 50.
- **Duração:** de **1 a 4,5 s**. Um bloco nunca se sobrepõe a outro; se for preciso, o próximo é empurrado.
- **Fim de frase** (`. ! ? …`) fecha o bloco, a menos que ele seja curto demais ("Mara!" se junta ao resto).
- **Vírgula** fecha o bloco quando ele já passou de cerca de 40% da capacidade.
- **Bloco cheio no meio da frase:** o corte volta até a última pontuação, para nunca sair "Farol da | Ponta Norte".
- **Palavras fracas:** uma linha ou um bloco não termina em artigo, preposição ou "e".
- **Silêncio** maior que 0,8 s fecha o bloco. O último bloco de cada fala fica mais 0,3 s na tela.
- **Cor por personagem:**

  | Quem | Cor | Hex |
  |---|---|---|
  | Narrador | osso | `#EFE7D6` |
  | Mara | âmbar | `#FFB547` |
  | Davi | azul-frio | `#9AD8F2` |
  | Rádio/alerta | vermelho-claro | `#FF8F87` |

  Um personagem sem cor que fala por rádio fica vermelho-claro. Os outros personagens recebem uma cor extra fixa, escolhida pelo nome. Tudo pode ser mudado em `opcoes.cores`.
- **Fonte:** Arial negrito no tamanho 50 (em 1080×1920), com contorno preto de 4 px e sombra de 1,5. O SRT só mostra cor com `corSrt: true` (`<font color>`), porque nem todo player aceita.
- **Palavra a palavra** (`modo: "palavra"`): cada palavra vira um evento ASS. A palavra falada fica em **branco**, as já ditas ficam na cor do personagem e as próximas ficam apagadas (alfa 80). O texto e as linhas são os mesmos em todos os eventos, então a legenda não "pula".

### Zona segura usada (9:16, 1080×1920)

Os números vêm de `docs/PESQUISA-2026-11-04.md` §2. Não existe margem oficial para post orgânico: os valores saem de especificações de anúncio e de medições da interface. Fontes: Revid (Shorts e TikTok), AdNabu (Meta), AdKit e Reap.

| Rede | Topo | Base | Esquerda | Direita |
|---|---|---|---|---|
| Shorts | 288 | 672 (canal, título, progresso) | 48 | 192 (botões) |
| TikTok | 130–160 | 440–480 | 80 | 140–150 |
| Reels | 269 (14%) | 672 (35%) | 65 (6%) | 65–120 |

- **União das três:** texto em **x 65–888 e y 290–1248**.
- **Posição da legenda** (padrão `baixo`):
  - base em **y = 1240**, ou seja, `MarginV` 680 com alinhamento 2;
  - bloco de 2 linhas entre y ≈ 1112 e 1240, dentro da faixa de 1050 a 1240 que a pesquisa recomenda;
  - `MarginL` 85 e `MarginR` 212 (zona mais 20 px de folga).
- **Outras posições:**
  - `alto`: alinhamento 8, com o topo em y = 310;
  - `centro`: `\pos` no centro da zona (476, 769).
- Tudo pode ser configurado em `zonaSegura`, `baseLegendaY`, `folgaPx` e `posicao`. Confira num celular de verdade antes de publicar.
- **Atenção:** os títulos do `titulos.py` no projeto do farol usam y entre 0,70 e 0,88 (1344 a 1690 px), que fica **fora** da zona segura e cai em cima da legenda. Na montagem, deixe a legenda ou os títulos fora dessa faixa.

## 6. QA de pronúncia

`qa.js → testarPronuncia({ arquivo, texto, modelo })` chama o `fala_cli.py` com `acao: "qa"`, que usa `qa_pronuncia.transcrever` e `qa_pronuncia.comparar`. Ele devolve:
- `nota` (de 0 a 1);
- `revisar`, que vale true quando a nota fica abaixo de 0,9;
- `ouvido`, o texto que o Whisper entendeu;
- `trocas` (`[{ "esperado", "ouvido" }]`).

Cada fala leva cerca de 25 s no modelo `small` em CPU. O teste **não** mede sotaque. O Whisper também erra falas curtas e escreve números com algarismos, então leia as trocas antes de reescrever.

## 7. Rotas

| Rota | Corpo | Resposta |
|---|---|---|
| `POST /GerarFalas` | `{ serie, episodio, regerar?, tratar? }` | falas.json gravado e um resumo por fala, com falhas e avisos |
| `POST /OuvirFala` | `{ texto, quem?, voz?, intencao?, via?, serie?, tom?, velocidade?, volume?, filtro?, responder?: "json"\|"arquivo" }` | wav da prévia, salvo em `<série>/audio/previas` ou em `ESTUDIO_DADOS/previas/audio` |
| `POST /GerarLegendas` | `{ serie, episodio, modo?: "frase"\|"palavra"\|"ambos", posicao?, corSrt?, tamanhoFonte?, zonaSegura?, cores? }` | `legendas.srt`, `legendas.ass` e, no modo palavra, `legendas-palavra.ass` |
| `POST /TestarPronuncia` | `{ serie, episodio, id, modelo? }` ou `{ texto, quem/voz, intencao, modelo? }` | `{ nota, revisar, ouvido, trocas }` |
| `POST /MixarAudio` | `{ serie, episodio, ambiente?: 0.12 \| "arquivo relativo", clipe?, volumeClipe?, ducking? }` | `episodios/epNN/audio/episodio.wav` masterizado |
| `GET /IntencoesFala` | — | intenções, limites, vozes permitidas e as cadeias de diálogo, ducking e master |

## 8. Ambiente e testes

- O Python usado é `ESTUDIO_PYTHON` (padrão: `C:\Users\rafae\AppData\Local\Programs\Python\Python311\python.exe`).
- O motor fica em `NARRADOR_DIR` (padrão: `E:\projects\ClaudeCode\ClaudCodeCodes\NarradorVideo`).
- Como no `narrar.ps1`, o `SSL_CERT_FILE` aponta para o CA do Avast só quando o `AvastSvc.exe` está rodando.
- `npm test` roda os testes `backend/test/audio-*.test.js`:
  - prioridade dos parâmetros, limites, recusa de voz, frases e pronúncia;
  - as cadeias de todas as intenções rodando no ffmpeg real;
  - loudness por fala e master em −14 LUFS;
  - legendas com tempos falsos (quebra, duração, cores e zona segura);
  - fluxo do episódio com motor falso (cache, falhas) e os controllers.
- **Teste de integração real:** gera 2 falas (narrador e Mara) pelo Edge TTS, que é grátis, mas precisa de internet. Sem rede, use `ESTUDIO_SEM_REDE=1` para pular.
