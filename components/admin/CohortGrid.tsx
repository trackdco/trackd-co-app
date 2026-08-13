import type { CohortGrid as Grid } from "@/lib/admin/cohorts"

/**
 * The retention triangle: signup week down, weeks-since-signup across.
 *
 * THE IMPORTANT DETAIL IS THE EMPTY CELL. A cohort older than the activity
 * read window has weeks nobody looked at, and shading those as 0% would say
 * "everyone churned" about a period that was never measured — the exact class
 * of confident-wrong number this dashboard keeps having to remove. An
 * unobserved cell is blank with a hairline; a real 0% is a filled cell reading
 * "0%". They must never look the same.
 */
export function CohortGrid({ grid }: { grid: Grid }) {
  if (grid.rows.length === 0) {
    return <p className="text-sm text-text-muted">Not enough signup history yet.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-1 text-xs">
        <thead>
          <tr>
            <th className="px-1 pb-1 text-left text-[10px] font-normal tracking-[0.12em] uppercase text-text-muted">
              Signed up
            </th>
            <th className="px-1 pb-1 text-right text-[10px] font-normal tracking-[0.12em] uppercase text-text-muted">
              Size
            </th>
            {grid.weeks.map((w) => (
              <th
                key={w}
                className="px-1 pb-1 text-center text-[10px] font-normal tabular-nums text-text-muted"
              >
                W{w}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.rows.map((row) => (
            <tr key={row.week}>
              <td className="whitespace-nowrap px-1 font-mono text-[11px] tabular-nums text-text-muted">
                {row.week}
              </td>
              <td className="px-1 text-right font-mono text-[11px] tabular-nums text-foreground">
                {row.size}
              </td>
              {grid.weeks.map((w) => {
                const cell = row.cells.find((c) => c.week === w)
                if (!cell || !cell.observed || cell.pct === null) {
                  return (
                    <td key={w} className="p-0">
                      {/* Not measured. Deliberately empty, and outlined rather
                          than filled so it can never read as a low percentage. */}
                      <div className="h-8 min-w-[38px] rounded-md border border-dashed border-[var(--admin-glass-line-soft)]" />
                    </td>
                  )
                }
                const pct = cell.pct
                return (
                  <td key={w} className="p-0">
                    <div
                      title={`${row.week}, week ${w}: ${cell.active} of ${row.size} active (${pct}%)`}
                      className="grid h-8 min-w-[38px] place-items-center rounded-md font-mono text-[11px] tabular-nums"
                      style={{
                        // Opacity carries the value; the figure is always printed
                        // as well, so colour is never the only signal.
                        backgroundColor: `color-mix(in oklab, var(--admin-series-2) ${Math.max(
                          6,
                          Math.round(pct * 0.8)
                        )}%, transparent)`,
                        color: pct >= 45 ? "var(--text-primary)" : "var(--text-muted)",
                      }}
                    >
                      {pct}%
                      {cell.partial && <span className="ml-0.5 text-text-subtle">*</span>}
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-[11px] leading-relaxed text-text-muted">
        Share of each signup week still active N weeks later. A dashed cell was never
        measured — activity history only reaches back {grid.observedDays} days — and is not
        the same as 0%. <span className="text-text-subtle">*</span> marks a week still running.
      </p>
    </div>
  )
}
