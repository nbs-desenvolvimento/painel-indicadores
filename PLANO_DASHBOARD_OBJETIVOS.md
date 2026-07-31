# Plano — Dashboard por Objetivo

## 1. Contexto

O sistema já tem três dashboards de detalhe por entidade, todos seguindo o mesmo
padrão (seletor no toolbar + cards de resumo + tabela + gráfico(s)):

- `DashboardAreas.tsx` → `/dashboard/areas`
- `DashboardPerspectivas.tsx` → `/dashboard/perspectivas`
- `DashboardIndicadores.tsx` → `/dashboard/indicadores`

A hierarquia do BSC no banco é **perspectiva → objetivo → indicador**
(`objectives.perspectiveId`, `indicators.objectiveId`). A tabela `objectives` e o
CRUD (`CadastroObjetivos.tsx`, `server/routers.ts` → `objectives.*`) **já
existem e estão prontos** — não há migration nem endpoint de cadastro para
criar. O que falta é inteiramente a camada de **visualização de desempenho**:
hoje `dashboardService.ts` calcula score por área, por perspectiva e por
indicador, mas **nunca agrega por objetivo** — `objectives` nem aparece no
snapshot retornado ao client.

Este documento é o plano de implementação do dashboard `Por Objetivo`, do
banco até o ícone da sidebar. Nenhuma migration de banco é necessária.

## 2. O que já existe (não mexer / só reaproveitar)

| Camada | Arquivo | O que tem |
|---|---|---|
| Schema | `server/drizzle/schema.ts` | `objectives` (id, companyId, perspectiveId, name, description, sortOrder, active) e `indicators.objectiveId` (nullable) |
| CRUD backend | `server/db.ts` (`listObjectives`, `createObjective`, `updateObjective`, `deleteObjective`), `server/routers.ts` (`objectives` router) | Completo |
| CRUD frontend | `client/src/pages/CadastroObjetivos.tsx`, ícone `Crosshair` em Cadastros | Completo |
| Tipos client | `client/src/lib/apiTypes.ts` → `interface Objective` | Completo |
| Motor de cálculo | `server/calcEngine.ts` (`computeScore`, `computeScoreWithRule`, `computeAreaScore`) | Reaproveitar; só adicionar uma função de agregação por objetivo |
| Componentes de UI reutilizáveis | `client/src/components/shared.tsx` (`PageToolbar`, `ScoreBadge`, `ScoreGauge`, `DashboardEmptyState`, `PageSkeleton`, `DirectionIcon`) e `AppContext` (`fmtScore`, `fmtValue`, `scoreColor`, `useApp`) | Reaproveitar integralmente, nenhum componente novo de design system é necessário |

## 3. Regra de cálculo do score do objetivo

Hoje `computeAreaScore` (calcEngine.ts:225) agrupa os indicadores aplicáveis de
uma área **por `perspectiveId`** e tira a média simples dos scores. Para
objetivo, a mesma lógica se aplica um nível abaixo, agrupando **por
`objectiveId`** em vez de `perspectiveId`:

- **Score do objetivo em uma área** = média aritmética dos scores dos
  indicadores que (a) pertencem ao objetivo e (b) são aplicáveis àquela área,
  no período. Indicadores sem meta/resultado lançado são ignorados na média
  (mesma semântica do `AVERAGE` da planilha).
- **Score do objetivo na empresa (sem quebra por área)** = média simples dos
  scores de todos os indicadores do objetivo com dado lançado no período
  (goal/result são por indicador/período, não por área — ver
  `indicator_entries`, chave `indicatorId+year+month`), independente de quantas
  áreas o indicador atende. Esse é o número "geral" mostrado no header do
  dashboard.
- Objetivo **não tem peso próprio** (diferente de perspectiva × área, que usa
  `area_perspective_weights`) — não existe conceito de "peso do objetivo" no
  modelo de dados atual, então o score do objetivo não entra na soma
  ponderada do score total da área. Ele é puramente uma lente analítica
  intermediária, sem efeito no cálculo do score da área/perspectiva já
  existente. **Não alterar `computeAreaScore`** — só adicionar uma função
  paralela.

### Nova função em `server/calcEngine.ts`

```ts
export interface ObjectiveScore {
  objectiveId: number;
  average: number | null; // média dos scores dos indicadores do objetivo (aplicáveis, com dado)
  indicatorScores: { indicatorId: number; name: string; score: number | null }[];
}

export function computeObjectiveScores(
  indicators: IndicatorInput[], // já filtrados por aplicabilidade (por área) ou não (visão empresa)
  objectiveIds: number[],
  indicatorObjectiveMap: Map<number, number | null>,
): ObjectiveScore[]
```

