import { describe, expect, it } from "vitest";
import { computeAreaScore, computeScoreWithRule, type CalibrationRuleDef, type IndicatorInput } from "./calcEngine";

/**
 * Testes das 6 regras de calibragem pré-carregadas, reproduzindo exatamente
 * as faixas da tabela fornecida pelo usuário (atingimento A = Resultado/Meta).
 */

const regra1: CalibrationRuleDef = {
  directConversion: false,
  ranges: [
    { minAttainment: 1.05, minInclusive: true, maxAttainment: null, maxInclusive: false, score: 1.2, sortOrder: 1 },
    { minAttainment: 0.95, minInclusive: true, maxAttainment: 1.05, maxInclusive: false, score: 1.0, sortOrder: 2 },
    { minAttainment: 0.85, minInclusive: true, maxAttainment: 0.95, maxInclusive: false, score: 0.6, sortOrder: 3 },
    { minAttainment: null, minInclusive: false, maxAttainment: 0.85, maxInclusive: false, score: 0.0, sortOrder: 4 },
  ],
};

const regra2: CalibrationRuleDef = {
  directConversion: false,
  ranges: [
    { minAttainment: 1.0, minInclusive: true, maxAttainment: null, maxInclusive: false, score: 1.0, sortOrder: 1 },
    { minAttainment: 0.95, minInclusive: true, maxAttainment: 1.0, maxInclusive: false, score: 0.8, sortOrder: 2 },
    { minAttainment: 0.85, minInclusive: true, maxAttainment: 0.95, maxInclusive: false, score: 0.6, sortOrder: 3 },
    { minAttainment: null, minInclusive: false, maxAttainment: 0.85, maxInclusive: false, score: 0.0, sortOrder: 4 },
  ],
};

const regra3: CalibrationRuleDef = {
  directConversion: false,
  ranges: [
    { minAttainment: null, minInclusive: false, maxAttainment: 1.0, maxInclusive: true, score: 1.0, sortOrder: 1 },
    { minAttainment: 1.0, minInclusive: false, maxAttainment: 1.03, maxInclusive: true, score: 0.8, sortOrder: 2 },
    { minAttainment: 1.03, minInclusive: false, maxAttainment: 1.05, maxInclusive: true, score: 0.6, sortOrder: 3 },
    { minAttainment: 1.05, minInclusive: false, maxAttainment: null, maxInclusive: false, score: 0.0, sortOrder: 4 },
  ],
};

const regra4: CalibrationRuleDef = {
  directConversion: false,
  ranges: [
    { minAttainment: 1.1, minInclusive: true, maxAttainment: null, maxInclusive: false, score: 0.0, sortOrder: 1 },
    { minAttainment: 1.05, minInclusive: true, maxAttainment: 1.1, maxInclusive: false, score: 0.6, sortOrder: 2 },
    { minAttainment: 0.95, minInclusive: true, maxAttainment: 1.05, maxInclusive: false, score: 1.0, sortOrder: 3 },
    { minAttainment: 0.9, minInclusive: true, maxAttainment: 0.95, maxInclusive: false, score: 0.6, sortOrder: 4 },
    { minAttainment: null, minInclusive: false, maxAttainment: 0.9, maxInclusive: false, score: 0.0, sortOrder: 5 },
  ],
};

const regra5: CalibrationRuleDef = {
  directConversion: false,
  ranges: [
    { minAttainment: 1.1, minInclusive: false, maxAttainment: null, maxInclusive: false, score: 0.0, sortOrder: 1 },
    { minAttainment: 1.05, minInclusive: false, maxAttainment: 1.1, maxInclusive: true, score: 0.6, sortOrder: 2 },
    { minAttainment: 0.95, minInclusive: false, maxAttainment: 1.05, maxInclusive: true, score: 1.0, sortOrder: 3 },
    { minAttainment: null, minInclusive: false, maxAttainment: 0.95, maxInclusive: true, score: 1.2, sortOrder: 4 },
  ],
};

const conversaoDireta: CalibrationRuleDef = { directConversion: true, ranges: [] };

