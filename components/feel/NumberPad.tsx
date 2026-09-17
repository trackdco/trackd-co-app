"use client"

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type Ref,
  type RefObject,
} from "react"
import { createPortal } from "react-dom"

import { ArrowRight, Backspace, CaretDown, Check } from "@/components/icons"
import { ThumbGroup } from "@/components/feel/SlidingThumb"
import { applyPadKey, padKeyFromKeyboard, PAD_DIGIT_KEYS, type PadKey } from "@/lib/feel/pad"
import { CARD_EYEBROW, PRESS } from "@/lib/ui-presets"
import { cn } from "@/lib/utils"

const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect

/** Keep in step with the panel's exit (`--motion-base`). */
const EXIT_MS = 260

/**
 * A key typed on a focused pad FIELD, waiting for the pad it opened. The field
 * is a button, so a laptop user who tabs to it and types would otherwise get
 * nothing (or a desktop shortcut). The pad applies the key once it is open.
 */
let pendingKey: { key: PadKey; at: number } | null = null

/**
 * `onKeyDown` for anything that opens the pad: a digit, a decimal point or
 * Backspace opens it and is applied there, as if the field were an input.
 */
export function padFieldKeyDown(
  e: ReactKeyboardEvent<HTMLElement>,
  onOpen: () => void,
  active: boolean,
) {
  if (active || e.metaKey || e.ctrlKey || e.altKey) return
  const key = padKeyFromKeyboard(e.key)
  if (!key) return
  e.preventDefault()
  e.stopPropagation()
  pendingKey = { key, at: performance.now() }
  onOpen()
}

/** One field the pad can edit. The form owns the value; the pad only edits it. */
export interface PadField {
  id: string
  /** The readout's eyebrow ("Dose", "Weight for 12/09/2026"). */
  label: string
  /** The chip's label when the pad carries several fields ("Powder"). */
  short?: string
  /** Shown after the value ("mg", "mL", "days"). */
  unit?: string
  value: string
  onChange: (value: string) => void
  /** False for a whole-number field. Default true. */
  decimal?: boolean
  /** The field's own sanitiser; a key it would strip is refused. */
  sanitize?: (raw: string) => string
  /**
   * The Calculator's compact pad carries the active field's unit toggle
   * (mg / mcg), kept in step with the form's own pill.
   */
  unitOptions?: {
    options: readonly string[]
    value: string
    onChange: (unit: string) => void
  }
}

export interface NumberPadProps {
  /** Which field is being edited, or null when the pad is closed. */
  active: number | null
  fields: PadField[]
  onActiveChange: (index: number) => void
  /** The hide chevron, a scrim tap, or Escape. Nothing is undone. */
  onClose: () => void
  /** Done on the last field. Defaults to `onClose`. */
  onDone?: () => void
  /** "compact" is the Calculator's: the chips are the fields. */
  variant?: "focus" | "compact"
  /** The 42% scrim behind the panel (tap it to hide). Off on the Calculator. */
  scrim?: boolean
  /**
   * The prefilled value opens SELECTED: the first key replaces it and Delete
   * clears it (Log weight).
   */
  selectOnOpen?: boolean
  /**
   * An element inside the host sheet. The pad renders INSIDE that sheet's
   * content, so Radix does not read a tap on a key as a tap outside the sheet
   * (which closes it) and its focus trap keeps the keys reachable. Without one
   * the pad renders on `<body>`.
   */
  anchorRef?: RefObject<HTMLElement | null>
  /** Where focus goes when the pad closes. */
  returnFocusRef?: RefObject<HTMLElement | null>
  /** The same, asked at close time (a form of several fields). */
  returnFocus?: () => HTMLElement | null
  /** Announced name for the pad. */
  label?: string
}

