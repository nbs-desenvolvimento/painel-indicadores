import {
  computeAreaScore,
  computeScore,
  computeScoreWithRule,
  type AreaScore,
  type CalibrationRuleDef,
  type IndicatorInput,
  type ScaleType,
} from "./calcEngine";
import * as db from "./db";

/** Monta o mapa ruleId → definição da regra de calibragem */
async function buildRuleMaps(companyId: number) {
  const rules = await db.listCalibrationRules(companyId);
  const nameMap = new Map<number, string>(rules.map((r) => [r.id, r.name]));
  const defMap = new Map<number, CalibrationRuleDef>(
    rules.map((r) => [
      r.id,
      {
        directConversion: r.directConversion,
        ranges: r.ranges.map((rg) => ({
          minAttainment: rg.minAttainment,
          minInclusive: rg.minInclusive,
          maxAttainment: rg.maxAttainment,
          maxInclusive: rg.maxInclusive,
          score: rg.score,
          sortOrder: rg.sortOrder,
        })),
      },
    ]),
  );
  return { defMap, nameMap };
}

/** Calcula o score do indicador: regra de calibragem quando vinculada, senão escala legada */
function scoreOf(
  ind: { scaleType: string; calibrationRuleId: number | null },
  ruleMap: Map<number, CalibrationRuleDef>,
  goal: number | null,
  result: number | null,
) {
  const rule = ind.calibrationRuleId ? ruleMap.get(ind.calibrationRuleId) : undefined;
  if (rule) return computeScoreWithRule(rule, goal, result);
  return computeScore(ind.scaleType as ScaleType, goal, result);
}

export interface PeriodRef {
  year: number;
  month: number;
}

/**
 * Monta o snapshot completo de desempenho de uma empresa em um período:
 * scores de todas as áreas, perspectivas e indicadores.
 */
export async function buildCompanySnapshot(companyId: number, year: number, month: number) {
  const [areasList, perspectivesList, indicatorsList, ruleMaps] = await Promise.all([
    db.listAreas(companyId),
    db.listPerspectives(companyId),
    db.listIndicators(companyId),
    buildRuleMaps(companyId),
  ]);
  const { defMap: ruleMap, nameMap: ruleNameMap } = ruleMaps;

  const activeAreas = areasList.filter((a) => a.active);
  const activePerspectives = perspectivesList.filter((p) => p.active);
  const activeIndicators = indicatorsList.filter((i) => i.active);
  const indicatorIds = activeIndicators.map((i) => i.id);

  const [weights, applicability, entries] = await Promise.all([
    db.listWeights(activeAreas.map((a) => a.id)),
    db.listApplicability(indicatorIds),
    db.listEntries(indicatorIds, year, month),
  ]);

  const entryMap = new Map(entries.map((e) => [e.indicatorId, e]));
  const weightMapByArea = new Map<number, Map<number, number>>();
  for (const w of weights) {
    if (!weightMapByArea.has(w.areaId)) weightMapByArea.set(w.areaId, new Map());
    weightMapByArea.get(w.areaId)!.set(w.perspectiveId, w.weight);
  }
  const applMap = new Map<string, boolean>();
  for (const a of applicability) {
    applMap.set(`${a.indicatorId}:${a.areaId}`, a.applicable);
  }

  const perspectiveIds = activePerspectives.map((p) => p.id);

  const areaScores: (AreaScore & { areaName: string })[] = activeAreas.map((area) => {
    const applicableInds: IndicatorInput[] = activeIndicators
      .filter((ind) => applMap.get(`${ind.id}:${area.id}`) === true)
      .map((ind) => {
        const entry = entryMap.get(ind.id);
        return {
          id: ind.id,
          perspectiveId: ind.perspectiveId,
          name: ind.name,
          scaleType: ind.scaleType as ScaleType,
          calibrationRule: ind.calibrationRuleId ? (ruleMap.get(ind.calibrationRuleId) ?? null) : null,
          goal: entry?.goal ?? null,
          result: entry?.result ?? null,
        };
      });
    const weightMap = weightMapByArea.get(area.id) ?? new Map<number, number>();
    const score = computeAreaScore(area.id, applicableInds, weightMap, perspectiveIds);
    return { ...score, areaName: area.name };
  });

  // Indicator-level detail (independent of area)
  const indicatorScores = activeIndicators.map((ind) => {
    const entry = entryMap.get(ind.id);
    return {
      indicatorId: ind.id,
      name: ind.name,
      perspectiveId: ind.perspectiveId,
      unit: ind.unit,
      scaleType: ind.scaleType as ScaleType,
      ruleName: ind.calibrationRuleId ? (ruleNameMap.get(ind.calibrationRuleId) ?? null) : null,
      goal: entry?.goal ?? null,
      result: entry?.result ?? null,
      score: scoreOf(ind, ruleMap, entry?.goal ?? null, entry?.result ?? null),
    };
  });

  return {
    year,
    month,
    areas: activeAreas,
    perspectives: activePerspectives,
    indicators: activeIndicators,
    areaScores,
    indicatorScores,
    weights,
    applicability,
    entries,
  };
}

