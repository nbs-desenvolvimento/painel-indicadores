import {
  computeAreaScore,
  computeObjectiveScores,
  computeScore,
  computeScoreWithRule,
  type AreaScore,
  type CalibrationRuleDef,
  type Direction,
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
  ind: { scaleType: string; calibrationRuleId: number | null; direction: string },
  ruleMap: Map<number, CalibrationRuleDef>,
  goal: number | null,
  result: number | null,
) {
  const rule = ind.calibrationRuleId ? ruleMap.get(ind.calibrationRuleId) : undefined;
  if (rule) return computeScoreWithRule(rule, goal, result, ind.direction as Direction);
  return computeScore(ind.scaleType as ScaleType, goal, result);
}

export interface PeriodRef {
  year: number;
  month: number;
}

/** "month" = período único (comportamento tradicional). "ytd" = acumulado de janeiro até o mês informado. */
export type SnapshotMode = "month" | "ytd";

/**
 * Par meta/resultado agregado de um indicador em um período, com a
 * quantidade de meses que contribuíram para cada soma (goal e result podem
 * ter contagens diferentes — um mês pode ter só um dos dois preenchido).
 * A contagem é o que permite, depois, exibir a MÉDIA em vez da SOMA para
 * indicadores do tipo "anual" — ver `indicatorScores` em `buildCompanySnapshot`.
 */
interface AggregatedEntry {
  goal: number | null;
  result: number | null;
  goalCount: number;
  resultCount: number;
}

/**
 * Agrega meta/resultado de vários lançamentos mensais em um único par (soma).
 * Meses sem lançamento (ou com o campo vazio) são ignorados; se NENHUM mês do
 * intervalo tiver o campo preenchido, o agregado retorna null (sem dado),
 * mantendo a mesma semântica de "não lançado" usada no cálculo mensal.
 *
 * A soma aqui é a base do cálculo de score para QUALQUER tipo de indicador
 * (mensal ou anual) — o atingimento Σresultado/Σmeta é matematicamente igual
 * a média/média, então o score não muda entre os dois tipos. O que muda por
 * tipo é só a exibição de meta/resultado agregados (soma vs. média), feita a
 * partir de `goalCount`/`resultCount` em `buildCompanySnapshot`.
 */
function aggregateYtdEntries(
  entries: { indicatorId: number; goal: number | null; result: number | null }[],
): Map<number, AggregatedEntry> {
  const goalSums = new Map<number, number>();
  const resultSums = new Map<number, number>();
  const goalCounts = new Map<number, number>();
  const resultCounts = new Map<number, number>();
  for (const e of entries) {
    if (e.goal !== null && e.goal !== undefined) {
      goalSums.set(e.indicatorId, (goalSums.get(e.indicatorId) ?? 0) + e.goal);
      goalCounts.set(e.indicatorId, (goalCounts.get(e.indicatorId) ?? 0) + 1);
    }
    if (e.result !== null && e.result !== undefined) {
      resultSums.set(e.indicatorId, (resultSums.get(e.indicatorId) ?? 0) + e.result);
      resultCounts.set(e.indicatorId, (resultCounts.get(e.indicatorId) ?? 0) + 1);
    }
  }
  const ids = new Set(Array.from(goalSums.keys()).concat(Array.from(resultSums.keys())));
  const map = new Map<number, AggregatedEntry>();
  for (const id of Array.from(ids)) {
    map.set(id, {
      goal: goalSums.get(id) ?? null,
      result: resultSums.get(id) ?? null,
      goalCount: goalCounts.get(id) ?? 0,
      resultCount: resultCounts.get(id) ?? 0,
    });
  }
  return map;
}

/** Normaliza os lançamentos de um único mês para o mesmo formato agregado do YTD (count = 1 quando há valor). */
function toSingleEntryMap(
  entries: { indicatorId: number; goal: number | null; result: number | null }[],
): Map<number, AggregatedEntry> {
  return new Map(
    entries.map((e) => [
      e.indicatorId,
      {
        goal: e.goal,
        result: e.result,
        goalCount: e.goal !== null && e.goal !== undefined ? 1 : 0,
        resultCount: e.result !== null && e.result !== undefined ? 1 : 0,
      },
    ]),
  );
}

/**
 * Monta o snapshot completo de desempenho de uma empresa em um período:
 * scores de todas as áreas, perspectivas e indicadores.
 *
 * `allowedAreaIds`: null = sem restrição (admin). Array = usuário comum,
 * restringe áreas/indicadores/lançamentos ao que foi liberado para ele.
 * `mode`: "month" (padrão) usa meta/resultado do mês informado; "ytd" soma
 * meta e resultado de janeiro até o mês informado (acumulado do ano).
 */
