export const round = (x: number): number => Math.round(x * 100) / 100;

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const i = Math.max(0, Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1));
  return round(s[i]);
}

export function avg(values: number[]): number {
  return values.length ? round(values.reduce((a, b) => a + b, 0) / values.length) : 0;
}
