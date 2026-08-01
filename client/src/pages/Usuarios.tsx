import { EmptyState, PageSkeleton, PageToolbar } from "@/components/shared";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/useAuth";
import type { Area, Company, Role, UserListItem } from "@/lib/apiTypes";
import { trpcApi } from "@/lib/trpcApi";
import { Check, KeyRound, Pencil, Plus, ShieldCheck, Trash2, User } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface MutationResult<TInput> {
  mutate: (input: TInput) => void;
  isPending: boolean;
}

interface UsersApi {
  useUtils: () => { users: { list: { invalidate: () => void } } };
  users: {
    list: { useQuery: () => { data: UserListItem[] | undefined; isLoading: boolean } };
    create: {
      useMutation: (opts: {
        onSuccess: () => void;
        onError: (e: { message: string }) => void;
      }) => MutationResult<{
        email: string;
        name?: string;
        password: string;
        role: Role;
        areaIds?: number[];
        companyIds?: number[];
      }>;
    };
    update: {
      useMutation: (opts: {
        onSuccess: () => void;
        onError: (e: { message: string }) => void;
      }) => MutationResult<{
        id: number;
        name?: string;
        email?: string;
        role?: Role;
        active?: boolean;
        areaIds?: number[];
        companyIds?: number[];
      }>;
    };
    delete: {
      useMutation: (opts: {
        onSuccess: () => void;
        onError: (e: { message: string }) => void;
      }) => MutationResult<{ id: number }>;
    };
    resetPassword: {
      useMutation: (opts: {
        onSuccess: () => void;
        onError: (e: { message: string }) => void;
      }) => MutationResult<{ userId: number; newPassword: string }>;
    };
  };
  areas: {
    list: {
      useQuery: (
        input: { companyId: number | undefined },
        opts: { enabled: boolean },
      ) => { data: Area[] | undefined };
    };
  };
  companies: {
    list: { useQuery: () => { data: Company[] | undefined } };
  };
}

interface EditState {
  id: number | null;
  name: string;
  email: string;
  password: string;
  role: Role;
  areaIds: Set<number>;
  companyIds: Set<number>;
}

const emptyEdit: EditState = {
  id: null,
  name: "",
  email: "",
  password: "",
  role: "user",
  areaIds: new Set(),
  companyIds: new Set(),
};

