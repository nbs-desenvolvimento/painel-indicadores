import { PageSkeleton, PageToolbar, ScoreBadge } from "@/components/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { fmtScore, useApp } from "@/contexts/AppContext";
import type { CalibrationRule, Indicator, IndicatorEntry, Perspective } from "@/lib/apiTypes";
import { trpcApi } from "@/lib/trpcApi";
import { computeScore, computeScoreWithRule, type CalibrationRuleDef, type ScaleType } from "@/lib/calcEngine";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

interface MutationResult<TInput> {
  mutate: (input: TInput) => void;
}

interface ListQuery<T, TInput> {
  useQuery: (input: TInput, opts: { enabled: boolean }) => { data: T[] | undefined; isLoading: boolean };
}

interface LancamentosApi {
  useUtils: () => {
    entries: { list: { invalidate: () => void } };
    dashboard: { invalidate: () => void };
  };
  indicators: { list: ListQuery<Indicator, { companyId: number | undefined }> };
  perspectives: { list: ListQuery<Perspective, { companyId: number | undefined }> };
  calibrationRules: { list: ListQuery<CalibrationRule, { companyId: number | undefined }> };
  entries: {
    list: ListQuery<IndicatorEntry, { indicatorIds: number[]; year: number; month: number }>;
    upsert: {
      useMutation: (opts: {
        onSuccess: () => void;
        onError: (e: { message: string }) => void;
        onSettled: () => void;
      }) => MutationResult<{
        indicatorId: number;
        year: number;
        month: number;
        goal: number | null;
        result: number | null;
      }>;
    };
  };
}

/** Converte string pt-BR para número (aceita vírgula decimal e %) */
function parseNum(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  const isPct = t.includes("%");
  const cleaned = t.replace(/[R$\s%]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  if (isNaN(n)) return null;
  return isPct ? n / 100 : n;
}

function fmtInput(v: number | null | undefined, unit?: string | null): string {
  if (v === null || v === undefined) return "";
  if (unit === "percent") return `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 4 })}%`;
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 4, useGrouping: false });
}

