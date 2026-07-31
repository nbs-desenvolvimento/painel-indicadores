/**
 * Backfill de user_companies para usuários comuns já cadastrados antes da
 * feature de multi-tenancy (ver PLANO_MULTI_TENANCY_EMPRESAS.md, §6).
 *
 * Administradores não recebem nenhuma linha — eles não são restritos por
 * empresa, veem todas automaticamente.
 *
 * Para cada usuário comum (role = 'user'):
 * - Infere o conjunto de empresas a partir das áreas já liberadas para ele
 *   (user_areas → areas.companyId) e vincula uma linha por empresa distinta
 *   encontrada (pode ser 1 ou mais).
 * - Se o usuário não tiver nenhuma área liberada, vincula à primeira empresa
 *   cadastrada (ORDER BY id) e imprime um aviso para revisão manual.
 *
 * Idempotente (ON CONFLICT DO NOTHING) — seguro rodar mais de uma vez.
 */
import "dotenv/config";
import { Client } from "pg";

const conn = new Client({ connectionString: process.env.DATABASE_URL });
await conn.connect();

const { rows: regularUsers } = await conn.query(
  `SELECT id, email FROM users WHERE role = 'user' ORDER BY id`,
);

if (regularUsers.length === 0) {
  console.log("[Backfill] Nenhum usuário comum encontrado — nada a fazer.");
  await conn.end();
  process.exit(0);
}

const { rows: firstCompanyRows } = await conn.query(
  `SELECT id, name FROM companies ORDER BY id LIMIT 1`,
);
const firstCompany = firstCompanyRows[0] ?? null;

let linked = 0;
let ambiguousOrEmpty = 0;

for (const user of regularUsers) {
  const { rows: companyRows } = await conn.query(
    `SELECT DISTINCT a."companyId" AS "companyId"
     FROM user_areas ua
     JOIN areas a ON a.id = ua."areaId"
     WHERE ua."userId" = $1`,
    [user.id],
  );
  let companyIds = companyRows.map((r) => r.companyId);

  if (companyIds.length === 0) {
    if (!firstCompany) {
      console.warn(`[Backfill] ${user.email}: sem áreas e sem nenhuma empresa cadastrada — pulando.`);
      continue;
    }
    console.warn(
      `[Backfill] ${user.email}: sem nenhuma área liberada — vinculado à primeira empresa cadastrada ` +
        `("${firstCompany.name}", id ${firstCompany.id}). Revise manualmente pela tela de Usuários.`,
    );
    companyIds = [firstCompany.id];
    ambiguousOrEmpty++;
  } else if (companyIds.length > 1) {
    console.warn(
      `[Backfill] ${user.email}: áreas de ${companyIds.length} empresas diferentes — vinculado a todas (${companyIds.join(", ")}).`,
    );
    ambiguousOrEmpty++;
  }

  for (const companyId of companyIds) {
    await conn.query(
      `INSERT INTO user_companies ("userId", "companyId") VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [user.id, companyId],
    );
  }
  linked++;
}

console.log(`[Backfill] ${linked} usuário(s) comum(ns) processado(s), ${ambiguousOrEmpty} com aviso de revisão manual.`);
await conn.end();
