import { EmptyState, PageSkeleton, PageToolbar, ScoreBadge, ScoreGauge } from "@/components/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MONTH_NAMES_SHORT, fmtValue, useApp } from "@/contexts/AppContext";
import { trpc } from "@/lib/trpc";
import { SCALE_TYPE_LABELS } from "@shared/calcEngine";
import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

function buildLast12Periods(year: number, month: number) {
  const periods: { year: number; month: number }[] = [];
  let y = year;
  let m = month;
  for (let i = 0; i < 12; i++) {
    periods.unshift({ year: y, month: m });
    m--;
    if (m === 0) {
      m = 12;
      y--;
    }
  }
  return periods;
}

export default function DashboardIndicadores() {
  const { companyId, year, month, periodLabel } = useApp();
  const [indicatorId, setIndicatorId] = useState<number | null>(null);

  const { data: snap, isLoading } = trpc.dashboard.snapshot.useQuery(
    { companyId: companyId ?? 0, year, month },
    { enabled: !!companyId },
  );

  const periods = useMemo(() => buildLast12Periods(year, month), [year, month]);
  const { data: history } = trpc.dashboard.history.useQuery(
    { companyId: companyId ?? 0, periods },
    { enabled: !!companyId },
  );

  useEffect(() => {
    if (snap && snap.indicators.length > 0 && (indicatorId === null || !snap.indicators.some((i) => i.id === indicatorId))) {
      setIndicatorId(snap.indicators[0].id);
    }
  }, [snap, indicatorId]);

  if (isLoading || !companyId) return <PageSkeleton />;

  if (!snap || snap.indicators.length === 0) {
    return (
      <>
        <PageToolbar title="Dashboard por Indicador" subtitle={periodLabel} />
        <EmptyState title="Nenhum indicador cadastrado" description="Cadastre indicadores para visualizar este dashboard." />
      </>
    );
  }

  const selected = snap.indicators.find((i) => i.id === indicatorId);
  const score = snap.indicatorScores.find((i) => i.indicatorId === indicatorId);
  const persp = snap.perspectives.find((p) => p.id === selected?.perspectiveId);

  const histData =
    history?.periods.map((p) => {
      const ind = p.indicatorScores.find((i) => i.indicatorId === indicatorId);
      return {
        label: `${MONTH_NAMES_SHORT[p.month - 1]}/${String(p.year).slice(2)}`,
        meta: ind?.goal ?? null,
        resultado: ind?.result ?? null,
        score: ind?.score !== null && ind?.score !== undefined ? Math.round(ind.score * 1000) / 10 : null,
      };
    }) ?? [];

  const isPercent = selected?.unit === "percent";
  const valFmt = (v: number) =>
    isPercent ? `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : v.toLocaleString("pt-BR");

  return (
    <div className="fade-up">
      <PageToolbar title="Dashboard por Indicador" subtitle={`Análise individual — ${periodLabel}`} showExport>
        <Select value={indicatorId ? String(indicatorId) : undefined} onValueChange={(v) => setIndicatorId(parseInt(v))}>
          <SelectTrigger className="w-[260px] bg-card">
            <SelectValue placeholder="Selecione o indicador" />
          </SelectTrigger>
          <SelectContent>
            {snap.indicators.map((i) => (
              <SelectItem key={i.id} value={String(i.id)}>
                {i.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </PageToolbar>

      {selected && (
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
                    <LineChart data={histData} margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.008 90)" />
                      <XAxis dataKey="label" fontSize={11} />
                      <YAxis domain={[0, 120]} fontSize={11} tickFormatter={(v) => `${v}%`} />
                      <Tooltip formatter={(v: number) => [`${v.toLocaleString("pt-BR")}%`, "Score"]} />
                      <Line type="monotone" dataKey="score" stroke="#c9a227" strokeWidth={2.5} dot={{ r: 4 }} connectNulls />
                    </LineChart>
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
                {snap.areas
                  .filter((a) =>
                    snap.applicability.some((x) => x.indicatorId === indicatorId && x.areaId === a.id && x.applicable),
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
      )}
    </div>
  );
}
