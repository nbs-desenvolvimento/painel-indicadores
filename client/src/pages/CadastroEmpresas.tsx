import { PageSkeleton, PageToolbar } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useApp } from "@/contexts/AppContext";
import type { Company } from "@/lib/apiTypes";
import { confirmCompanySwitch } from "@/lib/confirmCompanySwitch";
import { trpcApi } from "@/lib/trpcApi";
import { Building2, Check, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface MutationResult<TInput, TOutput> {
  mutate: (input: TInput) => void;
  isPending: boolean;
}

interface CompaniesApi {
  useUtils: () => { companies: { list: { invalidate: () => void } }; invalidate: () => void };
  companies: {
    list: { useQuery: () => { data: Company[] | undefined; isLoading: boolean } };
    create: {
      useMutation: (opts: {
        onSuccess: () => void;
        onError: (e: { message: string }) => void;
      }) => MutationResult<{ name: string; cnpj?: string }, { id: number }>;
    };
    update: {
      useMutation: (opts: {
        onSuccess: () => void;
        onError: (e: { message: string }) => void;
      }) => MutationResult<{ id: number; name?: string; cnpj?: string }, { success: true }>;
    };
    delete: {
      useMutation: (opts: {
        onSuccess: () => void;
        onError: (e: { message: string }) => void;
      }) => MutationResult<{ id: number }, { success: true }>;
    };
  };
}

export default function CadastroEmpresas() {
  const api = trpcApi as CompaniesApi;
  const utils = api.useUtils();
  const { companyId, setCompanyId } = useApp();
  const { data: companies, isLoading } = api.companies.list.useQuery();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<{ id: number | null; name: string; cnpj: string }>({
    id: null,
    name: "",
    cnpj: "",
  });
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const handleSelect = async (c: Company) => {
    if (c.id === companyId) return;
    const currentName = companies?.find((x) => x.id === companyId)?.name;
    const ok = await confirmCompanySwitch(currentName, c.name);
    if (ok) setCompanyId(c.id);
  };

  const createMut = api.companies.create.useMutation({
    onSuccess: () => {
      utils.companies.list.invalidate();
      toast.success("Empresa criada");
      setDialogOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = api.companies.update.useMutation({
    onSuccess: () => {
      utils.companies.list.invalidate();
      toast.success("Empresa atualizada");
      setDialogOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = api.companies.delete.useMutation({
    onSuccess: () => {
      utils.invalidate();
      toast.success("Empresa excluída");
      setDeleteId(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSave = () => {
    if (!editing.name.trim()) {
      toast.error("Informe o nome da empresa");
      return;
    }
    if (editing.id) {
      updateMut.mutate({ id: editing.id, name: editing.name.trim(), cnpj: editing.cnpj.trim() || undefined });
    } else {
      createMut.mutate({ name: editing.name.trim(), cnpj: editing.cnpj.trim() || undefined });
    }
  };

  if (isLoading) return <PageSkeleton />;

  return (
    <div className="fade-up">
      <PageToolbar title="Empresas" subtitle="Cadastro e gestão das empresas do grupo" hideMonth hideYear>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => setEditing({ id: null, name: "", cnpj: "" })}>
              <Plus className="h-4 w-4 mr-1.5" /> Nova empresa
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing.id ? "Editar empresa" : "Nova empresa"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>Nome</Label>
                <Input
                  value={editing.name}
                  onChange={(e) => setEditing((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Ex.: Grupo Policontrol"
                />
              </div>
              <div className="space-y-1.5">
                <Label>CNPJ (opcional)</Label>
                <Input
                  value={editing.cnpj}
                  onChange={(e) => setEditing((p) => ({ ...p, cnpj: e.target.value }))}
                  placeholder="00.000.000/0000-00"
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
      </PageToolbar>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {companies?.map((c) => {
          const isActive = c.id === companyId;
          return (
            <Card
              key={c.id}
              className={`card-elegant border-0 ${isActive ? "ring-2 ring-primary/60" : ""}`}
            >
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between gap-2 text-base">
                  <span className="flex items-center gap-2 truncate">
                    <Building2 className="h-4 w-4 text-accent shrink-0" />
                    <span className="truncate">{c.name}</span>
                  </span>
                  {isActive && (
                    <Badge className="bg-primary/15 text-primary border-0 shrink-0">
                      <Check className="h-3 w-3 mr-1" /> Ativa
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">{c.cnpj || "CNPJ não informado"}</p>
                <div className="flex items-center gap-1 shrink-0">
                  {!isActive && (
                    <Button variant="outline" size="sm" className="h-8" onClick={() => handleSelect(c)}>
                      Selecionar
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => {
                      setEditing({ id: c.id, name: c.name, cnpj: c.cnpj || "" });
                      setDialogOpen(true);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => setDeleteId(c.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir empresa?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação excluirá a empresa e todos os dados vinculados: áreas, perspectivas, indicadores, pesos e
              lançamentos. Esta ação não pode ser desfeita.
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
