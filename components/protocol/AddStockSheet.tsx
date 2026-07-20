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
import { SHEET_TITLE } from "@/lib/ui-presets"
import {
  addStockItem,
  updateStockItem,
  type StockInsert,
  type StockItem,
} from "@/lib/db/inventory"
import { pushProtocolCompound } from "@/lib/home/protocolSync"
import {
  getStackSnapshot,
  subscribeStack,
  type InjectionMethod,
  type StackCompound,
} from "@/lib/home/stack"
import { COMPOUNDS } from "@/lib/compounds-catalogue"
import { routesOf } from "@/lib/compound-categories"
import { todayKey } from "@/lib/protocol/cycle"
import { resolveFill, vialBasis, FILL_PRESETS, round3 } from "@/lib/protocol/vialFill"
import type { DoseUnit, InventoryType } from "@/lib/db/types"

const EMPTY: StackCompound[] = []
const FIELD =
  "h-11 w-full min-w-0 rounded-xl border border-border-default bg-bg-input px-3 text-base text-foreground shadow-xs outline-none transition-colors [color-scheme:dark] focus-visible:border-border-strong"
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

const ALL_FORMS: InventoryType[] = ["reconstituted", "preconcentrated", "oral_solid"]
const isForm = (t: string): t is InventoryType =>
  t === "reconstituted" || t === "preconcentrated" || t === "oral_solid"

/** The inventory form(s) a compound can actually be stocked as, from the bundled
 *  catalogue's per-route data (default first) — so the picker shows only the real
 *  options and disappears entirely when there's just one. Null for a custom compound
 *  (no catalogue entry); callers fall back to the route via `formsForMethod`. */
function catalogueForms(name: string): InventoryType[] | null {
  const c = COMPOUNDS.find((x) => x.name.toLowerCase() === name.toLowerCase())
  if (!c) return null
  const forms: InventoryType[] = []
  for (const rf of routesOf(c)) {
    if (isForm(rf.inventoryType) && !forms.includes(rf.inventoryType)) forms.push(rf.inventoryType)
  }
  return forms.length > 0 ? forms : null
}

/** Fallback for a custom compound (no catalogue routes): infer plausible form(s)
 *  from how it's taken. Oral → tabs/caps; injectable → powder or pre-mixed oil;
 *  nasal → reconstituted. */
