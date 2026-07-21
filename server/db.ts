import { and, asc, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  areaPerspectiveWeights,
  areas,
  calibrationRuleRanges,
  calibrationRules,
  companies,
  importLogs,
  indicatorAreaApplicability,
  indicatorEntries,
  indicators,
  InsertUser,
  objectives,
  perspectives,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

function requireDb<T>(db: T | null): T {
  if (!db) throw new Error("Database not available");
  return db;
}

/* ------------------------------- Users ------------------------------- */
export async function listUsers() {
  const db = requireDb(await getDb());
  return db.select().from(users).orderBy(asc(users.name));
}

export async function updateUserRole(userId: number, role: "user" | "admin") {
  const db = requireDb(await getDb());
  await db.update(users).set({ role }).where(eq(users.id, userId));
}

/* ------------------------------ Companies ---------------------------- */
export async function listCompanies() {
  const db = requireDb(await getDb());
  return db.select().from(companies).orderBy(asc(companies.name));
}

export async function createCompany(data: { name: string; cnpj?: string | null }) {
  const db = requireDb(await getDb());
  const [res] = await db.insert(companies).values(data);
  return res.insertId;
}

export async function updateCompany(id: number, data: Partial<{ name: string; cnpj: string | null; active: boolean }>) {
  const db = requireDb(await getDb());
  await db.update(companies).set(data).where(eq(companies.id, id));
}

export async function deleteCompany(id: number) {
  const db = requireDb(await getDb());
  // Cascade: remove all dependent records to avoid orphans
  const companyAreas = await db.select({ id: areas.id }).from(areas).where(eq(areas.companyId, id));
  const areaIds = companyAreas.map((a) => a.id);
  const companyInds = await db.select({ id: indicators.id }).from(indicators).where(eq(indicators.companyId, id));
  const indIds = companyInds.map((i) => i.id);
  if (areaIds.length > 0) {
    await db.delete(areaPerspectiveWeights).where(inArray(areaPerspectiveWeights.areaId, areaIds));
    await db.delete(indicatorAreaApplicability).where(inArray(indicatorAreaApplicability.areaId, areaIds));
  }
  if (indIds.length > 0) {
    await db.delete(indicatorAreaApplicability).where(inArray(indicatorAreaApplicability.indicatorId, indIds));
    await db.delete(indicatorEntries).where(inArray(indicatorEntries.indicatorId, indIds));
  }
  const companyRules = await db
    .select({ id: calibrationRules.id })
    .from(calibrationRules)
    .where(eq(calibrationRules.companyId, id));
  const ruleIds = companyRules.map((r) => r.id);
  if (ruleIds.length > 0) {
    await db.delete(calibrationRuleRanges).where(inArray(calibrationRuleRanges.ruleId, ruleIds));
  }
  await db.delete(calibrationRules).where(eq(calibrationRules.companyId, id));
  await db.delete(objectives).where(eq(objectives.companyId, id));
  await db.delete(indicators).where(eq(indicators.companyId, id));
  await db.delete(areas).where(eq(areas.companyId, id));
  await db.delete(perspectives).where(eq(perspectives.companyId, id));
  await db.delete(importLogs).where(eq(importLogs.companyId, id));
  await db.delete(companies).where(eq(companies.id, id));
}

/* -------------------------------- Areas ------------------------------ */
export async function listAreas(companyId?: number) {
  const db = requireDb(await getDb());
  if (companyId) {
    return db.select().from(areas).where(eq(areas.companyId, companyId)).orderBy(asc(areas.sortOrder), asc(areas.id));
  }
  return db.select().from(areas).orderBy(asc(areas.sortOrder), asc(areas.id));
}

export async function createArea(data: { companyId: number; name: string; description?: string | null; parentAreaId?: number | null; sortOrder?: number }) {
  const db = requireDb(await getDb());
  if (data.parentAreaId !== undefined && data.parentAreaId !== null) {
    const [parent] = await db.select().from(areas).where(eq(areas.id, data.parentAreaId)).limit(1);
    if (!parent) throw new Error("Área-pai não encontrada");
    if (parent.companyId !== data.companyId) throw new Error("A área-pai deve pertencer à mesma empresa");
  }
  const [res] = await db.insert(areas).values(data);
  return res.insertId;
}

export async function updateArea(id: number, data: Partial<{ name: string; description: string | null; parentAreaId: number | null; sortOrder: number; active: boolean }>) {
  const db = requireDb(await getDb());
  if (data.parentAreaId !== undefined && data.parentAreaId !== null) {
    await assertValidParentArea(id, data.parentAreaId);
  }
  await db.update(areas).set(data).where(eq(areas.id, id));
}

/**
 * Garante que a área-pai é válida: mesma empresa e sem ciclos (diretos ou indiretos).
 */
export async function assertValidParentArea(areaId: number, parentAreaId: number) {
  const db = requireDb(await getDb());
  if (areaId === parentAreaId) throw new Error("Uma área não pode se subordinar a si mesma");
  const all = await db.select().from(areas);
  const byId = new Map(all.map((a) => [a.id, a]));
  const area = byId.get(areaId);
  const parent = byId.get(parentAreaId);
  if (!area || !parent) throw new Error("Área ou área-pai não encontrada");
  if (area.companyId !== parent.companyId) {
    throw new Error("A área-pai deve pertencer à mesma empresa");
  }
  // Sobe a cadeia a partir do novo pai; se encontrar a própria área, há ciclo
  let cursor: number | null = parentAreaId;
  const visited = new Set<number>();
  while (cursor !== null) {
    if (cursor === areaId) throw new Error("Subordinação inválida: criaria um ciclo na hierarquia");
    if (visited.has(cursor)) break;
    visited.add(cursor);
    cursor = byId.get(cursor)?.parentAreaId ?? null;
  }
}

export async function deleteArea(id: number) {
  const db = requireDb(await getDb());
  await db.delete(areaPerspectiveWeights).where(eq(areaPerspectiveWeights.areaId, id));
  await db.delete(indicatorAreaApplicability).where(eq(indicatorAreaApplicability.areaId, id));
  await db.delete(areas).where(eq(areas.id, id));
}

/* ---------------------------- Perspectives --------------------------- */

export async function listPerspectives(companyId?: number) {
  const db = requireDb(await getDb());
  if (companyId) {
    return db
      .select()
      .from(perspectives)
      .where(eq(perspectives.companyId, companyId))
      .orderBy(asc(perspectives.sortOrder), asc(perspectives.id));
  }
  return db.select().from(perspectives).orderBy(asc(perspectives.sortOrder), asc(perspectives.id));
}

export async function createPerspective(data: {
  companyId: number;
  name: string;
  description?: string | null;
  color?: string;
  sortOrder?: number;
}) {
  const db = requireDb(await getDb());
  const [res] = await db.insert(perspectives).values(data);
  return res.insertId;
}

export async function updatePerspective(
  id: number,
  data: Partial<{ name: string; description: string | null; color: string; sortOrder: number; active: boolean }>,
) {
  const db = requireDb(await getDb());
  await db.update(perspectives).set(data).where(eq(perspectives.id, id));
}

export async function deletePerspective(id: number) {
  const db = requireDb(await getDb());
  // Cascade: remove indicators belonging to this perspective and their dependents
  const perspInds = await db
    .select({ id: indicators.id })
    .from(indicators)
    .where(eq(indicators.perspectiveId, id));
  const indIds = perspInds.map((i) => i.id);
  if (indIds.length > 0) {
    await db.delete(indicatorAreaApplicability).where(inArray(indicatorAreaApplicability.indicatorId, indIds));
    await db.delete(indicatorEntries).where(inArray(indicatorEntries.indicatorId, indIds));
    await db.delete(indicators).where(inArray(indicators.id, indIds));
  }
  await db.delete(areaPerspectiveWeights).where(eq(areaPerspectiveWeights.perspectiveId, id));
  await db.delete(perspectives).where(eq(perspectives.id, id));
}

/* ----------------------------- Indicators ---------------------------- */
export async function listIndicators(companyId?: number) {
  const db = requireDb(await getDb());
  if (companyId) {
    return db
      .select()
      .from(indicators)
      .where(eq(indicators.companyId, companyId))
      .orderBy(asc(indicators.sortOrder), asc(indicators.id));
  }
  return db.select().from(indicators).orderBy(asc(indicators.sortOrder), asc(indicators.id));
}

export async function createIndicator(data: {
  companyId: number;
  perspectiveId: number;
  name: string;
  description?: string | null;
  unit?: string;
  scaleType: "higher_better_120" | "higher_better_100" | "lower_better_100" | "lower_better_120" | "target_range";
  objectiveId?: number | null;
  calibrationRuleId?: number | null;
  defaultGoal?: number | null;
  sortOrder?: number;
}) {
  const db = requireDb(await getDb());
  const [res] = await db.insert(indicators).values(data);
  return res.insertId;
}

export async function updateIndicator(
  id: number,
  data: Partial<{
    perspectiveId: number;
    name: string;
    description: string | null;
    unit: string;
    scaleType: "higher_better_120" | "higher_better_100" | "lower_better_100" | "lower_better_120" | "target_range";
    objectiveId: number | null;
    calibrationRuleId: number | null;
    defaultGoal: number | null;
    sortOrder: number;
    active: boolean;
  }>,
) {
  const db = requireDb(await getDb());
  await db.update(indicators).set(data).where(eq(indicators.id, id));
}

export async function deleteIndicator(id: number) {
  const db = requireDb(await getDb());
  await db.delete(indicatorAreaApplicability).where(eq(indicatorAreaApplicability.indicatorId, id));
  await db.delete(indicatorEntries).where(eq(indicatorEntries.indicatorId, id));
  await db.delete(indicators).where(eq(indicators.id, id));
}

/* ------------------------------ Objectives --------------------------- */
export async function listObjectives(companyId?: number) {
  const db = requireDb(await getDb());
  if (companyId) {
    return db
      .select()
      .from(objectives)
      .where(eq(objectives.companyId, companyId))
      .orderBy(asc(objectives.sortOrder), asc(objectives.id));
  }
  return db.select().from(objectives).orderBy(asc(objectives.sortOrder), asc(objectives.id));
}

export async function createObjective(data: {
  companyId: number;
  perspectiveId: number;
  name: string;
  description?: string | null;
  sortOrder?: number;
}) {
  const db = requireDb(await getDb());
  const [res] = await db.insert(objectives).values(data);
  return res.insertId;
}

export async function updateObjective(
  id: number,
  data: Partial<{
    perspectiveId: number;
    name: string;
    description: string | null;
    sortOrder: number;
    active: boolean;
  }>,
) {
  const db = requireDb(await getDb());
  await db.update(objectives).set(data).where(eq(objectives.id, id));
}

export async function deleteObjective(id: number) {
  const db = requireDb(await getDb());
  // Desvincula os indicadores deste objetivo (não exclui os indicadores)
  await db.update(indicators).set({ objectiveId: null }).where(eq(indicators.objectiveId, id));
  await db.delete(objectives).where(eq(objectives.id, id));
}

/* -------------------------- Calibration rules ------------------------ */
export async function listCalibrationRules(companyId?: number) {
  const db = requireDb(await getDb());
  const rules = companyId
    ? await db
        .select()
        .from(calibrationRules)
        .where(eq(calibrationRules.companyId, companyId))
        .orderBy(asc(calibrationRules.sortOrder), asc(calibrationRules.id))
    : await db.select().from(calibrationRules).orderBy(asc(calibrationRules.sortOrder), asc(calibrationRules.id));
  const ruleIds = rules.map((r) => r.id);
  const ranges =
    ruleIds.length > 0
      ? await db
          .select()
          .from(calibrationRuleRanges)
          .where(inArray(calibrationRuleRanges.ruleId, ruleIds))
          .orderBy(asc(calibrationRuleRanges.sortOrder), asc(calibrationRuleRanges.id))
      : [];
  return rules.map((r) => ({ ...r, ranges: ranges.filter((rg) => rg.ruleId === r.id) }));
}

export interface CalibrationRangeInput {
  minAttainment: number | null;
  minInclusive: boolean;
  maxAttainment: number | null;
  maxInclusive: boolean;
  score: number;
  sortOrder: number;
}

export async function createCalibrationRule(data: {
  companyId: number;
  name: string;
  description?: string | null;
  directConversion: boolean;
  sortOrder?: number;
  ranges: CalibrationRangeInput[];
}) {
  const db = requireDb(await getDb());
  const { ranges, ...rule } = data;
  const [res] = await db.insert(calibrationRules).values(rule);
  const ruleId = res.insertId;
  if (!rule.directConversion && ranges.length > 0) {
    await db.insert(calibrationRuleRanges).values(ranges.map((r) => ({ ...r, ruleId })));
  }
  return ruleId;
}

export async function updateCalibrationRule(
  id: number,
  data: {
    name?: string;
    description?: string | null;
    directConversion?: boolean;
    sortOrder?: number;
    active?: boolean;
    ranges?: CalibrationRangeInput[];
  },
) {
  const db = requireDb(await getDb());
  const { ranges, ...rule } = data;
  if (Object.keys(rule).length > 0) {
    await db.update(calibrationRules).set(rule).where(eq(calibrationRules.id, id));
  }
  if (ranges !== undefined) {
    // Recria as faixas por completo
    await db.delete(calibrationRuleRanges).where(eq(calibrationRuleRanges.ruleId, id));
    if (ranges.length > 0) {
      await db.insert(calibrationRuleRanges).values(ranges.map((r) => ({ ...r, ruleId: id })));
    }
  }
}

export async function deleteCalibrationRule(id: number) {
  const db = requireDb(await getDb());
  // Desvincula os indicadores desta regra (voltam ao scaleType legado)
  await db.update(indicators).set({ calibrationRuleId: null }).where(eq(indicators.calibrationRuleId, id));
  await db.delete(calibrationRuleRanges).where(eq(calibrationRuleRanges.ruleId, id));
  await db.delete(calibrationRules).where(eq(calibrationRules.id, id));
}

/* ------------------------------- Weights ----------------------------- */
export async function listWeights(areaIds: number[]) {
  const db = requireDb(await getDb());
  if (areaIds.length === 0) return [];
  return db.select().from(areaPerspectiveWeights).where(inArray(areaPerspectiveWeights.areaId, areaIds));
}

export async function setWeight(areaId: number, perspectiveId: number, weight: number) {
  const db = requireDb(await getDb());
  await db
    .insert(areaPerspectiveWeights)
    .values({ areaId, perspectiveId, weight })
    .onDuplicateKeyUpdate({ set: { weight } });
}

/* --------------------------- Applicability --------------------------- */
export async function listApplicability(indicatorIds: number[]) {
  const db = requireDb(await getDb());
  if (indicatorIds.length === 0) return [];
  return db
    .select()
    .from(indicatorAreaApplicability)
    .where(inArray(indicatorAreaApplicability.indicatorId, indicatorIds));
}

export async function setApplicability(indicatorId: number, areaId: number, applicable: boolean) {
  const db = requireDb(await getDb());
  await db
    .insert(indicatorAreaApplicability)
    .values({ indicatorId, areaId, applicable })
    .onDuplicateKeyUpdate({ set: { applicable } });
}

/**
 * Define em lote as áreas vinculadas a um indicador: marca applicable=true
 * para as áreas informadas e applicable=false para as demais áreas já registradas.
 */
export async function setApplicabilityForIndicator(indicatorId: number, areaIds: number[]) {
  const db = requireDb(await getDb());
  // Desmarca todas as vinculações existentes deste indicador
  await db
    .update(indicatorAreaApplicability)
    .set({ applicable: false })
    .where(eq(indicatorAreaApplicability.indicatorId, indicatorId));
  // Marca as áreas selecionadas (upsert)
  if (areaIds.length > 0) {
    await db
      .insert(indicatorAreaApplicability)
      .values(areaIds.map((areaId) => ({ indicatorId, areaId, applicable: true })))
      .onDuplicateKeyUpdate({ set: { applicable: true } });
  }
}

/* ------------------------------- Entries ----------------------------- */
export async function listEntries(indicatorIds: number[], year?: number, month?: number) {
  const db = requireDb(await getDb());
  if (indicatorIds.length === 0) return [];
  const conditions = [inArray(indicatorEntries.indicatorId, indicatorIds)];
  if (year !== undefined) conditions.push(eq(indicatorEntries.year, year));
  if (month !== undefined) conditions.push(eq(indicatorEntries.month, month));
  return db
    .select()
    .from(indicatorEntries)
    .where(and(...conditions));
}

export async function upsertEntry(data: {
  indicatorId: number;
  year: number;
  month: number;
  goal?: number | null;
  result?: number | null;
  source?: "manual" | "import";
  updatedBy?: number;
}) {
  const db = requireDb(await getDb());
  const updateSet: Record<string, unknown> = {};
  if (data.goal !== undefined) updateSet.goal = data.goal;
  if (data.result !== undefined) updateSet.result = data.result;
  if (data.source !== undefined) updateSet.source = data.source;
  if (data.updatedBy !== undefined) updateSet.updatedBy = data.updatedBy;
  await db
    .insert(indicatorEntries)
    .values({
      indicatorId: data.indicatorId,
      year: data.year,
      month: data.month,
      goal: data.goal ?? null,
      result: data.result ?? null,
      source: data.source ?? "manual",
      updatedBy: data.updatedBy,
    })
    .onDuplicateKeyUpdate({ set: updateSet });
}

export async function deleteEntry(indicatorId: number, year: number, month: number) {
  const db = requireDb(await getDb());
  await db
    .delete(indicatorEntries)
    .where(
      and(
        eq(indicatorEntries.indicatorId, indicatorId),
        eq(indicatorEntries.year, year),
        eq(indicatorEntries.month, month),
      ),
    );
}

/* ----------------------------- Import logs --------------------------- */
export async function createImportLog(data: {
  companyId: number;
  year: number;
  month: number;
  fileName?: string;
  totalRows: number;
  matchedRows: number;
  unmatchedRows?: string;
  importedBy?: number;
}) {
  const db = requireDb(await getDb());
  const [res] = await db.insert(importLogs).values(data);
  return res.insertId;
}

export async function listImportLogs(companyId: number) {
  const db = requireDb(await getDb());
  return db.select().from(importLogs).where(eq(importLogs.companyId, companyId)).orderBy(asc(importLogs.createdAt));
}
