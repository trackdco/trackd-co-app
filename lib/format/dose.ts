/**
 * ONE WAY TO WRITE A DOSE (consistency fix #8): up to three decimals, trailing
 * zeros trimmed, one space before the unit. "250 mg", "1.125 mg", "0.5 mL".
 * The row, the Track bar and every sheet say it the same way. Pure.
 */
export function formatDoseAmount(amount: number): string {
  if (!Number.isFinite(amount)) return ""
  return String(Math.round(amount * 1000) / 1000)
}

export function formatDose(amount: number, unit?: string | null): string {
  const n = formatDoseAmount(amount)
  return unit ? `${n} ${unit}` : n
}
