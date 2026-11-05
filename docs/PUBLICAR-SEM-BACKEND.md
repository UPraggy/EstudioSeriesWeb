# Publicar o Estúdio no GitHub Pages sem backend (análise de 04/11/2026)

Pergunta do Rafael: "quero ver se é possível lançar no GitHub sem backend e ainda assim rodar ele", pensando no **PC** (Windows, Chrome/Edge) e no **celular** (Galaxy S23 com Chrome; iPhone/Safari quando der).

Análise só de leitura do código + testes **gratuitos** feitos hoje. Nenhuma chamada paga, nenhuma chave usada. "(3º)" marca informação de blog ou fonte de terceiros, não da documentação oficial. "Estimativa" = número calculado, não medido.

---

## 1. Resposta curta

- **(a) Dá para rodar 100% estático no GitHub Pages?** **Sim no PC, quase tudo.** No celular rodam a Sala, a geração, as falas e a prévia. A edição fina continua no PC, como já é hoje. O que se perde:
  - as **vozes do Edge** só funcionam se o site for aberto no **Microsoft Edge atualizado**. No Chrome e no Safari sobra só o **Piper/Cadu**, que roda no próprio navegador;
  - o **render** fica bem mais lento com ffmpeg.wasm: estimativa de **5 a 10 min** por episódio de 60 s no PC, contra **23 s** do ffmpeg nativo medidos hoje. No celular é arriscado, a menos que o render seja refeito com WebCodecs;
  - saem o **QA de pronúncia** (Whisper em Python) e o motor de render "narrador" (`narrar.py`);
  - a **chave do OpenRouter** passa a ficar no navegador;
  - no plano grátis do GitHub, o **repositório precisa ser público**.
- **(b) Híbrido:**
  - **Pages + "ajudante local"** (o backend atual rodando no PC) leva 1 a 2 dias e não perde nada no PC. Para o celular falar com o ajudante, ele precisa estar na mesma rede **e** é preciso contornar o bloqueio HTTPS→HTTP, ou então usar o Tailscale.
  - **Pages + Cloudflare Worker grátis** não substitui o backend (não tem disco nem ffmpeg, e só dá 10 ms de CPU por chamada). Ele só tapa dois buracos: a voz do Edge no Chrome/Safari e o download de vídeo, caso este venha de um domínio sem CORS.
- **(c) Recomendação:** **um frontend com dois "motores"**:
  - o motor **navegador**, quando o site está no Pages;
  - o motor **local**, que é o backend de hoje e entra quando o `Abrir Estudio.vbs` está rodando.

  A troca acontece num ponto só (`fetchFunc.js`). Começar pela Sala + geração no navegador e deixar o render por último. O esforço total está na seção 6.

---

## 2. O que foi testado hoje (04/11/2026)

### 2.1 OpenRouter aceita chamada direta do navegador (CORS)

Teste de pré-voo (`OPTIONS`) com `Origin: https://exemplo.github.io`, `Access-Control-Request-Headers: authorization,content-type,http-referer,x-title` e **sem chave**:

| Rota `/api/v1/...` | Pré-voo | Resposta real sem chave |
|---|---|---|
| `chat/completions` | 204, `Access-Control-Allow-Origin: *` | não testada (seria paga) |
| `images` | 204, `*` | não testada (paga) |
| `videos` | 204, `*` | `POST` com corpo vazio → 400 de validação, com `*` (nada foi criado) |
| `videos/{id}` (status) | 204, `*` | 401 com `*` |
| `videos/{id}/content` (download) | 204, `*` | 401 com `*` |
| `videos/models`, `images/models`, `models` | 204, `*` | 200 com `*` (catálogo grátis) |
| `key`, `credits` (saldo) | 204, `*` | 401 com `*` |
| `auth/keys` (login PKCE) | 204, `*` | não testada |

Os cabeçalhos liberados incluem `Authorization`, `Content-Type`, `HTTP-Referer` e `X-Title`, que são os mesmos que `cliente.js` manda.

O `Retry-After` **não** está em `Access-Control-Expose-Headers`. Por isso, no navegador o 429 cai na espera exponencial, que o cliente já tem.

**Falta confirmar (na 1ª geração paga):** se o download do vídeo pronto redireciona para outro domínio de armazenamento e se esse domínio manda CORS. Se não mandar, as saídas são um Worker que repassa o arquivo (seção 5.2) ou baixar à mão.

### 2.2 Voz do Edge (edge-tts) no navegador: só no Microsoft Edge

