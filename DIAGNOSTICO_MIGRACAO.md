# Diagnóstico do Estado Atual — Migração Manus → Client/Server independentes + Postgres + Docker Compose

> Gerado a partir de inspeção direta do código (sem depender de documentação externa).
> Objetivo: nortear as decisões do plano de migração descrito em `ANALISE_MIGRACAO.MD`.

## 1. Resumo executivo

O acoplamento à Manus está concentrado quase inteiramente em `server/_core/*`, `server/storage.ts`,
`shared/const.ts`, `client/src/const.ts`, `client/src/_core/hooks/useAuth.ts`,
`client/src/components/ManusDialog.tsx`, `drizzle/schema.ts` (dialeto) e `vite.config.ts`.
A lógica de negócio real (`dashboardService.ts`, `calcEngine.ts`, `importService.ts`,
`exportService.ts`, `routers.ts` fora do bloco de auth, schema de domínio) **não referencia Manus em
nenhum ponto** e é portável sem alterações estruturais.

Há três blocos de trabalho bem distintos, de tamanho e risco diferentes:

| Bloco | Esforço | Risco | Observação |
|---|---|---|---|
| Deletar código morto (LLM, imagens, voz, Maps, Data API, Heartbeat, storage/S3, ManusDialog) | Baixo | Baixo | Nada disso é importado pelas rotas reais — confirmado por grep |
| Portar banco MySQL → Postgres | Médio | Médio | Schema + `db.ts` usam APIs específicas do dialeto MySQL |
| Reescrever autenticação (OAuth Manus → JWT + login local) | Alto | Alto | Autenticação, criação de cookie, criação de usuário, bootstrap de admin — tudo mexe |
| Separar client/server (sem pasta `shared`) | Médio-Alto | Médio | Hoje há dependência real de código compartilhado, não é só estrutural |
| CORS entre domínios diferentes | Médio | Alto se esquecido | **Não existe nenhuma configuração de CORS hoje** — ver seção 6 |

---

## 2. Pontos de acoplamento à Manus (inventário completo)

### 2.1 Autenticação / OAuth — **acoplamento crítico, reescrita completa necessária**

- `server/_core/oauth.ts` — rota `/api/oauth/callback`: troca `code`/`state` por token com o servidor
  OAuth da Manus (`sdk.exchangeCodeForToken`), busca `userInfo` (`sdk.getUserInfo`), faz
  `db.upsertUser` automático e emite cookie de sessão JWT.
- `server/_core/sdk.ts` — `SDKServer`: encapsula todo o protocolo Manus
  (`webdev.v1.WebDevAuthPublicService/ExchangeToken`, `GetUserInfo`, `GetUserInfoWithJwt`), mais
  `verifySession`/`signSession` (esses dois **são reaproveitáveis** — já usam `jose` + `JWT_SECRET`
  locais, não dependem da Manus). `authenticateRequest` é o método chamado pelo `createContext` do
  tRPC em toda requisição; ele decide sessão via cookie ou `Authorization: Bearer` (fallback de
  iframe/preview, específico do ambiente Manus) e, se o usuário não existe localmente, **sincroniza
  automaticamente da Manus** (`getUserInfoWithJwt` + `upsertUser`). Também existe um branch inteiro
  para "cron user" (`CRON_OPEN_ID_PREFIX`), inútil fora da Manus.
- `server/_core/types/manusTypes.ts` — tipos do protocolo OAuth da Manus (`ExchangeTokenRequest`,
  `GetUserInfoResponse`, etc.), usados só pelo `sdk.ts`.
- `client/src/const.ts` (`startLogin`) — monta URL para `VITE_OAUTH_PORTAL_URL` + `VITE_APP_ID`,
  grava cookie de nonce (`__Host-oauth_state`), redireciona para o portal Manus (`/app-auth`).
- `client/src/_core/hooks/useAuth.ts` — hook de auth do template; ao detectar não-autenticado chama
  `startLogin()` (redireciona pra Manus) e limpa `sessionStorage["manus-cookie"]` no logout (esse é o
  espelhamento de cookie para navegadores que bloqueiam cookie em iframe — específico do preview
  embutido da Manus).
