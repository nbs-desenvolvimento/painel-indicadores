# Plano — Dashboard por Indicadores (filtro hierárquico)

## 1. Contexto e objetivo

Hoje `client/src/pages/DashboardIndicadores.tsx` (`/dashboard/indicadores`, menu
"Por Indicador") só permite ver **um indicador por vez**: um seletor único
lista todos os indicadores da empresa, achatados, sem respeitar a hierarquia
perspectiva → objetivo → indicador.

O pedido é evoluir essa tela para **"Dashboard por Indicadores"** (plural),
mantendo o filtro por indicador único de hoje, mas adicionando dois níveis de
filtro hierárquico **acima** dele:

- **Por perspectiva** — ver todos os indicadores daquela perspectiva,
  agrupados.
- **Por objetivo** — ver todos os indicadores daquele objetivo, agrupados.

Ou seja, a tela passa a ter três seletores em cascata (Perspectiva → Objetivo
→ Indicador), e o conteúdo mostrado depende de até onde o usuário desceu na
hierarquia:

- Só perspectiva escolhida (objetivo e indicador em "Todos") → **visão
  agrupada** de todos os indicadores daquela perspectiva.
- Perspectiva + objetivo escolhidos (indicador em "Todos") → **visão
  agrupada** de todos os indicadores daquele objetivo.
- Indicador específico escolhido → **visão individual**, exatamente a tela de
  hoje (Meta×Resultado, Score, evolução de 12 meses, áreas aplicáveis).

## 2. Boa notícia: não precisa mexer no backend

Diferente do Dashboard por Objetivo (que exigiu agregação nova em
`dashboardService.ts`), aqui **toda a agregação necessária já está disponível
no client** a partir do snapshot/history atuais:

- `snap.indicators` já traz `perspectiveId` e `objectiveId` de cada
  indicador — o suficiente para filtrar por perspectiva/objetivo.
- `snap.indicatorScores` já é **por indicador, não por área** (goal/result são
  por indicador/período — `indicator_entries`, chave `indicatorId+year+month`)
  — então a "média do grupo" (perspectiva ou objetivo) é uma simples média
  aritmética dos scores já calculados, sem nenhuma regra de negócio nova.
- `history.periods[].indicatorScores` traz a mesma coisa por período, para o
  gráfico de evolução de 12 meses do grupo.
- `snap.applicability` já permite montar a união de áreas aplicáveis de um
  conjunto de indicadores.

**Decisão de design:** a "média do grupo" (perspectiva ou objetivo) será
calculada **no client**, com uma função utilitária pura (não em
`calcEngine.ts`, que é espelhado 1:1 entre client/server e reservado para
regras de score/atingimento). Isso não é "regra de negócio nova" — é só a
média aritmética de números que o server já calculou e já enviou ao client
(mesmo princípio já usado em `Home.tsx`, que ordena/formata `areaScores` sem
recalcular nada). Não vale a pena um novo campo no snapshot só para isso,
diferente do que fizemos para `objectiveScores` (que soma _weight_ e
diferentes fontes — ali sim havia regra de negócio duplicável).

**Consequência prática:** este plano é **100% frontend**. Nenhuma migration,
nenhuma rota nova, nenhuma mudança em `dashboardService.ts`/`routers.ts`.

## 3. Relação com os dashboards já existentes (por que não é redundante)

- `DashboardPerspectivas.tsx` e `DashboardObjetivos.tsx` respondem "como essa
  perspectiva/objetivo performa **por área**" (média × peso, distribuição
  entre áreas) — a lente é a **área**.
- Este novo modo do Dashboard por Indicadores responde "quais são os
  indicadores dessa perspectiva/objetivo e como cada um está indo" — a lente
  é o **indicador**, sem dimensão de área. É uma tabela/comparação de
  indicadores lado a lado, não um gauge ponderado por peso de área.

Os dois tipos de visão se complementam e continuam cobrindo perguntas
diferentes; não há sobreposição de propósito a resolver.

