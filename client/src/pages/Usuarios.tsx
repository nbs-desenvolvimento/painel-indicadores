import { PageSkeleton } from "@/components/shared";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { KeyRound, Plus, ShieldCheck, User } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const emptyNewUser = { email: "", name: "", password: "", role: "user" as "user" | "admin" };

export default function Usuarios() {
  const { user: me } = useAuth();
  const utils = trpc.useUtils();
  const { data: users, isLoading } = trpc.users.list.useQuery();

  const [createOpen, setCreateOpen] = useState(false);
  const [newUser, setNewUser] = useState(emptyNewUser);

  const [resetTarget, setResetTarget] = useState<{ id: number; name: string } | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const setRoleMut = trpc.users.setRole.useMutation({
    onSuccess: () => {
      utils.users.list.invalidate();
      toast.success("Perfil atualizado");
    },
    onError: (e) => toast.error(e.message),
  });

  const createMut = trpc.users.create.useMutation({
    onSuccess: () => {
      utils.users.list.invalidate();
      toast.success("Usuário criado");
      setCreateOpen(false);
      setNewUser(emptyNewUser);
    },
    onError: (e) => toast.error(e.message),
  });

  const resetPasswordMut = trpc.users.resetPassword.useMutation({
    onSuccess: () => {
      toast.success("Senha redefinida");
      setResetTarget(null);
      setNewPassword("");
    },
    onError: (e) => toast.error(e.message),
  });

  const handleCreate = () => {
    if (!newUser.email.trim() || !newUser.password) {
      toast.error("Informe email e senha");
      return;
    }
    createMut.mutate({
      email: newUser.email.trim(),
      name: newUser.name.trim() || undefined,
      password: newUser.password,
      role: newUser.role,
    });
  };

  if (isLoading) return <PageSkeleton />;

  return (
    <div className="fade-up">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="page-title font-serif text-3xl">Usuários</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Controle de acessos e perfis. Novos usuários são cadastrados pelo administrador.
          </p>
        </div>
        <Dialog
          open={createOpen}
          onOpenChange={(open) => {
            setCreateOpen(open);
            if (!open) setNewUser(emptyNewUser);
          }}
        >
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-1.5" /> Novo usuário
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Novo usuário</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>Nome</Label>
                <Input
                  value={newUser.name}
                  onChange={(e) => setNewUser((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Nome completo"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser((p) => ({ ...p, email: e.target.value }))}
                  placeholder="usuario@empresa.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Senha inicial</Label>
                <Input
                  type="password"
                  value={newUser.password}
                  onChange={(e) => setNewUser((p) => ({ ...p, password: e.target.value }))}
                  placeholder="Mínimo 8 caracteres"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Perfil</Label>
                <Select
                  value={newUser.role}
                  onValueChange={(v) => setNewUser((p) => ({ ...p, role: v as "user" | "admin" }))}
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">Usuário</SelectItem>
                    <SelectItem value="admin">Administrador</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleCreate} disabled={createMut.isPending}>
                Criar usuário
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="card-elegant border-0">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Usuários cadastrados ({users?.length ?? 0})
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground text-xs uppercase tracking-wide">
                <th className="text-left py-2 pr-2 font-medium">Nome</th>
                <th className="text-left py-2 px-2 font-medium">E-mail</th>
                <th className="text-left py-2 px-2 font-medium">Último acesso</th>
                <th className="text-center py-2 px-2 font-medium w-44">Perfil</th>
                <th className="text-center py-2 pl-2 font-medium w-16">Senha</th>
              </tr>
            </thead>
            <tbody>
              {users?.map((u) => (
                <tr key={u.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="py-2.5 pr-2">
                    <span className="inline-flex items-center gap-2 font-medium">
                      {u.role === "admin" ? (
                        <ShieldCheck className="h-4 w-4 text-accent" />
                      ) : (
                        <User className="h-4 w-4 text-muted-foreground" />
                      )}
                      {u.name || "Sem nome"}
                      {u.id === me?.id && <span className="text-xs text-muted-foreground">(você)</span>}
                    </span>
                  </td>
                  <td className="py-2.5 px-2 text-muted-foreground">{u.email || "—"}</td>
                  <td className="py-2.5 px-2 text-muted-foreground">
                    {u.lastSignedIn ? new Date(u.lastSignedIn).toLocaleString("pt-BR") : "—"}
                  </td>
                  <td className="py-2.5 px-2 text-center">
                    <Select
                      value={u.role}
                      onValueChange={(v) => setRoleMut.mutate({ userId: u.id, role: v as "user" | "admin" })}
                      disabled={u.id === me?.id}
                    >
                      <SelectTrigger className="h-8 w-40 mx-auto bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Administrador</SelectItem>
                        <SelectItem value="user">Usuário</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="py-2.5 pl-2 text-center">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title="Redefinir senha"
                      onClick={() => setResetTarget({ id: u.id, name: u.name || u.email || "usuário" })}
                    >
                      <KeyRound className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-muted-foreground mt-4">
            Administradores podem gerenciar cadastros, parametrizações e usuários. Usuários comuns podem visualizar
            dashboards e lançar resultados.
          </p>
        </CardContent>
      </Card>

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
    </div>
  );
}
