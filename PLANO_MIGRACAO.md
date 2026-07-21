# Plano de Migração — Passo a Passo

> Baseado em `DIAGNOSTICO_MIGRACAO.md` e nas decisões fechadas na seção 9 daquele documento.
> Cada fase é independente, termina em um commit, e deixa o projeto num estado que builda e
> passa nos testes — não avance para a próxima fase com a anterior quebrada.

## Decisões que este plano assume como fechadas

(copiadas de `DIAGNOSTICO_MIGRACAO.md` §9, para não perder o contexto ao longo da execução)

1. `notifyOwner` → **removida**, sem substituto.
2. Bootstrap do admin → **seed script** cria um usuário admin com **senha fixa** (documentada).
3. `calcEngine.ts` → **duplicado** entre client e server. Nenhum código compartilhado sob nenhuma
   hipótese — client e server só se falam via API HTTP.
4. Sessão → **`Authorization: Bearer`** guardado em `localStorage` no client, token JWT com **7 dias**
   de validade, **sem refresh**. Nada de cookie de sessão.
5. Ambiente de validação (Docker Compose) → resolvido da forma mais simples dado o item 4: como não
   há cookie, não há problema de `SameSite`/cross-site a resolver — CORS simples (sem
   `credentials: true`) é suficiente, sem necessidade de proxy reverso nem HTTPS local.
6. `template.json` → **apagado**.
7. Dependências possivelmente não usadas (`@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`,
   `@types/google.maps`) → **removidas**.

---

## Visão geral das fases

| # | Fase | O que muda | Depende de |
|---|---|---|---|
| 0 | Baseline | `git init` + commit do estado atual intocado | — |
| 1 | Remover acoplamento morto | Deleta tudo que é Manus e não é usado (LLM, storage, maps, heartbeat, notify, debug collector) | 0 |
| 2 | Banco: MySQL → Postgres | Schema, `db.ts`, `drizzle.config.ts`, `seed-db.mjs`, migrations | 1 |
| 3 | Autenticação JWT local | OAuth → login por senha, Bearer token, gestão de usuários pelo admin | 2 |
| 4 | Separar client/server | Elimina `shared/`, duplica `calcEngine`, dois pacotes independentes | 3 |
| 5 | Docker Compose | Dockerfiles + `docker-compose.yml` (db + server + client) | 4 |
| 6 | Limpeza final e validação | Docs, checklist end-to-end, revisão de dependências | 5 |

---

## Fase 0 — Baseline

**Objetivo:** ter um ponto de partida versionado para poder revisar diffs fase a fase e reverter se
algo der errado.

1. `git init` na raiz do projeto.
2. `pnpm install` e confirmar que o projeto builda no estado atual (`pnpm check`, `pnpm build`) —
   sanity check antes de qualquer mudança.
3. Commit: `chore: snapshot do projeto antes da migração`.

**Critério de pronto:** repositório git criado, primeiro commit feito, build atual funcionando.

---

## Fase 1 — Remover código morto e features exclusivas da Manus

**Objetivo:** tirar do caminho tudo que não é usado pela lógica de negócio real, antes de mexer em
banco ou autenticação — reduz o volume de arquivos que as próximas fases precisam tocar.

### Deletar por completo

