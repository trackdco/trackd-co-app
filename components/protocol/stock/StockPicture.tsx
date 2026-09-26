"use client"

import type { ReactNode } from "react"

import { StockContainer } from "@/components/protocol/stock/StockContainer"
import type { StockPicture as Picture } from "@/lib/protocol/compoundSheet"
import { ROW_META } from "@/lib/ui-presets"
import { cn } from "@/lib/utils"

/** When the held containers start to rise: after the sheet's own sections
 *  (140ms, 40ms apart), so they arrive last, one by one. */
const HELD_FROM_MS = 300
/** The stagger between them. */
const HELD_STEP_MS = 50

/**
 * A compound's stock, drawn (W17): the container in use at its level with its
 * figure, "+4 vials" at the end of that line (D13), and under it what else is
 * held, in small groups drawn as what they are (mixed at their levels, unmixed
 * dry with their powder, sealed full), each counted in words.
 *
 * The rows are the sheet's `inst-rows`, so the two lines share its dividers.
 * `trailing` sits at the end of the lead line (the ⋯), and `footer` under
 * everything (the Correct / Discard row it opens).
 *
 * The held containers rise in one by one as the sheet lands (transform and
 * opacity, `animate-shortcut-in`); with reduced motion they are simply there.
 */
export function StockPicture({
  picture,
  name,
  category,
  trailing,
  footer,
}: {
  picture: Picture
  name: string
  category: string
  trailing?: ReactNode
  footer?: ReactNode
}) {
  const { lead, groups, othersLabel } = picture
  /** Where each group starts in the one stagger across all of them. */
  const starts = groups.map((_, gi) => groups.slice(0, gi).reduce((n, g) => n + g.drawn.length, 0))
  return (
    <div className="inst-rows">
      <div className="flex items-center gap-3 px-3.5 py-2.5">
        <span aria-hidden className="flex h-[46px] w-[30px] shrink-0 items-end justify-center">
          <StockContainer
            animate
            name={name}
            category={category}
            inventoryType={lead.item.inventoryType}
            fill={lead.fill}
            powder={lead.powder}
            size={46}
          />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] text-foreground">{lead.title}</span>
          {lead.figure ? <span className={cn(ROW_META, "mt-0.5 block truncate")}>{lead.figure}</span> : null}
        </span>
        {othersLabel ? (
          <span className="shrink-0 font-mono text-[12px] text-text-muted">{othersLabel}</span>
        ) : null}
        {trailing}
      </div>

      {groups.length > 0 ? (
        <div className="flex flex-wrap items-end gap-x-5 gap-y-3 px-3.5 pt-3 pb-2.5">
          {groups.map((g, gi) => (
            <div key={g.kind} className="flex min-w-0 flex-col items-start gap-1.5">
              <span aria-hidden className="flex h-[30px] items-end gap-[3px]">
                {g.drawn.map((d, i) => (
                  <span
                    key={d.item.id}
                    className="animate-shortcut-in inline-flex"
                    style={{ animationDelay: `${HELD_FROM_MS + (starts[gi] + i) * HELD_STEP_MS}ms` }}
                  >
                    <StockContainer
                      name={name}
                      category={category}
                      inventoryType={d.item.inventoryType}
                      fill={d.fill}
                      powder={d.powder}
                      size={30}
                    />
                  </span>
                ))}
              </span>
              <span className={ROW_META}>{g.label}</span>
            </div>
          ))}
        </div>
      ) : null}

      {footer}
    </div>
  )
}
