/**
 * ONE SET OF DATE FORMATS (consistency fix #26). Date keys are local
 * "YYYY-MM-DD"; they are read by slicing, never through a Date in UTC, so a
 * key is never shown a day early. Pure.
 *
 * - dayLong: "Tue 3 Sep" (a day in a sentence or a header)
 * - dayShort: "3 Sep", with the year when it is not this year ("3 Sep 2025")
 * - dayRange: "3 to 9 Sep", "28 Aug to 3 Sep"
 * - the numeric "11/09/2026" stays `formatDateKeyNumeric` (lib/calendar).
 */
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

function parts(key: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!m) return null
  return { y: Number(m[1]), m: Number(m[2]) - 1, d: Number(m[3]) }
}

/** "Tue 3 Sep". */
export function dayLong(key: string): string {
  const p = parts(key)
  if (!p) return key
  const dow = new Date(Date.UTC(p.y, p.m, p.d)).getUTCDay()
  return `${DOW[dow]} ${p.d} ${MON[p.m]}`
}

/** "3 Sep", or "3 Sep 2025" when the year is not `thisYear`. */
export function dayShort(key: string, thisYear?: number): string {
  const p = parts(key)
  if (!p) return key
  const year = thisYear ?? new Date().getFullYear()
  return p.y === year ? `${p.d} ${MON[p.m]}` : `${p.d} ${MON[p.m]} ${p.y}`
}

/** "3 to 9 Sep", "28 Aug to 3 Sep", "28 Dec 2025 to 3 Jan". */
export function dayRange(fromKey: string, toKey: string, thisYear?: number): string {
  const a = parts(fromKey)
  const b = parts(toKey)
  if (!a || !b) return `${fromKey} to ${toKey}`
  const year = thisYear ?? new Date().getFullYear()
  if (a.y === b.y && a.m === b.m) return `${a.d} to ${dayShort(toKey, year)}`
  return `${dayShort(fromKey, a.y === b.y ? a.y : year)} to ${dayShort(toKey, year)}`
}
