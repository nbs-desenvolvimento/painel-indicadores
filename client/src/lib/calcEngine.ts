/**
 * Motor de cálculo — réplica exata da lógica da planilha GESTÃO DE INDICADORES.
 *
 * 1. Score do indicador: função degrau aplicada a META (M) e RESULTADO (R),
 *    conforme o tipo de escala configurado no indicador (5 tipos fixos).
 * 2. Desempenho da perspectiva por área: MÉDIA aritmética dos scores dos
 *    indicadores aplicáveis àquela área naquela perspectiva × PESO da
 *    perspectiva para a área.
 * 3. Desempenho total da área: SOMA dos valores ponderados das perspectivas.
 */

export const SCALE_TYPES = [
  "higher_better_120",
  "higher_better_100",
  "lower_better_100",
  "lower_better_120",
  "target_range",
] as const;

export type ScaleType = (typeof SCALE_TYPES)[number];

export const SCALE_TYPE_LABELS: Record<ScaleType, string> = {
  higher_better_120: "Maior-melhor 120%",
  higher_better_100: "Maior-melhor 100%",
  lower_better_100: "Menor-melhor 100%",
  lower_better_120: "Menor-melhor 120%",
  target_range: "Faixa-alvo",
};

export const SCALE_TYPE_DESCRIPTIONS: Record<ScaleType, string> = {
  higher_better_120:
    "R ≥ 105% da meta → 120% · R ≥ 95% → 100% · R ≥ 85% → 60% · abaixo → 0%",
  higher_better_100:
    "R ≥ meta → 100% · R ≥ 95% → 80% · R ≥ 85% → 60% · abaixo → 0%",
  lower_better_100:
    "R ≤ meta → 100% · R ≤ 102% → 80% · R ≤ 105% → 60% · acima → 0%",
  lower_better_120:
    "R > 110% da meta → 0% · R > 105% → 60% · R > 95% → 100% · R ≤ 95% → 120%",
  target_range:
    "R ≥ 110% → 0% · R ≥ 105% → 60% · R ≥ 95% → 100% · R ≥ 90% → 60% · abaixo → 0%",
};

/**
 * Calcula o score (0, 0.6, 0.8, 1.0 ou 1.2) de um indicador.
 * Réplica fiel das fórmulas IF da coluna H da planilha.
 * Retorna null quando meta ou resultado não estão lançados.
 */
export function computeScore(
  scaleType: ScaleType,
  goal: number | null | undefined,
  result: number | null | undefined,
): number | null {
  if (goal === null || goal === undefined || result === null || result === undefined) {
    return null;
  }
  const M = goal;
  const R = result;
  // Tolerância para erros de ponto flutuante nas comparações de degraus,
  // garantindo comportamento idêntico ao Excel (ex.: 1.1*100 = 110.00000000000001 em IEEE754)
  const EPS = 1e-9;
  const gte = (a: number, b: number) => a >= b - EPS * Math.max(1, Math.abs(b));
  const lte = (a: number, b: number) => a <= b + EPS * Math.max(1, Math.abs(b));
  const gt = (a: number, b: number) => a > b + EPS * Math.max(1, Math.abs(b));

  switch (scaleType) {
    case "higher_better_120":
      // =IF(R>=1.05*M,120%,IF(R>=0.95*M,100%,IF(R>=0.85*M,60%,IF(R<0.85*M,0%))))
      if (gte(R, 1.05 * M)) return 1.2;
      if (gte(R, 0.95 * M)) return 1.0;
      if (gte(R, 0.85 * M)) return 0.6;
      return 0;

    case "higher_better_100":
      // =IF(R>=M,100%,IF(R>=0.95*M,80%,IF(R>=0.85*M,60%,IF(R<0.85*M,0%))))
      if (gte(R, M)) return 1.0;
      if (gte(R, 0.95 * M)) return 0.8;
      if (gte(R, 0.85 * M)) return 0.6;
      return 0;

    case "lower_better_100":
      // =IF(R<=M,100%,IF(R<=1.02*M,80%,IF(R<=1.05*M,60%,IF(R>1.05*M,0%))))
      if (lte(R, M)) return 1.0;
      if (lte(R, 1.02 * M)) return 0.8;
      if (lte(R, 1.05 * M)) return 0.6;
      return 0;

    case "lower_better_120":
      // =IF(R>1.1*M,0%,IF(R>1.05*M,60%,IF(R>0.95*M,100%,IF(R<=0.95*M,120%))))
      if (gt(R, 1.1 * M)) return 0;
      if (gt(R, 1.05 * M)) return 0.6;
      if (gt(R, 0.95 * M)) return 1.0;
      return 1.2;

    case "target_range":
      // =IF(R>=1.1*M,0%,IF(R>=1.05*M,60%,IF(R>=0.95*M,100%,IF(R>=0.9*M,60%,IF(R<0.9*M,0%)))))
      if (gte(R, 1.1 * M)) return 0;
      if (gte(R, 1.05 * M)) return 0.6;
      if (gte(R, 0.95 * M)) return 1.0;
      if (gte(R, 0.9 * M)) return 0.6;
      return 0;
  }
}

