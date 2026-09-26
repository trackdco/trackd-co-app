"use client"

import { useRef, useState, useSyncExternalStore } from "react"

import { BottomSheet } from "@/components/layout/BottomSheet"
import { cn } from "@/lib/utils"
import {
  CHIP,
  CHIP_OFF,
  FIELD_LABEL,
  HIT_30,
  INLINE_NOTE,
  INNER_RADIUS,
  PRESS,
  PRIMARY_BUTTON,
  ROWS,
  SECONDARY_BUTTON,
  STOCK_FIELD,
} from "@/lib/ui-presets"
import { NumberPad, PadInput, type PadField } from "@/components/feel/NumberPad"
import { usePadSession } from "@/components/feel/usePadSession"
import { ThumbGroup } from "@/components/feel/SlidingThumb"
import {
  addStockItem,
  deleteStockItem,
  updateStockItem,
  type StockInsert,
  type StockItem,
} from "@/lib/db/inventory"
import { stockRowOf } from "@/lib/protocol/stockRestore"
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
import { resolveFill, vialBasis, FILL_PRESETS, round3 } from "@/lib/protocol/vialFill"
import {
  firstEmptyStockField,
  holdsUnmixed,
  showsBoxCount,
  spareMixFields,
  type StockFieldId,
} from "@/lib/protocol/stockRequired"
import { showToast } from "@/lib/toast"
import { StockContainer } from "@/components/protocol/stock/StockContainer"
import {
  noteSparesRefused,
  sparesRefusedThisVisit,
  useStockSchema,
} from "@/components/protocol/stock/sparesSupport"
import { dropperOffered, offerableForms } from "@/lib/protocol/stockSchema"
import { notifyStockChanged } from "@/lib/home/doseLog"
import type { DoseUnit, InventoryType } from "@/lib/db/types"

const EMPTY: StackCompound[] = []

/** A chip ON over the white sliding thumb (`PILL_THUMB`). Not `CHIP_ON`: that
 *  carries the white fill itself, and the thumb is the fill here. */
const PILL_ON = "border-transparent font-medium text-bg-base"
const PILL_THUMB = "inst-thumb"

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
  { value: "dropper", label: "Dropper" },
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
  "dropper",
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
  if (method === "po") return ["oral_solid", "bulk_powder", "dropper"]
  if (method === "im" || method === "subq") return ["reconstituted", "preconcentrated"]
  if (method === "nasal") return ["reconstituted"]
  return ALL_FORMS
}

/** A unit as a field shows it. IU in capitals, as the box reads (brief §3.12);
 *  the stored value stays `iu`. */
const shownUnit = (u: string) => (u === "iu" ? "IU" : u)

/** The unit inside a number field, muted. It is all an empty field shows: no
 *  placeholder words (brief §3.12). */
function FieldUnit({ unit }: { unit: string }) {
  return <span className="shrink-0 font-sans text-sm text-text-muted">{shownUnit(unit)}</span>
}

/** How long a refused field shakes. Matches `.field-shake` in `globals.css`. */
const SHAKE_MS = 320

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
  replaceItemId,
  sparesSupported,
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
  /** A refill: the container the new one replaces, put away once it is in. */
  replaceItemId?: string | null
  /**
   * Whether the database can hold a powder vial UNMIXED, and a dropper
   * (migrations `025`/`026`). `true`: the full flow, several vials held dry,
   * the dropper offered (the /preview pages, which cannot save anyway).
   * `false`: one vial at a time, mixed now, and no dropper. Omitted: the
   * visit's probe answers (`useStockSchema`, sweep); while it cannot say, the
   * full powder flow is offered until the database refuses it, the refusal is
   * remembered for the visit (W17), and the dropper stays hidden.
   */
  sparesSupported?: boolean | null
  onAdded: () => void
}) {
  // A save closes the sheet and says so in the bottom toast ("Added 2 to
  // BPC-157."). The centred "Stock added" card that used to follow an add is
  // gone (brief §3.12: one obvious action, few words).
  //
  // THE ONE SHEET FRAME (consistency fix #1). The form owns the frame, because
  // its pinned footer (Cancel + Add) reads the form's state. Each open starts a
  // fresh form with the props it opened on, held while the sheet slides away,
  // so the closing sheet does not flip to a different compound or title.
  const snapshot = { refillFor, preselectFor, refillType, editItem, replaceItemId }
  // What the database can hold, asked once per visit as the sheet mounts with
  // its page (sweep): a caller's answer wins (the previews pass `true`).
  const schema = useStockSchema()
  const [session, setSession] = useState(open ? 1 : 0)
  const [opened, setOpened] = useState(snapshot)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setSession((n) => n + 1)
      setOpened(snapshot)
    }
  }
  if (session === 0) return null
  return (
    <AddStockForm
      key={session}
      open={open}
      onOpenChange={onOpenChange}
      userId={userId}
      refillFor={opened.refillFor ?? null}
      preselectFor={opened.preselectFor ?? null}
      refillType={opened.refillType ?? null}
      editItem={opened.editItem ?? null}
      replaceItemId={opened.replaceItemId ?? null}
      sparesSupported={sparesSupported ?? schema}
      onAdded={onAdded}
    />
  )
}

