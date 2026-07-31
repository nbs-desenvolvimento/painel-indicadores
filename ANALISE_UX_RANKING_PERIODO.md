# Ranking de Áreas — análise de UX e plano para o seletor de período

## 1. Problema atual

A tela de Ranking (`client/src/pages/Ranking.tsx`) hoje tem um único toggle
("Acumulado no ano" / "Mês") que decide **como agregar** os dados, mas o
**mês de referência** usado nos dois casos vem de `useApp().month`
(`client/src/contexts/AppContext.tsx:21`) — o mesmo estado global de mês que
alimenta Lançamentos, Evolução, Dashboard e a exportação Excel, persistido em
`localStorage["app-month"]`.

Isso mistura dois conceitos que, nas outras telas, são a mesma coisa, mas no
Ranking não são:

- Nas outras telas, "mês selecionado" = "o mês cujos lançamentos estou
  editando/vendo". Um conceito só.
- No Ranking, em modo acumulado, "mês selecionado" passa a significar "até
  onde vai a soma" — um **fim de intervalo**, não "o mês que eu quero ver".

Resultado prático, exatamente como você descreveu: ao abrir a tela, o padrão
já é "Acumulado no ano" (correto), mas o seletor de mês (reaproveitado de
`PageToolbar`, `client/src/components/shared.tsx`) continua ali, e trocar o
mês ali — ou em qualquer outra tela do sistema, já que o estado é global —
muda silenciosamente o que "acumulado" significa. Não existe hoje um jeito de
dizer "quero o acumulado até agora, ponto final, não me pergunte mês".

**Causa raiz:** reaproveitar um estado global de "mês único" para representar
o fim de um intervalo é um erro de modelagem, não um bug de CSS. A correção
anterior (esconder o seletor com `hideMonth` quando `mode === "ytd"`) tratou o
sintoma (o controle visível), mas não resolveu a causa: o valor que define o
acumulado continua sendo um estado que qualquer outra tela do app pode alterar
por baixo dos panos.

---

## 2. Princípios de UX adotados nesta análise

1. **Zero cliques para o caso comum.** Abrir a tela deve mostrar "meu
   desempenho acumulado até agora" sem exigir nenhuma decisão do usuário.
2. **Não mostrar controles que não se aplicam.** Se uma opção não muda nada
   no resultado atual (ex.: escolher um mês quando a visão é "ano inteiro"),
   ela não deve aparecer — reduz a superfície de confusão (divulgação
   progressiva).
3. **Rótulo sempre visível perto do dado.** O usuário nunca deve precisar
   inferir o período pelos controles; um texto fixo ("Acumulado Jan–Jun/2026")
   deve estar ao lado de cada bloco de números.
4. **Um estado, um significado.** Nenhuma variável deve representar coisas
   diferentes dependendo do contexto. Se "mês" significa "fim do acumulado"
   no Ranking, ele não pode ser o mesmo estado que significa "mês que estou
   editando" em Lançamentos.
5. **Escopo local por padrão.** Um controle só deve ser global (compartilhado
   entre telas, persistido) quando faz sentido que a escolha "vaze" de uma
   tela para outra. Ano é um bom candidato a global (é natural que, ao trocar
   de ano no Lançamentos, o Ranking também mude de ano). Mês-como-fim-de-
   intervalo não é.

---

## 3. Opções avaliadas

### Opção A — dois toggles ortogonais + seletor de mês condicional (recomendada)

- **Toggle 1 — Visão:** `Ano` / `Mês` → o usuário quer um retrato do ano
  inteiro (até hoje) ou quer investigar um mês específico?
- **Toggle 2 — Cálculo** (só aparece quando Visão = `Mês`): `Acumulado` /
  `Período` → dentro do mês escolhido, quero a soma de Jan até ele, ou só o
  valor daquele mês isolado?
- **Seletor de mês** (só aparece quando Visão = `Mês`): local à página, não
  usa `useApp().month`.
- Quando Visão = `Ano`, o "Cálculo" não existe como pergunta — ano sempre
  implica acumulado (ver regra de fechamento no item 4) — então o segundo
  toggle nem é renderizado.

Isso são as "3 peças" que você descreveu: dois toggles + um seletor que só
aparece quando faz sentido.

**Prós:** resolve a causa raiz (mês deixa de ser global), cada controle só
aparece quando é uma pergunta real, o rótulo textual fica trivial de montar a
partir dos dois toggles. **Contras:** duas linhas de controle em vez de uma
quando está em modo "Mês" (mitigado — cabem lado a lado, ver seção 5).

### Opção B — um único seletor de 3 posições

`Ano até hoje` / `Acumulado até o mês` / `Só o mês` num único ToggleGroup de 3
itens, com o seletor de mês aparecendo apenas nas duas últimas posições.

