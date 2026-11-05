# Publicar o Estúdio no GitHub Pages (motor híbrido) — 04/11/2026

Primeiro passo do plano de `PUBLICAR-SEM-BACKEND.md`. O site publicado é **a interface**; o trabalho pesado (pastas das séries, vozes, IA, montagem) continua no **Estúdio do PC** (`Abrir Estudio.vbs`). O site procura o PC em `http://127.0.0.1:4190` e:

| Situação | O que o site faz |
|---|---|
| Estúdio aberto no PC | Conecta, avisa "Conectado ao Estúdio do PC" e funciona igual ao `http://127.0.0.1:5190` |
| Estúdio fechado | Mostra a tela "Conecte o Estúdio do seu PC": o que falta, como resolver, botão "Procurar de novo" e "Mudar endereço" |
| Celular | Ainda não alcança o PC (ver `PUBLICAR-SEM-BACKEND.md` §5.2). Por enquanto, use pelo computador |

O motor que roda **dentro do navegador** (sem o PC) é a próxima etapa (etapas 2–4 do plano).

## Como funciona (para quem mexer no código)
- `frontend/.env.pages`: `VITE_DESTINO=pages` e o endereço padrão do PC (`VITE_AJUDANTE`). Nada secreto.
- `frontend/vite.config.js`: no modo `pages`, caminhos relativos (`base: './'`, serve em qualquer `/<repositório>/`), saída em `frontend/dist-pages` e o arquivo `.nojekyll`.
- `frontend/src/components/funcionalidades/motor.js`: procura o PC (`GET /api/Saude`, espera até 20 s porque o Chrome pode abrir uma pergunta de permissão) e troca `GlobalVar.serverBase`. Ponto único: `fetchFunc.js` e as URLs de mídia só usam o `serverBase`.
- `frontend/src/routes.jsx`: no Pages usa `HashRouter` (as rotas ficam depois do `#`, então recarregar não dá 404) e mostra `SemMotor.jsx` enquanto não houver PC.
- `backend/src/index.js`: CORS libera a própria máquina e `https://upraggy.github.io` (troque com `ESTUDIO_ORIGENS="https://outro.github.io"`), e responde `Access-Control-Allow-Private-Network: true` ao pré-voo de rede local do Chrome. Testado em `backend/test/saude.test.js`.
- Rodando local, nada muda: `npm run dev` e o `Abrir Estudio.vbs` continuam com `/api` na mesma origem.

## Testar como se estivesse publicado
```bash
npm --prefix frontend run build:pages
```
```bash
npm --prefix frontend run preview:pages
```
Abra `http://127.0.0.1:5196/`. Com o Estúdio aberto ele conecta; para ver a tela sem PC, use "Mudar endereço" com uma porta qualquer (ex.: `127.0.0.1:4999`).

## Publicar (quando o Rafael decidir)
1. Criar o repositório no GitHub (conta **UPraggy**). No plano grátis o Pages exige repositório **público**: o código fica visível, mas **nenhum dado de série e nenhuma chave** vão junto (os dados ficam em `E:\EstudioSeriesDados`; a chave só no ambiente do PC; `.gitignore` já exclui `logs/`, `dist`, `.env`).
2. Antes do primeiro commit: conferir que não há chave em nenhum arquivo (`git grep -n "sk-or-"` tem que voltar vazio).
3. Commit e push da pasta `EstudioSeries` para a branch `main` (autor só o Rafael).
4. No GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**. O workflow `.github/workflows/pages.yml` compila o `frontend` no modo `pages` e publica.
5. O site fica em `https://upraggy.github.io/<nome-do-repositório>/`. Se o nome da conta mudar, ajuste `ESTUDIO_ORIGENS` no PC.
6. No PC, com o Estúdio aberto, abrir o site. Na primeira vez o Chrome pergunta se o site pode **acessar apps e serviços do dispositivo**: Permitir.

## Limites conhecidos
- Navegadores: Chrome e Edge funcionam. O Safari costuma bloquear um site HTTPS chamando `http://127.0.0.1`.
- O site publicado só funciona no mesmo PC onde o Estúdio está aberto (o backend escuta só em `127.0.0.1`, de propósito).
- Quem abrir o site sem o Estúdio vê só a tela de conexão: nada da série nem da chave fica exposto.
