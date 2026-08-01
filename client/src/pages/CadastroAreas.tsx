import { PageSkeleton, PageToolbar } from "@/components/shared";
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
import { Switch } from "@/components/ui/switch";
import { useApp } from "@/contexts/AppContext";
import type { Area } from "@/lib/apiTypes";
import { trpcApi } from "@/lib/trpcApi";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface MutationResult<TInput> {
  mutate: (input: TInput) => void;
  isPending: boolean;
}

interface AreasApi {
  useUtils: () => { areas: { invalidate: () => void }; dashboard: { invalidate: () => void } };
  areas: {
    list: {
      useQuery: (
        input: { companyId: number | undefined },
        opts: { enabled: boolean },
      ) => { data: Area[] | undefined; isLoading: boolean };
    };
    create: {
      useMutation: (opts: {
        onSuccess: () => void;
        onError: (e: { message: string }) => void;
      }) => MutationResult<{ companyId: number; name: string; parentAreaId: number | null; sortOrder: number }>;
    };
    update: {
      useMutation: (opts: {
        onSuccess: () => void;
        onError: (e: { message: string }) => void;
      }) => MutationResult<{
        id: number;
        name?: string;
        parentAreaId?: number | null;
        sortOrder?: number;
        active?: boolean;
      }>;
    };
    delete: {
      useMutation: (opts: {
        onSuccess: () => void;
        onError: (e: { message: string }) => void;
      }) => MutationResult<{ id: number }>;
    };
  };
}

export default function CadastroAreas() {
  const { companyId } = useApp();
  const api = trpcApi as AreasApi;
  const utils = api.useUtils();
  const { data: areas, isLoading } = api.areas.list.useQuery(
    { companyId: companyId ?? undefined },
    { enabled: !!companyId },
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<{
    id: number | null;
    name: string;
    parentAreaId: number | null;
    sortOrder: number;
    active: boolean;
  }>({
    id: null,
    name: "",
    parentAreaId: null,
    sortOrder: 0,
    active: true,
  });
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const invalidate = () => {
    utils.areas.invalidate();
    utils.dashboard.invalidate();
  };

  const createMut = api.areas.create.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success("Área criada");
      setDialogOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = api.areas.update.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success("Área atualizada");
      setDialogOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = api.areas.delete.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success("Área excluída");
      setDeleteId(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSave = () => {
    if (!companyId) return;
    if (!editing.name.trim()) {
      toast.error("Informe o nome da área");
      return;
    }
    if (editing.id && editing.parentAreaId === editing.id) {
      toast.error("Uma área não pode se subordinar a si mesma");
      return;
    }
    if (editing.id) {
      updateMut.mutate({
        id: editing.id,
        name: editing.name.trim(),
        parentAreaId: editing.parentAreaId,
        sortOrder: editing.sortOrder,
        active: editing.active,
      });
    } else {
      createMut.mutate({
        companyId,
        name: editing.name.trim(),
        parentAreaId: editing.parentAreaId,
        sortOrder: editing.sortOrder,
      });
    }
  };

  if (isLoading || !companyId) return <PageSkeleton />;

  return (
    <div className="fade-up">
      <PageToolbar
        title="Áreas"
        subtitle="Áreas e cargos avaliados (colunas da planilha original)"
        hideMonth
        hideYear
      >
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => setEditing({ id: null, name: "", parentAreaId: null, sortOrder: (areas?.length ?? 0) + 1, active: true })}>
              <Plus className="h-4 w-4 mr-1.5" /> Nova área
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing.id ? "Editar área" : "Nova área"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>Nome</Label>
                <Input
                  value={editing.name}
                  onChange={(e) => setEditing((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Ex.: Diretor Financeiro"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Subordinada a</Label>
                <Select
                  value={editing.parentAreaId ? String(editing.parentAreaId) : "none"}
                  onValueChange={(v) =>
                    setEditing((p) => ({ ...p, parentAreaId: v === "none" ? null : parseInt(v) }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Nenhuma (topo do organograma)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhuma (topo do organograma)</SelectItem>
                    {areas
                      ?.filter((a) => a.active && a.id !== editing.id)
                      .map((a) => (
                        <SelectItem key={a.id} value={String(a.id)}>
                          {a.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Ordem de exibição</Label>
                <Input
                  type="number"
                  value={editing.sortOrder}
                  onChange={(e) => setEditing((p) => ({ ...p, sortOrder: parseInt(e.target.value) || 0 }))}
                />
              </div>
              {editing.id && (
                <div className="flex items-center gap-3">
                  <Switch
                    checked={editing.active}
                    onCheckedChange={(v) => setEditing((p) => ({ ...p, active: v }))}
                  />
                  <Label>Área ativa</Label>
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
      </PageToolbar>

      <Card className="card-elegant border-0">
        <CardContent className="pt-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground text-xs uppercase tracking-wide">
                <th className="text-left py-2 pr-2 font-medium w-16">Ordem</th>
                <th className="text-left py-2 px-2 font-medium">Nome</th>
                <th className="text-left py-2 px-2 font-medium">Subordinada a</th>
                <th className="text-center py-2 px-2 font-medium w-24">Status</th>
                <th className="text-right py-2 pl-2 font-medium w-24">Ações</th>
              </tr>
            </thead>
            <tbody>
              {areas?.map((a) => (
                <tr key={a.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="py-2 pr-2 kpi-number text-muted-foreground">{a.sortOrder}</td>
                  <td className="py-2 px-2 font-medium">{a.name}</td>
                  <td className="py-2 px-2 text-muted-foreground">
                    {a.parentAreaId ? (areas?.find((x) => x.id === a.parentAreaId)?.name ?? "—") : "—"}
                  </td>
                  <td className="py-2 px-2 text-center">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        a.active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {a.active ? "Ativa" : "Inativa"}
                    </span>
                  </td>
                  <td className="py-2 pl-2 text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => {
                        setEditing({ id: a.id, name: a.name, parentAreaId: a.parentAreaId ?? null, sortOrder: a.sortOrder, active: a.active });
                        setDialogOpen(true);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() => setDeleteId(a.id)}
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
            <AlertDialogTitle>Excluir área?</AlertDialogTitle>
            <AlertDialogDescription>
              Os pesos e aplicabilidades vinculados a esta área também serão removidos. Esta ação não pode ser
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
