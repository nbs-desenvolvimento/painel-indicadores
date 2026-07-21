import ExcelJS from "exceljs";
import * as db from "./db";

/**
 * Normaliza nomes de indicadores para casamento tolerante:
 * minúsculas, sem acentos, espaços colapsados.
 */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export interface ParsedRow {
  indicatorName: string;
  goal: number | null;
  result: number | null;
}

/**
 * Lê a planilha Excel (aba INDICADORES) e extrai indicador, meta e resultado.
 * Estrutura esperada (idêntica à planilha de origem):
 * - Coluna C (3): nome do indicador
 * - Coluna E (5): META
 * - Coluna F (6): RESULTADO
 * Se não encontrar esse layout, tenta detectar cabeçalhos "Indicadores"/"META"/"RESULTADO".
 */
export async function parseIndicadoresSheet(buffer: Buffer): Promise<ParsedRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);

  // A aba deve se chamar INDICADORES (tolerante a espaços e maiúsculas/minúsculas)
  let sheet = workbook.worksheets.find(
    (ws) => normalizeName(ws.name) === "indicadores",
  );
  if (!sheet) {
    throw new Error(
      `Aba "INDICADORES" não encontrada. Abas disponíveis: ${workbook.worksheets.map((w) => w.name).join(", ")}`,
    );
  }

  // Detecta colunas pelo cabeçalho; fallback para C/E/F
  let colIndicator = 3;
  let colGoal = 5;
  let colResult = 6;
  let headerRow = 0;

  outer: for (let r = 1; r <= Math.min(10, sheet.rowCount); r++) {
    const row = sheet.getRow(r);
    for (let c = 1; c <= Math.min(20, sheet.columnCount); c++) {
      const v = row.getCell(c).value;
      if (typeof v === "string" && normalizeName(v) === "indicadores") {
        colIndicator = c;
        headerRow = r;
        // procura META e RESULTADO na mesma linha
        for (let c2 = c + 1; c2 <= Math.min(30, sheet.columnCount); c2++) {
          const v2 = row.getCell(c2).value;
          if (typeof v2 === "string") {
            const n = normalizeName(v2);
            if (n === "meta") colGoal = c2;
            if (n === "resultado") colResult = c2;
          }
        }
        break outer;
      }
    }
  }

  const toNumber = (v: ExcelJS.CellValue): number | null => {
    if (v === null || v === undefined || v === "") return null;
    if (typeof v === "number") return v;
    if (typeof v === "object" && v !== null) {
      // Formula cell → use result
      const anyV = v as { result?: unknown };
      if (typeof anyV.result === "number") return anyV.result;
      return null;
    }
    if (typeof v === "string") {
      const cleaned = v.replace(/[R$\s.]/g, "").replace(",", ".").replace("%", "");
      const n = parseFloat(cleaned);
      if (isNaN(n)) return null;
      return v.includes("%") ? n / 100 : n;
    }
    return null;
  };

  const toName = (v: ExcelJS.CellValue): string | null => {
    if (typeof v === "string" && v.trim() !== "") return v.trim();
    if (typeof v === "object" && v !== null) {
      const anyV = v as { result?: unknown; richText?: { text: string }[] };
      if (typeof anyV.result === "string" && anyV.result.trim() !== "") return anyV.result.trim();
      if (Array.isArray(anyV.richText)) return anyV.richText.map((t) => t.text).join("").trim() || null;
    }
    return null;
  };

  const rows: ParsedRow[] = [];
  for (let r = headerRow + 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const name = toName(row.getCell(colIndicator).value);
    if (!name) continue;
    const goal = toNumber(row.getCell(colGoal).value);
    const result = toNumber(row.getCell(colResult).value);
    rows.push({ indicatorName: name, goal, result });
  }
  return rows;
}

export interface ImportResult {
  totalRows: number;
  matched: { indicatorName: string; indicatorId: number; goal: number | null; result: number | null }[];
  unmatched: string[];
}

/**
 * Casa as linhas importadas com os indicadores cadastrados da empresa (por nome
 * normalizado) e faz o upsert das metas/resultados no período.
 */
export async function importEntries(
  companyId: number,
  year: number,
  month: number,
  rows: ParsedRow[],
  userId: number,
): Promise<ImportResult> {
  const indicatorsList = await db.listIndicators(companyId);
  const indMap = new Map(indicatorsList.map((i) => [normalizeName(i.name), i]));

  const matched: ImportResult["matched"] = [];
  const unmatched: string[] = [];

  for (const row of rows) {
    const ind = indMap.get(normalizeName(row.indicatorName));
    if (!ind) {
      unmatched.push(row.indicatorName);
      continue;
    }
    matched.push({ indicatorName: row.indicatorName, indicatorId: ind.id, goal: row.goal, result: row.result });
  }

  for (const m of matched) {
    await db.upsertEntry({
      indicatorId: m.indicatorId,
      year,
      month,
      goal: m.goal,
      result: m.result,
      source: "import",
      updatedBy: userId,
    });
  }

  return { totalRows: rows.length, matched, unmatched };
}
