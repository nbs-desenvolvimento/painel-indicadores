import type { Express, Request, Response } from "express";
import { createContext } from "./_core/context";
import type { User } from "./drizzle/schema";
import * as db from "./db";
import { generateExcelReport, generateImportTemplate } from "./exportService";

/** null = sem restrição (admin). false = empresa fora da lista liberada para o usuário. */
async function checkCompanyAccess(user: User, companyId: number): Promise<boolean> {
  if (user.role === "admin") return true;
  const allowed = await db.getUserCompanyIds(user.id);
  return allowed.includes(companyId);
}

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
      const mode = req.query.mode === "ytd" ? "ytd" : "month";
      if (!companyId || !year || !month) {
        res.status(400).json({ error: "Parâmetros companyId, year e month são obrigatórios" });
        return;
      }
      if (!(await checkCompanyAccess(ctx.user, companyId))) {
        res.status(403).json({ error: "Você não tem acesso a esta empresa" });
        return;
      }
      const allowedAreaIds = ctx.user.role === "admin" ? null : await db.getUserAreaIds(ctx.user.id);
      const buffer = await generateExcelReport(companyId, year, month, mode, allowedAreaIds);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      const suffix = mode === "ytd" ? `acumulado-ate-${String(month).padStart(2, "0")}` : String(month).padStart(2, "0");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="relatorio-indicadores-${year}-${suffix}.xlsx"`,
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
      if (!(await checkCompanyAccess(ctx.user, companyId))) {
        res.status(403).json({ error: "Você não tem acesso a esta empresa" });
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