export default function Usuarios() {
  const { user: me } = useAuth();
  const api = trpcApi as UsersApi;
  const utils = api.useUtils();
  const { data: users, isLoading } = api.users.list.useQuery();
  const { data: companies } = api.companies.list.useQuery();
  // Sem companyId: admin vê as áreas de todas as empresas — filtra client-side pelas empresas marcadas no form.
  const { data: areas } = api.areas.list.useQuery({ companyId: undefined }, { enabled: true });
  const companyName = new Map((companies ?? []).map((c) => [c.id, c.name]));

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<EditState>(emptyEdit);
  const [resetTarget, setResetTarget] = useState<{ id: number; name: string } | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const activeAreas = (areas ?? []).filter(
    (a) => a.active && (editing.companyIds.size === 0 || editing.companyIds.has(a.companyId)),
  );

  const invalidate = () => utils.users.list.invalidate();

  const createMut = api.users.create.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success("Usuário criado");
      setDialogOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = api.users.update.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success("Usuário atualizado");
      setDialogOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = api.users.delete.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success("Usuário excluído");
      setDeleteId(null);
    },
    onError: (e) => toast.error(e.message),
  });
  const resetPasswordMut = api.users.resetPassword.useMutation({
    onSuccess: () => {
      toast.success("Senha redefinida");
      setResetTarget(null);
      setNewPassword("");
    },
    onError: (e) => toast.error(e.message),
  });

  const openCreate = () => {
    setEditing(emptyEdit);
    setDialogOpen(true);
  };

  const openEdit = (u: UserListItem) => {
    setEditing({
      id: u.id,
      name: u.name ?? "",
      email: u.email,
      password: "",
      role: u.role,
      areaIds: new Set(u.areaIds ?? []),
      companyIds: new Set(u.companyIds ?? []),
    });
    setDialogOpen(true);
  };

  const toggleArea = (id: number) => {
    setEditing((p) => {
      const next = new Set(p.areaIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...p, areaIds: next };
    });
  };

  const toggleCompany = (id: number) => {
    setEditing((p) => {
      const next = new Set(p.companyIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      // Áreas de empresas que saíram da seleção não fazem mais sentido continuar marcadas.
      const nextAreaIds = new Set(
        Array.from(p.areaIds).filter((areaId) => {
          const area = (areas ?? []).find((a) => a.id === areaId);
          return area && next.has(area.companyId);
        }),
      );
      return { ...p, companyIds: next, areaIds: nextAreaIds };
    });
  };

  const handleSave = () => {
    if (!editing.name.trim()) return toast.error("Informe o nome completo");
    if (!editing.email.trim() || !editing.email.includes("@")) return toast.error("Informe um e-mail válido");
    if (editing.role === "user" && editing.companyIds.size === 0) {
      return toast.error("Selecione ao menos uma empresa para o usuário");
    }

    if (editing.id) {
      updateMut.mutate({
        id: editing.id,
        name: editing.name.trim(),
        email: editing.email.trim(),
        role: editing.role,
        areaIds: editing.role === "user" ? Array.from(editing.areaIds) : [],
        companyIds: editing.role === "user" ? Array.from(editing.companyIds) : [],
      });
    } else {
      if (!editing.password || editing.password.length < 8) {
        return toast.error("Informe uma senha com ao menos 8 caracteres");
      }
      createMut.mutate({
        email: editing.email.trim(),
        name: editing.name.trim() || undefined,
        password: editing.password,
        role: editing.role,
        areaIds: editing.role === "user" ? Array.from(editing.areaIds) : [],
        companyIds: editing.role === "user" ? Array.from(editing.companyIds) : [],
      });
    }
  };

  if (isLoading) return <PageSkeleton />;

  return (
    <div className="fade-up space-y-6">
      <PageToolbar
        title="Usuários"
        subtitle="Cadastre usuários e defina as empresas e áreas que cada um pode ver e lançar. Administradores têm acesso completo, sem restrição de empresa ou área."
        hideMonth
        hideYear
      >
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1.5" /> Novo usuário
        </Button>
      </PageToolbar>

      <Card className="card-elegant border-0">
        <CardContent className="overflow-x-auto pt-6">
          {!users || users.length === 0 ? (
            <EmptyState
              title="Nenhum usuário cadastrado"
              description="Clique em “Novo usuário” para criar o primeiro acesso."
            />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground text-xs uppercase tracking-wide">
                  <th className="text-left py-2 pr-2 font-medium">Nome</th>
                  <th className="text-left py-2 px-2 font-medium">E-mail</th>
                  <th className="text-center py-2 px-2 font-medium">Perfil</th>
                  <th className="text-left py-2 px-2 font-medium">Empresas</th>
                  <th className="text-left py-2 px-2 font-medium">Áreas</th>
                  <th className="text-center py-2 px-2 font-medium w-20">Ativo</th>
                  <th className="text-right py-2 pl-2 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isMe = u.id === me?.id;
                  return (
                    <tr key={u.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 pr-2">
                        <span className="inline-flex items-center gap-2 font-medium">
                          {u.role === "admin" ? (
                            <ShieldCheck className="h-4 w-4 text-accent" />
                          ) : (
                            <User className="h-4 w-4 text-muted-foreground" />
                          )}
                          {u.name || "Sem nome"}
                          {isMe && <span className="text-xs text-muted-foreground">(você)</span>}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-muted-foreground">{u.email}</td>
                      <td className="py-2.5 px-2 text-center">
                        {u.role === "admin" ? (
                          <Badge className="bg-accent/15 text-accent-foreground border-0">
                            <ShieldCheck className="h-3 w-3 mr-1" /> Admin
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Usuário</Badge>
                        )}
                      </td>
                      <td className="py-2.5 px-2 text-xs">
                        {u.role === "admin" ? (
                          <span className="text-muted-foreground">Todas</span>
                        ) : (u.companyIds ?? []).length === 0 ? (
                          <span className="text-muted-foreground italic">Nenhuma</span>
                        ) : (
                          (u.companyIds ?? []).map((id) => companyName.get(id) ?? "?").join(", ")
                        )}
                      </td>
                      <td className="py-2.5 px-2 text-xs">
                        {u.role === "admin" ? (
                          <span className="text-muted-foreground">Todas</span>
                        ) : (u.areaIds ?? []).length === 0 ? (
                          <span className="text-muted-foreground italic">Nenhuma</span>
                        ) : (
                          `${(u.areaIds ?? []).length} área${(u.areaIds ?? []).length > 1 ? "s" : ""}`
                        )}
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        <Switch
                          checked={u.active}
                          disabled={isMe || updateMut.isPending}
                          onCheckedChange={(v) => updateMut.mutate({ id: u.id, active: v })}
                        />
                      </td>
                      <td className="py-2.5 pl-2">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="Redefinir senha"
                            onClick={() => setResetTarget({ id: u.id, name: u.name || u.email })}
                          >
                            <KeyRound className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="Editar"
                            onClick={() => openEdit(u)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            title="Excluir"
                            disabled={isMe}
                            onClick={() => setDeleteId(u.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <p className="text-xs text-muted-foreground mt-4">
            Usuários comuns acessam apenas dashboards, lançamentos e importação das áreas selecionadas.
            Cadastros e configurações são restritos a administradores.
          </p>
        </CardContent>
      </Card>

      {/* Dialog criar/editar */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing.id ? "Editar usuário" : "Novo usuário"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Nome completo</Label>
                <Input
                  value={editing.name}
                  onChange={(e) => setEditing((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Maria da Silva"
                />
              </div>
              <div className="space-y-1.5">
                <Label>E-mail</Label>
                <Input
                  type="email"
                  value={editing.email}
                  onChange={(e) => setEditing((p) => ({ ...p, email: e.target.value }))}
                  placeholder="maria@empresa.com"
                />
              </div>
            </div>
            {!editing.id && (
              <div className="space-y-1.5">
                <Label>Senha inicial</Label>
                <Input
                  type="password"
                  value={editing.password}
                  onChange={(e) => setEditing((p) => ({ ...p, password: e.target.value }))}
                  placeholder="Mínimo 8 caracteres"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Perfil</Label>
              <Select
                value={editing.role}
                onValueChange={(v) => setEditing((p) => ({ ...p, role: v as Role }))}
                disabled={editing.id === me?.id}
              >
                <SelectTrigger className="bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">Usuário comum — dashboards e lançamentos das suas áreas</SelectItem>
                  <SelectItem value="admin">Administrador — acesso completo e configurações</SelectItem>
                </SelectContent>
              </Select>
              {editing.id === me?.id && (
                <p className="text-xs text-muted-foreground pt-1">
                  Você não pode alterar o próprio perfil de administrador.
                </p>
              )}
            </div>
            {editing.role === "user" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Empresas que o usuário pode acessar</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setEditing((p) => ({ ...p, companyIds: new Set((companies ?? []).map((c) => c.id)) }))
                    }
                  >
                    Todas
                  </Button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-40 overflow-y-auto rounded-md border p-2 bg-muted/20">
                  {(companies ?? []).map((c) => {
                    const selected = editing.companyIds.has(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => toggleCompany(c.id)}
                        className={`h-9 rounded-sm px-2 text-xs font-medium flex items-center justify-between gap-1 transition-all border ${
                          selected
                            ? "text-white border-transparent shadow-sm"
                            : "bg-muted/50 border-border/40 text-muted-foreground hover:bg-muted hover:scale-[1.02]"
                        }`}
                        style={selected ? { backgroundColor: "#1e3a5f" } : undefined}
                        title={c.name}
                      >
                        <span className="truncate text-left">{c.name}</span>
                        {selected && <Check className="h-3.5 w-3.5 shrink-0" />}
                      </button>
                    );
                  })}
                  {(companies ?? []).length === 0 && (
                    <p className="col-span-full text-xs text-muted-foreground py-2 text-center">
                      Nenhuma empresa cadastrada. Cadastre uma empresa primeiro.
                    </p>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {editing.companyIds.size} empresa{editing.companyIds.size !== 1 ? "s" : ""} selecionada
                  {editing.companyIds.size !== 1 ? "s" : ""}
                </p>
              </div>
            )}
            {editing.role === "user" && editing.companyIds.size === 0 && (
              <p className="text-xs text-muted-foreground italic">
                Selecione ao menos uma empresa acima para liberar áreas.
              </p>
            )}
            {editing.role === "user" && editing.companyIds.size > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Áreas que o usuário pode ver e lançar</Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setEditing((p) => ({ ...p, areaIds: new Set(activeAreas.map((a) => a.id)) }))}
                    >
                      Todas
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setEditing((p) => ({ ...p, areaIds: new Set() }))}
                    >
                      Nenhuma
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-56 overflow-y-auto rounded-md border p-2 bg-muted/20">
                  {activeAreas.map((a) => {
                    const selected = editing.areaIds.has(a.id);
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
                        title={editing.companyIds.size > 1 ? `${a.name} (${companyName.get(a.companyId) ?? ""})` : a.name}
                      >
                        <span className="truncate text-left">
                          {a.name}
                          {editing.companyIds.size > 1 && (
                            <span className="block text-[10px] opacity-70 truncate">
                              {companyName.get(a.companyId) ?? ""}
                            </span>
                          )}
                        </span>
                        {selected && <Check className="h-3.5 w-3.5 shrink-0" />}
                      </button>
                    );
                  })}
                  {activeAreas.length === 0 && (
                    <p className="col-span-full text-xs text-muted-foreground py-2 text-center">
                      Nenhuma área cadastrada nas empresas selecionadas.
                    </p>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {editing.areaIds.size} área{editing.areaIds.size !== 1 ? "s" : ""} selecionada
                  {editing.areaIds.size !== 1 ? "s" : ""}
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={createMut.isPending || updateMut.isPending}>
              {editing.id ? "Salvar" : "Criar usuário"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog redefinir senha */}
      <Dialog
        open={resetTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setResetTarget(null);
            setNewPassword("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Redefinir senha de {resetTarget?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5 py-2">
            <Label>Nova senha</Label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetTarget(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => resetTarget && resetPasswordMut.mutate({ userId: resetTarget.id, newPassword })}
              disabled={resetPasswordMut.isPending || newPassword.length < 8}
            >
              Redefinir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmação de exclusão */}
      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir usuário?</AlertDialogTitle>
            <AlertDialogDescription>
              O usuário perderá o acesso ao sistema imediatamente. Esta ação não pode ser desfeita.
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