- `client/src/main.tsx` — lê `sessionStorage.getItem("manus-cookie")` para montar o header
  `Authorization: Bearer` no client tRPC (mesmo mecanismo de fallback acima); também redireciona pra
  `startLogin()` quando uma call falha com `UNAUTHED_ERR_MSG`.
- `client/src/components/ManusDialog.tsx` — componente de diálogo "Login with Manus", texto
  hard-coded, **não é importado em nenhum lugar do app** (confirmado por grep) — código morto.
- `shared/const.ts` — `COOKIE_NAME`, `OAUTH_STATE_COOKIE`, `encodeOAuthState`/`decodeOAuthState` (nonce
  CSRF do fluxo OAuth). Usado tanto por client quanto por server hoje.

**Como funciona a criação/gestão de usuário hoje:** não existe endpoint de criação de usuário.
`routers.ts` → `users` router só tem `list` e `setRole` (ambos admin). Um usuário só passa a existir
no banco quando faz login pela primeira vez via Manus (upsert automático dentro de
`authenticateRequest`/`oauth.ts`). O primeiro admin é definido comparando `openId` com
`ENV.ownerOpenId` (`db.ts:72`) — esse mecanismo de bootstrap desaparece por completo com o fim do
OAuth Manus e precisa de substituto (ex.: seed cria o admin inicial, como já acontece em
`seed-db.mjs`).

**O que o usuário já indicou como direção:** login simples via JWT, gestão de usuários pelo
administrador. Isso implica: schema `users` ganha campo de senha (hash), endpoint de login
email+senha que gera o mesmo tipo de cookie JWT (reaproveitando `signSession`/`verifySession` de
`sdk.ts`, que já são desacoplados da Manus), endpoint `users.create` para admin, e decidir o que
fazer com o fallback de `Authorization: Bearer`/`sessionStorage["manus-cookie"]` (esse mecanismo
existe só por causa do iframe de preview da Manus — não deveria ser necessário fora dela, mas convém
confirmar antes de remover).

### 2.2 Armazenamento de arquivos (Forge S3 proxy) — não usado pela lógica de negócio

- `server/storage.ts` — `storagePut`/`storageGet`/`storageGetSignedUrl`: fazem presign contra o Forge
  API da Manus e sobem o arquivo para um S3 gerenciado por ela.
- `server/_core/storageProxy.ts` — rota `/manus-storage/*`, faz redirect 307 para URL assinada.
- **Uso real:** `storagePut` só é chamado por `server/_core/imageGeneration.ts` (que por sua vez não é
  chamado por ninguém — ver 2.3). `importService.ts`/`exportService.ts`/`dashboardService.ts` **não
  usam storage nenhum** — import/export de Excel hoje trafega em base64 direto no payload tRPC
  (`routers.ts` → `importer.importExcel`, limite de 15MB) e o export deve gerar o arquivo on-the-fly
  (ver `exportRoutes.ts`, não inspecionado a fundo mas sem referência a storage).
  - Conclusão: **todo o bloco de storage S3/Forge pode ser deletado**; se no futuro for necessário
    anexar arquivos, aí sim decidir um provedor de storage novo (mas não é requisito atual).

### 2.3 Código morto do template (nunca importado pelas rotas reais)

Confirmado via grep que nenhum destes é referenciado fora de si mesmo:

- `server/_core/llm.ts` (proxy para LLM via Forge — `invokeLLM`, `listLLMModels`)
- `server/_core/imageGeneration.ts` (geração de imagem via Forge, depende de `storage.ts`)
- `server/_core/voiceTranscription.ts` (Whisper via Forge)
- `server/_core/map.ts` (proxy Google Maps via Forge)
- `server/_core/dataApi.ts` (`callDataApi`, proxy genérico Forge)
- `server/_core/heartbeat.ts` (CRUD de cron jobs via Forge — `createHeartbeatJob` etc.)

Todos dependem de `ENV.forgeApiUrl`/`ENV.forgeApiKey`. Nenhum é chamado por `routers.ts`,
`dashboardService.ts`, `importService.ts` ou `exportService.ts`. **Podem ser deletados inteiros** —
são scaffolding do template "Web App (db,user)" da Manus, não features do painel de indicadores.

