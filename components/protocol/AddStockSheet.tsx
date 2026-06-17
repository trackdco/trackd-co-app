"use client"

import { useState, useSyncExternalStore } from "react"

import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import { addStockItem, type StockInsert } from "@/lib/db/inventory"
import { getStackSnapshot, subscribeStack, type StackCompound } from "@/lib/home/stack"
import { COMPOUNDS } from "@/lib/compounds-catalogue"
import { todayKey } from "@/lib/protocol/cycle"
import type { DoseUnit, InventoryType } from "@/lib/db/types"

const EMPTY: StackCompound[] = []
const FIELD =
  "h-11 w-full min-w-0 rounded-xl border border-border-default bg-bg-input px-3 text-base text-foreground shadow-xs outline-none transition-colors [color-scheme:dark] focus-visible:border-accent-amber"
const LABEL = "text-xs font-medium uppercase tracking-[0.14em] text-text-muted"

const TYPES: { value: InventoryType; label: string; hint: string }[] = [
  { value: "reconstituted", label: "Reconstituted", hint: "powder + BAC water" },
  { value: "preconcentrated", label: "Pre-mixed", hint: "oil at a stated mg/mL" },
  { value: "oral_solid", label: "Oral", hint: "tabs / caps" },
]

function num(s: string): number {
  const n = Number.parseFloat(s)
  return Number.isFinite(n) ? n : 0
}
function clean(s: string): string {
  let v = s.replace(/[^0-9.]/g, "")
  const dot = v.indexOf(".")
  if (dot !== -1) v = v.slice(0, dot + 1) + v.slice(dot + 1).replace(/\./g, "")
  return v
}

/** The likely inventory type for a compound, from the bundled catalogue (so we
 *  can pre-select / skip the picker when we already know the form). */
function catalogueType(name: string): InventoryType | null {
  const c = COMPOUNDS.find((x) => x.name.toLowerCase() === name.toLowerCase())
  const t = c?.defaultInventoryType
  return t === "reconstituted" || t === "preconcentrated" || t === "oral_solid" ? t : null
}

/**
 * Add stock for a compound (Protocol Cutover, Step 5). Branches by the 3-way
 * `inventory_type` union and stores ONLY raw inputs (all maths come from
 * `v_inventory_math`). Also used for refill via `refillFor` (pre-selects the
 * compound — refill is just a new row). For reconstituted, the powder is entered
 * in mg/iu (its mass IS the tracking base; the trigger needs the dose's unit
 * family — mg covers mg/mcg doses).
 */
