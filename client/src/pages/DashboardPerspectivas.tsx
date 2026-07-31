import { DashboardEmptyState, PageSkeleton, PageToolbar, ScoreBadge } from "@/components/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fmtScore, fmtValue, scoreColor, useApp } from "@/contexts/AppContext";
import { useAuth } from "@/hooks/useAuth";
import { useDashboardSnapshot } from "@/lib/apiHooks";
import type { DashboardSnapshot, Perspective } from "@/lib/apiTypes";
import { averageScore } from "@/lib/indicatorGrouping";
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

const ALL = "all";

export default function DashboardPerspectivas() {
  const { companyId, year, month, periodLabel } = useApp();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [perspectiveId, setPerspectiveId] = useState<number | typeof ALL | null>(null);

  const { data: snap, isLoading } = useDashboardSnapshot(
    { companyId: companyId ?? 0, year, month },
    { enabled: !!companyId },
  );

  useEffect(() => {
    if (!snap) return;
    if (perspectiveId === null) {
      if ((snap.perspectives ?? []).length > 0) setPerspectiveId((snap.perspectives ?? [])[0].id);
      return;
    }
    if (typeof perspectiveId === "number" && !(snap.perspectives ?? []).some((p) => p.id === perspectiveId)) {
      setPerspectiveId((snap.perspectives ?? []).length > 0 ? (snap.perspectives ?? [])[0].id : ALL);
    }
  }, [snap, perspectiveId]);

  if (isLoading || !companyId) return <PageSkeleton />;

  if (!snap || (snap.perspectives ?? []).length === 0 || (snap.areas ?? []).length === 0) {
    return (
      <>
        <PageToolbar title="Dashboard por Perspectiva" subtitle={periodLabel} />
        <DashboardEmptyState
          isAdmin={isAdmin}
          adminTitle="Nenhuma perspectiva ou área cadastrada"
          adminDescription="Cadastre perspectivas e áreas para visualizar este dashboard."
        />
      </>
    );
  }

  const selected = typeof perspectiveId === "number" ? (snap.perspectives ?? []).find((p) => p.id === perspectiveId) : undefined;

  return (
    <div className="fade-up">
      <PageToolbar title="Dashboard por Perspectiva" subtitle={`Análise por perspectiva estratégica — ${periodLabel}`} showExport>
        <Select
          value={perspectiveId === ALL ? ALL : perspectiveId ? String(perspectiveId) : undefined}
          onValueChange={(v) => setPerspectiveId(v === ALL ? ALL : parseInt(v))}
        >
          <SelectTrigger className="w-[220px] bg-card">
            <SelectValue placeholder="Selecione a perspectiva" />
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
      </PageToolbar>

      {perspectiveId === ALL && <PerspectiveGroupView snap={snap} onSelectPerspective={setPerspectiveId} />}
      {perspectiveId !== ALL && selected && <SinglePerspectiveView selected={selected} snap={snap} />}
    </div>
  );
}

function SinglePerspectiveView({ selected, snap }: { selected: Perspective; snap: DashboardSnapshot }) {
  const perspInds = (snap.indicatorScores ?? []).filter((i) => i.perspectiveId === selected.id);

  // Desempenho da perspectiva em cada área (média × peso)
  const areaData = (snap.areaScores ?? [])
    .map((a) => {
      const p = a.perspectives.find((x) => x.perspectiveId === selected.id);
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
              {(snap.areaScores ?? []).map((a) => {
                const p = a.perspectives.find((x) => x.perspectiveId === selected.id);
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
  );
}

function PerspectiveGroupView({
  snap,
  onSelectPerspective,
}: {
  snap: DashboardSnapshot;
  onSelectPerspective: (id: number) => void;
}) {
  // Média do "average" da perspectiva (média dos indicadores, antes do peso) entre todas as áreas em que se aplica
  const perspAverages = (snap.perspectives ?? []).map((persp) => {
    const vals = (snap.areaScores ?? []).map((a) => a.perspectives.find((p) => p.perspectiveId === persp.id)?.average ?? null);
    return { perspective: persp, average: averageScore(vals) };
  });

  const barData = perspAverages
    .filter((p) => p.average !== null)
    .map((p) => ({ name: p.perspective.name, average: Math.round((p.average ?? 0) * 1000) / 10 }))
    .sort((a, b) => b.average - a.average);

  return (
    <>
      <Card className="card-elegant border-0 mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-serif">Todas as perspectivas</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Comparação de desempenho entre as {(snap.perspectives ?? []).length} perspectivas estratégicas.
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {perspAverages.map(({ perspective, average }) => (
          <Card
            key={perspective.id}
            className="card-elegant border-0 cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => onSelectPerspective(perspective.id)}
          >
            <CardHeader className="pb-2">
              <div className="h-1 w-8 rounded-full mb-2" style={{ backgroundColor: perspective.color || "#1e3a5f" }} />
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide leading-tight min-h-8">
                {perspective.name}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="kpi-number text-2xl font-bold" style={{ color: scoreColor(average) }}>
                {fmtScore(average)}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">média entre as áreas</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="card-elegant border-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Desempenho médio por perspectiva
            </CardTitle>
          </CardHeader>
          <CardContent>
            {barData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Nenhuma perspectiva apurada no período.</p>
            ) : (
              <div style={{ height: Math.max(280, barData.length * 32) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barData} layout="vertical" margin={{ left: 30, right: 40, top: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="oklch(0.92 0.008 90)" />
                    <XAxis type="number" domain={[0, 120]} tickFormatter={(v) => `${v}%`} fontSize={12} />
                    <YAxis type="category" dataKey="name" width={150} fontSize={11} />
                    <Tooltip formatter={(v: number) => [`${v.toLocaleString("pt-BR")}%`, "Média dos indicadores"]} />
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
              Contribuição ponderada por área e perspectiva
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground text-xs uppercase tracking-wide">
                  <th className="text-left py-2 pr-2 font-medium">Área</th>
                  {(snap.perspectives ?? []).map((p) => (
                    <th key={p.id} className="text-center py-2 px-2 font-medium">
                      <button
                        type="button"
                        className="hover:text-foreground hover:underline"
                        onClick={() => onSelectPerspective(p.id)}
                      >
                        {p.name.split(" ")[0]}
                      </button>
                    </th>
                  ))}
                  <th className="text-center py-2 pl-2 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {(snap.areaScores ?? []).map((a) => (
                  <tr key={a.areaId} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="py-2 pr-2 font-medium">{a.areaName}</td>
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
    </>
  );
}
