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
import { useApp } from "@/contexts/AppContext";
import type { Indicator, Perspective } from "@/lib/apiTypes";
import { trpcApi } from "@/lib/trpcApi";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const PRESET_COLORS = ["#1e3a5f", "#c9a227", "#0891b2", "#7c3aed", "#15803d", "#dc2626", "#ea580c", "#db2777"];

interface MutationResult<TInput> {
  mutate: (input: TInput) => void;
  isPending: boolean;
}

interface PerspectivesApi {
  useUtils: () => {
    perspectives: { invalidate: () => void };
    dashboard: { invalidate: () => void };
    invalidate: () => void;
  };
  perspectives: {
    list: {
      useQuery: (
        input: { companyId: number | undefined },
        opts: { enabled: boolean },
      ) => { data: Perspective[] | undefined; isLoading: boolean };
    };
    create: {
      useMutation: (opts: {
        onSuccess: () => void;
        onError: (e: { message: string }) => void;
      }) => MutationResult<{ companyId: number; name: string; color: string; sortOrder: number }>;
    };
    update: {
      useMutation: (opts: {
        onSuccess: () => void;
        onError: (e: { message: string }) => void;
      }) => MutationResult<{ id: number; name?: string; color?: string; sortOrder?: number }>;
    };
    delete: {
      useMutation: (opts: {
        onSuccess: () => void;
        onError: (e: { message: string }) => void;
      }) => MutationResult<{ id: number }>;
    };
  };
  indicators: {
    list: {
      useQuery: (
        input: { companyId: number | undefined },
        opts: { enabled: boolean },
      ) => { data: Indicator[] | undefined };
    };
  };
}

export default function CadastroPerspectivas() {
  const { companyId } = useApp();
  const api = trpcApi as PerspectivesApi;
  const utils = api.useUtils();
  const { data: perspectives, isLoading } = api.perspectives.list.useQuery(
    { companyId: companyId ?? undefined },
    { enabled: !!companyId },
  );
  const { data: indicators } = api.indicators.list.useQuery(
    { companyId: companyId ?? undefined },
    { enabled: !!companyId },
  );

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<{ id: number | null; name: string; color: string; sortOrder: number }>({
    id: null,
    name: "",
    color: PRESET_COLORS[0],
    sortOrder: 0,
  });
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const invalidate = () => {
    utils.perspectives.invalidate();
    utils.dashboard.invalidate();
  };

  const createMut = api.perspectives.create.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success("Perspectiva criada");
      setDialogOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = api.perspectives.update.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success("Perspectiva atualizada");
      setDialogOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = api.perspectives.delete.useMutation({
    onSuccess: () => {
      utils.invalidate();
      toast.success("Perspectiva excluída");
      setDeleteId(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSave = () => {
    if (!companyId) return;
    if (!editing.name.trim()) {
      toast.error("Informe o nome da perspectiva");
      return;
    }
    if (editing.id) {
      updateMut.mutate({
        id: editing.id,
        name: editing.name.trim(),
        color: editing.color,
        sortOrder: editing.sortOrder,
      });
    } else {
      createMut.mutate({
        companyId,
        name: editing.name.trim(),
        color: editing.color,
        sortOrder: editing.sortOrder,
      });
    }
  };

  if (isLoading || !companyId) return <PageSkeleton />;

  return (
    <div className="fade-up">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="page-title font-serif text-3xl">Perspectivas</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Perspectivas estratégicas do Balanced Scorecard (ex.: Financeira, Mercado e Clientes)
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button
              onClick={() =>
                setEditing({ id: null, name: "", color: PRESET_COLORS[0], sortOrder: (perspectives?.length ?? 0) + 1 })
              }
            >
              <Plus className="h-4 w-4 mr-1.5" /> Nova perspectiva
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing.id ? "Editar perspectiva" : "Nova perspectiva"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>Nome</Label>
                <Input
                  value={editing.name}
                  onChange={(e) => setEditing((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Ex.: Financeira"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Cor</Label>
                <div className="flex flex-wrap gap-2">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`h-8 w-8 rounded-full transition-transform ${
                        editing.color === c ? "ring-2 ring-offset-2 ring-primary scale-110" : "hover:scale-105"
                      }`}
                      style={{ backgroundColor: c }}
                      onClick={() => setEditing((p) => ({ ...p, color: c }))}
                    />
                  ))}
                </div>
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

      <Card className="card-elegant border-0">
        <CardContent className="pt-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground text-xs uppercase tracking-wide">
                <th className="text-left py-2 pr-2 font-medium w-16">Ordem</th>
                <th className="text-left py-2 px-2 font-medium">Nome</th>
                <th className="text-center py-2 px-2 font-medium w-32">Indicadores</th>
                <th className="text-right py-2 pl-2 font-medium w-24">Ações</th>
              </tr>
            </thead>
            <tbody>
              {perspectives?.map((p) => (
                <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="py-2.5 pr-2 kpi-number text-muted-foreground">{p.sortOrder}</td>
                  <td className="py-2.5 px-2">
                    <span className="inline-flex items-center gap-2 font-medium">
                      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: p.color || "#1e3a5f" }} />
                      {p.name}
                    </span>
                  </td>
                  <td className="py-2.5 px-2 text-center kpi-number">
                    {indicators?.filter((i) => i.perspectiveId === p.id).length ?? 0}
                  </td>
                  <td className="py-2.5 pl-2 text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => {
                        setEditing({ id: p.id, name: p.name, color: p.color || PRESET_COLORS[0], sortOrder: p.sortOrder });
                        setDialogOpen(true);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() => setDeleteId(p.id)}
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
            <AlertDialogTitle>Excluir perspectiva?</AlertDialogTitle>
            <AlertDialogDescription>
              Todos os indicadores desta perspectiva e seus lançamentos também serão excluídos. Esta ação não pode
              ser desfeita.
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
