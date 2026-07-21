import { TRPCError } from "@trpc/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { SCALE_TYPES } from "../shared/calcEngine";
import { signAuthToken } from "./_core/auth";
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

const BCRYPT_ROUNDS = 10;
// Comparado quando o email não existe, para que o tempo de resposta não denuncie
// se a falha foi por email ou por senha (bcrypt.compare sempre roda de qualquer jeito).
const DUMMY_PASSWORD_HASH = bcrypt.hashSync("no-such-user", BCRYPT_ROUNDS);
const INVALID_CREDENTIALS_MSG = "Email ou senha inválidos";

const scaleTypeSchema = z.enum(SCALE_TYPES);
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
        }),
      )
      .mutation(async ({ input }) => {
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
        });
        return { id };
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
    list: protectedProcedure.query(() => db.listCompanies()),
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
      .query(({ input }) => db.listAreas(input?.companyId)),
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
      .query(({ input }) => db.listPerspectives(input?.companyId)),
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
      .query(({ input }) => db.listIndicators(input?.companyId)),
    create: adminProcedure
      .input(
        z.object({
          companyId: z.number(),
          perspectiveId: z.number(),
          name: z.string().min(1),
          description: z.string().optional(),
          unit: z.string().optional(),
          scaleType: scaleTypeSchema,
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
      .query(({ input }) => db.listObjectives(input?.companyId)),
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
      .query(({ input }) => db.listCalibrationRules(input?.companyId)),
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
    list: protectedProcedure
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
      .query(({ input }) => db.listEntries(input.indicatorIds, input.year, input.month)),
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
        const result = await importEntries(input.companyId, input.year, input.month, rows, ctx.user.id);
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
    logs: protectedProcedure.input(z.object({ companyId: z.number() })).query(({ input }) => db.listImportLogs(input.companyId)),
  }),

  dashboard: router({
    snapshot: protectedProcedure
      .input(z.object({ companyId: z.number() }).merge(periodSchema))
      .query(({ input }) => buildCompanySnapshot(input.companyId, input.year, input.month)),
    history: protectedProcedure
      .input(
        z.object({
          companyId: z.number(),
          periods: z.array(periodSchema).min(1).max(36),
        }),
      )
      .query(({ input }) => buildHistory(input.companyId, input.periods)),
  }),
});

export type AppRouter = typeof appRouter;
