import {
  boolean,
  double,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/** Empresas (companies) */
export const companies = mysqlTable("companies", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  cnpj: varchar("cnpj", { length: 32 }),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Company = typeof companies.$inferSelect;

/** Áreas (departments/units) belonging to a company */
export const areas = mysqlTable("areas", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  /** Área à qual esta área se subordina (auto-referência, null = topo do organograma) */
  parentAreaId: int("parentAreaId"),
  sortOrder: int("sortOrder").default(0).notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Area = typeof areas.$inferSelect;

/** Perspectivas (BSC perspectives) belonging to a company */
export const perspectives = mysqlTable("perspectives", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  color: varchar("color", { length: 16 }).default("#1e3a5f"),
  sortOrder: int("sortOrder").default(0).notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Perspective = typeof perspectives.$inferSelect;

/**
 * Score scale types — exactly 5 fixed options, replicating the spreadsheet step functions:
 * - higher_better_120: IF(R>=1.05*M,120%, IF(R>=0.95*M,100%, IF(R>=0.85*M,60%, 0%)))
 * - higher_better_100: IF(R>=M,100%, IF(R>=0.95*M,80%, IF(R>=0.85*M,60%, 0%)))
 * - lower_better_100:  IF(R<=M,100%, IF(R<=1.02*M,80%, IF(R<=1.05*M,60%, 0%)))
 * - lower_better_120:  IF(R>1.1*M,0%, IF(R>1.05*M,60%, IF(R>0.95*M,100%, 120%)))
 * - target_range:      IF(R>=1.1*M,0%, IF(R>=1.05*M,60%, IF(R>=0.95*M,100%, IF(R>=0.9*M,60%, 0%))))
 */
export const scaleTypeEnum = [
  "higher_better_120",
  "higher_better_100",
  "lower_better_100",
  "lower_better_120",
  "target_range",
] as const;

/** Objetivos estratégicos: perspectivas → objetivos → indicadores */
export const objectives = mysqlTable("objectives", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  perspectiveId: int("perspectiveId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  sortOrder: int("sortOrder").default(0).notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Objective = typeof objectives.$inferSelect;

/**
 * Regras de calibragem do indicador: conjunto de faixas de atingimento → score.
 * directConversion=true significa que o score é o próprio atingimento (resultado/meta).
 */
export const calibrationRules = mysqlTable("calibration_rules", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  directConversion: boolean("directConversion").default(false).notNull(),
  /** Direção do atingimento: higher = resultado/meta (maior-melhor), lower = meta/resultado invertido (menor-melhor usa razo R/M mas faixas descendentes) */
  sortOrder: int("sortOrder").default(0).notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type CalibrationRule = typeof calibrationRules.$inferSelect;

/**
 * Faixas da regra de calibragem. Cada faixa define uma condição sobre o
 * atingimento (attainment = resultado / meta, em fração, ex.: 1.05 = 105%):
 * minAttainment (opcional) ≤/< attainment ≤/< maxAttainment (opcional) → score.
 * Inclusividade dos limites configurável para reproduzir exatamente regras como
 * "95% Meta <= Resultado < 105% Meta".
 */
export const calibrationRuleRanges = mysqlTable("calibration_rule_ranges", {
  id: int("id").autoincrement().primaryKey(),
  ruleId: int("ruleId").notNull(),
  /** Limite inferior do atingimento em fração (ex.: 0.95). Null = sem limite inferior */
  minAttainment: double("minAttainment"),
  /** Limite inferior inclusivo? (>=) */
  minInclusive: boolean("minInclusive").default(true).notNull(),
  /** Limite superior do atingimento em fração (ex.: 1.05). Null = sem limite superior */
  maxAttainment: double("maxAttainment"),
  /** Limite superior inclusivo? (<=) */
  maxInclusive: boolean("maxInclusive").default(false).notNull(),
  /** Score atribuído à faixa em fração (ex.: 1.2 = 120%) */
  score: double("score").default(0).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
});
export type CalibrationRuleRange = typeof calibrationRuleRanges.$inferSelect;

/** Indicadores (KPIs) belonging to a perspective */
export const indicators = mysqlTable("indicators", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  perspectiveId: int("perspectiveId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  unit: varchar("unit", { length: 32 }).default("number"), // number | percent | currency
  scaleType: mysqlEnum("scaleType", scaleTypeEnum).default("higher_better_100").notNull(),
  /** Objetivo estratégico ao qual o indicador pertence (perspectivas → objetivos → indicadores) */
  objectiveId: int("objectiveId"),
  /** Regra de calibragem aplicada ao indicador (substitui o scaleType fixo) */
  calibrationRuleId: int("calibrationRuleId"),
  /** Meta padrão: pré-preenche os lançamentos mensais (editável mês a mês) */
  defaultGoal: double("defaultGoal"),
  sortOrder: int("sortOrder").default(0).notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Indicator = typeof indicators.$inferSelect;

/** Matriz área × perspectiva: peso da perspectiva para a área */
export const areaPerspectiveWeights = mysqlTable(
  "area_perspective_weights",
  {
    id: int("id").autoincrement().primaryKey(),
    areaId: int("areaId").notNull(),
    perspectiveId: int("perspectiveId").notNull(),
    weight: double("weight").default(0).notNull(), // 0..1 (e.g. 0.7 = 70%)
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [uniqueIndex("uq_area_persp").on(t.areaId, t.perspectiveId)],
);
export type AreaPerspectiveWeight = typeof areaPerspectiveWeights.$inferSelect;

/** Matriz indicador × área: aplicabilidade */
export const indicatorAreaApplicability = mysqlTable(
  "indicator_area_applicability",
  {
    id: int("id").autoincrement().primaryKey(),
    indicatorId: int("indicatorId").notNull(),
    areaId: int("areaId").notNull(),
    applicable: boolean("applicable").default(true).notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [uniqueIndex("uq_ind_area").on(t.indicatorId, t.areaId)],
);
export type IndicatorAreaApplicability = typeof indicatorAreaApplicability.$inferSelect;

/** Metas e resultados por indicador por período (mês/ano) */
export const indicatorEntries = mysqlTable(
  "indicator_entries",
  {
    id: int("id").autoincrement().primaryKey(),
    indicatorId: int("indicatorId").notNull(),
    year: int("year").notNull(),
    month: int("month").notNull(), // 1-12
    goal: double("goal"), // META
    result: double("result"), // RESULTADO
    source: mysqlEnum("source", ["manual", "import"]).default("manual").notNull(),
    updatedBy: int("updatedBy"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [uniqueIndex("uq_ind_period").on(t.indicatorId, t.year, t.month)],
);
export type IndicatorEntry = typeof indicatorEntries.$inferSelect;

/** Log de importações Excel */
export const importLogs = mysqlTable("import_logs", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  year: int("year").notNull(),
  month: int("month").notNull(),
  fileName: varchar("fileName", { length: 512 }),
  totalRows: int("totalRows").default(0).notNull(),
  matchedRows: int("matchedRows").default(0).notNull(),
  unmatchedRows: text("unmatchedRows"), // JSON array of unmatched indicator names
  importedBy: int("importedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ImportLog = typeof importLogs.$inferSelect;
