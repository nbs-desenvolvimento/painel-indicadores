# Plano — Multi-tenancy real por empresa

## 1. O que foi pedido

- Tirar "Empresas" do menu **Cadastros** e colocar em **Administração**.
- Na sidebar, no botão de usuário (onde hoje só tem "Sair"), adicionar um
  seletor de empresa — clicar troca de empresa com 1 clique.
- No topo da sidebar, uma indicação discreta de qual empresa está sendo
  exibida no momento.
- Modelo de acesso (definido após revisão, ver §4):
  - **Administrador**: sem restrição — enxerga **todas** as empresas
    cadastradas no sistema, sempre, sem precisar de vínculo explícito.
  - **Usuário comum**: pertence a **uma ou mais** empresas, obrigatório
    indicar **pelo menos uma** no cadastro do usuário.
- "Vamos separar tudo por empresa" — isolamento real de dados entre
  empresas (tenants) para usuários comuns, não só um filtro de conveniência
  na tela.
- Uma etapa do plano precisa orientar como aplicar isso no banco do Neon,
  **sem risco de perda de dado** (hoje o Neon tem 1 empresa, 1 admin e 1
  usuário comum).

## 2. Análise do problema — o que existe hoje

Fui conferir o código antes de desenhar a solução. Resultado: **hoje não
existe isolamento por empresa nenhum no servidor.** O seletor de empresa
(`useApp()`/`PageToolbar`) é 100% cosmético — uma conveniência de UI, não uma
fronteira de segurança. Achados concretos:

1. **`trpc.companies.list`** (`server/routers.ts:154`) é só
   `protectedProcedure` — devolve **todas** as empresas do sistema para
   **qualquer** usuário logado, admin ou não. Não existe hoje o conceito de
   "empresas que este usuário pode ver".
2. **`users` não tem nenhuma associação com `companies`.** O schema
   (`server/drizzle/schema.ts`) só tem `userAreas` (usuário → área). Área
   pertence a uma empresa (`areas.companyId`), mas nada impede hoje um admin
   de liberar para um usuário áreas de empresas diferentes — não existe
   validação nenhuma amarrando "este usuário é da empresa X".
3. **As listas de perspectivas/objetivos/indicadores/regras de calibragem
   aceitam qualquer `companyId`, sem checar se o usuário tem relação com
   aquela empresa.** Ex.: `perspectives.list`, `objectives.list`,
   `indicators.list`, `calibrationRules.list` — todos `protectedProcedure`
   com `companyId` opcional, sem nenhum `assert` de propriedade. Um usuário
   comum, mesmo restrito por área, consegue hoje **enumerar nomes de
   perspectivas/objetivos/indicadores/regras de calibragem de uma empresa
   qualquer** só passando o `companyId` certo — não vaza resultado (meta ×
   resultado), mas vaza a taxonomia/configuração.
4. **A exportação Excel (`server/exportRoutes.ts`) é o caso mais grave.**
   `/api/export/excel` e `/api/export/template` só checam se existe um
   usuário logado (`ctx.user`) — não checam `allowedAreaIds` **nem**
   `companyId`. `generateExcelReport(companyId, ...)` não recebe nenhuma
   lista de áreas permitidas. Ou seja: **hoje, um usuário comum, restrito a
   1 área, consegue baixar o relatório Excel completo (todas as áreas,
   todos os indicadores) de qualquer empresa do sistema, só trocando o
   `companyId` na URL.** Isso já é um bug de acesso mesmo sem multi-tenant.
5. **`Usuarios.tsx` já depende implicitamente da empresa "ativa" no
   contexto global.** O formulário de cadastro de usuário busca áreas via
   `areas.list({ companyId: <empresa ativa no seletor global> })` — hoje só
   dá pra liberar áreas da empresa que está selecionada no topo da tela no
   momento, sem nenhum campo explícito "este usuário é da empresa X"
   gravado no banco.

**Conclusão da análise:** isso não é "adicionar um filtro" — é adicionar uma
**camada de autorização por empresa** que hoje não existe. A boa notícia,
depois da decisão do §4: o modelo final é **exatamente o mesmo padrão que já
existe hoje para área × usuário comum** (`scopedAreaIds`: `null` para admin,
lista explícita para usuário comum) — só replicado um nível acima, para
empresa. Não é um conceito novo no sistema, é o mesmo conceito já usado,
aplicado de novo.

## 3. Modelo de dados novo

Uma tabela nova, no mesmo padrão que `user_areas` já usa (`server/drizzle/schema.ts`):

