/**
 * Tipos do contrato HTTP com o server, escritos à mão no lado do client.
 * Client e server são pacotes independentes (sem import cruzado, nem de
 * tipos) — ver client/src/lib/trpc.ts. Estes tipos espelham o que os
 * procedures de server/routers.ts de fato devolvem; mantenha em sincronia
 * manualmente se o shape do server mudar.
 */
import type {
  AccumulationType,
  AreaScore,
  CalibrationRuleDef,
  Direction,
  ObjectiveScore,
  PerspectiveScore,
  ScaleType,
} from "@/lib/calcEngine";

export type Role = "user" | "admin";

export interface PublicUser {
  id: number;
  email: string;
  name: string | null;
  role: Role;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastSignedIn: Date;
}

/** Retorno de trpc.users.list — PublicUser + áreas/empresas liberadas (só relevante para role="user") */
export interface UserListItem extends PublicUser {
  areaIds: number[];
  companyIds: number[];
}

export interface Company {
  id: number;
  name: string;
  cnpj: string | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Area {
  id: number;
  companyId: number;
  name: string;
  description: string | null;
  parentAreaId: number | null;
  sortOrder: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Perspective {
  id: number;
  companyId: number;
  name: string;
  description: string | null;
  color: string | null;
  sortOrder: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Objective {
  id: number;
  companyId: number;
  perspectiveId: number;
  name: string;
  description: string | null;
  sortOrder: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Indicator {
  id: number;
  companyId: number;
  perspectiveId: number;
  name: string;
  description: string | null;
  unit: string | null;
  scaleType: ScaleType;
  direction: Direction;
  accumulationType: AccumulationType;
  objectiveId: number | null;
  calibrationRuleId: number | null;
  defaultGoal: number | null;
  sortOrder: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CalibrationRuleRange {
  id: number;
  ruleId: number;
  minAttainment: number | null;
  minInclusive: boolean;
  maxAttainment: number | null;
  maxInclusive: boolean;
  score: number;
  sortOrder: number;
}

export interface CalibrationRule {
  id: number;
  companyId: number;
  name: string;
  description: string | null;
  directConversion: boolean;
  sortOrder: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  ranges: CalibrationRuleRange[];
}

export interface AreaPerspectiveWeight {
  id: number;
  areaId: number;
  perspectiveId: number;
  weight: number;
  updatedAt: Date;
}

export interface IndicatorAreaApplicability {
  id: number;
  indicatorId: number;
  areaId: number;
  applicable: boolean;
  updatedAt: Date;
}

export type EntrySource = "manual" | "import";

export interface IndicatorEntry {
  id: number;
  indicatorId: number;
  year: number;
  month: number;
  goal: number | null;
  result: number | null;
  source: EntrySource;
  updatedBy: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ImportLog {
  id: number;
  companyId: number;
  year: number;
  month: number;
  fileName: string | null;
  totalRows: number;
  matchedRows: number;
  unmatchedRows: string | null;
  importedBy: number | null;
  createdAt: Date;
}

export interface ImportResult {
  totalRows: number;
  matched: { indicatorName: string; indicatorId: number; goal: number | null; result: number | null }[];
  unmatched: string[];
}

export interface IndicatorScoreDetail {
  indicatorId: number;
  name: string;
  perspectiveId: number;
  unit: string | null;
  scaleType: ScaleType;
  ruleName: string | null;
  goal: number | null;
  result: number | null;
  score: number | null;
}

export interface ObjectiveScoreByArea {
  areaId: number;
  objectiveId: number;
  average: number | null;
}

/** Retorno de trpc.dashboard.snapshot */
export interface DashboardSnapshot {
  year: number;
  month: number;
  areas: Area[];
  perspectives: Perspective[];
  indicators: Indicator[];
  objectives: Objective[];
  areaScores: (AreaScore & { areaName: string })[];
  indicatorScores: IndicatorScoreDetail[];
  /** Score do objetivo na empresa, sem quebra por área (indicadores visíveis) */
  objectiveScores: ObjectiveScore[];
  /** Score do objetivo por área, para o gráfico "por área" do dashboard de objetivos */
  objectiveScoresByArea: ObjectiveScoreByArea[];
  /** Indicadores ativos (visíveis) sem objectiveId vinculado */
  unassignedIndicatorCount: number;
  weights: AreaPerspectiveWeight[];
  applicability: IndicatorAreaApplicability[];
  entries: IndicatorEntry[];
}

export interface HistoryPeriodAreaScore {
  areaId: number;
  areaName: string;
  total: number;
  perspectives: PerspectiveScore[];
}

export interface HistoryPeriodIndicatorScore {
  indicatorId: number;
  name: string;
  perspectiveId: number;
  goal: number | null;
  result: number | null;
  score: number | null;
}

export interface HistoryPeriodObjectiveScore {
  objectiveId: number;
  average: number | null;
}

export interface HistoryPeriod {
  year: number;
  month: number;
  areaScores: HistoryPeriodAreaScore[];
  indicatorScores: HistoryPeriodIndicatorScore[];
  objectiveScores: HistoryPeriodObjectiveScore[];
}

/** Retorno de trpc.dashboard.history */
export interface DashboardHistory {
  periods: HistoryPeriod[];
  areas: Area[];
  perspectives: Perspective[];
  indicators: Indicator[];
  objectives: Objective[];
}

export type { CalibrationRuleDef, Direction };
