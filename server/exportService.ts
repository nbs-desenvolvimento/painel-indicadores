import ExcelJS from "exceljs";
import { SCALE_TYPE_LABELS, type ScaleType } from "./calcEngine";
import { buildCompanySnapshot } from "./dashboardService";

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const NAVY = "FF16273F";
const GOLD = "FFC9A227";
const LIGHT = "FFF4F6FA";

function styleHeaderRow(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    cell.font = { color: { argb: "FFFFFFFF" }, bold: true, size: 11 };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: "FF999999" } },
      bottom: { style: "thin", color: { argb: "FF999999" } },
      left: { style: "thin", color: { argb: "FF999999" } },
      right: { style: "thin", color: { argb: "FF999999" } },
    };
  });
}

function scoreFill(score: number | null): string | null {
  if (score === null) return null;
  if (score >= 1.2) return "FF2E7D32";
  if (score >= 1.0) return "FF66BB6A";
  if (score >= 0.8) return "FFFFF176";
  if (score >= 0.6) return "FFFFB74D";
  return "FFE57373";
}

/**
 * Gera um relatório Excel completo do período: visão geral das áreas,
 * detalhe por perspectiva e detalhe por indicador.
 *
 * `mode`: "month" (padrão) usa meta/resultado do mês informado; "ytd" soma
 * meta e resultado de janeiro até o mês informado (acumulado do ano) — mesmo
 * critério usado na tela de Ranking de Áreas.
 */