- `server/_core/llm.ts`
- `server/_core/imageGeneration.ts`
- `server/_core/voiceTranscription.ts`
- `server/_core/map.ts`
- `server/_core/dataApi.ts`
- `server/_core/heartbeat.ts`
- `server/_core/notification.ts`
- `server/storage.ts`
- `server/_core/storageProxy.ts`
- `client/src/components/ManusDialog.tsx`
- `client/public/__manus__/` (pasta inteira: `debug-collector.js`, `version.json`)
- `template.json` (decisão #6)

### Editar

- `server/_core/systemRouter.ts` — remover o procedure `notifyOwner` e o import de
  `./notification`; o router fica só com `health`.
- `server/_core/index.ts` — remover import/chamada de `registerStorageProxy`.
- `vite.config.ts` — remover a função `vitePluginManusDebugCollector` e seu uso, remover import e
  uso de `vitePluginManusRuntime`; em `server.allowedHosts`, remover os domínios `*.manus*.computer`
  /`*.manuscomputer.ai`/`*.manusvm.computer`, mantendo só `localhost`/`127.0.0.1`.
- `client/index.html` — remover a tag `<script defer src="%VITE_ANALYTICS_ENDPOINT%/umami" ...>`.
- `package.json` — remover as dependências que só existiam para o que foi deletado acima:
  `vite-plugin-manus-runtime`, `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`,
  `@types/google.maps` (decisão #7). **Não** remover `axios`/`cookie`/`jose` ainda — ainda estão em
  uso pelo fluxo OAuth atual, saem na Fase 3.

**Verificação:** `pnpm check` deve apontar exatamente os imports quebrados esperados (nenhum,
idealmente, já que confirmamos por grep que nada mais referencia esses arquivos). `pnpm build` e
`pnpm test` continuam passando.

**Commit:** `chore: remover código morto e features exclusivas da Manus (LLM, storage, maps, heartbeat, notifyOwner, debug collector)`

---

## Fase 2 — Banco de dados: MySQL → PostgreSQL

**Objetivo:** trocar o dialeto do banco sem alterar a estrutura de domínio, e já aproveitar para
adicionar os campos de autenticação local que a Fase 3 vai precisar (evita gerar migration duas
vezes).

### `package.json`

- Remover `mysql2`.
- Adicionar `pg` (dependency) e `@types/pg` (devDependency).

### `drizzle.config.ts`

- `dialect: "mysql"` → `dialect: "postgresql"`.

### `drizzle/schema.ts`

- Trocar imports de `drizzle-orm/mysql-core` por `drizzle-orm/pg-core`
  (`pgTable`, `pgEnum`, `integer`, `serial`, `doublePrecision`, `boolean`, `varchar`, `text`,
  `timestamp`, `uniqueIndex`).
- `mysqlTable(...)` → `pgTable(...)` em todas as tabelas.
- `id: int("id").autoincrement().primaryKey()` → `id: serial("id").primaryKey()`.
- `int("...")` genérico (FKs, `sortOrder`, `year`, `month`, etc.) → `integer("...")`.
- `double("...")` → `doublePrecision("...")`.
- `mysqlEnum("role", [...])` → `pgEnum("role", [...])` declarado uma vez no topo do arquivo e
  referenciado nas colunas (padrão do Drizzle para Postgres).
- Remover todo `.onUpdateNow()` — não existe equivalente automático no dialeto Postgres do Drizzle.
  Cada função em `db.ts` que faz `update` precisa passar `updatedAt: new Date()` explicitamente no
  `set` (listar: `updateCompany`, `updateArea`, `updatePerspective`, `updateIndicator`,
  `updateObjective`, `updateCalibrationRule`).
- **Campos novos na tabela `users`, já aproveitando esta reescrita** (evita gerar migration duas
  vezes):
  - Remover `openId` (era o identificador Manus, não existe mais).
  - `email` passa a ser `.notNull().unique()` (hoje é opcional e não-único).
  - Adicionar `passwordHash: varchar("passwordHash", { length: 255 }).notNull()`.
  - Manter `name`, `role`, `createdAt`, `updatedAt`, `lastSignedIn`; remover `loginMethod` (era
    "email"/"google"/"apple"/etc. do OAuth Manus, sem sentido em login local único).

### `server/db.ts`

- `import { drizzle } from "drizzle-orm/mysql2"` → `import { drizzle } from "drizzle-orm/node-postgres"`
  e `import { Pool } from "pg"`; a conexão passa a ser
  `_db = drizzle(new Pool({ connectionString: process.env.DATABASE_URL }))`.
- Todo `.onDuplicateKeyUpdate({ set })` → `.onConflictDoUpdate({ target: <coluna(s) únicas>, set })`:
  - `setWeight` → `target: [areaPerspectiveWeights.areaId, areaPerspectiveWeights.perspectiveId]`
    (bate com o `uniqueIndex("uq_area_persp")`).
  - `setApplicability` / `setApplicabilityForIndicator` → `target: [indicatorAreaApplicability.indicatorId, indicatorAreaApplicability.areaId]`
    (`uq_ind_area`).
  - `upsertEntry` → `target: [indicatorEntries.indicatorId, indicatorEntries.year, indicatorEntries.month]`
    (`uq_ind_period`).
  - A função `upsertUser` é reescrita do zero na Fase 3 (vira `createUser`/`getUserByEmail`), não
    precisa portar aqui.
- Todo `const [res] = await db.insert(...).values(...)` seguido de `res.insertId` → adicionar
  `.returning({ id: <tabela>.id })` ao insert e usar `res[0].id` (afeta `createCompany`, `createArea`,
  `createPerspective`, `createIndicator`, `createObjective`, `createCalibrationRule`,
  `createImportLog`).

### Migrations

- Apagar `drizzle/0001_*.sql`, `0002_*.sql`, `0003_*.sql` e `drizzle/meta/*` (migrations antigas em
  dialeto MySQL — não há dado de produção a preservar, confirmado no diagnóstico).
- Rodar `pnpm db:push` (ou `drizzle-kit generate` + `drizzle-kit migrate`) contra um Postgres local
  para gerar a primeira migration limpa em Postgres, já com os campos de auth.

### `seed-db.mjs`

- Trocar a conexão de `mysql.createConnection` (pacote `mysql2`) para `pg` (`new pg.Client(...)` ou
  reaproveitar o `getDb()` do Drizzle).
- Ajustar qualquer sintaxe SQL específica de MySQL para Postgres (esperado: `ON DUPLICATE KEY
  UPDATE` → `ON CONFLICT ... DO UPDATE`, crases → aspas duplas se houver identificadores citados).
- **Não** criar o usuário admin ainda — isso entra na Fase 3, quando o hash de senha existir.

**Verificação:** subir um Postgres local (`docker run --rm -e POSTGRES_PASSWORD=... -p 5432:5432
postgres:16-alpine` só para teste, ou já adiantar o serviço do Compose da Fase 5), rodar `pnpm
db:push`, confirmar tabelas criadas, rodar `pnpm test` (os testes de `calcEngine`/`calibrationRules`
não tocam banco e devem continuar verdes; os que tocam `db.ts` via `appRouter.createCaller` podem
precisar de ajuste pontual de mock, mas não de lógica).

**Commit:** `feat: portar banco de dados de MySQL para PostgreSQL`

---

## Fase 3 — Autenticação: JWT local + Bearer token + gestão de usuários pelo admin

**Objetivo:** eliminar o OAuth da Manus por completo e substituir por login local
email+senha, com token JWT de 7 dias sem refresh, transportado via header `Authorization: Bearer`
(decisão #4 — sem cookie de sessão).

### Deletar

- `server/_core/oauth.ts` (rota `/api/oauth/callback`)
- `server/_core/types/manusTypes.ts`
- `server/_core/cookies.ts` (não há mais cookie de sessão para configurar)
- `client/src/const.ts` (`startLogin`, todo o fluxo de redirect OAuth)
- `client/src/_core/hooks/useAuth.ts` (versão acoplada ao template Manus)

### `server/_core/sdk.ts` → renomear para `server/_core/auth.ts`

Fica só com o que já era desacoplado da Manus, mais a nova lógica de autenticação por senha:

- `signSession`/`verifySession` (usam `jose` + `JWT_SECRET`) — mantidos, mas o payload passa a ser
  simplesmente `{ sub: user.id }` (não precisa mais de `openId`/`appId`/`name`).
- Nova `authenticateRequest(req)`: lê **só** o header `Authorization: Bearer <token>` (remover
  qualquer leitura de cookie), verifica o JWT, extrai `sub`, busca o usuário por `id` no banco
  (`db.getUserById`). Se token ausente/inválido/usuário não encontrado → `ForbiddenError`.
- Remover por completo: `OAuthService`, `exchangeCodeForToken`, `getUserInfo`/`getUserInfoWithJwt`,
  `deriveLoginMethod`, o branch de `CRON_OPEN_ID_PREFIX`/`buildCronUser` (não existe mais "sessão de
  cron" fora da Manus).

### `server/_core/env.ts`

- Remover `appId`, `oAuthServerUrl`, `ownerOpenId`, `forgeApiUrl`, `forgeApiKey`.
- Manter `databaseUrl`, `cookieSecret` (pode renomear para `jwtSecret`, mais preciso agora).
- Adicionar `corsOrigin: process.env.CORS_ORIGIN ?? ""` (usado na Fase 4, mas cabe declarar aqui
  junto do resto do `ENV`).

### `server/_core/context.ts`

- Ajustar o import de `./sdk` para `./auth` (arquivo renomeado). Lógica interna não muda.

### `server/_core/index.ts`

- Remover import/chamada de `registerOAuthRoutes`.

### `server/db.ts`

- Substituir `upsertUser`/`getUserByOpenId` por:
  - `createUser({ email, name, passwordHash, role })` → insert + `.returning({ id: users.id })`.
  - `getUserByEmail(email)` → usado no login.
  - `getUserById(id)` → usado no `authenticateRequest`.
  - `updateUserPassword(userId, passwordHash)` → usado no reset de senha pelo admin.
- `listUsers`/`updateUserRole` continuam iguais (só operam sobre o novo shape de `users`).

### `server/routers.ts`

- `auth.login`: `publicProcedure`, input `{ email: z.string().email(), password: z.string().min(1) }`.
  Busca usuário por email, compara senha com `bcrypt.compare` contra `passwordHash`, se ok assina JWT
  (7 dias, sem refresh) e retorna `{ token, user }`. Erro genérico ("credenciais inválidas") tanto
  para email inexistente quanto senha errada — não vazar qual dos dois falhou.
- `auth.me`: mantém como está (`publicProcedure.query(opts => opts.ctx.user)`), já funciona só com o
  contexto vindo do Bearer.
- `auth.logout`: **remover** — não há mais cookie de servidor para limpar; o client apenas apaga o
  token do `localStorage` (ver abaixo).
- `users.create`: `adminProcedure`, input `{ email, name, password, role }`. Hash da senha
  (`bcrypt.hash`), insere via `db.createUser`. Tratar violação de unicidade de email com
  `TRPCError({ code: "CONFLICT" })`.
- `users.resetPassword`: `adminProcedure`, input `{ userId: z.number(), newPassword: z.string().min(8) }`.
  Hash + `db.updateUserPassword`.
- `users.list`/`users.setRole`: mantidos como estão.

### Dependências

- Adicionar `bcryptjs` (evita compilação nativa, mais simples em imagem Docker Alpine) —
  dispensa `@types/bcryptjs` extra na maioria das versões recentes, senão adicionar como dev dep.
- Remover `axios` (só era usado pelas chamadas OAuth ao servidor da Manus em `sdk.ts`).
- Remover `cookie` (só era usado para parsear o header `Cookie` no fluxo OAuth/sessão).
- Manter `jose` (segue sendo usado para assinar/verificar o JWT).

### `seed-db.mjs`

- Criar o usuário admin inicial com **senha fixa documentada** (decisão #2): email e senha fixos
  (ex.: `admin@painel.local` / uma senha forte definida no próprio script, ou lida de
  `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` com esses dois valores como default), hash via
  `bcryptjs` antes de inserir. Tornar o insert idempotente (`ON CONFLICT (email) DO NOTHING`) para
  que rodar o seed de novo não quebre nem duplique.
- Documentar no output do script (`console.log`) o email/senha usados, com aviso para trocar depois
  do primeiro login.

### Client

- Novo `client/src/hooks/useAuth.ts` (substitui o antigo `_core/hooks/useAuth.ts`):
  - `login(email, password)`: chama `trpc.auth.login.mutate`, guarda `token` em
    `localStorage.setItem("auth_token", token)`, invalida `auth.me`.
  - `logout()`: `localStorage.removeItem("auth_token")` + limpa cache de `auth.me` (sem chamada ao
    servidor — não existe mais `auth.logout`).
  - `me`/`isAuthenticated`/`loading`/`error`: iguais em espírito ao hook atual, mas sem nenhuma menção
    a `startLogin`/Manus/iframe.
- `client/src/main.tsx`:
  - `httpBatchLink.headers()` passa a ler `localStorage.getItem("auth_token")` e mandar
    `Authorization: Bearer <token>` (remover a leitura de `sessionStorage["manus-cookie"]`).
  - Remover `redirectToLoginIfUnauthorized`/`startLogin()` — sem fluxo OAuth para redirecionar; a UI
    trata "não autenticado" mostrando a tela de login (ver abaixo), não navegação imperativa.
- Novo `client/src/pages/Login.tsx`: formulário simples email/senha chamando `useAuth().login(...)`.
- `client/src/App.tsx`: adicionar rota `/login`; nas rotas que exigem sessão, renderizar `Login` no
  lugar da página quando `!isAuthenticated` (mesmo padrão simples já usado em `Home.tsx` com
  `useAuth()`).

### Testes

- Reescrever `server/auth.logout.test.ts` → `server/auth.login.test.ts`: credenciais corretas
  retornam token válido; senha errada e email inexistente retornam o mesmo erro genérico; token
  gerado é aceito pelo `authenticateRequest` num caller subsequente.

**Verificação:** `pnpm test`, `pnpm check`, teste manual com `curl` contra o dev server: login retorna
token, chamada autenticada com `Authorization: Bearer <token>` funciona, sem token retorna
`UNAUTHORIZED`.

**Commit:** `feat: substituir OAuth Manus por login local (JWT + Bearer) e gestão de usuários pelo admin`

---

## Fase 4 — Eliminar `shared/`, duplicar `calcEngine`, separar client e server em pacotes independentes

**Objetivo:** fazer valer a regra do usuário ao pé da letra — **nenhum código compartilhado sob
nenhuma hipótese**, client e server viram dois projetos completamente independentes que só se falam
via HTTP.

### Duplicar `calcEngine`

- Copiar `shared/calcEngine.ts` (verbatim — o arquivo não importa nada de fora, confirmado) para:
  - `server/calcEngine.ts`
  - `client/src/lib/calcEngine.ts`
- Atualizar imports:
  - Server: `dashboardService.ts`, `exportService.ts`, `routers.ts`, `calcEngine.test.ts`,
    `calibrationRules.test.ts` → `./calcEngine` (relativo, dentro de `server/`).
  - Client: `Lancamentos.tsx`, `DashboardIndicadores.tsx`, `CadastroIndicadores.tsx` →
    `@/lib/calcEngine`.

### Remover o resto de `shared/`

- `shared/const.ts` já devia estar vazio de uso depois da Fase 3 (era só `COOKIE_NAME`/
  `OAUTH_STATE_COOKIE`/nonce OAuth) — confirmar e apagar.
- `shared/types.ts` (só reexportava tipos de `../drizzle/schema` + `_core/errors`) — apagar; onde for
  usado no server, importar direto de `./drizzle/schema` (padrão já usado em `db.ts`).
- `shared/_core/errors.ts` (`HttpError`/`ForbiddenError`/etc., usado só por `server/_core/auth.ts`) →
  mover verbatim para `server/_core/errors.ts`.
- Apagar a pasta `shared/` inteira.

### Reestruturar em dois pacotes

- Mover `drizzle/` (schema, migrations, meta, `relations.ts`) para dentro de `server/drizzle/`;
  atualizar `server/drizzle.config.ts` (paths `schema`/`out`) e o import em `server/db.ts`.
- Mover `seed-db.mjs` para `server/seed-db.mjs`.
- Mover `vite.config.ts` para `client/vite.config.ts`; ajustar todos os `path.resolve(rootDir, ...)`
  para caminhos relativos à própria pasta `client/` (o `root`/`publicDir`/`build.outDir` deixam de
  atravessar a raiz do monorepo).
- `server/_core/index.ts`: remover `server/_core/vite.ts` e todo uso de `setupVite`/`serveStatic` — o
  servidor nunca mais serve o client nem HTML nenhum, só a API sob `/api/*`.
- Criar `client/package.json` (React, Vite, Radix, Tailwind, tRPC client, React Query, recharts,
  wouter, etc.) e `server/package.json` (Express, tRPC server, Drizzle, `pg`, `jose`, `bcryptjs`,
  `zod`, `exceljs`, `cors`, superjson) — dividindo as dependências do `package.json` raiz atual
  conforme quem usa cada uma.
- Criar `client/tsconfig.json` (só `@/*` → `./src/*`) e `server/tsconfig.json` (sem alias `@shared`,
  só caminhos relativos).
- Mover o patch `patches/wouter@3.7.1.patch` para dentro de `client/` (é dependência só do client) e
  referenciá-lo no `client/package.json`.
- Apagar da raiz: `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `vitest.config.ts` (vira
  `server/vitest.config.ts`, já que hoje só há testes de server), `components.json` (mover para
  `client/` se for config do shadcn).
- Rodar `pnpm install` dentro de `client/` e dentro de `server/` separadamente, cada um com seu
  próprio lockfile.

### Adicionar CORS no server

- Adicionar dependência `cors` em `server/package.json`.
- Em `server/_core/index.ts`: `app.use(cors({ origin: ENV.corsOrigin.split(",") }))` — **sem**
  `credentials: true` (decisão #4/#5: não há cookie, então não precisa).

**Verificação:**
- `cd server && pnpm install && pnpm check && pnpm test`
- `cd client && pnpm install && pnpm build` (build do Vite funciona isolado, sem o processo do
  server)
- Confirmar zero acoplamento cruzado: `grep -rn "server/" client/src` e `grep -rn "client/" server`
  não devem retornar nada além de comentários/documentação.

**Commit:** `refactor: eliminar pasta shared, separar client e server em pacotes independentes`

---

## Fase 5 — Docker Compose (Postgres + server + client)

**Objetivo:** entregar `docker compose up --build` como o comando único que sobe banco, backend e
frontend para o cliente validar, conforme pedido original.

### `server/Dockerfile`

- Estágio de build: `node:22-alpine`, `pnpm install --frozen-lockfile`, `pnpm build` (esbuild bundle
  para `dist/`).
- Estágio final: copia `dist/`, `node_modules` de produção e `drizzle/` (schema + migrations,
  necessários em runtime para rodar `drizzle-kit migrate`); `CMD` roda a migration e em seguida `node
  dist/index.js` (um pequeno script de entrypoint cobre os dois passos).

### `client/Dockerfile`

- Estágio de build: `node:22-alpine`, `pnpm install --frozen-lockfile`, `vite build` recebendo
  `VITE_API_URL` como build arg (Vite embute env vars em build-time, não runtime).
- Estágio final: `nginx:alpine` servindo `dist/` — já é o mesmo formato que valeria para hospedar em
  Cloudflare Pages/Vercel depois, então validar assim localmente é representativo.

### `docker-compose.yml` (raiz)

- `db`: `postgres:16-alpine`, env `POSTGRES_DB`/`POSTGRES_USER`/`POSTGRES_PASSWORD`, volume nomeado
  para persistência, healthcheck (`pg_isready`).
- `server`: build context `./server`, env `DATABASE_URL` (apontando pro serviço `db`), `JWT_SECRET`,
  `CORS_ORIGIN` (origem do client no Compose, ex. `http://localhost:8080`), `PORT`; `depends_on: db`
  com `condition: service_healthy`.
- `client`: build context `./client`, build arg `VITE_API_URL=http://localhost:<porta-do-server>`,
  porta publicada (ex. `8080:80`); `depends_on: server`.
- `.env` na raiz (gitignorado) com as variáveis acima; commitar um `.env.example` com os mesmos nomes
  e valores de exemplo.

### Seed

- Tornar o insert do admin em `seed-db.mjs` idempotente (`ON CONFLICT (email) DO NOTHING`, já previsto
  na Fase 3) e rodá-lo automaticamente na subida do serviço `server` (parte do entrypoint, depois da
  migration) — mais simples do que um serviço `profiles: [seed]` separado, e seguro por ser
  idempotente (decisão #5: "do jeito mais simples").

**Verificação:** `docker compose up --build` de uma pasta limpa; login com o admin seedado; criar uma
empresa/indicador; importar uma planilha Excel de teste; ver o dashboard renderizar; exportar;
derrubar e subir os containers de novo (`docker compose down && docker compose up`, sem `-v`) e
confirmar que os dados persistiram no volume do Postgres.

**Commit:** `feat: adicionar Docker Compose (Postgres + server + client) para validação local`

---

## Fase 6 — Limpeza final, documentação e checklist de validação

**Objetivo:** deixar o projeto pronto para ser entregue ao cliente validar, com a documentação mínima
para alguém de fora subir o ambiente sozinho.

1. Revisar dependências finais de `client/package.json` e `server/package.json` (rodar build/typecheck
   e remover qualquer import morto restante).
2. Escrever/atualizar `README.md` na raiz com:
   - Visão geral do projeto (client/server independentes, Postgres, Docker Compose).
   - Como rodar via `docker compose up --build` (fluxo único de validação).
   - Como rodar em dev sem Docker (`cd server && pnpm dev` / `cd client && pnpm dev`, apontando
     `VITE_API_URL` para `http://localhost:<porta-server>`).
   - Tabela de variáveis de ambiente finais (server: `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN`,
     `PORT`, `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD`; client: `VITE_API_URL`).
   - Aviso explícito sobre a senha fixa do admin seedado e recomendação de trocá-la após o primeiro
     login (`users.resetPassword`).
3. Checklist de validação end-to-end (repetir manualmente contra o Compose):
   - Login com o admin seedado.
   - Criar usuário comum via admin, fazer login com ele.
   - CRUD de empresa, área, perspectiva, indicador, objetivo, regra de calibragem.
   - Lançamento manual de meta/resultado e conferência do score calculado.
   - Importação de planilha Excel e conferência do log de importação.
   - Renderização do dashboard (snapshot + histórico).
   - Exportação.
   - Reinício dos containers (`docker compose restart` ou `down`/`up` sem `-v`) confirmando
     persistência dos dados.
4. **Verificação visual em navegador real ainda pendente** — o ambiente de execução usado para
   escrever este plano não tem automação de browser funcional; a validação end-to-end acima cobre a
   camada de API, mas a conferência visual do dashboard/telas de import continua sendo manual, feita
   pelo usuário.

**Commit:** `chore: documentação final e checklist de validação`

---

## Referência rápida: onde cada decisão fechada aparece no plano

| Decisão (§9 do diagnóstico) | Fase onde é executada |
|---|---|
| 1. Dropar `notifyOwner` | Fase 1 |
| 2. Seed com admin de senha fixa | Fases 3 (lógica) e 5 (automatização no Compose) |
| 3. Duplicar `calcEngine`, zero shared | Fase 4 |
| 4. Bearer token em localStorage, 7d sem refresh | Fase 3 |
| 5. Validação local simples (sem proxy/HTTPS) | Fase 4 (CORS sem credentials) e Fase 5 (Compose) |
| 6. Apagar `template.json` | Fase 1 |
| 7. Remover dependências não usadas | Fases 1 (S3/Maps) e 3 (axios/cookie) |