## 4. UX — os três seletores em cascata

No `PageToolbar`, substituir o seletor único atual por três `Select` em
sequência (mesmo padrão visual de `CadastroIndicadores.tsx`, que já tem um
filtro "Todas as perspectivas" com opção agregadora):

1. **Perspectiva**: `Todas as perspectivas` | uma opção por perspectiva ativa.
2. **Objetivo**: `Todos os objetivos` | objetivos da perspectiva selecionada
   (todos, se perspectiva = "Todas") | `Sem objetivo vinculado` (bucket —
   só aparece se houver ao menos 1 indicador nessa condição dentro do escopo
   de perspectiva atual; reaproveita o conceito de `unassignedIndicatorCount`
   já introduzido no Dashboard por Objetivo, mas aqui como filtro navegável
   em vez de só um aviso).
3. **Indicador**: `Todos os indicadores (visão agrupada)` | indicadores que
   sobrevivem ao filtro de perspectiva+objetivo acima.

### Regras de interação (cascata)

- Trocar **Perspectiva** → reseta Objetivo para "Todos" e Indicador para
  "Todos" (os filhos deixam de ser válidos, comportamento padrão de filtro
  em cascata).
- Trocar **Objetivo** → reseta Indicador para "Todos", mantém Perspectiva.
- Escolher um **Indicador específico** diretamente → os selects de
  Perspectiva/Objetivo são **sincronizados automaticamente** para refletir a
  perspectiva/objetivo daquele indicador (nunca fica um indicador selecionado
  com breadcrumb "errado" acima dele).
- **Estado inicial ao abrir a página** (sem querer quebrar quem já usa a
  tela hoje): igual ao comportamento atual — primeiro indicador da lista é
  pré-selecionado (visão individual), e Perspectiva/Objetivo já nascem
  sincronizados com ele. Ou seja, quem abre a tela hoje continua vendo
  exatamente a mesma coisa; os dois seletores novos são só descoberta
  adicional.

### Deep-link via query string (mesmo padrão de `DashboardAreas.tsx`)

`DashboardAreas.tsx` já lê `?area=` via `useSearchParams` do `wouter` para
permitir link direto (usado em `Home.tsx`, `Ranking`, etc.). Replicar aqui:
`?perspectiva=`, `?objetivo=`, `?indicador=` — permite, por exemplo, um botão
"ver indicadores" em `CadastroObjetivos.tsx`/`DashboardObjetivos.tsx` linkar
direto para a visão agrupada de um objetivo (`/dashboard/indicadores?objetivo=5`).
Fase 2 (não bloqueia o MVP, mas é barato e consistente — considerar incluir
já na primeira entrega já que o padrão está pronto para copiar).

## 5. Visão agrupada (perspectiva e/ou objetivo, Indicador = "Todos")

Componentes/gráficos desta visão:

1. **Card de escopo** — título dinâmico conforme o filtro ativo: "Todos os
   indicadores", "Perspectiva: Financeira", "Objetivo: Ampliar a Receita"
   (com a cor da perspectiva, igual ao padrão de barra colorida já usado nos
   outros cards). Mostra contagem de indicadores no escopo.
2. **`ScoreGauge`** — média dos scores dos indicadores no escopo, no período
   (ignorando indicadores sem meta/resultado lançado, mesma semântica
   `AVERAGE` de sempre). Cálculo client-side conforme §2.
3. **Tabela "Indicadores"** — colunas Indicador / Perspectiva / Objetivo /
   Meta / Resultado / Score (`ScoreBadge`). Mostrar Perspectiva/Objetivo como
   colunas (não só implícitas no título) porque quando o escopo é "Todas as
   perspectivas" ou só uma perspectiva (sem objetivo), a tabela mistura
   indicadores de proveniências diferentes. Cada linha tem uma ação
   (ex.: ícone ou nome clicável) que seleciona aquele indicador no terceiro
   `Select`, entrando na visão individual — atalho natural de drill-down.