O serviço de voz do Edge (`speech.platform.bing.com`) **recusa a conexão (403) quando o User-Agent não é de um Edge recente**. A origem do site não importa. O navegador não deixa o site trocar o User-Agent, então:

| Teste (frase curta grátis, voz Thalita) | Resultado |
|---|---|
| Python, cabeçalhos originais do edge-tts 7.3.1 | OK |
| Python, `Origin` de site do GitHub, sem cookie, UA do Edge 143 | OK |
| Python, `Origin` de site do GitHub, UA do Chrome 143 | **403** |
| Python, UA do Firefox | **403** |
| Python, UA do Edge 141 e 156 | OK |
| Python, UA do Edge 130 e 120 | **403** (Edge desatualizado é recusado) |
| Python, UA do Edge Android (`EdgA/143`) e Edge iPhone (`EdgiOS/143`) | OK |
| Python, UA do Chrome Android | **403** |
| **Chrome 156 de verdade** (headless), página em 127.0.0.1 abrindo o WebSocket | **erro** |
| **Chrome 156 de verdade** com o UA forçado para `Edg/156` | **OK**: 13.417 bytes de áudio e 3 marcas de palavra |
| **Edge 120** instalado neste PC | **erro**: o Edge desta máquina está desatualizado |

A biblioteca JS `@edge-tts/universal` chega à mesma conclusão: no navegador, só no Edge ([jsr.io](https://jsr.io/@edge-tts/universal)). O token `Sec-MS-GEC` mudou para uma "v2" com hash próprio no edge-tts 7.x. A versão para navegador teria de portar esse cálculo e **quebra toda vez que a Microsoft mudar o token**.

### 2.3 Outros testes

- **Piper Cadu:** `pt_BR-cadu-medium.onnx` está no [rhasspy/piper-voices](https://huggingface.co/rhasspy/piper-voices). O arquivo tem 62.950.044 bytes, igual ao de `E:\StickEnglishDados\piper`, e o servidor libera CORS (`*`). O navegador consegue baixar direto.
- **ffmpeg.wasm 0.12.10:** o `ffmpeg-core.wasm` tem 32,2 MB (single-thread) e 32,7 MB (multi-thread). O jsDelivr manda CORS e `Cross-Origin-Resource-Policy: cross-origin`, então funciona com COEP.
- **Render nativo nesta máquina** (60 s, 1080×1920, 24 fps, x264 `faster`, vídeo sintético): **22,8 s** com 8 núcleos e **68 s** com 1 núcleo.

---

## 3. Inventário: o que o backend faz e o que impede de rodar só no navegador

O frontend fala com o backend só por `frontend/src/components/funcionalidades/fetchFunc.js` (`fetchGet`/`fetchPost`, ~40 rotas em `bancoGet.js`) e pelas URLs de mídia (`GlobalVar.serverBase` + `/Midia`). Isso é ótimo: dá para trocar o "backend" sem mexer nas telas. O backend tem ~11 mil linhas em `backend/src`.

| Grupo | O que o backend faz | O que impede de rodar só no navegador |
|---|---|---|
| Séries / arquivos (`series/`, `memoria/arquivos.js`) | JSON e mídias em `E:\EstudioSeriesDados\series\<id>\`, validação, fichas, episódios, votação | Só o `fs` do Node. A validação é JS puro e roda igual |
| Showrunner / LLM e memória (`showrunner/`, `memoria/`) | Prompts, chamada `json_schema` ao OpenRouter, validação, consolidação da memória | Só a chave e o `fs`. O resto é JS puro |
| Imagem (`openrouter/imagem.js`) | `POST /images`, salva o base64 | A chave. CORS ok |
| Vídeo (`openrouter/video.js`, `jobs.js`) | `POST /videos`, `jobs.json`, consulta a cada ~30 s, download, retomar depois de reiniciar | A chave e a escrita do arquivo. O download do resultado ainda não foi conferido (2.1) |
| Confirmação de custo (`orcamento.js`) | Token HMAC de 10 min, uso único, tetos plano/episódio/série, `custos.jsonl` | Nada técnico: dá para fazer no cliente (seção 4.8) |
| TTS / falas (`audio/falas.js`, `motor.js`) | Python `fala_cli.py`: edge-tts + Piper `.exe`, cache, dicionário de pronúncia | **Python e executável**. No navegador: Edge só no Edge, Piper via WASM |
| QA de pronúncia (`audio/qa.js`) | Whisper `small` em Python (~25 s por fala) | **Python**. Alternativa: Whisper no navegador (pesado) ou tirar |
| Legendas (`audio/legendas.js`) | SRT/ASS a partir dos tempos das palavras | Nada: JS puro |
| Áudio / mix (`audio/tratamento.js`) | Cadeias ffmpeg: EQ, loudness por fala, ducking, master −14 LUFS | **ffmpeg nativo**. No navegador: as mesmas cadeias no ffmpeg.wasm (áudio é leve) ou Web Audio |
| Mesa: miniaturas, ondas, quadros (`edicao/midia.js`) | ffmpeg `tile`, PCM para picos, `-frames:v 1` | **ffmpeg nativo**. No navegador: `<video>` + canvas e `decodeAudioData`, sem ffmpeg |
| Regerar trecho (`edicao/trecho.js`) | Quadro do take (ffmpeg), cotação, ajuste da duração do clipe | ffmpeg (quadro → canvas; ajuste → no render) |
| Render (`edicao/render.js`) | ffmpeg: corta, normaliza 9:16, concatena, queima ASS com fontes, mixa e masteriza. Motor alternativo `narrar.py` | **ffmpeg nativo e Python**. No navegador: ffmpeg.wasm ou WebCodecs. O `narrar.py` não porta |
| Geração simples (`openrouter/geracaoSimples.js`) | Pedido avulso, anexos, cotação, resultado | Chave e `fs` |

---

## 4. Funcionalidade × aparelho

Legenda: ✅ funciona · ⚠️ funciona com ressalva · ❌ não funciona. "Android" = S23 com Chrome; "iPhone" = Safari.

| Funcionalidade | PC (Chrome/Edge) | Android (S23) | iPhone | Como, no navegador | Perde o quê |
|---|---|---|---|---|---|
| Criar e ler séries, bíblia, roteiro, fichas | ✅ | ✅ | ✅ | Os mesmos módulos JS, gravando na pasta escolhida (PC/Android) ou no armazenamento interno do navegador | Nada |
| Guardar arquivos da série | ✅ pasta real (`showDirectoryPicker`) | ⚠️ pasta real desde o Chrome 132, com bugs; plano B: interno (OPFS) | ⚠️ só interno (OPFS) | Seção 4.2 | No celular, a série fica "dentro do navegador" e sai por zip/compartilhar |
| Showrunner e memória (LLM) | ✅ | ✅ | ✅ | `fetch` direto em `/chat/completions` (CORS ok) | Nada; a chave fica no navegador |
| Imagem | ✅ | ✅ | ✅ | `fetch` direto em `/images` | Nada |
| Vídeo (job + polling + download) | ✅ | ✅ | ⚠️ | `fetch` direto; o job continua no OpenRouter se a aba fechar e é retomado pelo `jobId` salvo | O download só foi conferido no pré-voo. No iPhone, o polling para com a aba em segundo plano |
| Cotação em 2 passos, tetos, livro de custos | ✅ | ✅ | ✅ | Mesmo código, com token na memória da aba. O teto "duro" vira o limite de crédito da chave | O token deixa de ser uma barreira contra código malicioso na página (seção 4.8) |
| Saldo e catálogo | ✅ | ✅ | ✅ | `GET /key` e `/videos/models` direto | Nada |
| Falas: vozes do Edge (Florian, Thalita, William, Andrew, Brian, Remy, Giuseppe, Hyunsu) | ⚠️ só no Edge atualizado | ⚠️ só no Edge para Android | ⚠️ só no Edge para iPhone | WebSocket direto + token `Sec-MS-GEC` portado para JS | No Chrome e no Safari, essas vozes não existem sem um Worker (seção 5.2) |
| Falas: Piper Cadu | ✅ | ✅ (mais lento) | ⚠️ | Piper em WASM (ONNX Runtime Web), modelo de 63 MB baixado uma vez e guardado no OPFS | Não informa tempo por palavra (hoje também é estimado) |
| Intenções e tratamento da fala, mix, master | ✅ | ✅ | ⚠️ | As cadeias de texto do `tratamento.js` rodando no ffmpeg.wasm (só áudio, rápido) | Nada no PC; no iPhone, memória |
| Legendas SRT/ASS | ✅ | ✅ | ✅ | `legendas.js` é JS puro | Nada |
| QA de pronúncia (Whisper) | ⚠️ | ⚠️ | ❌ | Whisper no navegador ([transformers.js, 3º](https://remotion.dev/docs/whisper-webgpu)): modelo grande e lento | Na prática, sai da 1ª versão |
| Mesa: miniaturas, ondas, quadro | ✅ | ✅ | ✅ | `<video>` + canvas (`drawImage`) e Web Audio (`decodeAudioData` → picos) | Vídeo HEVC/AV1 só abre se o aparelho decodificar |
| Mesa: editar (linha do tempo) | ✅ | ❌ (só prévia + lista, como hoje) | ❌ | A Mesa já tem `MesaCelular.jsx`: "editar é no computador (≥ 1200 px)" | Edição no celular continua fora |
| Prévia do episódio | ✅ | ✅ | ✅ | Já roda no navegador (`mesaRelogio.js`, Web Audio) | Nada |
| Render final (ffmpeg.wasm) | ⚠️ 5–10 min (estimativa) | ⚠️ 10–25 min; pode travar | ❌ arriscado | Mesmo `filter_complex` + ASS + fontes no ffmpeg.wasm | Velocidade. Arial não existe no WASM: usar uma fonte de mesma métrica (Liberation Sans/Arimo) |
| Render final (WebCodecs/Mediabunny) | ✅ ~0,5–2 min (estimativa) | ✅ (estimativa) | ⚠️ áudio só no iOS 26+ | Desenha cada quadro no canvas e codifica com H.264 do aparelho | Reescrever a composição (sem `filter_complex`) |
| Render "narrador" (`narrar.py`) | ❌ | ❌ | ❌ | Python | Os títulos animados do motor |
| Salvar ou compartilhar o vídeo final | ✅ (vai para a pasta) | ✅ "Compartilhar" / Downloads | ✅ "Compartilhar" | `navigator.share({ files })` ou download | Nada |
| Funcionar offline (PWA) | ✅ | ✅ | ⚠️ | Service worker guarda o app, o ffmpeg e o Piper | IA, imagem e vídeo precisam de internet sempre |

### 4.1 OpenRouter direto do navegador (BYOK)

- **Como fica:** o `cliente.js` vira `fetch` do navegador (já usa `fetch`; só saem `fs` e `stream`). A cotação, os tetos, o livro e os jobs continuam iguais. O download vai para `Blob` e é gravado na pasta da série.
- **De onde vem a chave**, duas opções:
  1. **Colar a chave.** O usuário cria no painel do OpenRouter uma chave **só para o site, com limite de crédito** (por exemplo, US$ 10). O `GET /key` já mostra `limit` e `limit_remaining`.
  2. **"Entrar com OpenRouter" (OAuth PKCE).** O site manda o usuário para `openrouter.ai/auth` e troca o código por uma chave em `POST /api/v1/auth/keys`, sem segredo e sem servidor ([doc](https://openrouter.ai/docs/guides/overview/auth/oauth)). O pré-voo desse endpoint passou no teste de hoje. A chave gerada fica na conta do próprio usuário, que pode apagá-la.
- **Riscos de guardar a chave no navegador:**
  - qualquer XSS, dependência npm maliciosa ou extensão do navegador consegue ler o `localStorage` e gastar o crédito;
  - quem usa o computador consegue ver a chave nas ferramentas do navegador.
- **Proteções:**
  1. chave dedicada, **com limite de crédito**: esse é o único teto que nenhum código da página consegue furar;
  2. botão "não lembrar" (chave só na memória da aba) e "esquecer chave";
  3. guardar cifrada com senha (WebCrypto: PBKDF2 + AES-GCM). Isso protege o disco, mas não um script rodando na página;
  4. CSP por `<meta>` com `connect-src` limitado a `openrouter.ai`, `speech.platform.bing.com`, `huggingface.co`, `*.hf.co` e `cdn.jsdelivr.net`;
  5. nunca pôr a chave no código nem no repositório. O Pages é público, mas a chave não fica lá.
- **Bônus para o portfólio:** manter o **modo simulado** (o `simulado.js` já existe) como padrão no site. Quem visita explora tudo sem chave e sem gasto.

### 4.2 Onde guardar as séries (PC e celular)

| Opção | PC | Android | iPhone | Observação |
|---|---|---|---|---|
| **Pasta real** (File System Access, `showDirectoryPicker`) | ✅ Chrome/Edge 86+ | ⚠️ Chrome 132+ (jan/2025) | ❌ | No PC, o Rafael escolhe `E:\EstudioSeriesDados` uma vez e o handle fica no IndexedDB. O Chrome 122+ oferece "permitir em todas as visitas", e o app instalado guarda a permissão sozinho ([Chrome](https://developer.chrome.com/blog/persistent-permissions-for-the-file-system-access-api)). No Android, abrir pasta funciona, mas salvar teve bugs, sem escrita atômica e com filtros ignorados ([blink-dev](https://groups.google.com/a/chromium.org/g/blink-dev/c/x3IcFv2jY6c)). O Safari e o Firefox se opõem à API ([web-features](https://web-platform-dx.github.io/web-features-explorer/features/file-system-access)) |
| **OPFS** (pasta interna do site) | ✅ | ✅ | ✅ | Rápida e boa para mídia. O usuário não vê os arquivos fora do navegador: precisa exportar |
| **IndexedDB** | ✅ | ✅ | ✅ | Bom para os JSON, os handles e a chave. Mídia grande, melhor no OPFS |

**Cota e risco de apagar** ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)):
- **Cota:** o Chrome (PC e Android) dá até 60% do disco por site; o Safari, ~60% (iOS 17+). Uma série de algumas centenas de MB cabe com folga no S23.
- **Quando falta espaço:** sem `navigator.storage.persist()`, o navegador pode **apagar tudo do site**. No Chrome, o `persist()` é aprovado sozinho conforme o uso, e instalar como app ajuda.
- **iPhone:** o Safari apaga os dados de site sem interação há 7 dias, exceto no web app instalado na Tela de Início. O armazenamento do app instalado é **separado** do Safari (3º).
- **Regra prática:** no celular, a série no OPFS é **cópia de trabalho**. A cópia "oficial" fica na pasta do PC ou na nuvem.

### 4.3 Sincronizar a mesma série entre PC e celular sem backend

| Caminho | Precisa servidor? | Bom para | Problema |
|---|---|---|---|
| **Exportar/importar `.zip`** (zip feito no navegador) | Não | Começar já; funciona em tudo | Manual. Em séries grandes, exportar só o que mudou (JSON + mídias novas) |
| **Google Drive** (Google Identity Services, "token model", escopo `drive.file`) | Não. Só um Client ID público no Google Cloud com a origem `https://upraggy.github.io` | Sincronização de verdade, PC e celular | O token vale pouco tempo (em geral 1 h): renovar com um clique, sem refresh token ([Google](https://developers.google.com/identity/oauth2/web/guides/use-token-model)). O app fica em "modo teste", o que basta para uso pessoal. O `drive.file` só enxerga o que o app criou ([escopos](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)) |
| **OneDrive** (MSAL.js para SPA com PKCE + Graph, upload em sessões) | Não. Registro de app no Azure | Igual ao Drive | Não testado aqui ([Graph SDK, 3º](https://devblogs.microsoft.com/microsoft365dev/microsoft-graph-javascript-sdk-3-0-0-is-now-generally-available/)) |
| **Repositório GitHub via API** (token do usuário) | Não | Só JSON e texto | Bloqueia arquivo > 100 MiB, repositório ideal < 1 GB e < 5 GB no máximo ([GitHub](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github)). Os vídeos enchem rápido, e é mais uma chave com escrita guardada no navegador |
| **Ajudante no PC acessado pelo celular** | Sim (o backend atual) | Usar o PC como "servidor" de casa | Página HTTPS (Pages) chamando `http://192.168.x.x` é **conteúdo misto**. O Chrome só libera com a permissão "Acesso à rede local" + `fetch(url, { targetAddressSpace: "local" })` ([Chrome](https://developer.chrome.com/blog/local-network-access)). Só funciona no Chrome e na mesma rede. Fora de casa, ou no iPhone: Tailscale com HTTPS |

**Recomendação:** começar com o **zip** e, se o uso no celular pegar, partir para o **Google Drive**. Nada de vídeo no GitHub.

### 4.4 Montagem (render), miniaturas e ondas

- **Miniaturas, ondas e quadros:** **não precisam de ffmpeg**. São feitos com `<video>` + `seek` + `canvas.drawImage` (quadro, tira de miniaturas) e `AudioContext.decodeAudioData` (picos da onda). São rápidos no PC e no celular, e a prévia da Mesa já usa Web Audio.
- **ffmpeg.wasm:**
  - **O que ele tem:** x264, libass, FreeType, HarfBuzz e FriBidi, ou seja, o mesmo `filter_complex` + `ass=` do `render.js` roda quase sem mudança ([overview](https://ffmpegwasm.netlify.app/docs/overview)).
  - **Desempenho:** a doc oficial mede **0,04×** o nativo no single-thread e **0,08×** no multi-thread ([performance](https://ffmpegwasm.netlify.app/docs/performance)). Com os 22,8 s nativos daqui, a estimativa para 60 s em 1080×1920 é de ~**9,5 min** (single) e ~**4,8 min** (multi). Um episódio de 90 s leva ×1,5.
  - **Limites:** 2 GB de memória ([FAQ](https://ffmpegwasm.netlify.app/docs/faq)) e ~32 MB para baixar uma vez.
- **COOP/COEP:** o multi-thread precisa de `SharedArrayBuffer`, que exige os cabeçalhos COOP/COEP, e o Pages **não deixa** configurar cabeçalhos. Há dois contornos:
  1. **`coi-serviceworker`**: um arquivo ao lado do `index.html` que injeta os cabeçalhos por service worker e recarrega a página na 1ª visita ([repo](https://github.com/gzuidhof/coi-serviceworker)). Efeito colateral: todo recurso de outro domínio precisa de CORS ou CORP. O jsDelivr e o Hugging Face mandam (2.3), e o OpenRouter manda CORS.
  2. **Usar o core single-thread**: não precisa de nada, é só 2× mais lento.
- **Celular com ffmpeg.wasm:** o S23 tem 8 GB, mas uma aba com WASM perto de 1–2 GB pode ser morta, e a tela apagar pausa o trabalho. Relatos de travamento são mais comuns no iOS ([issue #851](https://github.com/ffmpegwasm/ffmpeg.wasm/issues/851)). Para usar:
  - ler as entradas com `mount` (WORKERFS) em vez de copiar para a memória;
  - renderizar em **720×1280** no celular;
  - manter a tela ligada com a **Screen Wake Lock**;
  - estimativa: 10–25 min por episódio de 60 s.
- **WebCodecs + Mediabunny** (o caminho rápido):
  - **Como funciona:** decodifica os clipes, desenha cada quadro num canvas (corte 9:16, legenda, texto de tela, cartões A/B) e codifica em H.264 **pelo hardware do aparelho**. O Mediabunny monta o MP4 sem dependências ([Mediabunny](https://mediabunny.dev/guide/introduction)). O áudio sai do ffmpeg.wasm (só áudio) ou de um `OfflineAudioContext`.
  - **Desempenho:** estimativa de 0,5–2 min por episódio, também no S23.
  - **Suporte:** Chrome/Edge no PC e no Android. No iPhone, o `VideoEncoder` existe desde o iOS 16.4 e o `AudioEncoder` só no iOS 26 ([caniuse](https://caniuse.com/mdn-api_audioencoder_configure)). Confirmar AAC com `isConfigSupported()` em cada aparelho.
  - **Custo:** reescrever a composição. O ASS vira desenho no canvas, a mesma geometria do `GEOMETRIA` em `render.js` e de `mesaUtil.js`.

### 4.5 Voz (TTS) no PC e no celular

- **Edge TTS:** funciona só no **Microsoft Edge atualizado** (seção 2.2): PC, Android (Edge para Android) e iPhone (Edge para iOS, simulado por UA, sem teste em aparelho). Vem com tempos por palavra (`WordBoundary`), igual ao de hoje. É um serviço **não oficial**: quando a Microsoft muda o token, o site para até alguém atualizar o código.
- **Piper Cadu:** roda no navegador com ONNX Runtime Web ([vits-web](https://github.com/diffusionstudio/vits-web), [piper-tts-web](https://github.com/Mintplex-Labs/piper-tts-web)). O modelo de 63 MB é baixado uma vez e guardado no OPFS, e devolve um WAV em `Blob`. As listas prontas dessas bibliotecas não citam o Cadu: talvez seja preciso apontar a URL do modelo à mão. O tom em semitons (`filtro_tom_piper`) e as intenções viram filtros no ffmpeg.wasm. No S23 é mais lento que no PC, mas falas curtas são leves (estimativa).
- **Web Speech API (`speechSynthesis`):** **não gera arquivo**. Não há como gravar a saída sem gambiarra de captura de áudio ([SO, 3º](https://kiwix.lema.org/stackoverflow.com_en_all_2023-11/questions/21905583/record-html5-speechsynthesisutterance-generated-speech-to-file)). As vozes também mudam por aparelho. Serve, no máximo, para uma "prévia rápida".
- **Gravar a fala em arquivo:** Edge (MP3 vindo do WebSocket) e Piper (WAV) já entregam o arquivo. Ele é tratado e gravado na pasta da série, como hoje.

### 4.6 PWA (instalar na tela inicial, offline)

- **Android:** o Chrome oferece "Instalar app". O app abre em tela cheia, guarda o app, o ffmpeg e o Piper para uso offline, e ajuda o `persist()`.
- **iPhone:** não há botão de instalar automático: é Compartilhar → Adicionar à Tela de Início. O armazenamento é **separado** do Safari, o service worker é encerrado com mais facilidade e o trabalho para em segundo plano (3º: [MagicBell](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide)).
- **PC:** instalar como app do Chrome/Edge faz a permissão da pasta ficar guardada sozinha (4.2).
- **O que nunca fica offline:** IA de texto, imagem, vídeo, saldo e voz do Edge.

### 4.7 Toque × mouse/teclado

- A Mesa usa `pointer events`, que funcionam com toque, mas também usa atalhos de teclado e alvos pequenos na linha do tempo. O próprio código já decidiu: **no celular, só a prévia e a lista de planos** (`MesaCelular.jsx`).
- No celular ficam: Sala do showrunner, bíblia, elenco, roteiro, cotação e geração, ouvir e regerar falas, prévia, votação, render simples e compartilhar.
- A edição fina continua no PC. Um tablet de 12" talvez aguente a Mesa, mas não foi testado.

### 4.8 Confirmação de custo e teto no cliente

- **Dá para manter.** O `orcamento.js` é JS puro: a "cotação → token → gerar" continua igual, com o token na memória da aba (HMAC por WebCrypto ou um `Map` de nonces) e de uso único, para o clique duplo não pagar 2×. Os tetos por plano, episódio e série leem o livro de custos da pasta.
- **O que muda:** no backend, o token também protegia contra outro programa chamando a API. No navegador, quem tem a página tem a chave, então o token vira **trava de interface**, não de segurança.
- **O teto que ninguém fura** passa a ser o **limite de crédito da chave** no OpenRouter (4.1).
- **Job pago nunca 2×:** gravar o `jobId` no `jobs.json` logo depois do `POST` (como hoje) e, se a aba fechar, retomar pelo `GET /videos/{id}`.

---

## 5. Caminhos possíveis

### 5.1 (a) 100% estático no GitHub Pages

O que precisa:
- `base` do Vite para `/EstudioSeries/` e `HashRouter`. O `BrowserRouter` atual dá 404 no Pages ao recarregar uma rota interna.
- Deploy por GitHub Actions e repositório **público** no plano grátis ("If the account … uses GitHub Free … the repository must be public", [GitHub](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)).
- Limites do Pages: site ≤ 1 GB e 100 GB/mês de banda ([limites](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)). O ffmpeg e o Piper vêm do jsDelivr e do Hugging Face, então não pesam no site.

O que perde: vozes do Edge fora do Edge, QA Whisper, motor `narrar.py` e render rápido (até existir a versão WebCodecs). No iPhone, também a persistência sem instalar.

### 5.2 (b) Híbrido

**b1. Pages + ajudante local (o backend de hoje)**
- **O que é:** o site no Pages tenta `http://127.0.0.1:4190/Saude`. Se o ajudante responder, usa o motor local; se não, usa o motor navegador.
- **O que exige:**
  - CORS do Express liberado só para `https://upraggy.github.io`;
  - aceitar a permissão "Acesso à rede local" / "Apps no dispositivo" do Chrome 142+ ([3º](https://blog.openreplay.com/chrome-local-network-access-lna-permission/));
  - as URLs de mídia (`/Midia`) apontando para o ajudante.
- **No PC:** tudo funciona igual a hoje, inclusive a chave no ambiente, o Python e o ffmpeg nativo. Esforço: **1–2 dias**.
- **No celular:** a mesma rede não basta, por causa do conteúdo misto (4.3). Opções:
  - `fetch` com `targetAddressSpace: "local"` (só no Chrome);
  - o próprio ajudante servir a interface (`http://IP-do-PC:5190`), mas aí não é o Pages;
  - Tailscale com HTTPS.

**b2. Pages + Cloudflare Worker grátis**
- **Limites:** 100 mil chamadas/dia e 10 ms de CPU por chamada; esperar a rede não conta ([preços/limites](https://developers.cloudflare.com/workers/platform/limits)). Não roda ffmpeg nem Python e não tem disco.
- **O que resolve:**
  1. **repassar a voz do Edge** para o Chrome e o Safari (o Worker abre o WebSocket de saída com UA de Edge). É zona cinzenta: serviço não oficial;
  2. **repassar o download do vídeo**, se o arquivo vier de um domínio sem CORS.
- **Chave:** a chave **não** deve morar no Worker. Continua BYOK, para o Rafael não pagar o uso de outras pessoas.
- **Esforço:** 1 dia cada.

### 5.3 (c) Recomendação: um frontend, dois motores

1. **Mantém o que existe:** o `Abrir Estudio.vbs` e o backend continuam como "modo completo" no PC.
2. **O site no Pages usa o motor navegador** quando não acha o ajudante, e o modo simulado é o padrão para visitantes.
3. **Ponto de troca único:**
   - `fetchFunc.js`: `fetchGet`/`fetchPost` chamam `rotasNavegador[rota](params)` em vez de `fetch`;
   - `GlobalVar.serverBase` e `midiaUrl`: no modo navegador, viram URLs `blob:` lidas da pasta ou do OPFS.

   As telas não mudam. Os outros agentes podem seguir no frontend sem conflito, porque o adaptador é um arquivo novo.
4. **Porte do backend:** os módulos puros (`validar.js`, `prompts.js`, `parametros.js`, `legendas.js`, `memoria/*`, `orcamento.js`, `catalogo.js`) passam de CommonJS para ESM. O `fs` vira um "armazém" com dois lados (pasta real / OPFS), e `crypto` vira WebCrypto.

---

## 6. Esforço estimado e ordem de trabalho

Dias de trabalho com IA ajudando; incerteza de ±30%.

| # | Etapa | PC | Celular | Dias |
|---|---|---|---|---|
| 1 | Base do Pages: `base`, `HashRouter`, Actions, CSP, modo simulado como padrão | ✅ | ✅ | 0,5–1 |
| 2 | Adaptador "backend no navegador" + porte dos módulos puros para ESM | ✅ | ✅ | 3–4 |
| 3 | Armazém: pasta real (PC/Android) + OPFS (Android/iPhone) + mídia como `blob:` + `persist()` | ✅ | ✅ | 2–3 |
| 4 | OpenRouter no navegador: chave (colar e PKCE), cotação em 2 passos, livro, jobs, retomar, download | ✅ | ✅ | 2 |
| 5 | Mesa sem ffmpeg: miniaturas, onda e quadro por canvas e Web Audio | ✅ | ✅ | 1 |
| 6 | Voz: Piper Cadu WASM + Edge (só no Edge) + intenções e tratamento no ffmpeg.wasm (áudio) + legendas | ✅ | ✅ | 3–4 |
| 7 | Render com ffmpeg.wasm (mesmo `filter_complex` + ASS + fontes livres) + progresso | ✅ | ⚠️ | 2–3 |
| 8 | PWA (instalar, offline) + exportar/importar `.zip` + Web Share | ✅ | ✅ | 1,5–2 |
| 9 | Testes reais: PC (Chrome e Edge), S23 e iPhone, se houver | ✅ | ✅ | 2 |
| | **Subtotal: estático funcionando nos dois** | | | **≈ 17–22** |
| 10 | Render com WebCodecs + Mediabunny (rápido, bom no celular) | ✅ | ✅ | +4–6 |
| 11 | Sincronizar com Google Drive | ✅ | ✅ | +2–3 |
| 12 | (opcional) Worker para a voz do Edge no Chrome e no Safari | ✅ | ✅ | +1 |
| — | **Alternativa mínima: híbrido b1** (Pages + ajudante no PC) | ✅ | ⚠️ | 1–2 |

**Ordem sugerida:**
1. Etapas **1 a 4**, que dão ~8–10 dias. Com elas, Sala, showrunner, imagem, vídeo e cotação funcionam no PC e no S23, e a voz e o render continuam pelo ajudante quando ele está ligado.
2. Etapas **5, 6 e 8**: a Mesa ganha mídia e voz, e o site vira app instalável.
3. Etapa **7**, que deixa o render 100% no navegador no PC.
4. Etapa **10**, para render no celular sem sofrimento.
5. Etapas **11 e 12** só se o uso no celular pegar.

**Antes de começar, o Rafael decide:**
- se o repositório pode ser **público** (ou se vale pagar o GitHub Pro);
- se a chave entra **colada** ou pelo **login do OpenRouter**;
- se a 1ª versão aceita **render lento** (ffmpeg.wasm) ou espera o WebCodecs.

**Pendências que só a 1ª geração paga responde (com OK do Rafael):**
- o download do vídeo pelo navegador (redirecionamento e CORS do arquivo final);
- se o `frame_images` com data URL funciona. Esta já estava pendente em `backend/src/openrouter/API.md`.
