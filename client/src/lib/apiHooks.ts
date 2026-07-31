import type { DashboardHistory, DashboardSnapshot } from "@/lib/apiTypes";
import { trpcApi } from "@/lib/trpcApi";

interface QueryResult<T> {
  data: T | undefined;
  isLoading: boolean;
}

/** trpc.dashboard.snapshot.useQuery tipado (ver @/lib/trpcApi sobre o motivo do cast). */
export function useDashboardSnapshot(
  input: { companyId: number; year: number; month: number; mode?: "month" | "ytd" },
  opts: { enabled: boolean },
): QueryResult<DashboardSnapshot> {
  return trpcApi.dashboard.snapshot.useQuery(input, opts);
}

/** trpc.dashboard.history.useQuery tipado. */
export function useDashboardHistory(
  input: { companyId: number; periods: { year: number; month: number }[] },
  opts: { enabled: boolean },
): QueryResult<DashboardHistory> {
  return trpcApi.dashboard.history.useQuery(input, opts);
}
