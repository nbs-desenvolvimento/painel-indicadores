import { trpc } from "@/lib/trpc";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

export const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export const MONTH_NAMES_SHORT = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

interface AppContextValue {
  companyId: number | null;
  setCompanyId: (id: number) => void;
  year: number;
  setYear: (y: number) => void;
  month: number;
  setMonth: (m: number) => void;
  companies: { id: number; name: string }[] | undefined;
  companiesLoading: boolean;
  periodLabel: string;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { data: companies, isLoading: companiesLoading } = trpc.companies.list.useQuery();
  const [companyId, setCompanyIdState] = useState<number | null>(() => {
    const saved = localStorage.getItem("app-company-id");
    return saved ? parseInt(saved, 10) : null;
  });
  const now = new Date();
  const [year, setYearState] = useState<number>(() => {
    const saved = localStorage.getItem("app-year");
    return saved ? parseInt(saved, 10) : now.getFullYear();
  });
  const [month, setMonthState] = useState<number>(() => {
    const saved = localStorage.getItem("app-month");
    return saved ? parseInt(saved, 10) : now.getMonth() + 1;
  });

  // Auto-select first company
  useEffect(() => {
    if (!companiesLoading && companies && companies.length > 0) {
      const exists = companyId !== null && companies.some((c) => c.id === companyId);
      if (!exists) {
        setCompanyIdState(companies[0].id);
      }
    }
  }, [companies, companiesLoading, companyId]);

  const setCompanyId = (id: number) => {
    setCompanyIdState(id);
    localStorage.setItem("app-company-id", String(id));
  };
  const setYear = (y: number) => {
    setYearState(y);
    localStorage.setItem("app-year", String(y));
  };
  const setMonth = (m: number) => {
    setMonthState(m);
    localStorage.setItem("app-month", String(m));
  };

  const value = useMemo(
    () => ({
      companyId,
      setCompanyId,
      year,
      setYear,
      month,
      setMonth,
      companies: companies?.map((c) => ({ id: c.id, name: c.name })),
      companiesLoading,
      periodLabel: `${MONTH_NAMES[month - 1]} de ${year}`,
    }),
    [companyId, year, month, companies, companiesLoading],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

/** Formata score (0–1.2) como percentual pt-BR */
export function fmtScore(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

/** Formata número conforme unidade do indicador */
export function fmtValue(v: number | null | undefined, unit?: string | null): string {
  if (v === null || v === undefined) return "—";
  if (unit === "percent") {
    return `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
  }
  if (unit === "currency") {
    return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  }
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

/** Cor semântica do score (degraus da planilha) */
export function scoreColor(score: number | null | undefined): string {
  if (score === null || score === undefined) return "#9ca3af";
  if (score >= 1.2) return "#15803d";
  if (score >= 1.0) return "#22c55e";
  if (score >= 0.8) return "#eab308";
  if (score >= 0.6) return "#f97316";
  return "#dc2626";
}

/** Cor de fundo suave para células de heatmap */
export function scoreBg(score: number | null | undefined): string {
  if (score === null || score === undefined) return "transparent";
  if (score >= 1.2) return "#15803d";
  if (score >= 1.0) return "#4ade80";
  if (score >= 0.8) return "#fde047";
  if (score >= 0.6) return "#fb923c";
  return "#f87171";
}
