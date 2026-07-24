# Deploy em produção: Cloudflare Pages + Render + Neon

Este documento lista os ajustes necessários para hospedar o projeto assim:

- **Client** (Vite/React, `client/`) → **Cloudflare Pages**
- **Server** (Express/tRPC, `server/`) → **Render** (Web Service via Docker)
- **Banco de dados** (Postgres) → **Neon**

O código já está preparado para isso (URLs, porta e CORS vêm de variáveis de
ambiente, nada é hardcoded para `localhost` fora de fallbacks locais). O
trabalho é essencialmente de configuração nos três painéis, na ordem abaixo —
existe uma dependência circular de URLs (client precisa da URL do server, e o
server precisa da URL do client no CORS), então a ordem importa.

---

## Ordem recomendada

1. Neon (banco)
2. Render (server) — usando uma `CORS_ORIGIN` provisória
3. Cloudflare Pages (client) — usando a URL do Render
4. Voltar no Render e corrigir `CORS_ORIGIN` com a URL final do Cloudflare

---

## 1. Neon (banco de dados)

1. Crie um projeto no Neon (ex.: `painel-indicadores`), região mais próxima do
   Render (idealmente **US East**, já que o free tier do Render também roda em
   Oregon/Virginia — menor latência banco↔server).
2. No painel do Neon, copie a **connection string** do branch `main`.
   - Use a versão **direta** (sem `-pooler` no host), não a "Pooled connection".
     O server mantém seu próprio `pg.Pool` de vida longa (via
     `drizzle(process.env.DATABASE_URL)` em `server/db.ts`); o pooler do Neon
     (PgBouncer em modo transaction) pode conflitar com prepared statements. Para
     um serviço único no Render, a conexão direta é mais simples e suficiente.
   - A string já vem com `?sslmode=require`, o que é exigido pelo Neon — não
     precisa alterar nada no código, o driver `pg` já entende esse parâmetro.
3. Essa string vira a variável `DATABASE_URL` no Render (passo 2).
4. **Não precisa rodar migração manual antes do deploy.** O
   `server/docker-entrypoint.sh` já roda `node migrate.mjs` e `node seed-db.mjs`
   a cada boot do container — ambos são idempotentes (drizzle rastreia as
   migrações aplicadas; o seed verifica `COUNT(*) FROM companies` antes de
   inserir dados de exemplo). Ou seja: no primeiro deploy do Render, o schema é
   criado e o usuário admin + dados de exemplo são semeados automaticamente.
5. **Antes do primeiro deploy**, defina uma senha de admin forte via
   `SEED_ADMIN_PASSWORD` (ver passo 2) — não deixe a senha default
   `TrocarSenha123!` do `.env.example` ir para produção.

---

## 2. Render (server)

1. New → **Web Service** → conecte o repo `nbs-desenvolvimento/painel-indicadores`.
2. Configurações do serviço:
   - **Root Directory**: `server`
   - **Environment**: `Docker`
   - **Dockerfile Path**: `Dockerfile` (relativo ao root directory acima, ou
     seja `server/Dockerfile`)
   - **Region**: a mesma escolhida no Neon
   - **Instance Type**: Free (ok para validar; free tier "dorme" após
     inatividade e tem cold start de ~30-60s — considere o plano Starter se
     isso for um problema para os usuários)
3. **Environment Variables** (aba Environment):
   | Variável | Valor |
   |---|---|
   | `DATABASE_URL` | connection string do Neon (passo 1) |
   | `JWT_SECRET` | string aleatória longa — gere com `openssl rand -base64 48` |
   | `CORS_ORIGIN` | provisório: `https://painel-indicadores.pages.dev` (ajustar no passo 4 com a URL real/domínio custom) |
   | `SEED_ADMIN_EMAIL` | e-mail do admin inicial |
   | `SEED_ADMIN_PASSWORD` | senha forte, troque após o primeiro login |
   | `NODE_ENV` | `production` |

   **Não defina `PORT` manualmente** — o Render injeta essa variável
   automaticamente e o servidor já lê `process.env.PORT`
   (`server/_core/index.ts`), então funciona sem alteração de código.
4. **Health Check Path**: pode deixar em branco/default. Não existe rota `GET /`
   dedicada (só `/api/trpc/*` e `/api/export/*`), então um `GET /` puro
   devolve 404 — isso é inofensivo, o Render por padrão só verifica se a porta
   aceita conexão TCP.
5. Deploy. Ao final, anote a URL pública gerada, ex.:
   `https://painel-indicadores-server.onrender.com`. Essa é a `VITE_API_URL`
   do passo 3.
6. Teste rápido: `curl https://<sua-url>.onrender.com/api/trpc/...` ou apenas
   confira nos logs do Render que apareceram as linhas `[Migrate] Migrations
   applied.` e a mensagem do seed com o e-mail/senha do admin.

