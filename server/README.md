# server — Painel de Gestão por Indicadores

API em Express + tRPC sobre PostgreSQL (Drizzle ORM). Pacote Node independente — tem seu próprio
`package.json`, lockfile e instalação; não compartilha código nem tipos com o `client` (o client
mantém sua própria cópia dos tipos e até do motor de cálculo, ver `client/README.md`).

## Stack

- **Express 4.21** + **`@trpc/server` 11.6** (`@trpc/server/adapters/express`)
- **Drizzle ORM 0.44** (`drizzle-orm/node-postgres`) + **`pg` 8.22** sobre **PostgreSQL**
- Auth: **`jose` 6.1** (JWT, assinatura HS256) + **`bcryptjs` 3.0** (hash de senha)
- Excel: **`exceljs` 4.4** (importação e exportação)
- Validação: **`zod` 4.1** · transformer do tRPC: **`superjson`**
- Dev: **`tsx` watch** · Build: **`esbuild`** (bundle único ESM) · Testes: **`vitest` 2.1**
- **TypeScript 5.9**, pnpm 10.4.1 (fixado via `packageManager`)

## Scripts

```bash
pnpm install
pnpm dev        # tsx watch, NODE_ENV=development, http://localhost:3000
pnpm build      # esbuild → dist/index.js (bundle ESM, deps externas)
pnpm start      # NODE_ENV=production node dist/index.js
pnpm check      # tsc --noEmit
pnpm test       # vitest run
pnpm db:push    # drizzle-kit generate + migrate — gera/aplica migration a partir do schema.ts
pnpm migrate    # node migrate.mjs — aplica migrations existentes em drizzle/ (uso manual/produção)
pnpm seed       # node seed-db.mjs — cria admin inicial + dados de exemplo (idempotente)
```

## Estrutura

```
_core/
  index.ts       # entrypoint: cria o Express app, CORS, body parser, monta o tRPC e as export routes
  auth.ts        # login, JWT, hash de senha
  context.ts     # createContext: lê o Bearer token e resolve o usuário autenticado (ou null)
  env.ts         # leitura das variáveis de ambiente (ENV.*)
  trpc.ts        # publicProcedure/protectedProcedure/adminProcedure
routers.ts       # appRouter — toda a API tRPC (ver seção abaixo)
db.ts            # camada de acesso a dados (uma função por operação, usada pelos routers)
calcEngine.ts    # motor de cálculo de score (ver seção própria)
dashboardService.ts  # agregações para os dashboards (snapshot e histórico)
importService.ts     # importação de planilha Excel
exportRoutes.ts       # duas rotas Express simples (fora do tRPC) para download de .xlsx
exportService.ts      # geração dos arquivos .xlsx (relatório e modelo)
drizzle/
  schema.ts       # todas as tabelas
  *.sql           # migrations geradas pelo drizzle-kit
migrate.mjs       # roda as migrations contra DATABASE_URL
seed-db.mjs       # cria o admin inicial + dados de exemplo (idempotente)
docker-entrypoint.sh  # migrate → seed → start (roda a cada boot do container)
```

## API (tRPC)

Todas as procedures vivem em `routers.ts`, montadas em `/api/trpc`. 🔒 = exige `role: "admin"`
(via `adminProcedure`); as demais protegidas exigem apenas usuário autenticado (`protectedProcedure`)
salvo indicação de "pública".

