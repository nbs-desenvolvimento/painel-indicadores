import { MONTH_NAMES, MONTH_NAMES_SHORT } from "@/contexts/AppContext";

export type ViewScope = "ano" | "mes";
export type CalcMode = "acumulado" | "periodo";

export interface DerivedPeriod {
  mode: "month" | "ytd";
  month: number;
}

/**
 * Deriva o {mode, month} a enviar pro backend a partir dos controles de período
 * (Ano / Mês / Acumulado / Período). "Ano" sempre implica acumulado: até o mês
 * real atual quando o ano selecionado é o corrente, ou Jan–Dez (ano fechado)
 * caso contrário — nesses casos o mês nunca é uma pergunta pro usuário.
 */
export function derivePeriod(
  viewScope: ViewScope,
  calcMode: CalcMode,
  selectedMonth: number,
  year: number,
  now: Date = new Date(),
): DerivedPeriod {
  if (viewScope === "ano") {
    const isCurrentRealYear = year === now.getFullYear();
    const month = isCurrentRealYear ? now.getMonth() + 1 : 12;
    return { mode: "ytd", month };
  }
  return { mode: calcMode === "acumulado" ? "ytd" : "month", month: selectedMonth };
}

/** Texto curto tipo "Acumulado Jan–Jun/2026" / "Jun/2026" — usado em badges. */
export function formatPeriodBadge(
  viewScope: ViewScope,
  calcMode: CalcMode,
  month: number,
  year: number,
  now: Date = new Date(),
): string {
  if (viewScope === "ano") {
    const isCurrentRealYear = year === now.getFullYear();
    return isCurrentRealYear
      ? `Acumulado Jan–${MONTH_NAMES_SHORT[month - 1]}/${year}`
      : `Acumulado Jan–Dez/${year}`;
  }
  return calcMode === "acumulado"
    ? `Acumulado Jan–${MONTH_NAMES_SHORT[month - 1]}/${year}`
    : `${MONTH_NAMES_SHORT[month - 1]}/${year}`;
}

/** Texto longo tipo "Acumulado de Janeiro a Junho de 2026" — usado em subtítulos. */
export function formatPeriodSubtitle(
  viewScope: ViewScope,
  calcMode: CalcMode,
  month: number,
  year: number,
  now: Date = new Date(),
): string {
  if (viewScope === "ano") {
    const isCurrentRealYear = year === now.getFullYear();
    return isCurrentRealYear
      ? `Acumulado de Janeiro a ${MONTH_NAMES[month - 1]} de ${year} (ano em andamento)`
      : `Acumulado de Janeiro a Dezembro de ${year}`;
  }
  return calcMode === "acumulado"
    ? `Acumulado de Janeiro a ${MONTH_NAMES[month - 1]} de ${year}`
    : `${MONTH_NAMES[month - 1]} de ${year}`;
}