/**
 * THE TRACKD NUMBER PAD (feel pass §3, the approved "Focus" layout).
 *
 * It replaces the iPhone keypad for NUMBER fields. The system keypad for
 * decimals has no Return key, so a form of several numbers dropped the keyboard
 * between every field; this panel carries all of them.
 *
 * One panel slides up over the whole phone (radius 24, 320ms in, 240ms out on
 * the house ease) above a 42% scrim. It is NOT docked in the sheet: the form
 * behind never shrinks or grows. Top to bottom: the readout (label, value,
 * unit), a chip per field on a sliding white thumb (multi-field forms), open
 * keys (1-9, `.`, 0, delete) and a bottom row of hide + Next, which becomes a
 * white Done on the last field.
 *
 * A laptop keyboard drives it: digits, `.` or `,`, Backspace, Enter or Tab for
 * Next, Shift+Tab for previous, Escape to hide.
 */
export function NumberPad({
  active,
  fields,
  onActiveChange,
  onClose,
  onDone,
  variant = "focus",
  scrim = true,
  selectOnOpen = false,
  anchorRef,
  returnFocusRef,
  returnFocus,
  label = "Number pad",
}: NumberPadProps) {
  const open = active !== null && fields[active] !== undefined
  // While it slides away the pad keeps showing the field it was on, not the
  // first one.
  const [lastIndex, setLastIndex] = useState(active ?? 0)
  if (open && active !== lastIndex) setLastIndex(active as number)
  const index = open ? (active as number) : lastIndex

  // Kept mounted through the exit animation, then dropped.
  const [mounted, setMounted] = useState(open)
  const [shown, setShown] = useState(false)
  const [prevOpen, setPrevOpen] = useState(open)
  // Whether the active value is selected (the next key replaces it).
  const [selected, setSelected] = useState(open && selectOnOpen)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setMounted(true)
      setSelected(selectOnOpen && Boolean(fields[index]?.value))
    } else {
      setShown(false)
      setSelected(false)
    }
  }
  const [prevIndex, setPrevIndex] = useState(index)
  if (index !== prevIndex) {
    setPrevIndex(index)
    setSelected(false)
  }

  // Enter on the frame AFTER mount, so the slide has a start to run from.
  useEffect(() => {
    if (!open || shown) return
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)))
    return () => cancelAnimationFrame(raf)
  }, [open, shown])
  useEffect(() => {
    if (open || !mounted) return
    const t = window.setTimeout(() => setMounted(false), EXIT_MS)
    return () => window.clearTimeout(t)
  }, [open, mounted])

  // Where to render: inside the host sheet when there is one.
  const [host, setHost] = useState<HTMLElement | null>(null)
  useIsoLayoutEffect(() => {
    if (!mounted) return
    const sheet = anchorRef?.current?.closest<HTMLElement>('[data-slot="sheet-content"]')
    setHost(sheet ?? document.body)
  }, [mounted, anchorRef])

  // Focus goes back to the field when the pad closes.
  const wasOpen = useRef(open)
  useEffect(() => {
    if (wasOpen.current && !open) {
      const el = returnFocus?.() ?? returnFocusRef?.current
      el?.focus({ preventScroll: true })
    }
    wasOpen.current = open
  }, [open, returnFocusRef, returnFocus])

  const panelRef = useRef<HTMLDivElement>(null)
  const shake = useCallback((key: string) => {
    const b = panelRef.current?.querySelector<HTMLElement>(`[data-pad-key="${key}"]`)
    if (!b || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    b.classList.remove("animate-key-shake")
    void b.offsetWidth
    b.classList.add("animate-key-shake")
  }, [])

  const field = fields[index]
  const isLast = index >= fields.length - 1
  const done = onDone ?? onClose

  const press = useCallback(
    (key: PadKey) => {
      if (!field) return
      const r = applyPadKey(field.value, key, {
        decimal: field.decimal !== false,
        sanitize: field.sanitize,
        selected,
      })
      if (r.rejected) return shake(key)
      setSelected(false)
      if (r.value !== field.value) field.onChange(r.value)
    },
    [field, selected, shake],
  )
  const next = useCallback(() => {
    if (isLast) done()
    else onActiveChange(index + 1)
  }, [isLast, done, onActiveChange, index])

  // A key typed on the field that opened the pad lands on the pad, once it
  // has rendered open (a tick later, with the field it opened on).
  const pressRef = useRef(press)
  useEffect(() => {
    pressRef.current = press
  })
  useEffect(() => {
    const p = pendingKey
    if (!open || !p) return
    if (performance.now() - p.at > 1000) {
      pendingKey = null
      return
    }
    const t = window.setTimeout(() => {
      if (pendingKey !== p) return
      pendingKey = null
      pressRef.current(p.key)
    }, 0)
    return () => window.clearTimeout(t)
  }, [open])

  // Focus moves INTO the pad once it is on screen, so it is announced as a
  // group and a screen reader's cursor is on the keys rather than on whatever
  // opened it (the + menu's tile is gone by then). It goes back on close.
  useEffect(() => {
    if (open && shown) panelRef.current?.focus({ preventScroll: true })
  }, [open, shown])

  // The hardware keyboard, while open. Window + capture, and stopped, so the
  // sheet's own Escape and focus trap never see the keys the pad has taken,
  // and neither do the desktop's single-key shortcuts.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return
      const key = padKeyFromKeyboard(e.key)
      if (key) press(key)
      else if (e.key === "Enter" || (e.key === "Tab" && !e.shiftKey)) next()
      else if (e.key === "Tab" && e.shiftKey) {
        if (index > 0) onActiveChange(index - 1)
      } else if (e.key === "Escape") onClose()
      else return
      e.preventDefault()
      e.stopPropagation()
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [open, press, next, index, onActiveChange, onClose])

  if (!mounted || !host || !field) return null

  const compact = variant === "compact"
  const multi = fields.length > 1

  const goButton = (
    <button
      type="button"
      onClick={next}
      className={cn(
        PRESS.button,
        "flex h-[50px] flex-1 items-center justify-center gap-2 rounded-[14px] text-[15px] font-medium transition-colors duration-200",
        isLast ? "bg-accent-primary text-bg-base" : "bg-bg-surface-raised text-foreground",
        compact && "pad-compact-row",
      )}
    >
      {isLast ? (
        <>
          <Check className="h-5 w-5" aria-hidden />
          Done
        </>
      ) : (
        <>
          Next
          <ArrowRight className="h-5 w-5" aria-hidden />
        </>
      )}
    </button>
  )

  const hideButton = (
    <button
      type="button"
      onClick={onClose}
      aria-label="Hide number pad"
      className={cn(
        PRESS.icon,
        "flex h-[50px] w-[50px] shrink-0 items-center justify-center rounded-[14px] bg-bg-surface-raised text-text-muted",
        compact && "pad-compact-row pad-compact-hide",
      )}
    >
      <CaretDown className="h-5 w-5" aria-hidden />
    </button>
  )

  const keys = (
    <div className={cn("grid grid-cols-3 gap-0.5", compact ? "pad-keys-compact" : "auto-rows-[50px]")}>
      {[...PAD_DIGIT_KEYS, ".", "0", "del"].map((k) => {
        const disabled = k === "." && field.decimal === false
        return (
          <button
            key={k}
            type="button"
            data-pad-key={k}
            disabled={disabled}
            onClick={() => press(k as PadKey)}
            aria-label={k === "del" ? "Delete" : k === "." ? "Decimal point" : k}
            className={cn(
              PRESS.key,
              "flex items-center justify-center rounded-[14px] font-mono text-[28px] font-light text-foreground transition-opacity disabled:opacity-25",
            )}
          >
            {k === "del" ? <Backspace className="h-[22px] w-[22px]" aria-hidden /> : k}
          </button>
        )
      })}
    </div>
  )

  const unitCtl = field.unitOptions ? (
    <ThumbGroup
      selection={field.unitOptions.value}
      thumbClassName="rounded-full bg-bg-surface-raised"
      role="group"
      aria-label={`${field.label} unit`}
      className="flex shrink-0 self-center rounded-full border border-border-default bg-bg-input p-0.5 text-[13px]"
    >
      {field.unitOptions.options.map((u) => {
        const on = field.unitOptions?.value === u
        return (
          <button
            key={u}
            type="button"
            aria-pressed={on}
            onClick={() => field.unitOptions?.onChange(u)}
            className={cn(
              PRESS.pill,
              "rounded-full px-3 py-2 font-medium transition-colors duration-300 ease-out",
              on ? "text-foreground" : "text-text-muted",
            )}
          >
            {u}
          </button>
        )
      })}
    </ThumbGroup>
  ) : field.unit ? (
    <span className="shrink-0 self-center px-3 text-[13px] text-text-muted">{field.unit}</span>
  ) : null

  const panel = (
    <div className="pointer-events-none fixed inset-0 z-[60]" data-pad-layer>
      {scrim ? (
        <div
          aria-hidden
          onClick={onClose}
          className={cn(
            "absolute inset-0 bg-[var(--pad-scrim)] transition-opacity duration-[var(--motion-base)] ease-out",
            shown ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
          )}
        />
      ) : null}
      <div
        ref={panelRef}
        role="group"
        aria-label={label}
        tabIndex={-1}
        data-open={shown ? "true" : "false"}
        className={cn(
          "number-pad absolute inset-x-0 bottom-0 mx-auto max-w-md rounded-t-3xl border-t border-border-default bg-bg-surface px-4 pt-3.5 shadow-[0_-16px_40px_rgba(0,0,0,0.45)] outline-none",
          // Nothing on a pad that is sliding away takes a tap.
          shown ? "pointer-events-auto" : "pointer-events-none",
          compact && "number-pad-compact",
        )}
        style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto max-w-[360px]">
          {compact ? (
            <ThumbGroup
              selection={index}
              thumbClassName="rounded-[14px] bg-accent-primary"
              role="group"
              aria-label="Fields"
              className="mb-2 grid grid-cols-3 gap-1.5"
            >
              {fields.map((f, n) => (
                <PadChip key={f.id} field={f} on={n === index} compact onClick={() => onActiveChange(n)} />
              ))}
            </ThumbGroup>
          ) : (
            <>
              <div className="pb-2.5 pt-0.5 text-center">
                <p className={CARD_EYEBROW}>{field.label}</p>
                <p className="mt-1 text-[44px] leading-[1.1] font-light tracking-[-0.03em] text-foreground">
                  <PadValue value={field.value} selected={selected} caret />
                  {field.unit ? (
                    <span className="ml-1.5 text-base tracking-normal text-text-muted">{field.unit}</span>
                  ) : null}
                </p>
              </div>
              {multi ? (
                <ThumbGroup
                  selection={index}
                  thumbClassName="rounded-full bg-accent-primary"
                  role="group"
                  aria-label="Fields"
                  className="mb-2.5 flex flex-wrap justify-center gap-1.5"
                >
                  {fields.map((f, n) => (
                    <PadChip key={f.id} field={f} on={n === index} onClick={() => onActiveChange(n)} />
                  ))}
                </ThumbGroup>
              ) : null}
            </>
          )}
          {keys}
          <div className={cn("mt-2.5 flex gap-2", compact && "pad-compact-gap")}>
            {hideButton}
            {compact ? unitCtl : null}
            {goButton}
          </div>
        </div>
      </div>
    </div>
  )

  return createPortal(panel, host)
}