Implementação: mesmo padrão de `computeAreaScore` — filter por
`indicatorObjectiveMap.get(ind.id) === objectiveId`, mapear scores, média dos
`!= null`.

## 4. Backend — `server/dashboardService.ts`

### 4.1 `buildCompanySnapshot`

- Buscar `db.listObjectives(companyId)` junto com as outras listas já buscadas
  em `Promise.all` (linha ~99).
- Filtrar `active`, igual às outras entidades.
- Calcular:
  - `objectiveScoresByArea`: para cada área ativa (já iterada no `.map` que
    monta `areaScores`), calcular `computeObjectiveScores` com os
    `applicableInds` que já são montados ali (linha ~140) — não requer nova
    query, só reaproveitar o array já filtrado por aplicabilidade antes de
    passar para `computeAreaScore`. Anexar ao objeto de retorno de cada área
    (`{ ...score, areaName: area.name, objectives: [...] }`) **ou** devolver
    como uma estrutura irmã `objectiveScoresByArea: { areaId, objectiveId,
    average }[]` — preferir a segunda forma (mais plano, evita inchar
    `areaScores`; ver §4.3 sobre shape do payload).
  - `objectiveScores` (visão empresa, sem quebra por área): usar
    `visibleIndicators` + `entryMap`, agrupado por `objectiveId`, mesma
    tolerância dos demais blocos (ignorar indicador sem `objectiveId`).
- Indicadores com `objectiveId === null` **não entram em nenhuma agregação de
  objetivo** — são visíveis normalmente nos outros dashboards, só ficam de
  fora deste. Contabilizar esse número e devolver no snapshot (ex.:
  `unassignedIndicatorCount`) para o frontend exibir um aviso ao admin (ver
  §6.5).

### 4.2 `buildHistory`

- Mesma lógica de `buildCompanySnapshot`, mas por período (loop `periods.map`
  em dashboardService.ts:250). Para cada período, computar
  `objectiveScores` (visão empresa) reaproveitando `indicatorScores` que já é
  montado ali (linha ~276) — só precisa do mapa indicador→objetivo, buscado
  uma vez fora do loop.
- Necessário para o gráfico de evolução de 12 meses do objetivo (igual ao que
  `DashboardIndicadores` já faz com `useDashboardHistory`).

### 4.3 Shape do payload (novo em `DashboardSnapshot`/`DashboardHistory`)

```ts
// snapshot
objectives: Objective[];                 // ativos da empresa
objectiveScores: {                       // visão empresa, sem quebra por área
  objectiveId: number;
  average: number | null;
  indicatorScores: { indicatorId: number; name: string; score: number | null }[];
}[];
objectiveScoresByArea: {                 // visão por área, para o gráfico "por área"
  areaId: number;
  objectiveId: number;
  average: number | null;
}[];
unassignedIndicatorCount: number;        // indicadores ativos sem objectiveId

// history (por período)
periods[].objectiveScores: { objectiveId: number; average: number | null }[];
```

### 4.4 `server/routers.ts`

- **Nenhuma rota nova.** `dashboard.snapshot` e `dashboard.history` já
  passam por `buildCompanySnapshot`/`buildHistory` — o payload maior é
  automático. Único cuidado: confirmar que `scopedAreaIds` (routers.ts:21)
  continua sendo aplicado antes de chamar essas funções (já é — não muda).

### 4.5 Tipos do client — `client/src/lib/apiTypes.ts`

- Adicionar os campos acima em `DashboardSnapshot` e em `HistoryPeriod`.
- Exportar `ObjectiveScore` (mirror manual do server, como já é feito para
  `AreaScore`/`PerspectiveScore` via `@/lib/calcEngine`). Como `calcEngine.ts`
  é duplicado entre client e server (pacotes independentes, sem import
  cruzado — ver README §Arquitetura), a nova função
  `computeObjectiveScores`/`ObjectiveScore` também precisa existir em
  `client/src/lib/calcEngine.ts` para manter o padrão de tipos espelhados
  (mesmo que o client não recalcule nada, só tipe o retorno do snapshot).

### 4.6 `server/exportService.ts` (opcional, fase 2)

- Hoje há sheets "Visão Geral", "Perspectivas", "Indicadores", "Heatmap" — não
  existe sheet "Áreas" (o dashboard de área também não tem exportação
  dedicada), então **não é obrigatório** criar uma sheet "Objetivos" para
  manter consistência com o padrão atual. Registrar como débito conhecido,
  não bloqueante.

## 5. Frontend — nova página `client/src/pages/DashboardObjetivos.tsx`

Seguir o mesmo esqueleto de `DashboardPerspectivas.tsx` (é o mais próximo
estruturalmente, já que objetivo também pertence a uma perspectiva e agrega
vários indicadores).

### 5.1 Estado e dados

