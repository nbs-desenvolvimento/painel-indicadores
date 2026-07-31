/** Média aritmética simples ignorando valores null (mesma semântica do AVERAGE da planilha). */
export function averageScore(scores: (number | null | undefined)[]): number | null {
  const valid = scores.filter((s): s is number => s !== null && s !== undefined);
  return valid.length > 0 ? valid.reduce((acc, s) => acc + s, 0) / valid.length : null;
}
