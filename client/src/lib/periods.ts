/** Monta os últimos 12 períodos (ano/mês) terminando no período informado, em ordem crescente. */
export function buildLast12Periods(year: number, month: number) {
  const periods: { year: number; month: number }[] = [];
  let y = year;
  let m = month;
  for (let i = 0; i < 12; i++) {
    periods.unshift({ year: y, month: m });
    m--;
    if (m === 0) {
      m = 12;
      y--;
    }
  }
  return periods;
}
