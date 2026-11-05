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

## Site sem backend (GitHub Pages, PC e celular)
Esta pasta é a **versão web**: o mesmo Estúdio também roda inteiro dentro do navegador, sem servidor. O próprio backend é empacotado para o navegador e as séries ficam no armazenamento do site ou numa pasta do computador. Sem chave, tudo funciona no modo simulado (nada é cobrado); com a chave do OpenRouter (colada ou pelo botão "Entrar com OpenRouter"), gera de verdade, sempre com cotação antes.
- **No ar:** https://upraggy.github.io/EstudioSeriesWeb/ (publica sozinho a cada push na `main`, depois dos testes).
- Como funciona: `docs\MOTOR-NAVEGADOR.md`.
- Publicar: `docs\PUBLICAR-NO-PAGES.md`.
- Andamento: `docs\PROGRESSO.md`.
- Testar como publicado: `npm --prefix frontend run build:pages` e `npm --prefix frontend run preview:pages` (http://127.0.0.1:5296).

Ainda precisam do Estúdio do PC: vozes, mixagem, miniaturas da Mesa e montagem final.

## Onde ficam as coisas
- **Séries:** `E:\EstudioSeriesDados\series\<série>\`, uma pasta por série.
- **Documentação:** `docs\` (contratos, interface, áudio, memória, prompt mestre e pesquisas).
- **Log:** `logs\`.
