import { PageSkeleton } from "@/components/shared";
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
import { Badge } from "@/components/ui/badge";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useApp } from "@/contexts/AppContext";
import { trpc } from "@/lib/trpc";
import { ArrowRight, Pencil, Plus, Scale, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface RangeDraft {
  minAttainment: string; // percent text, e.g. "95"
  minInclusive: boolean;
  maxAttainment: string;
  maxInclusive: boolean;
  score: string; // percent text, e.g. "120"
}

interface RuleDraft {
  id: number | null;
  name: string;
  description: string;
  directConversion: boolean;
  ranges: RangeDraft[];
}

const emptyRange = (): RangeDraft => ({
  minAttainment: "",
  minInclusive: true,
  maxAttainment: "",
  maxInclusive: false,
  score: "",
});

function pct(v: number | null): string {
  if (v === null || v === undefined) return "";
  return String(Math.round(v * 1000) / 10);
}

function parsePct(s: string): number | null {
  const t = s.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  if (Number.isNaN(n)) return null;
  return n / 100;
}

/** Descreve uma faixa em linguagem natural (ex.: "95% ≤ Resultado < 105% Meta") */
function rangeLabel(r: { minAttainment: number | null; minInclusive: boolean; maxAttainment: number | null; maxInclusive: boolean }): string {
  const parts: string[] = [];
  if (r.minAttainment !== null) {
    parts.push(`Resultado ${r.minInclusive ? "≥" : ">"} ${pct(r.minAttainment)}% Meta`);
  }
  if (r.maxAttainment !== null) {
    parts.push(`Resultado ${r.maxInclusive ? "≤" : "<"} ${pct(r.maxAttainment)}% Meta`);
  }
  if (parts.length === 0) return "Qualquer resultado";
  return parts.join(" e ");
}

export default function CadastroRegras() {
  const { companyId } = useApp();
  const utils = trpc.useUtils();
  const { data: rules, isLoading } = trpc.calibrationRules.list.useQuery(
    { companyId: companyId ?? undefined },
    { enabled: !!companyId },
  );
  const { data: indicators } = trpc.indicators.list.useQuery(
    { companyId: companyId ?? undefined },
    { enabled: !!companyId },
  );

  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<RuleDraft>({
    id: null,
    name: "",
    description: "",
    directConversion: false,
    ranges: [emptyRange()],
  });
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const invalidate = () => {
    utils.calibrationRules.invalidate();
    utils.dashboard.invalidate();
    utils.entries.invalidate();
  };

  const createMut = trpc.calibrationRules.create.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success("Regra criada");
      setDialogOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = trpc.calibrationRules.update.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success("Regra atualizada");
      setDialogOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = trpc.calibrationRules.delete.useMutation({
    onSuccess: () => {
      invalidate();
      utils.indicators.invalidate();
      toast.success("Regra excluída");
      setDeleteId(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const openNew = () => {
    setDraft({ id: null, name: "", description: "", directConversion: false, ranges: [emptyRange()] });
    setDialogOpen(true);
  };

  const openEdit = (rule: NonNullable<typeof rules>[number]) => {
    setDraft({
      id: rule.id,
      name: rule.name,
      description: rule.description ?? "",
      directConversion: rule.directConversion,
      ranges:
        rule.ranges.length > 0
          ? rule.ranges.map((r) => ({
              minAttainment: pct(r.minAttainment),
              minInclusive: r.minInclusive,
              maxAttainment: pct(r.maxAttainment),
              maxInclusive: r.maxInclusive,
              score: pct(r.score),
            }))
          : [emptyRange()],
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!companyId) return;
    if (!draft.name.trim()) {
      toast.error("Informe o nome da regra");
      return;
    }
    let ranges: {
      minAttainment: number | null;
      minInclusive: boolean;
      maxAttainment: number | null;
      maxInclusive: boolean;
      score: number;
      sortOrder: number;
    }[] = [];
    if (!draft.directConversion) {
      for (let i = 0; i < draft.ranges.length; i++) {
        const r = draft.ranges[i];
        const min = parsePct(r.minAttainment);
        const max = parsePct(r.maxAttainment);
        const score = parsePct(r.score);
        if (min === null && max === null) {
          toast.error(`Faixa ${i + 1}: informe ao menos um limite (mínimo ou máximo)`);
          return;
        }
        if (score === null) {
          toast.error(`Faixa ${i + 1}: informe o score`);
          return;
        }
        ranges.push({
          minAttainment: min,
          minInclusive: r.minInclusive,
          maxAttainment: max,
          maxInclusive: r.maxInclusive,
          score,
          sortOrder: i + 1,
        });
      }
      if (ranges.length === 0) {
        toast.error("Adicione ao menos uma faixa");
        return;
      }
    }
    if (draft.id) {
      updateMut.mutate({
        id: draft.id,
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        directConversion: draft.directConversion,
        ranges,
      });
    } else {
      createMut.mutate({
        companyId,
        name: draft.name.trim(),
        description: draft.description.trim() || undefined,
        directConversion: draft.directConversion,
        sortOrder: (rules?.length ?? 0) + 1,
        ranges,
      });
    }
  };

  if (isLoading || !companyId) return <PageSkeleton />;

  return (
    <div className="fade-up">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="page-title font-serif text-3xl">Regras de Calibragem</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Faixas de atingimento (Resultado ÷ Meta) que convertem o desempenho do indicador em score. A regra é
            escolhida no cadastro de cada indicador.
          </p>
        </div>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4 mr-1.5" /> Nova regra
        </Button>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        {rules?.map((rule) => {
          const linked = indicators?.filter((i) => i.calibrationRuleId === rule.id).length ?? 0;
          return (
            <Card key={rule.id} className="card-elegant border-0">
              <CardContent className="pt-6">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <Scale className="h-4 w-4 text-primary/60 shrink-0" />
                    <div>
                      <h2 className="font-semibold leading-tight">{rule.name}</h2>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {linked} indicador{linked === 1 ? "" : "es"} vinculado{linked === 1 ? "" : "s"}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(rule)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() => setDeleteId(rule.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                {rule.directConversion ? (
                  <div className="rounded-md bg-muted/50 px-3 py-2.5 text-sm flex items-center gap-2">
                    <Badge variant="secondary">Conversão direta</Badge>
                    <span className="text-muted-foreground text-xs">
                      O atingimento do indicador é o próprio score
                    </span>
                  </div>
                ) : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-muted-foreground uppercase tracking-wide border-b">
                        <th className="text-left py-1.5 pr-2 font-medium">Observação</th>
                        <th className="text-right py-1.5 pl-2 font-medium w-24">Desempenho</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rule.ranges.map((r) => (
                        <tr key={r.id} className="border-b last:border-0">
                          <td className="py-1.5 pr-2">{rangeLabel(r)}</td>
                          <td className="py-1.5 pl-2 text-right kpi-number font-semibold">{pct(r.score)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{draft.id ? "Editar regra" : "Nova regra"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Nome da regra</Label>
              <Input
                value={draft.name}
                onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))}
                placeholder="Ex.: Maior-melhor até 120%"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Descrição (opcional)</Label>
              <Input
                value={draft.description}
                onChange={(e) => setDraft((p) => ({ ...p, description: e.target.value }))}
              />
            </div>
            <div className="flex items-center justify-between rounded-md border px-3 py-2.5">
              <div>
                <Label className="cursor-pointer" htmlFor="dc-switch">
                  Conversão direta
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  O resultado de atingimento do indicador será o próprio score (sem faixas)
                </p>
              </div>
              <Switch
                id="dc-switch"
                checked={draft.directConversion}
                onCheckedChange={(v) => setDraft((p) => ({ ...p, directConversion: v }))}
              />
            </div>

            {!draft.directConversion && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Faixas de atingimento (avaliadas em ordem, a primeira que casar define o score)</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDraft((p) => ({ ...p, ranges: [...p.ranges, emptyRange()] }))}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" /> Faixa
                  </Button>
                </div>
                <div className="space-y-2">
                  {draft.ranges.map((r, i) => (
                    <div key={i} className="rounded-md border px-3 py-2.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">Faixa {i + 1}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-destructive"
                          onClick={() =>
                            setDraft((p) => ({ ...p, ranges: p.ranges.filter((_, j) => j !== i) }))
                          }
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-end gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Atingimento mín. (%)</Label>
                          <div className="flex gap-1">
                            <Input
                              className="h-8"
                              placeholder="—"
                              value={r.minAttainment}
                              onChange={(e) =>
                                setDraft((p) => ({
                                  ...p,
                                  ranges: p.ranges.map((x, j) =>
                                    j === i ? { ...x, minAttainment: e.target.value } : x,
                                  ),
                                }))
                              }
                            />
                            <Select
                              value={r.minInclusive ? "gte" : "gt"}
                              onValueChange={(v) =>
                                setDraft((p) => ({
                                  ...p,
                                  ranges: p.ranges.map((x, j) =>
                                    j === i ? { ...x, minInclusive: v === "gte" } : x,
                                  ),
                                }))
                              }
                            >
                              <SelectTrigger className="h-8 w-16">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="gte">≥</SelectItem>
                                <SelectItem value="gt">&gt;</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <span className="pb-2 text-xs text-muted-foreground">a</span>
                        <div className="space-y-1">
                          <Label className="text-xs">Atingimento máx. (%)</Label>
                          <div className="flex gap-1">
                            <Input
                              className="h-8"
                              placeholder="—"
                              value={r.maxAttainment}
                              onChange={(e) =>
                                setDraft((p) => ({
                                  ...p,
                                  ranges: p.ranges.map((x, j) =>
                                    j === i ? { ...x, maxAttainment: e.target.value } : x,
                                  ),
                                }))
                              }
                            />
                            <Select
                              value={r.maxInclusive ? "lte" : "lt"}
                              onValueChange={(v) =>
                                setDraft((p) => ({
                                  ...p,
                                  ranges: p.ranges.map((x, j) =>
                                    j === i ? { ...x, maxInclusive: v === "lte" } : x,
                                  ),
                                }))
                              }
                            >
                              <SelectTrigger className="h-8 w-16">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="lte">≤</SelectItem>
                                <SelectItem value="lt">&lt;</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <ArrowRight className="h-4 w-4 mb-2 text-muted-foreground" />
                        <div className="space-y-1">
                          <Label className="text-xs">Score (%)</Label>
                          <Input
                            className="h-8"
                            placeholder="Ex.: 120"
                            value={r.score}
                            onChange={(e) =>
                              setDraft((p) => ({
                                ...p,
                                ranges: p.ranges.map((x, j) => (j === i ? { ...x, score: e.target.value } : x)),
                              }))
                            }
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Deixe o limite mínimo ou máximo vazio para faixa aberta (ex.: "Resultado &lt; 85%" tem apenas
                  máximo). Percentuais referem-se ao atingimento da meta.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={createMut.isPending || updateMut.isPending}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir regra?</AlertDialogTitle>
            <AlertDialogDescription>
              Os indicadores vinculados a esta regra voltarão a usar a escala legada até que outra regra seja
              atribuída.
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
