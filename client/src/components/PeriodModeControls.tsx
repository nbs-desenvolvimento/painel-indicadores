import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { MONTH_NAMES } from "@/contexts/AppContext";
import { derivePeriod, type CalcMode, type ViewScope } from "@/lib/periodMode";
import { useState } from "react";

/**
 * Estado dos controles Ano/Mês/Acumulado/Período de uma tela + o {mode, month}
 * já derivado, pronto pra passar em useDashboardSnapshot/exportMode/exportMonth.
 */
export function usePeriodModeControls(year: number) {
  const [viewScope, setViewScope] = useState<ViewScope>("ano");
  const [calcMode, setCalcMode] = useState<CalcMode>("acumulado");
  const [selectedMonth, setSelectedMonth] = useState<number>(() => new Date().getMonth() + 1);
  const { mode, month } = derivePeriod(viewScope, calcMode, selectedMonth, year);
  return { viewScope, setViewScope, calcMode, setCalcMode, selectedMonth, setSelectedMonth, mode, month };
}

export type PeriodModeControlsState = ReturnType<typeof usePeriodModeControls>;

/** Toggle Ano/Mês (+ Acumulado/Período e seletor de mês quando "Mês") — mesmo padrão visual do Ranking. */
export function PeriodModeToggle({
  viewScope,
  setViewScope,
  calcMode,
  setCalcMode,
  selectedMonth,
  setSelectedMonth,
}: Pick<
  PeriodModeControlsState,
  "viewScope" | "setViewScope" | "calcMode" | "setCalcMode" | "selectedMonth" | "setSelectedMonth"
>) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={viewScope}
        onValueChange={(v) => v && setViewScope(v as ViewScope)}
        className="bg-card shrink-0"
      >
        <ToggleGroupItem value="ano" className="whitespace-nowrap px-3">
          Ano
        </ToggleGroupItem>
        <ToggleGroupItem value="mes" className="whitespace-nowrap px-3">
          Mês
        </ToggleGroupItem>
      </ToggleGroup>
      {viewScope === "mes" && (
        <>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={calcMode}
            onValueChange={(v) => v && setCalcMode(v as CalcMode)}
            className="bg-card shrink-0"
          >
            <ToggleGroupItem value="acumulado" className="whitespace-nowrap px-3">
              Acumulado
            </ToggleGroupItem>
            <ToggleGroupItem value="periodo" className="whitespace-nowrap px-3">
              Período
            </ToggleGroupItem>
          </ToggleGroup>
          <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(parseInt(v))}>
            <SelectTrigger className="w-[130px] bg-card shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTH_NAMES.map((m, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </>
      )}
    </div>
  );
}

/** Badge pequeno indicando o modo de período ativo (ex. "Acumulado Jan–Jun/2026"). */
export function PeriodModeBadge({ label }: { label: string }) {
  return (
    <Badge variant="outline" className="normal-case font-normal text-[11px] text-muted-foreground">
      {label}
    </Badge>
  );
}