export async function buildCompanySnapshot(
  companyId: number,
  year: number,
  month: number,
  allowedAreaIds: number[] | null = null,
  mode: SnapshotMode = "month",
) {
  const [areasList, perspectivesList, indicatorsList, objectivesList, ruleMaps] = await Promise.all([
    db.listAreas(companyId),
    db.listPerspectives(companyId),
    db.listIndicators(companyId),
    db.listObjectives(companyId),
    buildRuleMaps(companyId),
  ]);
  const { defMap: ruleMap, nameMap: ruleNameMap } = ruleMaps;

  let activeAreas = areasList.filter((a) => a.active);
  if (allowedAreaIds !== null) {
    const allowedSet = new Set(allowedAreaIds);
    activeAreas = activeAreas.filter((a) => allowedSet.has(a.id));
  }
  const activePerspectives = perspectivesList.filter((p) => p.active);
  const activeIndicators = indicatorsList.filter((i) => i.active);
  const indicatorIds = activeIndicators.map((i) => i.id);
  const activeObjectives = objectivesList.filter((o) => o.active);
  const objectiveIds = activeObjectives.map((o) => o.id);
  const indicatorObjectiveMap = new Map<number, number | null>(
    activeIndicators.map((ind) => [ind.id, ind.objectiveId]),
  );

  const [weights, applicability, rawEntries] = await Promise.all([
    db.listWeights(activeAreas.map((a) => a.id)),
    db.listApplicability(indicatorIds),
    mode === "ytd" ? db.listEntries(indicatorIds, year) : db.listEntries(indicatorIds, year, month),
  ]);

  // No modo ytd, listEntries(indicatorIds, year) traz o ano inteiro; restringe a jan..month.
  const entries = mode === "ytd" ? rawEntries.filter((e) => e.month <= month) : rawEntries;

  const entryMap: Map<number, AggregatedEntry> =
    mode === "ytd" ? aggregateYtdEntries(entries) : toSingleEntryMap(entries);
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

  const objectiveScoresByArea: { areaId: number; objectiveId: number; average: number | null }[] = [];

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
          direction: ind.direction as Direction,
          goal: entry?.goal ?? null,
          result: entry?.result ?? null,
        };
      });
    const weightMap = weightMapByArea.get(area.id) ?? new Map<number, number>();
    const score = computeAreaScore(area.id, applicableInds, weightMap, perspectiveIds);
    for (const os of computeObjectiveScores(applicableInds, objectiveIds, indicatorObjectiveMap)) {
      objectiveScoresByArea.push({ areaId: area.id, objectiveId: os.objectiveId, average: os.average });
    }
    return { ...score, areaName: area.name };
  });

  // Indicadores visíveis: aplicáveis a pelo menos uma área permitida (todos, se admin)
  const visibleIndicatorIds = new Set(
    allowedAreaIds === null
      ? indicatorIds
      : activeIndicators
          .filter((ind) => activeAreas.some((area) => applMap.get(`${ind.id}:${area.id}`) === true))
          .map((ind) => ind.id),
  );
  const visibleIndicators = activeIndicators.filter((ind) => visibleIndicatorIds.has(ind.id));

  // Indicator-level detail (independent of area). O score sempre usa a SOMA
  // agregada (entry.goal/entry.result) — é matematicamente igual à média,
  // então não há necessidade de recalcular por tipo. Já a META/RESULTADO
  // exibidos são a soma para indicadores "mensal" e a média para "anual",
  // dividindo pela quantidade de meses que de fato tiveram lançamento.
  const indicatorScores = visibleIndicators.map((ind) => {
    const entry = entryMap.get(ind.id);
    const useAverage = mode === "ytd" && ind.accumulationType === "anual";
    const displayGoal =
      useAverage && entry && entry.goal !== null && entry.goalCount > 0
        ? entry.goal / entry.goalCount
        : (entry?.goal ?? null);
    const displayResult =
      useAverage && entry && entry.result !== null && entry.resultCount > 0
        ? entry.result / entry.resultCount
        : (entry?.result ?? null);
    return {
      indicatorId: ind.id,
      name: ind.name,
      perspectiveId: ind.perspectiveId,
      unit: ind.unit,
      scaleType: ind.scaleType as ScaleType,
      ruleName: ind.calibrationRuleId ? (ruleNameMap.get(ind.calibrationRuleId) ?? null) : null,
      goal: displayGoal,
      result: displayResult,
      score: scoreOf(ind, ruleMap, entry?.goal ?? null, entry?.result ?? null),
    };
  });

  // Score do objetivo na empresa (sem quebra por área): média dos indicadores
  // visíveis do objetivo, independente de aplicabilidade por área.
  const visibleIndicatorInputs: IndicatorInput[] = visibleIndicators.map((ind) => {
    const entry = entryMap.get(ind.id);
    return {
      id: ind.id,
      perspectiveId: ind.perspectiveId,
      name: ind.name,
      scaleType: ind.scaleType as ScaleType,
      calibrationRule: ind.calibrationRuleId ? (ruleMap.get(ind.calibrationRuleId) ?? null) : null,
      direction: ind.direction as Direction,
      goal: entry?.goal ?? null,
      result: entry?.result ?? null,
    };
  });
  const objectiveScores = computeObjectiveScores(visibleIndicatorInputs, objectiveIds, indicatorObjectiveMap);
  const unassignedIndicatorCount = visibleIndicators.filter((ind) => ind.objectiveId === null).length;

  return {
    year,
    month,
    areas: activeAreas,
    perspectives: activePerspectives,
    indicators: visibleIndicators,
    objectives: activeObjectives,
    areaScores,
    indicatorScores,
    objectiveScores,
    objectiveScoresByArea,
    unassignedIndicatorCount,
    weights,
    applicability: applicability.filter((a) => visibleIndicatorIds.has(a.indicatorId)),
    entries: entries.filter((e) => visibleIndicatorIds.has(e.indicatorId)),
  };
}

