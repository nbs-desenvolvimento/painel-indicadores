import { EmptyState, PageSkeleton, PageToolbar, ScoreBadge, ScoreGauge } from "@/components/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtScore, scoreColor, useApp } from "@/contexts/AppContext";
import { useDashboardSnapshot } from "@/lib/apiHooks";
import { Trophy } from "lucide-react";
import { Link } from "wouter";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export default function Home() {
  const { companyId, year, month, periodLabel } = useApp();
  const { data: snap, isLoading } = useDashboardSnapshot(
    { companyId: companyId ?? 0, year, month },
    { enabled: !!companyId },
  );

  if (isLoading || !companyId) {
    return <PageSkeleton />;
  }

  if (!snap || snap.areas.length === 0) {
    return (
      <>
        <PageToolbar title="Visão Geral" subtitle={periodLabel} />
        <EmptyState
          title="Nenhuma área cadastrada"
          description="Cadastre áreas, perspectivas e indicadores para começar a acompanhar o desempenho."
        />
      </>
    );
  }

  const ranked = [...snap.areaScores].sort((a, b) => b.total - a.total);
  const groupArea = snap.areaScores.find((a) => a.areaName.toUpperCase().includes("GRUPO")) ?? ranked[0];
  const chartData = ranked.map((a) => ({
    name: a.areaName,
    total: Math.round(a.total * 1000) / 10,
  }));

  const perspName = new Map(snap.perspectives.map((p) => [p.id, p.name]));
  const perspColor = new Map(snap.perspectives.map((p) => [p.id, p.color || "#1e3a5f"]));

  const withData = snap.indicatorScores.filter((i) => i.score !== null).length;

  return (
    <div className="fade-up">
      <PageToolbar title="Visão Geral" subtitle={`Desempenho consolidado — ${periodLabel}`} showExport />

      {/* Linha de destaque: gauge do grupo + perspectivas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <Card className="card-elegant border-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              {groupArea?.areaName ?? "Desempenho"}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center pb-6">
            <ScoreGauge score={groupArea?.total ?? null} size={220} label="Desempenho total do período" />
          </CardContent>
        </Card>

        <Card className="card-elegant border-0 lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Desempenho por Perspectiva — {groupArea?.areaName}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {groupArea?.perspectives.map((p) => (
                <div key={p.perspectiveId} className="flex flex-col items-center rounded-lg bg-muted/40 p-4">
                  <div
                    className="h-1.5 w-10 rounded-full mb-3"
                    style={{ backgroundColor: perspColor.get(p.perspectiveId) }}
                  />
                  <span className="text-xs text-muted-foreground text-center leading-tight mb-2 min-h-8">
                    {perspName.get(p.perspectiveId)}
                  </span>
                  <span className="kpi-number text-xl font-bold" style={{ color: scoreColor(p.average) }}>
                    {fmtScore(p.weighted)}
                  </span>
                  <span className="text-[11px] text-muted-foreground mt-1">
                    média {fmtScore(p.average)} × peso {fmtScore(p.weight)}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-4">
              {withData} de {snap.indicatorScores.length} indicadores com meta e resultado lançados no período.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Gráfico de barras: desempenho por área */}
      <Card className="card-elegant border-0 mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Desempenho Total por Área
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div style={{ height: Math.max(320, chartData.length * 32) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ left: 40, right: 40, top: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="oklch(0.92 0.008 90)" />
                <XAxis type="number" domain={[0, 120]} tickFormatter={(v) => `${v}%`} fontSize={12} />
                <YAxis type="category" dataKey="name" width={160} fontSize={12} />
                <Tooltip formatter={(v: number) => [`${v.toLocaleString("pt-BR")}%`, "Desempenho"]} />
                <ReferenceLine x={100} stroke="#15803d" strokeDasharray="4 4" />
                <Bar dataKey="total" radius={[0, 6, 6, 0]} barSize={18}>
                  {chartData.map((d, i) => (
                    <Cell key={i} fill={scoreColor(d.total / 100)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Top áreas + tabela resumida */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="card-elegant border-0">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
              <Trophy className="h-4 w-4 text-accent" /> Top 5 Áreas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {ranked.slice(0, 5).map((a, i) => (
              <div key={a.areaId} className="flex items-center gap-3">
                <span className="kpi-number w-6 text-sm font-semibold text-muted-foreground">{i + 1}º</span>
                <span className="flex-1 text-sm truncate">{a.areaName}</span>
                <ScoreBadge score={a.total} />
              </div>
            ))}
            <Link
              href="/dashboard/ranking"
              className="block text-xs text-primary hover:underline pt-1"
            >
              Ver ranking completo →
            </Link>
          </CardContent>
        </Card>

        <Card className="card-elegant border-0 lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Resumo por Área e Perspectiva
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground text-xs uppercase tracking-wide">
                  <th className="text-left py-2 pr-2 font-medium">Área</th>
                  {snap.perspectives.map((p) => (
                    <th key={p.id} className="text-center py-2 px-2 font-medium">
                      {p.name.split(" ")[0]}
                    </th>
                  ))}
                  <th className="text-center py-2 pl-2 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((a) => (
                  <tr key={a.areaId} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="py-2 pr-2">
                      <Link
                        href={`/dashboard/areas?area=${a.areaId}`}
                        className="hover:text-primary hover:underline"
                      >
                        {a.areaName}
                      </Link>
                    </td>
                    {a.perspectives.map((p) => (
                      <td key={p.perspectiveId} className="text-center py-2 px-2 kpi-number">
                        {fmtScore(p.weighted)}
                      </td>
                    ))}
                    <td className="text-center py-2 pl-2">
                      <ScoreBadge score={a.total} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