/** A value on the pad: selected (the first key replaces it), or with a caret. */
function PadValue({ value, selected, caret }: { value: string; selected: boolean; caret: boolean }) {
  if (selected && value) {
    return <span className="rounded-md bg-text-primary/15 px-1">{value}</span>
  }
  return (
    <>
      {value}
      {caret ? <span aria-hidden className="pad-caret" /> : null}
    </>
  )
}

function PadChip({
  field,
  on,
  compact = false,
  onClick,
}: {
  field: PadField
  on: boolean
  compact?: boolean
  onClick: () => void
}) {
  const short = field.short ?? field.label
  if (compact) {
    return (
      <button
        type="button"
        aria-pressed={on}
        aria-label={`${field.label}, ${field.value || "empty"}${field.unit ? ` ${field.unit}` : ""}`}
        onClick={onClick}
        className={cn(
          PRESS.pill,
          "min-w-0 rounded-[14px] border px-2.5 pt-1.5 pb-[7px] text-left transition-colors duration-300",
          on ? "border-transparent text-bg-base" : "border-border-default text-text-muted",
        )}
      >
        <span className="pad-chip-label block text-[9px] tracking-[0.14em] uppercase opacity-80">{short}</span>
        <span
          className={cn(
            "mt-0.5 block truncate font-mono leading-[26px]",
            field.value.length >= 6 ? "text-sm" : field.value.length === 5 ? "text-base" : "text-lg",
            on ? "text-bg-base" : "text-foreground",
          )}
        >
          {field.value}
          {on ? <span aria-hidden className="pad-caret pad-caret-dark" /> : null}
          {field.unit ? <i className="ml-[3px] font-sans text-[11px] not-italic opacity-70">{field.unit}</i> : null}
        </span>
      </button>
    )
  }
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={`${field.label}, ${field.value || "empty"}`}
      onClick={onClick}
      className={cn(
        PRESS.pill,
        "rounded-full border px-3 py-1.5 text-xs transition-colors duration-300",
        on ? "border-transparent text-bg-base" : "border-border-default text-text-muted",
      )}
    >
      {short}
      <b className={cn("ml-1 font-mono font-normal", on ? "text-bg-base" : "text-foreground")}>{field.value}</b>
    </button>
  )
}

