import { API_URL } from "@/lib/env";
import { AUTH_TOKEN_KEY } from "@/hooks/useAuth";

/**
 * Baixa um arquivo de uma rota autenticada do server (fora do tRPC, ex.
 * export Excel). window.open/<a href> não anexa o Bearer token, então o
 * arquivo é buscado via fetch e entregue como blob.
 */
export async function downloadAuthedFile(path: string, fallbackFilename: string) {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  const res = await fetch(`${API_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!res.ok) {
    throw new Error(`Falha ao baixar arquivo (${res.status})`);
  }

  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = disposition.match(/filename="([^"]+)"/);
  const filename = match?.[1] ?? fallbackFilename;

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
