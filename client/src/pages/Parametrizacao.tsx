import { PageSkeleton } from "@/components/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useApp } from "@/contexts/AppContext";
import { trpc } from "@/lib/trpc";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

export default function Parametrizacao() {
  const { companyId } = useApp();
  const utils = trpc.useUtils();

  const { data: areas, isLoading: l1 } = trpc.areas.list.useQuery(
    { companyId: companyId ?? undefined },
    { enabled: !!companyId },
  );
  const { data: perspectives, isLoading: l2 } = trpc.perspectives.list.useQuery(
    { companyId: companyId ?? undefined },
    { enabled: !!companyId },
  );
  const { data: indicators, isLoading: l3 } = trpc.indicators.list.useQuery(
    { companyId: companyId ?? undefined },
    { enabled: !!companyId },
  );
  const areaIds = useMemo(() => (areas ?? []).map((a) => a.id), [areas]);
  const indicatorIds = useMemo(() => (indicators ?? []).map((i) => i.id), [indicators]);
  const { data: weights } = trpc.weights.list.useQuery({ areaIds }, { enabled: areaIds.length > 0 });
  const { data: applicability } = trpc.applicability.list.useQuery(
    { indicatorIds },
    { enabled: indicatorIds.length > 0 },
  );

  // draft de pesos: chave "areaId:perspectiveId" → string (percentual)
  const [weightDraft, setWeightDraft] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    if (weights && areas && perspectives) {
      const next: Record<string, string> = {};
      for (const a of areas) {
        for (const p of perspectives) {
          const w = weights.find((x) => x.areaId === a.id && x.perspectiveId === p.id);
          next[`${a.id}:${p.id}`] =
            w !== undefined ? (w.weight * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "";
        }
      }
      setWeightDraft(next);
    }
  }, [weights, areas, perspectives]);

  const setWeightMut = trpc.weights.set.useMutation({
    onSuccess: () => {
      utils.weights.list.invalidate();
      utils.dashboard.invalidate();
    },
    onError: (e) => toast.error(e.message),
    onSettled: () => setSavingKey(null),
  });

  const setApplMut = trpc.applicability.set.useMutation({
    onMutate: async (vars) => {
      await utils.applicability.list.cancel();
      const prev = utils.applicability.list.getData({ indicatorIds });
      utils.applicability.list.setData({ indicatorIds }, (old) => {
        if (!old) return old;
        const idx = old.findIndex((x) => x.indicatorId === vars.indicatorId && x.areaId === vars.areaId);
        if (idx >= 0) {
          const copy = [...old];
          copy[idx] = { ...copy[idx], applicable: vars.applicable };
          return copy;
        }
        return [
          ...old,
          {
            id: -Date.now(),
            indicatorId: vars.indicatorId,
            areaId: vars.areaId,
            applicable: vars.applicable,
            updatedAt: new Date(),
          },
        ];
      });
      return { prev };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) utils.applicability.list.setData({ indicatorIds }, ctx.prev);
      toast.error(e.message);
    },
    onSettled: () => {
      utils.applicability.list.invalidate();
      utils.dashboard.invalidate();
    },
  });

  const handleWeightBlur = (areaId: number, perspectiveId: number) => {
    const key = `${areaId}:${perspectiveId}`;
    const raw = weightDraft[key];
    if (raw === undefined) return;
    const cleaned = raw.trim().replace("%", "").replace(",", ".");
    const pct = cleaned === "" ? 0 : parseFloat(cleaned);
    if (isNaN(pct) || pct < 0 || pct > 100) {
      toast.error("Peso deve ser um percentual entre 0 e 100");
      return;
    }
    const newWeight = pct / 100;
    const existing = weights?.find((x) => x.areaId === areaId && x.perspectiveId === perspectiveId);
    if (existing && Math.abs(existing.weight - newWeight) < 1e-9) return;
    if (!existing && pct === 0 && raw.trim() === "") return;
    setSavingKey(key);
    setWeightMut.mutate({ areaId, perspectiveId, weight: newWeight });
  };

  if (l1 || l2 || l3 || !companyId) return <PageSkeleton />;

  const applMap = new Map(applicability?.map((x) => [`${x.indicatorId}:${x.areaId}`, x.applicable]) ?? []);
  const activeAreas = (areas ?? []).filter((a) => a.active);

  // soma dos pesos por área para validação visual
  const weightSum = (areaId: number) => {
    let sum = 0;
    for (const p of perspectives ?? []) {
      const raw = weightDraft[`${areaId}:${p.id}`];
      const cleaned = (raw ?? "").trim().replace("%", "").replace(",", ".");
      const v = parseFloat(cleaned);
      if (!isNaN(v)) sum += v;
    }
    return Math.round(sum * 100) / 100;
  };

  const perspColor = new Map(perspectives?.map((p) => [p.id, p.color || "#1e3a5f"]) ?? []);
  const groupedInds = (perspectives ?? []).map((p) => ({
    perspective: p,
    inds: (indicators ?? []).filter((i) => i.perspectiveId === p.id),
  }));

  return (
    <div className="fade-up">
      <div className="mb-6">
        <h1 className="page-title font-serif text-3xl">Parametrização</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Pesos das perspectivas por área e aplicabilidade dos indicadores
        </p>
      </div>

      <Tabs defaultValue="pesos">
        <TabsList className="mb-4">
          <TabsTrigger value="pesos">Pesos por Área</TabsTrigger>
          <TabsTrigger value="aplicabilidade">Aplicabilidade de Indicadores</TabsTrigger>
        </TabsList>

        <TabsContent value="pesos">
          <Card className="card-elegant border-0">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Peso de cada perspectiva por área (matriz área × perspectiva)
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Valores em percentual. A soma dos pesos de cada área deve totalizar 100%. Salvo automaticamente ao
                sair do campo.
              </p>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-xs uppercase tracking-wide">
                    <th className="text-left py-2 pr-2 font-medium min-w-[180px]">Área</th>
                    {perspectives?.map((p) => (
                      <th key={p.id} className="text-center py-2 px-2 font-medium min-w-[110px]">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: perspColor.get(p.id) }} />
                          {p.name.split(" ")[0]}
                        </span>
                      </th>
                    ))}
                    <th className="text-center py-2 pl-2 font-medium w-24">Soma</th>
                  </tr>
                </thead>
                <tbody>
                  {activeAreas.map((a) => {
                    const sum = weightSum(a.id);
                    return (
                      <tr key={a.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="py-1.5 pr-2 font-medium">{a.name}</td>
                        {perspectives?.map((p) => {
                          const key = `${a.id}:${p.id}`;
                          return (
                            <td key={p.id} className="py-1.5 px-2">
                              <div className="relative">
                                <Input
                                  className="h-8 text-right kpi-number bg-background pr-6"
                                  value={weightDraft[key] ?? ""}
                                  placeholder="0"
                                  onChange={(e) =>
                                    setWeightDraft((prev) => ({ ...prev, [key]: e.target.value }))
                                  }
                                  onBlur={() => handleWeightBlur(a.id, p.id)}
                                />
                                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                                  {savingKey === key ? <Loader2 className="h-3 w-3 animate-spin" /> : "%"}
                                </span>
                              </div>
                            </td>
                          );
                        })}
                        <td className="py-1.5 pl-2 text-center">
                          <span
                            className={`kpi-number text-xs font-semibold rounded-full px-2 py-1 ${
                              Math.abs(sum - 100) < 0.01
                                ? "bg-green-100 text-green-800"
                                : "bg-orange-100 text-orange-700"
                            }`}
                          >
                            {sum.toLocaleString("pt-BR")}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="aplicabilidade">
          <Card className="card-elegant border-0">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Indicadores aplicáveis a cada área (matriz indicador × área)
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Marque as células para indicar que o indicador compõe a avaliação da área. Salvo automaticamente.
              </p>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="text-xs border-collapse w-full">
                <thead>
                  <tr>
                    <th className="sticky left-0 bg-card text-left py-2 pr-3 font-medium text-muted-foreground min-w-[220px] z-10">
                      Indicador
                    </th>
                    {activeAreas.map((a) => (
                      <th key={a.id} className="py-2 px-1 font-medium text-muted-foreground text-center align-bottom" style={{ minWidth: 40 }}>
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
                  {groupedInds.map(({ perspective, inds }) => (
                    <>
                      <tr key={`p-${perspective.id}`}>
                        <td colSpan={activeAreas.length + 1} className="pt-3 pb-1 sticky left-0 bg-card z-10">
                          <span className="inline-flex items-center gap-2 font-semibold text-[11px] uppercase tracking-wider">
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: perspColor.get(perspective.id) }} />
                            {perspective.name}
                          </span>
                        </td>
                      </tr>
                      {inds.map((ind) => (
                        <tr key={ind.id} className="hover:bg-muted/20">
                          <td className="sticky left-0 bg-card py-1 pr-3 font-medium z-10 max-w-[260px] truncate">
                            {ind.name}
                          </td>
                          {activeAreas.map((a) => {
                            const checked = applMap.get(`${ind.id}:${a.id}`) ?? false;
                            return (
                              <td key={a.id} className="p-1 text-center">
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={(v) =>
                                    setApplMut.mutate({
                                      indicatorId: ind.id,
                                      areaId: a.id,
                                      applicable: v === true,
                                    })
                                  }
                                  className="mx-auto"
                                />
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