/* ------------------------- Sentido do indicador ---------------------------- */

export const DIRECTIONS = ["higher_better", "lower_better"] as const;

export type Direction = (typeof DIRECTIONS)[number];

export const DIRECTION_LABELS: Record<Direction, string> = {
  higher_better: "Aumentar é positivo",
  lower_better: "Reduzir é positivo",
};

/* ------------------ Tipo de acumulação (visão Acumulado/YTD) -------------- */

export const ACCUMULATION_TYPES = ["mensal", "anual"] as const;

export type AccumulationType = (typeof ACCUMULATION_TYPES)[number];

export const ACCUMULATION_TYPE_LABELS: Record<AccumulationType, string> = {
  mensal: "Mensal (soma no acumulado)",
  anual: "Anual (média no acumulado)",
};

export const ACCUMULATION_TYPE_HELP =
  "Mensal: cada mês é uma fatia de um total (ex.: vendas do mês) — a visão Acumulado soma os meses. " +
  "Anual: o valor mensal é recorrente/ajustável (ex.: nota, taxa) — a visão Acumulado mostra a média dos meses lançados.";

/* ------------------- Regras de calibragem configuráveis ------------------- */

export interface CalibrationRange {
  /** Limite inferior do atingimento em fração (ex.: 0.95). Null = sem limite inferior */
  minAttainment: number | null;
  minInclusive: boolean;
  /** Limite superior do atingimento em fração (ex.: 1.05). Null = sem limite superior */
  maxAttainment: number | null;
  maxInclusive: boolean;
  /** Score da faixa em fração (ex.: 1.2 = 120%) */
  score: number;
  sortOrder?: number;
}

export interface CalibrationRuleDef {
  directConversion: boolean;
  ranges: CalibrationRange[];
}

/**
 * Calcula o score de um indicador usando uma regra de calibragem configurável.
 * O atingimento é A = resultado / meta quando direction = "higher_better" (padrão),
 * ou A = meta / resultado quando direction = "lower_better" — a inversão faz com
 * que a mesma régua de faixas (pensada para "maior é melhor") sirva também para
 * indicadores cujo objetivo é reduzir o resultado. As faixas são avaliadas na
 * ordem (sortOrder) e a primeira que casar define o score. Com directConversion,
 * o score é o próprio atingimento (já invertido, se for o caso).
 * Usa a mesma tolerância de ponto flutuante do computeScore (compatível com Excel).
 * Retorna null quando meta ou resultado não estão lançados ou meta = 0.
 */
export function computeScoreWithRule(
  rule: CalibrationRuleDef,
  goal: number | null | undefined,
  result: number | null | undefined,
  direction: Direction = "higher_better",
): number | null {
  if (goal === null || goal === undefined || result === null || result === undefined) {
    return null;
  }
  if (goal === 0) return null;
  // direction = "lower_better": reduzir o resultado (bom) deve gerar atingimento
  // ALTO, e aumentar o resultado (ruim) deve gerar atingimento BAIXO — por isso
  // a razão é invertida (meta/resultado). Resultado = 0 gera Infinity, que casa
  // naturalmente com a faixa aberta mais alta da regra (a melhor faixa possível).
  const attainment = direction === "lower_better" ? goal / result : result / goal;
  if (rule.directConversion) return attainment;

  const EPS = 1e-9;
  const gte = (a: number, b: number) => a >= b - EPS * Math.max(1, Math.abs(b));
  const lte = (a: number, b: number) => a <= b + EPS * Math.max(1, Math.abs(b));
  const gt = (a: number, b: number) => a > b + EPS * Math.max(1, Math.abs(b));
  const lt = (a: number, b: number) => a < b - EPS * Math.max(1, Math.abs(b));

  const ordered = [...rule.ranges].sort((x, y) => (x.sortOrder ?? 0) - (y.sortOrder ?? 0));
  for (const r of ordered) {
    const minOk =
      r.minAttainment === null ||
      (r.minInclusive ? gte(attainment, r.minAttainment) : gt(attainment, r.minAttainment));
    const maxOk =
      r.maxAttainment === null ||
      (r.maxInclusive ? lte(attainment, r.maxAttainment) : lt(attainment, r.maxAttainment));
    if (minOk && maxOk) return r.score;
  }
  return 0;
}

