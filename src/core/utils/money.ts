export type RoundingMode = 'integer' | 'nearest_100' | 'nearest_500';

export function roundLak(amount: number, mode: RoundingMode = 'integer'): number {
  const safe = Number.isFinite(amount) ? Math.round(amount) : 0;
  if (mode === 'nearest_100') {
    return Math.round(safe / 100) * 100;
  }
  if (mode === 'nearest_500') {
    return Math.round(safe / 500) * 500;
  }
  return safe;
}

export function formatLak(amount: number, showSymbol = true): string {
  const safe = Number.isFinite(amount) ? Math.round(amount) : 0;
  const formatted = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
  }).format(safe);
  return showSymbol ? `${formatted} ₭` : formatted;
}