/**
 * A number field that opens the pad. It stands where the `<input>` stood and
 * keeps its look; it is a button because nothing here should summon the
 * system keyboard. While it is the field being edited it carries a white ring
 * and a caret. An empty field is empty: no placeholder numbers.
 */
export function PadInput({
  value,
  label,
  unit,
  active,
  onOpen,
  inputRef,
  className,
  placeholder,
  suffix,
  align = "left",
  invalid = false,
  disabled = false,
}: {
  value: string
  /** The accessible name, e.g. "Dose in mg". The value is appended. */
  label: string
  /** Read out after the value. */
  unit?: string
  active: boolean
  onOpen: () => void
  inputRef?: Ref<HTMLButtonElement>
  className?: string
  /**
   * A WORD for an empty field ("same", "optional"). Never a number: an empty
   * field is empty (feel pass §3).
   */
  placeholder?: string
  /** Rendered inside the field after the value (a unit, a pill). */
  suffix?: ReactNode
  align?: "left" | "right" | "center"
  invalid?: boolean
  disabled?: boolean
}) {
  return (
    <button
      ref={inputRef}
      type="button"
      onClick={onOpen}
      onKeyDown={(e) => padFieldKeyDown(e, onOpen, active)}
      disabled={disabled}
      aria-label={`${label}, ${value ? `${value}${unit ? ` ${unit}` : ""}` : "empty"}`}
      // A button cannot carry aria-invalid; the form's error text says it.
      data-invalid={invalid ? "true" : undefined}
      data-pad-active={active ? "true" : undefined}
      className={cn(
        PRESS.field,
        "pad-input flex min-w-0 items-center gap-2 overflow-hidden rounded-xl border border-border-default bg-bg-input px-3 font-mono text-base text-foreground outline-none transition-[border-color,box-shadow] duration-200 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
        align === "right"
          ? "justify-end text-right"
          : align === "center"
            ? "justify-center text-center"
            : "text-left",
        active && "border-text-primary ring-1 ring-text-primary",
        invalid && !active && "border-state-error",
        className,
      )}
    >
      {/* Never an ellipsis: a figure with a digit swapped for "…" is a wrong
          figure. The caret takes no width (`.pad-value`), so it sits in the
          padding instead of pushing the value out. */}
      <span className={cn("pad-value min-w-0 whitespace-nowrap", align === "left" && "flex-1")}>
        {value}
        {!value && placeholder && !active ? (
          <span className="font-sans text-sm text-text-subtle">{placeholder}</span>
        ) : null}
        {active ? <span aria-hidden className="pad-caret" /> : null}
      </span>
      {suffix}
    </button>
  )
}
