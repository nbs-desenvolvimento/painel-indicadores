export type ViewScope = "ano" | "mes";
export type CalcMode = "acumulado" | "periodo";

export interface RankingPeriod {
  mode: "month" | "ytd";
  /** Mês de referência: fim do intervalo acumulado, ou o próprio mês em "período". */
  month: number;
}

/**
 * Deriva o {mode, month} a enviar pro backend a partir dos controles da tela
 * de Ranking. "Ano" sempre implica acumulado: até o mês real atual quando o
 * ano selecionado é o corrente, ou Jan–Dez (ano fechado) caso contrário —
 * nesses casos o mês nunca é uma pergunta pro usuário.
 */
export function deriveRankingPeriod(
  viewScope: ViewScope,
  calcMode: CalcMode,
  selectedMonth: number,
  year: number,
  now: Date = new Date(),
): RankingPeriod {
  if (viewScope === "ano") {
    const isCurrentRealYear = year === now.getFullYear();
    const month = isCurrentRealYear ? now.getMonth() + 1 : 12;
    return { mode: "ytd", month };
  }
  return { mode: calcMode === "acumulado" ? "ytd" : "month", month: selectedMonth };
}