/**
 * Série histórica: calcula o snapshot de vários períodos para gráficos de evolução.
 *
 * `allowedAreaIds`: null = sem restrição (admin). Array = usuário comum,
 * restringe áreas/indicadores ao que foi liberado para ele.
 */
export async function buildHistory(companyId: number, periods: PeriodRef[], allowedAreaIds: number[] | null = null) {
  const [areasList, perspectivesList, indicatorsList, objectivesList, ruleMaps] = await Promise.all([
    db.listAreas(companyId),
    db.listPerspectives(companyId),
    db.listIndicators(companyId),
    db.listObjectives(companyId),
    buildRuleMaps(companyId),
  ]);
  const ruleMap = ruleMaps.defMap;
  let activeAreas = areasList.filter((a) => a.active);
  if (allowedAreaIds !== null) {
    const allowedSet = new Set(allowedAreaIds);
    activeAreas = activeAreas.filter((a) => allowedSet.has(a.id));
  }
  const activePerspectives = perspectivesList.filter((p) => p.active);
  const activeIndicators = indicatorsList.filter((i) => i.active);
  const indicatorIds = activeIndicators.map((i) => i.id);
  const activeObjectives = objectivesList.filter((o) => o.active);
  const objectiveIds = activeObjectives.map((o) => o.id);
  const indicatorObjectiveMap = new Map<number, number | null>(
    activeIndicators.map((ind) => [ind.id, ind.objectiveId]),
  );

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

  // Indicadores visíveis: aplicáveis a pelo menos uma área permitida (todos, se admin)
  const visibleIndicatorIds = new Set(
    allowedAreaIds === null
      ? indicatorIds
      : activeIndicators
          .filter((ind) => activeAreas.some((area) => applMap.get(`${ind.id}:${area.id}`) === true))
          .map((ind) => ind.id),
  );
  const visibleIndicators = activeIndicators.filter((ind) => visibleIndicatorIds.has(ind.id));

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
            direction: ind.direction as Direction,
            goal: entry?.goal ?? null,
            result: entry?.result ?? null,
          };
        });
      const weightMap = weightMapByArea.get(area.id) ?? new Map<number, number>();
      const score = computeAreaScore(area.id, applicableInds, weightMap, perspectiveIds);
      return { areaId: area.id, areaName: area.name, total: score.total, perspectives: score.perspectives };
    });

    const indicatorScores = visibleIndicators.map((ind) => {
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

    const visibleIndicatorInputs: IndicatorInput[] = visibleIndicators.map((ind) => {
      const entry = entryMap.get(ind.id);
      return {
        id: ind.id,
        perspectiveId: ind.perspectiveId,
        name: ind.name,
        scaleType: ind.scaleType as ScaleType,
        calibrationRule: ind.calibrationRuleId ? (ruleMap.get(ind.calibrationRuleId) ?? null) : null,
        direction: ind.direction as Direction,
        goal: entry?.goal ?? null,
        result: entry?.result ?? null,
      };
    });
    const objectiveScores = computeObjectiveScores(visibleIndicatorInputs, objectiveIds, indicatorObjectiveMap).map(
      (os) => ({ objectiveId: os.objectiveId, average: os.average }),
    );

    return { year, month, areaScores, indicatorScores, objectiveScores };
  });

  return {
    periods: result,
    areas: activeAreas,
    perspectives: activePerspectives,
    indicators: visibleIndicators,
    objectives: activeObjectives,
  };
}
