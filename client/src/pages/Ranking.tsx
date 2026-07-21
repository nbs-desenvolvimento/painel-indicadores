import { EmptyState, PageSkeleton, PageToolbar, ScoreBadge } from "@/components/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtScore, scoreColor, useApp } from "@/contexts/AppContext";
import { trpc } from "@/lib/trpc";
import { Medal, Trophy } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export default function Ranking() {
  const { companyId, year, month, periodLabel } = useApp();
  const { data: snap, isLoading } = trpc.dashboard.snapshot.useQuery(
    { companyId: companyId ?? 0, year, month },
    { enabled: !!companyId },
  );

  if (isLoading || !companyId) return <PageSkeleton />;

  if (!snap || snap.areaScores.length === 0) {
    return (
      <>
        <PageToolbar title="Ranking de Áreas" subtitle={periodLabel} />
        <EmptyState title="Sem dados para exibir" description="Cadastre áreas e lance resultados para gerar o ranking." />
      </>
    );
  }

  const ranked = [...snap.areaScores].sort((a, b) => b.total - a.total);
  const podium = ranked.slice(0, 3);
  const chartData = ranked.map((a) => ({ name: a.areaName, total: Math.round(a.total * 1000) / 10 }));
  const medalColors = ["#c9a227", "#94a3b8", "#b45309"];

  return (
    <div className="fade-up">
      <PageToolbar title="Ranking de Áreas" subtitle={`Classificação por desempenho total — ${periodLabel}`} showExport />

      {/* Pódio */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {podium.map((a, i) => (
          <Card key={a.areaId} className={`card-elegant border-0 ${i === 0 ? "ring-2 ring-accent/60" : ""}`}>
            <CardContent className="flex items-center gap-4 py-5">
              <div
                className="h-12 w-12 rounded-full flex items-center justify-center shrink-0"
                style={{ backgroundColor: `${medalColors[i]}22` }}
              >
                {i === 0 ? (
                  <Trophy className="h-6 w-6" style={{ color: medalColors[i] }} />
                ) : (
                  <Medal className="h-6 w-6" style={{ color: medalColors[i] }} />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">{i + 1}º lugar</p>
                <p className="font-medium truncate">{a.areaName}</p>
                <p className="kpi-number text-2xl font-bold" style={{ color: scoreColor(a.total) }}>
                  {fmtScore(a.total)}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Gráfico */}
        <Card className="card-elegant border-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Desempenho por área
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div style={{ height: Math.max(340, chartData.length * 30) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ left: 30, right: 56, top: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="oklch(0.92 0.008 90)" />
                  <XAxis type="number" domain={[0, 120]} tickFormatter={(v) => `${v}%`} fontSize={12} />
                  <YAxis type="category" dataKey="name" width={150} fontSize={11} />
                  <Tooltip formatter={(v: number) => [`${v.toLocaleString("pt-BR")}%`, "Desempenho"]} />
                  <ReferenceLine x={100} stroke="#15803d" strokeDasharray="4 4" />
                  <Bar dataKey="total" radius={[0, 6, 6, 0]} barSize={16}>
                    <LabelList
                      dataKey="total"
                      position="right"
                      formatter={(v: number) => `${v.toLocaleString("pt-BR")}%`}
                      fontSize={11}
                    />
                    {chartData.map((d, i) => (
                      <Cell key={i} fill={scoreColor(d.total / 100)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Tabela completa */}
        <Card className="card-elegant border-0">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Classificação completa
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground text-xs uppercase tracking-wide">
                  <th className="text-left py-2 pr-2 font-medium w-12">Pos.</th>
                  <th className="text-left py-2 px-2 font-medium">Área</th>
                  {snap.perspectives.map((p) => (
                    <th key={p.id} className="text-center py-2 px-2 font-medium hidden xl:table-cell">
                      {p.name.split(" ")[0]}
                    </th>
                  ))}
                  <th className="text-center py-2 pl-2 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((a, i) => (
                  <tr key={a.areaId} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="py-2 pr-2 kpi-number font-semibold text-muted-foreground">{i + 1}º</td>
                    <td className="py-2 px-2 font-medium">{a.areaName}</td>
                    {a.perspectives.map((p) => (
                      <td key={p.perspectiveId} className="text-center py-2 px-2 kpi-number hidden xl:table-cell">
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