describe("Regra 1 — Maior-melhor até 120%", () => {
  it("R >= 105% → 120%", () => {
    expect(computeScoreWithRule(regra1, 100, 105)).toBe(1.2);
    expect(computeScoreWithRule(regra1, 100, 130)).toBe(1.2);
  });
  it("95% <= R < 105% → 100%", () => {
    expect(computeScoreWithRule(regra1, 100, 95)).toBe(1.0);
    expect(computeScoreWithRule(regra1, 100, 104.9)).toBe(1.0);
  });
  it("85% <= R < 95% → 60%", () => {
    expect(computeScoreWithRule(regra1, 100, 85)).toBe(0.6);
    expect(computeScoreWithRule(regra1, 100, 94.9)).toBe(0.6);
  });
  it("R < 85% → 0%", () => {
    expect(computeScoreWithRule(regra1, 100, 84.9)).toBe(0);
    expect(computeScoreWithRule(regra1, 100, 0)).toBe(0);
  });
});

describe("Regra 2 — Maior-melhor até 100%", () => {
  it("degraus corretos", () => {
    expect(computeScoreWithRule(regra2, 100, 100)).toBe(1.0);
    expect(computeScoreWithRule(regra2, 100, 99)).toBe(0.8);
    expect(computeScoreWithRule(regra2, 100, 95)).toBe(0.8);
    expect(computeScoreWithRule(regra2, 100, 90)).toBe(0.6);
    expect(computeScoreWithRule(regra2, 100, 84)).toBe(0);
  });
});

describe("Regra 3 — Menor-melhor até 100%", () => {
  it("degraus corretos", () => {
    expect(computeScoreWithRule(regra3, 100, 100)).toBe(1.0);
    expect(computeScoreWithRule(regra3, 100, 80)).toBe(1.0);
    expect(computeScoreWithRule(regra3, 100, 102)).toBe(0.8);
    expect(computeScoreWithRule(regra3, 100, 103)).toBe(0.8);
    expect(computeScoreWithRule(regra3, 100, 104)).toBe(0.6);
    expect(computeScoreWithRule(regra3, 100, 105)).toBe(0.6);
    expect(computeScoreWithRule(regra3, 100, 106)).toBe(0);
  });
});

describe("Regra 4 — Faixa-alvo", () => {
  it("degraus corretos", () => {
    expect(computeScoreWithRule(regra4, 100, 115)).toBe(0);
    expect(computeScoreWithRule(regra4, 100, 110)).toBe(0);
    expect(computeScoreWithRule(regra4, 100, 107)).toBe(0.6);
    expect(computeScoreWithRule(regra4, 100, 100)).toBe(1.0);
    expect(computeScoreWithRule(regra4, 100, 95)).toBe(1.0);
    expect(computeScoreWithRule(regra4, 100, 92)).toBe(0.6);
    expect(computeScoreWithRule(regra4, 100, 89)).toBe(0);
  });
});

describe("Regra 5 — Menor-melhor até 120%", () => {
  it("degraus corretos", () => {
    expect(computeScoreWithRule(regra5, 100, 111)).toBe(0);
    expect(computeScoreWithRule(regra5, 100, 110)).toBe(0.6);
    expect(computeScoreWithRule(regra5, 100, 106)).toBe(0.6);
    expect(computeScoreWithRule(regra5, 100, 105)).toBe(1.0);
    expect(computeScoreWithRule(regra5, 100, 100)).toBe(1.0);
    expect(computeScoreWithRule(regra5, 100, 96)).toBe(1.0);
    expect(computeScoreWithRule(regra5, 100, 95)).toBe(1.2);
    expect(computeScoreWithRule(regra5, 100, 50)).toBe(1.2);
  });
});

describe("Conversão Direta", () => {
  it("o score é o próprio atingimento", () => {
    expect(computeScoreWithRule(conversaoDireta, 100, 87)).toBeCloseTo(0.87, 10);
    expect(computeScoreWithRule(conversaoDireta, 200, 300)).toBeCloseTo(1.5, 10);
    expect(computeScoreWithRule(conversaoDireta, 100, 0)).toBe(0);
  });
});

describe("Casos de borda", () => {
  it("meta ou resultado ausentes → null", () => {
    expect(computeScoreWithRule(regra1, null, 100)).toBeNull();
    expect(computeScoreWithRule(regra1, 100, null)).toBeNull();
    expect(computeScoreWithRule(regra1, 0, 100)).toBeNull();
  });
  it("tolerância de ponto flutuante nos limites (Excel-compatível)", () => {
    // 1.05 * 110 = 115.50000000000001 em IEEE754; R=115.5 deve contar como >= 105%
    expect(computeScoreWithRule(regra1, 110, 115.5)).toBe(1.2);
  });
  it("equivalência com os valores reais da planilha (Regra 1: Receita Bruta)", () => {
    // Planilha: meta 8.402.780,84, resultado 9.352.848,58 → atingimento 111% → 120%
    expect(computeScoreWithRule(regra1, 8402780.84, 9352848.58)).toBe(1.2);
  });
  it("equivalência com os valores reais da planilha (Regra 3: Despesas Indiretas)", () => {
    // Planilha: meta 1.688.585,05, resultado 1.765.087,54 → 104,5% → 60%
    expect(computeScoreWithRule(regra3, 1688585.05, 1765087.54)).toBe(0.6);
  });
});