**Prós:** um controle a menos na tela. **Contras:** mistura duas perguntas
independentes ("qual escopo" e "qual cálculo") num enum plano; se no futuro
alguém pedir, por exemplo, "acumulado do trimestre", a opção B exige inventar
um 4º item ad-hoc, enquanto a A já comporta isso como uma variação do Toggle
1. Também é menos didático: o nome de cada opção precisa carregar as duas
informações ao mesmo tempo.

### Opção C — manter os dois toggles sempre visíveis, desabilitando (não
escondendo) o seletor de mês quando Visão = Ano

**Prós:** layout não "pula" ao trocar de toggle. **Contras:** um controle
visível e desabilitado tende a gerar a pergunta "por que não consigo clicar
nisso?" — o oposto do princípio 2. Também não elimina de fato a poluição
visual que você apontou.

**Recomendação: Opção A.** É a que você descreveu, e é a que melhor separa as
duas perguntas ("qual escopo" / "qual cálculo") sem inventar estados
combinados nem deixar controle morto na tela.

---

## 4. Desenho da solução (Opção A em detalhe)

### Estados (todos locais a `Ranking.tsx`, não em `AppContext`)

```ts
const [viewScope, setViewScope] = useState<"ano" | "mes">("ano"); // default
const [calcMode, setCalcMode] = useState<"acumulado" | "periodo">("acumulado");
const [selectedMonth, setSelectedMonth] = useState<number>(() => todayMonth()); // seed, não vinculado ao contexto
```

`year` continua vindo de `useApp()` (global) — trocar de ano é uma operação
que faz sentido propagar entre telas, e não sofre do problema de significado
duplo que o mês tem aqui.

### Regra de derivação do parâmetro enviado ao backend

| Visão | Cálculo | `mode` enviado | mês-fim (`endMonth`) usado |
|---|---|---|---|
| Ano | (implícito: Acumulado) | `ytd` | mês atual real, se `year` = ano corrente; **12** (Dez), se `year` for um ano fechado/passado |
| Mês | Acumulado | `ytd` | `selectedMonth` |
| Mês | Período | `month` | `selectedMonth` |

Essa regra usa exatamente o backend que já existe hoje — `dashboard.snapshot`
já aceita `{ year, month, mode: "month" \| "ytd" }`
(`server/routers.ts:476-481`, `server/dashboardService.ts:60-198`, com a
agregação YTD em `aggregateYtdEntries`). **Não é necessária nenhuma mudança de
backend** para isso: o "mês-fim" continua sendo o parâmetro `month` de
sempre, só que agora calculado localmente por essa regra em vez de vir do
estado global.

> ⚠️ **Decisão que preciso que você confirme:** para "Visão = Ano" com um ano
> passado (ex.: 2025, estando em 2026), assumi que o correto é mostrar o
> acumulado **fechado** (Jan–Dez). Se preferir outro comportamento (ex.:
> sempre Jan–Dez independentemente do ano, ou deixar o usuário escolher até
> onde no passado também), é só avisar — a regra na tabela acima muda em uma
> linha.

### Layout

Barra de período do Ranking (substitui o toggle único atual, some da
`PageToolbar` global e passa a viver só dentro da própria página):

```
[ Ano ] [ Mês ]     (Toggle 1 — sempre visível)
        [ Acumulado ] [ Período ]   [ Março ▾ ]   (só quando "Mês" está ativo)
```

Como a `PageToolbar` (`client/src/components/shared.tsx:18-108`) hoje também
tem seu próprio seletor global de mês/ano, o Ranking passa a **sempre**
esconder o seletor de mês da toolbar (`hideMonth={true}` fixo, não mais
condicional a `mode`) — a página passa a ser dona exclusiva do seu controle
de mês, sem duplicar/confundir com o controle global. O seletor de **ano** da
toolbar continua visível normalmente (ele é global e correto assim).

### Rótulo (badge nos cards "Desempenho por área" / "Classificação completa"
e no subtítulo do cabeçalho)

| Caso | Texto |
|---|---|
| Ano, ano corrente | `Acumulado Jan–Jun/2026 (ano em andamento)` |
| Ano, ano fechado | `Acumulado Jan–Dez/2025` |
| Mês + Acumulado | `Acumulado Jan–Mar/2026` |
| Mês + Período | `Março/2026` |

### Exportação Excel

O botão Excel passa a enviar `mode` + `month` derivados pela mesma tabela da
seção 4 (não mais `context.month`), então o relatório baixado sempre
corresponde exatamente ao que está na tela — já era essa a intenção do ajuste
anterior, só que agora usando os valores corretos e desacoplados.

---

## 5. Plano de implementação

### Frontend (`client/src/pages/Ranking.tsx`)

1. Remover o `useState<"ytd" | "month">` atual e o `modeToggle` único.
2. Adicionar os três estados locais (`viewScope`, `calcMode`,
   `selectedMonth`), com `selectedMonth` semeado uma única vez a partir do mês
   real atual (`new Date().getMonth() + 1`) — **não** a partir de
   `useApp().month`, para não herdar o estado de outra tela.
