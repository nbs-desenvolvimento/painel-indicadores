import { DirectionIcon, PageSkeleton } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useApp } from "@/contexts/AppContext";
import type { Area, CalibrationRule, Indicator, IndicatorAreaApplicability, Objective, Perspective } from "@/lib/apiTypes";
import { trpcApi } from "@/lib/trpcApi";
import { DIRECTION_LABELS, DIRECTIONS, SCALE_TYPE_LABELS, SCALE_TYPES, type Direction, type ScaleType } from "@/lib/calcEngine";
import { ArrowDown, ArrowUp, Check, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

interface MutationResult<TInput, TOutput = void> {
  mutate: (input: TInput) => void;
  mutateAsync: (input: TInput) => Promise<TOutput>;
  isPending: boolean;
}

interface ListQuery<T, TInput> {
  useQuery: (input: TInput, opts: { enabled: boolean }) => { data: T[] | undefined; isLoading: boolean };
}

interface IndicatorsApi {
  useUtils: () => {
    indicators: { invalidate: () => void };
    dashboard: { invalidate: () => void };
    applicability: { invalidate: () => void };
  };
  indicators: {
    list: ListQuery<Indicator, { companyId: number | undefined }>;
    create: {
      useMutation: (opts: {
        onSuccess: () => void;
        onError: (e: { message: string }) => void;
      }) => MutationResult<
        {
          companyId: number;
          name: string;
          description?: string;
          perspectiveId: number;
          scaleType: ScaleType;
          direction: Direction;
          objectiveId: number | null;
          calibrationRuleId: number | null;
          defaultGoal: number | null;
          unit: string;
          sortOrder: number;
        },
        { id: number }
      >;
    };
    update: {
      useMutation: (opts: {
        onSuccess: () => void;
        onError: (e: { message: string }) => void;
      }) => MutationResult<{
        id: number;
        name?: string;
        description?: string;
        perspectiveId?: number;
        scaleType?: ScaleType;
        direction?: Direction;
        objectiveId?: number | null;
        calibrationRuleId?: number | null;
        defaultGoal?: number | null;
        unit?: string;
        sortOrder?: number;
      }>;
    };
    delete: {
      useMutation: (opts: {
        onSuccess: () => void;
        onError: (e: { message: string }) => void;
      }) => MutationResult<{ id: number }>;
    };
  };
  perspectives: { list: ListQuery<Perspective, { companyId: number | undefined }> };
  objectives: { list: ListQuery<Objective, { companyId: number | undefined }> };
  calibrationRules: { list: ListQuery<CalibrationRule, { companyId: number | undefined }> };
  areas: { list: ListQuery<Area, { companyId: number | undefined }> };
  applicability: {
    list: {
      useQuery: (
        input: { indicatorIds: number[] },
        opts: { enabled: boolean },
      ) => { data: IndicatorAreaApplicability[] | undefined };
    };
    setForIndicator: {
      useMutation: (opts: { onError: (e: { message: string }) => void }) => MutationResult<{
        indicatorId: number;
        areaIds: number[];
      }>;
    };
  };
}
const UNITS = [
  { value: "number", label: "Número" },
  { value: "percent", label: "Percentual" },
  { value: "currency", label: "Moeda (R$)" },
];

interface EditState {
  id: number | null;
  name: string;
  description: string;
  perspectiveId: string;
  scaleType: ScaleType;
  direction: Direction;
  objectiveId: string;
  calibrationRuleId: string;
  defaultGoal: string;
  unit: string;
  sortOrder: number;
}

const NONE = "none";

export default function CadastroIndicadores() {
  const { companyId } = useApp();
  const api = trpcApi as IndicatorsApi;
  const utils = api.useUtils();
  const { data: indicators, isLoading } = api.indicators.list.useQuery(
    { companyId: companyId ?? undefined },
    { enabled: !!companyId },
  );
  const { data: perspectives } = api.perspectives.list.useQuery(
    { companyId: companyId ?? undefined },
    { enabled: !!companyId },
  );

  const { data: objectives } = api.objectives.list.useQuery(
    { companyId: companyId ?? undefined },
    { enabled: !!companyId },
  );
  const { data: rules } = api.calibrationRules.list.useQuery(
    { companyId: companyId ?? undefined },
    { enabled: !!companyId },
  );

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<EditState>({
    id: null,
    name: "",
    description: "",
    perspectiveId: "",
    scaleType: "higher_better_120",
    direction: "higher_better",
    objectiveId: NONE,
    calibrationRuleId: NONE,
    defaultGoal: "",
    unit: "number",
    sortOrder: 0,
  });
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [filterPersp, setFilterPersp] = useState<string>("all");
  const [selectedAreas, setSelectedAreas] = useState<Set<number>>(new Set());

  const { data: areas } = api.areas.list.useQuery(
    { companyId: companyId ?? undefined },
    { enabled: !!companyId },
  );
  const indicatorIds = useMemo(() => (indicators ?? []).map((i) => i.id), [indicators]);
  const { data: applRows } = api.applicability.list.useQuery(
    { indicatorIds },
    { enabled: indicatorIds.length > 0 },
  );
  const setForIndicatorMut = api.applicability.setForIndicator.useMutation({
    onError: (e) => toast.error(`Falha ao vincular áreas: ${e.message}`),
  });

  // Contagem de áreas vinculadas por indicador (para a tabela)
  const areaCountByIndicator = useMemo(() => {
    const m = new Map<number, number>();
    for (const r of applRows ?? []) {
      if (r.applicable) m.set(r.indicatorId, (m.get(r.indicatorId) ?? 0) + 1);
    }
    return m;
  }, [applRows]);

  // Ao abrir o dialog para editar, carrega as áreas vinculadas atuais.
  // Depende também de applRows para sincronizar caso os dados cheguem após a abertura.
  const [touchedAreas, setTouchedAreas] = useState(false);
  useEffect(() => {
    if (!dialogOpen || touchedAreas) return;
    if (editing.id) {
      const ids = new Set(
        (applRows ?? [])
          .filter((r) => r.indicatorId === editing.id && r.applicable)
          .map((r) => r.areaId),
      );
      setSelectedAreas(ids);
    } else {
      setSelectedAreas(new Set());
    }
  }, [dialogOpen, editing.id, applRows, touchedAreas]);

  // Reseta o flag de interação quando o dialog fecha/abre
  useEffect(() => {
    if (dialogOpen) setTouchedAreas(false);
  }, [dialogOpen]);

  const toggleArea = (areaId: number) => {
    setTouchedAreas(true);
    setSelectedAreas((prev) => {
      const next = new Set(prev);
      if (next.has(areaId)) next.delete(areaId);
      else next.add(areaId);
      return next;
    });
  };

  const invalidate = () => {
    utils.indicators.invalidate();
    utils.dashboard.invalidate();
  };

  const createMut = api.indicators.create.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success("Indicador criado");
      setDialogOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = api.indicators.update.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success("Indicador atualizado");
      setDialogOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = api.indicators.delete.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success("Indicador excluído");
      setDeleteId(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSave = async () => {
    if (!companyId) return;
    if (!editing.name.trim() || !editing.perspectiveId) {
      toast.error("Informe o nome e a perspectiva do indicador");
      return;
    }
    const defaultGoalNum =
      editing.defaultGoal.trim() === "" ? null : Number(editing.defaultGoal.trim().replace(",", "."));
    if (defaultGoalNum !== null && Number.isNaN(defaultGoalNum)) {
      toast.error("Meta padrão inválida");
      return;
    }
    const payload = {
      name: editing.name.trim(),
      description: editing.description.trim() || undefined,
      perspectiveId: parseInt(editing.perspectiveId),
      scaleType: editing.scaleType,
      direction: editing.direction,
      objectiveId: editing.objectiveId === NONE ? null : parseInt(editing.objectiveId),
      calibrationRuleId: editing.calibrationRuleId === NONE ? null : parseInt(editing.calibrationRuleId),
      defaultGoal: defaultGoalNum,
      unit: editing.unit,
      sortOrder: editing.sortOrder,
    };
    try {
      let indicatorId = editing.id;
      if (editing.id) {
        await updateMut.mutateAsync({ id: editing.id, ...payload });
      } else {
        const created = await createMut.mutateAsync({ companyId, ...payload });
        indicatorId = (created as { id?: number })?.id ?? null;
      }
      if (indicatorId) {
        try {
          await setForIndicatorMut.mutateAsync({ indicatorId, areaIds: Array.from(selectedAreas) });
        } catch {
          // Indicador foi salvo, mas a vinculação falhou: mantém o dialog aberto para nova tentativa
          utils.indicators.invalidate();
          return;
        }
      }
      utils.applicability.invalidate();
      invalidate();
    } catch {
      /* erros de criação/atualização já tratados nos onError das mutações */
    }
  };

  if (isLoading || !companyId) return <PageSkeleton />;

  const perspName = new Map(perspectives?.map((p) => [p.id, p.name]) ?? []);
  const perspColor = new Map(perspectives?.map((p) => [p.id, p.color || "#1e3a5f"]) ?? []);
  const objName = new Map(objectives?.map((o) => [o.id, o.name]) ?? []);
  const ruleName = new Map(rules?.map((r) => [r.id, r.name]) ?? []);
  const objectivesOfPersp = (objectives ?? []).filter(
    (o) => editing.perspectiveId && o.perspectiveId === parseInt(editing.perspectiveId),
  );
  const shown = (indicators ?? []).filter((i) => filterPersp === "all" || String(i.perspectiveId) === filterPersp);

  return (
    <div className="fade-up">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="page-title font-serif text-3xl">Indicadores</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Objetivos estratégicos e suas escalas de pontuação por degraus
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filterPersp} onValueChange={setFilterPersp}>
            <SelectTrigger className="w-[200px] bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as perspectivas</SelectItem>
              {perspectives?.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button
                onClick={() =>
                  setEditing({
                    id: null,
                    name: "",
                    description: "",
                    perspectiveId: perspectives?.[0] ? String(perspectives[0].id) : "",
                    scaleType: "higher_better_120",
                    direction: "higher_better",
                    objectiveId: NONE,
                    calibrationRuleId: rules?.[0] ? String(rules[0].id) : NONE,
                    defaultGoal: "",
                    unit: "number",
                    sortOrder: (indicators?.length ?? 0) + 1,
                  })
                }
              >
                <Plus className="h-4 w-4 mr-1.5" /> Novo indicador
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editing.id ? "Editar indicador" : "Novo indicador"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label>Nome</Label>
                  <Input
                    value={editing.name}
                    onChange={(e) => setEditing((p) => ({ ...p, name: e.target.value }))}
                    placeholder="Ex.: Ampliar a Receita"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Descrição / métrica (opcional)</Label>
                  <Textarea
                    value={editing.description}
                    onChange={(e) => setEditing((p) => ({ ...p, description: e.target.value }))}
                    placeholder="Ex.: Receita Bruta mensal em R$"
                    rows={2}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Perspectiva</Label>
                    <Select
                      value={editing.perspectiveId}
                      onValueChange={(v) => setEditing((p) => ({ ...p, perspectiveId: v, objectiveId: NONE }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {perspectives?.map((p) => (
                          <SelectItem key={p.id} value={String(p.id)}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Unidade</Label>
                    <Select value={editing.unit} onValueChange={(v) => setEditing((p) => ({ ...p, unit: v }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {UNITS.map((u) => (
                          <SelectItem key={u.value} value={u.value}>
                            {u.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Objetivo estratégico</Label>
                  <Select
                    value={editing.objectiveId}
                    onValueChange={(v) => setEditing((p) => ({ ...p, objectiveId: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o objetivo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Sem objetivo</SelectItem>
                      {objectivesOfPersp.map((o) => (
                        <SelectItem key={o.id} value={String(o.id)}>
                          {o.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground pt-1">
                    Somente objetivos da perspectiva selecionada. Cadastre novos em “Objetivos”.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label>Regra de calibragem do score</Label>
                  <Select
                    value={editing.calibrationRuleId}
                    onValueChange={(v) => setEditing((p) => ({ ...p, calibrationRuleId: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a regra" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Nenhuma — usar escala padrão (legado)</SelectItem>
                      {(rules ?? []).map((r) => (
                        <SelectItem key={r.id} value={String(r.id)}>
                          {r.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground pt-1">
                    Converte o atingimento (Resultado ÷ Meta) em score conforme as faixas configuradas em “Regras
                    de Calibragem”. Sem regra selecionada, o indicador usa a escala padrão abaixo.
                  </p>
                </div>
                {editing.calibrationRuleId === NONE && (
                  <div className="space-y-1.5">
                    <Label>Escala padrão (legado)</Label>
                    <Select
                      value={editing.scaleType}
                      onValueChange={(v) => setEditing((p) => ({ ...p, scaleType: v as ScaleType }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SCALE_TYPES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {SCALE_TYPE_LABELS[s]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground pt-1">
                      Faixas fixas de atingimento aplicadas quando nenhuma regra de calibragem está vinculada.
                    </p>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label>Sentido do indicador</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {DIRECTIONS.map((d) => {
                      const Icon = d === "lower_better" ? ArrowDown : ArrowUp;
                      const selected = editing.direction === d;
                      return (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setEditing((p) => ({ ...p, direction: d }))}
                          className={`h-10 rounded-md px-3 text-sm font-medium flex items-center justify-center gap-2 transition-all border ${
                            selected
                              ? "text-white border-transparent shadow-sm"
                              : "bg-muted/50 border-border/40 text-muted-foreground hover:bg-muted"
                          }`}
                          style={selected ? { backgroundColor: d === "lower_better" ? "#2563eb" : "#15803d" } : undefined}
                        >
                          <Icon className="h-4 w-4 shrink-0" />
                          {DIRECTION_LABELS[d]}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground pt-1">
                    Indica se um resultado maior ou menor que a meta representa uma melhora. Indicadores de
                    redução (ex.: custos, atrasos, acidentes) devem usar “Reduzir é positivo”.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Meta padrão (opcional)</Label>
                    <Input
                      value={editing.defaultGoal}
                      onChange={(e) => setEditing((p) => ({ ...p, defaultGoal: e.target.value }))}
                      placeholder="Ex.: 100000"
                    />
                    <p className="text-xs text-muted-foreground">
                      Pré-preenche a meta nos lançamentos mensais (editável mês a mês).
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Ordem de exibição</Label>
                    <Input
                      type="number"
                      value={editing.sortOrder}
                      onChange={(e) => setEditing((p) => ({ ...p, sortOrder: parseInt(e.target.value) || 0 }))}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label>Áreas vinculadas ao indicador</Label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                        onClick={() => {
                          setTouchedAreas(true);
                          setSelectedAreas(new Set((areas ?? []).map((a) => a.id)));
                        }}
                      >
                        Todas
                      </button>
                      <button
                        type="button"
                        className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                        onClick={() => {
                          setTouchedAreas(true);
                          setSelectedAreas(new Set());
                        }}
                      >
                        Nenhuma
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Clique nas células para marcar as áreas onde este indicador se aplica — mesmo esquema do
                    heatmap. {selectedAreas.size} de {areas?.length ?? 0} áreas selecionadas.
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-56 overflow-y-auto rounded-md border p-2 bg-muted/20">
                    {(areas ?? []).map((a) => {
                      const selected = selectedAreas.has(a.id);
                      return (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => toggleArea(a.id)}
                          className={`h-9 rounded-sm px-2 text-xs font-medium flex items-center justify-between gap-1 transition-all border ${
                            selected
                              ? "text-white border-transparent shadow-sm"
                              : "bg-muted/50 border-border/40 text-muted-foreground hover:bg-muted hover:scale-[1.02]"
                          }`}
                          style={selected ? { backgroundColor: "#1e3a5f" } : undefined}
                          title={a.name}
                        >
                          <span className="truncate text-left">{a.name}</span>
                          {selected && <Check className="h-3.5 w-3.5 shrink-0" />}
                        </button>
                      );
                    })}
                    {(areas ?? []).length === 0 && (
                      <p className="col-span-full text-xs text-muted-foreground py-2 text-center">
                        Nenhuma área cadastrada. Cadastre áreas primeiro.
                      </p>
                    )}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={createMut.isPending || updateMut.isPending || setForIndicatorMut.isPending}
                >
                  Salvar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card className="card-elegant border-0">
        <CardContent className="pt-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground text-xs uppercase tracking-wide">
                <th className="text-left py-2 pr-2 font-medium">Indicador</th>
                <th className="text-left py-2 px-2 font-medium">Perspectiva</th>
                <th className="text-left py-2 px-2 font-medium">Objetivo</th>
                <th className="text-left py-2 px-2 font-medium">Regra de calibragem</th>
                <th className="text-center py-2 px-2 font-medium w-24">Unidade</th>
                <th className="text-center py-2 px-2 font-medium w-20">Áreas</th>
                <th className="text-right py-2 pl-2 font-medium w-24">Ações</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((i) => (
                <tr key={i.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="py-2.5 pr-2">
                    <p className="font-medium flex items-center gap-1.5">
                      <DirectionIcon direction={i.direction} />
                      {i.name}
                    </p>
                    {i.description && <p className="text-xs text-muted-foreground truncate max-w-md">{i.description}</p>}
                  </td>
                  <td className="py-2.5 px-2">
                    <span className="inline-flex items-center gap-2 text-xs">
                      <span
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: perspColor.get(i.perspectiveId) }}
                      />
                      {perspName.get(i.perspectiveId)}
                    </span>
                  </td>
                  <td className="py-2.5 px-2 text-xs">
                    {i.objectiveId ? (
                      objName.get(i.objectiveId)
                    ) : (
                      <span className="text-muted-foreground italic">Sem objetivo</span>
                    )}
                  </td>
                  <td className="py-2.5 px-2 text-xs">
                    {i.calibrationRuleId ? (
                      ruleName.get(i.calibrationRuleId)
                    ) : (
                      <span className="text-muted-foreground">{SCALE_TYPE_LABELS[i.scaleType as ScaleType]} (legado)</span>
                    )}
                  </td>
                  <td className="py-2.5 px-2 text-center text-xs">
                    {UNITS.find((u) => u.value === i.unit)?.label ?? i.unit}
                  </td>
                  <td className="py-2.5 px-2 text-center">
                    <span className="inline-flex items-center justify-center min-w-7 h-6 px-1.5 rounded-full bg-secondary text-secondary-foreground text-xs font-medium">
                      {areaCountByIndicator.get(i.id) ?? 0}
                    </span>
                  </td>
                  <td className="py-2.5 pl-2 text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => {
                        setEditing({
                          id: i.id,
                          name: i.name,
                          description: i.description || "",
                          perspectiveId: String(i.perspectiveId),
                          scaleType: i.scaleType as ScaleType,
                          direction: i.direction,
                          objectiveId: i.objectiveId ? String(i.objectiveId) : NONE,
                          calibrationRuleId: i.calibrationRuleId ? String(i.calibrationRuleId) : NONE,
                          defaultGoal: i.defaultGoal !== null && i.defaultGoal !== undefined ? String(i.defaultGoal) : "",
                          unit: i.unit || "number",
                          sortOrder: i.sortOrder,
                        });
                        setDialogOpen(true);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() => setDeleteId(i.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir indicador?</AlertDialogTitle>
            <AlertDialogDescription>
              Todos os lançamentos de metas e resultados deste indicador serão excluídos. Esta ação não pode ser
              desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => deleteId && deleteMut.mutate({ id: deleteId })}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
