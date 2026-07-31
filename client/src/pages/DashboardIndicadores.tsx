import { DashboardEmptyState, PageSkeleton, PageToolbar, ScoreBadge, ScoreGauge } from "@/components/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MONTH_NAMES_SHORT, fmtValue, scoreColor, useApp } from "@/contexts/AppContext";
import { useAuth } from "@/hooks/useAuth";
import { useDashboardHistory, useDashboardSnapshot } from "@/lib/apiHooks";
import type { DashboardHistory, DashboardSnapshot, Indicator } from "@/lib/apiTypes";
import { SCALE_TYPE_LABELS } from "@/lib/calcEngine";
import { averageScore } from "@/lib/indicatorGrouping";
import { buildLast12Periods } from "@/lib/periods";
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const ALL = "all";
const NO_OBJECTIVE = "none";

export default function DashboardIndicadores() {
  const { companyId, year, month, periodLabel } = useApp();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [initialized, setInitialized] = useState(false);
  const [perspectiveId, setPerspectiveId] = useState<number | typeof ALL>(ALL);
  const [objectiveFilter, setObjectiveFilter] = useState<number | typeof ALL | typeof NO_OBJECTIVE>(ALL);
  const [indicatorId, setIndicatorId] = useState<number | null>(null);

  const { data: snap, isLoading } = useDashboardSnapshot(
    { companyId: companyId ?? 0, year, month },
    { enabled: !!companyId },
  );

  const periods = useMemo(() => buildLast12Periods(year, month), [year, month]);
  const { data: history } = useDashboardHistory(
    { companyId: companyId ?? 0, periods },
    { enabled: !!companyId },
  );

  // Seleção inicial: primeiro indicador da lista, com o breadcrumb já sincronizado —
  // mesmo comportamento padrão de sempre, para não surpreender quem já usa a tela.
  useEffect(() => {
    if (!snap) return;
    if (!initialized) {
      if ((snap.indicators ?? []).length > 0) {
        const first = (snap.indicators ?? [])[0];
        setIndicatorId(first.id);
        setPerspectiveId(first.perspectiveId);
        setObjectiveFilter(first.objectiveId ?? NO_OBJECTIVE);
      }
      setInitialized(true);
      return;
    }
    // Empresa/período trocou e a seleção atual deixou de existir: recua um nível de cada vez.
    if (typeof perspectiveId === "number" && !(snap.perspectives ?? []).some((p) => p.id === perspectiveId)) {
      setPerspectiveId(ALL);
      setObjectiveFilter(ALL);
      setIndicatorId(null);
    } else if (typeof objectiveFilter === "number" && !(snap.objectives ?? []).some((o) => o.id === objectiveFilter)) {
      setObjectiveFilter(ALL);
      setIndicatorId(null);
    } else if (indicatorId !== null && !(snap.indicators ?? []).some((i) => i.id === indicatorId)) {
      setIndicatorId(null);
    }
  }, [snap, initialized, perspectiveId, objectiveFilter, indicatorId]);

  if (isLoading || !companyId) return <PageSkeleton />;

  if (!snap || (snap.indicators ?? []).length === 0) {
    return (
      <>
        <PageToolbar title="Dashboard por Indicadores" subtitle={periodLabel} />
        <DashboardEmptyState
          isAdmin={isAdmin}
          adminTitle="Nenhum indicador cadastrado"
          adminDescription="Cadastre indicadores para visualizar este dashboard."
        />
      </>
    );
  }

  const indicatorsInPerspective =
    perspectiveId === ALL ? (snap.indicators ?? []) : (snap.indicators ?? []).filter((i) => i.perspectiveId === perspectiveId);
  const objectivesInPerspective =
    perspectiveId === ALL ? (snap.objectives ?? []) : (snap.objectives ?? []).filter((o) => o.perspectiveId === perspectiveId);
  const hasUnassignedInScope = indicatorsInPerspective.some((i) => i.objectiveId === null);
  const indicatorsInScope =
    objectiveFilter === ALL
      ? indicatorsInPerspective
      : objectiveFilter === NO_OBJECTIVE
        ? indicatorsInPerspective.filter((i) => i.objectiveId === null)
        : indicatorsInPerspective.filter((i) => i.objectiveId === objectiveFilter);

  const selectIndicator = (id: number) => {
    const ind = (snap.indicators ?? []).find((i) => i.id === id);
    setIndicatorId(id);
    if (ind) {
      setPerspectiveId(ind.perspectiveId);
      setObjectiveFilter(ind.objectiveId ?? NO_OBJECTIVE);
    }
  };

  const scope = scopeHeader(snap, perspectiveId, objectiveFilter);
  const selected = indicatorId !== null ? (snap.indicators ?? []).find((i) => i.id === indicatorId) : undefined;

  return (
    <div className="fade-up">
      <PageToolbar title="Dashboard por Indicadores" subtitle={`Análise por indicador — ${periodLabel}`} showExport>
        <Select
          value={perspectiveId === ALL ? ALL : String(perspectiveId)}
          onValueChange={(v) => {
            if (v === ALL) {
              setPerspectiveId(ALL);
            } else {
              setPerspectiveId(parseInt(v));
            }
            setObjectiveFilter(ALL);
            setIndicatorId(null);
          }}
        >
          <SelectTrigger className="w-[200px] bg-card">
            <SelectValue placeholder="Perspectiva" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas as perspectivas</SelectItem>
            {(snap.perspectives ?? []).map((p) => (
              <SelectItem key={p.id} value={String(p.id)}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={objectiveFilter === ALL ? ALL : objectiveFilter === NO_OBJECTIVE ? NO_OBJECTIVE : String(objectiveFilter)}
          onValueChange={(v) => {
            if (v === ALL) setObjectiveFilter(ALL);
            else if (v === NO_OBJECTIVE) setObjectiveFilter(NO_OBJECTIVE);
            else setObjectiveFilter(parseInt(v));
            setIndicatorId(null);
          }}
        >
          <SelectTrigger className="w-[200px] bg-card">
            <SelectValue placeholder="Objetivo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os objetivos</SelectItem>
            {objectivesInPerspective.map((o) => (
              <SelectItem key={o.id} value={String(o.id)}>
                {o.name}
              </SelectItem>
            ))}
            {hasUnassignedInScope && <SelectItem value={NO_OBJECTIVE}>Sem objetivo vinculado</SelectItem>}
          </SelectContent>
        </Select>

        <Select value={indicatorId ? String(indicatorId) : ALL} onValueChange={(v) => (v === ALL ? setIndicatorId(null) : selectIndicator(parseInt(v)))}>
          <SelectTrigger className="w-[260px] bg-card">
            <SelectValue placeholder="Indicador" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os indicadores (visão agrupada)</SelectItem>
            {indicatorsInScope.map((i) => (
              <SelectItem key={i.id} value={String(i.id)}>
                {i.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </PageToolbar>

      {selected ? (
        <SingleIndicatorView selected={selected} snap={snap} history={history} />
      ) : (
        <IndicatorGroupView
          snap={snap}
          history={history}
          indicators={indicatorsInScope}
          scopeTitle={scope.title}
          scopeColor={scope.color}
          onSelectIndicator={selectIndicator}
        />
      )}
    </div>
  );
}

function scopeHeader(
  snap: DashboardSnapshot,
  perspectiveId: number | typeof ALL,
  objectiveFilter: number | typeof ALL | typeof NO_OBJECTIVE,
): { title: string; color: string } {
  if (objectiveFilter === NO_OBJECTIVE) {
    const p = perspectiveId !== ALL ? (snap.perspectives ?? []).find((x) => x.id === perspectiveId) : undefined;
    return {
      title: p ? `Sem objetivo vinculado — ${p.name}` : "Sem objetivo vinculado",
      color: p?.color || "#1e3a5f",
    };
  }
  if (objectiveFilter !== ALL) {
    const o = (snap.objectives ?? []).find((x) => x.id === objectiveFilter);
    const p = (snap.perspectives ?? []).find((x) => x.id === o?.perspectiveId);
    return { title: o ? `Objetivo: ${o.name}` : "Objetivo", color: p?.color || "#1e3a5f" };
  }
  if (perspectiveId !== ALL) {
    const p = (snap.perspectives ?? []).find((x) => x.id === perspectiveId);
    return { title: p ? `Perspectiva: ${p.name}` : "Perspectiva", color: p?.color || "#1e3a5f" };
  }
  return { title: "Todos os indicadores", color: "#1e3a5f" };
}

function SingleIndicatorView({
  selected,
  snap,
  history,
}: {
  selected: Indicator;
  snap: DashboardSnapshot;
  history: DashboardHistory | undefined;
}) {
  const score = (snap.indicatorScores ?? []).find((i) => i.indicatorId === selected.id);
  const persp = (snap.perspectives ?? []).find((p) => p.id === selected.perspectiveId);

  const histData = (history?.periods ?? []).map((p) => {
    const ind = (p.indicatorScores ?? []).find((i) => i.indicatorId === selected.id);
    return {
      label: `${MONTH_NAMES_SHORT[p.month - 1]}/${String(p.year).slice(2)}`,
      meta: ind?.goal ?? null,
      resultado: ind?.result ?? null,
      score: ind?.score !== null && ind?.score !== undefined ? Math.round(ind.score * 1000) / 10 : null,
    };
  });

  const isPercent = selected.unit === "percent";
  const valFmt = (v: number) =>
    isPercent ? `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : v.toLocaleString("pt-BR");

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6">
        <Card className="card-elegant border-0 lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="h-1 w-10 rounded-full mb-2" style={{ backgroundColor: persp?.color || "#1e3a5f" }} />
            <CardTitle className="text-lg font-serif">{selected.name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="text-muted-foreground leading-relaxed">{selected.description || "Sem descrição."}</p>
            <div className="flex flex-wrap gap-x-6 gap-y-1 pt-2 text-xs text-muted-foreground">
              <span>
                Perspectiva: <strong className="text-foreground">{persp?.name}</strong>
              </span>
              <span>
                Escala: <strong className="text-foreground">{SCALE_TYPE_LABELS[selected.scaleType as keyof typeof SCALE_TYPE_LABELS]}</strong>
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="card-elegant border-0">
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Meta × Resultado
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-muted-foreground">Meta do período</p>
                <p className="kpi-number text-xl font-bold">{fmtValue(score?.goal, selected.unit)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Resultado do período</p>
                <p className="kpi-number text-xl font-bold">{fmtValue(score?.result, selected.unit)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="card-elegant border-0">
          <CardHeader className="pb-0">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Score
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center pt-1 pb-4">
            <ScoreGauge score={score?.score ?? null} size={160} />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="card-elegant border-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Evolução Meta × Resultado (12 meses)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={histData} margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.008 90)" />
                  <XAxis dataKey="label" fontSize={11} />
                  <YAxis fontSize={11} tickFormatter={(v) => (isPercent ? `${Math.round(v * 100)}%` : v.toLocaleString("pt-BR", { notation: "compact" }))} />
                  <Tooltip formatter={(v: number, name: string) => [valFmt(v), name === "meta" ? "Meta" : "Resultado"]} />
                  <Legend formatter={(v) => (v === "meta" ? "Meta" : "Resultado")} />
                  <Line type="monotone" dataKey="meta" stroke="#94a3b8" strokeWidth={2} strokeDasharray="6 4" dot={{ r: 3 }} connectNulls />
                  <Line type="monotone" dataKey="resultado" stroke="#1e3a5f" strokeWidth={2.5} dot={{ r: 4 }} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="card-elegant border-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Evolução do Score (12 meses)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={histData} margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.008 90)" />
                  <XAxis dataKey="label" fontSize={11} />
                  <YAxis domain={[0, 120]} fontSize={11} tickFormatter={(v) => `${v}%`} />
                  <Tooltip formatter={(v: number) => [`${v.toLocaleString("pt-BR")}%`, "Score"]} />
                  <ReferenceLine y={100} stroke="#15803d" strokeDasharray="4 4" />
                  <Bar dataKey="score" radius={[4, 4, 0, 0]} barSize={18}>
                    {histData.map((d, i) => (
                      <Cell key={i} fill={scoreColor(d.score !== null ? d.score / 100 : null)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Áreas onde o indicador se aplica */}
      <Card className="card-elegant border-0 mt-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Áreas onde este indicador é aplicável
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {(snap.areas ?? [])
              .filter((a) =>
                (snap.applicability ?? []).some((x) => x.indicatorId === selected.id && x.areaId === a.id && x.applicable),
              )
              .map((a) => (
                <span key={a.id} className="inline-flex items-center rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
                  {a.name}
                </span>
              ))}
          </div>
          <div className="mt-3">
            <ScoreBadge score={score?.score ?? null} className="text-sm px-3 py-1" />
            <span className="text-xs text-muted-foreground ml-2">score único do indicador no período (aplicado a todas as áreas)</span>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

function IndicatorGroupView({
  snap,
  history,
  indicators,
  scopeTitle,
  scopeColor,
  onSelectIndicator,
}: {
  snap: DashboardSnapshot;
  history: DashboardHistory | undefined;
  indicators: Indicator[];
  scopeTitle: string;
  scopeColor: string;
  onSelectIndicator: (id: number) => void;
}) {
  const perspName = new Map((snap.perspectives ?? []).map((p) => [p.id, p.name]));
  const objName = new Map((snap.objectives ?? []).map((o) => [o.id, o.name]));
  const indIds = new Set(indicators.map((i) => i.id));
  const scores = (snap.indicatorScores ?? []).filter((s) => indIds.has(s.indicatorId));
  const groupAverage = averageScore(scores.map((s) => s.score));

  const applicableAreaIds = new Set(
    (snap.applicability ?? []).filter((a) => a.applicable && indIds.has(a.indicatorId)).map((a) => a.areaId),
  );
  const applicableAreas = (snap.areas ?? []).filter((a) => applicableAreaIds.has(a.id));

  const barData = scores
    .filter((s) => s.score !== null)
    .map((s) => ({ name: s.name, score: Math.round((s.score ?? 0) * 1000) / 10 }))
    .sort((a, b) => b.score - a.score);

  const histData = (history?.periods ?? []).map((p) => {
    const periodScores = (p.indicatorScores ?? []).filter((s) => indIds.has(s.indicatorId));
    const avg = averageScore(periodScores.map((s) => s.score));
    return {
      label: `${MONTH_NAMES_SHORT[p.month - 1]}/${String(p.year).slice(2)}`,
      score: avg !== null ? Math.round(avg * 1000) / 10 : null,
    };
  });

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6">
        <Card className="card-elegant border-0 lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="h-1 w-10 rounded-full mb-2" style={{ backgroundColor: scopeColor }} />
            <CardTitle className="text-lg font-serif">{scopeTitle}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {indicators.length} indicador{indicators.length === 1 ? "" : "es"} neste escopo.
          </CardContent>
        </Card>

        <Card className="card-elegant border-0 lg:col-span-2">
          <CardHeader className="pb-0">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Score médio do grupo
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center pt-1 pb-4">
            <ScoreGauge score={groupAverage} size={160} label="Média dos indicadores do escopo" />
          </CardContent>
        </Card>
      </div>

      {indicators.length === 0 ? (
        <Card className="card-elegant border-0">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nenhum indicador neste escopo.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            <Card className="card-elegant border-0">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  Indicadores
                </CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground text-xs uppercase tracking-wide">
                      <th className="text-left py-2 pr-2 font-medium">Indicador</th>
                      <th className="text-left py-2 px-2 font-medium">Perspectiva</th>
                      <th className="text-left py-2 px-2 font-medium">Objetivo</th>
                      <th className="text-right py-2 px-2 font-medium">Meta</th>
                      <th className="text-right py-2 px-2 font-medium">Resultado</th>
                      <th className="text-center py-2 pl-2 font-medium">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {indicators.map((ind) => {
                      const s = (snap.indicatorScores ?? []).find((x) => x.indicatorId === ind.id);
                      return (
                        <tr
                          key={ind.id}
                          className="border-b last:border-0 hover:bg-muted/30 transition-colors cursor-pointer"
                          onClick={() => onSelectIndicator(ind.id)}
                        >
                          <td className="py-2 pr-2 font-medium">{ind.name}</td>
                          <td className="py-2 px-2 text-xs text-muted-foreground">{perspName.get(ind.perspectiveId)}</td>
                          <td className="py-2 px-2 text-xs">
                            {ind.objectiveId ? (
                              objName.get(ind.objectiveId)
                            ) : (
                              <span className="text-muted-foreground italic">Sem objetivo</span>
                            )}
                          </td>
                          <td className="py-2 px-2 text-right kpi-number">{fmtValue(s?.goal, ind.unit)}</td>
                          <td className="py-2 px-2 text-right kpi-number">{fmtValue(s?.result, ind.unit)}</td>
                          <td className="py-2 pl-2 text-center">
                            <ScoreBadge score={s?.score ?? null} />
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
                  Score por indicador
                </CardTitle>
              </CardHeader>
              <CardContent>
                {barData.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    Nenhum indicador apurado no período.
                  </p>
                ) : (
                  <div style={{ height: Math.max(280, barData.length * 30) }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={barData} layout="vertical" margin={{ left: 30, right: 40, top: 8, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="oklch(0.92 0.008 90)" />
                        <XAxis type="number" domain={[0, 120]} tickFormatter={(v) => `${v}%`} fontSize={12} />
                        <YAxis type="category" dataKey="name" width={150} fontSize={11} />
                        <Tooltip formatter={(v: number) => [`${v.toLocaleString("pt-BR")}%`, "Score"]} />
                        <ReferenceLine x={100} stroke="#15803d" strokeDasharray="4 4" />
                        <Bar dataKey="score" radius={[0, 6, 6, 0]} barSize={16}>
                          {barData.map((d, i) => (
                            <Cell key={i} fill={scoreColor(d.score / 100)} />
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
                  Evolução do Score médio do grupo (12 meses)
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
                  Áreas onde os indicadores deste escopo se aplicam
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
  );
}
