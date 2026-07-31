import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/useMobile";
import {
  BarChart3,
  Building2,
  Check,
  ChevronsUpDown,
  ClipboardEdit,
  Compass,
  Crosshair,
  SlidersHorizontal,
  FileUp,
  Gauge,
  Grid3X3,
  Layers,
  LayoutDashboard,
  LineChart,
  LogOut,
  Network,
  PanelLeft,
  Scale,
  Target,
  Trophy,
  Users,
} from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { Button } from "./ui/button";

type MenuItem = {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  path: string;
  adminOnly?: boolean;
};

type MenuGroup = { label: string; items: MenuItem[] };

const menuGroups: MenuGroup[] = [
  {
    label: "Dashboards",
    items: [
      { icon: LayoutDashboard, label: "Visão Geral", path: "/" },
      { icon: Gauge, label: "Por Área", path: "/dashboard/areas" },
      { icon: Compass, label: "Por Perspectiva", path: "/dashboard/perspectivas" },
      { icon: Crosshair, label: "Por Objetivo", path: "/dashboard/objetivos" },
      { icon: BarChart3, label: "Por Indicadores", path: "/dashboard/indicadores" },
      { icon: LineChart, label: "Evolução Mensal", path: "/dashboard/evolucao" },
      { icon: Trophy, label: "Ranking", path: "/dashboard/ranking" },
      { icon: Grid3X3, label: "Heatmap", path: "/dashboard/heatmap" },
      { icon: Network, label: "Organograma", path: "/dashboard/organograma" },
    ],
  },
  {
    label: "Lançamentos",
    items: [
      { icon: ClipboardEdit, label: "Metas e Resultados", path: "/lancamentos" },
      { icon: FileUp, label: "Importar Excel", path: "/importacao" },
    ],
  },
  {
    label: "Cadastros",
    items: [
      { icon: Layers, label: "Áreas", path: "/cadastros/areas", adminOnly: true },
      { icon: Compass, label: "Perspectivas", path: "/cadastros/perspectivas", adminOnly: true },
      { icon: Crosshair, label: "Objetivos", path: "/cadastros/objetivos", adminOnly: true },
      { icon: SlidersHorizontal, label: "Regras de Calibragem", path: "/cadastros/regras", adminOnly: true },
      { icon: Target, label: "Indicadores", path: "/cadastros/indicadores", adminOnly: true },
      { icon: Scale, label: "Pesos e Aplicabilidade", path: "/cadastros/parametrizacao", adminOnly: true },
    ],
  },
  {
    label: "Administração",
    items: [
      { icon: Building2, label: "Empresas", path: "/admin/empresas", adminOnly: true },
      { icon: Users, label: "Usuários", path: "/admin/usuarios", adminOnly: true },
    ],
  },
];

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 200;
const MAX_WIDTH = 480;

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) {
    return <DashboardLayoutSkeleton />;
  }

  if (!user) {
    return (
      <div className="h-screen w-full flex overflow-hidden bg-background">
        {/* Painel esquerdo decorativo */}
        <div className="hidden lg:flex flex-col justify-between w-1/2 h-full bg-sidebar text-sidebar-foreground p-12 xl:p-16">
          <div className="flex items-center gap-3">
            <img
              src="/logo-painel-branco.png"
              alt="Painel de Gestão por Indicadores"
              className="h-10 w-10 object-contain shrink-0"
            />
            <span className="font-semibold text-lg tracking-tight">Painel de Gestão por Indicadores</span>
          </div>
          <div>
            <h2 className="font-serif text-4xl xl:text-5xl leading-tight mb-6">
              Gestão de desempenho<br />com precisão executiva.
            </h2>
            <p className="text-sidebar-foreground/70 max-w-md leading-relaxed">
              Acompanhe metas, resultados e o desempenho de cada área por perspectiva estratégica —
              com o mesmo rigor de cálculo da sua planilha, em dashboards elegantes.
            </p>
          </div>
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs text-sidebar-foreground/50">Balanced Scorecard · Indicadores · Resultados</p>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-sidebar-foreground/40">Desenvolvido por</span>
              <img
                src="/logo-nbs-branco.png"
                alt="NBS Consulting Group"
                className="h-5 w-auto object-contain opacity-90"
              />
            </div>
          </div>
        </div>
        {/* Painel de login */}
        <div className="flex-1 h-full flex flex-col overflow-y-auto">
          <div className="flex-1 flex items-center justify-center p-6 sm:p-8">
            <div className="flex flex-col items-center gap-8 max-w-md w-full">
              <div className="flex flex-col items-center gap-4">
                <img
                  src="/logo-painel-azul.png"
                  alt="Painel de Gestão por Indicadores"
                  className="h-16 w-16 object-contain lg:hidden dark:hidden"
                />
                <img
                  src="/logo-painel-branco.png"
                  alt="Painel de Gestão por Indicadores"
                  className="h-16 w-16 object-contain lg:hidden hidden dark:block"
                />
                <h1 className="text-2xl font-semibold tracking-tight text-center">
                  Acesse o Painel de Gestão por Indicadores
                </h1>
                <p className="text-sm text-muted-foreground text-center max-w-sm">
                  Faça login para acessar os dashboards, lançamentos e cadastros do sistema de gestão de desempenho.
                </p>
              </div>
              <LoginForm />
            </div>
          </div>
          <div className="flex items-center justify-center gap-2 py-6 shrink-0">
            <span className="text-xs text-muted-foreground">Desenvolvido por</span>
            <img
              src="/nbs_logo_cinza.png"
              alt="NBS Consulting Group"
              className="h-5 w-auto object-contain dark:hidden"
            />
            <img
              src="/logo-nbs-branco.png"
              alt="NBS Consulting Group"
              className="h-5 w-auto object-contain hidden dark:block"
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`,
        } as CSSProperties
      }
    >
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>{children}</DashboardLayoutContent>
    </SidebarProvider>
  );
}

function LoginForm() {
  const { login, isLoggingIn, loginError } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login(email, password);
    } catch {
      // loginError (via useAuth) já reflete a falha na UI abaixo.
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 w-full">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Senha</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>
      {loginError && <p className="text-sm text-destructive">{loginError}</p>}
      <Button
        type="submit"
        size="lg"
        className="w-full shadow-lg hover:shadow-xl transition-all"
        disabled={isLoggingIn}
      >
        {isLoggingIn ? "Entrando..." : "Entrar"}
      </Button>
    </form>
  );
}

type DashboardLayoutContentProps = {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
};

function DashboardLayoutContent({ children, setSidebarWidth }: DashboardLayoutContentProps) {
  const { user, logout } = useAuth();
  const { companyId, setCompanyId, companies } = useApp();
  const activeCompanyName = companies?.find((c) => c.id === companyId)?.name;
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const isAdmin = user?.role === "admin";

  const visibleGroups = menuGroups
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.adminOnly || isAdmin) }))
    .filter((g) => g.items.length > 0);

  const allItems = visibleGroups.flatMap((g) => g.items);
  const activeMenuItem = allItems.find((item) => item.path === location);

  useEffect(() => {
    if (isCollapsed) {
      setIsResizing(false);
    }
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - sidebarLeft;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
        setSidebarWidth(newWidth);
      }
    };
    const handleMouseUp = () => {
      setIsResizing(false);
    };
    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar collapsible="icon" className="border-r-0" disableTransition={isResizing}>
          <SidebarHeader className="items-right py-3">
            <button
              onClick={toggleSidebar}
              className="h-8 w-8 flex items-center justify-center hover:bg-sidebar-accent rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
              aria-label="Alternar navegação"
            >
              <PanelLeft className="h-4 w-4 text-sidebar-foreground/70" />
            </button>
            <div className="flex flex-col items-center gap-2 w-full px-1">
              <img
                src="/logo-painel-branco.png"
                alt="Painel de Gestão por Indicadores"
                className="h-8 w-8 object-contain shrink-0"
              />
              {!isCollapsed ? (
                <>
                  <span className="font-semibold tracking-tight text-center text-sm leading-tight text-sidebar-foreground">
                    Painel de Gestão por Indicadores
                  </span>
                  {activeCompanyName && (
                    <span className="text-[10px] text-sidebar-foreground/40 truncate max-w-full">
                      {activeCompanyName}
                    </span>
                  )}
                </>
              ) : null}
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-1 scrollbar-hover">
            {visibleGroups.map((group) => (
              <SidebarGroup key={group.label} className="py-1.5 shrink-0">
                <SidebarGroupLabel className="text-sidebar-foreground/50 text-[11px] uppercase tracking-wider truncate">
                  {group.label}
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu className="px-0">
                    {group.items.map((item) => {
                      const isActive = location === item.path;
                      return (
                        <SidebarMenuItem key={item.path}>
                          <SidebarMenuButton
                            isActive={isActive}
                            onClick={() => setLocation(item.path)}
                            tooltip={item.label}
                            className="h-9 transition-all font-normal"
                          >
                            <item.icon className={`h-4 w-4 ${isActive ? "text-sidebar-primary" : ""}`} />
                            <span>{item.label}</span>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ))}
          </SidebarContent>

          <SidebarFooter className="p-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-lg px-1 py-1 hover:bg-sidebar-accent/50 transition-colors w-full text-left group-data-[collapsible=icon]:justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Avatar className="h-9 w-9 border border-sidebar-border shrink-0">
                    <AvatarFallback className="text-xs font-medium bg-sidebar-accent text-sidebar-accent-foreground">
                      {user?.name?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                    <p className="text-sm font-medium truncate leading-none text-sidebar-foreground">
                      {user?.name || "-"}
                    </p>
                    <p className="text-xs text-sidebar-foreground/60 truncate mt-1.5">
                      {user?.role === "admin" ? "Administrador" : "Usuário"}
                    </p>
                  </div>
                  <ChevronsUpDown className="h-4 w-4 text-sidebar-foreground/40 shrink-0 group-data-[collapsible=icon]:hidden" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {companies && companies.length > 1 && (
                  <>
                    <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                      Empresa
                    </DropdownMenuLabel>
                    {companies.map((c) => (
                      <DropdownMenuItem key={c.id} onClick={() => setCompanyId(c.id)} className="cursor-pointer">
                        <span className="flex-1 truncate">{c.name}</span>
                        {c.id === companyId && <Check className="h-4 w-4 shrink-0" />}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sair</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <div className="flex items-center justify-center gap-1.5 pt-2 mt-1 border-t border-sidebar-border/50 group-data-[collapsible=icon]:hidden">
              <span className="text-[11px] text-sidebar-foreground/40">Desenvolvido por</span>
              <img
                src="/logo-nbs-branco.png"
                alt="NBS Consulting Group"
                className="h-7 w-auto object-contain opacity-70"
              />
            </div>
          </SidebarFooter>
        </Sidebar>
        <div
          className={`absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20 transition-colors ${isCollapsed ? "hidden" : ""}`}
          onMouseDown={() => {
            if (isCollapsed) return;
            setIsResizing(true);
          }}
          style={{ zIndex: 50 }}
        />
      </div>

      <SidebarInset>
        {isMobile && (
          <div className="flex border-b h-14 items-center justify-between bg-background/95 px-2 backdrop-blur supports-[backdrop-filter]:backdrop-blur sticky top-0 z-40">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="h-9 w-9 rounded-lg bg-background" />
              <div className="flex items-center gap-3">
                <div className="flex flex-col gap-1">
                  <span className="tracking-tight text-foreground">{activeMenuItem?.label ?? "Menu"}</span>
                </div>
              </div>
            </div>
          </div>
        )}
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </SidebarInset>
    </>
  );
}