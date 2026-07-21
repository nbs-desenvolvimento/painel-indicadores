import { EmptyState, PageSkeleton, PageToolbar } from "@/components/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MONTH_NAMES_SHORT, useApp } from "@/contexts/AppContext";
import { trpc } from "@/lib/trpc";
import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const LINE_COLORS = [
  "#1e3a5f", "#c9a227", "#0891b2", "#7c3aed", "#dc2626", "#15803d",
  "#ea580c", "#db2777", "#4f46e5", "#0d9488", "#a16207", "#64748b",
  "#84cc16", "#06b6d4", "#f43f5e", "#8b5cf6", "#10b981", "#f59e0b",
];

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

type Mode = "areas" | "perspectivas" | "indicadores";

export default function Evolucao() {
  const { companyId, year, month, periodLabel } = useApp();
  const [mode, setMode] = useState<Mode>("areas");
  const [selectedIds, setSelectedIds] = useState<Record<Mode, string>>({
    areas: "all",
    perspectivas: "all",
    indicadores: "",
  });

  const periods = useMemo(() => buildLast12Periods(year, month), [year, month]);
  const { data: history, isLoading } = trpc.dashboard.history.useQuery(
    { companyId: companyId ?? 0, periods },
    { enabled: !!companyId },
  );

  if (isLoading || !companyId) return <PageSkeleton />;

  if (!history || history.areas.length === 0) {
    return (
      <>
        <PageToolbar title="Evolução Mensal" subtitle={periodLabel} />
        <EmptyState title="Sem dados para exibir" description="Cadastre áreas e lance resultados para acompanhar a evolução." />
      </>
    );
  }

  const labels = history.periods.map((p) => `${MONTH_NAMES_SHORT[p.month - 1]}/${String(p.year).slice(2)}`);

  /* ---- séries por modo ---- */
  let series: { key: string; name: string }[] = [];
  let chartData: Record<string, unknown>[] = [];

  if (mode === "areas") {
    const filter = selectedIds.areas;
    const shown = filter === "all" ? history.areas : history.areas.filter((a) => String(a.id) === filter);
    series = shown.map((a) => ({ key: `a${a.id}`, name: a.name }));
    chartData = history.periods.map((p, idx) => {
      const row: Record<string, unknown> = { label: labels[idx] };
      for (const a of shown) {
        const s = p.areaScores.find((x) => x.areaId === a.id);
        row[`a${a.id}`] = s && s.total > 0 ? Math.round(s.total * 1000) / 10 : s?.total === 0 ? 0 : null;
      }
      return row;
    });
  } else if (mode === "perspectivas") {
    // média da perspectiva no "GRUPO" (primeira área) ou média geral das áreas
    const filter = selectedIds.perspectivas;
    const shown = filter === "all" ? history.perspectives : history.perspectives.filter((p) => String(p.id) === filter);
    series = shown.map((p) => ({ key: `p${p.id}`, name: p.name }));
    chartData = history.periods.map((p, idx) => {
      const row: Record<string, unknown> = { label: labels[idx] };
      for (const persp of shown) {
        // média da perspectiva entre todas as áreas (média das médias não-nulas)
        const vals = p.areaScores
          .map((a) => a.perspectives.find((x) => x.perspectiveId === persp.id)?.average)
          .filter((v): v is number => v !== null && v !== undefined);
        row[`p${persp.id}`] = vals.length > 0 ? Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 1000) / 10 : null;
      }
      return row;
    });
  } else {
    const filter = selectedIds.indicadores || String(history.indicators[0]?.id ?? "");
    const shown = history.indicators.filter((i) => String(i.id) === filter);
    series = shown.map((i) => ({ key: `i${i.id}`, name: i.name }));
    chartData = history.periods.map((p, idx) => {
      const row: Record<string, unknown> = { label: labels[idx] };
      for (const ind of shown) {
        const s = p.indicatorScores.find((x) => x.indicatorId === ind.id);
        row[`i${ind.id}`] = s?.score !== null && s?.score !== undefined ? Math.round(s.score * 1000) / 10 : null;
      }
      return row;
    });
  }

  const selectorOptions =
    mode === "areas"
      ? [{ id: "all", name: "Todas as áreas" }, ...history.areas.map((a) => ({ id: String(a.id), name: a.name }))]
      : mode === "perspectivas"
        ? [{ id: "all", name: "Todas as perspectivas" }, ...history.perspectives.map((p) => ({ id: String(p.id), name: p.name }))]
        : history.indicators.map((i) => ({ id: String(i.id), name: i.name }));

  const currentSelection =
    mode === "indicadores"
      ? selectedIds.indicadores || String(history.indicators[0]?.id ?? "")
      : selectedIds[mode];

  return (
    <div className="fade-up">
      <PageToolbar title="Evolução Mensal" subtitle={`Últimos 12 meses até ${periodLabel}`} showExport />

      <Card className="card-elegant border-0">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Evolução do desempenho
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
                <TabsList>
                  <TabsTrigger value="areas">Áreas</TabsTrigger>
                  <TabsTrigger value="perspectivas">Perspectivas</TabsTrigger>
                  <TabsTrigger value="indicadores">Indicadores</TabsTrigger>
                </TabsList>
              </Tabs>
              <Select
                value={currentSelection}
                onValueChange={(v) => setSelectedIds((prev) => ({ ...prev, [mode]: v }))}
              >
                <SelectTrigger className="w-[220px] bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {selectorOptions.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[460px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ left: 8, right: 24, top: 16, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.008 90)" />
                <XAxis dataKey="label" fontSize={12} />
                <YAxis domain={[0, 130]} fontSize={12} tickFormatter={(v) => `${v}%`} />
                <Tooltip formatter={(v: number, name: string) => [`${v.toLocaleString("pt-BR")}%`, name]} />
                <ReferenceLine y={100} stroke="#15803d" strokeDasharray="4 4" />
                {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
                {series.map((s, i) => (
                  <Line
                    key={s.key}
                    type="monotone"
                    dataKey={s.key}
                    name={s.name}
                    stroke={LINE_COLORS[i % LINE_COLORS.length]}
                    strokeWidth={2.2}
                    dot={{ r: 3 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            {mode === "areas" && "Desempenho total de cada área (soma das perspectivas ponderadas)."}
            {mode === "perspectivas" && "Média dos scores da perspectiva entre todas as áreas em que se aplica."}
            {mode === "indicadores" && "Score mensal do indicador conforme a escala de degraus configurada."}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
