import { TRPCError } from "@trpc/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { DIRECTIONS, SCALE_TYPES } from "./calcEngine";
import { signAuthToken } from "./_core/auth";
import type { TrpcContext } from "./_core/context";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { buildCompanySnapshot, buildHistory } from "./dashboardService";
import * as db from "./db";
import { importEntries, parseIndicadoresSheet } from "./importService";

const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito a administradores" });
  }
  return next({ ctx });
});

/** null = sem restrição (admin). [] = usuário restrito sem nenhuma área liberada. */
async function scopedAreaIds(ctx: TrpcContext): Promise<number[] | null> {
  if (ctx.user!.role === "admin") return null;
  return db.getUserAreaIds(ctx.user!.id);
}

/** null = sem restrição (admin, vê todas as empresas). number[] = usuário comum, empresas liberadas para ele. */
async function scopedCompanyIds(ctx: TrpcContext): Promise<number[] | null> {
  if (ctx.user!.role === "admin") return null;
  return db.getUserCompanyIds(ctx.user!.id);
}

/** Bloqueia o acesso a uma empresa fora da lista liberada para o usuário (admin nunca é bloqueado). */
async function assertCompanyAccess(ctx: TrpcContext, companyId: number) {
  const allowed = await scopedCompanyIds(ctx);
  if (allowed !== null && !allowed.includes(companyId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem acesso a esta empresa" });
  }
}

/** Restringe uma lista de linhas com companyId às empresas liberadas (admin não é filtrado). */
function filterByAllowedCompanies<T extends { companyId: number }>(rows: T[], allowed: number[] | null): T[] {
  if (allowed === null) return rows;
  const allowedSet = new Set(allowed);
  return rows.filter((r) => allowedSet.has(r.companyId));
}

const BCRYPT_ROUNDS = 10;
// Comparado quando o email não existe, para que o tempo de resposta não denuncie
// se a falha foi por email ou por senha (bcrypt.compare sempre roda de qualquer jeito).
const DUMMY_PASSWORD_HASH = bcrypt.hashSync("no-such-user", BCRYPT_ROUNDS);
const INVALID_CREDENTIALS_MSG = "Email ou senha inválidos";
const USER_INACTIVE_MSG = "Usuário desativado. Fale com o administrador.";

const scaleTypeSchema = z.enum(SCALE_TYPES);
const directionSchema = z.enum(DIRECTIONS);
const rangeSchema = z.object({
  minAttainment: z.number().nullable(),
  minInclusive: z.boolean(),
  maxAttainment: z.number().nullable(),
  maxInclusive: z.boolean(),
  score: z.number(),
  sortOrder: z.number(),
});
const periodSchema = z.object({ year: z.number().int().min(2000).max(2100), month: z.number().int().min(1).max(12) });

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(({ ctx }) => (ctx.user ? db.toPublicUser(ctx.user) : null)),
    login: publicProcedure
      .input(z.object({ email: z.string().email(), password: z.string().min(1) }))
      .mutation(async ({ input }) => {
        const user = await db.getUserByEmail(input.email);
        const passwordMatches = await bcrypt.compare(
          input.password,
          user?.passwordHash ?? DUMMY_PASSWORD_HASH,
        );

        if (!user || !passwordMatches) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: INVALID_CREDENTIALS_MSG });
        }
        if (!user.active) {
          throw new TRPCError({ code: "FORBIDDEN", message: USER_INACTIVE_MSG });
        }

        await db.updateLastSignedIn(user.id);
        const token = await signAuthToken(user.id);
        return { token, user: db.toPublicUser(user) };
      }),
  }),

  users: router({
    list: adminProcedure.query(() => db.listUsers()),
    create: adminProcedure
      .input(
        z.object({
          email: z.string().email(),
          name: z.string().optional(),
          password: z.string().min(8, "A senha deve ter ao menos 8 caracteres"),
          role: z.enum(["user", "admin"]).default("user"),
          areaIds: z.array(z.number()).optional(),
          companyIds: z.array(z.number()).optional(),
        }),
      )
      .mutation(async ({ input }) => {
        if (input.role === "user" && (!input.companyIds || input.companyIds.length === 0)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione ao menos uma empresa para o usuário" });
        }
        const existing = await db.getUserByEmail(input.email);
        if (existing) {
          throw new TRPCError({ code: "CONFLICT", message: "Já existe um usuário com este email" });
        }
        const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
        const id = await db.createUser({
          email: input.email,
          name: input.name ?? null,
          passwordHash,
          role: input.role,
          areaIds: input.areaIds,
          companyIds: input.companyIds,
        });
        return { id };
      }),
    update: adminProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().optional(),
          email: z.string().email().optional(),
          role: z.enum(["user", "admin"]).optional(),
          active: z.boolean().optional(),
          areaIds: z.array(z.number()).optional(),
          companyIds: z.array(z.number()).optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        if (id === ctx.user.id) {
          if (data.active === false) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Você não pode desativar sua própria conta" });
          }
          if (data.role && data.role !== "admin") {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Você não pode remover seu próprio acesso de administrador" });
          }
        }
        if (data.email) {
          const existing = await db.getUserByEmail(data.email);
          if (existing && existing.id !== id) {
            throw new TRPCError({ code: "CONFLICT", message: "Já existe um usuário com este email" });
          }
        }
        if (data.companyIds !== undefined || data.role === "user") {
          const target = await db.getUserById(id);
          const resultingRole = data.role ?? target?.role;
          const resultingCompanyIds = data.companyIds ?? (resultingRole === "user" ? await db.getUserCompanyIds(id) : []);
          if (resultingRole === "user" && resultingCompanyIds.length === 0) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione ao menos uma empresa para o usuário" });
          }
        }
        await db.updateUser(id, data);
        return { success: true } as const;
      }),
    delete: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      if (input.id === ctx.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Você não pode excluir sua própria conta" });
      }
      await db.deleteUser(input.id);
      return { success: true } as const;
    }),
    resetPassword: adminProcedure
      .input(z.object({ userId: z.number(), newPassword: z.string().min(8, "A senha deve ter ao menos 8 caracteres") }))
      .mutation(async ({ input }) => {
        const passwordHash = await bcrypt.hash(input.newPassword, BCRYPT_ROUNDS);
        await db.updateUserPassword(input.userId, passwordHash);
        return { success: true } as const;
      }),
    setRole: adminProcedure
      .input(z.object({ userId: z.number(), role: z.enum(["user", "admin"]) }))
      .mutation(async ({ input, ctx }) => {
        if (input.userId === ctx.user.id && input.role !== "admin") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Você não pode remover seu próprio acesso de administrador" });
        }
        await db.updateUserRole(input.userId, input.role);
        return { success: true } as const;
      }),
  }),

  companies: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const allowed = await scopedCompanyIds(ctx);
      return allowed === null ? db.listCompanies() : db.listCompaniesForUser(allowed);
    }),
    create: adminProcedure
      .input(z.object({ name: z.string().min(1), cnpj: z.string().optional() }))
      .mutation(async ({ input }) => ({ id: await db.createCompany(input) })),
    update: adminProcedure
      .input(z.object({ id: z.number(), name: z.string().min(1).optional(), cnpj: z.string().nullable().optional(), active: z.boolean().optional() }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await db.updateCompany(id, data);
        return { success: true } as const;
      }),
    delete: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      await db.deleteCompany(input.id);
      return { success: true } as const;
    }),
  }),

  areas: router({
    list: protectedProcedure
      .input(z.object({ companyId: z.number().optional() }).optional())
      .query(async ({ input, ctx }) => {
        if (input?.companyId) await assertCompanyAccess(ctx, input.companyId);
        const all = await db.listAreas(input?.companyId);
        const allowed = await scopedAreaIds(ctx);
        if (allowed === null) return all;
        const allowedSet = new Set(allowed);
        return all.filter((a) => allowedSet.has(a.id));
      }),
    create: adminProcedure
      .input(z.object({ companyId: z.number(), name: z.string().min(1), description: z.string().optional(), parentAreaId: z.number().nullable().optional(), sortOrder: z.number().optional() }))
      .mutation(async ({ input }) => ({ id: await db.createArea(input) })),
    update: adminProcedure
      .input(z.object({ id: z.number(), name: z.string().min(1).optional(), description: z.string().nullable().optional(), parentAreaId: z.number().nullable().optional(), sortOrder: z.number().optional(), active: z.boolean().optional() }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await db.updateArea(id, data);
        return { success: true } as const;
      }),
    delete: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      await db.deleteArea(input.id);
      return { success: true } as const;
    }),
  }),

  perspectives: router({
    list: protectedProcedure
      .input(z.object({ companyId: z.number().optional() }).optional())
      .query(async ({ input, ctx }) => {
        if (input?.companyId) {
          await assertCompanyAccess(ctx, input.companyId);
          return db.listPerspectives(input.companyId);
        }
        const all = await db.listPerspectives();
        return filterByAllowedCompanies(all, await scopedCompanyIds(ctx));
      }),
    create: adminProcedure
      .input(
        z.object({
          companyId: z.number(),
          name: z.string().min(1),
          description: z.string().optional(),
          color: z.string().optional(),
          sortOrder: z.number().optional(),
        }),
      )
      .mutation(async ({ input }) => ({ id: await db.createPerspective(input) })),
    update: adminProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().min(1).optional(),
          description: z.string().nullable().optional(),
          color: z.string().optional(),
          sortOrder: z.number().optional(),
          active: z.boolean().optional(),
        }),
      )
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await db.updatePerspective(id, data);
        return { success: true } as const;
      }),
    delete: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      await db.deletePerspective(input.id);
      return { success: true } as const;
    }),
  }),

  indicators: router({
    list: protectedProcedure
      .input(z.object({ companyId: z.number().optional() }).optional())
      .query(async ({ input, ctx }) => {
        if (input?.companyId) await assertCompanyAccess(ctx, input.companyId);
        const all = await db.listIndicators(input?.companyId);
        const allowedAreaIds = await scopedAreaIds(ctx);
        if (allowedAreaIds === null) return all;
        const allowedIndicatorIds = new Set(await db.getIndicatorIdsForAreas(allowedAreaIds));
        return all.filter((i) => allowedIndicatorIds.has(i.id));
      }),
    create: adminProcedure
      .input(
        z.object({
          companyId: z.number(),
          perspectiveId: z.number(),
          name: z.string().min(1),
          description: z.string().optional(),
          unit: z.string().optional(),
          scaleType: scaleTypeSchema,
          direction: directionSchema,
          objectiveId: z.number().nullable().optional(),
          calibrationRuleId: z.number().nullable().optional(),
          defaultGoal: z.number().nullable().optional(),
          sortOrder: z.number().optional(),
        }),
      )
      .mutation(async ({ input }) => ({ id: await db.createIndicator(input) })),
    update: adminProcedure
      .input(
        z.object({
          id: z.number(),
          perspectiveId: z.number().optional(),
          name: z.string().min(1).optional(),
          description: z.string().nullable().optional(),
          unit: z.string().optional(),
          scaleType: scaleTypeSchema.optional(),
          direction: directionSchema.optional(),
          objectiveId: z.number().nullable().optional(),
          calibrationRuleId: z.number().nullable().optional(),
          defaultGoal: z.number().nullable().optional(),
          sortOrder: z.number().optional(),
          active: z.boolean().optional(),
        }),
      )
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await db.updateIndicator(id, data);
        return { success: true } as const;
      }),
    delete: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      await db.deleteIndicator(input.id);
      return { success: true } as const;
    }),
  }),

  objectives: router({
    list: protectedProcedure
      .input(z.object({ companyId: z.number().optional() }).optional())
      .query(async ({ input, ctx }) => {
        if (input?.companyId) {
          await assertCompanyAccess(ctx, input.companyId);
          return db.listObjectives(input.companyId);
        }
        const all = await db.listObjectives();
        return filterByAllowedCompanies(all, await scopedCompanyIds(ctx));
      }),
    create: adminProcedure
      .input(
        z.object({
          companyId: z.number(),
          perspectiveId: z.number(),
          name: z.string().min(1),
          description: z.string().optional(),
          sortOrder: z.number().optional(),
        }),
      )
      .mutation(async ({ input }) => ({ id: await db.createObjective(input) })),
    update: adminProcedure
      .input(
        z.object({
          id: z.number(),
          perspectiveId: z.number().optional(),
          name: z.string().min(1).optional(),
          description: z.string().nullable().optional(),
          sortOrder: z.number().optional(),
          active: z.boolean().optional(),
        }),
      )
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await db.updateObjective(id, data);
        return { success: true } as const;
      }),
    delete: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      await db.deleteObjective(input.id);
      return { success: true } as const;
    }),
  }),

  calibrationRules: router({
    list: protectedProcedure
      .input(z.object({ companyId: z.number().optional() }).optional())
      .query(async ({ input, ctx }) => {
        if (input?.companyId) {
          await assertCompanyAccess(ctx, input.companyId);
          return db.listCalibrationRules(input.companyId);
        }
        const all = await db.listCalibrationRules();
        return filterByAllowedCompanies(all, await scopedCompanyIds(ctx));
      }),
    create: adminProcedure
      .input(
        z.object({
          companyId: z.number(),
          name: z.string().min(1),
          description: z.string().optional(),
          directConversion: z.boolean(),
          sortOrder: z.number().optional(),
          ranges: z.array(rangeSchema),
        }),
      )
      .mutation(async ({ input }) => ({ id: await db.createCalibrationRule(input) })),
    update: adminProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().min(1).optional(),
          description: z.string().nullable().optional(),
          directConversion: z.boolean().optional(),
          sortOrder: z.number().optional(),
          active: z.boolean().optional(),
          ranges: z.array(rangeSchema).optional(),
        }),
      )
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await db.updateCalibrationRule(id, data);
        return { success: true } as const;
      }),
    delete: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      await db.deleteCalibrationRule(input.id);
      return { success: true } as const;
    }),
  }),

  weights: router({
    list: protectedProcedure.input(z.object({ areaIds: z.array(z.number()) })).query(({ input }) => db.listWeights(input.areaIds)),
    set: adminProcedure
      .input(z.object({ areaId: z.number(), perspectiveId: z.number(), weight: z.number().min(0).max(1) }))
      .mutation(async ({ input }) => {
        await db.setWeight(input.areaId, input.perspectiveId, input.weight);
        return { success: true } as const;
      }),
  }),

  applicability: router({
    list: adminProcedure
      .input(z.object({ indicatorIds: z.array(z.number()) }))
      .query(({ input }) => db.listApplicability(input.indicatorIds)),
    set: adminProcedure
      .input(z.object({ indicatorId: z.number(), areaId: z.number(), applicable: z.boolean() }))
      .mutation(async ({ input }) => {
        await db.setApplicability(input.indicatorId, input.areaId, input.applicable);
        return { success: true } as const;
      }),
    setForIndicator: adminProcedure
      .input(z.object({ indicatorId: z.number(), areaIds: z.array(z.number()) }))
      .mutation(async ({ input }) => {
        await db.setApplicabilityForIndicator(input.indicatorId, input.areaIds);
        return { success: true } as const;
      }),
  }),

  entries: router({
    list: protectedProcedure
      .input(z.object({ indicatorIds: z.array(z.number()), year: z.number().optional(), month: z.number().optional() }))
      .query(async ({ input, ctx }) => {
        const allowedAreaIds = await scopedAreaIds(ctx);
        let indicatorIds = input.indicatorIds;
        if (allowedAreaIds !== null) {
          const allowedIndicatorIds = new Set(await db.getIndicatorIdsForAreas(allowedAreaIds));
          indicatorIds = indicatorIds.filter((id) => allowedIndicatorIds.has(id));
        }
        return db.listEntries(indicatorIds, input.year, input.month);
      }),
    upsert: protectedProcedure
      .input(
        z.object({
          indicatorId: z.number(),
          year: z.number().int().min(2000).max(2100),
          month: z.number().int().min(1).max(12),
          goal: z.number().nullable().optional(),
          result: z.number().nullable().optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const allowedAreaIds = await scopedAreaIds(ctx);
        if (allowedAreaIds !== null) {
          const allowedIndicatorIds = await db.getIndicatorIdsForAreas(allowedAreaIds);
          if (!allowedIndicatorIds.includes(input.indicatorId)) {
            throw new TRPCError({ code: "FORBIDDEN", message: "Este indicador não pertence às suas áreas" });
          }
        }
        await db.upsertEntry({ ...input, source: "manual", updatedBy: ctx.user.id });
        return { success: true } as const;
      }),
    delete: adminProcedure
      .input(z.object({ indicatorId: z.number(), year: z.number(), month: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteEntry(input.indicatorId, input.year, input.month);
        return { success: true } as const;
      }),
  }),

  importer: router({
    /** Recebe o arquivo Excel em base64, faz o parse e importa metas/resultados */
    importExcel: protectedProcedure
      .input(
        z.object({
          companyId: z.number(),
          year: z.number().int().min(2000).max(2100),
          month: z.number().int().min(1).max(12),
          fileName: z.string(),
          fileBase64: z.string(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        await assertCompanyAccess(ctx, input.companyId);
        const buffer = Buffer.from(input.fileBase64, "base64");
        if (buffer.length > 15 * 1024 * 1024) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Arquivo muito grande (máx. 15 MB)" });
        }
        let rows;
        try {
          rows = await parseIndicadoresSheet(buffer);
        } catch (e) {
          throw new TRPCError({ code: "BAD_REQUEST", message: e instanceof Error ? e.message : "Falha ao ler o arquivo Excel" });
        }
        const allowedAreaIds = await scopedAreaIds(ctx);
        const allowedIndicatorIds = allowedAreaIds === null ? null : await db.getIndicatorIdsForAreas(allowedAreaIds);
        const result = await importEntries(input.companyId, input.year, input.month, rows, ctx.user.id, allowedIndicatorIds);
        await db.createImportLog({
          companyId: input.companyId,
          year: input.year,
          month: input.month,
          fileName: input.fileName,
          totalRows: result.totalRows,
          matchedRows: result.matched.length,
          unmatchedRows: JSON.stringify(result.unmatched),
          importedBy: ctx.user.id,
        });
        return result;
      }),
    logs: protectedProcedure
      .input(z.object({ companyId: z.number() }))
      .query(async ({ input, ctx }) => {
        await assertCompanyAccess(ctx, input.companyId);
        return db.listImportLogs(input.companyId);
      }),
  }),

  dashboard: router({
    snapshot: protectedProcedure
      .input(z.object({ companyId: z.number(), mode: z.enum(["month", "ytd"]).default("month") }).merge(periodSchema))
      .query(async ({ input, ctx }) => {
        await assertCompanyAccess(ctx, input.companyId);
        const allowedAreaIds = await scopedAreaIds(ctx);
        return buildCompanySnapshot(input.companyId, input.year, input.month, allowedAreaIds, input.mode);
      }),
    history: protectedProcedure
      .input(
        z.object({
          companyId: z.number(),
          periods: z.array(periodSchema).min(1).max(36),
        }),
      )
      .query(async ({ input, ctx }) => {
        await assertCompanyAccess(ctx, input.companyId);
        const allowedAreaIds = await scopedAreaIds(ctx);
        return buildHistory(input.companyId, input.periods, allowedAreaIds);
      }),
  }),
});

export type AppRouter = typeof appRouter;