### 2.4 `notifyOwner` — usado, mas opcional

- `server/_core/notification.ts` + `server/_core/systemRouter.ts` (`system.notifyOwner`, procedure
  `adminProcedure`) — dispara notificação para o "dono do projeto" via Forge. É o único ponto do bloco
  Forge que está de fato ligado (`systemRouter` é importado por `routers.ts`). Precisa de decisão
  explícita: dropar a feature, ou substituir por algo (e-mail/Slack) — não há como manter Manus.

### 2.5 Build tooling / dev server

- `vite.config.ts` (raiz) — importa `vite-plugin-manus-runtime` e define um plugin próprio
  (`vitePluginManusDebugCollector`) que escreve logs de console/rede/replay do browser em
  `.manus-logs/*.log` via endpoint `/__manus__/logs`, injetado só em dev. `allowedHosts` lista
  domínios `*.manuspre.computer`, `*.manus.computer`, `*.manus-asia.computer`, `*.manuscomputer.ai`,
  `*.manusvm.computer` — específicos do sandbox de preview da Manus.
- `client/public/__manus__/debug-collector.js` e `version.json` — client-side do coletor de logs
  acima.
- `client/index.html` — tag `<script defer src="%VITE_ANALYTICS_ENDPOINT%/umami" ...>` com
  placeholders `%VITE_ANALYTICS_ENDPOINT%`/`%VITE_ANALYTICS_WEBSITE_ID%` que só são substituídos pelo
  pipeline de build da Manus; fora dela isso é uma tag morta que tenta carregar um script de um
  endpoint inexistente (falha silenciosa, mas é lixo a remover).
- `server/_core/vite.ts` — `setupVite`/`serveStatic`: liga o servidor Express ao Vite em dev
  (`import viteConfig from "../../vite.config"`) e serve os estáticos buildados (`dist/public`) em
  produção. **Isso é o ponto de acoplamento estrutural entre server e client no monorepo atual** — não
  é Manus-specific, mas contradiz diretamente o requisito de client/server independentes (ver seção 5).
- `package.json` (raiz, único para o monorepo) — dependências `vite-plugin-manus-runtime`,
  `@types/google.maps` (usado só pelo `map.ts` morto), `@aws-sdk/client-s3` e
  `@aws-sdk/s3-request-presigner` (não encontrei import direto deles em nenhum arquivo — `storage.ts`
  usa `fetch` cru contra o Forge, não o SDK da AWS; parecem dependências não utilizadas, a confirmar
  com um `depcheck`/build).
- `template.json` — snapshot literal do template original da Manus (id `web-db-user`), incluindo uma
  cópia antiga de `package.json`, `schema.ts`, `db.ts`, `routers.ts`, `App.tsx`, `Home.tsx`, etc. Não é
  importado por nada em runtime; é só o "molde" que a Manus usou para gerar o projeto. Seguro remover
  ou manter como histórico, decisão de baixo impacto.

### 2.6 Outros arquivos com menção a Manus (baixo impacto)

- `server/auth.logout.test.ts` — comentário/dado de teste (`loginMethod: "manus"`), cosmético.
- `drizzle/schema.ts` — comentário "Manus OAuth identifier (openId)" no campo `users.openId`;
  o campo em si (`varchar(64)`, único) pode virar simplesmente o identificador local de usuário
  (ex.: reaproveitar como "username" ou trocar por auto-increment id + email como chave de login).

---

## 3. Banco de dados: MySQL → PostgreSQL

- `drizzle.config.ts` — `dialect: "mysql"`, aponta pra `./drizzle/schema.ts`.
- `drizzle/schema.ts` — importa de `drizzle-orm/mysql-core` (`mysqlTable`, `mysqlEnum`, `int`,
  `double`, `boolean`, `varchar`, `text`, `timestamp`, `uniqueIndex`). Precisa reescrever para
  `drizzle-orm/pg-core` (`pgTable`, `pgEnum`, `serial`/`integer`, `doublePrecision` ou `numeric`,
  `boolean`, `varchar`, `text`, `timestamp`). `autoincrement()` → `serial`/`generatedAlwaysAsIdentity`;
  `.onUpdateNow()` não existe no dialeto pg do Drizzle da mesma forma — precisa trigger ou lógica na
  aplicação para `updatedAt`.
