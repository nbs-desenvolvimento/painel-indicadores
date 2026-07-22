import { EmptyState, PageSkeleton, PageToolbar, ScoreBadge, ScoreGauge } from "@/components/shared";
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
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "wouter";

export default function DashboardAreas() {
  const { companyId, year, month, periodLabel } = useApp();
  const [searchParams] = useSearchParams();
  const urlArea = searchParams.get("area");
  const [areaId, setAreaId] = useState<number | null>(urlArea ? parseInt(urlArea) : null);

  const { data: snap, isLoading } = useDashboardSnapshot(
    { companyId: companyId ?? 0, year, month },
    { enabled: !!companyId },
  );

  useEffect(() => {
    if (snap && snap.areas.length > 0 && (areaId === null || !snap.areas.some((a) => a.id === areaId))) {
      setAreaId(snap.areas[0].id);
    }
  }, [snap, areaId]);

  const areaScore = useMemo(
    () => snap?.areaScores.find((a) => a.areaId === areaId),
    [snap, areaId],
  );

  if (isLoading || !companyId) return <PageSkeleton />;

  if (!snap || snap.areas.length === 0) {
    return (
      <>
        <PageToolbar title="Dashboard por Área" subtitle={periodLabel} />
        <EmptyState title="Nenhuma área cadastrada" description="Cadastre áreas para visualizar este dashboard." />
      </>
    );
  }

  const perspName = new Map(snap.perspectives.map((p) => [p.id, p.name]));
  const perspColor = new Map(snap.perspectives.map((p) => [p.id, p.color || "#1e3a5f"]));
  const applSet = new Set(
    snap.applicability.filter((x) => x.applicable).map((x) => `${x.indicatorId}:${x.areaId}`),
  );
  const applicableInds = snap.indicatorScores.filter((i) => areaId && applSet.has(`${i.indicatorId}:${areaId}`));

  return (
    <div className="fade-up">
      <PageToolbar title="Dashboard por Área" subtitle={`Análise detalhada — ${periodLabel}`} showExport>
        <Select value={areaId ? String(areaId) : undefined} onValueChange={(v) => setAreaId(parseInt(v))}>
          <SelectTrigger className="w-[220px] bg-card">
            <SelectValue placeholder="Selecione a área" />
          </SelectTrigger>
          <SelectContent>
            {snap.areas.map((a) => (
              <SelectItem key={a.id} value={String(a.id)}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </PageToolbar>

      {areaScore && (
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
                    const ind = snap.indicators.find((x) => x.id === i.indicatorId);
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
      )}
    </div>
  );
}