export function AddStockSheet({
  open,
  onOpenChange,
  userId,
  refillFor,
  refillType,
  onAdded,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: string
  /** Pre-select a compound id (refill flow). */
  refillFor?: string | null
  /** The existing vial's type on refill — locks the form (no re-choosing). */
  refillType?: InventoryType | null
  onAdded: () => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[92dvh] overflow-y-auto rounded-t-3xl border-border-default bg-bg-surface"
      >
        <SheetHeader>
          <SheetTitle className="font-display text-xl text-foreground">
            {refillFor ? "Refill stock" : "Add stock"}
          </SheetTitle>
        </SheetHeader>
        {open && (
          <AddStockForm
            userId={userId}
            refillFor={refillFor ?? null}
            refillType={refillType ?? null}
            onClose={() => onOpenChange(false)}
            onAdded={onAdded}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}

function AddStockForm({
  userId,
  refillFor,
  refillType,
  onClose,
  onAdded,
}: {
  userId: string
  refillFor: string | null
  refillType: InventoryType | null
  onClose: () => void
  onAdded: () => void
}) {
  const stack = useSyncExternalStore(
    subscribeStack,
    () => (userId && userId !== "anon" ? getStackSnapshot(userId, EMPTY) : EMPTY),
    () => EMPTY,
  )
  const compounds = stack.filter((c) => !c.archived)
  const typeForId = (id: string): InventoryType | null => {
    const c = compounds.find((x) => x.id === id)
    return c ? catalogueType(c.name) : null
  }

  const [compoundId, setCompoundId] = useState(refillFor ?? compounds[0]?.id ?? "")
  // We usually already know the form: a refill keeps its existing vial's type; a
  // fresh add pre-selects from the catalogue. Picker is hidden on refill (locked).
  const lockedType = refillFor != null && refillType != null
  const [type, setType] = useState<InventoryType>(
    refillType ?? typeForId(refillFor ?? compounds[0]?.id ?? "") ?? "reconstituted",
  )
  // reconstituted
  const [powder, setPowder] = useState("")
  const [powderUnit, setPowderUnit] = useState<"mg" | "iu">("mg")
  const [bacWater, setBacWater] = useState("")
  // preconcentrated
  const [oilMl, setOilMl] = useState("")
  const [concentration, setConcentration] = useState("")
  // oral_solid
  const [count, setCount] = useState("")
  const [oralForm, setOralForm] = useState<"tab" | "capsule">("tab")
  const [strength, setStrength] = useState("")
  const [saving, setSaving] = useState(false)

  function buildInsert(): StockInsert | null {
    if (!compoundId) return null
    const base = { id: crypto.randomUUID(), protocol_compound_id: compoundId }
    if (type === "reconstituted") {
      if (num(powder) <= 0 || num(bacWater) <= 0) return null
      return {
        ...base,
        inventory_type: "reconstituted",
        base_unit: powderUnit,
        total_amount: num(powder),
        total_amount_unit: powderUnit,
        bac_water_ml: num(bacWater),
        reconstituted_on: todayKey(),
      }
    }
    if (type === "preconcentrated") {
      if (num(oilMl) <= 0 || num(concentration) <= 0) return null
      return {
        ...base,
        inventory_type: "preconcentrated",
        base_unit: "mg",
        total_amount: num(oilMl),
        total_amount_unit: "ml",
        concentration_mg_per_ml: num(concentration),
      }
    }
    if (num(count) <= 0 || num(strength) <= 0) return null
    return {
      ...base,
      inventory_type: "oral_solid",
      base_unit: "mg",
      total_amount: num(count),
      total_amount_unit: oralForm as DoseUnit,
      strength_per_unit_mg: num(strength),
    }
  }

  const insert = buildInsert()

  async function save() {
    if (!insert) return
    setSaving(true)
    try {
      const r = await addStockItem(insert)
      if (r.ok) onAdded()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const pill = (active: boolean) =>
    cn(
      "rounded-full border px-3 py-1.5 text-sm transition-colors",
      active
        ? "border-accent-amber/40 bg-accent-amber/15 text-accent-amber"
        : "border-border-default bg-bg-input text-text-muted hover:text-foreground",
    )

  return (
    <>
      <div className="space-y-4 px-4">
        {compounds.length === 0 ? (
          <p className="rounded-2xl bg-bg-surface-raised px-4 py-6 text-center text-sm text-text-muted">
            Add a compound to your cycle first, then add its stock.
          </p>
        ) : (
          <>
            <label className="block space-y-1.5">
              <span className={LABEL}>Compound</span>
              <select
                value={compoundId}
                onChange={(e) => {
                  setCompoundId(e.target.value)
                  // Pre-select the form we expect for this compound (changeable).
                  const t = typeForId(e.target.value)
                  if (t) setType(t)
                }}
                disabled={!!refillFor}
                className={cn(FIELD, refillFor && "opacity-60")}
              >
                {compounds.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>

            {lockedType ? (
              // Refill: same form as the existing vial — no need to re-choose.
              <p className="text-sm text-text-muted">
                {TYPES.find((t) => t.value === type)?.label}{" "}
                <span className="text-text-subtle">· same form as your current vial</span>
              </p>
            ) : (
              <div className="space-y-1.5">
                <span className={LABEL}>Type</span>
                <div className="flex flex-wrap gap-2">
                  {TYPES.map((t) => (
                    <button key={t.value} type="button" onClick={() => setType(t.value)} className={pill(type === t.value)}>
                      {t.label}
                    </button>
                  ))}
                </div>
                <span className="block text-xs text-text-subtle">
                  {TYPES.find((t) => t.value === type)?.hint}
                </span>
              </div>
            )}

            {type === "reconstituted" && (
              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1.5">
                  <span className={LABEL}>Powder</span>
                  <div className="flex gap-2">
                    <input value={powder} onChange={(e) => setPowder(clean(e.target.value))} inputMode="decimal" placeholder="e.g. 5" className={FIELD} />
                    <div className="flex gap-1">
                      <button type="button" onClick={() => setPowderUnit("mg")} className={pill(powderUnit === "mg")}>mg</button>
                      <button type="button" onClick={() => setPowderUnit("iu")} className={pill(powderUnit === "iu")}>iu</button>
                    </div>
                  </div>
                </label>
                <label className="block space-y-1.5">
                  <span className={LABEL}>BAC water (mL)</span>
                  <input value={bacWater} onChange={(e) => setBacWater(clean(e.target.value))} inputMode="decimal" placeholder="e.g. 2" className={FIELD} />
                </label>
              </div>
            )}

            {type === "preconcentrated" && (
              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1.5">
                  <span className={LABEL}>Volume (mL)</span>
                  <input value={oilMl} onChange={(e) => setOilMl(clean(e.target.value))} inputMode="decimal" placeholder="e.g. 10" className={FIELD} />
                </label>
                <label className="block space-y-1.5">
                  <span className={LABEL}>Strength (mg/mL)</span>
                  <input value={concentration} onChange={(e) => setConcentration(clean(e.target.value))} inputMode="decimal" placeholder="e.g. 250" className={FIELD} />
                </label>
              </div>
            )}

            {type === "oral_solid" && (
              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1.5">
                  <span className={LABEL}>Count</span>
                  <div className="flex gap-2">
                    <input value={count} onChange={(e) => setCount(clean(e.target.value))} inputMode="numeric" placeholder="e.g. 100" className={FIELD} />
                    <div className="flex gap-1">
                      <button type="button" onClick={() => setOralForm("tab")} className={pill(oralForm === "tab")}>tab</button>
                      <button type="button" onClick={() => setOralForm("capsule")} className={pill(oralForm === "capsule")}>cap</button>
                    </div>
                  </div>
                </label>
                <label className="block space-y-1.5">
                  <span className={LABEL}>Strength (mg each)</span>
                  <input value={strength} onChange={(e) => setStrength(clean(e.target.value))} inputMode="decimal" placeholder="e.g. 25" className={FIELD} />
                </label>
              </div>
            )}
          </>
        )}
      </div>

      <SheetFooter className="flex-row gap-2">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 rounded-xl border border-border-default bg-bg-surface px-4 py-2.5 text-sm font-medium text-text-primary hover:bg-bg-surface-raised"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || !insert}
          className="flex-1 rounded-xl bg-accent-primary px-4 py-2.5 text-sm font-semibold text-bg-base transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Add stock"}
        </button>
      </SheetFooter>
    </>
  )
}
