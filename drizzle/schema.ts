import {
  boolean,
  doublePrecision,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["user", "admin"]);

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = pgTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: serial("id").primaryKey(),
  /** Identificador de login. Único por usuário. */
  email: varchar("email", { length: 320 }).notNull().unique(),
  name: text("name"),
  /** Hash bcrypt da senha. Nunca é retornado ao client — ver `toPublicUser` em server/db.ts. */
  passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
  role: roleEnum("role").default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/** Empresas (companies) */
export const companies = pgTable("companies", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  cnpj: varchar("cnpj", { length: 32 }),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type Company = typeof companies.$inferSelect;

/** Áreas (departments/units) belonging to a company */
export const areas = pgTable("areas", {
  id: serial("id").primaryKey(),
  companyId: integer("companyId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  /** Área à qual esta área se subordina (auto-referência, null = topo do organograma) */
  parentAreaId: integer("parentAreaId"),
  sortOrder: integer("sortOrder").default(0).notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type Area = typeof areas.$inferSelect;

/** Perspectivas (BSC perspectives) belonging to a company */
export const perspectives = pgTable("perspectives", {
  id: serial("id").primaryKey(),
  companyId: integer("companyId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  color: varchar("color", { length: 16 }).default("#1e3a5f"),
  sortOrder: integer("sortOrder").default(0).notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
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

export const scaleTypePgEnum = pgEnum("scaleType", scaleTypeEnum);

/** Objetivos estratégicos: perspectivas → objetivos → indicadores */
export const objectives = pgTable("objectives", {
  id: serial("id").primaryKey(),
  companyId: integer("companyId").notNull(),
  perspectiveId: integer("perspectiveId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  sortOrder: integer("sortOrder").default(0).notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type Objective = typeof objectives.$inferSelect;

/**
 * Regras de calibragem do indicador: conjunto de faixas de atingimento → score.
 * directConversion=true significa que o score é o próprio atingimento (resultado/meta).
 */
export const calibrationRules = pgTable("calibration_rules", {
  id: serial("id").primaryKey(),
  companyId: integer("companyId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  directConversion: boolean("directConversion").default(false).notNull(),
  /** Direção do atingimento: higher = resultado/meta (maior-melhor), lower = meta/resultado invertido (menor-melhor usa razo R/M mas faixas descendentes) */
  sortOrder: integer("sortOrder").default(0).notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type CalibrationRule = typeof calibrationRules.$inferSelect;

/**
 * Faixas da regra de calibragem. Cada faixa define uma condição sobre o
 * atingimento (attainment = resultado / meta, em fração, ex.: 1.05 = 105%):
 * minAttainment (opcional) ≤/< attainment ≤/< maxAttainment (opcional) → score.
 * Inclusividade dos limites configurável para reproduzir exatamente regras como
 * "95% Meta <= Resultado < 105% Meta".
 */
export const calibrationRuleRanges = pgTable("calibration_rule_ranges", {
  id: serial("id").primaryKey(),
  ruleId: integer("ruleId").notNull(),
  /** Limite inferior do atingimento em fração (ex.: 0.95). Null = sem limite inferior */
  minAttainment: doublePrecision("minAttainment"),
  /** Limite inferior inclusivo? (>=) */
  minInclusive: boolean("minInclusive").default(true).notNull(),
  /** Limite superior do atingimento em fração (ex.: 1.05). Null = sem limite superior */
  maxAttainment: doublePrecision("maxAttainment"),
  /** Limite superior inclusivo? (<=) */
  maxInclusive: boolean("maxInclusive").default(false).notNull(),
  /** Score atribuído à faixa em fração (ex.: 1.2 = 120%) */
  score: doublePrecision("score").default(0).notNull(),
  sortOrder: integer("sortOrder").default(0).notNull(),
});
export type CalibrationRuleRange = typeof calibrationRuleRanges.$inferSelect;

/** Indicadores (KPIs) belonging to a perspective */
export const indicators = pgTable("indicators", {
  id: serial("id").primaryKey(),
  companyId: integer("companyId").notNull(),
  perspectiveId: integer("perspectiveId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  unit: varchar("unit", { length: 32 }).default("number"), // number | percent | currency
  scaleType: scaleTypePgEnum("scaleType").default("higher_better_100").notNull(),
  /** Objetivo estratégico ao qual o indicador pertence (perspectivas → objetivos → indicadores) */
  objectiveId: integer("objectiveId"),
  /** Regra de calibragem aplicada ao indicador (substitui o scaleType fixo) */
  calibrationRuleId: integer("calibrationRuleId"),
  /** Meta padrão: pré-preenche os lançamentos mensais (editável mês a mês) */
  defaultGoal: doublePrecision("defaultGoal"),
  sortOrder: integer("sortOrder").default(0).notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type Indicator = typeof indicators.$inferSelect;

/** Matriz área × perspectiva: peso da perspectiva para a área */
export const areaPerspectiveWeights = pgTable(
  "area_perspective_weights",
  {
    id: serial("id").primaryKey(),
    areaId: integer("areaId").notNull(),
    perspectiveId: integer("perspectiveId").notNull(),
    weight: doublePrecision("weight").default(0).notNull(), // 0..1 (e.g. 0.7 = 70%)
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("uq_area_persp").on(t.areaId, t.perspectiveId)],
);
export type AreaPerspectiveWeight = typeof areaPerspectiveWeights.$inferSelect;

/** Matriz indicador × área: aplicabilidade */
export const indicatorAreaApplicability = pgTable(
  "indicator_area_applicability",
  {
    id: serial("id").primaryKey(),
    indicatorId: integer("indicatorId").notNull(),
    areaId: integer("areaId").notNull(),
    applicable: boolean("applicable").default(true).notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("uq_ind_area").on(t.indicatorId, t.areaId)],
);
export type IndicatorAreaApplicability = typeof indicatorAreaApplicability.$inferSelect;

export const entrySourceEnum = pgEnum("source", ["manual", "import"]);

/** Metas e resultados por indicador por período (mês/ano) */
export const indicatorEntries = pgTable(
  "indicator_entries",
  {
    id: serial("id").primaryKey(),
    indicatorId: integer("indicatorId").notNull(),
    year: integer("year").notNull(),
    month: integer("month").notNull(), // 1-12
    goal: doublePrecision("goal"), // META
    result: doublePrecision("result"), // RESULTADO
    source: entrySourceEnum("source").default("manual").notNull(),
    updatedBy: integer("updatedBy"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("uq_ind_period").on(t.indicatorId, t.year, t.month)],
);
export type IndicatorEntry = typeof indicatorEntries.$inferSelect;

/** Log de importações Excel */
export const importLogs = pgTable("import_logs", {
  id: serial("id").primaryKey(),
  companyId: integer("companyId").notNull(),
  year: integer("year").notNull(),
  month: integer("month").notNull(),
  fileName: varchar("fileName", { length: 512 }),
  totalRows: integer("totalRows").default(0).notNull(),
  matchedRows: integer("matchedRows").default(0).notNull(),
  unmatchedRows: text("unmatchedRows"), // JSON array of unmatched indicator names
  importedBy: integer("importedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ImportLog = typeof importLogs.$inferSelect;
