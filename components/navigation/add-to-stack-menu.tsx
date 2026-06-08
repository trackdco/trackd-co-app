"use client"

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { Pencil, Plus, Search, Trash2 } from "lucide-react"

import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  CATEGORY_META,
  CATEGORY_OPTIONS,
  FALLBACK_CATEGORY_META,
  INVENTORY_TYPE_OPTIONS,
  ROUTE_OPTIONS,
  UNIT_OPTIONS,
  type Compound,
  type CompoundCategory,
} from "@/lib/compound-categories"
import { COMPOUNDS } from "@/lib/compounds-catalogue"

interface AddToStackMenuProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Scopes the user's "Make your own" compounds in local storage. */
  userId: string
}

// A user-created compound, stored locally on the device for that user only.
type CustomCompound = Compound & { id: string; isCustom: true }

// Curated "popular" set — resolved against the catalogue so the category/dot
// stays accurate (these all exist in compounds.csv).
const POPULAR_NAMES = [
  "Testosterone Cypionate",
  "Nandrolone Phenylpropionate",
  "Trenbolone Acetate",
  "Retatrutide",
  "TB-500",
  "Exemestane",
  "Berberine",
  "Ashwagandha",
]
const POPULAR: Compound[] = POPULAR_NAMES.map((n) =>
  COMPOUNDS.find((c) => c.name === n)
).filter((c): c is Compound => Boolean(c))

const NAME_MAX = 80

const DEFAULT_FORM = {
  name: "",
  category: "anabolic" as CompoundCategory,
  unit: "mg",
  route: "im",
  inventoryType: "preconcentrated",
}
type FormState = typeof DEFAULT_FORM

// Release the handle past this fraction of the sheet's height → dismiss.
const DISMISS_THRESHOLD = 0.3

// useLayoutEffect on the client (before paint, no flash), useEffect on the server.
const useIsoLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect

const storageKey = (userId: string) => `trackd.customCompounds.${userId}`

function loadCustoms(userId: string): CustomCompound[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(storageKey(userId))
    const parsed: unknown = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return []
    // Normalise every entry so a corrupt / legacy / hand-edited record can't
    // crash the list (e.g. a missing `aliases` would throw in the search filter).
    const out: CustomCompound[] = []
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue
      const c = item as Record<string, unknown>
      if (typeof c.id !== "string" || typeof c.name !== "string") continue
      out.push({
        id: c.id,
        isCustom: true,
        name: c.name,
        category:
          typeof c.category === "string" && c.category in CATEGORY_META
            ? (c.category as CompoundCategory)
            : "anabolic",
        aliases: Array.isArray(c.aliases)
          ? c.aliases.filter((a): a is string => typeof a === "string")
          : [],
        defaultUnit: typeof c.defaultUnit === "string" ? c.defaultUnit : "mg",
        defaultRoute: typeof c.defaultRoute === "string" ? c.defaultRoute : "im",
        defaultInventoryType:
          typeof c.defaultInventoryType === "string"
            ? c.defaultInventoryType
            : "preconcentrated",
        halfLifeHours:
          typeof c.halfLifeHours === "number" ? c.halfLifeHours : null,
      })
    }
    return out
  } catch {
    return []
  }
}

// Returns true on success, false if the write failed (quota full / disabled).
function saveCustoms(userId: string, list: CustomCompound[]): boolean {
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(list))
    return true
  } catch {
    return false
  }
}

// A stable id for a custom compound. crypto.randomUUID() only exists in a secure
// context (https / localhost) — NOT over a plain-http LAN IP, which is exactly how
// the dev server is opened on a phone — so fall back to a good-enough local id.
function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    try {
      return crypto.randomUUID()
    } catch {
      /* insecure context — fall through */
    }
  }
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

function isCustom(c: Compound): c is CustomCompound {
  return (c as Partial<CustomCompound>).isCustom === true
}