export default function Lancamentos() {
  const { companyId, year, month, periodLabel } = useApp();
  const api = trpcApi as LancamentosApi;
  const utils = api.useUtils();

  const { data: indicators, isLoading: indsLoading } = api.indicators.list.useQuery(
    { companyId: companyId ?? undefined },
    { enabled: !!companyId },
  );
  const { data: perspectives } = api.perspectives.list.useQuery(
    { companyId: companyId ?? undefined },
    { enabled: !!companyId },
  );
  const indicatorIds = useMemo(() => indicators?.map((i) => i.id) ?? [], [indicators]);
  const { data: entries, isLoading: entriesLoading } = api.entries.list.useQuery(
    { indicatorIds, year, month },
    { enabled: indicatorIds.length > 0 },
  );

  // estado local de edição: chave `indicatorId` → { goal, result } strings
  const [draft, setDraft] = useState<Record<number, { goal: string; result: string }>>({});
  const [savingId, setSavingId] = useState<number | null>(null);

  const { data: rules } = api.calibrationRules.list.useQuery(
    { companyId: companyId ?? undefined },
    { enabled: !!companyId },
  );

  useEffect(() => {
    if (indicators && entries) {
      const next: Record<number, { goal: string; result: string }> = {};
      for (const ind of indicators) {
        const e = entries.find((x) => x.indicatorId === ind.id);
        // Meta pré-preenchida com a meta padrão do cadastro do indicador quando não há lançamento (editável mês a mês)
        const goalVal = e?.goal ?? ind.defaultGoal ?? null;
        next[ind.id] = {
          goal: fmtInput(goalVal, ind.unit),
          result: fmtInput(e?.result, ind.unit),
        };
      }
      setDraft(next);
    }
  }, [indicators, entries]);

  const upsertMutation = api.entries.upsert.useMutation({
    onSuccess: () => {
      utils.entries.list.invalidate();
      utils.dashboard.invalidate();
    },
    onError: (e) => toast.error(`Erro ao salvar: ${e.message}`),
    onSettled: () => setSavingId(null),
  });

  const handleBlur = (indicatorId: number) => {
    const d = draft[indicatorId];
    if (!d) return;
    const ind = indicators?.find((i) => i.id === indicatorId);
    if (!ind) return;
    const e = entries?.find((x) => x.indicatorId === indicatorId);
    const goal = parseNum(d.goal);
    const result = parseNum(d.result);
    // evita chamadas desnecessárias (considera meta padrão pré-preenchida ainda não persistida)
    if ((e?.goal ?? null) === goal && (e?.result ?? null) === result) return;
    setSavingId(indicatorId);
    upsertMutation.mutate({ indicatorId, year, month, goal, result });
  };

  if (indsLoading || !companyId) return <PageSkeleton />;

  const perspColor = new Map(perspectives?.map((p) => [p.id, p.color || "#1e3a5f"]) ?? []);
  const ruleById = new Map<number, CalibrationRuleDef & { name: string }>(
    (rules ?? []).map((r) => [
      r.id,
      {
        name: r.name,
        directConversion: r.directConversion,
        ranges: r.ranges.map((rg) => ({
          minAttainment: rg.minAttainment,
          minInclusive: rg.minInclusive,
          maxAttainment: rg.maxAttainment,
          maxInclusive: rg.maxInclusive,
          score: rg.score,
        })),
      },
    ]),
  );
  const grouped = (perspectives ?? []).map((p) => ({
    perspective: p,
    inds: (indicators ?? []).filter((i) => i.perspectiveId === p.id && i.active),
  }));

  return (
    <div className="fade-up">
      <PageToolbar
        title="Metas e Resultados"
        subtitle={`Lançamento manual — ${periodLabel}`}
      />

      <Card className="card-elegant border-0">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Lançamentos do período {entriesLoading && <Loader2 className="inline h-3.5 w-3.5 animate-spin ml-2" />}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Digite a meta e o resultado de cada indicador. Os valores são salvos automaticamente ao sair do campo.
            Para indicadores percentuais, use o formato "75%" ou "0,75" (com % explícito).
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground text-xs uppercase tracking-wide">
                <th className="text-left py-2 pr-2 font-medium">Indicador</th>
                <th className="text-right py-2 px-2 font-medium w-36">Meta</th>
                <th className="text-right py-2 px-2 font-medium w-36">Resultado</th>
                <th className="text-left py-2 px-2 font-medium w-44">Regra aplicada</th>
                <th className="text-center py-2 pl-2 font-medium w-24">Score calculado</th>
              </tr>
            </thead>
            <tbody>
              {grouped.map(({ perspective, inds }) => (
                <>
                  <tr key={`p-${perspective.id}`}>
                    <td colSpan={5} className="pt-4 pb-1">
                      <span className="inline-flex items-center gap-2 font-semibold text-[11px] uppercase tracking-wider">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: perspColor.get(perspective.id) }} />
                        {perspective.name}
                      </span>
                    </td>
                  </tr>
                  {inds.map((ind) => {
                    const d = draft[ind.id] ?? { goal: "", result: "" };
                    const goal = parseNum(d.goal);
                    const result = parseNum(d.result);
                    const rule = ind.calibrationRuleId ? ruleById.get(ind.calibrationRuleId) : undefined;
                    const score = rule
                      ? computeScoreWithRule(rule, goal, result)
                      : computeScore(ind.scaleType as ScaleType, goal, result);
                    return (
                      <tr key={ind.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="py-1.5 pr-2">
                          <p className="font-medium">{ind.name}</p>
                          <p className="text-[11px] text-muted-foreground">{ind.unit === "percent" ? "Percentual" : ind.unit === "currency" ? "R$" : "Número"}</p>
                        </td>
                        <td className="py-1.5 px-2">
                          <Input
                            className="h-8 text-right kpi-number bg-background"
                            value={d.goal}
                            placeholder="—"
                            onChange={(e) =>
                              setDraft((prev) => ({ ...prev, [ind.id]: { ...prev[ind.id], goal: e.target.value } }))
                            }
                            onBlur={() => handleBlur(ind.id)}
                          />
                        </td>
                        <td className="py-1.5 px-2">
                          <Input
                            className="h-8 text-right kpi-number bg-background"
                            value={d.result}
                            placeholder="—"
                            onChange={(e) =>
                              setDraft((prev) => ({ ...prev, [ind.id]: { ...prev[ind.id], result: e.target.value } }))
                            }
                            onBlur={() => handleBlur(ind.id)}
                          />
                        </td>
                        <td className="py-1.5 px-2">
                          <span className="text-xs text-muted-foreground">
                            {rule ? rule.name : "Escala legada"}
                          </span>
                        </td>
                        <td className="py-1.5 pl-2 text-center">
                          {savingId === ind.id ? (
                            <Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" />
                          ) : (
                            <ScoreBadge score={score} />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-muted-foreground mt-4">
            O score é calculado em tempo real aplicando a regra de calibragem de cada indicador sobre o atingimento
            (Resultado ÷ Meta). A meta vem pré-preenchida do cadastro do indicador e pode ser editada mês a mês.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
