import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "./drizzle/schema";
import type { TrpcContext } from "./_core/context";

const dbMocks = vi.hoisted(() => ({
  listAreas: vi.fn(),
  listIndicators: vi.fn(),
  listPerspectives: vi.fn(),
  listObjectives: vi.fn(),
  listCalibrationRules: vi.fn(),
  listWeights: vi.fn(),
  listApplicability: vi.fn(),
  listEntries: vi.fn(),
  getUserAreaIds: vi.fn(),
  getUserCompanyIds: vi.fn(),
  listCompanies: vi.fn(),
  listCompaniesForUser: vi.fn(),
  getIndicatorIdsForAreas: vi.fn(),
  upsertEntry: vi.fn(),
}));

vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    listAreas: dbMocks.listAreas,
    listIndicators: dbMocks.listIndicators,
    listPerspectives: dbMocks.listPerspectives,
    listObjectives: dbMocks.listObjectives,
    listCalibrationRules: dbMocks.listCalibrationRules,
    listWeights: dbMocks.listWeights,
    listApplicability: dbMocks.listApplicability,
    listEntries: dbMocks.listEntries,
    getUserAreaIds: dbMocks.getUserAreaIds,
    getUserCompanyIds: dbMocks.getUserCompanyIds,
    listCompanies: dbMocks.listCompanies,
    listCompaniesForUser: dbMocks.listCompaniesForUser,
    getIndicatorIdsForAreas: dbMocks.getIndicatorIdsForAreas,
    upsertEntry: dbMocks.upsertEntry,
  };
});

const { appRouter } = await import("./routers");
const { buildCompanySnapshot } = await import("./dashboardService");
const { importEntries } = await import("./importService");
// Implementação real (não mockada) — só para testar o short-circuit de array vazio.
const { getIndicatorIdsForAreas } = await vi.importActual<typeof import("./db")>("./db");

function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: 1,
    email: "user@example.com",
    name: "Test User",
    passwordHash: "hash",
    role: "user",
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };
}

