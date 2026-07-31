# Dashboard por Indicadores — análise do gráfico "Evolução do Score (12 meses)"

## 1. Onde ele está e o que ele desenha hoje

`client/src/pages/DashboardIndicadores.tsx` (`SingleIndicatorView`, por volta
da linha 336) mostra, lado a lado:

- **"Evolução Meta × Resultado (12 meses)"** — duas linhas (`meta`,
  `resultado`) com os valores brutos lançados, na unidade do indicador
  (R$, %, número).
- **"Evolução do Score (12 meses)"** — uma linha (`score`), eixo fixo
  `[0, 120]`, cor única `#c9a227` (dourado), sem `ReferenceLine`, sem
  cor semântica por ponto:

```tsx
<LineChart data={histData} margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.008 90)" />
  <XAxis dataKey="label" fontSize={11} />
  <YAxis domain={[0, 120]} fontSize={11} tickFormatter={(v) => `${v}%`} />
  <Tooltip formatter={(v: number) => [`${v.toLocaleString("pt-BR")}%`, "Score"]} />
  <Line type="monotone" dataKey="score" stroke="#c9a227" strokeWidth={2.5} dot={{ r: 4 }} connectNulls />
</LineChart>
```

O `score` vem de `computeScore`/`computeScoreWithRule`
(`server/calcEngine.ts`), que transforma o atingimento (Resultado ÷ Meta, ou
o inverso para indicadores "menor é melhor") em um **degrau discreto**: para
os 5 `scaleType` legados, os valores possíveis são só `{0, 0.6, 0.8, 1.0,
1.2}` (ver `SCALE_TYPE_DESCRIPTIONS`); para um indicador com regra de
calibragem, os valores possíveis são o conjunto finito de `score` definido
nas faixas daquela regra (`calibration_rule_ranges`). Ou seja: **o eixo Y
deste gráfico não é contínuo — é uma escala nominal de poucos valores
fixos**, mesmo parecendo um eixo percentual contínuo de 0 a 120.

## 2. Diagnóstico — por que ele não comunica bem

### 2.1 É uma linha sobre dado quantizado (degraus), não sobre dado contínuo

Uma linha com `type="monotone"` (interpolação suave) **promete** ao leitor
que existe um valor intermediário significativo entre um ponto e o próximo.
Aqui isso é falso: o score só pode saltar entre um punhado de patamares.
Consequência prática, e observável nos próprios dados do seed:

- Um mês pode passar de **atingimento 96% → atingimento 84%** (queda real e
  grande) e o score ficar **igual** (ex.: `higher_better_120` mantém 60% dos
  84% até 85%) — a linha fica **achatada**, escondendo a piora.
- Um mês pode passar de **atingimento 94,9% → 95,1%** (variação irrelevante)
  e o score **saltar** de 60% para 100% — a linha faz um degrau vertical
  brusco, **exagerando** uma mudança mínima.

Isso é o oposto do que um gráfico de tendência deveria fazer: ele deveria
ampliar sinal, não invertê-lo.

### 2.2 É informação redundante com o gráfico vizinho, sem valor analítico extra

O score é uma **função determinística** de Meta e Resultado (já mostrados no
gráfico ao lado). Ele não traz um dado novo — traz o mesmo dado, comprimido
em 4–5 categorias, sem explicar **o quão perto** o indicador está de subir ou
cair de faixa. Um gestor olhando "Score: 60%" não sabe se está a 1 ponto
percentual de virar 100% ou a 20 pontos — a informação mais acionável
("quanto falta para a próxima faixa") existe nos dados (`goal`, `result`,
faixas da regra/`scaleType`) mas não chega ao gráfico.

### 2.3 Perde a linguagem visual que o resto do app já usa para score

Em todo o resto do sistema (`ScoreBadge`, `scoreColor`, os gráficos de barra
de `DashboardAreas`/`DashboardPerspectivas`/`DashboardObjetivos`), score é
sempre **codificado por cor semântica** (verde ≥120%, verde-claro ≥100%,
amarelo ≥80%, laranja ≥60%, vermelho <60% — `scoreColor` em
`AppContext.tsx`). Este gráfico é o único lugar do app onde o score aparece
em uma cor fixa (dourado), sem relação com bom/ruim — o usuário perde o
"semáforo" que já aprendeu a ler em todas as outras telas.

### 2.4 Falta a própria referência de 100%

Diferente dos gráficos de barra do app (`ReferenceLine x={100}` em
`DashboardObjetivos.tsx`/`DashboardPerspectivas.tsx`), este gráfico não
desenha nenhuma linha de referência na meta batida (100%). Isso é uma falha
pontual fácil de corrigir independente de qualquer redesenho maior.

## 3. Enquadramento pelo "job" do gráfico

Usando o critério de "qual é a pergunta que o leitor precisa responder":

| Pergunta real | Forma recomendada |
|---|---|
| "Este indicador está indo bem ou mal em cada mês?" (estado, não tendência fina) | Comparar magnitude discreta → **coluna/barra**, uma por mês, cor por faixa |
| "Estou perto de subir ou cair de faixa?" | Δ contra um alvo (100%) → **linha/atingimento vs. baseline**, com as faixas desenhadas como referência |

Uma linha suave contínua não está na lista — porque a pergunta não é
"tendência suave de uma métrica contínua", é "em que faixa estou, e quão perto
da próxima". Isso é literalmente o padrão "acima/abaixo de uma baseline, Δ
para o alvo", cuja forma indicada é diverging bar / linha vs. baseline — não
uma linha "monotone" solta num eixo 0–120 sem marcação nenhuma do alvo.