```ts
export const userCompanies = pgTable(
  "user_companies",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull(),
    companyId: integer("companyId").notNull(),
  },
  (t) => [uniqueIndex("uq_user_company").on(t.userId, t.companyId)],
);
```

- **Sem coluna nova em `users`.** Mesma tabela de junção de sempre.
- **Só é usada para usuário comum.** Admin não grava linha nenhuma aqui —
  ele enxerga todas as empresas independente do conteúdo desta tabela
  (mesmíssimo tratamento que `user_areas` já recebe para admin hoje: "admin
  não é restrito por área — qualquer área residual é limpa").
- **Migration 100% aditiva** — `CREATE TABLE` novo, sem alterar, sem
  remover, sem tocar em nenhuma coluna ou linha das tabelas existentes.
  Zero risco para os dados que já existem no Neon (ver §12).

## 4. Decisão de design (definida)

**Resolvido:** administrador **não** tem restrição por empresa — continua
enxergando todas as empresas cadastradas no sistema, sempre, exatamente como
hoje já acontece com área. Usuário comum passa a ter **uma ou mais**
empresas vinculadas (não mais "exatamente uma" — meu rascunho inicial
propunha isso, mas foi revisto: agora é "pelo menos uma, podendo ser mais",
igual à cardinalidade de área).

Isso simplifica bastante o desenho em relação à primeira versão deste
plano:

- `scopedCompanyIds(ctx)` fica **idêntico em forma** a `scopedAreaIds(ctx)`
  já existente: `null` = sem restrição (admin), `number[]` = lista
  explícita (usuário comum).
- Não precisa de "vincular automaticamente o admin criador a uma empresa
  nova" — ele já vê qualquer empresa nova automaticamente, sem precisar de
  vínculo.
- O formulário de cadastro de usuário só pede empresa(s) quando
  `role === "user"` — para admin, o campo nem aparece (mesmo padrão que já
  existe hoje para o campo de áreas).

## 5. Regras de negócio

- **Usuário comum (`role = "user"`)**: uma ou mais empresas, obrigatório
  indicar **pelo menos uma** no cadastro. Não é permitido salvar um usuário
  comum sem nenhuma empresa.
- **Administrador (`role = "admin"`)**: sem restrição — vê todas as
  empresas do sistema automaticamente. Nenhum campo de empresa é
  necessário (nem exibido) no cadastro de um admin.
- **Áreas de um usuário comum com 2+ empresas**: o picker de áreas do
  cadastro precisa listar as áreas de **todas** as empresas selecionadas
  para aquele usuário (agrupadas por empresa, para não misturar tudo numa
  lista só quando houver mais de uma) — não só da empresa "ativa" no
  contexto global do admin que está fazendo o cadastro.
- **Trocar de empresa (sidebar)**: só troca qual empresa está "ativa" no
  contexto (`useApp().companyId`) — não muda vínculo nenhum, só a visão
  atual. Continua persistido em `localStorage`. Para admin, a lista no
  seletor é sempre todas as empresas; para usuário comum, só as empresas
  vinculadas a ele.

## 6. Migração de dados existentes (backfill)

Ao aplicar a tabela nova, os usuários comuns já cadastrados ficam sem
nenhuma linha em `user_companies` — precisa de um script de backfill.
Admin não precisa de backfill nenhum (não usa a tabela). Regra:

- **Para cada usuário comum existente**: infere o conjunto de empresas a
  partir das áreas já liberadas para ele (`user_areas` → `areas.companyId`,
  `DISTINCT`) e insere uma linha em `user_companies` para **cada** empresa
  distinta encontrada (podem ser 1 ou mais — não precisa mais escolher só
  uma).
- **Se o usuário não tiver nenhuma área liberada** (caso hoje raro, mas
  possível): vincula à primeira empresa cadastrada (`ORDER BY id`) e
  imprime um aviso no console com o email do usuário, para revisão manual
  depois pela tela de Usuários.
- Script novo, mesmo padrão de `server/seed-db.mjs` (idempotente,
  `DATABASE_URL` do ambiente, `ON CONFLICT DO NOTHING`):
  `server/backfill-user-companies.mjs`.
- **No seu caso específico** (Neon com 1 empresa, 1 admin, 1 usuário
  comum): o admin não recebe nenhuma linha (não precisa), e o usuário comum
  recebe exatamente 1 linha, para a única empresa que já existe — o
  backfill não tem nenhuma ambiguidade para resolver hoje. Só escrevo o
  script de forma genérica pensando em quando você cadastrar a 2ª empresa.

## 7. Backend — autorização

### 7.1 `server/db.ts` — funções novas

```ts
export async function getUserCompanyIds(userId: number): Promise<number[]>
export async function setUserCompanies(userId: number, companyIds: number[]): Promise<void>
export async function listCompaniesForUser(companyIds: number[]) // reaproveita listCompanies filtrando por IN (...)
```

Mesmo padrão de `getUserAreaIds`/`setUserAreas` (`server/db.ts:549-562`).

### 7.2 `server/routers.ts` — helper (espelha `scopedAreaIds` linha por linha)

```ts
/** null = sem restrição (admin). number[] = usuário comum, lista explícita de empresas liberadas. */
async function scopedCompanyIds(ctx: TrpcContext): Promise<number[] | null> {
  if (ctx.user!.role === "admin") return null;
  return db.getUserCompanyIds(ctx.user!.id);
}

async function assertCompanyAccess(ctx: TrpcContext, companyId: number) {
  const allowed = await scopedCompanyIds(ctx);
  if (allowed !== null && !allowed.includes(companyId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem acesso a esta empresa" });
  }
}
```

### 7.3 Onde aplicar `assertCompanyAccess` (checklist exaustivo)

Procedures que recebem `companyId` diretamente — chamar `assertCompanyAccess`
como primeira linha (é um no-op para admin, já que `allowed === null`):

- `dashboard.snapshot`, `dashboard.history`
- `areas.list`, `areas.create`
- `perspectives.list`, `perspectives.create`
- `indicators.list`, `indicators.create`
- `objectives.list`, `objectives.create`
- `calibrationRules.list`, `calibrationRules.create`
- `importacao.importExcel`, `importacao.logs`
- `companies.list` → não é "assert", é **filtro**:
  `scopedCompanyIds(ctx) === null ? db.listCompanies() : db.listCompaniesForUser(allowed)`.

Mutações que recebem só `{ id }` (não `companyId`) — precisam de um lookup
antes de autorizar, já que a linha em si tem `companyId` na própria tabela
(`areas`, `perspectives`, `indicators`, `objectives`, `calibrationRules`
todas já têm a coluna, ver `server/drizzle/schema.ts`):

- `areas.update`, `areas.delete`
- `perspectives.update`, `perspectives.delete`
- `indicators.update`, `indicators.delete`
- `objectives.update`, `objectives.delete`
- `calibrationRules.update`, `calibrationRules.delete`

Padrão sugerido (evita duplicar a query em cada handler):

```ts
async function assertOwnsRow(
  ctx: TrpcContext,
  table: { companyId: PgColumn; id: PgColumn },
  rowId: number,
) {
  const db2 = requireDb(await getDb());
  const [row] = await db2.select({ companyId: table.companyId }).from(table).where(eq(table.id, rowId));
  if (!row) throw new TRPCError({ code: "NOT_FOUND" });
  await assertCompanyAccess(ctx, row.companyId);
}
```

### 7.4 `server/exportRoutes.ts` (Express, fora do tRPC)

`/api/export/excel` e `/api/export/template` precisam do mesmo tratamento:
depois de confirmar `ctx.user`, chamar o equivalente de
`assertCompanyAccess` manualmente (rota Express, não `TRPCError` — responder
`403` direto) antes de gerar o relatório. Aproveitar para também passar
`allowedAreaIds` (`scopedAreaIds`) para `generateExcelReport`, que hoje
ignora completamente a restrição por área (item 2.4 da análise).

### 7.5 `users.create` / `users.update`

Novo campo `companyIds: z.array(z.number())`, só obrigatório/validado
quando `role === "user"` (mesmo padrão que já existe hoje para `areaIds`):

- `role === "user"` → exige `companyIds.length >= 1`.
- `role === "admin"` → `companyIds` é ignorado (nem precisa ser enviado).

`db.createUser`/`db.updateUser` chamam `setUserCompanies` no mesmo lugar
onde hoje chamam `setUserAreas`, com a mesma lógica de "limpa residual
quando vira admin".

## 8. Frontend

### 8.1 Sidebar (`client/src/components/DashboardLayout.tsx`)

- **Mover "Empresas"** do grupo `Cadastros` (linha ~87) para o grupo
  `Administração` (linha ~98), junto com "Usuários". Ícone `Building2`
  continua o mesmo. Sugestão: renomear a rota de `/cadastros/empresas` para
  `/admin/empresas` (troca de 1 linha em `App.tsx` também) — opcional, só
  por consistência com `/admin/usuarios`.
- **Indicação discreta no topo** (`SidebarHeader`, perto do nome do
  sistema, linha ~336): texto pequeno abaixo do nome do app com a empresa
  ativa, ex. `text-[10px] text-sidebar-foreground/40`, escondido quando a
  sidebar está colapsada (mesmo padrão de
  `group-data-[collapsible=icon]:hidden` já usado ali do lado).
  `DashboardLayoutContent` precisa passar a consumir `useApp()` (hoje não
  consome).
- **Seletor de empresa no menu do usuário** (`SidebarFooter`, linha
  ~375-403): o `DropdownMenu` que hoje só tem "Sair" já abre pra cima
  (Radix detecta que está no rodapé da tela e inverte sozinho) — só falta
  deixar isso visualmente explícito com um ícone de seta
  (`ChevronsUpDown`, ao lado do nome/avatar) e adicionar, **acima** do item
  "Sair" (com um `DropdownMenuSeparator` entre os dois), a lista de
  empresas do usuário (`useApp().companies` — para admin já vem com todas,
  para usuário comum já vem só com as dele, pois o filtro já acontece no
  server), cada uma um `DropdownMenuItem` que chama `setCompanyId(c.id)`,
  com um check (`Check` do lucide-react) marcando a empresa ativa. Só
  mostra essa seção se `companies.length > 1` (mesmo critério que
  `PageToolbar` já usa hoje).

### 8.2 `Usuarios.tsx`

- Novo bloco **"Empresas"**, só visível quando `role === "user"` (mesma
  condição que já esconde o bloco de áreas para admin hoje): grade de
  checkboxes (mesmo componente/estilo que o grid de áreas já usado nesta
  tela, ou o padrão `Popover` + `Checkbox` que construímos no Dashboard por
  Área), mínimo 1 marcada.
- **O picker de áreas passa a depender das empresas marcadas no próprio
  formulário**, não da empresa ativa no contexto global — hoje ele busca
  `areas.list({ companyId: <empresa ativa> })`; precisa buscar as áreas de
  **todas** as empresas marcadas no bloco novo (uma chamada por empresa, ou
  um novo endpoint que aceita `companyIds: number[]`) e agrupar visualmente
  por empresa quando houver mais de uma selecionada.

### 8.3 Tipos compartilhados

`client/src/lib/apiTypes.ts`: `UserListItem` ganha `companyIds: number[]`
(mesmo shape de `areaIds` hoje).

## 9. Testes

Estender `server/accessControl.test.ts` (mesmo arquivo/padrão de mocks já
usado para `allowedAreaIds`) com casos novos:

- Usuário comum vinculado só à Empresa A não consegue ler snapshot/áreas/
  perspectivas/indicadores da Empresa B (`FORBIDDEN`).
- Usuário comum vinculado à Empresa A **e** B consegue ler dados de
  qualquer uma das duas, mas não de uma terceira Empresa C.
- Admin consegue ler dados de qualquer empresa, mesmo sem nenhuma linha em
  `user_companies` para ele (bypass total, igual já acontece com área).
- `companies.list`: admin vê todas; usuário comum vê só as suas.
- Backfill: usuário comum com áreas de 2 empresas diferentes recebe as 2
  linhas em `user_companies`; usuário sem áreas recebe a primeira empresa
  cadastrada e o script registra o aviso.

`pnpm test` (server) e `pnpm check` (client + server) obrigatórios antes de
considerar cada fase concluída.

## 10. Ordem de implementação

1. Schema: tabela `user_companies` (`server/drizzle/schema.ts`) +
   `drizzle-kit generate` (gera a migration SQL em `server/drizzle/`).
2. `server/db.ts`: `getUserCompanyIds`, `setUserCompanies`,
   `listCompaniesForUser`, `assertOwnsRow`.
3. `server/backfill-user-companies.mjs` — testado localmente contra o
   Postgres do Docker Compose primeiro.
4. `server/routers.ts`: `scopedCompanyIds`, `assertCompanyAccess`, aplicar
   em todo o checklist do §7.3, e `users.create`/`update` com
   `companyIds`.
5. `server/exportRoutes.ts` + `server/exportService.ts`: checagem de
   empresa e correção do `allowedAreaIds` ausente (§7.4).
6. Testes automatizados (§9) — rodar contra o backend antes de mexer no
   client.
7. Frontend: sidebar (§8.1), `Usuarios.tsx` (§8.2), tipos (§8.3).
8. QA manual (checklist §11) contra o Docker Compose local.
9. Aplicar no Neon (§12) — só depois de tudo acima validado localmente.

## 11. Checklist de validação manual

- [ ] Criar uma 2ª empresa; confirmar que o admin já enxerga as duas sem
      precisar de nenhuma configuração extra.
- [ ] Criar um usuário comum sem marcar nenhuma empresa → deve bloquear o
      salvar.
- [ ] Criar um usuário comum vinculado a 2 empresas → o picker de áreas
      mostra as áreas das duas, agrupadas.
- [ ] Logar como esse usuário comum → o seletor de empresa na sidebar
      mostra exatamente as 2 empresas dele, nenhuma outra.
- [ ] Tentar acessar (via chamada direta ao tRPC, trocando o `companyId`
      manualmente) uma 3ª empresa não vinculada a esse usuário → `FORBIDDEN`.
- [ ] Logar como admin → seletor de empresa mostra todas as empresas do
      sistema, incluindo uma criada depois do admin existir.
- [ ] Tentar baixar `/api/export/excel?companyId=<empresa não vinculada>`
      logado como o usuário comum restrito → deve retornar 403, não o
      arquivo.
- [ ] Rodar o backfill contra uma cópia com usuários antigos e conferir
      que cada usuário comum recebeu as empresas certas.
- [ ] Sidebar: indicação da empresa ativa no topo; seletor no menu do
      usuário funcionando (ícone de seta, abre pra cima, troca com 1
      clique).
- [ ] Menu "Empresas" aparece em Administração, não mais em Cadastros.

## 12. Aplicar no banco do Neon

**Sobre não perder dado nenhum**: essa migration é **só aditiva** —
`CREATE TABLE user_companies` não altera, não apaga e não bloqueia nenhuma
tabela existente. O backfill (§6) só faz `INSERT` na tabela nova; não
existe nenhum passo que apague ou sobrescreva `companies`, `users`,
`areas` ou qualquer outro dado já existente. No seu caso (1 empresa, 1
admin, 1 usuário comum), o resultado esperado depois de rodar tudo é:
`user_companies` com **1 linha só** (o usuário comum vinculado à única
empresa que já existe) — o admin continua sem precisar de linha nenhuma.

**Sobre a connection string do Neon que você colou no chat**: é uma
credencial real — não vou colar ela de volta aqui nem gravar em nenhum
arquivo do repositório. Ela só deve existir como variável de ambiente
temporária na hora de rodar a migration, nunca commitada. Como ela passou
em texto puro pelo chat, vale considerar trocá-la depois pelo painel do
Neon (Settings → Reset password), sem custo além de atualizar onde ela é
usada (Render, `.env` local).

**Passo a passo:**

1. **Rede de segurança antes de migrar**: pelo console do Neon, crie um
   branch (Neon → seu projeto → Branches → "Create branch", a partir de
   `main`) ou confirme que o "Point-in-time restore" está disponível. Como
   a migration em si é só `CREATE TABLE`, o risco real é baixíssimo, mas
   isso não custa nada e cobre qualquer imprevisto.
2. **Gerar a migration** (local, ainda sem tocar no Neon):
   ```bash
   cd server
   pnpm exec drizzle-kit generate
   ```
   Cria um novo arquivo em `server/drizzle/` com o `CREATE TABLE
   user_companies ...`. Revisar o SQL gerado antes de aplicar — deve conter
   só esse `CREATE TABLE` (+ índice único), nada de `ALTER`/`DROP` em
   tabela existente.
3. **Aplicar a migration no Neon**:
   ```bash
   cd server
   DATABASE_URL="<connection string do Neon>" node migrate.mjs
   ```
   (mesmo `migrate.mjs` que já roda no Docker — só aponta pra outro banco
   via variável de ambiente, nada de SQL manual.)
4. **Rodar o backfill**:
   ```bash
   DATABASE_URL="<connection string do Neon>" node backfill-user-companies.mjs
   ```
5. **Conferir**: `SELECT * FROM user_companies` — deve mostrar exatamente 1
   linha (o usuário comum → a empresa existente). Conferir também que
   `SELECT count(*) FROM companies` e `SELECT count(*) FROM users`
   continuam com os mesmos números de antes (nada foi apagado).

Quando chegarmos nessa fase, se você preferir, eu mesmo rodo os passos 2–5
diretamente — só preciso que você confirme que já criou o branch/backup de
segurança do passo 1 antes de eu tocar no banco real.

## 13. Fora de escopo (não fazer nesta entrega)

- Um papel de "super-admin" — não existe mais essa distinção; o único
  papel "admin" já enxerga tudo, então não há necessidade de um terceiro
  papel.
- Isolamento por Row-Level Security no próprio Postgres — fica na camada
  de aplicação (`assertCompanyAccess`), consistente com o resto do sistema
  hoje (área também é checada na aplicação, não no banco).
- Onboarding self-service de novos tenants, cobrança/planos, subdomínio por
  empresa.