| Router | Procedures | Observações |
|---|---|---|
| `auth` | `me` (pública), `login` (pública, mutation) | `login` retorna JWT + usuário público |
| `users` | `list`, `create`, `update`, `delete`, `resetPassword`, `setRole` — 🔒 todas | bloqueia auto-desativação, auto-rebaixamento e auto-exclusão do próprio admin |
| `companies` | `list` (protegida) · `create`/`update`/`delete` 🔒 | |
| `areas` | `list` (protegida, **filtrada por área** para não-admin) · `create`/`update`/`delete` 🔒 | |
| `perspectives` | `list` (protegida, **não** filtrada) · `create`/`update`/`delete` 🔒 | dado de referência global |
| `indicators` | `list` (protegida, **filtrada por área**) · `create`/`update`/`delete` 🔒 | |
| `objectives` | `list` (protegida, **não** filtrada) · `create`/`update`/`delete` 🔒 | dado de referência global |
| `calibrationRules` | `list` (protegida) · `create`/`update`/`delete` 🔒 | |
| `weights` | `list` (protegida) · `set` 🔒 | matriz área × perspectiva |
| `applicability` | `list`, `set`, `setForIndicator` — 🔒 todas | matriz indicador × área; `setForIndicator` substitui em lote |
| `entries` | `list` (protegida, filtrada) · `upsert` (protegida) · `delete` 🔒 | `upsert` lança `FORBIDDEN` se um não-admin tentar lançar em indicador fora do seu escopo |
| `importer` | `importExcel` (protegida, filtrada) · `logs` (protegida) | limite de 15 MB por arquivo |
| `dashboard` | `snapshot` (protegida, filtrada) · `history` (protegida, filtrada, até 36 períodos) | |
| `system` | delegado a `_core/systemRouter` | não coberto em detalhe aqui |

Fora do tRPC, duas rotas Express simples registradas por `registerExportRoutes`
(`exportRoutes.ts`), autenticadas manualmente pelo mesmo fluxo de Bearer token do tRPC:

- `GET /api/export/excel` — relatório em Excel
- `GET /api/export/template` — modelo de planilha para importação

## Modelo de dados (`drizzle/schema.ts`)

- **`users`** — e-mail único, `passwordHash`, `role` (`user`/`admin`), `active` (desativação sem
  excluir), `lastSignedIn`.
- **`companies`** — empresa (unidade de negócio topo).
- **`areas`** — área/setor; `parentAreaId` auto-referenciado monta o organograma; pertence a uma
  `companyId`.
- **`perspectives`** — perspectivas do BSC; `companyId`, cor.
- **`objectives`** — objetivos estratégicos; associados a uma `perspective` e a uma `companyId`.
- **`calibrationRules`** — regra de calibragem nomeada; `companyId`, flag `directConversion`.
- **`calibrationRuleRanges`** — faixas de uma regra: `minAttainment`/`maxAttainment` (com flags de
  inclusão) → `score`.
- **`indicators`** — `companyId`, `perspectiveId`, `scaleType` (enum legado de 5 opções),
  `direction` (`higher_better`/`lower_better`), `objectiveId` e `calibrationRuleId` opcionais,
  `defaultGoal`.
- **`areaPerspectiveWeights`** — peso (0–1) de cada perspectiva dentro de cada área (único por
  `areaId`+`perspectiveId`).
- **`indicatorAreaApplicability`** — se um indicador se aplica a uma área (único por
  `indicatorId`+`areaId`).
- **`userAreas`** — áreas liberadas para um usuário comum (irrelevante para `role: "admin"`, que
  nunca é restrito).
- **`indicatorEntries`** — meta/resultado por indicador/ano/mês (único por
  `indicatorId`+`year`+`month`), `source` (`manual`/`import`), `updatedBy`.
- **`importLogs`** — registro de cada importação: `totalRows`/`matchedRows`, `unmatchedRows` (JSON
  como texto), `importedBy`.

## Motor de cálculo de score (`calcEngine.ts`)

Dois caminhos possíveis por indicador (o segundo tem precedência quando configurado):

1. **`scaleType` legado** (`computeScore`) — 5 faixas fixas (`higher_better_120/100`,
   `lower_better_100/120`, `target_range`) que mapeiam a razão meta/resultado para um score em
   `{0, 0.6, 0.8, 1.0, 1.2}`, com tolerância de ponto flutuante (`1e-9` relativo) para reproduzir o
   comportamento das fórmulas do Excel original. Retorna `null` se faltar meta ou resultado.