3. Extrair a regra da tabela da seção 4 em uma função pura, por exemplo:
   ```ts
   function deriveRankingPeriod(
     viewScope: "ano" | "mes",
     calcMode: "acumulado" | "periodo",
     selectedMonth: number,
     year: number,
     currentRealYear: number,
     currentRealMonth: number,
   ): { mode: "month" | "ytd"; month: number }
   ```
   Função pura facilita revisão e permite testar isoladamente se algum dia o
   client ganhar suíte de testes (hoje só o server tem Vitest configurado —
   ver seção 6).
4. Montar os dois `ToggleGroup` (Visão, e Cálculo condicional) + `Select` de
   mês condicional, reaproveitando os componentes `ui/toggle-group.tsx` e
   `ui/select.tsx` já usados no projeto.
5. Trocar `hideMonth={mode === "ytd"}` por `hideMonth` fixo (`true`) nas duas
   chamadas de `PageToolbar`.
6. Recalcular `periodSubtitle`/`modeBadgeLabel` conforme a tabela de rótulos
   da seção 4.
7. Atualizar `handleExcel` (hoje em `client/src/components/shared.tsx`) para
   receber `month`/`mode` explícitos por parâmetro em vez de ler
   implicitamente do contexto — a chamada em `Ranking.tsx` passa os valores
   derivados; as demais páginas que usam `PageToolbar` continuam passando
   `year`/`month` do contexto como já fazem hoje (nenhuma mudança de
   comportamento fora do Ranking).

### Backend

Nenhuma mudança necessária — `mode`/`month` já cobrem todos os casos da
tabela. Só revalidar com os testes existentes (`server/accessControl.test.ts`,
já com casos de `mode: "ytd"`) que continuam passando.

### Itens de limpeza

- `PageToolbar` mantém a prop `hideMonth` (útil e já genérica), mas ela deixa
  de ser usada condicionalmente — só o `Ranking.tsx` a usa, sempre como
  `true`.
- Revisar se `exportMode` ainda faz sentido como prop separada ou se deve
  virar parte de um objeto único `{ mode, month }` passado pra
  `PageToolbar`, para não haver dois lugares calculando a mesma coisa.

---

## 6. Plano de testes / validação

**Automatizado:**
- A função `deriveRankingPeriod` (passo 3 acima) é pura e fácil de testar sem
  precisar montar componente React. Se topar, dá pra configurar Vitest no
  client (hoje só existe no `server/`) só para esse tipo de lógica, ou, mais
  simples, mover a função para um arquivo `.ts` sem JSX (ex.:
  `client/src/lib/rankingPeriod.ts`) e testá-la com um runner leve depois.
  Não é bloqueante para entregar a feature.
- Testes de backend já existentes (`accessControl.test.ts`) continuam
  cobrindo a agregação YTD em si; não precisam mudar.

**Manual (checklist para você validar no navegador, já que a tela é um
dashboard visual e o sandbox aqui não tem browser disponível):**

1. Abrir o Ranking pela primeira vez (localStorage limpo) → deve vir em
   "Ano", acumulado Jan–mês atual, **sem** seletor de mês visível.
2. Trocar de ano (seletor da toolbar) para um ano passado, com Visão = Ano →
   deve virar Jan–Dez daquele ano, sem seletor de mês.
3. Ir em Lançamentos, trocar o mês lá, voltar ao Ranking → o Ranking (em
   Visão = Ano) **não** deve mudar.
4. Trocar Visão para "Mês" → deve aparecer o toggle Acumulado/Período e o
   seletor de mês, começando no mês atual real.
5. Em "Mês" + "Acumulado", trocar o mês → total deve mudar coerentemente
   (soma Jan até o mês escolhido).
6. Em "Mês" + "Período" → total deve refletir só aquele mês isolado (igual
   ao comportamento antes desta feature existir).
7. Exportar Excel em cada uma das 4 combinações → nome do arquivo e conteúdo
   da planilha devem bater com o que está na tela.
8. Conferir que o rótulo (badge) nos dois cards muda corretamente nas 4
   combinações, seguindo a tabela da seção 4.

---

## 7. Resumo para decisão

- Causa raiz identificada: o Ranking reaproveita o estado global de "mês"
  (compartilhado com Lançamentos/Evolução/Export) para representar o fim de
  um intervalo de acumulação — os dois significados colidem.
- Solução proposta: dois toggles ortogonais (Visão: Ano/Mês; Cálculo:
  Acumulado/Período, só quando Visão = Mês) + seletor de mês local à página,
  substituindo o controle global só quando necessário.
- Não exige mudança de backend.
- Um ponto em aberto para sua confirmação: comportamento de "Ano" para anos
  passados (assumido Jan–Dez fechado).

Depois da sua validação deste documento (e da decisão do item em aberto),
implemento conforme o plano da seção 5.
