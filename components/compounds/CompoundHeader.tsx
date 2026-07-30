import { Container } from "@/components/containers"
import { inventoryTypeForCompound } from "@/lib/containers/form"
import {
  CATEGORY_META,
  FALLBACK_CATEGORY_META,
  type CompoundCategory,
} from "@/lib/compound-categories"
import { methodLabel, type InjectionMethod } from "@/lib/home/stack"

/**
 * The compound header — the container, the name, and one detail line.
 *
 * Built for the add form (spec 10) and REUSED verbatim by the log sheet (spec
 * 11 says to reuse it rather than rebuild it, which is also the only way the two
 * screens can be guaranteed to match). The container is what identifies a
 * compound at a glance; the name and the category / route / unit line say the
 * rest in one row.
 *
 * Server-safe: no state, no effects, no client hooks.
 */
export function CompoundHeader({
  name,
  category,
  method,
  unit,
  /** A quieter second line, when a screen has something more useful to say than
   *  the unit — the log sheet uses it for the scheduled time. */
  detail,
  size = 52,
}: {
  name: string
  category: string
  method: InjectionMethod
  unit: string
  detail?: string
  size?: number
}) {
  const meta = CATEGORY_META[category as CompoundCategory] ?? FALLBACK_CATEGORY_META
  return (
    <div className="flex items-center gap-4">
      <Container
        inventoryType={inventoryTypeForCompound(name, method)}
        category={category}
        fill={0.7}
        size={size}
        className="shrink-0"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-medium text-foreground">{name}</p>
        <p className="truncate text-sm text-text-muted">
          {meta.label} · {methodLabel(method)} ·{" "}
          <span className="font-mono">{unit}</span>
        </p>
        {detail && (
          <p className="truncate font-mono text-xs text-text-subtle">{detail}</p>
        )}
      </div>
    </div>
  )
}