## 4. Opções de substituição (da mais simples à mais analítica)

### Opção A (recomendada como próximo passo) — Coluna colorida por faixa, 1 barra por mês

Trocar `LineChart` por `BarChart` vertical (12 barras, uma por mês),
`Cell` colorido via `scoreColor(score/100)` (mesmo padrão já usado nos
outros dashboards) + `ReferenceLine y={100}`.

- **Por quê é melhor:** barras não fingem interpolação — cada mês é um valor
  discreto independente, exatamente como o dado realmente é. A cor por faixa
  devolve o "semáforo" que o resto do app já usa, então o usuário lê o
  histórico em 1 segundo (verde/amarelo/vermelho) sem precisar ler os
  números.
- **Custo:** baixíssimo — mesmo `histData` já calculado, troca de
  `<Line>`/`<LineChart>` por `<Bar>`/`<BarChart>` + `<Cell>`, mesmo padrão já
  copiado 3× no projeto (`DashboardObjetivos.tsx`, `DashboardPerspectivas.tsx`,
  a própria `IndicatorGroupView` nova). Nenhum dado novo do backend.

### Opção B — Se quiser manter como linha (mudança mínima)

Três ajustes pontuais, sem trocar o tipo de gráfico:

1. `type="monotone"` → `type="stepAfter"` (Recharts) — a linha passa a
   desenhar o degrau real em vez de suavizar uma transição que não existe.
2. Adicionar `<ReferenceLine y={100} .../>` (mesmo padrão dos outros
   gráficos do app).
3. Colorir cada ponto (`dot`) por `scoreColor`, via um `dot` customizado, em
   vez de um `stroke` único dourado — mantém a leitura semântica mesmo em
   formato de linha.

- **Por quê:** honesto sobre a natureza do dado, reaproveita a familiaridade
  de "linha" ao lado do gráfico de Meta×Resultado, e é a menor mudança
  possível (3 props).
- **Limite:** ainda é uma forma menos natural que uma barra para dado
  categórico/quantizado — resolve o problema de honestidade, mas não o de
  "por que existe uma linha para 5 valores possíveis".

### Opção C (mais ambiciosa) — Fundir os dois gráficos em um só, de "Atingimento vs. Alvo"

Em vez de "Meta×Resultado" (valores brutos) + "Score" (categoria derivada),
um único gráfico com:

- Uma linha de **atingimento** (`resultado ÷ meta`, ou o inverso para
  `lower_better`) — um número contínuo, sem quantização, index-ado a 100% =
  meta batida. Isso resolve o problema de dual-axis (não dá pra sobrepor
  score % com valores em R$ na mesma escala) da forma correta indicada pela
  metodologia do projeto: **indexar a uma base comum (100 = meta) em um único
  eixo**, em vez de dois eixos.
- **Faixas de referência horizontais** desenhadas atrás da linha, uma por
  degrau do `scaleType` (`SCALE_TYPE_DESCRIPTIONS` já documenta os limiares
  exatos, ex. 85/95/105% para `higher_better_120`) ou das faixas da regra de
  calibragem (`calibration_rule_ranges.minAttainment/maxAttainment`), usando
  `ReferenceArea` do Recharts.
- Isso responde às duas perguntas de uma vez: "que faixa eu bati" (a cor da
  faixa onde a linha está) e "quão perto estou de mudar de faixa" (distância
  vertical até a próxima linha de referência) — a informação mais acionável,
  que hoje não existe em lugar nenhum do dashboard.

- **Custo:** moderado. Dado (`goal`, `result`) já existe; o que falta é
  expor os limiares por indicador ao client de forma pronta para desenhar —
  fácil para os 5 `scaleType` fixos (constante já existe, só formatar em
  números em vez de texto), mais trabalho para indicadores com regra de
  calibragem custom (buscar `calibrationRules.ranges` do indicador
  selecionado, já disponível via `trpc.calibrationRules.list`). Também exige
  cuidado de layout (12 pontos + várias `ReferenceArea` pode ficar poluído
  visualmente — vale revisar com a tela real antes de finalizar).
- **Quando faz sentido:** se o objetivo for aprofundar a análise por
  indicador além do que existe hoje. Se o objetivo é só corrigir a
  confusão atual com o menor risco, a Opção A já resolve.

## 5. Recomendação

1. **Curto prazo:** implementar a **Opção A** — substitui a linha por um
   gráfico de colunas coloridas por faixa (mesmo padrão visual já usado em
   3 outros dashboards do projeto), com `ReferenceLine y={100}`. Resolve os
   itens 2.1, 2.3 e 2.4 do diagnóstico com uma mudança pequena e sem risco.
2. **Médio prazo (opcional):** avaliar a **Opção C** como uma evolução —
   fundir os dois gráficos de hoje em um único "Atingimento vs. Alvo" com
   faixas de referência, se o objetivo for tornar o indicador individual
   mais analítico (não só mais legível).
3. **Não recomendado:** manter a linha atual como está (dourado fixo, sem
   referência de 100%, interpolação suave sobre dado quantizado) ou só
   trocar a cor sem resolver a quantização — resolveria só o item 2.3, não
   o problema de fundo.

Este documento é só a análise; nenhuma mudança de código foi feita. Se você
quiser seguir com a Opção A (ou C), eu escrevo um plano de implementação
separado ou já implemento direto, como preferir.
