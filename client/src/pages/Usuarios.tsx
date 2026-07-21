import { PageSkeleton } from "@/components/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { ShieldCheck, User } from "lucide-react";
import { toast } from "sonner";

export default function Usuarios() {
  const { user: me } = useAuth();
  const utils = trpc.useUtils();
  const { data: users, isLoading } = trpc.users.list.useQuery();

  const setRoleMut = trpc.users.setRole.useMutation({
    onSuccess: () => {
      utils.users.list.invalidate();
      toast.success("Perfil atualizado");
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) return <PageSkeleton />;

  return (
    <div className="fade-up">
      <div className="mb-6">
        <h1 className="page-title font-serif text-3xl">Usuários</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Controle de acessos e perfis. Novos usuários entram automaticamente com perfil "Usuário" ao fazer login.
        </p>
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
                <th className="text-center py-2 pl-2 font-medium w-44">Perfil</th>
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
                  <td className="py-2.5 pl-2 text-center">
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
    </div>
  );
}