/**
 * Série histórica: calcula o snapshot de vários períodos para gráficos de evolução.
 */
export async function buildHistory(companyId: number, periods: PeriodRef[]) {
  const [areasList, perspectivesList, indicatorsList, ruleMaps] = await Promise.all([
    db.listAreas(companyId),
    db.listPerspectives(companyId),
    db.listIndicators(companyId),
    buildRuleMaps(companyId),
  ]);
  const ruleMap = ruleMaps.defMap;
  const activeAreas = areasList.filter((a) => a.active);
  const activePerspectives = perspectivesList.filter((p) => p.active);
  const activeIndicators = indicatorsList.filter((i) => i.active);
  const indicatorIds = activeIndicators.map((i) => i.id);

  const [weights, applicability, allEntries] = await Promise.all([
    db.listWeights(activeAreas.map((a) => a.id)),
    db.listApplicability(indicatorIds),
    db.listEntries(indicatorIds), // all periods
  ]);

  const weightMapByArea = new Map<number, Map<number, number>>();
  for (const w of weights) {
    if (!weightMapByArea.has(w.areaId)) weightMapByArea.set(w.areaId, new Map());
    weightMapByArea.get(w.areaId)!.set(w.perspectiveId, w.weight);
  }
  const applMap = new Map<string, boolean>();
  for (const a of applicability) {
    applMap.set(`${a.indicatorId}:${a.areaId}`, a.applicable);
  }
  const perspectiveIds = activePerspectives.map((p) => p.id);

  const result = periods.map(({ year, month }) => {
    const entryMap = new Map(
      allEntries.filter((e) => e.year === year && e.month === month).map((e) => [e.indicatorId, e]),
    );

    const areaScores = activeAreas.map((area) => {
      const applicableInds: IndicatorInput[] = activeIndicators
        .filter((ind) => applMap.get(`${ind.id}:${area.id}`) === true)
        .map((ind) => {
          const entry = entryMap.get(ind.id);
          return {
            id: ind.id,
            perspectiveId: ind.perspectiveId,
            name: ind.name,
            scaleType: ind.scaleType as ScaleType,
            calibrationRule: ind.calibrationRuleId ? (ruleMap.get(ind.calibrationRuleId) ?? null) : null,
            goal: entry?.goal ?? null,
            result: entry?.result ?? null,
          };
        });
      const weightMap = weightMapByArea.get(area.id) ?? new Map<number, number>();
      const score = computeAreaScore(area.id, applicableInds, weightMap, perspectiveIds);
      return { areaId: area.id, areaName: area.name, total: score.total, perspectives: score.perspectives };
    });

    const indicatorScores = activeIndicators.map((ind) => {
      const entry = entryMap.get(ind.id);
      return {
        indicatorId: ind.id,
        name: ind.name,
        perspectiveId: ind.perspectiveId,
        goal: entry?.goal ?? null,
        result: entry?.result ?? null,
        score: scoreOf(ind, ruleMap, entry?.goal ?? null, entry?.result ?? null),
      };
    });

    return { year, month, areaScores, indicatorScores };
  });

  return {
    periods: result,
    areas: activeAreas,
    perspectives: activePerspectives,
    indicators: activeIndicators,
  };
}
