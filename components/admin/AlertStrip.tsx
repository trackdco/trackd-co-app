import { Warning } from "@/components/icons"
import type { Alert } from "@/lib/admin/alerts"
import type { AdminIssue } from "@/lib/db/admin"
import { CARD_EYEBROW } from "@/lib/ui-presets"

/**
 * What needs you, at the very top of the page.
 *
 * Alerts come BEFORE the numbers on Overview (Adrian's call): "is anything
 * wrong" is a faster question than "how are we doing", and a broken webhook
 * sitting below the fold is a broken webhook nobody sees.
 *
 * Each one prints three things — the fact, what it means, and the next step —
 * because the version this replaces coloured a number red, wrote "Check this",
 * and left you to work out both what was wrong and where to go.
 */

const TONE = {
  critical: { dot: "bg-admin-negative", text: "text-admin-negative", label: "Critical" },
  warning: { dot: "bg-accent-amber", text: "text-accent-amber", label: "Worth a look" },
  info: { dot: "bg-admin-series-2", text: "text-admin-series-2", label: "For information" },
} as const

export function AlertStrip({
  alerts,
  issues = [],
}: {
  alerts: Alert[]
  /**
   * The raw per-source failures.
   *
   * The "N sources failed to read" alert tells you to *check the detail under
   * each one* — and for one release there was no detail under any of them,
   * because the rebuild dropped the panel that printed it. The alert named an
   * action the page could not support, which defeats the entire point of
   * `IssueLog`: you learned that three sources failed but never which column
   * drifted. They are rendered here, under that alert, where the instruction
   * says to look.
   */
  issues?: AdminIssue[]
}) {
  if (alerts.length === 0) {
    return (
      <div className="glass-panel flex items-center gap-3 px-6 py-5">
        <span className="size-2 shrink-0 rounded-full bg-admin-positive" />
        <div>
          <p className="text-sm font-medium text-foreground">All clear</p>
          <p className="mt-0.5 text-xs text-text-muted">
            Nothing is stuck, nothing is waiting on you.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="glass-panel overflow-hidden">
      <div className="flex items-center gap-2.5 px-6 pt-5 pb-1">
        <Warning className="size-4 shrink-0 text-accent-amber" aria-hidden />
        <p className={CARD_EYEBROW}>
          {alerts.length} thing{alerts.length === 1 ? "" : "s"} need
          {alerts.length === 1 ? "s" : ""} you
        </p>
      </div>
      <div className="glass-divide mt-2">
        {alerts.map((a) => {
          const tone = TONE[a.severity]
          return (
            <div key={a.id} className="flex gap-3.5 px-6 py-4">
              <span className={`mt-1.5 size-2 shrink-0 rounded-full ${tone.dot}`} />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{a.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-text-muted">{a.what}</p>
                {/* The step, visually separated from the diagnosis — this is the
                    line that answers "how am I meant to check that". */}
                <p className={`mt-1.5 text-xs leading-relaxed ${tone.text}`}>{a.action}</p>
                {a.id === "failed-reads" && issues.length > 0 && (
                  <div className="mt-2.5 space-y-1 border-l border-[var(--admin-glass-line)] pl-3">
                    {issues.map((issue, i) => (
                      <p key={`${issue.label}-${i}`} className="font-mono text-[11px] leading-relaxed text-text-muted">
                        <span className="text-foreground">{issue.label}</span> · {issue.detail}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
