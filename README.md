# Estúdio de Séries

Cria minisséries verticais (9:16, episódios de duração livre: de 5 s a 10 min, com escolhas A/B a partir de 20 s) com IA pelo OpenRouter: roteiro, elenco e locais consistentes, narração em português, vídeo por plano e montagem.

## Abrir
- **Duplo clique em `Abrir Estudio.vbs`**. Ele sobe tudo sem janela de terminal e abre o navegador em http://127.0.0.1:5190.
- Para fechar: **`Parar Estudio.vbs`**.
- Para ter atalhos na Área de Trabalho, clique com o botão direito em `criar-atalho.ps1` e escolha **"Executar com o PowerShell"**. Isso cria os atalhos "Estúdio de Séries" e "Parar Estúdio de Séries", com ícone.

Pelo terminal (opcional):
- `npm run dev`: sobe o modo real; as gerações pagas só rodam depois que você confirma o custo na tela.
- `npm run dev:simulado`: sobe sem nenhum gasto.
- `npm run parar`: para tudo.

Primeira vez numa máquina nova: `npm install` na pasta e dentro de `frontend\`.

## Site publicado (GitHub Pages)
O frontend também sai como site estático (`npm --prefix frontend run build:pages`), que usa o Estúdio aberto no PC (motor híbrido). Passo a passo e limites: `docs\PUBLICAR-NO-PAGES.md`.

## Onde ficam as coisas
- **Séries:** `E:\EstudioSeriesDados\series\<série>\`, uma pasta por série.
- **Documentação:** `docs\`. Comece por **`docs\PROGRESSO.md`** (o que está pronto, o que falta e o mapa dos outros docs).
- **Versão sem backend (PC e celular):** projeto irmão `EstudioSeriesWeb`, no ar em https://upraggy.github.io/EstudioSeriesWeb/.
- **Log:** `logs\`.

## Apagar, refazer e restaurar (nada é destruído)
- **Apagar série:** na Sala, botão "⋯" do cabeçalho → "Apagar série" (ou o "⋯" do pôster em Séries). Digite o nome da série para confirmar. A pasta inteira vai para `E:\EstudioSeriesDados\_lixeira\<data>-<série>\`.
- **Apagar episódio:** na página do episódio (Sala → Episódios → pôster), "⋯" → "Apagar episódio". A pasta `episodios\epNN` vai para `_lixeira\<data>-<série>-epNN\`. Episódio com votação registrada não pode ser apagado.
- **Refazer o roteiro do zero:** na página do episódio, "Refazer roteiro do zero". O roteiro antigo (e falas, edição, legendas e montagem feitas a partir dele) fica em `episodios\epNN\_versoes\<data>\`; os takes de vídeo e as imagens pagos não saem do lugar. Depois você confirma o custo e o showrunner escreve o roteiro novo.
- **Voltar a uma versão do roteiro:** na página do episódio, "⋯" → "Versões do roteiro". A lista mostra cada versão guardada (data, título, duração, o que ela tem e a memória guardada junto); "Voltar a esta versão" pede confirmação e **guarda antes a versão atual** numa pasta nova de `_versoes` (dá para ir e voltar). Recusa enquanto houver geração paga, regeração de trecho ou montagem rodando.
- **Memória da série:** ao apagar um episódio ou refazer o roteiro, os fatos e o resumo que vieram daquele episódio saem da memória viva (os outros episódios não mudam) e ficam guardados junto, em `memoria\` dentro do item da lixeira ou da versão; restaurar devolve. Fato sem origem identificável, termos do glossário e o `estado.json` ficam, com aviso na tela.
- **Restaurar:** em Séries, botão "Lixeira" → "Restaurar" (aparece quando há algo na lixeira). À mão: mova a pasta de dentro do item da lixeira de volta para `series\` (série) ou para `series\<série>\episodios\` (episódio) e, no caso do episódio, devolva a linha `entrada` do `motivo.json` ao `episodios` do `serie.json`. Versão do roteiro: mova os arquivos de `_versoes\<data>\` de volta para a pasta do episódio e acrescente `memoria\fatos.jsonl` da versão ao `memoria\fatos.jsonl` da série (e mova `resumos\`/`propostas\` de volta).
- O Estúdio nunca esvazia a lixeira: para liberar espaço, apague a pasta à mão. Detalhes em `docs\CONTRATOS.md`.
