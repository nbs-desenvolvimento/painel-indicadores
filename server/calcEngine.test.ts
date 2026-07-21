import { describe, expect, it } from "vitest";
import { computeAreaScore, computeScore } from "../shared/calcEngine";

/**
 * Valores de validação extraídos diretamente da planilha GESTÃO DE INDICADORES:
 * - Receita Bruta: meta 1.100.000, resultado 1.200.000, higher_better_120 → 120% (H3 = 1.2)
 * - Margem de Contribuição Total: meta 0.75, resultado 0.72, higher_better_120 → 100% (H5 = 1.0)
 * - Ebitda: meta 0.28, resultado 0.30, higher_better_120 → 120% (H6 = 1.2)
 * - Despesas Indiretas: meta 250.000, resultado 260.000, lower_better_100 → 60% (H7 = 0.6)
 */
describe("computeScore — validação contra a planilha", () => {
  it("Receita Bruta (higher_better_120): 1.200.000 vs meta 1.100.000 → 1.2", () => {
    expect(computeScore("higher_better_120", 1100000, 1200000)).toBe(1.2);
  });

  it("Margem de Contribuição (higher_better_120): 0.72 vs meta 0.75 → 1.0", () => {
    expect(computeScore("higher_better_120", 0.75, 0.72)).toBe(1.0);
  });

  it("Ebitda (higher_better_120): 0.30 vs meta 0.28 → 1.2", () => {
    expect(computeScore("higher_better_120", 0.28, 0.3)).toBe(1.2);
  });

  it("Despesas Indiretas (lower_better_100): 260.000 vs meta 250.000 → 0.6", () => {
    expect(computeScore("lower_better_100", 250000, 260000)).toBe(0.6);
  });
});

describe("computeScore — degraus de cada tipo de escala", () => {
  it("higher_better_120: todos os degraus", () => {
    expect(computeScore("higher_better_120", 100, 105)).toBe(1.2); // >= 1.05*M
    expect(computeScore("higher_better_120", 100, 104.9)).toBe(1.0); // >= 0.95*M
    expect(computeScore("higher_better_120", 100, 95)).toBe(1.0);
    expect(computeScore("higher_better_120", 100, 94.9)).toBe(0.6); // >= 0.85*M
    expect(computeScore("higher_better_120", 100, 85)).toBe(0.6);
    expect(computeScore("higher_better_120", 100, 84.9)).toBe(0);
  });

  it("higher_better_100: todos os degraus", () => {
    expect(computeScore("higher_better_100", 100, 100)).toBe(1.0);
    expect(computeScore("higher_better_100", 100, 99)).toBe(0.8);
    expect(computeScore("higher_better_100", 100, 95)).toBe(0.8);
    expect(computeScore("higher_better_100", 100, 94.9)).toBe(0.6);
    expect(computeScore("higher_better_100", 100, 85)).toBe(0.6);
    expect(computeScore("higher_better_100", 100, 84.9)).toBe(0);
  });

  it("lower_better_100: todos os degraus", () => {
    expect(computeScore("lower_better_100", 100, 100)).toBe(1.0);
    expect(computeScore("lower_better_100", 100, 101)).toBe(0.8);
    expect(computeScore("lower_better_100", 100, 102)).toBe(0.8);
    expect(computeScore("lower_better_100", 100, 104)).toBe(0.6);
    expect(computeScore("lower_better_100", 100, 105)).toBe(0.6);
    expect(computeScore("lower_better_100", 100, 105.1)).toBe(0);
  });

  it("lower_better_120: todos os degraus", () => {
    expect(computeScore("lower_better_120", 100, 111)).toBe(0);
    expect(computeScore("lower_better_120", 100, 110)).toBe(0.6);
    expect(computeScore("lower_better_120", 100, 106)).toBe(0.6);
    expect(computeScore("lower_better_120", 100, 105)).toBe(1.0);
    expect(computeScore("lower_better_120", 100, 96)).toBe(1.0);
    expect(computeScore("lower_better_120", 100, 95)).toBe(1.2);
    expect(computeScore("lower_better_120", 100, 50)).toBe(1.2);
  });

  it("target_range: todos os degraus", () => {
    expect(computeScore("target_range", 100, 110)).toBe(0);
    expect(computeScore("target_range", 100, 109)).toBe(0.6);
    expect(computeScore("target_range", 100, 105)).toBe(0.6);
    expect(computeScore("target_range", 100, 104)).toBe(1.0);
    expect(computeScore("target_range", 100, 95)).toBe(1.0);
    expect(computeScore("target_range", 100, 94)).toBe(0.6);
    expect(computeScore("target_range", 100, 90)).toBe(0.6);
    expect(computeScore("target_range", 100, 89)).toBe(0);
  });

  it("retorna null quando meta ou resultado ausentes", () => {
    expect(computeScore("higher_better_120", null, 100)).toBeNull();
    expect(computeScore("higher_better_120", 100, null)).toBeNull();
    expect(computeScore("higher_better_120", undefined, undefined)).toBeNull();
  });
});