function formsForMethod(method: InjectionMethod): InventoryType[] {
  if (method === "po") return ["oral_solid"]
  if (method === "im" || method === "subq") return ["reconstituted", "preconcentrated"]
  if (method === "nasal") return ["reconstituted"]
  return ALL_FORMS
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
  editItem,
  onAdded,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: string
  /** Pre-select a compound id (refill flow). */
  refillFor?: string | null
  /** The existing vial's type on refill — locks the form (no re-choosing). */
  refillType?: InventoryType | null
  /** When set, edit THIS vial's amounts in place (correct a mistake) rather than
   *  add a new one. The compound is locked; the row id is preserved. */
  editItem?: StockItem | null
  onAdded: () => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        // Don't auto-focus a field on open — otherwise the keypad pops up over the
        // form (esp. on refill/edit, where the compound select is disabled).
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="max-h-[92dvh] overflow-y-auto rounded-t-3xl border-border-default bg-bg-surface"
      >
        <SheetHeader>
          <SheetTitle className={SHEET_TITLE}>
            {editItem ? "Edit stock" : refillFor ? "Refill stock" : "Add stock"}
          </SheetTitle>
        </SheetHeader>
        {open && (
          <AddStockForm
            userId={userId}
            refillFor={refillFor ?? null}
            refillType={refillType ?? null}
            editItem={editItem ?? null}
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
  editItem,
  onClose,
  onAdded,
}: {
  userId: string
  refillFor: string | null
  refillType: InventoryType | null
  editItem: StockItem | null
  onClose: () => void
  onAdded: () => void
}) {
  const stack = useSyncExternalStore(
    subscribeStack,
    () => (userId && userId !== "anon" ? getStackSnapshot(userId, EMPTY) : EMPTY),
    () => EMPTY,
  )
  const compounds = stack.filter((c) => !c.archived)
  const formsForId = (id: string): InventoryType[] => {
    const c = compounds.find((x) => x.id === id)
    if (!c) return ALL_FORMS
    return catalogueForms(c.name) ?? formsForMethod(c.method)
  }

  // Editing a vial and refilling both pre-select (and lock) the compound; editing
  // additionally pre-fills the amount fields from the vial's stored raw inputs.
  const initialId = refillFor ?? editItem?.protocolCompoundId ?? compounds[0]?.id ?? ""
  const presetType = refillType ?? editItem?.inventoryType ?? null
  const compoundLocked = refillFor != null || editItem != null
  const ei = editItem
  const numStr = (v: number | null | undefined) => (v != null ? String(v) : "")

  const [compoundId, setCompoundId] = useState(initialId)
  // The form usually picks itself: a refill/edit keeps the vial's type; a fresh add
  // takes the compound's only sensible form. `picker` controls the Type section:
  //   hidden   — just a label (one obvious form, or a refill/edit keeping its form)
  //   compound — pills for ONLY the forms this compound supports (e.g. BPC: recon/oral)
  //   all      — the escape hatch: any of the three, for an off-catalogue/custom setup
  const lockedType = (refillFor != null && refillType != null) || editItem != null
  const initialForms = formsForId(initialId)
  const [picker, setPicker] = useState<"hidden" | "compound" | "all">(
    presetType != null || initialForms.length <= 1 ? "hidden" : "compound",
  )
  const [type, setType] = useState<InventoryType>(
    presetType ?? initialForms[0] ?? "reconstituted",
  )
  // reconstituted
  const [powder, setPowder] = useState(
    ei?.inventoryType === "reconstituted" ? numStr(ei.totalAmount) : "",
  )
  const [powderUnit, setPowderUnit] = useState<"mg" | "iu">(ei?.baseUnit === "iu" ? "iu" : "mg")
  const [bacWater, setBacWater] = useState(numStr(ei?.bacWaterMl))
  // preconcentrated
  const [oilMl, setOilMl] = useState(
    ei?.inventoryType === "preconcentrated" ? numStr(ei.totalAmount) : "",
  )
  const [concentration, setConcentration] = useState(numStr(ei?.concentrationMgPerMl))
  // oral_solid
  const [count, setCount] = useState(
    ei?.inventoryType === "oral_solid" ? numStr(ei.totalAmount) : "",
  )
  const [oralForm, setOralForm] = useState<"tab" | "capsule">(
    ei?.totalAmountUnit === "capsule" ? "capsule" : "tab",
  )
  const [strength, setStrength] = useState(numStr(ei?.strengthPerUnitMg))
  // "How much is in it?" — a Full/¾/½/¼ preset, or an exact amount-left in the
  // vial's own measure (mL of solution, or tab/cap count). An exact entry overrides
  // the preset. Both fold into prior_used_base on save; default Full = no change.
  const [fillPreset, setFillPreset] = useState(1)
  const [exactLeft, setExactLeft] = useState(() => {
    // Editing a part-used vial: pre-fill the amount that was left when it was added
    // (its starting fill — prior_used_base is the offset, independent of doses since).
    if (!ei || ei.priorUsedBase == null || ei.priorUsedBase <= 0) return ""
    const basis = vialBasis(ei.inventoryType, {
      powder: ei.inventoryType === "reconstituted" ? (ei.totalAmount ?? 0) : 0,
      bacWater: ei.bacWaterMl ?? 0,
      oilMl: ei.inventoryType === "preconcentrated" ? (ei.totalAmount ?? 0) : 0,
      concentration: ei.concentrationMgPerMl ?? 0,
      count: ei.inventoryType === "oral_solid" ? (ei.totalAmount ?? 0) : 0,
      strength: ei.strengthPerUnitMg ?? 0,
    })
    if (!basis || basis.perNative <= 0) return ""
    const left = (basis.totalBase - ei.priorUsedBase) / basis.perNative
    if (!(left > 0)) return ""
    return ei.inventoryType === "oral_solid" ? String(Math.round(left)) : String(round3(left))
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The "how much is in it?" estimate → the stored part-vial offset (base-unit amount
  // already gone). Full (or no inputs yet) → null, the existing full-vial behaviour.
  const fill = resolveFill(
    type,
    {
      powder: num(powder),
      bacWater: num(bacWater),
      oilMl: num(oilMl),
      concentration: num(concentration),
      count: num(count),
      strength: num(strength),
    },
    exactLeft,
    fillPreset,
  )

  function buildInsert(): StockInsert | null {
    if (!compoundId) return null
    const base = { id: crypto.randomUUID(), protocol_compound_id: compoundId }
    const prior_used_base = fill.priorUsed
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
        prior_used_base,
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
        prior_used_base,
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
      prior_used_base,
    }
  }

  const insert = buildInsert()
  const allowedForms = formsForId(compoundId)
  const formsToShow = picker === "all" ? ALL_FORMS : allowedForms

  // Live "how much is in it?" feedback: the picker only appears once the type's
  // amounts are entered (no capacity → nothing to be a fraction of).
  const fillUnit = type === "oral_solid" ? oralForm : "mL"

  async function save() {
    if (!insert) return
    setSaving(true)
    setError(null)
    try {
      // EDIT: correct this vial's amounts in place (same row id, so logged doses
      // stay linked). The compound + protocol_compound already exist, so there's no
      // foreign-key race to guard. Preserve the original reconstitution date on a
      // same-type edit rather than stamping today.
      if (editItem) {
        const { id: _id, protocol_compound_id: _pc, ...fields } = insert
        void _id
        void _pc
        if (fields.inventory_type === "reconstituted") {
          fields.reconstituted_on = editItem.reconstitutedOn ?? fields.reconstituted_on
        }
        const r = await updateStockItem(editItem.id, fields)
        if (!r.ok) {
          setError("Couldn’t save your changes. Please try again.")
          return
        }
        onAdded()
        onClose()
        return
      }

      // The stock row references this compound's protocol_compound. A just-tracked
      // compound's push to Postgres can still be in flight, and a custom ("make
      // your own") compound only gets its protocol_compound when first pushed —
      // either way the insert would fail its foreign key. Ensure it first
      // (catalogue AND custom alike now resolve to a row, supabase/protocol/004)
      // instead of failing silently (which left the compound absent from Stock).
      const compound = compounds.find((c) => c.id === compoundId)
      if (compound) {
        const pushed = await pushProtocolCompound(compound)
        if (!pushed.ok) {
          setError("Couldn’t sync this compound. Check your connection and try again.")
          return
        }
      }
      const r = await addStockItem(insert)
      if (!r.ok) {
        setError("Couldn’t save this stock. Please try again.")
        return // keep the sheet open so the input isn't lost on a failed save
      }
      onAdded()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const pill = (active: boolean) =>
    cn(
      "rounded-full border px-3 py-1.5 text-sm transition-colors",
      active
        ? "border-accent-primary bg-accent-primary text-bg-base"
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
                  const id = e.target.value
                  setCompoundId(id)
                  // Reset the form to this compound's real option(s): one → just show
                  // it; several → let them pick from only those.
                  const forms = formsForId(id)
                  setType(forms[0] ?? "reconstituted")
                  setPicker(forms.length > 1 ? "compound" : "hidden")
                }}
                disabled={compoundLocked}
                className={cn(FIELD, compoundLocked && "opacity-60")}
              >
                {compounds.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>

            {picker === "hidden" ? (
              // One obvious form (or a refill keeping its vial's form): no choice to
              // make — just name it, with a quiet way out if they track it differently.
              <div className="space-y-1.5">
                <span className={LABEL}>Type</span>
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 text-sm text-foreground">
                    {TYPES.find((t) => t.value === type)?.label}
                    <span className="text-text-subtle">
                      {" · "}
                      {lockedType
                        ? "same as your current vial"
                        : TYPES.find((t) => t.value === type)?.hint}
                    </span>
                  </p>
                  <button
                    type="button"
                    onClick={() => setPicker(lockedType && allowedForms.length > 1 ? "compound" : "all")}
                    className="shrink-0 text-xs font-medium text-text-muted transition-colors hover:text-foreground"
                  >
                    {lockedType ? "Change form" : "Track it a different way?"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <span className={LABEL}>Type</span>
                <div className="flex flex-wrap gap-2">
                  {formsToShow.map((v) => (
                    <button key={v} type="button" onClick={() => setType(v)} className={pill(type === v)}>
                      {TYPES.find((t) => t.value === v)?.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-start justify-between gap-2">
                  <span className="block text-xs text-text-subtle">
                    {picker === "all"
                      ? "Changing the form starts a fresh vial of the new type."
                      : TYPES.find((t) => t.value === type)?.hint}
                  </span>
                  {picker === "compound" && (
                    <button
                      type="button"
                      onClick={() => setPicker("all")}
                      className="shrink-0 text-xs text-text-subtle underline underline-offset-2 transition-colors hover:text-foreground"
                    >
                      Other form?
                    </button>
                  )}
                </div>
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

            {/* How much is in it? — start a part-used vial at the right level rather
                than assuming it's full. Full = no offset (existing behaviour). */}
            {fill.basis && (
              <div className="space-y-2 rounded-2xl bg-bg-surface-raised/40 p-3">
                <span className={LABEL}>How much is in it?</span>
                <div className="flex flex-wrap items-center gap-2">
                  {FILL_PRESETS.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => {
                        setFillPreset(p.f)
                        setExactLeft("")
                      }}
                      className={pill(!fill.exactActive && fillPreset === p.f)}
                    >
                      {p.label}
                    </button>
                  ))}
                  <span className="text-xs text-text-subtle">or</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      value={exactLeft}
                      onChange={(e) => setExactLeft(clean(e.target.value))}
                      inputMode="decimal"
                      placeholder={String(round3(fill.basis.fullNative))}
                      className={cn(FIELD, "h-10 w-20")}
                    />
                    <span className="whitespace-nowrap text-xs text-text-subtle">{fillUnit} left</span>
                  </div>
                </div>
                {fill.percent != null && (
                  <p className="text-xs text-text-muted">≈ {Math.round(fill.percent)}% full</p>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {error && (
        <p className="px-4 pt-1 text-center text-sm text-state-error">{error}</p>
      )}

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
          className="flex-1 rounded-xl bg-accent-primary px-4 py-2.5 text-sm font-medium text-bg-base transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Saving…" : editItem ? "Save changes" : "Add stock"}
        </button>
      </SheetFooter>
    </>
  )
}
