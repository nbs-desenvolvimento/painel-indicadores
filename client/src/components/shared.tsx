import { MONTH_NAMES, fmtScore, scoreColor, useApp } from "@/contexts/AppContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { downloadAuthedFile } from "@/lib/downloadFile";
import { DIRECTION_LABELS, type Direction } from "@/lib/calcEngine";
import { ArrowDown, ArrowUp, Download, FileSpreadsheet, Printer } from "lucide-react";
import { PolarAngleAxis, RadialBar, RadialBarChart, ResponsiveContainer } from "recharts";
import { toast } from "sonner";

/** Barra superior com título, seletor de empresa/período e ações de exportação */
export function PageToolbar({
  title,
  subtitle,
  showExport = false,
  hideMonth = false,
  exportMode = "month",
  exportMonth,
  children,
}: {
  title: string;
  subtitle?: string;
  showExport?: boolean;
  /** Esconde o seletor de mês global (ex.: páginas que têm seu próprio controle de período local) */
  hideMonth?: boolean;
  /** Modo usado na exportação Excel: "month" (padrão) ou "ytd" (acumulado até o mês de referência) */
  exportMode?: "month" | "ytd";
  /** Mês de referência usado na exportação Excel; default = mês global (contexto). Use quando a página tem seu próprio período, desacoplado do seletor global. */
  exportMonth?: number;
  children?: React.ReactNode;
}) {
  const { companyId, setCompanyId, companies, year, setYear, month, setMonth } = useApp();

  const years = Array.from({ length: 8 }, (_, i) => new Date().getFullYear() - 4 + i);
  const refMonth = exportMonth ?? month;

  const handleExcel = () => {
    if (!companyId) return;
    const suffix =
      exportMode === "ytd" ? `acumulado-ate-${String(refMonth).padStart(2, "0")}` : String(refMonth).padStart(2, "0");
    downloadAuthedFile(
      `/api/export/excel?companyId=${companyId}&year=${year}&month=${refMonth}&mode=${exportMode}`,
      `relatorio-indicadores-${year}-${suffix}.xlsx`,
    ).catch((e) => toast.error(e.message));
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="flex flex-col gap-4 mb-6 print:hidden">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title font-serif text-3xl">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {companies && companies.length > 1 && (
            <Select value={companyId ? String(companyId) : undefined} onValueChange={(v) => setCompanyId(parseInt(v))}>
              <SelectTrigger className="w-[200px] bg-card">
                <SelectValue placeholder="Empresa" />
              </SelectTrigger>
              <SelectContent>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {!hideMonth && (
            <Select value={String(month)} onValueChange={(v) => setMonth(parseInt(v))}>
              <SelectTrigger className="w-[130px] bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTH_NAMES.map((m, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={String(year)} onValueChange={(v) => setYear(parseInt(v))}>
            <SelectTrigger className="w-[100px] bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {showExport && (
            <>
              <Button variant="outline" size="sm" className="bg-card" onClick={handleExcel}>
                <FileSpreadsheet className="h-4 w-4 mr-1.5" />
                Excel
              </Button>
              <Button variant="outline" size="sm" className="bg-card" onClick={handlePrint}>
                <Printer className="h-4 w-4 mr-1.5" />
                PDF
              </Button>
            </>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}

/** Badge colorido de score */
export function ScoreBadge({ score, className = "" }: { score: number | null | undefined; className?: string }) {
  const color = scoreColor(score);
  return (
    <Badge
      variant="outline"
      className={`kpi-number font-semibold border-0 text-white ${className}`}
      style={{ backgroundColor: color }}
    >
      {fmtScore(score)}
    </Badge>
  );
}

/** Gauge radial de desempenho (0 a 120%) */
export function ScoreGauge({
  score,
  size = 180,
  label,
}: {
  score: number | null;
  size?: number;
  label?: string;
}) {
  const value = score ?? 0;
  const pct = Math.min(value / 1.2, 1) * 100;
  const color = scoreColor(score);
  const data = [{ name: "score", value: pct, fill: color }];

  return (
    <div className="flex flex-col items-center" style={{ width: size }}>
      <div style={{ width: size, height: size * 0.62 }} className="relative overflow-hidden">
        <ResponsiveContainer width="100%" height={size}>
          <RadialBarChart
            cx="50%"
            cy="50%"
            innerRadius="70%"
            outerRadius="100%"
            barSize={size * 0.09}
            data={data}
            startAngle={180}
            endAngle={0}
          >
            <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
            <RadialBar background={{ fill: "oklch(0.93 0.008 90)" }} dataKey="value" cornerRadius={8} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="absolute inset-x-0 bottom-1 flex flex-col items-center">
          <span className="kpi-number text-2xl font-bold" style={{ color }}>
            {fmtScore(score)}
          </span>
        </div>
      </div>
      {label && <p className="text-xs text-muted-foreground text-center mt-1 leading-tight">{label}</p>}
    </div>
  );
}

/** Setinha indicando o sentido do indicador: ↑ aumentar é positivo, ↓ reduzir é positivo */
export function DirectionIcon({ direction, className = "" }: { direction: Direction; className?: string }) {
  const Icon = direction === "lower_better" ? ArrowDown : ArrowUp;
  const color = direction === "lower_better" ? "#2563eb" : "#15803d";
  return (
    <Icon
      className={`h-3.5 w-3.5 shrink-0 ${className}`}
      style={{ color }}
      aria-label={DIRECTION_LABELS[direction]}
    >
      <title>{DIRECTION_LABELS[direction]}</title>
    </Icon>
  );
}

/** Estado vazio elegante */
export function EmptyState({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="card-elegant flex flex-col items-center justify-center py-16 px-8 text-center">
      <Download className="h-10 w-10 text-muted-foreground/40 mb-4" />
      <h3 className="font-medium text-lg">{title}</h3>
      {description && <p className="text-sm text-muted-foreground mt-1 max-w-md">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/**
 * Estado vazio de dashboard/lançamento ciente do motivo: para admin, mostra a
 * orientação de cadastro de sempre; para usuário comum, explica que a lista
 * vazia é porque nenhuma área foi liberada para ele (não é um bug).
 */
export function DashboardEmptyState({
  isAdmin,
  adminTitle,
  adminDescription,
}: {
  isAdmin: boolean;
  adminTitle: string;
  adminDescription: string;
}) {
  if (isAdmin) return <EmptyState title={adminTitle} description={adminDescription} />;
  return (
    <EmptyState
      title="Nenhuma área liberada"
      description="Nenhuma área foi liberada para o seu usuário. Contate o administrador."
    />
  );
}

/** Skeleton de carregamento para páginas de dashboard */
export function PageSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-8 w-64 bg-muted rounded" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-40 bg-muted rounded-xl" />
        ))}
      </div>
      <div className="h-80 bg-muted rounded-xl" />
    </div>
  );
}