describe("Direction — indicador de redução (lower_better)", () => {
  it("higher_better (padrão/omitido): comportamento inalterado — sem regressão", () => {
    expect(computeScoreWithRule(regra1, 100, 95)).toBe(1.0);
    expect(computeScoreWithRule(regra1, 100, 105)).toBe(1.2);
    expect(computeScoreWithRule(regra1, 100, 95, "higher_better")).toBe(1.0);
  });

  it("lower_better inverte o atingimento: reduzir o resultado é premiado", () => {
    // meta=100, resultado=80: reduziu bastante → ótimo → atingimento invertido 100/80=1.25 → 120%
    expect(computeScoreWithRule(regra1, 100, 80, "lower_better")).toBe(1.2);
  });

  it("lower_better inverte o atingimento: aumentar o resultado é penalizado", () => {
    // meta=100, resultado=120: aumentou bastante → ruim → atingimento invertido 100/120≈0.833 → 0%
    expect(computeScoreWithRule(regra1, 100, 120, "lower_better")).toBe(0);
  });

  it("mesmos números, direção oposta, score oposto — exatamente o bug relatado", () => {
    // resultado=95 (abaixo da meta): bom para redução, neutro/ok para aumento
    const higher = computeScoreWithRule(regra1, 100, 95, "higher_better");
    const lower = computeScoreWithRule(regra1, 100, 95, "lower_better");
    expect(higher).toBe(1.0);
    expect(lower).toBe(1.2);
    expect(lower).toBeGreaterThan(higher!);

    // resultado=105 (acima da meta): ruim para redução, ótimo para aumento
    const higher2 = computeScoreWithRule(regra1, 100, 105, "higher_better");
    const lower2 = computeScoreWithRule(regra1, 100, 105, "lower_better");
    expect(higher2).toBe(1.2);
    expect(lower2).toBe(1.0);
    expect(lower2).toBeLessThan(higher2!);
  });

  it("resultado = 0 com lower_better: redução total cai na melhor faixa (atingimento infinito)", () => {
    expect(computeScoreWithRule(regra1, 100, 0, "lower_better")).toBe(1.2);
  });

  it("meta = 0 continua retornando null, independente da direção", () => {
    expect(computeScoreWithRule(regra1, 0, 100, "lower_better")).toBeNull();
  });

  it("conversão direta com lower_better: score é o atingimento invertido", () => {
    // meta=200, resultado=100: reduziu pela metade → atingimento invertido = 200/100 = 2.0 (200%)
    expect(computeScoreWithRule(conversaoDireta, 200, 100, "lower_better")).toBeCloseTo(2.0, 10);
  });
});

describe("Direction — computeAreaScore com indicadores mistos", () => {
  it("aplica a direção de cada indicador individualmente na agregação por área", () => {
    const indicators: IndicatorInput[] = [
      {
        id: 1,
        perspectiveId: 10,
        name: "Faturamento (aumento)",
        scaleType: "higher_better_120",
        calibrationRule: regra1,
        direction: "higher_better",
        goal: 100,
        result: 105, // aumentou → bom → 120%
      },
      {
        id: 2,
        perspectiveId: 10,
        name: "Retrabalho (redução)",
        scaleType: "higher_better_120",
        calibrationRule: regra1,
        direction: "lower_better",
        goal: 100,
        result: 105, // aumentou → ruim → atingimento invertido ~0.952 → 100%... valor abaixo do primeiro
      },
    ];
    const weights = new Map([[10, 1]]);
    const areaScore = computeAreaScore(1, indicators, weights, [10]);
    const persp = areaScore.perspectives[0];
    expect(persp.indicatorScores.find((s) => s.indicatorId === 1)?.score).toBe(1.2);
    expect(persp.indicatorScores.find((s) => s.indicatorId === 2)?.score).toBe(1.0);
    // média dos dois scores (1.2 + 1.0) / 2 = 1.1
    expect(persp.average).toBeCloseTo(1.1, 10);
  });
});