- `useApp()` para `companyId/year/month/periodLabel`.
- `useAuth()` para `isAdmin` (empty state).
- `useDashboardSnapshot` (já existente, sem mudança de assinatura).
- `useDashboardHistory` com `buildLast12Periods` (mesmo helper hoje
  duplicado dentro de `DashboardIndicadores.tsx` — **extrair para
  `client/src/lib/` como utilitário compartilhado** nesta implementação, já
  que será a segunda página a precisar dele; evita duplicar a função uma
  terceira vez).
- Estado local `objectiveId` (padrão: primeiro objetivo da primeira
  perspectiva, mesmo efeito `useEffect` de auto-seleção usado nas outras 3
  páginas).

### 5.2 Toolbar

- `PageToolbar title="Dashboard por Objetivo" subtitle={...periodLabel} showExport`.
- Seletor: `Select` **agrupado por perspectiva** (usar `SelectGroup`/
  `SelectLabel` do componente `ui/select`, já usado assim em outras telas do
  projeto — confirmar em `CadastroRegras`/`Lancamentos` se já existe esse
  padrão de grupo; senão, lista simples com o nome da perspectiva como
  prefixo, ex.: "Financeira — Ampliar a Receita", igual ao que
  `CadastroObjetivos` já faz visualmente com cards por perspectiva).

### 5.3 Componentes/gráficos da tela (lista completa)

1. **Card de identificação do objetivo** — barra de cor da perspectiva
   (`selected.color`), nome do objetivo, descrição, badge com nº de
   indicadores vinculados e nº de áreas onde é aplicável. (Card simples,
   reaproveita padrão de `DashboardPerspectivas` linha 95-129.)
2. **`ScoreGauge`** — score médio do objetivo na empresa no período
   (`objectiveScores.find(o => o.objectiveId === selected.id)?.average`).
   Mesmo componente usado em `DashboardIndicadores`/`DashboardAreas`.
3. **Tabela "Indicadores do objetivo"** — colunas Indicador / Meta / Resultado
   / Score (`ScoreBadge`), mesma tabela de `DashboardPerspectivas` linha
   102-128, trocando o filtro de `perspectiveId` para `objectiveId`.
4. **Gráfico de barras horizontal "Score do objetivo por área"** — usa
   `objectiveScoresByArea` filtrado pelo objetivo selecionado; mesmo
   componente Recharts `BarChart`/`Cell`/`scoreColor`/`ReferenceLine` de
   `DashboardPerspectivas` linha 137-160 (cópia quase literal, trocando a
   fonte do dado).
5. **Gráfico de linha "Evolução do score do objetivo (12 meses)"** — usa
   `history.periods[].objectiveScores`, mesmo padrão de
   `DashboardIndicadores` linha 192-211 (`LineChart` de uma série `score`,
   domínio `[0, 120]`, `ReferenceLine` opcional em 100).
6. **Lista/chips "Áreas onde os indicadores deste objetivo se aplicam"** —
   mesmo padrão de `DashboardIndicadores` linha 214-238 (chips com nome da
   área), mas a união das áreas aplicáveis de **todos** os indicadores do
   objetivo (não de um único indicador).
7. **Aviso de dados incompletos** (só quando `isAdmin` e
   `unassignedIndicatorCount > 0`) — pequeno alerta/texto no topo da página:
   "N indicador(es) ativo(s) sem objetivo vinculado — não aparecem neste
   dashboard. Vincule em Cadastros → Objetivos.", com link para
   `/cadastros/objetivos`. Evita a falsa impressão de que a soma dos
   indicadores dos objetivos bate com o total de indicadores da empresa.

### 5.4 Empty states

- Sem `companyId` ou carregando → `PageSkeleton` (padrão).
- Sem nenhum objetivo cadastrado (`snap.objectives.length === 0`) →
  `DashboardEmptyState` com `adminTitle="Nenhum objetivo cadastrado"` e
  `adminDescription="Cadastre objetivos estratégicos para visualizar este
  dashboard."` (mesmo padrão das outras 3 páginas).
