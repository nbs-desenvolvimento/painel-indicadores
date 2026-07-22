import type { Express, Request, Response } from "express";
import { createContext } from "./_core/context";
import { generateExcelReport, generateImportTemplate } from "./exportService";

/**
 * Rotas de download (Excel). Registradas em server/_core/index.ts.
 * Autenticação via Authorization: Bearer (mesmo contexto do tRPC).
 */
export function registerExportRoutes(app: Express) {
  app.get("/api/export/excel", async (req: Request, res: Response) => {
    try {
      const ctx = await createContext({ req, res } as Parameters<typeof createContext>[0]);
      if (!ctx.user) {
        res.status(401).json({ error: "Não autenticado" });
        return;
      }
      const companyId = parseInt(String(req.query.companyId));
      const year = parseInt(String(req.query.year));
      const month = parseInt(String(req.query.month));
      if (!companyId || !year || !month) {
        res.status(400).json({ error: "Parâmetros companyId, year e month são obrigatórios" });
        return;
      }
      const buffer = await generateExcelReport(companyId, year, month);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="relatorio-indicadores-${year}-${String(month).padStart(2, "0")}.xlsx"`,
      );
      res.send(buffer);
    } catch (e) {
      console.error("[Export] Excel error:", e);
      res.status(500).json({ error: "Falha ao gerar o relatório Excel" });
    }
  });

  app.get("/api/export/template", async (req: Request, res: Response) => {
    try {
      const ctx = await createContext({ req, res } as Parameters<typeof createContext>[0]);
      if (!ctx.user) {
        res.status(401).json({ error: "Não autenticado" });
        return;
      }
      const companyId = parseInt(String(req.query.companyId));
      if (!companyId) {
        res.status(400).json({ error: "Parâmetro companyId é obrigatório" });
        return;
      }
      const buffer = await generateImportTemplate(companyId);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="modelo-importacao-indicadores.xlsx"`);
      res.send(buffer);
    } catch (e) {
      console.error("[Export] Template error:", e);
      res.status(500).json({ error: "Falha ao gerar o modelo de importação" });
    }
  });
}
