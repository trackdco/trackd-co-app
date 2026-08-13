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
import {
  SHEET_TITLE,
  STOCK_FIELD,
  STOCK_FIELD_LABEL,
  STOCK_PILL,
  STOCK_PILL_OFF,
  STOCK_PILL_ON,
} from "@/lib/ui-presets"
import { Input } from "@/components/ui/input"
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
import { isInventoryForm } from "@/lib/containers/form"
import { containerNoun } from "@/lib/containers/labels"
import {
  oralStockRule,
  powderAmountInBase,
  powderEntryUnits,
  powderUnitsFor,
  resolvePowderUnit,
} from "@/lib/protocol/stockUnits"
import { routesOf } from "@/lib/compound-categories"
import { todayKey } from "@/lib/protocol/cycle"
import { resolveFill, vialBasis, FILL_PRESETS, round3, formatGrams } from "@/lib/protocol/vialFill"
import { StockAddedCard } from "@/components/protocol/StockAddedCard"
import type { DoseUnit, InventoryType } from "@/lib/db/types"

const EMPTY: StackCompound[] = []

/**
 * The four inventory forms, as the picker names them.
 *
 * **There is no `hint` field, deliberately.** Every entry used to carry a line of
 * subtext ("powder + BAC water", "oil at a stated mg/mL") and Spec w2b-13 removes
 * the concept, not just the strings: the sheet now OPENS on the compound's own
 * form, so the subtext was explaining a choice the user is no longer being asked
 * to make. Do not reinstate it.
 */
