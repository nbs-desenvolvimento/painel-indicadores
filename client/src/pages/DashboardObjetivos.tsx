import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { DashboardEmptyState, PageSkeleton, PageToolbar, ScoreBadge, ScoreGauge } from "@/components/shared";
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
import { MONTH_NAMES_SHORT, fmtValue, scoreColor, useApp } from "@/contexts/AppContext";
import { useAuth } from "@/hooks/useAuth";
import { useDashboardHistory, useDashboardSnapshot } from "@/lib/apiHooks";
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

export default function DashboardObjetivos() {
  const { companyId, year, month, periodLabel } = useApp();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [objectiveId, setObjectiveId] = useState<number | null>(null);

  const { data: snap, isLoading } = useDashboardSnapshot(
    { companyId: companyId ?? 0, year, month },
    { enabled: !!companyId },
  );

  const periods = useMemo(() => buildLast12Periods(year, month), [year, month]);
  const { data: history } = useDashboardHistory(
    { companyId: companyId ?? 0, periods },
    { enabled: !!companyId },
  );

  useEffect(() => {
    if (snap && snap.objectives.length > 0 && (objectiveId === null || !snap.objectives.some((o) => o.id === objectiveId))) {
      setObjectiveId(snap.objectives[0].id);
    }
  }, [snap, objectiveId]);

  if (isLoading || !companyId) return <PageSkeleton />;

  if (!snap || snap.objectives.length === 0) {
    return (
      <>
        <PageToolbar title="Dashboard por Objetivo" subtitle={periodLabel} />
        <DashboardEmptyState
          isAdmin={isAdmin}
          adminTitle="Nenhum objetivo cadastrado"
          adminDescription="Cadastre objetivos estratégicos para visualizar este dashboard."
        />
      </>
    );
  }

  const orderedPerspectives = [...snap.perspectives].sort((a, b) => a.sortOrder - b.sortOrder);
  const selected = snap.objectives.find((o) => o.id === objectiveId);
  const selectedPersp = snap.perspectives.find((p) => p.id === selected?.perspectiveId);

  const objIndicators = snap.indicators.filter((i) => i.objectiveId === objectiveId);
  const objIndicatorIds = new Set(objIndicators.map((i) => i.id));
  const objIndicatorScores = snap.indicatorScores.filter((i) => objIndicatorIds.has(i.indicatorId));
  const objectiveScore = snap.objectiveScores.find((o) => o.objectiveId === objectiveId);

  const applicableAreaIds = new Set(
    snap.applicability.filter((a) => a.applicable && objIndicatorIds.has(a.indicatorId)).map((a) => a.areaId),
  );
  const applicableAreas = snap.areas.filter((a) => applicableAreaIds.has(a.id));

  // Score do objetivo em cada área
  const areaData = snap.areaScores
    .map((a) => {
      const os = snap.objectiveScoresByArea.find((x) => x.areaId === a.areaId && x.objectiveId === objectiveId);
      return {
        name: a.areaName,
        average: os?.average !== null && os?.average !== undefined ? Math.round(os.average * 1000) / 10 : null,
      };
    })
    .filter((d) => d.average !== null)
    .sort((a, b) => (b.average ?? 0) - (a.average ?? 0));

  // Evolução do score do objetivo nos últimos 12 meses
  const histData =
    history?.periods.map((p) => {
      const os = p.objectiveScores.find((x) => x.objectiveId === objectiveId);
      return {
        label: `${MONTH_NAMES_SHORT[p.month - 1]}/${String(p.year).slice(2)}`,
        score: os?.average !== null && os?.average !== undefined ? Math.round(os.average * 1000) / 10 : null,
      };
    }) ?? [];

  return (
    <div className="fade-up">
      <PageToolbar title="Dashboard por Objetivo" subtitle={`Análise por objetivo estratégico — ${periodLabel}`} showExport>
        <Select value={objectiveId ? String(objectiveId) : undefined} onValueChange={(v) => setObjectiveId(parseInt(v))}>
          <SelectTrigger className="w-[280px] bg-card">
            <SelectValue placeholder="Selecione o objetivo" />
          </SelectTrigger>
          <SelectContent>
            {orderedPerspectives.map((p) => {
              const objs = snap.objectives.filter((o) => o.perspectiveId === p.id).sort((a, b) => a.sortOrder - b.sortOrder);
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

      {selected && (
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
                <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  Score do Objetivo
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
                    <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                      Indicadores do objetivo
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
                          const ind = snap.indicators.find((x) => x.id === i.indicatorId);
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
                    <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                      Score do objetivo por área
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
                      Evolução do Score (12 meses)
                    </CardTitle>
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