- Objetivo selecionado sem nenhum indicador vinculado → mensagem inline no
  lugar da tabela/gráficos ("Nenhum indicador vinculado a este objetivo
  ainda."), não um empty-state de página inteira (o objetivo existe, só não
  tem filhos ainda — mesmo espírito do "Nenhum objetivo cadastrado nesta
  perspectiva" em `CadastroObjetivos.tsx` linha 274-278).

## 6. Navegação

### 6.1 `client/src/App.tsx`

- Importar `DashboardObjetivos` de `./pages/DashboardObjetivos`.
- Nova rota, posicionada entre perspectiva e indicador (reflete a hierarquia):

```tsx
<Route path={"/dashboard/perspectivas"} component={DashboardPerspectivas} />
<Route path={"/dashboard/objetivos"} component={DashboardObjetivos} />
<Route path={"/dashboard/indicadores"} component={DashboardIndicadores} />
```

### 6.2 `client/src/components/DashboardLayout.tsx` — item de menu + ícone

- Grupo "Dashboards" (linha 65-76), inserir entre "Por Perspectiva" e "Por
  Indicador":

```tsx
{ icon: Crosshair, label: "Por Objetivo", path: "/dashboard/objetivos" },
```

- **Ícone**: reaproveitar `Crosshair` (já importado no arquivo, hoje só usado
  em Cadastros → Objetivos). É o mesmo padrão já existente no arquivo de usar
  o mesmo ícone para a mesma entidade em Dashboards e em Cadastros (`Compass`
  é usado tanto em "Por Perspectiva" quanto em "Perspectivas" no cadastro).
  Não precisa importar ícone novo do `lucide-react`.

## 7. Testes

- `server/calcEngine.test.ts` — casos novos para `computeObjectiveScores`:
  média simples ignorando indicador sem score, objetivo sem nenhum
  indicador aplicável → `average: null`, indicador com `objectiveId: null`
  não deve aparecer em nenhum grupo.
- `server/dashboardService.test.ts` (não existe ainda — se for criado,
  seguir o padrão de `accessControl.test.ts`/`areaHierarchy.test.ts` que já
  sobem um banco de teste) — validar que `objectiveScores` e
  `objectiveScoresByArea` respeitam `allowedAreaIds` (usuário comum só vê
  objetivos cujos indicadores são aplicáveis às áreas liberadas a ele — ver
  a lógica de `visibleIndicatorIds` em dashboardService.ts:160-168, que já
  existe e deve ser reaproveitada tal e qual para não abrir um buraco de
  visibilidade por área).
- Rodar `pnpm test` em `server/` (`vitest run`) e `pnpm check` (`tsc
  --noEmit`) em ambos os pacotes antes de considerar a fase de backend
  concluída.

## 8. Ordem de implementação sugerida

1. `server/calcEngine.ts` — `computeObjectiveScores` + testes unitários.
2. `server/dashboardService.ts` — estender `buildCompanySnapshot` e
   `buildHistory` com os novos campos (§4.1–4.3).
3. `server/routers.ts` — nenhuma mudança funcional, só validar que o payload
   maior passa pelo `protectedProcedure` sem quebrar nada (rodar `pnpm dev`
   e chamar `dashboard.snapshot` manualmente).
4. `client/src/lib/calcEngine.ts` + `client/src/lib/apiTypes.ts` — espelhar
   os novos tipos.
5. Extrair `buildLast12Periods` para um util compartilhado (pequeno
   refactor, feito uma vez).
6. `client/src/pages/DashboardObjetivos.tsx` — construir a página completa
   (§5).
7. `client/src/App.tsx` + `DashboardLayout.tsx` — rota e item de menu (§6).
8. QA manual (checklist abaixo) + `docker compose build --no-cache client
   server` para validar em ambiente completo.

## 9. Checklist de validação manual (adicionar ao checklist do README)

- [ ] Criar 2+ perspectivas, 2+ objetivos por perspectiva, indicadores
      vinculados a objetivos diferentes.
- [ ] Lançar meta/resultado para os indicadores e conferir score do
      objetivo no gauge e na tabela.
- [ ] Trocar o seletor de objetivo e confirmar que gauge, tabela, gráfico
      por área e evolução mensal atualizam.
- [ ] Deixar 1 indicador ativo sem `objectiveId` e confirmar que o aviso
      "N indicador(es) sem objetivo vinculado" aparece para admin.
- [ ] Logar com usuário comum restrito a uma área e confirmar que só vê
      objetivos cujos indicadores são aplicáveis às áreas liberadas a ele.
- [ ] Excluir um objetivo com indicadores vinculados (via
      `CadastroObjetivos`) e confirmar que o dashboard não quebra (indicador
      passa a `objectiveId: null`, some do dashboard, aparece no aviso).
- [ ] Responsivo (mobile) e dark mode, como as demais telas.

## 10. Fora de escopo (não fazer nesta entrega)

- Peso próprio de objetivo na soma do score da área/perspectiva (mudaria o
  cálculo total já validado contra a planilha — fora do pedido atual).
- Sheet "Objetivos" no export Excel (§4.6, débito conhecido, não bloqueante).
- Enforçar no schema que `indicators.perspectiveId === objectives.perspectiveId`
  quando `objectiveId` é setado (hoje não há constraint; um indicador pode,
  em teoria, apontar para um objetivo de outra perspectiva). Vale nota de
  atenção, mas resolver isso é um item de integridade de dados separado, não
  do dashboard.