/**
 * "Add to Stack" — the near-full-height sheet the centre plus slides up.
 * Searches the bundled catalogue (name + aliases). "Make your own" creates a
 * custom compound saved to per-user localStorage; your own compounds can be
 * edited or deleted (delete asks first). The grab handle is drag-to-dismiss.
 * The per-row "+" is visual for now — adding to a real stack needs the cycle feature.
 */
export function AddToStackMenu({ open, onOpenChange, userId }: AddToStackMenuProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ startY: number; height: number } | null>(null)
  const offsetRef = useRef(0)
  const [offsetY, setOffsetY] = useState(0)
  const [dragging, setDragging] = useState(false)

  const [query, setQuery] = useState("")
  const [customs, setCustoms] = useState<CustomCompound[]>([])

  const [mode, setMode] = useState<"browse" | "form">("browse")
  const [formMode, setFormMode] = useState<"create" | "edit">("create")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(DEFAULT_FORM)
  const [nameError, setNameError] = useState<string | null>(null)
  const [saveFailed, setSaveFailed] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  // Row-level (browse list) delete confirmation — which custom compound is
  // mid-confirm. Separate from the edit form's own `confirmingDelete`.
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(
    null
  )

  // Every open starts clean (resting position, browse mode, empty search) and
  // reloads this user's saved compounds. Runs before paint → no flash.
  useIsoLayoutEffect(() => {
    if (open) {
      offsetRef.current = 0
      setOffsetY(0)
      setQuery("")
      backToBrowse()
      setCustoms(loadCustoms(userId))
    }
  }, [open, userId])

  const q = query.trim().toLowerCase()
  const results = useMemo(() => {
    if (!q) return []
    const all: Compound[] = [...customs, ...COMPOUNDS]
    return all.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.aliases.some((a) => a.toLowerCase().includes(q))
    )
  }, [q, customs])

  /* ----------------------------------------------------------- drag-to-dismiss */

  function handlePointerDown(e: React.PointerEvent) {
    const height = cardRef.current?.getBoundingClientRect().height ?? 0
    dragRef.current = { startY: e.clientY, height }
    setDragging(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function handlePointerMove(e: React.PointerEvent) {
    const drag = dragRef.current
    if (!drag) return
    const next = Math.max(0, Math.min(e.clientY - drag.startY, drag.height))
    offsetRef.current = next
    setOffsetY(next)
  }

  function handlePointerUp() {
    const drag = dragRef.current
    dragRef.current = null
    setDragging(false)
    if (drag && offsetRef.current > drag.height * DISMISS_THRESHOLD) {
      onOpenChange(false)
    } else {
      offsetRef.current = 0
      setOffsetY(0)
    }
  }

  /* ---------------------------------------------------------------- form state */

  function backToBrowse() {
    setMode("browse")
    setFormMode("create")
    setEditingId(null)
    setForm(DEFAULT_FORM)
    setNameError(null)
    setSaveFailed(false)
    setConfirmingDelete(false)
    setConfirmingDeleteId(null)
  }

  function openCreate() {
    setForm({ ...DEFAULT_FORM, name: query.trim().slice(0, NAME_MAX) })
    setFormMode("create")
    setEditingId(null)
    setNameError(null)
    setSaveFailed(false)
    setConfirmingDelete(false)
    setMode("form")
  }

  function openEdit(compound: CustomCompound) {
    setForm({
      name: compound.name,
      category: compound.category,
      unit: compound.defaultUnit,
      route: compound.defaultRoute,
      inventoryType: compound.defaultInventoryType,
    })
    setFormMode("edit")
    setEditingId(compound.id)
    setNameError(null)
    setSaveFailed(false)
    setConfirmingDelete(false)
    setMode("form")
  }

  function isDuplicateName(name: string): boolean {
    const n = name.toLowerCase()
    if (COMPOUNDS.some((c) => c.name.toLowerCase() === n)) return true
    return customs.some((c) => c.name.toLowerCase() === n && c.id !== editingId)
  }

  function handleSubmit() {
    const name = form.name.trim()
    if (!name) {
      setNameError("Enter a name.")
      return
    }
    if (isDuplicateName(name)) {
      setNameError("That compound already exists.")
      return
    }

    let next: CustomCompound[]
    if (formMode === "edit" && editingId) {
      next = customs.map((c) =>
        c.id === editingId
          ? {
              ...c,
              name,
              category: form.category,
              defaultUnit: form.unit,
              defaultRoute: form.route,
              defaultInventoryType: form.inventoryType,
            }
          : c
      )
    } else {
      const created: CustomCompound = {
        id: newId(),
        isCustom: true,
        name,
        category: form.category,
        aliases: [],
        defaultUnit: form.unit,
        defaultRoute: form.route,
        defaultInventoryType: form.inventoryType,
        halfLifeHours: null,
      }
      next = [created, ...customs]
    }

    // Only commit once it actually persists, so a failed write doesn't add an
    // unsaved item that then blocks a retry as a "duplicate".
    if (saveCustoms(userId, next)) {
      setCustoms(next)
      backToBrowse()
    } else {
      setSaveFailed(true)
    }
  }

  async function performDelete() {
    if (!editingId) return
    const next = customs.filter((c) => c.id !== editingId)

    try {
      const saved = await saveCustoms(userId, next)
      if (saved) {
        setCustoms(next)
        backToBrowse()
      } else {
        setSaveFailed(true)
      }
    } catch (error) {
      console.error("Failed to delete custom compound", error)
      setSaveFailed(true)
    }
  }

  // ---- Row-level delete (browse list). Same confirm + persistence as the edit
  // menu's delete, but triggered from a custom compound's row instead.
  function askDeleteCustom(id: string) {
    setSaveFailed(false)
    setConfirmingDeleteId(id)
  }

  function cancelDeleteCustom() {
    setConfirmingDeleteId(null)
  }

  function confirmDeleteCustom(id: string) {
    const next = customs.filter((c) => c.id !== id)
    if (saveCustoms(userId, next)) {
      setCustoms(next)
      setConfirmingDeleteId(null)
    } else {
      setSaveFailed(true)
    }
  }

  const nameValid = form.name.trim().length > 0

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="h-[92dvh] gap-0 border-t-0 bg-transparent p-0 shadow-none"
      >
        {/* The visible card. Its transform is the drag offset; the sheet's own
            open/close slide lives on the (transparent) parent, so they never fight. */}
        <div
          ref={cardRef}
          style={{
            transform: `translateY(${offsetY}px)`,
            transition: dragging ? "none" : "transform 250ms ease-out",
          }}
          className="flex h-full flex-col overflow-hidden rounded-t-3xl border-t border-border-default bg-bg-surface shadow-lg"
        >
          {/* Grab handle — drag down to dismiss (≈44px tap target) */}
          <div
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className="flex h-11 shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
          >
            <span aria-hidden className="h-1 w-9 rounded-full bg-border-strong" />
          </div>

          {/* Header */}
          <div className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center px-4 pb-3">
            {mode === "form" ? (
              <button
                type="button"
                onClick={backToBrowse}
                className="justify-self-start text-base text-text-muted transition-colors hover:text-text-primary"
              >
                Cancel
              </button>
            ) : (
              <SheetClose className="justify-self-start text-base text-text-muted transition-colors hover:text-text-primary">
                Cancel
              </SheetClose>
            )}

            <SheetTitle className="justify-self-center text-base font-semibold text-foreground">
              {mode === "form"
                ? formMode === "edit"
                  ? "Edit compound"
                  : "Make your own"
                : "Add to stack"}
            </SheetTitle>

            {mode === "form" ? (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!nameValid}
                className="justify-self-end text-base font-medium text-accent-amber transition-colors hover:opacity-80 disabled:text-text-subtle"
              >
                {formMode === "edit" ? "Save" : "Add"}
              </button>
            ) : (
              <span aria-hidden className="justify-self-end" />
            )}
          </div>

          <SheetDescription className="sr-only">
            Search the compounds catalogue, or make your own, to add to your stack.
          </SheetDescription>

          {mode === "form" ? (
            <CompoundForm
              form={form}
              setForm={setForm}
              formMode={formMode}
              nameError={nameError}
              clearNameError={() => setNameError(null)}
              saveFailed={saveFailed}
              confirmingDelete={confirmingDelete}
              onAskDelete={() => setConfirmingDelete(true)}
              onCancelDelete={() => setConfirmingDelete(false)}
              onConfirmDelete={performDelete}
            />
          ) : (
            <BrowseBody
              query={query}
              setQuery={setQuery}
              q={q}
              results={results}
              customs={customs}
              onEditCustom={openEdit}
              onMakeYourOwn={openCreate}
              confirmingDeleteId={confirmingDeleteId}
              onAskDeleteCustom={askDeleteCustom}
              onCancelDeleteCustom={cancelDeleteCustom}
              onConfirmDeleteCustom={confirmDeleteCustom}
              deleteFailed={saveFailed}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

/* ------------------------------------------------------------------ browse */

function BrowseBody({
  query,
  setQuery,
  q,
  results,
  customs,
  onEditCustom,
  onMakeYourOwn,
  confirmingDeleteId,
  onAskDeleteCustom,
  onCancelDeleteCustom,
  onConfirmDeleteCustom,
  deleteFailed,
}: {
  query: string
  setQuery: (v: string) => void
  q: string
  results: Compound[]
  customs: CustomCompound[]
  onEditCustom: (c: CustomCompound) => void
  onMakeYourOwn: () => void
  confirmingDeleteId: string | null
  onAskDeleteCustom: (id: string) => void
  onCancelDeleteCustom: () => void
  onConfirmDeleteCustom: (id: string) => void
  deleteFailed: boolean
}) {
  // Props shared by every CompoundList instance (custom rows can appear both in
  // search results and under "Your compounds").
  const listProps = {
    onEditCustom,
    confirmingDeleteId,
    onAskDeleteCustom,
    onCancelDeleteCustom,
    onConfirmDeleteCustom,
    deleteFailed,
  }

  return (
    <>
      {/* Search bar */}
      <div className="shrink-0 px-4 pb-4">
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-text-muted"
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search compounds…"
            aria-label="Search compounds"
            className="h-12 rounded-xl border-transparent bg-bg-input pr-4 pl-11 text-base placeholder:text-text-muted dark:bg-bg-input"
          />
        </div>
      </div>

      {/* Scrolling content */}
      <div className="flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
        {q ? (
          results.length > 0 ? (
            <CompoundList items={results} {...listProps} />
          ) : (
            <p className="px-1 py-6 text-center text-sm text-text-muted">
              <span className="text-foreground">“{query.trim()}”</span> not found
            </p>
          )
        ) : (
          <>
            {customs.length > 0 && (
              <>
                <SectionLabel>Your compounds</SectionLabel>
                <CompoundList items={customs} {...listProps} />
                <div className="h-4" />
              </>
            )}
            <SectionLabel>Popular in comp prep</SectionLabel>
            <CompoundList items={POPULAR} {...listProps} />
          </>
        )}

        {/* Make your own — always at the bottom */}
        <MakeYourOwnRow query={query} onClick={onMakeYourOwn} />
      </div>
    </>
  )
}

function RowMain({ compound }: { compound: Compound }) {
  const meta = CATEGORY_META[compound.category] ?? FALLBACK_CATEGORY_META
  return (
    <>
      <span
        aria-hidden
        className={cn("h-2 w-2 shrink-0 rounded-full", meta.dot)}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-medium text-foreground">
          {compound.name}
        </p>
        <p className="truncate text-sm text-text-muted">{meta.label}</p>
      </div>
    </>
  )
}

function CompoundList({
  items,
  onEditCustom,
  confirmingDeleteId,
  onAskDeleteCustom,
  onCancelDeleteCustom,
  onConfirmDeleteCustom,
  deleteFailed,
}: {
  items: Compound[]
  onEditCustom: (c: CustomCompound) => void
  confirmingDeleteId: string | null
  onAskDeleteCustom: (id: string) => void
  onCancelDeleteCustom: () => void
  onConfirmDeleteCustom: (id: string) => void
  deleteFailed: boolean
}) {
  return (
    <ul className="overflow-hidden rounded-2xl bg-bg-surface-raised">
      {items.map((compound, i) => {
        const divider = i > 0 ? "border-t border-border-default" : ""
        if (isCustom(compound)) {
          // Your own compound, mid-delete-confirm — same red confirm as the edit
          // menu's delete, shown inline in place of the row.
          if (confirmingDeleteId === compound.id) {
            return (
              <li key={compound.id}>
                <div className={cn("px-4 py-3", divider)}>
                  <div className="rounded-xl border border-state-error/40 bg-state-error/10 p-3">
                    <p className="text-sm text-foreground">
                      Delete “{compound.name}”? This can&apos;t be undone.
                    </p>
                    {deleteFailed && (
                      <p className="mt-2 text-sm text-state-warning">
                        Couldn&apos;t save to this device (storage may be full or
                        off). Try again, or check your browser&apos;s storage
                        settings.
                      </p>
                    )}
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={onCancelDeleteCustom}
                        className="flex-1 rounded-lg border border-border-strong py-2 text-sm text-text-muted transition-colors hover:text-text-primary"
                      >
                        Keep
                      </button>
                      <button
                        type="button"
                        onClick={() => onConfirmDeleteCustom(compound.id)}
                        className="flex-1 rounded-lg bg-state-error py-2 text-sm font-medium text-text-primary transition-opacity hover:opacity-90"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            )
          }
          // Your own compound — three controls on the right: add-to-stack (+),
          // then a smaller edit and delete.
          return (
            <li key={compound.id}>
              <div className={cn("flex items-center gap-3 px-4 py-3.5", divider)}>
                <RowMain compound={compound} />
                <div className="flex shrink-0 items-center gap-1">
                  {/* Add to stack — same visual as the catalogue rows' "+"
                      (wires into the real stack when the cycle feature lands). */}
                  <button
                    type="button"
                    aria-label={`Add ${compound.name} to stack`}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border-strong text-text-primary transition-all duration-200 ease-out hover:bg-bg-input active:scale-95"
                  >
                    <Plus className="h-4 w-4" aria-hidden />
                  </button>
                  {/* Edit — opens the (unchanged) edit menu. */}
                  <button
                    type="button"
                    onClick={() => onEditCustom(compound)}
                    aria-label={`Edit ${compound.name}`}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-bg-input hover:text-text-primary"
                  >
                    <Pencil className="h-4 w-4" aria-hidden />
                  </button>
                  {/* Delete — same confirm + delete as the edit menu. */}
                  <button
                    type="button"
                    onClick={() => onAskDeleteCustom(compound.id)}
                    aria-label={`Delete ${compound.name}`}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-state-error transition-colors hover:bg-state-error/10"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              </div>
            </li>
          )
        }
        return (
          <li key={compound.name}>
            <div className={cn("flex items-center gap-3 px-4 py-3.5", divider)}>
              <RowMain compound={compound} />
              <button
                type="button"
                aria-label={`Add ${compound.name} to stack`}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border-strong text-text-primary transition-all duration-200 ease-out hover:bg-bg-input active:scale-95"
              >
                <Plus className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function MakeYourOwnRow({
  query,
  onClick,
}: {
  query: string
  onClick: () => void
}) {
  const typed = query.trim()
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-3 flex w-full items-center gap-3 rounded-2xl border border-dashed border-border-strong px-4 py-3.5 text-left transition-colors duration-200 ease-out hover:bg-bg-surface-raised"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bg-input text-text-primary">
        <Plus className="h-4 w-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-base font-medium text-foreground">Make your own</p>
        <p className="truncate text-sm text-text-muted">
          {typed
            ? `Add “${typed}” as a custom compound`
            : "Add a compound that isn't listed"}
        </p>
      </div>
    </button>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-1 pt-1 pb-2 text-[11px] font-medium tracking-wider text-text-muted uppercase">
      {children}
    </p>
  )
}

/* ------------------------------------------------------------------ form */

function CompoundForm({
  form,
  setForm,
  formMode,
  nameError,
  clearNameError,
  saveFailed,
  confirmingDelete,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete,
}: {
  form: FormState
  setForm: React.Dispatch<React.SetStateAction<FormState>>
  formMode: "create" | "edit"
  nameError: string | null
  clearNameError: () => void
  saveFailed: boolean
  confirmingDelete: boolean
  onAskDelete: () => void
  onCancelDelete: () => void
  onConfirmDelete: () => void
}) {
  return (
    <div className="flex-1 space-y-5 overflow-y-auto px-4 pt-1 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
      <label className="block">
        <FieldLabel>Name</FieldLabel>
        <Input
          autoFocus
          value={form.name}
          maxLength={NAME_MAX}
          onChange={(e) => {
            clearNameError()
            setForm((f) => ({ ...f, name: e.target.value }))
          }}
          placeholder="e.g. Test Blend 400"
          aria-label="Compound name"
          aria-invalid={nameError ? true : undefined}
          className="h-12 rounded-xl border-border-default bg-bg-input text-base dark:bg-bg-input"
        />
        {nameError && (
          <p className="mt-1.5 px-1 text-sm text-state-error">{nameError}</p>
        )}
      </label>

      <PillGroup
        label="Category"
        value={form.category}
        onChange={(v) => setForm((f) => ({ ...f, category: v as CompoundCategory }))}
        options={CATEGORY_OPTIONS}
        showDot
      />
      <PillGroup
        label="Dose unit"
        value={form.unit}
        onChange={(v) => setForm((f) => ({ ...f, unit: v }))}
        options={UNIT_OPTIONS}
      />
      <PillGroup
        label="Route"
        value={form.route}
        onChange={(v) => setForm((f) => ({ ...f, route: v }))}
        options={ROUTE_OPTIONS}
      />
      <PillGroup
        label="Inventory type"
        value={form.inventoryType}
        onChange={(v) => setForm((f) => ({ ...f, inventoryType: v }))}
        options={INVENTORY_TYPE_OPTIONS}
      />

      {saveFailed && (
        <p className="text-sm text-state-warning">
          Couldn&apos;t save to this device (storage may be full or off). Try again,
          or check your browser&apos;s storage settings.
        </p>
      )}

      <p className="px-1 text-xs leading-relaxed text-text-subtle">
        Saved to this device for you only.
      </p>

      {formMode === "edit" && (
        <div className="border-t border-border-default pt-4">
          {confirmingDelete ? (
            <div className="rounded-xl border border-state-error/40 bg-state-error/10 p-3">
              <p className="text-sm text-foreground">
                Delete “{form.name.trim() || "this compound"}”? This can&apos;t be
                undone.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={onCancelDelete}
                  className="flex-1 rounded-lg border border-border-strong py-2 text-sm text-text-muted transition-colors hover:text-text-primary"
                >
                  Keep
                </button>
                <button
                  type="button"
                  onClick={onConfirmDelete}
                  className="flex-1 rounded-lg bg-state-error py-2 text-sm font-medium text-text-primary transition-opacity hover:opacity-90"
                >
                  Delete
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={onAskDelete}
              className="flex items-center gap-2 text-sm text-state-error transition-opacity hover:opacity-80"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              Delete compound
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-1.5 block text-xs font-medium tracking-wider text-text-muted uppercase">
      {children}
    </span>
  )
}

function PillGroup({
  label,
  value,
  onChange,
  options,
  showDot = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: readonly { value: string; label: string }[]
  showDot?: boolean
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const active = o.value === value
          const dot =
            CATEGORY_META[o.value as CompoundCategory]?.dot ??
            FALLBACK_CATEGORY_META.dot
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              aria-pressed={active}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
                active
                  ? "border-accent-amber bg-accent-amber/15 text-foreground"
                  : "border-border-default bg-bg-input text-text-muted hover:text-text-primary"
              )}
            >
              {showDot && (
                <span
                  aria-hidden
                  className={cn("h-1.5 w-1.5 rounded-full", dot)}
                />
              )}
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
