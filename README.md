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
- **Documentação:** `docs\` (contratos, interface, áudio, memória, prompt mestre e pesquisas).
- **Log:** `logs\`.