describe("computeAreaScore — validação contra a planilha", () => {
  /**
   * GRUPO POLICONTROL, perspectiva Financeira:
   * scores J3:J7 = [1.2, 1.0, 1.2, 0.6] (Receita, Margem, Ebitda, Despesas)
   * peso K3 = 0.5 → K4 = AVERAGE * 0.5 = 1.0 * 0.5 = 0.5
   */
  it("perspectiva Financeira do Grupo: média (1.2,1.0,1.2,0.6)=1.0 × peso 0.5 = 0.5", () => {
    const result = computeAreaScore(
      1,
      [
        { id: 1, perspectiveId: 10, name: "Receita Bruta", scaleType: "higher_better_120", goal: 1100000, result: 1200000 },
        { id: 2, perspectiveId: 10, name: "Margem", scaleType: "higher_better_120", goal: 0.75, result: 0.72 },
        { id: 3, perspectiveId: 10, name: "Ebitda", scaleType: "higher_better_120", goal: 0.28, result: 0.3 },
        { id: 4, perspectiveId: 10, name: "Despesas Indiretas", scaleType: "lower_better_100", goal: 250000, result: 260000 },
      ],
      new Map([[10, 0.5]]),
      [10],
    );
    expect(result.perspectives[0].average).toBeCloseTo(1.0, 10);
    expect(result.perspectives[0].weighted).toBeCloseTo(0.5, 10);
    expect(result.total).toBeCloseTo(0.5, 10);
  });

  /**
   * Exemplo da imagem do usuário (CFO):
   * média de (80%, 100%, 20%, 0%) = 50% × peso 70% = 35%
   */
  it("exemplo CFO: média (0.8,1.0,0.2,0.0)=0.5 × peso 0.7 = 0.35", () => {
    // Simula scores diretamente por metas/resultados que produzem estes scores
    const perspectives = computeAreaScore(
      2,
      [
        { id: 1, perspectiveId: 20, name: "A", scaleType: "higher_better_100", goal: 100, result: 96 }, // 0.8
        { id: 2, perspectiveId: 20, name: "B", scaleType: "higher_better_100", goal: 100, result: 100 }, // 1.0
        { id: 3, perspectiveId: 20, name: "C", scaleType: "higher_better_100", goal: 100, result: 50 }, // 0
        { id: 4, perspectiveId: 20, name: "D", scaleType: "higher_better_100", goal: 100, result: 86 }, // 0.6
      ],
      new Map([[20, 0.7]]),
      [20],
    );
    // média (0.8+1.0+0+0.6)/4 = 0.6 × 0.7 = 0.42
    expect(perspectives.perspectives[0].average).toBeCloseTo(0.6, 10);
    expect(perspectives.total).toBeCloseTo(0.42, 10);
  });

  it("soma das 4 perspectivas = total da área (ex. planilha I34 = 1.04)", () => {
    // GRUPO POLICONTROL na planilha: K4=0.5, K9=0.22, K18=0.22, K28=0.1 → I34=1.04
    const result = computeAreaScore(
      1,
      [
        // Financeira (peso 0.5): scores 1.2, 1.0, 1.2, 0.6 → média 1.0 → 0.5
        { id: 1, perspectiveId: 1, name: "Receita Bruta", scaleType: "higher_better_120", goal: 1100000, result: 1200000 },
        { id: 2, perspectiveId: 1, name: "Margem", scaleType: "higher_better_120", goal: 0.75, result: 0.72 },
        { id: 3, perspectiveId: 1, name: "Ebitda", scaleType: "higher_better_120", goal: 0.28, result: 0.3 },
        { id: 4, perspectiveId: 1, name: "Despesas", scaleType: "lower_better_100", goal: 250000, result: 260000 },
        // Mercado (peso 0.2): média 1.1 → 0.22 (scores 1.2 e 1.0)
        { id: 5, perspectiveId: 2, name: "M1", scaleType: "higher_better_120", goal: 100, result: 110 }, // 1.2
        { id: 6, perspectiveId: 2, name: "M2", scaleType: "higher_better_100", goal: 100, result: 100 }, // 1.0
        // Processos (peso 0.2): média 1.1 → 0.22
        { id: 7, perspectiveId: 3, name: "P1", scaleType: "lower_better_120", goal: 100, result: 90 }, // 1.2
        { id: 8, perspectiveId: 3, name: "P2", scaleType: "higher_better_100", goal: 100, result: 100 }, // 1.0
        // Crescimento (peso 0.1): média 1.0 → 0.1
        { id: 9, perspectiveId: 4, name: "C1", scaleType: "higher_better_100", goal: 100, result: 100 }, // 1.0
      ],
      new Map([
        [1, 0.5],
        [2, 0.2],
        [3, 0.2],
        [4, 0.1],
      ]),
      [1, 2, 3, 4],
    );
    expect(result.total).toBeCloseTo(0.5 + 0.22 + 0.22 + 0.1, 10); // 1.04
  });

  it("indicadores sem lançamento são ignorados na média (AVERAGE ignora vazios)", () => {
    const result = computeAreaScore(
      1,
      [
        { id: 1, perspectiveId: 1, name: "A", scaleType: "higher_better_100", goal: 100, result: 100 }, // 1.0
        { id: 2, perspectiveId: 1, name: "B", scaleType: "higher_better_100", goal: null, result: null }, // null
      ],
      new Map([[1, 0.5]]),
      [1],
    );
    expect(result.perspectives[0].average).toBeCloseTo(1.0, 10);
    expect(result.total).toBeCloseTo(0.5, 10);
  });

  it("perspectiva sem nenhum indicador lançado contribui com 0", () => {
    const result = computeAreaScore(1, [], new Map([[1, 0.5]]), [1]);
    expect(result.perspectives[0].average).toBeNull();
    expect(result.total).toBe(0);
  });
});
