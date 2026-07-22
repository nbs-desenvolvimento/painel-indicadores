import { EmptyState, PageSkeleton, PageToolbar, ScoreBadge } from "@/components/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fmtScore, fmtValue, scoreColor, useApp } from "@/contexts/AppContext";
import { useDashboardSnapshot } from "@/lib/apiHooks";
import { useEffect, useState } from "react";
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

export default function DashboardPerspectivas() {
  const { companyId, year, month, periodLabel } = useApp();
  const [perspectiveId, setPerspectiveId] = useState<number | null>(null);

  const { data: snap, isLoading } = useDashboardSnapshot(
    { companyId: companyId ?? 0, year, month },
    { enabled: !!companyId },
  );

  useEffect(() => {
    if (snap && snap.perspectives.length > 0 && (perspectiveId === null || !snap.perspectives.some((p) => p.id === perspectiveId))) {
      setPerspectiveId(snap.perspectives[0].id);
    }
  }, [snap, perspectiveId]);

  if (isLoading || !companyId) return <PageSkeleton />;

  if (!snap || snap.perspectives.length === 0) {
    return (
      <>
        <PageToolbar title="Dashboard por Perspectiva" subtitle={periodLabel} />
        <EmptyState title="Nenhuma perspectiva cadastrada" description="Cadastre perspectivas para visualizar este dashboard." />
      </>
    );
  }

  const selected = snap.perspectives.find((p) => p.id === perspectiveId);
  const perspInds = snap.indicatorScores.filter((i) => i.perspectiveId === perspectiveId);

  // Desempenho da perspectiva em cada área (média × peso)
  const areaData = snap.areaScores
    .map((a) => {
      const p = a.perspectives.find((x) => x.perspectiveId === perspectiveId);
      return {
        name: a.areaName,
        average: p?.average !== null && p?.average !== undefined ? Math.round(p.average * 1000) / 10 : null,
        weighted: p ? Math.round(p.weighted * 1000) / 10 : 0,
        weight: p?.weight ?? 0,
      };
    })
    .filter((d) => d.average !== null)
    .sort((a, b) => (b.average ?? 0) - (a.average ?? 0));

  return (
    <div className="fade-up">
      <PageToolbar title="Dashboard por Perspectiva" subtitle={`Análise por perspectiva estratégica — ${periodLabel}`} showExport>
        <Select value={perspectiveId ? String(perspectiveId) : undefined} onValueChange={(v) => setPerspectiveId(parseInt(v))}>
          <SelectTrigger className="w-[220px] bg-card">
            <SelectValue placeholder="Selecione a perspectiva" />
          </SelectTrigger>
          <SelectContent>
            {snap.perspectives.map((p) => (
              <SelectItem key={p.id} value={String(p.id)}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </PageToolbar>

      {selected && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            <Card className="card-elegant border-0">
              <CardHeader className="pb-2">
                <div className="h-1 w-10 rounded-full mb-2" style={{ backgroundColor: selected.color || "#1e3a5f" }} />
                <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  Indicadores da perspectiva {selected.name}
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
                    {perspInds.map((i) => {
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
                  Média da perspectiva por área
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div style={{ height: Math.max(280, areaData.length * 30) }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={areaData} layout="vertical" margin={{ left: 30, right: 40, top: 8, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="oklch(0.92 0.008 90)" />
                      <XAxis type="number" domain={[0, 120]} tickFormatter={(v) => `${v}%`} fontSize={12} />
                      <YAxis type="category" dataKey="name" width={150} fontSize={11} />
                      <Tooltip
                        formatter={(v: number, name: string) => [
                          `${v.toLocaleString("pt-BR")}%`,
                          name === "average" ? "Média dos indicadores" : name,
                        ]}
                      />
                      <ReferenceLine x={100} stroke="#15803d" strokeDasharray="4 4" />
                      <Bar dataKey="average" radius={[0, 6, 6, 0]} barSize={16}>
                        {areaData.map((d, i) => (
                          <Cell key={i} fill={scoreColor((d.average ?? 0) / 100)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="card-elegant border-0">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Contribuição ponderada por área (média × peso)
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-xs uppercase tracking-wide">
                    <th className="text-left py-2 pr-2 font-medium">Área</th>
                    <th className="text-center py-2 px-2 font-medium">Média dos Indicadores</th>
                    <th className="text-center py-2 px-2 font-medium">Peso</th>
                    <th className="text-center py-2 pl-2 font-medium">Resultado Ponderado</th>
                  </tr>
                </thead>
                <tbody>
                  {snap.areaScores.map((a) => {
                    const p = a.perspectives.find((x) => x.perspectiveId === perspectiveId);
                    if (!p) return null;
                    return (
                      <tr key={a.areaId} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="py-2 pr-2">{a.areaName}</td>
                        <td className="py-2 px-2 text-center kpi-number">{fmtScore(p.average)}</td>
                        <td className="py-2 px-2 text-center kpi-number">{fmtScore(p.weight)}</td>
                        <td className="py-2 pl-2 text-center">
                          <ScoreBadge score={p.average !== null ? p.weighted : null} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