2. **Regra de calibragem configurável** (`computeScoreWithRule`, usada quando o indicador tem
   `calibrationRuleId`) — calcula o atingimento como `resultado/meta` (indicador `higher_better`)
   ou `meta/resultado` (`lower_better`), depois percorre as faixas da regra em ordem (`sortOrder`)
   e retorna o score da primeira faixa que casar; se a regra for `directConversion`, retorna o
   próprio atingimento. Retorna `null` se faltar meta/resultado ou se a meta for `0`.
3. **Agregação por área** (`computeAreaScore`) — por perspectiva, faz a média dos scores dos
   indicadores aplicáveis daquela área (excluindo `null`, replicando `AVERAGE` do Excel),
   multiplica pelo peso da área naquela perspectiva, e soma os resultados ponderados de todas as
   perspectivas para chegar no score total da área.

Coberto por testes unitários em `calibrationRules.test.ts`, com mais de 6 regras reais
pré-carregadas (chamando `calcEngine` diretamente, sem mock de banco).

## Controle de acesso por área

`scopedAreaIds(ctx)` (em `routers.ts`) retorna `null` para admin (sem restrição) ou a lista de
`db.getUserAreaIds(userId)` (tabela `userAreas`) para um usuário comum. Esse escopo filtra:

- **Áreas**: por pertencimento direto ao conjunto liberado.
- **Indicadores** e **lançamentos**: via `db.getIndicatorIdsForAreas(areaIds)` — indicadores
  aplicáveis a pelo menos uma área liberada (tabela `indicatorAreaApplicability`).
- **`entries.upsert`**: lança `FORBIDDEN` se um usuário comum tentar lançar meta/resultado em um
  indicador fora do seu escopo.

**`perspectives` e `objectives` não são filtrados** — são tratados como dado de referência
global, visível a qualquer usuário autenticado. Coberto por `accessControl.test.ts` (mock completo
do módulo `db`, chamando o router com um contexto de usuário não-admin).

## Importação e exportação de Excel

- **Importação** (`importService.ts`): espera uma planilha com aba "INDICADORES" (comparação
  tolerante a acento/maiúscula), detecta automaticamente as colunas pelo texto do cabeçalho
  ("Indicadores"/"META"/"RESULTADO") nas primeiras 10 linhas, com fallback para colunas fixas
  (C/E/F). Parsing tolerante de número (moeda, percentual, vírgula decimal). Casa cada linha com um
  indicador existente por nome normalizado (`normalizeName()`: minúsculas, sem acento, espaços
  colapsados); linhas sem correspondência — ou fora do escopo de área de um usuário comum — vão
  para `unmatched[]`; as demais são gravadas em `indicatorEntries` com `source: "import"`. Toda
  importação grava uma linha em `importLogs`.
- **Exportação** (`exportRoutes.ts` + `exportService.ts`): rotas Express simples (não-tRPC),
  autenticadas manualmente pelo mesmo fluxo de Bearer token, geram `.xlsx` (relatório ou modelo de
  importação).

## Autenticação

- `auth.login` é uma mutation pública: valida e-mail/senha (bcrypt), verifica `active`, e retorna
  um JWT assinado com `JWT_SECRET` (HS256, `jose`, validade de **7 dias, sem refresh**, payload
  `{ sub: userId }`).
- O client envia `Authorization: Bearer <token>` em toda requisição.
- `createContext` (`_core/context.ts`) verifica o JWT e carrega o usuário a cada requisição; falha
  de verificação (token inválido/expirado, usuário inativo) é absorvida como `user: null` — a
  autenticação em si é opcional no nível de contexto. Quem de fato bloqueia o acesso são os
  middlewares `protectedProcedure`/`adminProcedure` (`_core/trpc.ts`), lançando
  `UNAUTHORIZED`/`FORBIDDEN`.
