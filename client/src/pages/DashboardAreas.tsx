import { DashboardEmptyState, PageSkeleton, PageToolbar, ScoreBadge, ScoreGauge } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { fmtScore, fmtValue, scoreColor, useApp } from "@/contexts/AppContext";
import { useAuth } from "@/hooks/useAuth";
import { useDashboardSnapshot } from "@/lib/apiHooks";
import type { Area, DashboardSnapshot } from "@/lib/apiTypes";
import { averageScore } from "@/lib/indicatorGrouping";
import { ChevronDown } from "lucide-react";
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
import { useSearchParams } from "wouter";

export default function DashboardAreas() {
  const { companyId, year, month, periodLabel } = useApp();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [searchParams] = useSearchParams();
  const urlArea = searchParams.get("area");

  const [initialized, setInitialized] = useState(false);
  const [selectedAreaIds, setSelectedAreaIds] = useState<number[]>(urlArea ? [parseInt(urlArea)] : []);

  const { data: snap, isLoading } = useDashboardSnapshot(
    { companyId: companyId ?? 0, year, month },
    { enabled: !!companyId },
  );

  useEffect(() => {
    if (!snap) return;
    if (!initialized) {
      if (selectedAreaIds.length === 0 && (snap.areas ?? []).length > 0) {
        setSelectedAreaIds([(snap.areas ?? [])[0].id]);
      }
      setInitialized(true);
      return;
    }
    const validIds = selectedAreaIds.filter((id) => (snap.areas ?? []).some((a) => a.id === id));
    if (validIds.length !== selectedAreaIds.length) {
      setSelectedAreaIds(validIds.length > 0 ? validIds : (snap.areas ?? []).length > 0 ? [(snap.areas ?? [])[0].id] : []);
    }
  }, [snap, initialized, selectedAreaIds]);

  if (isLoading || !companyId) return <PageSkeleton />;

  if (!snap || (snap.areas ?? []).length === 0) {
    return (
      <>
        <PageToolbar title="Dashboard por Área" subtitle={periodLabel} />
        <DashboardEmptyState
          isAdmin={isAdmin}
          adminTitle="Nenhuma área cadastrada"
          adminDescription="Cadastre áreas para visualizar este dashboard."
        />
      </>
    );
  }

  const toggleArea = (id: number) => {
    setSelectedAreaIds((prev) => {
      if (prev.includes(id)) {
        const next = prev.filter((x) => x !== id);
        return next.length > 0 ? next : prev; // sempre ao menos 1 área selecionada
      }
      return [...prev, id];
    });
  };

  const selectAll = () => setSelectedAreaIds((snap.areas ?? []).map((a) => a.id));
  const selectedAreas = (snap.areas ?? []).filter((a) => selectedAreaIds.includes(a.id));
  const allSelected = selectedAreaIds.length === (snap.areas ?? []).length;
  const triggerLabel = allSelected
    ? "Todas as áreas"
    : selectedAreas.length === 1
      ? selectedAreas[0].name
      : `${selectedAreas.length} áreas selecionadas`;

  return (
    <div className="fade-up">
      <PageToolbar title="Dashboard por Área" subtitle={`Análise detalhada — ${periodLabel}`} showExport>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="w-[240px] justify-between bg-card font-normal">
              <span className="truncate">{triggerLabel}</span>
              <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-2" align="start">
            <button
              type="button"
              onClick={selectAll}
              className="w-full text-left text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 px-2 py-1.5"
            >
              Selecionar todas
            </button>
            <div className="max-h-72 overflow-y-auto mt-1">
              {(snap.areas ?? []).map((a) => (
                <label
                  key={a.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 cursor-pointer text-sm"
                >
                  <Checkbox checked={selectedAreaIds.includes(a.id)} onCheckedChange={() => toggleArea(a.id)} />
                  <span className="truncate">{a.name}</span>
                </label>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </PageToolbar>

      {selectedAreas.length === 1 ? (
        <SingleAreaView area={selectedAreas[0]} snap={snap} />
      ) : (
        <AreaGroupView areas={selectedAreas} snap={snap} onSelectArea={(id) => setSelectedAreaIds([id])} />
      )}
    </div>
  );
}

function SingleAreaView({ area, snap }: { area: Area; snap: DashboardSnapshot }) {
  const areaScore = (snap.areaScores ?? []).find((a) => a.areaId === area.id);
  const perspName = new Map((snap.perspectives ?? []).map((p) => [p.id, p.name]));
  const perspColor = new Map((snap.perspectives ?? []).map((p) => [p.id, p.color || "#1e3a5f"]));
  const applSet = new Set(
    (snap.applicability ?? []).filter((x) => x.applicable).map((x) => `${x.indicatorId}:${x.areaId}`),
  );
  const applicableInds = (snap.indicatorScores ?? []).filter((i) => applSet.has(`${i.indicatorId}:${area.id}`));

  if (!areaScore) return null;

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-6">
        <Card className="card-elegant border-0 lg:col-span-1">
          <CardHeader className="pb-0">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Desempenho Total
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center pt-2 pb-4">
            <ScoreGauge score={areaScore.total} size={180} />
          </CardContent>
        </Card>

        {areaScore.perspectives.map((p) => (
          <Card key={p.perspectiveId} className="card-elegant border-0">
            <CardHeader className="pb-2">
              <div
                className="h-1 w-8 rounded-full mb-2"
                style={{ backgroundColor: perspColor.get(p.perspectiveId) }}
              />
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide leading-tight">
                {perspName.get(p.perspectiveId)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="kpi-number text-2xl font-bold" style={{ color: scoreColor(p.average) }}>
                {fmtScore(p.weighted)}
              </p>
              <div className="text-xs text-muted-foreground mt-2 space-y-0.5">
                <p>Média dos indicadores: {fmtScore(p.average)}</p>
                <p>Peso da perspectiva: {fmtScore(p.weight)}</p>
                <p>{p.indicatorScores.filter((s) => s.score !== null).length} indicador(es) apurado(s)</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="card-elegant border-0">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Indicadores aplicáveis à área ({applicableInds.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground text-xs uppercase tracking-wide">
                <th className="text-left py-2 pr-2 font-medium">Perspectiva</th>
                <th className="text-left py-2 px-2 font-medium">Indicador</th>
                <th className="text-right py-2 px-2 font-medium">Meta</th>
                <th className="text-right py-2 px-2 font-medium">Resultado</th>
                <th className="text-center py-2 pl-2 font-medium">Score</th>
              </tr>
            </thead>
            <tbody>
              {applicableInds.map((i) => {
                const ind = (snap.indicators ?? []).find((x) => x.id === i.indicatorId);
                return (
                  <tr key={i.indicatorId} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="py-2 pr-2">
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="h-2 w-2 rounded-full shrink-0"
                          style={{ backgroundColor: perspColor.get(i.perspectiveId) }}
                        />
                        <span className="text-xs text-muted-foreground">{perspName.get(i.perspectiveId)}</span>
                      </span>
                    </td>
                    <td className="py-2 px-2 font-medium">{i.name}</td>
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
    </>
  );
}

function AreaGroupView({
  snap,
  areas,
  onSelectArea,
}: {
  snap: DashboardSnapshot;
  areas: Area[];
  onSelectArea: (id: number) => void;
}) {
  const scores = areas.map((a) => (snap.areaScores ?? []).find((x) => x.areaId === a.id)).filter((s) => s !== undefined);
  const groupAverage = averageScore(scores.map((s) => s.total));

  const barData = scores
    .map((s) => ({ name: s.areaName, total: Math.round(s.total * 1000) / 10 }))
    .sort((a, b) => b.total - a.total);

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6">
        <Card className="card-elegant border-0 lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-serif">
              {areas.length === (snap.areas ?? []).length ? "Todas as áreas" : `${areas.length} áreas selecionadas`}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Comparação de desempenho entre as áreas selecionadas.
          </CardContent>
        </Card>

        <Card className="card-elegant border-0 lg:col-span-2">
          <CardHeader className="pb-0">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Desempenho médio do grupo
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center pt-1 pb-4">
            <ScoreGauge score={groupAverage} size={160} label="Média do desempenho total das áreas" />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="card-elegant border-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Desempenho total por área
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div style={{ height: Math.max(280, barData.length * 32) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} layout="vertical" margin={{ left: 30, right: 40, top: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="oklch(0.92 0.008 90)" />
                  <XAxis type="number" domain={[0, 120]} tickFormatter={(v) => `${v}%`} fontSize={12} />
                  <YAxis type="category" dataKey="name" width={150} fontSize={11} />
                  <Tooltip formatter={(v: number) => [`${v.toLocaleString("pt-BR")}%`, "Desempenho"]} />
                  <ReferenceLine x={100} stroke="#15803d" strokeDasharray="4 4" />
                  <Bar dataKey="total" radius={[0, 6, 6, 0]} barSize={18}>
                    {barData.map((d, i) => (
                      <Cell key={i} fill={scoreColor(d.total / 100)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="card-elegant border-0">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Resumo por área e perspectiva
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground text-xs uppercase tracking-wide">
                  <th className="text-left py-2 pr-2 font-medium">Área</th>
                  {(snap.perspectives ?? []).map((p) => (
                    <th key={p.id} className="text-center py-2 px-2 font-medium">
                      {p.name.split(" ")[0]}
                    </th>
                  ))}
                  <th className="text-center py-2 pl-2 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {scores
                  .slice()
                  .sort((a, b) => b.total - a.total)
                  .map((a) => (
                    <tr
                      key={a.areaId}
                      className="border-b last:border-0 hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() => onSelectArea(a.areaId)}
                    >
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