- `server/db.ts` — importa `drizzle-orm/mysql2` e `drizzle(process.env.DATABASE_URL)` (o driver mysql2
  aceita a connection string MySQL diretamente). Troca para `drizzle-orm/node-postgres` (ou
  `postgres-js`) + driver `pg`. Todos os `.onDuplicateKeyUpdate({ set })` (usados em `upsertUser`,
  `setWeight`, `setApplicability`, `setApplicabilityForIndicator`) viram `.onConflictDoUpdate({
  target, set })` — sintaxe diferente, precisa dos índices únicos corretos como `target`. Todo
  `res.insertId` (usado em `createCompany`, `createArea`, `createPerspective`, `createIndicator`,
  `createObjective`, `createCalibrationRule`, `createImportLog`) não existe no driver Postgres — precisa
  `.returning({ id: ... })` em cada insert.
- `seed-db.mjs` — usa `mysql.createConnection(process.env.DATABASE_URL)` (biblioteca `mysql2`
  diretamente, fora do Drizzle) — precisa portar para `pg` (ou reusar Drizzle) e ajustar qualquer SQL
  MySQL-specific (`ON DUPLICATE KEY UPDATE`, backticks, etc. — não inspecionado linha a linha, mas
  provável dado o padrão do resto do código).
- `drizzle/0001_*.sql`, `0002_*.sql`, `0003_*.sql` e `drizzle/meta/*.json` — migrations já geradas em
  dialeto MySQL; serão descartadas e regeradas do zero para Postgres (não há necessidade de
  "traduzir" SQL, já que não existe base de produção a preservar — confirmar isso é uma decisão, não
  suposição).
- Nenhuma tabela tem campo de senha hoje — é 100% novo (schema + migration) para suportar login
  local.

---

## 4. Client ↔ Server: código hoje compartilhado (contradiz o requisito "sem pasta shared")

O usuário foi explícito: **client só deve receber a URL da API via `.env`**, nada de código
compartilhado. Hoje isso não é verdade — há duas dependências reais (não apenas estruturais) do
client sobre `shared/`:

| Arquivo em `shared/` | Consumido por (client) | Consumido por (server) | Natureza |
|---|---|---|---|
| `shared/calcEngine.ts` (233 linhas) | `Lancamentos.tsx`, `DashboardIndicadores.tsx`, `CadastroIndicadores.tsx` (`computeScore`, `computeScoreWithRule`, `SCALE_TYPE_LABELS`, `ScaleType`) | `dashboardService.ts`, `exportService.ts`, `routers.ts`, testes | Lógica de negócio pura (fórmulas de score), zero dependência de Node/Manus |
| `shared/const.ts` (37 linhas) | `const.ts`, `main.tsx` (`COOKIE_NAME`, `ONE_YEAR_MS`, `OAUTH_STATE_COOKIE`, `encodeOAuthState`/`decodeOAuthState`) | `oauth.ts`, `sdk.ts`, `trpc.ts`, `routers.ts`, teste de logout | Acoplado ao fluxo OAuth Manus — grande parte some quando o login virar formulário simples |
| `shared/types.ts` (7 linhas) | a confirmar | a confirmar | pequeno, checar conteúdo antes de decidir |
| `shared/_core/errors.ts` (19 linhas) | não usado pelo client (a confirmar) | usado por `sdk.ts` (`ForbiddenError`) | classe de erro HTTP simples, fácil de duplicar ou mover só pro server |

**Implicação para o plano:** `calcEngine.ts` é o único caso onde há reuso genuíno de lógica de negócio
entre front e back — é puro (sem I/O), então a saída mais simples é duplicar o arquivo (um em
`client/src/`, outro em `server/`) em vez de manter uma pasta compartilhada, aceitando o pequeno custo
de manutenção dupla em troca de zero acoplamento estrutural. `const.ts`/`OAUTH_STATE_COOKIE` inteiro
deixa de existir no client se o login virar POST de formulário (sem redirect OAuth, sem nonce
cross-domain) — o client não precisa mais saber nome de cookie nenhum, só chama o endpoint de login e
o backend cuida do cookie de sessão. Vale conferir `types.ts` antes de fechar a decisão.

