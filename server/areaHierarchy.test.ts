import { describe, expect, it } from "vitest";

/**
 * Replica a lógica de validação de hierarquia de assertValidParentArea (server/db.ts)
 * de forma pura, sem banco, para validar a detecção de ciclos e empresa.
 */
interface AreaRow {
  id: number;
  companyId: number;
  parentAreaId: number | null;
}

function validateParent(all: AreaRow[], areaId: number, parentAreaId: number): string | null {
  if (areaId === parentAreaId) return "self";
  const byId = new Map(all.map((a) => [a.id, a]));
  const area = byId.get(areaId);
  const parent = byId.get(parentAreaId);
  if (!area || !parent) return "not_found";
  if (area.companyId !== parent.companyId) return "company";
  let cursor: number | null = parentAreaId;
  const visited = new Set<number>();
  while (cursor !== null) {
    if (cursor === areaId) return "cycle";
    if (visited.has(cursor)) break;
    visited.add(cursor);
    cursor = byId.get(cursor)?.parentAreaId ?? null;
  }
  return null;
}

const areas: AreaRow[] = [
  { id: 1, companyId: 10, parentAreaId: null }, // CEO
  { id: 2, companyId: 10, parentAreaId: 1 }, // Diretoria
  { id: 3, companyId: 10, parentAreaId: 2 }, // Gerência
  { id: 4, companyId: 10, parentAreaId: 3 }, // Coordenador
  { id: 5, companyId: 99, parentAreaId: null }, // outra empresa
];

describe("validação da hierarquia de áreas", () => {
  it("aceita subordinação válida", () => {
    expect(validateParent(areas, 4, 2)).toBeNull();
  });

  it("rejeita auto-referência", () => {
    expect(validateParent(areas, 2, 2)).toBe("self");
  });

  it("rejeita ciclo direto (A→B, B→A)", () => {
    // 2 é pai de 3; tentar fazer 2 subordinado a 3 criaria ciclo
    expect(validateParent(areas, 2, 3)).toBe("cycle");
  });

  it("rejeita ciclo indireto (A→B→C→A)", () => {
    // 1 é raiz da cadeia 1←2←3←4; tentar fazer 1 subordinado a 4 criaria ciclo
    expect(validateParent(areas, 1, 4)).toBe("cycle");
  });

  it("rejeita área-pai de outra empresa", () => {
    expect(validateParent(areas, 2, 5)).toBe("company");
  });

  it("rejeita área-pai inexistente", () => {
    expect(validateParent(areas, 2, 999)).toBe("not_found");
  });
});
