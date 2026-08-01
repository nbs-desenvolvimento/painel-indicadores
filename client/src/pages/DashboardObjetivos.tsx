import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { DashboardEmptyState, PageSkeleton, PageToolbar, ScoreBadge, ScoreGauge } from "@/components/shared";
import { PeriodModeBadge, PeriodModeToggle, usePeriodModeControls } from "@/components/PeriodModeControls";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MONTH_NAMES_SHORT, fmtScore, fmtValue, scoreColor, useApp } from "@/contexts/AppContext";
import { useAuth } from "@/hooks/useAuth";
import { useDashboardHistory, useDashboardSnapshot } from "@/lib/apiHooks";
import type { DashboardSnapshot } from "@/lib/apiTypes";
import { formatPeriodBadge, formatPeriodSubtitle } from "@/lib/periodMode";
import { buildLast12Periods } from "@/lib/periods";
import { AlertTriangle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const ALL = "all";

export default function DashboardObjetivos() {
  const { companyId, year } = useApp();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [objectiveId, setObjectiveId] = useState<number | typeof ALL | null>(null);

  const pm = usePeriodModeControls(year);
  const { data: snap, isLoading } = useDashboardSnapshot(
    { companyId: companyId ?? 0, year, month: pm.month, mode: pm.mode },
    { enabled: !!companyId },
  );

  const periodSubtitle = formatPeriodSubtitle(pm.viewScope, pm.calcMode, pm.month, year);
  const periodBadge = formatPeriodBadge(pm.viewScope, pm.calcMode, pm.month, year);

  const periods = useMemo(() => buildLast12Periods(year, pm.month), [year, pm.month]);
  const { data: history } = useDashboardHistory(
    { companyId: companyId ?? 0, periods },
    { enabled: !!companyId },
  );

  useEffect(() => {
    if (!snap) return;
    if (objectiveId === null) {
      if ((snap.objectives ?? []).length > 0) setObjectiveId((snap.objectives ?? [])[0].id);
      return;
    }
    if (typeof objectiveId === "number" && !(snap.objectives ?? []).some((o) => o.id === objectiveId)) {
      setObjectiveId((snap.objectives ?? []).length > 0 ? (snap.objectives ?? [])[0].id : ALL);
    }
  }, [snap, objectiveId]);

  if (isLoading || !companyId) return <PageSkeleton />;

  if (!snap || (snap.objectives ?? []).length === 0) {
    return (
      <>
        <PageToolbar
          title="Dashboard por Objetivo"
          subtitle={periodSubtitle}
          hideMonth
          exportMode={pm.mode}
          exportMonth={pm.month}
        >
          <PeriodModeToggle {...pm} />
        </PageToolbar>
        <DashboardEmptyState
          isAdmin={isAdmin}
          adminTitle="Nenhum objetivo cadastrado"
          adminDescription="Cadastre objetivos estratégicos para visualizar este dashboard."
        />
      </>
    );
  }

  const orderedPerspectives = [...(snap.perspectives ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
  const selected = typeof objectiveId === "number" ? (snap.objectives ?? []).find((o) => o.id === objectiveId) : undefined;
  const selectedPersp = (snap.perspectives ?? []).find((p) => p.id === selected?.perspectiveId);

  const objIndicators = (snap.indicators ?? []).filter((i) => i.objectiveId === objectiveId);
  const objIndicatorIds = new Set(objIndicators.map((i) => i.id));
  const objIndicatorScores = (snap.indicatorScores ?? []).filter((i) => objIndicatorIds.has(i.indicatorId));
  const objectiveScore = (snap.objectiveScores ?? []).find((o) => o.objectiveId === objectiveId);

  const applicableAreaIds = new Set(
    (snap.applicability ?? []).filter((a) => a.applicable && objIndicatorIds.has(a.indicatorId)).map((a) => a.areaId),
  );
  const applicableAreas = (snap.areas ?? []).filter((a) => applicableAreaIds.has(a.id));

  // Score do objetivo em cada área
  const areaData = (snap.areaScores ?? [])
    .map((a) => {
      const os = (snap.objectiveScoresByArea ?? []).find((x) => x.areaId === a.areaId && x.objectiveId === objectiveId);
      return {
        name: a.areaName,
        average: os?.average !== null && os?.average !== undefined ? Math.round(os.average * 1000) / 10 : null,
      };
    })
    .filter((d) => d.average !== null)
    .sort((a, b) => (b.average ?? 0) - (a.average ?? 0));

  // Evolução do score do objetivo nos últimos 12 meses
  const histData = (history?.periods ?? []).map((p) => {
    const os = (p.objectiveScores ?? []).find((x) => x.objectiveId === objectiveId);
    return {
      label: `${MONTH_NAMES_SHORT[p.month - 1]}/${String(p.year).slice(2)}`,
      score: os?.average !== null && os?.average !== undefined ? Math.round(os.average * 1000) / 10 : null,
    };
  });

  return (
    <div className="fade-up">
      <PageToolbar
        title="Dashboard por Objetivo"
        subtitle={`Análise por objetivo estratégico — ${periodSubtitle}`}
        showExport
        hideMonth
        exportMode={pm.mode}
        exportMonth={pm.month}
      >
        <PeriodModeToggle {...pm} />
        <Select
          value={objectiveId === ALL ? ALL : objectiveId ? String(objectiveId) : undefined}
          onValueChange={(v) => setObjectiveId(v === ALL ? ALL : parseInt(v))}
        >
          <SelectTrigger className="w-[280px] bg-card">
            <SelectValue placeholder="Selecione o objetivo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os objetivos</SelectItem>
            {orderedPerspectives.map((p) => {
              const objs = (snap.objectives ?? []).filter((o) => o.perspectiveId === p.id).sort((a, b) => a.sortOrder - b.sortOrder);
              if (objs.length === 0) return null;
              return (
                <SelectGroup key={p.id}>
                  <SelectLabel>{p.name}</SelectLabel>
                  {objs.map((o) => (
                    <SelectItem key={o.id} value={String(o.id)}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              );
            })}
          </SelectContent>
        </Select>
      </PageToolbar>

      {isAdmin && snap.unassignedIndicatorCount > 0 && (
        <Alert className="mb-6">
          <AlertTriangle />
          <AlertTitle>
            {snap.unassignedIndicatorCount} indicador{snap.unassignedIndicatorCount === 1 ? "" : "es"} sem objetivo vinculado
          </AlertTitle>
          <AlertDescription>
            Esse{snap.unassignedIndicatorCount === 1 ? "" : "s"} indicador{snap.unassignedIndicatorCount === 1 ? "" : "es"} não
            aparece{snap.unassignedIndicatorCount === 1 ? "" : "m"} em nenhum objetivo neste dashboard.{" "}
            <Link href="/cadastros/indicadores" className="text-primary hover:underline">
              Vincule em Cadastros → Indicadores.
            </Link>
          </AlertDescription>
        </Alert>
      )}

      {objectiveId === ALL && (
        <ObjectiveGroupView snap={snap} onSelectObjective={setObjectiveId} periodBadge={periodBadge} />
      )}

      {objectiveId !== ALL && selected && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6">
            <Card className="card-elegant border-0 lg:col-span-2">
              <CardHeader className="pb-2">
                <div className="h-1 w-10 rounded-full mb-2" style={{ backgroundColor: selectedPersp?.color || "#1e3a5f" }} />
                <CardTitle className="text-lg font-serif">{selected.name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="text-muted-foreground leading-relaxed">{selected.description || "Sem descrição."}</p>
                <div className="flex flex-wrap gap-x-6 gap-y-1 pt-2 text-xs text-muted-foreground">
                  <span>
                    Perspectiva: <strong className="text-foreground">{selectedPersp?.name}</strong>
                  </span>
                  <span>
                    Indicadores: <strong className="text-foreground">{objIndicators.length}</strong>
                  </span>
                  <span>
                    Áreas aplicáveis: <strong className="text-foreground">{applicableAreas.length}</strong>
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card className="card-elegant border-0 lg:col-span-2">
              <CardHeader className="pb-0">
                <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide flex items-center justify-between gap-2 flex-wrap">
                  <span>Score do Objetivo</span>
                  <PeriodModeBadge label={periodBadge} />
                </CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-center pt-1 pb-4">
                <ScoreGauge score={objectiveScore?.average ?? null} size={160} label="Média dos indicadores do objetivo" />
              </CardContent>
            </Card>
          </div>

          {objIndicators.length === 0 ? (
            <Card className="card-elegant border-0">
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                Nenhum indicador vinculado a este objetivo ainda.
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
                <Card className="card-elegant border-0">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide flex items-center justify-between gap-2 flex-wrap">
                      <span>Indicadores do objetivo</span>
                      <PeriodModeBadge label={periodBadge} />
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-muted-foreground text-xs uppercase tracking-wide">
                          <th className="text-left py-2 pr-2 font-medium">Indicador</th>
                          <th className="text-right py-2 px-2 font-medium">Meta</th>
                          <th className="text-right py-2 px-2 font-medium">Resultado</th>
                          <th className="text-center py-2 pl-2 font-medium">Score</th>
                        </tr>
                      </thead>
                      <tbody>
                        {objIndicatorScores.map((i) => {
                          const ind = (snap.indicators ?? []).find((x) => x.id === i.indicatorId);
                          return (
                            <tr key={i.indicatorId} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                              <td className="py-2 pr-2 font-medium">{i.name}</td>
                              <td className="py-2 px-2 text-right kpi-number">{fmtValue(i.goal, ind?.unit)}</td>
                              <td className="py-2 px-2 text-right kpi-number">{fmtValue(i.result, ind?.unit)}</td>
                              <td className="py-2 pl-2 text-center">
                                <ScoreBadge score={i.score} />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>

                <Card className="card-elegant border-0">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide flex items-center justify-between gap-2 flex-wrap">
                      <span>Score do objetivo por área</span>
                      <PeriodModeBadge label={periodBadge} />
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {areaData.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-8 text-center">
                        Nenhuma área com indicador deste objetivo apurado no período.
                      </p>
                    ) : (
                      <div style={{ height: Math.max(280, areaData.length * 30) }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={areaData} layout="vertical" margin={{ left: 30, right: 40, top: 8, bottom: 8 }}>
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="oklch(0.92 0.008 90)" />
                            <XAxis type="number" domain={[0, 120]} tickFormatter={(v) => `${v}%`} fontSize={12} />
                            <YAxis type="category" dataKey="name" width={150} fontSize={11} />
                            <Tooltip formatter={(v: number) => [`${v.toLocaleString("pt-BR")}%`, "Média dos indicadores"]} />
                            <ReferenceLine x={100} stroke="#15803d" strokeDasharray="4 4" />
                            <Bar dataKey="average" radius={[0, 6, 6, 0]} barSize={16}>
                              {areaData.map((d, i) => (
                                <Cell key={i} fill={scoreColor((d.average ?? 0) / 100)} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card className="card-elegant border-0">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                      Evolução Mensal do Score (12 meses)
                    </CardTitle>
                    <p className="text-[11px] normal-case text-muted-foreground font-normal">
                      Sempre mês a mês — independente do modo Ano/Acumulado selecionado acima.
                    </p>
                  </CardHeader>
                  <CardContent>
                    <div className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={histData} margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.008 90)" />
                          <XAxis dataKey="label" fontSize={11} />
                          <YAxis domain={[0, 120]} fontSize={11} tickFormatter={(v) => `${v}%`} />
                          <Tooltip formatter={(v: number) => [`${v.toLocaleString("pt-BR")}%`, "Score"]} />
                          <ReferenceLine y={100} stroke="#15803d" strokeDasharray="4 4" />
                          <Line type="monotone" dataKey="score" stroke="#c9a227" strokeWidth={2.5} dot={{ r: 4 }} connectNulls />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                <Card className="card-elegant border-0">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                      Áreas onde os indicadores deste objetivo se aplicam
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {applicableAreas.map((a) => (
                        <span
                          key={a.id}
                          className="inline-flex items-center rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground"
                        >
                          {a.name}
                        </span>
                      ))}
                      {applicableAreas.length === 0 && (
                        <p className="text-sm text-muted-foreground">Nenhuma área aplicável.</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function ObjectiveGroupView({
  snap,
  onSelectObjective,
  periodBadge,
}: {
  snap: DashboardSnapshot;
  onSelectObjective: (id: number) => void;
  periodBadge: string;
}) {
  const perspColor = new Map((snap.perspectives ?? []).map((p) => [p.id, p.color || "#1e3a5f"]));
  const perspName = new Map((snap.perspectives ?? []).map((p) => [p.id, p.name]));
  const orderedPerspectives = [...(snap.perspectives ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);

  const rows = orderedPerspectives.flatMap((p) =>
    (snap.objectives ?? [])
      .filter((o) => o.perspectiveId === p.id)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((o) => {
        const score = (snap.objectiveScores ?? []).find((x) => x.objectiveId === o.id);
        const indCount = (snap.indicators ?? []).filter((i) => i.objectiveId === o.id).length;
        return { objective: o, average: score?.average ?? null, indCount };
      }),
  );

  const barData = rows
    .filter((r) => r.average !== null)
    .map((r) => ({ name: r.objective.name, average: Math.round((r.average ?? 0) * 1000) / 10 }))
    .sort((a, b) => b.average - a.average);

  return (
    <>
      <Card className="card-elegant border-0 mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-serif">Todos os objetivos</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Comparação de desempenho entre os {(snap.objectives ?? []).length} objetivos estratégicos.
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {rows.map(({ objective, average }) => (
          <Card
            key={objective.id}
            className="card-elegant border-0 cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => onSelectObjective(objective.id)}
          >
            <CardHeader className="pb-2">
              <div className="h-1 w-8 rounded-full mb-2" style={{ backgroundColor: perspColor.get(objective.perspectiveId) }} />
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide leading-tight min-h-8">
                {objective.name}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="kpi-number text-2xl font-bold" style={{ color: scoreColor(average) }}>
                {fmtScore(average)}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1 truncate">{perspName.get(objective.perspectiveId)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="card-elegant border-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide flex items-center justify-between gap-2 flex-wrap">
              <span>Score por objetivo</span>
              <PeriodModeBadge label={periodBadge} />
            </CardTitle>
          </CardHeader>
          <CardContent>
            {barData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Nenhum objetivo apurado no período.</p>
            ) : (
              <div style={{ height: Math.max(280, barData.length * 32) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barData} layout="vertical" margin={{ left: 30, right: 40, top: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="oklch(0.92 0.008 90)" />
                    <XAxis type="number" domain={[0, 120]} tickFormatter={(v) => `${v}%`} fontSize={12} />
                    <YAxis type="category" dataKey="name" width={150} fontSize={11} />
                    <Tooltip formatter={(v: number) => [`${v.toLocaleString("pt-BR")}%`, "Score"]} />
                    <ReferenceLine x={100} stroke="#15803d" strokeDasharray="4 4" />
                    <Bar dataKey="average" radius={[0, 6, 6, 0]} barSize={18}>
                      {barData.map((d, i) => (
                        <Cell key={i} fill={scoreColor(d.average / 100)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="card-elegant border-0">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Objetivos
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground text-xs uppercase tracking-wide">
                  <th className="text-left py-2 pr-2 font-medium">Objetivo</th>
                  <th className="text-left py-2 px-2 font-medium">Perspectiva</th>
                  <th className="text-center py-2 px-2 font-medium">Indicadores</th>
                  <th className="text-center py-2 pl-2 font-medium">Score</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ objective, average, indCount }) => (
                  <tr
                    key={objective.id}
                    className="border-b last:border-0 hover:bg-muted/30 transition-colors cursor-pointer"
                    onClick={() => onSelectObjective(objective.id)}
                  >
                    <td className="py-2 pr-2 font-medium">{objective.name}</td>
                    <td className="py-2 px-2 text-xs">
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="h-2 w-2 rounded-full shrink-0"
                          style={{ backgroundColor: perspColor.get(objective.perspectiveId) }}
                        />
                        <span className="text-muted-foreground">{perspName.get(objective.perspectiveId)}</span>
                      </span>
                    </td>
                    <td className="py-2 px-2 text-center kpi-number">{indCount}</td>
                    <td className="py-2 pl-2 text-center">
                      <ScoreBadge score={average} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