---

## 3. Cloudflare Pages (client)

1. Workers & Pages → **Create application** → **Pages** → **Connect to Git** →
   selecione o mesmo repositório.
2. Build settings:
   - **Root directory**: `client`
   - **Build command**: `pnpm build`
   - **Build output directory**: `dist`
   - Cloudflare detecta o `pnpm-lock.yaml` e instala as dependências
     automaticamente antes do build (não precisa configurar install command à
     parte); o `packageManager` do `client/package.json` fixa a versão do
     pnpm usada.
3. **Environment variables** (Settings → Environment variables, na aba
   **Build**, não runtime — o Vite injeta `VITE_*` em tempo de build):
   | Variável | Valor |
   |---|---|
   | `VITE_API_URL` | URL do Render do passo 2 (ex. `https://painel-indicadores-server.onrender.com`) |
   | `NODE_VERSION` | `22` (o Dockerfile local usa `node:22-alpine`; sem essa var o Cloudflare pode usar uma versão default divergente) |

   Configure essas variáveis tanto em **Production** quanto em **Preview** (o
   Cloudflare Pages trata os dois ambientes separadamente).
4. **Roteamento SPA**: o app usa rotas client-side (`wouter`). Localmente o
   `nginx.conf` resolve isso com `try_files ... /index.html`, mas o Cloudflare
   Pages não lê esse arquivo. É preciso criar
   `client/public/_redirects` com o conteúdo:
   ```
   /*  /index.html  200
   ```
   Sem isso, recarregar a página em uma rota como `/dashboard/areas`
   (ou compartilhar o link direto) retorna 404 do Cloudflare.
5. Deploy. Anote o domínio gerado, ex.: `https://painel-indicadores.pages.dev`
   (ou configure um domínio próprio em Custom Domains).

---

## 4. Fechar o ciclo: CORS

1. Volte ao Render → Environment → edite `CORS_ORIGIN` para o(s) domínio(s)
   reais do Cloudflare Pages, separados por vírgula se houver mais de um
   (ex.: domínio `.pages.dev` + domínio custom):
   ```
   CORS_ORIGIN=https://painel-indicadores.pages.dev,https://painel.suaempresa.com.br
   ```
   (o código já suporta múltiplas origens: `ENV.corsOrigin.split(",")` em
   `server/_core/index.ts`).
2. Salve — o Render reinicia o serviço automaticamente ao mudar uma env var.
3. Não é necessário `credentials: true` no CORS: a autenticação usa Bearer
   token no header `Authorization` via `localStorage` (não usa cookies
   cross-origin), então o `cors()` simples já configurado é suficiente.

---

## Checklist final de validação

- [ ] Login funciona a partir do domínio do Cloudflare Pages (sem erro de CORS
      no console do navegador)
- [ ] Logos (`/logo-painel-azul.png`, `/logo-painel-branco.png`,
      `/logo-nbs-branco.png`, `/nbs_logo_cinza.png`) carregam — devem estar em
      `client/public/`, servidos como estáticos pelo Cloudflare Pages
- [ ] Recarregar a página em uma rota interna (ex. `/lancamentos`) não dá 404
      (valida o `_redirects`)
- [ ] Exportação de Excel (`/api/export/excel`) funciona — usa `API_URL`
      diretamente via `fetch`, então também depende do `VITE_API_URL` correto
- [ ] Trocar a senha do admin seed (`SEED_ADMIN_PASSWORD`) após o primeiro
      acesso, se ainda não tiver usado uma senha definitiva
- [ ] Conferir nos logs do Render que não há reconexões constantes ao Neon
      (sinal de cold start do free tier ou de `DATABASE_URL` apontando para o
      endpoint pooled por engano)

## O que **não** precisa mudar no código

- Porta do server: já lê `process.env.PORT` (Render injeta automaticamente)
- CORS: já é configurável via `CORS_ORIGIN` (múltiplas origens via vírgula)
- Conexão com banco: `drizzle(process.env.DATABASE_URL)` funciona com
  qualquer Postgres, incluindo a string do Neon com `sslmode=require`
- URL da API no client: já é configurável via `VITE_API_URL` em build-time
- Migração/seed: já rodam automaticamente no boot do container
  (`docker-entrypoint.sh`), de forma idempotente

## O que precisa ser criado/ajustado

- [ ] `client/public/_redirects` (novo arquivo, ver passo 3.4)
- [ ] Variáveis de ambiente nos três painéis (Neon só gera a connection
      string; Render e Cloudflare precisam das tabelas acima)
- [ ] `JWT_SECRET` e `SEED_ADMIN_PASSWORD` fortes, diferentes dos valores de
      exemplo do `.env.example`
