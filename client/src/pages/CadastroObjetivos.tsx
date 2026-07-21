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
import { Textarea } from "@/components/ui/textarea";
import { useApp } from "@/contexts/AppContext";
import { trpc } from "@/lib/trpc";
import { Pencil, Plus, Target, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function CadastroObjetivos() {
  const { companyId } = useApp();
  const utils = trpc.useUtils();
  const { data: objectives, isLoading } = trpc.objectives.list.useQuery(
    { companyId: companyId ?? undefined },
    { enabled: !!companyId },
  );
  const { data: perspectives } = trpc.perspectives.list.useQuery(
    { companyId: companyId ?? undefined },
    { enabled: !!companyId },
  );
  const { data: indicators } = trpc.indicators.list.useQuery(
    { companyId: companyId ?? undefined },
    { enabled: !!companyId },
  );

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<{
    id: number | null;
    name: string;
    description: string;
    perspectiveId: number | null;
    sortOrder: number;
  }>({ id: null, name: "", description: "", perspectiveId: null, sortOrder: 0 });
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const invalidate = () => {
    utils.objectives.invalidate();
    utils.indicators.invalidate();
  };

  const createMut = trpc.objectives.create.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success("Objetivo criado");
      setDialogOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = trpc.objectives.update.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success("Objetivo atualizado");
      setDialogOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = trpc.objectives.delete.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success("Objetivo excluído");
      setDeleteId(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSave = () => {
    if (!companyId) return;
    if (!editing.name.trim()) {
      toast.error("Informe o nome do objetivo");
      return;
    }
    if (!editing.perspectiveId) {
      toast.error("Selecione a perspectiva");
      return;
    }
    if (editing.id) {
      updateMut.mutate({
        id: editing.id,
        name: editing.name.trim(),
        description: editing.description.trim() || null,
        perspectiveId: editing.perspectiveId,
        sortOrder: editing.sortOrder,
      });
    } else {
      createMut.mutate({
        companyId,
        name: editing.name.trim(),
        description: editing.description.trim() || undefined,
        perspectiveId: editing.perspectiveId,
        sortOrder: editing.sortOrder,
      });
    }
  };

  if (isLoading || !companyId) return <PageSkeleton />;

  const orderedPerspectives = [...(perspectives ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="fade-up">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="page-title font-serif text-3xl">Objetivos Estratégicos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Hierarquia: perspectivas → objetivos → indicadores → metas. Cada indicador é vinculado a um objetivo.
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button
              onClick={() =>
                setEditing({
                  id: null,
                  name: "",
                  description: "",
                  perspectiveId: orderedPerspectives[0]?.id ?? null,
                  sortOrder: (objectives?.length ?? 0) + 1,
                })
              }
            >
              <Plus className="h-4 w-4 mr-1.5" /> Novo objetivo
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing.id ? "Editar objetivo" : "Novo objetivo"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>Perspectiva</Label>
                <Select
                  value={editing.perspectiveId ? String(editing.perspectiveId) : undefined}
                  onValueChange={(v) => setEditing((p) => ({ ...p, perspectiveId: Number(v) }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a perspectiva" />
                  </SelectTrigger>
                  <SelectContent>
                    {orderedPerspectives.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Nome do objetivo</Label>
                <Input
                  value={editing.name}
                  onChange={(e) => setEditing((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Ex.: Ampliar a Receita"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Descrição (opcional)</Label>
                <Textarea
                  value={editing.description}
                  onChange={(e) => setEditing((p) => ({ ...p, description: e.target.value }))}
                  rows={2}
                />
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
      </div>

      <div className="space-y-6">
        {orderedPerspectives.map((p) => {
          const objs = (objectives ?? [])
            .filter((o) => o.perspectiveId === p.id)
            .sort((a, b) => a.sortOrder - b.sortOrder);
          return (
            <Card key={p.id} className="card-elegant border-0">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-3">
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: p.color || "#1e3a5f" }} />
                  <h2 className="font-serif text-lg font-semibold">{p.name}</h2>
                  <span className="text-xs text-muted-foreground ml-1">
                    {objs.length} objetivo{objs.length === 1 ? "" : "s"}
                  </span>
                </div>
                {objs.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic py-2">
                    Nenhum objetivo cadastrado nesta perspectiva.
                  </p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground text-xs uppercase tracking-wide">
                        <th className="text-left py-2 pr-2 font-medium w-14">Ordem</th>
                        <th className="text-left py-2 px-2 font-medium">Objetivo</th>
                        <th className="text-center py-2 px-2 font-medium w-28">Indicadores</th>
                        <th className="text-right py-2 pl-2 font-medium w-24">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {objs.map((o) => (
                        <tr key={o.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                          <td className="py-2.5 pr-2 kpi-number text-muted-foreground">{o.sortOrder}</td>
                          <td className="py-2.5 px-2">
                            <span className="inline-flex items-center gap-2 font-medium">
                              <Target className="h-3.5 w-3.5 text-primary/60" />
                              {o.name}
                            </span>
                            {o.description ? (
                              <p className="text-xs text-muted-foreground mt-0.5">{o.description}</p>
                            ) : null}
                          </td>
                          <td className="py-2.5 px-2 text-center kpi-number">
                            {indicators?.filter((i) => i.objectiveId === o.id).length ?? 0}
                          </td>
                          <td className="py-2.5 pl-2 text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => {
                                setEditing({
                                  id: o.id,
                                  name: o.name,
                                  description: o.description ?? "",
                                  perspectiveId: o.perspectiveId,
                                  sortOrder: o.sortOrder,
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
                              onClick={() => setDeleteId(o.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </td>
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

      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir objetivo?</AlertDialogTitle>
            <AlertDialogDescription>
              Os indicadores vinculados a este objetivo não serão excluídos — eles ficarão sem objetivo até serem
              revinculados.
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