function AddStockForm({
  open,
  onOpenChange,
  userId,
  refillFor,
  preselectFor,
  refillType,
  editItem,
  replaceItemId,
  sparesSupported,
  onAdded,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: string
  refillFor: string | null
  preselectFor: string | null
  refillType: InventoryType | null
  editItem: StockItem | null
  replaceItemId: string | null
  sparesSupported: boolean | null
  onAdded: () => void
}) {
  const onClose = () => onOpenChange(false)
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
  // The dropper only where the database holds it (`025`/`026`); a container
  // that already is one keeps it (sweep, ruling 10).
  const dropperOk = dropperOffered(sparesSupported)
  const keptForm = editItem?.inventoryType ?? refillType ?? null
  const allForms = offerableForms(ALL_FORMS, dropperOk, keptForm)
  const formsForId = (id: string): InventoryType[] => {
    const c = compounds.find((x) => x.id === id)
    if (!c) return allForms
    const candidates = offerableForms(catalogueForms(c.name) ?? formsForMethod(c.method), dropperOk, keptForm)
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
    ei?.inventoryType === "preconcentrated" || (ei?.inventoryType === "dropper" && ei.totalAmountUnit === "ml")
      ? numStr(ei.totalAmount)
      : "",
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
  // dropper (`supabase/protocol/025`): held in mL at a stated mg/mL (the
  // pre-mixed fields above), or counted by the drop with an optional strength
  // per drop.
  const [dropMode, setDropMode] = useState<"ml" | "drops">(
    ei?.inventoryType === "dropper" && ei.totalAmountUnit === "drop" ? "drops" : "ml",
  )
  const [drops, setDrops] = useState(
    ei?.inventoryType === "dropper" && ei.totalAmountUnit === "drop" ? numStr(ei.totalAmount) : "",
  )
  const [perDrop, setPerDrop] = useState(ei?.inventoryType === "dropper" ? numStr(ei.strengthPerUnit) : "")
  // A box of several (Adrian, 2026-09-24): the first is started and the rest
  // are spares, which count no doses until they are mixed or opened.
  const [boxCount, setBoxCount] = useState(1)
  // MIXING IS NOT PART OF ADD (brief §3.12). A powder vial asks only "Powder in
  // each" and is saved unmixed, every vial a spare; the water is asked when the
  // user taps "Mix one" (the Mix sheet).
  //
  // THE PRE-026 FALLBACK (W17). A database without `026` refuses an unmixed
  // vial (`isPendingSpare`). Once it has (in this sheet, or earlier in the
  // visit: `sparesSupport`), a powder vial is added the one way that database
  // holds: ONE vial, mixed now, with its BAC water. The count and the dry vial
  // are not offered there, since neither could save, and the pad does NOT
  // open by itself on the water: the field shows, with one line saying why.
  // Dead once `026` is applied.
  const [sparesRefusedHere, setSparesRefused] = useState(
    () => sparesSupported === false || (sparesSupported !== true && sparesRefusedThisVisit()),
  )
  // The visit's probe can answer while the sheet is open (sweep): a database
  // known not to hold spares never offers one.
  const sparesRefused = sparesRefusedHere || sparesSupported === false
  /** The database refused an unmixed vial while this sheet was open: say why
   *  the form changed. */
  const [refusedHere, setRefusedHere] = useState(false)
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
  /** The field a refused "Add" is shaking, if any. */
  const [shakeId, setShakeId] = useState<StockFieldId | null>(null)
  const shakeTimer = useRef<number | undefined>(undefined)
  const pad = usePadSession()

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


  /**
   * Held unmixed: a powder vial with no water, no mix date and no start
   * (`026`). A correction of a SPARE is always held unmixed, whatever it held
   * before, so Correct never gives a spare water without starting it (cold
   * review S5); the water comes from Mix, which starts the vial.
   */
  const unmixed = holdsUnmixed(type, editItem, sparesRefused)
  /** The count shows, or the box is one (W17). */
  const boxCountShown = showsBoxCount(type, editItem != null, sparesRefused)
  /** How many containers this add writes. */
  const boxTotal = boxCountShown ? boxCount : 1
  /** "Powder in each" beside a count; one container is just "Powder". */
  const powderLabel = boxCountShown ? "Powder in each" : "Powder"
  const fill = resolveFill(
    type,
    {
      // Converted: `vialBasis` sizes a vial by its powder mass in the STORED
      // unit, so a mg entry on an iu vial must be 3× before it gets here.
      powder: powderInBase,
      // An unmixed vial holds no solution yet, so it has no level to set.
      bacWater: unmixed ? 0 : num(bacWater),
      oilMl: type === "dropper" && dropMode === "drops" ? 0 : num(oilMl),
      concentration: num(concentration),
      count: type === "dropper" ? (dropMode === "drops" ? num(drops) : 0) : num(count),
      // ONLY when the row will actually store one. The field is hidden for a
      // compound dosed in tablets, but its state survives a compound change —
      // and `vialBasis` sizes an oral's capacity as `count × strength`, while
      // the strengthless row it is about to save is sized as `count`. A stale
      // figure here writes `prior_used_base` at strength× the right scale, and
      // the view then subtracts that from remaining forever.
      strength: type === "dropper" ? (dropMode === "drops" ? num(perDrop) : 0) : strengthRequired ? num(strength) : 0,
      tubGrams: num(tubGrams),
    },
    exactLeft,
    fillPreset,
  )

  function buildInsert(): StockInsert | null {
    if (!compoundId) return null
    const base = { id: crypto.randomUUID(), protocol_compound_id: compoundId }
    const prior_used_base = fill.priorUsed
    if (type === "reconstituted" && unmixed) {
      if (num(powder) <= 0) return null
      return {
        ...base,
        inventory_type: "reconstituted",
        base_unit: powderBaseUnit,
        total_amount: powderInBase,
        total_amount_unit: powderBaseUnit,
        // None for a new vial or a dry spare; a corrected spare keeps what it
        // has and never gains any (S5).
        ...spareMixFields(editItem),
        acquired_on: null,
        prior_used_base: null,
      }
    }
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
    if (type === "dropper") {
      // The three shapes `026` accepts, one arm each.
      if (dropMode === "ml") {
        if (num(oilMl) <= 0 || num(concentration) <= 0) return null
        return {
          ...base,
          inventory_type: "dropper",
          base_unit: "mg",
          total_amount: num(oilMl),
          total_amount_unit: "ml",
          concentration_mg_per_ml: num(concentration),
          prior_used_base,
        }
      }
      if (num(drops) <= 0) return null
      if (num(perDrop) > 0) {
        return {
          ...base,
          inventory_type: "dropper",
          base_unit: strengthUnitToSave,
          total_amount: num(drops),
          total_amount_unit: "drop" as DoseUnit,
          strength_per_unit: num(perDrop),
          prior_used_base,
        }
      }
      return {
        ...base,
        inventory_type: "dropper",
        base_unit: "drop" as DoseUnit,
        total_amount: num(drops),
        total_amount_unit: "drop" as DoseUnit,
        strength_per_unit: null,
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
  /** Adding to a named compound whose form is known: the sheet does not ask. */
  const typeImplied =
    compoundLocked &&
    !editItem &&
    picker !== "all" &&
    (refillType != null || selected?.inventoryForm != null || formsForId(compoundId).length <= 1)
  const allowedForms = formsForId(compoundId)
  // A spare corrected into a powder vial is held unmixed, which a database
  // that has refused spares cannot store: that choice is not offered there.
  const spareCannotBePowder = editItem != null && editItem.acquiredOn == null && sparesRefused
  const formsToShow = (picker === "all" ? allForms : allowedForms).filter(
    (f) => !(spareCannotBePowder && f === "reconstituted" && editItem?.inventoryType !== "reconstituted"),
  )

  // Live "how much is in it?" feedback: the picker only appears once the type's
  // amounts are entered (no capacity → nothing to be a fraction of).
  const fillUnit =
    // `effectiveOralForm`, so a capsule-dosed compound does not read "tab left"
    // while its row is stored in capsules.
    type === "oral_solid" ? effectiveOralForm : type === "bulk_powder" ? "g" : type === "dropper" && dropMode === "drops" ? "drops" : "mL"

  /** The first field "Add" cannot save without (brief §3.12). */
  const missing = firstEmptyStockField(
    { type, unmixed, strengthRequired, dropMode },
    { powder, bacWater, oilMl, concentration, count, strength, drops, tubGrams },
  )
  /** Nothing the user can type makes this savable: no compound yet, or an oral
   *  dosed by weight (the warning under the fields says what to do). */
  const cannotSave =
    compounds.length === 0 || !compoundId || (type === "oral_solid" && oralRule.baseUnit === null)

  /** A refused "Add": shake the empty field and open the pad on it. Cleared
   *  first, a frame apart, so a second refusal shakes it again. */
  function refuse(id: StockFieldId) {
    window.clearTimeout(shakeTimer.current)
    setShakeId(null)
    requestAnimationFrame(() => {
      setShakeId(id)
      shakeTimer.current = window.setTimeout(() => setShakeId(null), SHAKE_MS)
    })
    pad.open(id)
  }
  /** A number field's class, with the shake when "Add" refused it. */
  const fieldCls = (id: StockFieldId) => cn("h-11 w-full", shakeId === id && "field-shake")

  async function save() {
    if (missing) {
      refuse(missing)
      return
    }
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
        // The container as it was, for the toast's Undo (brief §3.16).
        const before = stockRowOf(editItem)
        const r = await updateStockItem(editItem.id, fields)
        if (!r.ok) {
          // A spare corrected INTO a powder vial is held unmixed, and a
          // database without `026` refuses that shape (S5): say so, rather
          // than blaming the numbers.
          const unmixedRefused = r.rejectedShape && unmixed && fields.bac_water_ml == null
          if (unmixedRefused) {
            noteSparesRefused()
            setSparesRefused(true)
          }
          setError(
            r.refusal === "read-only"
              ? "Trakabl is read only until you subscribe."
              : unmixedRefused
                ? "Unmixed vials can’t be saved yet."
                : r.rejectedShape
                  ? "These numbers don’t fit together. Check the amount, the strength and its unit."
                  : "Couldn’t save your changes. Try again."
          )
          return
        }
        onAdded()
        // Every screen holding stock figures re-reads them, not just the
        // one that opened this sheet (the + opens it over any page).
        notifyStockChanged()
        onClose()
        const editedId = editItem.id
        showToast(
          "Saved",
          before
            ? {
                undo: () =>
                  void updateStockItem(editedId, before).then((back) => {
                    if (!back.ok) showToast("Couldn’t undo. Try again.")
                    onAdded()
                    notifyStockChanged()
                  }),
              }
            : {},
        )
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
           * that is not. `refusal` is set by the gate and by nothing else.
           *
           * ⚠️ AND IT IS NOW THREE STATES, NOT TWO (Q85). `"unknown"` means the
           * entitlement read FAILED, so we do not actually know they have lapsed
           * — claiming "read only" there would be asserting something the server
           * could not check. It takes the retry wording instead, which is the one
           * branch where trying again is genuinely worth doing.
           */
          setError(
            pushed.refusal === "read-only"
              ? "Trakabl is read only until you subscribe."
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
        pcId ? { ...insert, protocol_compound_id: pcId } : insert,
        {
          count: boxTotal,
          restAsSpares: true,
          ...(refillFor != null && replaceItemId ? { replace: { id: replaceItemId } } : {}),
        },
      )
      if (!r.ok) {
        // THE PRE-026 FALLBACK (see `sparesRefused`): the database refused a
        // vial held unmixed. From here the form offers the one shape it holds,
        // one vial mixed now, remembered for the visit. The water field shows
        // with one line saying why; the pad stays shut until it is tapped (W17).
        if (r.pendingMigration && unmixed) {
          noteSparesRefused()
          setSparesRefused(true)
          setRefusedHere(true)
          return
        }
        // A form the database cannot hold until `014`/`016` are applied gets its
        // own words. "Please try again" is a lie there: trying again will fail
        // identically, and the user has no way to know it is not their input.
        setError(
          // Same reasoning as the push above: the gate is not a failure and not
          // the user's fault, so it does not get a "please try again".
          r.refusal === "read-only"
            ? "Trakabl is read only until you subscribe."
            : r.pendingMigration
            ? // Spares of a powder, an unmixed vial and the dropper wait on an
              // update to the database (`025`/`026`); say what to do meanwhile
              // rather than suggesting the type already chosen.
              type === "dropper"
              ? "Droppers aren’t available yet. Add it as Pre-mixed or Oral for now."
              : type === "reconstituted" && boxTotal > 1
                ? "Spare vials aren’t available yet. Add one for now."
                : "This container type isn’t available yet. Try Reconstituted, Pre-mixed or Oral for now."
            : r.rejectedShape
              ? // A constraint said no, so "try again" would be a lie — the same
                // input fails identically every time. The form now prevents every
                // shape we know of, so reaching here means one we don't; name the
                // fields it could be rather than promising a retry.
                "These numbers don’t fit together. Check the amount, the strength and its unit."
              : "Couldn’t save this stock. Try again."
        )
        return // keep the sheet open so the input isn't lost on a failed save
      }
      onAdded()
      notifyStockChanged()
      onClose()
      // Undo takes the container back out, when it is ONE container and
      // nothing was put away for it: only the first row's id is known here (a
      // box's others get theirs in `addStockItem`), and a replaced vial would
      // stay archived. It was added a moment ago, so no dose is drawn from it.
      const addedId = insert.id
      const undoable = boxTotal === 1 && !(refillFor != null && replaceItemId)
      showToast(
        compound ? `Added ${boxTotal} to ${compound.name}.` : "Added",
        undoable
          ? {
              undo: () =>
                void deleteStockItem(addedId).then((back) => {
                  if (!back.ok) showToast("Couldn’t undo. Try again.")
                  onAdded()
                  notifyStockChanged()
                }),
            }
          : {},
      )
    } finally {
      setSaving(false)
    }
  }

  // The SAME pill the add-compound stock panel uses. It was a few pixels
  // bigger here and coloured its border rather than dropping it — near enough
  // to look like a mistake rather than a variant (Adrian, 2026-08-07).
  //
  // Every pill group here sits on a WHITE sliding thumb (feel pass §6), so no
  // pill carries a fill: the thumb is the selection, and a fill on the others
  // would hide it as it passes beneath them.
  const pill = (active: boolean) =>
    cn(CHIP, "duration-300", active ? PILL_ON : CHIP_OFF)

  /** The units each field shows, as it reads on the box. */
  const powderShown = shownUnit(powderUnits.length === 1 ? powderUnits[0] : powderUnit)
  const strengthShown = shownUnit(strengthUnits.length === 1 ? strengthUnits[0] : strengthUnit)
  const countShown = effectiveOralForm === "tab" ? "tabs" : "caps"
  /** The water is asked only of a vial being mixed: an edit of a mixed vial, or
   *  a new one on a database that cannot hold it unmixed (the pre-026 path). */
  const showWater = type === "reconstituted" && !unmixed
  /** "How full is it" is for correcting a vial you have; a new one is full. */
  const showFill = editItem != null && fill.basis != null

  /**
   * THE PAD (feel pass §3): every amount on this form on one Trakabl pad, in
   * the order the fields appear for the chosen type.
   */
  const padFields: PadField[] = []
  if (type === "reconstituted") {
    padFields.push({ id: "powder", label: powderLabel, short: "Powder", unit: powderShown, value: powder, onChange: setPowder, sanitize: clean })
    if (showWater) {
      padFields.push({ id: "bacWater", label: "BAC water", short: "Water", unit: "mL", value: bacWater, onChange: setBacWater, sanitize: clean })
    }
  } else if (type === "preconcentrated") {
    padFields.push(
      { id: "oilMl", label: "Volume", short: "Volume", unit: "mL", value: oilMl, onChange: setOilMl, sanitize: clean },
      { id: "concentration", label: "Strength", short: "Strength", unit: "mg/mL", value: concentration, onChange: setConcentration, sanitize: clean },
    )
  } else if (type === "oral_solid") {
    padFields.push({ id: "count", label: "In each", short: "In each", unit: countShown, value: count, onChange: setCount, decimal: false, sanitize: clean })
    if (strengthRequired) {
      padFields.push({ id: "strength", label: "Strength", short: "Strength", unit: strengthShown, value: strength, onChange: setStrength, sanitize: clean })
    }
  } else if (type === "dropper") {
    if (dropMode === "ml") {
      padFields.push(
        { id: "oilMl", label: "Volume", short: "Volume", unit: "mL", value: oilMl, onChange: setOilMl, sanitize: clean },
        { id: "concentration", label: "Strength", short: "Strength", unit: "mg/mL", value: concentration, onChange: setConcentration, sanitize: clean },
      )
    } else {
      padFields.push(
        { id: "drops", label: "Drops", short: "Drops", unit: "drops", value: drops, onChange: setDrops, decimal: false, sanitize: clean },
        { id: "perDrop", label: "Per drop", short: "Per drop", unit: strengthShown, value: perDrop, onChange: setPerDrop, sanitize: clean },
      )
    }
  } else if (type === "bulk_powder") {
    padFields.push(
      { id: "tubGrams", label: "Tub weight", short: "Tub", unit: "g", value: tubGrams, onChange: setTubGrams, sanitize: clean },
      { id: "servingG", label: "Serving", short: "Serving", unit: "g", value: servingG, onChange: setServingG, sanitize: clean },
    )
  }
  if (showFill) {
    padFields.push({ id: "exactLeft", label: `Amount left (${fillUnit})`, short: "Left", unit: fillUnit, value: exactLeft, onChange: setExactLeft, sanitize: clean })
  }

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      // "Edit" is the one verb for correcting a container (consistency fix #4).
      title={editItem ? "Edit stock" : "Add stock"}
      footer={
        <>
          <button type="button" onClick={onClose} className={cn(SECONDARY_BUTTON, "flex-1")}>
            Cancel
          </button>
          {/* Never disabled for an empty field: a tap on it shakes that field
              and opens the pad there (brief §3.12). */}
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || cannotSave}
            className={cn(PRIMARY_BUTTON, "flex-1")}
          >
            {saving ? "Saving…" : editItem ? "Save" : "Add"}
          </button>
        </>
      }
    >
      {/* The fields rise in as the sheet lands (feel pass §4). */}
      <div data-sheet-body className="space-y-4">
        {compounds.length === 0 ? (
          <p className="inst-rows px-4 py-6 text-center text-sm text-text-muted">
            Add a compound to your protocol first, then add its stock.
          </p>
        ) : (
          <>
            {compoundLocked && selected ? (
              // Every add is for ONE compound (Adrian, 2026-09-24): name it, with
              // its container, rather than a picker locked to one option.
              <div className="flex items-center gap-2.5 text-[15px] text-foreground">
                {/* An unmixed vial is drawn with its powder in it. */}
                <StockContainer
                  name={selected.name}
                  inventoryType={type}
                  category={selected.category}
                  fill={unmixed ? 0 : 0.95}
                  powder={unmixed}
                  size={34}
                />
                <span className="min-w-0 truncate">{selected.name}</span>
              </div>
            ) : (
            <label className="block">
              <span className={FIELD_LABEL}>Compound</span>
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
            )}

            {typeImplied ? null : picker === "hidden" ? (
              // One obvious form (or a refill keeping its vial's form): no choice to
              // make — just name it, with a quiet way out if they track it differently.
              <div>
                <span className={FIELD_LABEL}>Type</span>
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 text-sm text-foreground">
                    {TYPES.find((t) => t.value === type)?.label}
                    {lockedType && (
                      <span className="text-text-muted">
                        {` · same as your current ${lockedNoun}`}
                      </span>
                    )}
                  </p>
                  <button
                    type="button"
                    onClick={() => setPicker(lockedType && allowedForms.length > 1 ? "compound" : "all")}
                    className={cn(PRESS.text, "-my-2 min-h-11 shrink-0 text-xs font-medium text-text-muted transition-colors hover:text-foreground")}
                  >
                    {/* One name for it (consistency fix #12). */}
                    Change form
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <span className={FIELD_LABEL}>Type</span>
                {/* The stock type on a WHITE sliding thumb with dark text
                    (feel pass §6): the thumb is the selection. */}
                <ThumbGroup
                  selection={type}
                  thumbClassName={PILL_THUMB}
                  role="group"
                  aria-label="Stock type"
                  className="flex flex-wrap gap-2"
                >
                  {formsToShow.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setType(v)}
                      aria-pressed={type === v}
                      className={pill(type === v)}
                    >
                      {TYPES.find((t) => t.value === v)?.label}
                    </button>
                  ))}
                </ThumbGroup>
                <div className="flex items-start justify-between gap-2">
                  {/* A note in a sheet: the muted line, no box (fix #27). */}
                  <span className={INLINE_NOTE}>
                    {picker === "all"
                      ? "Changing the form starts a fresh container of the new type."
                      : ""}
                  </span>
                  {picker === "compound" && (
                    <button
                      type="button"
                      onClick={() => setPicker("all")}
                      className={cn(PRESS.text, "shrink-0 text-xs text-text-muted underline underline-offset-2 transition-colors hover:text-foreground")}
                    >
                      Other form?
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* The count first, then only what the container needs (brief
                §3.12). An edit corrects one container, so it has no count, and
                a powder vial on a database that cannot hold spares has none
                either (W17). */}
            {boxCountShown && (
              <div className={cn(ROWS, "px-3")}>
                <div className="flex items-center justify-between gap-2.5 py-2">
                  <span className="text-sm text-foreground">
                    {`${containerNoun({
                      inventoryType: type,
                      // A counted oral is a bottle, even for a supplement the
                      // catalogue would scoop from a tub.
                      totalAmountUnit: type === "oral_solid" ? effectiveOralForm : null,
                      category: selected?.category,
                      name: selected?.name,
                    }).replace(/^./, (ch) => ch.toUpperCase())}s`}
                  </span>
                  <span className="flex items-center gap-2.5">
                    <button
                      type="button"
                      aria-label="One fewer"
                      onClick={() => setBoxCount((n) => Math.max(1, n - 1))}
                      className={cn(PRESS.icon, HIT_30, "inst-ghost flex h-[30px] w-[30px] items-center justify-center text-base text-foreground")}
                    >
                      −
                    </button>
                    <b className="min-w-[38px] text-center font-mono text-[17px] font-light text-foreground">{boxCount}</b>
                    <button
                      type="button"
                      aria-label="One more"
                      onClick={() => setBoxCount((n) => Math.min(50, n + 1))}
                      className={cn(PRESS.icon, HIT_30, "inst-ghost flex h-[30px] w-[30px] items-center justify-center text-base text-foreground")}
                    >
                      +
                    </button>
                  </span>
                </div>
              </div>
            )}

            {type === "reconstituted" && (
              <div className={cn("grid gap-2", showWater && "grid-cols-2")}>
                <label className="block">
                  <span className={FIELD_LABEL}>{powderLabel}</span>
                  <div className="flex items-center gap-2">
                    <PadInput {...pad.bind("powder")} value={powder} label={powderLabel} unit={powderShown} suffix={<FieldUnit unit={powderShown} />} className={fieldCls("powder")} />
                    {/* One unit: the field states it. Two (HGH, sold in mg and
                        dosed in iu): the choice sits beside the field. */}
                    {powderUnits.length > 1 && (
                      <ThumbGroup selection={powderUnit} thumbClassName={PILL_THUMB} role="group" aria-label="Powder unit" className="flex gap-1">
                        {powderUnits.map((u) => (
                          <button key={u} type="button" onClick={() => setPowderUnit(u)} aria-pressed={powderUnit === u} className={pill(powderUnit === u)}>{shownUnit(u)}</button>
                        ))}
                      </ThumbGroup>
                    )}
                  </div>
                  {/* The conversion, shown as it happens. HGH is dosed in iu
                      and sold in mg, so the box says one thing and the row
                      stores another — this is what keeps that from being
                      something the user has to take on trust. */}
                  {powderEntryUnit !== powderBaseUnit && num(powder) > 0 && (
                    <p className="mt-1 text-xs text-text-muted">
                      = {round3(powderInBase)} {shownUnit(powderBaseUnit)}, which is what gets stored.
                    </p>
                  )}
                </label>
                {showWater && (
                  <label className="block">
                    <span className={FIELD_LABEL}>BAC water</span>
                    <PadInput {...pad.bind("bacWater")} value={bacWater} label="BAC water" unit="mL" suffix={<FieldUnit unit="mL" />} className={fieldCls("bacWater")} />
                  </label>
                )}
                {refusedHere && showWater && !editItem && (
                  <p className={cn(INLINE_NOTE, "col-span-2")}>
                    Unmixed vials can’t be saved yet. Add one mixed: enter its water.
                  </p>
                )}
              </div>
            )}

            {type === "preconcentrated" && (
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className={FIELD_LABEL}>Volume</span>
                  <PadInput {...pad.bind("oilMl")} value={oilMl} label="Volume" unit="mL" suffix={<FieldUnit unit="mL" />} className={fieldCls("oilMl")} />
                </label>
                <label className="block">
                  <span className={FIELD_LABEL}>Strength</span>
                  <PadInput {...pad.bind("concentration")} value={concentration} label="Strength" unit="mg/mL" suffix={<FieldUnit unit="mg/mL" />} className={fieldCls("concentration")} />
                </label>
              </div>
            )}

            {type === "dropper" && (
              <div className="space-y-3">
                <ThumbGroup selection={dropMode} thumbClassName={PILL_THUMB} role="group" aria-label="Measured in" className="flex gap-2">
                  <button type="button" onClick={() => setDropMode("ml")} aria-pressed={dropMode === "ml"} className={pill(dropMode === "ml")}>mL</button>
                  <button type="button" onClick={() => setDropMode("drops")} aria-pressed={dropMode === "drops"} className={pill(dropMode === "drops")}>Drops</button>
                </ThumbGroup>
                {/* The dropper keeps its own words (the brief has none for it);
                    only the units move into the fields. */}
                {dropMode === "ml" ? (
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className={FIELD_LABEL}>Volume</span>
                      <PadInput {...pad.bind("oilMl")} value={oilMl} label="Volume" unit="mL" suffix={<FieldUnit unit="mL" />} className={fieldCls("oilMl")} />
                    </label>
                    <label className="block">
                      <span className={FIELD_LABEL}>Strength</span>
                      <PadInput {...pad.bind("concentration")} value={concentration} label="Strength" unit="mg/mL" suffix={<FieldUnit unit="mg/mL" />} className={fieldCls("concentration")} />
                    </label>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className={FIELD_LABEL}>Drops</span>
                      <PadInput {...pad.bind("drops")} value={drops} label="Drops" unit="drops" suffix={<FieldUnit unit="drops" />} className={fieldCls("drops")} />
                    </label>
                    <label className="block">
                      <span className={FIELD_LABEL}>Per drop</span>
                      {/* Truly optional (plain drops need no strength), so it
                          may say so. */}
                      <PadInput {...pad.bind("perDrop")} value={perDrop} label="Per drop" unit={strengthShown} placeholder="optional" suffix={<FieldUnit unit={strengthShown} />} className="h-11 w-full" />
                    </label>
                  </div>
                )}
              </div>
            )}

            {type === "oral_solid" && (
              <div className="space-y-3">
                {/* Count gets a FULL-WIDTH row. Sharing a half-width column with
                    the two pills squeezed the number field to a few characters
                    and it could not be read (Adrian, 2026-08-07). */}
                <label className="block">
                  <span className={FIELD_LABEL}>In each</span>
                  <PadInput {...pad.bind("count")} value={count} label="In each" unit={countShown} suffix={<FieldUnit unit={countShown} />} className={fieldCls("count")} />
                </label>
                <div>
                  <span className={FIELD_LABEL}>Tablets or capsules</span>
                  {oralRule.countUnit ? (
                    // FORCED, not chosen. When the compound is dosed in tablets
                    // or capsules the tablet IS the unit, so `total_amount_unit`
                    // must equal `base_unit` — picking the other pill wrote a row
                    // the unit-family trigger rejects, and `tab` and `capsule`
                    // are deliberately not interchangeable (016 §3).
                    <p className="text-sm text-foreground">
                      {oralRule.countUnit === "tab" ? "Tablets" : "Capsules"}
                      <span className="text-text-muted">
                        {` · how ${selected?.name ?? "this"} is dosed`}
                      </span>
                    </p>
                  ) : (
                    <ThumbGroup selection={oralForm} thumbClassName={PILL_THUMB} role="group" aria-label="Tablets or capsules" className="flex flex-wrap gap-2">
                      {/* The stored value stays `tab`/`capsule` — that is the
                          `dose_unit` enum and a database contract. Only the WORDS
                          change: "cap" beside a number is an abbreviation of
                          nothing. */}
                      <button type="button" onClick={() => setOralForm("tab")} aria-pressed={oralForm === "tab"} className={pill(oralForm === "tab")}>Tablet</button>
                      <button type="button" onClick={() => setOralForm("capsule")} aria-pressed={oralForm === "capsule"} className={pill(oralForm === "capsule")}>Capsule</button>
                    </ThumbGroup>
                  )}
                </div>
                <div className={cn("grid grid-cols-1 gap-2", !strengthRequired && "hidden")}>
                  <label className="block">
                    {/* REQUIRED wherever it appears, and the unit is whatever the
                        label says — a 5000 iu vitamin D tablet could not be
                        stored at all before `supabase/protocol/016`. It is hidden
                        entirely for a compound dosed in tablets, where the
                        tablet is the unit and a strength may not be stored. */}
                    <span className={FIELD_LABEL}>Strength</span>
                    <div className="flex items-center gap-2">
                      <PadInput {...pad.bind("strength")} value={strength} label="Strength" unit={strengthShown} suffix={<FieldUnit unit={strengthShown} />} className={fieldCls("strength")} />
                      {strengthUnits.length > 1 && (
                        <ThumbGroup selection={strengthUnit} thumbClassName={PILL_THUMB} role="group" aria-label="Strength unit" className="flex gap-1">
                          {strengthUnits.map((u) => (
                            <button key={u} type="button" onClick={() => setStrengthUnit(u)} aria-pressed={strengthUnit === u} className={pill(strengthUnit === u)}>{shownUnit(u)}</button>
                          ))}
                        </ThumbGroup>
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
                    {picker === "hidden" ? "“Change form”" : "the type above"}{" "}
                    to switch.
                  </p>
                ) : null}
                {/* The strength is REQUIRED wherever it shows (a strengthless
                    row pairs only with a compound dosed in tablets, so for the
                    rest it is rejected outright). An empty one is refused by
                    "Add" with a shake, not a sentence. The "Doses are counted in
                    tablets" line went too: the forced pill above says it. */}
              </div>
            )}

            {/* The powder form is the reconstituted form with the second input
                removed: same LABEL + FIELD markup, same clean/num handling, one
                amount row instead of two, and no derived readout. */}
            {type === "bulk_powder" && (
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className={FIELD_LABEL}>Tub weight</span>
                  <PadInput {...pad.bind("tubGrams")} value={tubGrams} label="Tub weight" unit="g" suffix={<FieldUnit unit="g" />} className={fieldCls("tubGrams")} />
                </label>
                <label className="block">
                  <span className={FIELD_LABEL}>Serving</span>
                  {/* Truly optional: the maths never reads it. */}
                  <PadInput {...pad.bind("servingG")} value={servingG} label="Serving" unit="g" placeholder="optional" suffix={<FieldUnit unit="g" />} className="h-11 w-full" />
                </label>
              </div>
            )}

            {/* How much is in it? Correcting a part-used container you have.
                EDIT only: a new one is full (Full = no offset). */}
            {showFill && fill.basis && (
              <div className={cn(INNER_RADIUS, "space-y-2 bg-bg-surface-raised/40 p-3")}>
                <span className={FIELD_LABEL}>How much is in it?</span>
                <div className="flex flex-wrap items-center gap-2">
                  {/* The presets only: the exact-amount field is not a choice
                      on the thumb. Typing an amount deselects every preset, and
                      the thumb hides. */}
                  <ThumbGroup
                    selection={fill.exactActive ? null : fillPreset}
                    thumbClassName={PILL_THUMB}
                    role="group"
                    aria-label="How full it is"
                    className="flex flex-wrap items-center gap-2"
                  >
                    {FILL_PRESETS.map((p) => {
                      const on = !fill.exactActive && fillPreset === p.f
                      return (
                        <button
                          key={p.label}
                          type="button"
                          onClick={() => {
                            setFillPreset(p.f)
                            setExactLeft("")
                          }}
                          aria-pressed={on}
                          className={pill(on)}
                        >
                          {p.label}
                        </button>
                      )
                    })}
                  </ThumbGroup>
                  <span className="text-xs text-text-muted">or</span>
                  <div className="flex items-center gap-1.5">
                    <PadInput
                      {...pad.bind("exactLeft")}
                      value={exactLeft}
                      label={`Amount left in ${fillUnit}`}
                      unit={fillUnit}
                      suffix={<FieldUnit unit={fillUnit} />}
                      className="h-10 w-24 px-2"
                    />
                    <span className="whitespace-nowrap text-xs text-text-muted">left</span>
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
        <p role="alert" className="pt-3 text-center text-sm text-state-error">{error}</p>
      )}

      <NumberPad {...pad.padProps(padFields)} label="Stock amounts" />
    </BottomSheet>
  )
}