export interface IndicatorInput {
  id: number;
  perspectiveId: number;
  name: string;
  scaleType: ScaleType;
  /** Regra de calibragem do indicador; quando presente, tem precedência sobre scaleType */
  calibrationRule?: CalibrationRuleDef | null;
  /** Sentido do indicador (aumentar ou reduzir é positivo); só usado com calibrationRule */
  direction?: Direction;
  goal: number | null;
  result: number | null;
}

export interface PerspectiveScore {
  perspectiveId: number;
  /** Média aritmética dos scores dos indicadores aplicáveis (null se nenhum score) */
  average: number | null;
  /** Peso da perspectiva para a área (0..1) */
  weight: number;
  /** average × weight (0 se average null) */
  weighted: number;
  /** Scores individuais dos indicadores aplicáveis */
  indicatorScores: { indicatorId: number; name: string; score: number | null }[];
}

export interface AreaScore {
  areaId: number;
  perspectives: PerspectiveScore[];
  /** Soma dos valores ponderados das perspectivas */
  total: number;
}

export interface ObjectiveScore {
  objectiveId: number;
  /** Média aritmética dos scores dos indicadores do objetivo (null se nenhum score) */
  average: number | null;
  /** Scores individuais dos indicadores do objetivo */
  indicatorScores: { indicatorId: number; name: string; score: number | null }[];
}

/**
 * Calcula o score de cada objetivo: MÉDIA aritmética simples dos scores dos
 * indicadores vinculados a ele (sem peso — objetivo não tem peso próprio no
 * modelo de dados, diferente de perspectiva × área). Indicadores cujo
 * `indicatorObjectiveMap` não mapeia para um dos `objectiveIds` (ex.: sem
 * objetivo vinculado) são ignorados.
 */
export function computeObjectiveScores(
  indicators: IndicatorInput[],
  objectiveIds: number[],
  indicatorObjectiveMap: Map<number, number | null>,
): ObjectiveScore[] {
  return objectiveIds.map((objectiveId) => {
    const inds = indicators.filter((i) => indicatorObjectiveMap.get(i.id) === objectiveId);
    const indicatorScores = inds.map((i) => ({
      indicatorId: i.id,
      name: i.name,
      score: i.calibrationRule
        ? computeScoreWithRule(i.calibrationRule, i.goal, i.result, i.direction)
        : computeScore(i.scaleType, i.goal, i.result),
    }));
    const valid = indicatorScores.filter((s) => s.score !== null) as {
      indicatorId: number;
      name: string;
      score: number;
    }[];
    const average =
      valid.length > 0 ? valid.reduce((acc, s) => acc + s.score, 0) / valid.length : null;
    return { objectiveId, average, indicatorScores };
  });
}

/**
 * Calcula o desempenho de uma área.
 * - indicators: todos os indicadores APLICÁVEIS à área com meta/resultado do período
 * - weights: mapa perspectiveId → peso (0..1)
 *
 * Réplica da planilha:
 *   K4 = AVERAGE(J3:J7) * K3   (média × peso, por perspectiva)
 *   I34 = K28 + K18 + K9 + K4  (soma das perspectivas)
 *
 * Observação: na planilha, AVERAGE ignora células vazias; indicadores sem
 * meta/resultado lançados (score null) são ignorados na média.
 */
export function computeAreaScore(
  areaId: number,
  indicators: IndicatorInput[],
  weights: Map<number, number>,
  perspectiveIds: number[],
): AreaScore {
  const perspectives: PerspectiveScore[] = perspectiveIds.map((pid) => {
    const inds = indicators.filter((i) => i.perspectiveId === pid);
    const indicatorScores = inds.map((i) => ({
      indicatorId: i.id,
      name: i.name,
      score: i.calibrationRule
        ? computeScoreWithRule(i.calibrationRule, i.goal, i.result, i.direction)
        : computeScore(i.scaleType, i.goal, i.result),
    }));
    const valid = indicatorScores.filter((s) => s.score !== null) as {
      indicatorId: number;
      name: string;
      score: number;
    }[];
    const average =
      valid.length > 0 ? valid.reduce((acc, s) => acc + s.score, 0) / valid.length : null;
    const weight = weights.get(pid) ?? 0;
    const weighted = average !== null ? average * weight : 0;
    return { perspectiveId: pid, average, weight, weighted, indicatorScores };
  });

  const total = perspectives.reduce((acc, p) => acc + p.weighted, 0);
  return { areaId, perspectives, total };
}
