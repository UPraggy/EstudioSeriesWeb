# Publicar o Estúdio de Séries Web no GitHub Pages

O site publicado **roda sozinho no navegador** (motor do navegador, `docs/MOTOR-NAVEGADOR.md`), no PC e no celular. Quem abre sem chave cai no **modo simulado**: explora tudo e nada é cobrado. O "Estúdio do PC" (`Abrir Estudio.vbs`) continua existindo e pode ser ligado em **Configurações → Onde o Estúdio roda**.

| Situação | O que o site faz |
|---|---|
| Visita normal (PC ou celular) | Abre o motor do navegador: séries guardadas no próprio navegador (OPFS), modo simulado até ter chave |
| Com chave (colada ou "Entrar com OpenRouter") | Gera de verdade, sempre com cotação antes e confirmação |
| "Usar uma pasta do computador" (Chrome/Edge no PC) | Trabalha direto na pasta escolhida (ex.: `E:\EstudioSeriesDados`) |
| Configurações → "Estúdio do PC" | Procura o Estúdio em `http://127.0.0.1:4190` (motor híbrido de 04/11) |

## Antes de publicar (conferido em 05/11/2026)
- `git grep -n "sk-or-"` só acha a chave **falsa** dos testes (`backend/test/fixtures/openrouter-ajuda.js`), o teste dela, o filtro que apaga chaves (`backend/src/openrouter/erros.js`), os textos da tela que explicam o formato (`Configuracoes.jsx`, `chave.js`) e esta documentação.
- Nenhum dado de série vai junto: as séries ficam no navegador de cada um ou em `E:\EstudioSeriesDados` (fora do repositório). `docs/exemplos/` tem o roteiro de exemplo do Farol (texto), que fica público junto com o código.
- Autor dos commits: só o Rafael (`100146657+UPraggy@users.noreply.github.com`). O gancho `.githooks/commit-msg` recusa co-autor de IA.

## No ar desde 05/11/2026
- Site: https://upraggy.github.io/EstudioSeriesWeb/
- Repositório (público): https://github.com/UPraggy/EstudioSeriesWeb
- Cada push na `main` que mexa em `frontend/`, `backend/`, `package*.json` ou no workflow roda `npm run test:ci` (todos os testes menos os 3 que precisam do vozes.json do NarradorVideo, do ffmpeg e do Python) e publica. Os passos abaixo ficam como registro.

## Passo a passo (feito)
1. Criar o repositório na conta **UPraggy** (nome sugerido: `EstudioSeriesWeb`). No plano grátis, o Pages exige repositório **público** (o código fica visível; chaves e séries não).
2. `git remote add origin https://github.com/UPraggy/EstudioSeriesWeb.git` e `git push -u origin main`.
3. No GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. O workflow `.github/workflows/pages.yml` instala, roda `npm run test:ci` (backend + motor do navegador, sem as ferramentas do PC) e publica `frontend/dist-pages`. Ele roda a cada push na `main` que mexa em `frontend/`, `backend/` ou no próprio workflow (ou à mão em Actions → "Run workflow").
5. O site fica em `https://upraggy.github.io/EstudioSeriesWeb/`.
6. Para usar o "Estúdio do PC" a partir do site publicado: no PC, o backend já libera `https://upraggy.github.io` (troque com `ESTUDIO_ORIGENS` se o endereço mudar). Na primeira vez o Chrome pergunta se o site pode **acessar apps e serviços do dispositivo**: Permitir.

## Testar como se estivesse publicado
```bash
npm --prefix frontend run build:pages
```
```bash
npm --prefix frontend run preview:pages
```
Abra http://127.0.0.1:5296/ (portas desta pasta: 5296 prévia, 5297 desenvolvimento com recarga, `npm --prefix frontend run dev:pages`; o `EstudioSeries` original usa 5196).

## Limites conhecidos
- **Vozes, mixagem, miniaturas da Mesa e montagem** ainda precisam do Estúdio do PC (etapas 5 a 7 de `PUBLICAR-SEM-BACKEND.md`). No site elas avisam e não fazem nada.
- **iPhone/Safari**: sem escolher pasta; as séries ficam no navegador e o Safari apaga dados de sites não usados há 7 dias, a menos que o site seja adicionado à Tela de Início.
- O **download do vídeo pronto** pelo navegador só será confirmado na primeira geração paga (pode vir de outro domínio; ver `MOTOR-NAVEGADOR.md`, "Dinheiro no navegador").