export async function generateExcelReport(
  companyId: number,
  year: number,
  month: number,
  mode: "month" | "ytd" = "month",
): Promise<Buffer> {
  const snap = await buildCompanySnapshot(companyId, year, month, null, mode);
  const wb = new ExcelJS.Workbook();
  wb.creator = "Painel de Gestão de Indicadores";
  const periodLabel =
    mode === "ytd" ? `Acumulado Jan–${MONTH_NAMES[month - 1]}/${year}` : `${MONTH_NAMES[month - 1]}/${year}`;

  /* ---- Sheet 1: Visão geral (ranking) ---- */
  const ws1 = wb.addWorksheet("Visão Geral");
  ws1.columns = [
    { header: "Posição", key: "pos", width: 10 },
    { header: "Área", key: "area", width: 34 },
    ...snap.perspectives.map((p) => ({ header: p.name, key: `p${p.id}`, width: 20 })),
    { header: "Desempenho Total", key: "total", width: 20 },
  ];
  styleHeaderRow(ws1.getRow(1));
  const ranked = [...snap.areaScores].sort((a, b) => b.total - a.total);
  ranked.forEach((a, idx) => {
    const rowData: Record<string, unknown> = { pos: idx + 1, area: a.areaName, total: a.total };
    for (const p of a.perspectives) {
      rowData[`p${p.perspectiveId}`] = p.weighted;
    }
    const row = ws1.addRow(rowData);
    row.eachCell((cell, col) => {
      if (col >= 3) cell.numFmt = "0.0%";
      cell.border = {
        bottom: { style: "thin", color: { argb: "FFDDDDDD" } },
      };
    });
    const totalCell = row.getCell(ws1.columns.length);
    totalCell.font = { bold: true };
  });
  ws1.insertRow(1, [`Relatório de Desempenho — ${periodLabel}`]);
  ws1.mergeCells(1, 1, 1, ws1.columns.length);
  const title1 = ws1.getCell(1, 1);
  title1.font = { bold: true, size: 14, color: { argb: NAVY } };
  title1.alignment = { horizontal: "center" };

  /* ---- Sheet 2: Perspectivas (média × peso por área) ---- */
  const ws2 = wb.addWorksheet("Perspectivas");
  ws2.columns = [
    { header: "Área", key: "area", width: 34 },
    { header: "Perspectiva", key: "persp", width: 28 },
    { header: "Média dos Indicadores", key: "avg", width: 22 },
    { header: "Peso", key: "weight", width: 12 },
    { header: "Resultado Ponderado", key: "weighted", width: 22 },
  ];
  styleHeaderRow(ws2.getRow(1));
  const perspName = new Map(snap.perspectives.map((p) => [p.id, p.name]));
  for (const a of snap.areaScores) {
    for (const p of a.perspectives) {
      const row = ws2.addRow({
        area: a.areaName,
        persp: perspName.get(p.perspectiveId) ?? "",
        avg: p.average,
        weight: p.weight,
        weighted: p.weighted,
      });
      row.getCell(3).numFmt = "0.0%";
      row.getCell(4).numFmt = "0%";
      row.getCell(5).numFmt = "0.0%";
    }
  }

  /* ---- Sheet 3: Indicadores ---- */
  const ws3 = wb.addWorksheet("Indicadores");
  ws3.columns = [
    { header: "Perspectiva", key: "persp", width: 28 },
    { header: "Indicador", key: "ind", width: 40 },
    { header: "Regra de Calibragem", key: "scale", width: 32 },
    { header: "Meta", key: "goal", width: 16 },
    { header: "Resultado", key: "result", width: 16 },
    { header: "Score", key: "score", width: 12 },
  ];
  styleHeaderRow(ws3.getRow(1));
  for (const i of snap.indicatorScores) {
    const row = ws3.addRow({
      persp: perspName.get(i.perspectiveId) ?? "",
      ind: i.name,
      scale: i.ruleName ?? SCALE_TYPE_LABELS[i.scaleType as ScaleType],
      goal: i.goal,
      result: i.result,
      score: i.score,
    });
    row.getCell(6).numFmt = "0%";
    const fill = scoreFill(i.score);
    if (fill) {
      row.getCell(6).fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
    }
    if (i.unit === "percent") {
      row.getCell(4).numFmt = "0.0%";
      row.getCell(5).numFmt = "0.0%";
    } else {
      row.getCell(4).numFmt = "#,##0.00";
      row.getCell(5).numFmt = "#,##0.00";
    }
  }

  /* ---- Sheet 4: Heatmap indicador × área ---- */
  const ws4 = wb.addWorksheet("Heatmap");
  const activeAreas = snap.areas;
  ws4.columns = [
    { header: "Indicador", key: "ind", width: 40 },
    ...activeAreas.map((a) => ({ header: a.name, key: `a${a.id}`, width: 16 })),
  ];
  styleHeaderRow(ws4.getRow(1));
  const applSet = new Set(
    snap.applicability.filter((x) => x.applicable).map((x) => `${x.indicatorId}:${x.areaId}`),
  );
  for (const i of snap.indicatorScores) {
    const rowData: Record<string, unknown> = { ind: i.name };
    for (const a of activeAreas) {
      rowData[`a${a.id}`] = applSet.has(`${i.indicatorId}:${a.id}`) ? i.score : null;
    }
    const row = ws4.addRow(rowData);
    activeAreas.forEach((a, idx) => {
      const cell = row.getCell(idx + 2);
      if (applSet.has(`${i.indicatorId}:${a.id}`)) {
        cell.numFmt = "0%";
        const fill = scoreFill(i.score);
        if (fill) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
      } else {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT } };
        cell.value = "—";
        cell.alignment = { horizontal: "center" };
      }
    });
  }

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/**
 * Gera modelo de importação com os indicadores cadastrados (aba INDICADORES).
 */
export async function generateImportTemplate(companyId: number): Promise<Buffer> {
  const { listIndicators, listPerspectives } = await import("./db");
  const [inds, persps] = await Promise.all([listIndicators(companyId), listPerspectives(companyId)]);
  const perspName = new Map(persps.map((p) => [p.id, p.name]));

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("INDICADORES");
  // Layout compatível com a planilha original: B=Objetivos, C=Indicadores, D=Obs, E=META, F=RESULTADO
  ws.getRow(2).values = [undefined, "Objetivos", "Indicadores", "Observação (DNA)", "META", "RESULTADO"];
  styleHeaderRow(ws.getRow(2));
  ws.getColumn(2).width = 26;
  ws.getColumn(3).width = 42;
  ws.getColumn(4).width = 50;
  ws.getColumn(5).width = 16;
  ws.getColumn(6).width = 16;

  let r = 3;
  for (const ind of inds.filter((i) => i.active)) {
    const row = ws.getRow(r);
    row.getCell(2).value = perspName.get(ind.perspectiveId) ?? "";
    row.getCell(3).value = ind.name;
    row.getCell(4).value = ind.description ?? "";
    r++;
  }

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