function makeCaller(user: User) {
  const ctx: TrpcContext = {
    user,
    req: { headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
  return appRouter.createCaller(ctx);
}

const mkArea = (id: number, name = `Área ${id}`) => ({
  id,
  companyId: 1,
  name,
  description: null,
  parentAreaId: null,
  sortOrder: id,
  active: true,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const mkIndicator = (id: number, overrides: Record<string, unknown> = {}) => ({
  id,
  companyId: 1,
  perspectiveId: 1,
  name: `Indicador ${id}`,
  description: null,
  unit: "number",
  scaleType: "higher_better_120",
  direction: "higher_better",
  objectiveId: null,
  calibrationRuleId: null,
  defaultGoal: null,
  sortOrder: id,
  active: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

beforeEach(() => {
  Object.values(dbMocks).forEach((m) => m.mockReset());
  dbMocks.listObjectives.mockResolvedValue([]);
  // Por padrão, o usuário comum dos testes tem acesso à empresa 1 (usada em quase todo teste).
  dbMocks.getUserCompanyIds.mockResolvedValue([1]);
});

describe("areas.list — restrição por área", () => {
  it("admin vê todas as áreas", async () => {
    dbMocks.listAreas.mockResolvedValue([mkArea(1), mkArea(2), mkArea(3)]);
    const admin = buildUser({ id: 1, role: "admin" });

    const result = await makeCaller(admin).areas.list({ companyId: 1 });
    expect(result.map((a: { id: number }) => a.id)).toEqual([1, 2, 3]);
    expect(dbMocks.getUserAreaIds).not.toHaveBeenCalled();
  });

  it("usuário comum só vê as áreas liberadas para ele", async () => {
    dbMocks.listAreas.mockResolvedValue([mkArea(1), mkArea(2), mkArea(3)]);
    dbMocks.getUserAreaIds.mockResolvedValue([2]);
    const user = buildUser({ id: 5, role: "user" });

    const result = await makeCaller(user).areas.list({ companyId: 1 });
    expect(result.map((a: { id: number }) => a.id)).toEqual([2]);
  });

  it("usuário comum sem nenhuma área liberada não vê nada", async () => {
    dbMocks.listAreas.mockResolvedValue([mkArea(1), mkArea(2)]);
    dbMocks.getUserAreaIds.mockResolvedValue([]);
    const user = buildUser({ id: 6, role: "user" });

    const result = await makeCaller(user).areas.list({ companyId: 1 });
    expect(result).toEqual([]);
  });
});

describe("indicators.list — restrição por área", () => {
  it("admin vê todos os indicadores", async () => {
    dbMocks.listIndicators.mockResolvedValue([mkIndicator(10), mkIndicator(11)]);
    const admin = buildUser({ id: 1, role: "admin" });

    const result = await makeCaller(admin).indicators.list({ companyId: 1 });
    expect(result.map((i: { id: number }) => i.id)).toEqual([10, 11]);
    expect(dbMocks.getIndicatorIdsForAreas).not.toHaveBeenCalled();
  });

  it("usuário comum só vê indicadores aplicáveis às suas áreas", async () => {
    dbMocks.listIndicators.mockResolvedValue([mkIndicator(10), mkIndicator(11), mkIndicator(12)]);
    dbMocks.getUserAreaIds.mockResolvedValue([2]);
    dbMocks.getIndicatorIdsForAreas.mockResolvedValue([11]);
    const user = buildUser({ id: 5, role: "user" });

    const result = await makeCaller(user).indicators.list({ companyId: 1 });
    expect(result.map((i: { id: number }) => i.id)).toEqual([11]);
    expect(dbMocks.getIndicatorIdsForAreas).toHaveBeenCalledWith([2]);
  });
});

describe("empresas — isolamento por tenant (multi-tenancy)", () => {
  const mkPersp = (id: number, companyId: number) => ({
    id,
    companyId,
    name: `Perspectiva ${id}`,
    description: null,
    color: "#000",
    sortOrder: id,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  it("usuário comum vinculado só à Empresa 1 não acessa a Empresa 2 (areas.list)", async () => {
    dbMocks.getUserCompanyIds.mockResolvedValue([1]);
    const user = buildUser({ id: 5, role: "user" });

    await expect(makeCaller(user).areas.list({ companyId: 2 })).rejects.toThrow(
      "Você não tem acesso a esta empresa",
    );
  });

  it("usuário comum vinculado às Empresas 1 e 2 acessa as duas, mas não uma terceira", async () => {
    dbMocks.getUserCompanyIds.mockResolvedValue([1, 2]);
    dbMocks.listPerspectives.mockResolvedValue([]);
    const user = buildUser({ id: 5, role: "user" });

    await expect(makeCaller(user).perspectives.list({ companyId: 1 })).resolves.toEqual([]);
    await expect(makeCaller(user).perspectives.list({ companyId: 2 })).resolves.toEqual([]);
    await expect(makeCaller(user).perspectives.list({ companyId: 3 })).rejects.toThrow(
      "Você não tem acesso a esta empresa",
    );
  });

  it("admin acessa qualquer empresa mesmo sem nenhum vínculo em user_companies", async () => {
    dbMocks.listPerspectives.mockResolvedValue([]);
    const admin = buildUser({ id: 1, role: "admin" });

    await expect(makeCaller(admin).perspectives.list({ companyId: 999 })).resolves.toEqual([]);
    expect(dbMocks.getUserCompanyIds).not.toHaveBeenCalled();
  });

  it("dashboard.snapshot bloqueia empresa fora do vínculo do usuário", async () => {
    dbMocks.getUserCompanyIds.mockResolvedValue([1]);
    const user = buildUser({ id: 5, role: "user" });

    await expect(
      makeCaller(user).dashboard.snapshot({ companyId: 2, year: 2026, month: 1 }),
    ).rejects.toThrow("Você não tem acesso a esta empresa");
  });

  it("perspectives.list sem companyId filtra pelas empresas do usuário comum", async () => {
    dbMocks.getUserCompanyIds.mockResolvedValue([1]);
    dbMocks.listPerspectives.mockResolvedValue([mkPersp(1, 1), mkPersp(2, 2)]);
    const user = buildUser({ id: 5, role: "user" });

    const result = await makeCaller(user).perspectives.list();
    expect(result.map((p: { id: number }) => p.id)).toEqual([1]);
  });

  it("perspectives.list sem companyId não filtra para admin", async () => {
    dbMocks.listPerspectives.mockResolvedValue([mkPersp(1, 1), mkPersp(2, 2)]);
    const admin = buildUser({ id: 1, role: "admin" });

    const result = await makeCaller(admin).perspectives.list();
    expect(result.map((p: { id: number }) => p.id)).toEqual([1, 2]);
    expect(dbMocks.getUserCompanyIds).not.toHaveBeenCalled();
  });

  it("companies.list: admin vê todas as empresas; usuário comum vê só as suas", async () => {
    dbMocks.listCompanies.mockResolvedValue([{ id: 1, name: "A" }, { id: 2, name: "B" }]);
    dbMocks.listCompaniesForUser.mockResolvedValue([{ id: 1, name: "A" }]);

    const admin = buildUser({ id: 1, role: "admin" });
    const adminResult = await makeCaller(admin).companies.list();
    expect(adminResult.map((c: { id: number }) => c.id)).toEqual([1, 2]);

    dbMocks.getUserCompanyIds.mockResolvedValue([1]);
    const user = buildUser({ id: 5, role: "user" });
    const userResult = await makeCaller(user).companies.list();
    expect(userResult.map((c: { id: number }) => c.id)).toEqual([1]);
    expect(dbMocks.listCompaniesForUser).toHaveBeenCalledWith([1]);
  });
});

describe("entries.upsert — bloqueio de lançamento fora da área", () => {
  it("recusa lançamento de indicador fora das áreas liberadas", async () => {
    dbMocks.getUserAreaIds.mockResolvedValue([2]);
    dbMocks.getIndicatorIdsForAreas.mockResolvedValue([100]);
    const user = buildUser({ id: 5, role: "user" });

    await expect(
      makeCaller(user).entries.upsert({ indicatorId: 999, year: 2026, month: 1, goal: 10, result: 5 }),
    ).rejects.toThrow("Este indicador não pertence às suas áreas");
    expect(dbMocks.upsertEntry).not.toHaveBeenCalled();
  });

  it("aceita lançamento de indicador dentro das áreas liberadas", async () => {
    dbMocks.getUserAreaIds.mockResolvedValue([2]);
    dbMocks.getIndicatorIdsForAreas.mockResolvedValue([100]);
    dbMocks.upsertEntry.mockResolvedValue(undefined);
    const user = buildUser({ id: 5, role: "user" });

    const result = await makeCaller(user).entries.upsert({ indicatorId: 100, year: 2026, month: 1, goal: 10, result: 5 });
    expect(result.success).toBe(true);
    expect(dbMocks.upsertEntry).toHaveBeenCalled();
  });

  it("admin lança em qualquer indicador sem checagem de área", async () => {
    dbMocks.upsertEntry.mockResolvedValue(undefined);
    const admin = buildUser({ id: 1, role: "admin" });

    const result = await makeCaller(admin).entries.upsert({ indicatorId: 999, year: 2026, month: 1, goal: 10, result: 5 });
    expect(result.success).toBe(true);
    expect(dbMocks.getIndicatorIdsForAreas).not.toHaveBeenCalled();
  });
});

describe("db.getIndicatorIdsForAreas — caso de borda", () => {
  it("retorna [] para conjunto vazio de áreas sem precisar de conexão com o banco", async () => {
    // Sem DATABASE_URL no ambiente de teste; se isso não tivesse short-circuit
    // antes do requireDb, o teste falharia com "Database not available".
    await expect(getIndicatorIdsForAreas([])).resolves.toEqual([]);
  });
});

describe("dashboardService.buildCompanySnapshot — filtro por allowedAreaIds", () => {
  const areas = [mkArea(1, "Comercial"), mkArea(2, "Financeiro")];
  const perspectives = [{ id: 1, companyId: 1, name: "Financeira", description: null, color: "#000", sortOrder: 1, active: true, createdAt: new Date(), updatedAt: new Date() }];
  const indicators = [mkIndicator(10, { perspectiveId: 1 }), mkIndicator(11, { perspectiveId: 1 })];
  const applicability = [
    { id: 1, indicatorId: 10, areaId: 1, applicable: true, updatedAt: new Date() },
    { id: 2, indicatorId: 11, areaId: 2, applicable: true, updatedAt: new Date() },
  ];

  beforeEach(() => {
    dbMocks.listAreas.mockResolvedValue(areas);
    dbMocks.listPerspectives.mockResolvedValue(perspectives);
    dbMocks.listIndicators.mockResolvedValue(indicators);
    dbMocks.listCalibrationRules.mockResolvedValue([]);
    dbMocks.listWeights.mockResolvedValue([]);
    dbMocks.listApplicability.mockResolvedValue(applicability);
    dbMocks.listEntries.mockResolvedValue([]);
  });

  it("sem restrição (admin, allowedAreaIds=null) devolve todas as áreas e indicadores", async () => {
    const snapshot = await buildCompanySnapshot(1, 2026, 7, null);
    expect(snapshot.areas.map((a) => a.id)).toEqual([1, 2]);
    expect(snapshot.indicators.map((i) => i.id)).toEqual([10, 11]);
    expect(snapshot.indicatorScores.map((s) => s.indicatorId)).toEqual([10, 11]);
  });

  it("com allowedAreaIds restringe áreas e os indicadores aplicáveis só a elas", async () => {
    const snapshot = await buildCompanySnapshot(1, 2026, 7, [1]);
    expect(snapshot.areas.map((a) => a.id)).toEqual([1]);
    expect(snapshot.indicators.map((i) => i.id)).toEqual([10]);
    expect(snapshot.indicatorScores.map((s) => s.indicatorId)).toEqual([10]);
    expect(snapshot.entries.every(() => true)).toBe(true);
  });

  it("allowedAreaIds=[] (usuário sem nenhuma área) devolve tudo vazio", async () => {
    const snapshot = await buildCompanySnapshot(1, 2026, 7, []);
    expect(snapshot.areas).toEqual([]);
    expect(snapshot.indicators).toEqual([]);
    expect(snapshot.indicatorScores).toEqual([]);
  });

  const mkEntry = (indicatorId: number, month: number, goal: number | null, result: number | null) => ({
    id: month,
    indicatorId,
    year: 2026,
    month,
    goal,
    result,
    source: "manual" as const,
    updatedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  it("mode ytd soma meta e resultado de janeiro até o mês informado, ignorando meses posteriores", async () => {
    dbMocks.listWeights.mockResolvedValue([{ id: 1, areaId: 1, perspectiveId: 1, weight: 1 }]);
    dbMocks.listEntries.mockResolvedValueOnce([
      mkEntry(10, 1, 10, 8),
      mkEntry(10, 2, 10, 12),
      mkEntry(10, 4, 10, 999), // fora do intervalo (mês 4 > mês 3 pedido) — deve ser ignorado
    ]);

    const snapshot = await buildCompanySnapshot(1, 2026, 3, null, "ytd");
    const ind10 = snapshot.indicatorScores.find((s) => s.indicatorId === 10)!;
    expect(ind10.goal).toBe(20);
    expect(ind10.result).toBe(20);
    expect(ind10.score).toBe(1.0); // higher_better_120: R(20) >= 0.95*M(19) e < 1.05*M(21)

    const area1 = snapshot.areaScores.find((a) => a.areaId === 1)!;
    expect(area1.total).toBeCloseTo(1.0);
  });

  it("mode month (padrão) usa apenas o lançamento do mês selecionado, sem acumular", async () => {
    dbMocks.listWeights.mockResolvedValue([{ id: 1, areaId: 1, perspectiveId: 1, weight: 1 }]);
    dbMocks.listEntries.mockResolvedValueOnce([mkEntry(10, 2, 10, 12)]);

    const snapshot = await buildCompanySnapshot(1, 2026, 2, null);
    const ind10 = snapshot.indicatorScores.find((s) => s.indicatorId === 10)!;
    expect(ind10.goal).toBe(10);
    expect(ind10.result).toBe(12);
    expect(ind10.score).toBe(1.2); // higher_better_120: R(12) >= 1.05*M(10.5)
  });

  it("mode ytd sem nenhum lançamento no intervalo retorna goal/result null (sem score)", async () => {
    dbMocks.listWeights.mockResolvedValue([{ id: 1, areaId: 1, perspectiveId: 1, weight: 1 }]);
    dbMocks.listEntries.mockResolvedValueOnce([]);

    const snapshot = await buildCompanySnapshot(1, 2026, 3, null, "ytd");
    const ind10 = snapshot.indicatorScores.find((s) => s.indicatorId === 10)!;
    expect(ind10.goal).toBeNull();
    expect(ind10.result).toBeNull();
    expect(ind10.score).toBeNull();
  });
});

describe("importService.importEntries — restrição por allowedIndicatorIds", () => {
  it("indicador fora do conjunto permitido cai em unmatched e não é gravado", async () => {
    dbMocks.listIndicators.mockResolvedValue([mkIndicator(10, { name: "Receita" })]);
    dbMocks.upsertEntry.mockResolvedValue(undefined);

    const result = await importEntries(1, 2026, 7, [{ indicatorName: "Receita", goal: 100, result: 90 }], 1, [999]);
    expect(result.matched).toEqual([]);
    expect(result.unmatched).toEqual(["Receita"]);
    expect(dbMocks.upsertEntry).not.toHaveBeenCalled();
  });

  it("indicador dentro do conjunto permitido é gravado normalmente", async () => {
    dbMocks.listIndicators.mockResolvedValue([mkIndicator(10, { name: "Receita" })]);
    dbMocks.upsertEntry.mockResolvedValue(undefined);

    const result = await importEntries(1, 2026, 7, [{ indicatorName: "Receita", goal: 100, result: 90 }], 1, [10]);
    expect(result.matched).toEqual([{ indicatorName: "Receita", indicatorId: 10, goal: 100, result: 90 }]);
    expect(result.unmatched).toEqual([]);
    expect(dbMocks.upsertEntry).toHaveBeenCalled();
  });

  it("allowedIndicatorIds=null (admin) não restringe nada", async () => {
    dbMocks.listIndicators.mockResolvedValue([mkIndicator(10, { name: "Receita" })]);
    dbMocks.upsertEntry.mockResolvedValue(undefined);

    const result = await importEntries(1, 2026, 7, [{ indicatorName: "Receita", goal: 100, result: 90 }], 1, null);
    expect(result.matched).toHaveLength(1);
  });
});
