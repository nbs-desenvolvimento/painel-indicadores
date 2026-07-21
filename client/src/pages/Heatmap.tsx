import { EmptyState, PageSkeleton, PageToolbar } from "@/components/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { fmtScore, scoreBg, useApp } from "@/contexts/AppContext";
import { trpc } from "@/lib/trpc";

export default function Heatmap() {
  const { companyId, year, month, periodLabel } = useApp();
  const { data: snap, isLoading } = trpc.dashboard.snapshot.useQuery(
    { companyId: companyId ?? 0, year, month },
    { enabled: !!companyId },
  );

  if (isLoading || !companyId) return <PageSkeleton />;

  if (!snap || snap.indicators.length === 0 || snap.areas.length === 0) {
    return (
      <>
        <PageToolbar title="Heatmap" subtitle={periodLabel} />
        <EmptyState title="Sem dados para exibir" description="Cadastre indicadores e áreas para gerar o heatmap." />
      </>
    );
  }

  const applSet = new Set(
    snap.applicability.filter((x) => x.applicable).map((x) => `${x.indicatorId}:${x.areaId}`),
  );
  const scoreMap = new Map(snap.indicatorScores.map((i) => [i.indicatorId, i]));
  const perspColor = new Map(snap.perspectives.map((p) => [p.id, p.color || "#1e3a5f"]));

  // Agrupa indicadores por perspectiva (ordem)
  const groupedInds = snap.perspectives.map((p) => ({
    perspective: p,
    indicators: snap.indicators.filter((i) => i.perspectiveId === p.id),
  }));

  const legend = [
    { label: "≥ 120%", color: scoreBg(1.2) },
    { label: "100–119%", color: scoreBg(1.0) },
    { label: "80–99%", color: scoreBg(0.8) },
    { label: "60–79%", color: scoreBg(0.6) },
    { label: "< 60%", color: scoreBg(0.3) },
  ];

  return (
    <div className="fade-up">
      <PageToolbar title="Heatmap Indicador × Área" subtitle={`Mapa de calor de scores — ${periodLabel}`} showExport />

      <Card className="card-elegant border-0">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Score do indicador nas áreas onde é aplicável
            </CardTitle>
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              {legend.map((l) => (
                <span key={l.label} className="inline-flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-sm inline-block" style={{ backgroundColor: l.color }} />
                  {l.label}
                </span>
              ))}
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-sm inline-block bg-muted border" />
                Não aplicável
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="text-xs border-collapse w-full">
            <thead>
              <tr>
                <th className="sticky left-0 bg-card text-left py-2 pr-3 font-medium text-muted-foreground min-w-[220px] z-10">
                  Indicador
                </th>
                {snap.areas.map((a) => (
                  <th
                    key={a.id}
                    className="py-2 px-1 font-medium text-muted-foreground text-center align-bottom"
                    style={{ minWidth: 42, maxWidth: 60 }}
                  >
                    <div
                      className="mx-auto"
                      style={{
                        writingMode: "vertical-rl",
                        transform: "rotate(180deg)",
                        maxHeight: 130,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {a.name}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groupedInds.map(({ perspective, indicators }) => (
                <>
                  <tr key={`p-${perspective.id}`}>
                    <td
                      colSpan={snap.areas.length + 1}
                      className="pt-3 pb-1 sticky left-0 bg-card z-10"
                    >
                      <span className="inline-flex items-center gap-2 font-semibold text-[11px] uppercase tracking-wider">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: perspColor.get(perspective.id) }} />
                        {perspective.name}
                      </span>
                    </td>
                  </tr>
                  {indicators.map((ind) => {
                    const s = scoreMap.get(ind.id);
                    return (
                      <tr key={ind.id} className="hover:bg-muted/20">
                        <td className="sticky left-0 bg-card py-1 pr-3 font-medium z-10 max-w-[260px] truncate">
                          {ind.name}
                        </td>
                        {snap.areas.map((a) => {
                          const applicable = applSet.has(`${ind.id}:${a.id}`);
                          const score = applicable ? (s?.score ?? null) : undefined;
                          return (
                            <td key={a.id} className="p-0.5 text-center">
                              {applicable ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div
                                      className="h-7 rounded-sm flex items-center justify-center kpi-number font-medium cursor-default transition-transform hover:scale-105"
                                      style={{
                                        backgroundColor: score !== null && score !== undefined ? scoreBg(score) : "oklch(0.94 0.008 90)",
                                        color: score !== null && score !== undefined && score >= 1.2 ? "white" : "#1f2937",
                                      }}
                                    >
                                      {score !== null && score !== undefined ? `${Math.round(score * 100)}` : "·"}
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="font-medium">{ind.name}</p>
                                    <p className="text-xs">{a.name}</p>
                                    <p className="text-xs">Score: {fmtScore(score ?? null)}</p>
                                  </TooltipContent>
                                </Tooltip>
                              ) : (
                                <div className="h-7 rounded-sm bg-muted/50 border border-border/40" />
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-muted-foreground mt-4">
            Números representam o score (%) do indicador no período. Células cinzas indicam que o indicador não se aplica à área.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