---

## 5. Estrutura de build (monorepo único hoje)

- Um `package.json` só na raiz para client + server + shared (`dependencies`/`devDependencies`
  misturados: `react`, `express`, `drizzle-orm`, `vite`, `vitest`, tudo junto).
- Um `tsconfig.json` só, com `paths` cruzando fronteiras (`@/*` → `client/src`, `@shared/*` →
  `shared`) e `include` cobrindo `client/src`, `shared`, `server` no mesmo projeto TS.
- `vite.config.ts` na raiz; `server/_core/vite.ts` importa esse config diretamente
  (`import viteConfig from "../../vite.config"`) para rodar o Vite em modo middleware dentro do
  próprio processo Express durante o dev, e serve os estáticos buildados (`dist/public`) em produção
  (`serveStatic`). **Isso é o principal ponto de acoplamento estrutural do server ao client** — o
  processo Node do backend hoje literalmente hospeda o frontend.
- `esbuild` empacota `server/_core/index.ts` → `dist/index.js`; `vite build` gera `dist/public`; um
  único `node dist/index.js` sobe tudo.
- Consequência direta do requisito do usuário: isso precisa virar dois projetos de fato
  independentes — `client/package.json` + `client/tsconfig.json` próprios (Vite dev server e build
  separados, sem o middleware do Express) e `server/package.json` + `server/tsconfig.json` próprios
  (Express que só serve `/api/*`, nada de estáticos). O `vite.config.ts` migra pra dentro de `client/`
  e perde o plugin de debug/allowedHosts da Manus.

---

## 6. CORS — lacuna real para o objetivo de hospedagem separada

Busquei por `cors` em todo o `server/` e no `package.json`: **não existe nenhuma configuração de CORS
hoje**, nem a dependência `cors` está instalada. Isso funciona atualmente porque client e server são
servidos pelo mesmo processo/origem (`serveStatic`/`setupVite` dentro do próprio Express). No cenário
alvo (client em Cloudflare/Vercel, server em outro domínio), toda chamada tRPC do browser passa a ser
cross-origin — sem `cors()` configurado (com `origin` explícito + `credentials: true`, já que o auth
usa cookie), as requisições do client vão falhar por bloqueio de CORS assim que forem separados. Isso
precisa entrar no plano como item explícito, não é opcional.

Relacionado: `server/_core/cookies.ts` já força `sameSite: "none"` incondicionalmente (pensado pro
iframe cross-site da Manus) e calcula `secure` dinamicamente a partir do request — isso
coincidentemente é o que cross-origin real vai exigir também (cookie `SameSite=None` exige `Secure`,
ou seja, HTTPS obrigatório em qualquer ambiente, inclusive ao validar localmente antes de entregar pro
cliente). Vale decidir cedo se o Docker Compose de validação vai rodar atrás de HTTPS (mesmo que
autoassinado) ou se o cookie de sessão vai precisar de outra estratégia para o ambiente
`docker compose up` local (ex.: mesmo domínio via proxy reverso, evitando cross-site cookie ali).

---

## 7. Variáveis de ambiente

### Atuais (`server/_core/env.ts`)

| Variável | Uso hoje | Destino |
|---|---|---|
| `VITE_APP_ID` | `clientId` no exchange OAuth Manus | Removida (auth local não usa `appId`) |
| `JWT_SECRET` | Assina/verifica cookie de sessão (`jose`) — **já é local, não é Manus** | Mantida |
| `DATABASE_URL` | Connection string MySQL | Mantida, mas vira string de conexão Postgres |
| `OAUTH_SERVER_URL` | Base URL do servidor OAuth da Manus | Removida |
| `OWNER_OPEN_ID` | Bootstrap do primeiro admin (compara com `openId` do login Manus) | Removida — substituir por outro mecanismo de bootstrap (seed cria admin com senha) |
| `BUILT_IN_FORGE_API_URL` / `BUILT_IN_FORGE_API_KEY` | Base/chave de todos os proxies Forge (storage, LLM, imagem, voz, maps, notify, heartbeat, data API) | Removidas por completo se todo o bloco Forge for deletado (seção 2.2/2.3/2.4) |