4. **Gráfico de barras horizontal "Score por indicador"** — um `BarChart`
   (Recharts) com uma barra por indicador do escopo, cor via `scoreColor`,
   `ReferenceLine` em 100%, mesmo padrão visual usado em
   `DashboardObjetivos.tsx`/`DashboardPerspectivas.tsx` (só trocando a
   dimensão do eixo Y de "área"/"objetivo" para "indicador").
5. **Gráfico de linha "Evolução do Score médio do grupo (12 meses)"** — usa
   `useDashboardHistory` (já existente, sem mudança de assinatura),
   filtrando `indicatorScores` de cada período pelo mesmo conjunto de
   `indicatorId`s do escopo e tirando a média por período. **Não** mostrar
   evolução de Meta×Resultado agregada neste modo — indicadores no mesmo
   grupo podem ter unidades incompatíveis (R$, %, número), então uma série
   combinada de Meta/Resultado não faz sentido; só o Score (sempre 0–120%)
   é comparável entre indicadores.
6. **Chips "Áreas onde os indicadores deste escopo se aplicam"** — união das
   áreas aplicáveis de todos os indicadores do escopo (mesmo padrão já usado
   em `DashboardObjetivos.tsx` e na versão atual de `DashboardIndicadores.tsx`,
   só que agora sobre o conjunto, não um único indicador).

### Empty states da visão agrupada

- Perspectiva/objetivo sem nenhum indicador no escopo → mensagem inline
  "Nenhum indicador neste escopo." no lugar da tabela/gráficos (mesmo
  espírito do tratamento já usado em `DashboardObjetivos.tsx` para objetivo
  sem indicador vinculado).
- Empresa sem nenhum indicador cadastrado → mesmo `DashboardEmptyState` já
  usado hoje (comportamento inalterado).

## 6. Visão individual (Indicador específico selecionado)

**Sem mudanças de conteúdo** — é exatamente o que `DashboardIndicadores.tsx`
já renderiza hoje (card de identificação, Meta×Resultado, `ScoreGauge`,
evolução Meta×Resultado 12 meses, evolução do Score 12 meses, áreas
aplicáveis). Só passa a aparecer abaixo dos três seletores em cascata em vez
do seletor único de hoje.

## 7. Estrutura de código sugerida

Manter tudo em `client/src/pages/DashboardIndicadores.tsx` (consistente com o
resto do projeto — nenhuma outra página de dashboard usa subpastas), mas
dividir em duas funções de renderização internas para não criar um
componente gigante com `if`s espalhados:

```tsx
export default function DashboardIndicadores() {
  // estado dos 3 filtros, sincronização em cascata, dados (snapshot/history) — comum aos dois modos
  ...
  return (
    <div className="fade-up">
      <PageToolbar title="Dashboard por Indicadores" ...>
        {/* 3 selects em cascata */}
      </PageToolbar>
      {indicatorId ? <SingleIndicatorView .../> : <IndicatorGroupView .../>}
    </div>
  );
}

function SingleIndicatorView(props) { /* conteúdo idêntico ao atual */ }
function IndicatorGroupView(props) { /* conteúdo descrito no §5 */ }
```

Utilitário puro para a média do grupo (novo arquivo pequeno, sem relação com
`calcEngine.ts`): `client/src/lib/indicatorGrouping.ts` com algo como:

```ts
export function averageScore(scores: (number | null)[]): number | null {
  const valid = scores.filter((s): s is number => s !== null);
  return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
}
```

## 8. Navegação e nomenclatura (renomear "Indicador" → "Indicadores")

Ocorrências a ajustar (busca já feita no código, lista exaustiva):

- `client/src/components/DashboardLayout.tsx:71` — label do menu:
  `"Por Indicador"` → `"Por Indicadores"` (ícone `BarChart3` inalterado,
  path `/dashboard/indicadores` inalterado — sem quebrar links existentes).