- Reset de senha é **admin-only** (`users.resetPassword`) — não existe fluxo de autoatendimento
  nem de e-mail.

## Boot (migração + seed automáticos)

`docker-entrypoint.sh` roda, **a cada start do container** (não só no primeiro boot):

```
node migrate.mjs   # aplica migrations pendentes de drizzle/ (drizzle-kit migrator, idempotente)
node seed-db.mjs   # cria o admin inicial (idempotente) e semeia dados de exemplo (só se vazio)
exec node dist/index.js
```

- `migrate.mjs` usa o migrator do drizzle-kit, que rastreia as migrations já aplicadas — seguro
  rodar de novo.
- `seed-db.mjs` cria o usuário admin via `INSERT ... ON CONFLICT (email) DO NOTHING` (usa
  `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD`), depois verifica `COUNT(*) FROM companies`: se já
  houver alguma empresa, pula todo o resto do seed de dados de exemplo.

## Variáveis de ambiente

| Variável | Obrigatória | Descrição |
|---|---|---|
| `DATABASE_URL` | sim | Connection string do Postgres. Sem valor, `drizzle.config.ts` lança erro em qualquer comando `drizzle-kit`. |
| `JWT_SECRET` | sim | Segredo de assinatura do JWT (HS256). Sem valor real, o login funciona mas gera tokens inválidos/inseguros. |
| `CORS_ORIGIN` | sim | Origem(ns) permitida(s) para o client, separadas por vírgula (`ENV.corsOrigin.split(",")`) — **sem barra final** em cada URL. |
| `PORT` | não (default `3000`) | Porta do servidor HTTP. Se ocupada, o server tenta automaticamente as próximas 20 portas (`findAvailablePort`). |
| `SEED_ADMIN_EMAIL` | não (default `admin@painel.local`) | E-mail do admin criado pelo seed. |
| `SEED_ADMIN_PASSWORD` | não (default `TrocarSenha123!`) | Senha inicial do admin criado pelo seed — troque em produção. |
| `NODE_ENV` | não | `production` desativa comportamentos de dev (ex.: o script `start` já define isso). |

## Testes (`pnpm test`, vitest)

- **`auth.login.test.ts`** — mocka o módulo `db`; testa `authenticateRequest` e a procedure
  `auth.login` (senha certa/errada, usuário inativo, e-mail inexistente — usando um hash "dummy"
  para manter tempo de resposta constante e não vazar se o e-mail existe).
- **`calibrationRules.test.ts`** — testes unitários puros de `computeScoreWithRule`/
  `computeAreaScore` contra mais de 6 regras de calibragem reais, sem mock de banco.
- **`accessControl.test.ts`** — mocka o módulo `db` por completo, monta um caller do tRPC com
  contexto de usuário não-admin, e valida o escopo por área em `areas.list`, `indicators.list`,
  `entries.upsert`, `buildCompanySnapshot` e `importEntries`.

## Build & deploy

- **Local/Docker**: `Dockerfile` multi-stage — build compila com `esbuild` para `dist/`, um stágio
  separado instala só `dependencies` de produção, e a imagem final (`node:22-alpine`) copia
  `node_modules` + `dist/` + `drizzle/` + `migrate.mjs`/`seed-db.mjs` +
  `docker-entrypoint.sh`, que roda migrate → seed → start.
- **Produção (Render)**: deploy via Docker apontando para este `Dockerfile`, sem build manual — ver
  o passo a passo completo em
  [`../PLANO_DEPLOY_CLOUDFLARE_RENDER_NEON.md`](../PLANO_DEPLOY_CLOUDFLARE_RENDER_NEON.md). Pontos
  chave: Root Directory `server`, Environment `Docker`, **não definir `PORT` manualmente** (o
  Render injeta essa variável e o server já a lê), e lembrar que migração + seed rodam sozinhos a
  cada deploy.