### Novas, esperadas no destino

- Client: só a URL da API (`VITE_API_URL` ou similar), nada mais — conforme já definido pelo usuário.
- Server: `DATABASE_URL` (Postgres), `JWT_SECRET`, `CORS_ORIGIN` (origem(ns) permitida(s) do client),
  possivelmente `PORT`. Se `notifyOwner` for mantido de alguma forma (seção 2.4), precisa de config
  própria (SMTP, webhook, etc.) — depende da decisão.

---

## 8. Testes existentes (portáveis, com ajustes)

`vitest.config.ts` + `server/*.test.ts` (`calcEngine.test.ts`, `calibrationRules.test.ts`,
`importService.test.ts`, `areaHierarchy.test.ts`, `auth.logout.test.ts`) testam lógica pura e o
`appRouter` via `createCaller` com contexto mockado — nenhum depende de Manus diretamente, mas todos
importam de `../shared/*`, então serão afetados pela decisão da seção 4 (duplicar `calcEngine`
localiza o teste de cálculo dentro do server; `auth.logout.test.ts` precisa ser reescrito junto com o
novo fluxo de login).

---

## 9. Decisões fechadas para o plano de migração

Baseado nos achados acima, o plano de migração deve considerar como fechadas estas decisões antes de começar a
implementação:

1. **`notifyOwner`**: dropar a feature ou substituir por outro canal (e-mail/webhook)? Hoje é a única
   funcionalidade real que depende do bloco Forge.
   Resposta: dropar a feature
2. **Bootstrap do primeiro admin**: seed script cria um usuário admin com senha fixa/gerada, ou o
   primeiro usuário criado via alguma rota vira admin automaticamente?
   Resposta: cria um seed script com usuário admin com senha fixa
3. **`shared/calcEngine.ts`**: duplicar arquivo entre client/server (recomendado, dado que é puro e
   pequeno) ou aceitar uma pasta compartilhada só para esse caso, contrariando a preferência
   inicial do usuário?
   Resposta: duplicar. EM HIPÓSTESE ALGUMA DEVE SER ACEITO CÓDIGO SHARED, O CLIENT E O SERVER DEVEM SER COMPLETAMENTE INDEPENDENTES, comunicação deve ser feita via api
4. **Sessão JWT**: manter cookie httpOnly (mais seguro, mas exige CORS + `credentials: true` +
   `SameSite=None`+HTTPS em todo ambiente, inclusive o Docker Compose local) ou migrar para
   `Authorization: Bearer` guardado em memória/localStorage no client (mais simples de operar
   cross-origin, mas superfície de XSS maior)?
   Resposta: migrar para `Authorization: Bearer` guardado em localStorage no client, com 7d de validade sem refresh token
5. **Ambiente de validação via Docker Compose**: como resolver HTTPS/cookie cross-site localmente —
   proxy reverso único (nginx/traefik) na frente de client+server sob o mesmo domínio só para essa
   validação, ou aceitar `Secure` com certificado autoassinado?
   Resposta: fazer do jeito mais simples considerando a resposta do item 4
6. **`template.json`**: apagar ou manter como histórico do template original?
   Resposta: apagar
7. **Dependências possivelmente não usadas** (`@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`,
   `@types/google.maps`): confirmar com build/depcheck antes de remover do `package.json`.
   Resposta: remover 

---

## 10. O que já está pronto para portar sem mudança estrutural

Para não perder de vista o que *não* precisa de trabalho de desacoplamento:

- `server/dashboardService.ts`, `server/importService.ts`, `server/exportService.ts`,
  `server/exportRoutes.ts`, `shared/calcEngine.ts` (conteúdo), `drizzle/schema.ts` (estrutura de
  domínio, só o dialeto muda), todas as rotas de negócio em `routers.ts` (companies, areas,
  perspectives, indicators, objectives, calibrationRules, weights, applicability, entries, importer,
  dashboard) e toda a suíte de testes de domínio.