- `client/src/pages/DashboardIndicadores.tsx` — dois `PageToolbar title=`:
  `"Dashboard por Indicador"` → `"Dashboard por Indicadores"` (no empty
  state e no conteúdo principal).
- Nenhuma outra ocorrência no client/server faz referência a este título
  específico (`exportService.ts` usa apenas o nome genérico de aba
  "Indicadores", já correto, sem mudança).

## 9. Testes

Como não há mudança de backend, não há necessidade de testes em
`server/*.test.ts`. Cobertura recomendada:

- Testar manualmente (ou, se o projeto adotar Vitest+Testing Library para
  componentes no futuro, escrever teste unitário para) a função pura
  `averageScore` em `indicatorGrouping.ts` — casos: lista vazia, todos null,
  mistura de null e valores, só valores.
- `pnpm check` (tsc) em `client/` — obrigatório, sem exceção, já que toda a
  mudança é TypeScript/React.

## 10. Ordem de implementação sugerida

1. `client/src/lib/indicatorGrouping.ts` — utilitário `averageScore` (+
   qualquer helper de filtragem por escopo, ex.: `indicatorsInScope`).
2. Refatorar `DashboardIndicadores.tsx`: extrair o conteúdo atual para
   `SingleIndicatorView`, sem mudar nada nele.
3. Implementar o estado dos 3 filtros + regras de cascata (§4) no
   componente principal.
4. Implementar `IndicatorGroupView` (§5).
5. Trocar o seletor único do `PageToolbar` pelos 3 `Select`s em cascata.
6. Renomear rótulos (§8).
7. (Opcional/fase 2) Deep-link via query string (§4).
8. QA manual (checklist abaixo) + rebuild do client no Docker Compose.

## 11. Checklist de validação manual

- [ ] Abrir a tela pela primeira vez: comportamento idêntico ao de hoje
      (primeiro indicador selecionado, breadcrumb de perspectiva/objetivo já
      sincronizado).
- [ ] Selecionar uma perspectiva e deixar objetivo/indicador em "Todos" →
      visão agrupada com todos os indicadores daquela perspectiva.
- [ ] Selecionar um objetivo (dentro de uma perspectiva) e deixar indicador
      em "Todos" → visão agrupada só com os indicadores daquele objetivo.
- [ ] Selecionar "Sem objetivo vinculado" → visão agrupada com os
      indicadores da perspectiva atual que não têm objetivo.
- [ ] A partir da visão agrupada, clicar num indicador da tabela → cai na
      visão individual, com os 3 seletores refletindo o indicador escolhido.
- [ ] Trocar a perspectiva enquanto um indicador estava selecionado → reseta
      objetivo/indicador para "Todos" (não deixa um indicador "orfão"
      selecionado fora do escopo).
- [ ] Escopo sem nenhum indicador (objetivo recém-criado sem indicadores) →
      mensagem inline, sem quebrar a página.
- [ ] Responsivo (mobile) e dark mode, como as demais telas.
- [ ] Exportação Excel (`showExport`) continua funcionando (ela já é
      independente do filtro da tela — gera o relatório completo da
      empresa/período, não filtrado pela seleção atual; nenhuma mudança
      necessária ali).

## 12. Fora de escopo (não fazer nesta entrega)

- Gráfico de evolução com uma linha por indicador na visão agrupada (múltiplas
  séries, legendas dinâmicas) — fica como possível refinamento futuro; o
  gráfico de barras "Score por indicador" já cobre a comparação ponto-a-ponto
  no período atual.
- Persistir a agregação "média do grupo" no backend (`perspectiveScores`
  company-wide, análogo ao `objectiveScores` já existente) — decisão
  deliberada (§2), reavaliar só se surgir necessidade de reaproveitar esse
  número em outro lugar (ex.: export Excel, outro dashboard).
- Mudar a rota (`/dashboard/indicadores` permanece a mesma).