const TYPES: { value: InventoryType; label: string }[] = [
  { value: "reconstituted", label: "Reconstituted" },
  { value: "preconcentrated", label: "Pre-mixed" },
  { value: "oral_solid", label: "Oral" },
  { value: "bulk_powder", label: "Powder" },
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

const ALL_FORMS: InventoryType[] = [
  "reconstituted",
  "preconcentrated",
  "oral_solid",
  "bulk_powder",
]

/** The inventory form(s) a compound can actually be stocked as, from the bundled
 *  catalogue's per-route data (default first) — so the picker shows only the real
 *  options and disappears entirely when there's just one. Null for a custom compound
 *  (no catalogue entry); callers fall back to the route via `formsForMethod`. */
function catalogueForms(name: string): InventoryType[] | null {
  const c = COMPOUNDS.find((x) => x.name.toLowerCase() === name.toLowerCase())
  if (!c) return null
  const forms: InventoryType[] = []
  for (const rf of routesOf(c)) {
    if (isInventoryForm(rf.inventoryType) && !forms.includes(rf.inventoryType)) forms.push(rf.inventoryType)
  }
  return forms.length > 0 ? forms : null
}

/**
 * Fallback for a custom compound (no catalogue routes): infer plausible form(s)
 * from how it's taken. Injectable → powder or pre-mixed oil; nasal →
 * reconstituted.
 *
 * `po` returns BOTH oral forms, because a user's own protein powder has no
 * catalogue entry and "taken by mouth" genuinely does not distinguish a capsule
 * from a scoop. Offering only `oral_solid` here is what forced every custom
 * supplement to be described as tabs it is not made of.
 */
function formsForMethod(method: InjectionMethod): InventoryType[] {
  if (method === "po") return ["oral_solid", "bulk_powder"]
  if (method === "im" || method === "subq") return ["reconstituted", "preconcentrated"]
  if (method === "nasal") return ["reconstituted"]
  return ALL_FORMS
}

/** What {@link StockAddedCard} needs to draw the moment after a save. */
interface StockAdded {
  compoundName: string
  category?: string | null
  inventoryType?: string | null
  fill: number
  amountLabel: string | null
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
  preselectFor,
  refillType,
  editItem,
  onAdded,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: string
  /** Pre-select a compound id (refill flow). */
  refillFor?: string | null
  /**
   * Pre-select a compound WITHOUT implying a refill — you tapped Stock on that
   * compound, so it is the one being stocked.
   *
   * Separate from `refillFor` because that prop conflates two things: WHICH
   * compound, and whether this is a refill (which retitles the sheet and locks
   * the form to the existing vial's type). A compound with no vial yet is not a
   * refill, so `refillFor` was null for it — and the picker fell back to
   * `compounds[0]`, quietly offering to stock a different compound than the one
   * you tapped.
   */
  preselectFor?: string | null
  /** The existing vial's type on refill — locks the form (no re-choosing). */
  refillType?: InventoryType | null
  /** When set, edit THIS vial's amounts in place (correct a mistake) rather than
   *  add a new one. The compound is locked; the row id is preserved. */
  editItem?: StockItem | null
  onAdded: () => void
}) {
  /** Set once a NEW item saves, which swaps the form for its confirmation. Null
   *  on an edit or a refill-into-nothing: neither is a "you now have this". */
  const [added, setAdded] = useState<StockAdded | null>(null)
  return (
    <>
      <Sheet
        open={open && added === null}
        onOpenChange={(o) => {
          // Dismissing mid-confirmation must clear it, or the next open would
          // come straight back up on someone else's celebration.
          if (!o) setAdded(null)
          onOpenChange(o)
        }}
      >
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
          {open && added === null && (
            <AddStockForm
              userId={userId}
              refillFor={refillFor ?? null}
              preselectFor={preselectFor ?? null}
              refillType={refillType ?? null}
              editItem={editItem ?? null}
              onClose={() => onOpenChange(false)}
              onAdded={onAdded}
              onConfirmed={setAdded}
            />
          )}
        </SheetContent>
      </Sheet>

      {/* THE CONFIRMATION, centred rather than sliding up from the bottom
          (Adrian, 2026-08-07). A bottom sheet is the app's "here is more to do"
          gesture, and this is the opposite — it is done. Its own Sheet, not a
          swapped body, so the form leaves the screen the instant you save
          instead of the two states sharing one panel. */}
      <Sheet
        open={added !== null}
        onOpenChange={(o) => {
          if (!o) {
            setAdded(null)
            onOpenChange(false)
          }
        }}
      >
        <SheetContent
          side="center"
          showCloseButton={false}
          className="bg-bg-surface"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Stock added</SheetTitle>
          </SheetHeader>
          {added && (
            <StockAddedCard
              compoundName={added.compoundName}
              category={added.category}
              inventoryType={added.inventoryType}
              fill={added.fill}
              amountLabel={added.amountLabel}
              onDone={() => {
                setAdded(null)
                onOpenChange(false)
              }}
            />
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}

function AddStockForm({
  userId,
  refillFor,
  preselectFor,
  refillType,
  editItem,
  onClose,
  onAdded,
  onConfirmed,
}: {
  userId: string
  refillFor: string | null
  preselectFor: string | null
  refillType: InventoryType | null
  editItem: StockItem | null
  onClose: () => void
  onAdded: () => void
  /** Hand the confirmation up instead of closing. Only a NEW item gets one. */
  onConfirmed: (added: StockAdded) => void
}) {
  const stack = useSyncExternalStore(
    subscribeStack,
    () => (userId && userId !== "anon" ? getStackSnapshot(userId, EMPTY) : EMPTY),
    () => EMPTY,
  )
  const compounds = stack.filter((c) => !c.archived)
  /**
   * The forms this compound can be stocked as, **its own form first**.
   *
   * The order is the whole point (Spec w2b-13, Step 4). `TYPES` is ordered with
   * `reconstituted` first, so a picker seeded from `TYPES` order opened on
   * "powder + BAC water" for everything — and adding a tub of creatine began by
   * asking about bacteriostatic water. Seeding from the compound's stored
   * `inventoryForm` (`supabase/protocol/023`) puts the right answer under the
   * cursor, and the catalogue's own default supplies it for everything added
   * before that column existed.
   */
  const formsForId = (id: string): InventoryType[] => {
    const c = compounds.find((x) => x.id === id)
    if (!c) return ALL_FORMS
    const candidates = catalogueForms(c.name) ?? formsForMethod(c.method)
    const own = c.inventoryForm
    if (!own || !candidates.includes(own)) return candidates
    return [own, ...candidates.filter((f) => f !== own)]
  }

  // Editing a vial and refilling both pre-select (and lock) the compound; editing
  // additionally pre-fills the amount fields from the vial's stored raw inputs.
  // `editItem.protocolCompoundId` is a SERVER id and these options are keyed by
  // CLIENT id, so it is matched back through the compound list rather than used
  // directly. Without this an edit on a diverged compound selected the first
  // option and named the wrong compound on the form.
  const editClientId = editItem
    ? (compounds.find((c) => c.id === editItem.protocolCompoundId)?.id ??
       compounds.find((c) => c.name === editItem.compoundName)?.id ??
       null)
    : null
  // The compound you came FROM wins over the first in the list.
  const initialId =
    refillFor ?? preselectFor ?? editClientId ?? compounds[0]?.id ?? ""
  const presetType = refillType ?? editItem?.inventoryType ?? null
  // Locked when you arrived from a specific compound: you tapped Stock on it,
  // so switching to another one here is a mis-tap rather than an intention.
  const compoundLocked =
    refillFor != null || preselectFor != null || editItem != null
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
  // Starts on the STORED unit, so an edit shows the number that is on the row
  // rather than silently reinterpreting it.
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
  const [strength, setStrength] = useState(numStr(ei?.strengthPerUnit))
  // The unit on the LABEL, not always milligrams (`supabase/protocol/016`).
  // Vitamin D is sold in IU universally and could not be stored at all before.
  const [strengthUnit, setStrengthUnit] = useState<"mg" | "iu">(
    ei?.inventoryType === "oral_solid" && ei.baseUnit === "iu" ? "iu" : "mg",
  )
  // bulk_powder — the tub's weight in grams, and an optional serving size.
  const [tubGrams, setTubGrams] = useState(
    ei?.inventoryType === "bulk_powder" ? numStr(ei.totalAmount) : "",
  )
  const [servingG, setServingG] = useState(numStr(ei?.servingSizeG))
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
      strength: ei.strengthPerUnit ?? 0,
      tubGrams: ei.inventoryType === "bulk_powder" ? (ei.totalAmount ?? 0) : 0,
    })
    if (!basis || basis.perNative <= 0) return ""
    const left = (basis.totalBase - ei.priorUsedBase) / basis.perNative
    if (!(left > 0)) return ""
    // Tabs are whole things; grams and millilitres are not.
    return ei.inventoryType === "oral_solid" ? String(Math.round(left)) : String(round3(left))
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The "how much is in it?" estimate → the stored part-vial offset (base-unit amount
  // already gone). Full (or no inputs yet) → null, the existing full-vial behaviour.
  // The compound and everything derived from it — declared ABOVE the fill
  // maths, which now depends on `strengthRequired` to size an oral's capacity
  // correctly.
  const selected = compounds.find((c) => c.id === compoundId)
  /**
   * What to call the container the user ALREADY has — the one a refill or an
   * edit is locked to. Read from `presetType` rather than from `type`, because
   * the sentence is about the container on the shelf, not the form currently
   * selected in the picker.
   *
   * It said "vial" flat out, so editing a tub of creatine read "Powder · same as
   * your current vial" (Adrian, 2026-08-12).
   */
  const lockedNoun = containerNoun({
    inventoryType: presetType,
    // The row being refilled or edited knows whether it is counted out — without
    // it, editing a bottle of off-catalogue capsules read "Oral · same as your
    // current tub", the exact contradiction the override exists to kill.
    totalAmountUnit: ei?.totalAmountUnit,
    category: selected?.category,
    name: selected?.name,
  })

  /**
   * Units on offer for the powder — driven by the COMPOUND'S OWN dose unit,
   * which is the thing `unit_family_compatible` actually pairs `base_unit`
   * against. Reading the catalogue alone denied `iu` to a custom compound dosed
   * in `iu` (a user's own HGH), which is precisely the never-links-never-
   * depletes bug this is meant to prevent.
   *
   * `storedUnit` is passed only on an EDIT. A REFILL deliberately does not carry
   * the old vial's unit: it is a NEW container, and it should match what the
   * compound is dosed in rather than inherit a unit the previous row may have
   * had wrong.
   */
  const unitCtx = { doseUnit: selected?.unit, storedUnit: ei?.baseUnit }
  /** What the powder is TYPED in. Not always what it is stored in — see
   *  `powderEntryUnits`; HGH is dosed in iu and sold in mg. */
  const powderUnits = powderEntryUnits(selected?.name, unitCtx)
  /** What `base_unit` will actually be. Constrained by the unit family, so it is
   *  never the user's to pick. */
  const powderBaseUnit = resolvePowderUnit("mg", powderUnitsFor(selected?.name, unitCtx))
  /**
   * The unit actually written to `base_unit`.
   *
   * Resolved rather than trusted: switching the sheet from HCG to a peptide with
   * `iu` still selected would otherwise save the peptide's vial as `iu`, and
   * `unit_family_compatible` (016) pairs `iu` only with `iu` — so every dose
   * would log cleanly and the vial would never go down. See `stockUnits.ts`.
   */
  /** The entry unit, resolved against what is actually on offer. */
  const powderEntryUnit = resolvePowderUnit(powderUnit, powderUnits)
  /** The typed amount in the STORED unit — 10 mg of HGH becomes 30 iu. Used by
   *  the fill maths as well as the save, or `prior_used_base` lands 3× out. */
  const powderInBase = powderAmountInBase(num(powder), powderEntryUnit, powderBaseUnit)
  /**
   * The SAME narrowing for the oral strength's unit, which writes the same
   * `base_unit` column and is guarded by the same DB trigger.
   *
   * Fixing only the powder field left this one a free `mg | iu` toggle
   * defaulting to `mg` — so a bottle of **Vitamin D3** (dosed in iu, and its
   * dose unit is not even selectable) hit `unit_family_compatible('mg','iu')`
   * = false and could not be saved AT ALL. The sheet reported "Couldn't save
   * this stock. Please try again.", which would have failed identically
   * forever. Same for Vitamin A and Vitamin E. (Second cold review, 2026-08-12.)
   */
  const oralRule = oralStockRule(selected?.name, {
    doseUnit: selected?.unit,
    storedUnit: ei?.baseUnit,
  })
  const strengthUnits = oralRule.strengthUnits
  const strengthUnitToSave = resolvePowderUnit(strengthUnit, strengthUnits)
  const strengthRequired = oralRule.strengthRequired
  /** The tab/cap choice is the user's UNLESS the compound is dosed in one of
   *  them, in which case `total_amount_unit` must equal `base_unit`. */
  const effectiveOralForm = oralRule.countUnit ?? oralForm


  const fill = resolveFill(
    type,
    {
      // Converted: `vialBasis` sizes a vial by its powder mass in the STORED
      // unit, so a mg entry on an iu vial must be 3× before it gets here.
      powder: powderInBase,
      bacWater: num(bacWater),
      oilMl: num(oilMl),
      concentration: num(concentration),
      count: num(count),
      // ONLY when the row will actually store one. The field is hidden for a
      // compound dosed in tablets, but its state survives a compound change —
      // and `vialBasis` sizes an oral's capacity as `count × strength`, while
      // the strengthless row it is about to save is sized as `count`. A stale
      // figure here writes `prior_used_base` at strength× the right scale, and
      // the view then subtracts that from remaining forever.
      strength: strengthRequired ? num(strength) : 0,
      tubGrams: num(tubGrams),
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
        base_unit: powderBaseUnit,
        total_amount: powderInBase,
        total_amount_unit: powderBaseUnit,
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
    if (type === "bulk_powder") {
      // A tub is a weight and nothing else. `total_amount` is grams, `base_unit`
      // is `g`, and the serving size — if given — is a convenience the maths
      // never touches (`supabase/protocol/014`).
      if (num(tubGrams) <= 0) return null
      return {
        ...base,
        inventory_type: "bulk_powder",
        base_unit: "g",
        total_amount: num(tubGrams),
        total_amount_unit: "g",
        serving_size_g: num(servingG) > 0 ? num(servingG) : null,
        prior_used_base,
      }
    }
    if (num(count) <= 0) return null
    // No oral shape can satisfy this compound's dose unit (it is dosed in grams
    // — a tub, not a bottle). Refuse rather than write a row the trigger rejects.
    if (oralRule.baseUnit === null) return null
    // Oral with NO stated strength: the tablet IS the unit, so `base_unit` and
    // `total_amount_unit` are both the tab/cap itself (`supabase/protocol/016`).
    // A complete, valid item — a multivitamin — not a half-filled form.
    if (!oralRule.strengthRequired) {
      return {
        ...base,
        inventory_type: "oral_solid",
        base_unit: oralRule.baseUnit as DoseUnit,
        total_amount: num(count),
        total_amount_unit: oralRule.baseUnit as DoseUnit,
        strength_per_unit: null,
        prior_used_base,
      }
    }
    // Strength REQUIRED here, and it must be positive: `strength_positive`
    // rejects 0, and falling through with a blank field wrote exactly that —
    // a save that could never succeed, reported as a container type that "isn't
    // available yet" while the user was looking at it. Null keeps the button
    // disabled and lets the form say what is missing.
    if (num(strength) <= 0) return null
    return {
      ...base,
      inventory_type: "oral_solid",
      // The base is the unit the STRENGTH is in, which is what the dose will be
      // logged in — mg for vitamin C, iu for vitamin D.
      base_unit: strengthUnitToSave,
      total_amount: num(count),
      total_amount_unit: effectiveOralForm as DoseUnit,
      strength_per_unit: num(strength),
      prior_used_base,
    }
  }

  const insert = buildInsert()
  const allowedForms = formsForId(compoundId)
  const formsToShow = picker === "all" ? ALL_FORMS : allowedForms

  // Live "how much is in it?" feedback: the picker only appears once the type's
  // amounts are entered (no capacity → nothing to be a fraction of).
  const fillUnit =
    // `effectiveOralForm`, so a capsule-dosed compound does not read "tab left"
    // while its row is stored in capsules.
    type === "oral_solid" ? effectiveOralForm : type === "bulk_powder" ? "g" : "mL"

  /** What was added, worded the way the container would be read: "10 mL",
   *  "60 tablets", "300 g". Null when the form has nothing quantifiable, which
   *  cannot happen on a successful save but keeps the card honest. */
  function addedLabel(): string | null {
    if (type === "bulk_powder") {
      return num(tubGrams) > 0 ? formatGrams(num(tubGrams)) : null
    }
    if (type === "oral_solid") {
      const n = num(count)
      if (n <= 0) return null
      const word = effectiveOralForm === "tab" ? "tablet" : "capsule"
      return `${n} ${word}${n === 1 ? "" : "s"}`
    }
    const ml = type === "reconstituted" ? num(bacWater) : num(oilMl)
    return ml > 0 ? `${round3(ml)} mL` : null
  }

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
          setError(
            r.rejectedShape
              ? "These numbers don’t fit together. Check the amount, the strength and its unit."
              : "Couldn’t save your changes. Please try again."
          )
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
      let pcId: string | null = null
      if (compound) {
        const pushed = await pushProtocolCompound(compound)
        if (!pushed.ok) {
          /**
           * ⚠️ THE READ-ONLY GATE IS NOT A CONNECTION PROBLEM.
           *
           * A cold review reached this sheet through the `?stock=` deep link,
           * which was not guarded, and got "Check your connection and try
           * again." Nothing was wrong with their connection, trying again would
           * fail identically, and the message blamed them for it.
           *
           * The deep link is guarded now, so this is the backstop for any route
           * that is not. `readOnly` is set by the gate and by nothing else.
           */
          setError(
            pushed.readOnly
              ? "Trackd is read only until you subscribe."
              : "Couldn’t sync this compound. Check your connection and try again.",
          )
          return
        }
        pcId = pushed.protocolCompoundId ?? null
      }
      // The FK is the id the push actually WROTE, not the client id. The two
      // diverge whenever `pushProtocolCompound` reuses an existing row for this
      // (cycle, compound) — and then this insert pointed at a row that does not
      // exist, so the first vial a user ever added failed its foreign key and the
      // sheet said "Couldn't save this stock" with nothing wrong at their end.
      // The add-compound sheet already used the returned id; this path did not.
      const r = await addStockItem(
        pcId ? { ...insert, protocol_compound_id: pcId } : insert
      )
      if (!r.ok) {
        // A form the database cannot hold until `014`/`016` are applied gets its
        // own words. "Please try again" is a lie there — trying again will fail
        // identically, and the user has no way to know it is not their input.
        setError(
          // Same reasoning as the push above: the gate is not a failure and not
          // the user's fault, so it does not get a "please try again".
          r.readOnly
            ? "Trackd is read only until you subscribe."
            : r.pendingMigration
            ? "This container type isn’t available yet. Try Reconstituted, Pre-mixed or Oral for now."
            : r.rejectedShape
              ? // A constraint said no, so "try again" would be a lie — the same
                // input fails identically every time. The form now prevents every
                // shape we know of, so reaching here means one we don't; name the
                // fields it could be rather than promising a retry.
                "These numbers don’t fit together. Check the amount, the strength and its unit."
              : "Couldn’t save this stock. Please try again."
        )
        return // keep the sheet open so the input isn't lost on a failed save
      }
      onAdded()
      // THE MOMENT, in place of the sheet just vanishing. The card eases the
      // container from empty to what was entered and then leaves; the parent
      // owns the state so this form can unmount under it.
      onConfirmed({
        compoundName: compound?.name ?? "Stock",
        category: compound?.category ?? null,
        inventoryType: type,
        // `percent` is remaining-against-total for exactly these inputs, which
        // is the same ratio `v_inventory_math` will report once it lands. A
        // full vial is 1; one entered as half used settles at 0.5.
        fill: fill.percent != null ? fill.percent / 100 : 1,
        amountLabel: addedLabel(),
      })
    } finally {
      setSaving(false)
    }
  }

  // The SAME pill the add-compound stock panel uses. It was a few pixels
  // bigger here and coloured its border rather than dropping it — near enough
  // to look like a mistake rather than a variant (Adrian, 2026-08-07).
  const pill = (active: boolean) =>
    cn(STOCK_PILL, active ? STOCK_PILL_ON : STOCK_PILL_OFF)

  return (
    <>
      <div className="space-y-4 px-4">
        {compounds.length === 0 ? (
          <p className="rounded-2xl bg-bg-surface-raised px-4 py-6 text-center text-sm text-text-muted">
            Add a compound to your cycle first, then add its stock.
          </p>
        ) : (
          <>
            <label className="block">
              <span className={STOCK_FIELD_LABEL}>Compound</span>
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
                // NOT mono: `STOCK_FIELD` is mono because every field it was
                // written for holds a figure, and this one holds a compound
                // name. `border` and the text colour come back because the
                // preset expects the `Input` component's base underneath it,
                // and a <select> has none.
                className={cn(
                  STOCK_FIELD,
                  "w-full border px-3 font-sans text-base text-foreground outline-none [color-scheme:dark]",
                  compoundLocked && "opacity-60",
                )}
              >
                {compounds.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>

            {picker === "hidden" ? (
              // One obvious form (or a refill keeping its vial's form): no choice to
              // make — just name it, with a quiet way out if they track it differently.
              <div>
                <span className={STOCK_FIELD_LABEL}>Type</span>
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 text-sm text-foreground">
                    {TYPES.find((t) => t.value === type)?.label}
                    {lockedType && (
                      <span className="text-text-subtle">
                        {` · same as your current ${lockedNoun}`}
                      </span>
                    )}
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
              <div>
                <span className={STOCK_FIELD_LABEL}>Type</span>
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
                      ? "Changing the form starts a fresh container of the new type."
                      : ""}
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
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className={STOCK_FIELD_LABEL}>Powder</span>
                  <div className="flex items-center gap-2">
                    <Input value={powder} onChange={(e) => setPowder(clean(e.target.value))} inputMode="decimal" placeholder={powderUnits[0] === "iu" ? "e.g. 5000" : "e.g. 5"}  className={STOCK_FIELD} />
                    {/* One unit ⇒ state it, don't ask. A toggle with nothing to
                        toggle to is a question about a compound the user has
                        already named. */}
                    {powderUnits.length === 1 ? (
                      <span className="shrink-0 text-sm text-text-muted">{powderUnits[0]}</span>
                    ) : (
                      <div className="flex gap-1">
                        {powderUnits.map((u) => (
                          <button key={u} type="button" onClick={() => setPowderUnit(u)} className={pill(powderUnit === u)}>{u}</button>
                        ))}
                      </div>
                    )}
                  </div>
                  {/* The conversion, shown as it happens. HGH is dosed in iu
                      and sold in mg, so the box says one thing and the row
                      stores another — this is what keeps that from being
                      something the user has to take on trust. */}
                  {powderEntryUnit !== powderBaseUnit && num(powder) > 0 && (
                    <p className="mt-1 text-xs text-text-subtle">
                      = {round3(powderInBase)} {powderBaseUnit}, which is what gets stored.
                    </p>
                  )}
                </label>
                <label className="block">
                  <span className={STOCK_FIELD_LABEL}>BAC water (mL)</span>
                  <Input value={bacWater} onChange={(e) => setBacWater(clean(e.target.value))} inputMode="decimal" placeholder="e.g. 2"  className={STOCK_FIELD} />
                </label>
              </div>
            )}

            {type === "preconcentrated" && (
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className={STOCK_FIELD_LABEL}>Volume (mL)</span>
                  <Input value={oilMl} onChange={(e) => setOilMl(clean(e.target.value))} inputMode="decimal" placeholder="e.g. 10"  className={STOCK_FIELD} />
                </label>
                <label className="block">
                  <span className={STOCK_FIELD_LABEL}>Strength (mg/mL)</span>
                  <Input value={concentration} onChange={(e) => setConcentration(clean(e.target.value))} inputMode="decimal" placeholder="e.g. 250"  className={STOCK_FIELD} />
                </label>
              </div>
            )}

            {type === "oral_solid" && (
              <div className="space-y-3">
                {/* Count gets a FULL-WIDTH row. Sharing a half-width column with
                    the two pills squeezed the number field to a few characters
                    and it could not be read (Adrian, 2026-08-07). */}
                <label className="block">
                  <span className={STOCK_FIELD_LABEL}>How many in the bottle</span>
                  <Input value={count} onChange={(e) => setCount(clean(e.target.value))} inputMode="numeric" placeholder="e.g. 100"  className={STOCK_FIELD} />
                </label>
                <div>
                  <span className={STOCK_FIELD_LABEL}>Tablets or capsules</span>
                  {oralRule.countUnit ? (
                    // FORCED, not chosen. When the compound is dosed in tablets
                    // or capsules the tablet IS the unit, so `total_amount_unit`
                    // must equal `base_unit` — picking the other pill wrote a row
                    // the unit-family trigger rejects, and `tab` and `capsule`
                    // are deliberately not interchangeable (016 §3).
                    <p className="text-sm text-foreground">
                      {oralRule.countUnit === "tab" ? "Tablets" : "Capsules"}
                      <span className="text-text-subtle">
                        {` · how ${selected?.name ?? "this"} is dosed`}
                      </span>
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {/* The stored value stays `tab`/`capsule` — that is the
                          `dose_unit` enum and a database contract. Only the WORDS
                          change: "cap" beside a number is an abbreviation of
                          nothing. */}
                      <button type="button" onClick={() => setOralForm("tab")} className={pill(oralForm === "tab")}>Tablet</button>
                      <button type="button" onClick={() => setOralForm("capsule")} className={pill(oralForm === "capsule")}>Capsule</button>
                    </div>
                  )}
                </div>
                <div className={cn("grid grid-cols-1 gap-2", !strengthRequired && "hidden")}>
                  <label className="block">
                    {/* REQUIRED wherever it appears, and the unit is whatever the
                        label says — a 5000 iu vitamin D tablet could not be
                        stored at all before `supabase/protocol/016`. It is hidden
                        entirely for a compound dosed in tablets, where the
                        tablet is the unit and a strength may not be stored. */}
                    <span className={STOCK_FIELD_LABEL}>Strength each</span>
                    <div className="flex items-center gap-2">
                      <Input value={strength} onChange={(e) => setStrength(clean(e.target.value))} inputMode="decimal" placeholder={strengthRequired ? "e.g. 5000" : "optional"}  className={STOCK_FIELD} />
                      {strengthUnits.length === 1 ? (
                        <span className="shrink-0 text-sm text-text-muted">{strengthUnits[0]}</span>
                      ) : (
                        <div className="flex gap-1">
                          {strengthUnits.map((u) => (
                            <button key={u} type="button" onClick={() => setStrengthUnit(u)} className={pill(strengthUnit === u)}>{u}</button>
                          ))}
                        </div>
                      )}
                    </div>
                  </label>
                </div>
                {oralRule.baseUnit === null ? (
                  <p className="text-xs text-state-warning">
                    {/* Names the control that is actually on screen. With one
                        obvious form the picker is collapsed to a label and there
                        are no type pills "above" to change — the way out is the
                        escape-hatch link beside it. */}
                    {selected?.name ?? "This compound"} is dosed by weight, so it
                    is tracked as a Powder rather than as tablets. Use{" "}
                    {picker === "hidden" ? "“Track it a different way?”" : "the type above"}{" "}
                    to switch.
                  </p>
                ) : num(strength) <= 0 && num(count) > 0 && strengthRequired ? (
                  <p className="text-xs text-text-subtle">
                    {/* Not a preference. The strengthless shape stores the TABLET
                        as the base unit, and that pairs only with a compound
                        dosed in tablets — which is 2 of the catalogue's 125
                        orals. For the rest the row is rejected outright, and the
                        field said "optional". */}
                    {`${selected?.name ?? "This"} is dosed in ${selected?.unit ?? "mg"}, so state the strength of one ${effectiveOralForm === "tab" ? "tablet" : "capsule"}.`}
                  </p>
                ) : !strengthRequired && num(count) > 0 ? (
                  <p className="text-xs text-text-subtle">
                    {`Doses are counted in ${effectiveOralForm === "tab" ? "tablets" : "capsules"}.`}
                  </p>
                ) : null}
              </div>
            )}

            {/* The powder form is the reconstituted form with the second input
                removed: same LABEL + FIELD markup, same clean/num handling, one
                amount row instead of two, and no derived readout. */}
            {type === "bulk_powder" && (
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className={STOCK_FIELD_LABEL}>Tub weight (g)</span>
                  <Input value={tubGrams} onChange={(e) => setTubGrams(clean(e.target.value))} inputMode="decimal" placeholder="e.g. 1000"  className={STOCK_FIELD} />
                </label>
                <label className="block">
                  <span className={STOCK_FIELD_LABEL}>Serving (g)</span>
                  <Input value={servingG} onChange={(e) => setServingG(clean(e.target.value))} inputMode="decimal" placeholder="optional"  className={STOCK_FIELD} />
                </label>
              </div>
            )}

            {/* How much is in it? — start a part-used vial at the right level rather
                than assuming it's full. Full = no offset (existing behaviour). */}
            {fill.basis && (
              <div className="space-y-2 rounded-2xl bg-bg-surface-raised/40 p-3">
                <span className={STOCK_FIELD_LABEL}>How much is in it?</span>
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
                      className={cn(STOCK_FIELD, "h-10 w-20 border px-2 text-base text-foreground outline-none [color-scheme:dark]")}
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
