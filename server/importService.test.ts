import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "fs";
import { parseIndicadoresSheet } from "./importService";

const XLSX_PATH = "/home/ubuntu/upload/GESTÃODEINDICADORES.xlsx";

describe("importService — planilha real GESTÃODEINDICADORES.xlsx", () => {
  it("lê a aba INDICADORES e extrai indicador, meta e resultado", async () => {
    if (!existsSync(XLSX_PATH)) {
      console.warn("Planilha original não disponível, pulando teste");
      return;
    }
    const buf = readFileSync(XLSX_PATH);
    const rows = await parseIndicadoresSheet(buf);

    expect(rows.length).toBeGreaterThan(20);

    const receita = rows.find((r) => r.indicatorName.toLowerCase().includes("receita bruta"));
    expect(receita).toBeDefined();
    expect(receita!.goal).not.toBeNull();
    expect(receita!.result).not.toBeNull();

    // Todos os itens devem ter nome de indicador não vazio
    for (const r of rows) {
      expect(r.indicatorName.trim().length).toBeGreaterThan(0);
    }

    // Valores da planilha original (linha Receita Bruta): meta 1.100.000, resultado 1.200.000
    expect(receita!.goal).toBe(1100000);
    expect(receita!.result).toBe(1200000);
  });
});
