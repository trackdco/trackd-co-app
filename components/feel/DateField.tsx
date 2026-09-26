"use client"

import { useId, useImperativeHandle, useRef, useState, type Ref } from "react"

import { DatePickerPanel } from "@/components/calendar/DatePickerPanel"
import { PopDialog } from "@/components/feel/PopDialog"
import { SolidIcon } from "@/components/feel/SolidIcon"
import { useFitText } from "@/components/feel/useFitText"
import { dateFieldText, dayBounds, isDateKey, isDayOutside, monthOfKey } from "@/lib/calendar/calendar"
import { toDateKey } from "@/lib/home/mockHomeData"
import { CARD_EYEBROW, PRESS } from "@/lib/ui-presets"
import { cn } from "@/lib/utils"

/** What a caller can do to the field from outside (`ref`). */
export interface DateFieldHandle {
  /** Opens the calendar, as a tap would (a Save that is missing this date). */
  open: () => void
  /** Moves focus to the field. */
  focus: () => void
}

export interface DateFieldProps {
  /** The day, "YYYY-MM-DD", or "" when none is chosen. */
  value: string
  /** A picked day's key; "" only from Clear (`clearable`). */
  onChange: (key: string) => void
  /** The first day that can be picked, inclusive. Omitted: no limit. */
  min?: string | null
  /** The last day that can be picked, inclusive. Omitted: NO limit (unlike the
   *  bare calendar). For a day that has happened (a blood draw, a journal
   *  entry, a start), pass today's key. */
  max?: string | null
  /** What the date is, in a few words ("Start date"). The field's accessible
   *  name (its value is read after it) and the calendar's heading. */
  label: string
  /** Words shown while empty. */
  placeholder?: string
  disabled?: boolean
  /** On the button, so a `<label htmlFor>` points at it. */
  id?: string
  "aria-labelledby"?: string
  "aria-describedby"?: string
  /** Draws the field as wrong. A value outside min / max is drawn so anyway. */
  invalid?: boolean
  /** The calendar offers "Clear", for a date that is optional. */
  clearable?: boolean
  /** Today, when the caller has it; otherwise read from the device on open. */
  todayKey?: string
  /** Mirrors the value into a hidden input, for a form that posts. */
  name?: string
  /** On the button: a height or a type size to match the fields beside it. */
  className?: string
  ref?: Ref<DateFieldHandle>
}

/**
 * THE DATE FIELD: the one way to ask for a date, app-wide (W32, Adrian
 * 2026-09-26: date fields ran off the screen edge in cycles, blocks and bloods;
 * "use one built-in calendar for every date field").
 *
 * It stands where `<input type="date">` stood. iOS draws that as a native box
 * sized by the locale's longest date string, which overran its column, and
 * opens a wheel that is not the app's. This is a button the width of its
 * container, never wider (`min-w-0`, `max-w-full`, and a date too long for a
 * narrow column steps its type down rather than being cut), showing the day in
 * the app's format ("Tue 3 Sep", with the year when it is not this year), and
 * it opens the app's own month calendar (`DatePickerPanel`, the one Home's
 * journal uses, which Adrian chose) in the app's pop-up (`PopDialog`: scales
 * in from 16px below, leaves the way it came, renders inside the sheet around
 * it). Picking a day pops it, holds a beat, closes, and the new date rises
 * into the field, only when it changed.
 *
 * ## Props
 *
 * - `value` ("YYYY-MM-DD" or "") and `onChange(key)`: controlled. `onChange`
 *   only ever hands back a real day, or "" from Clear.
 * - `min`, `max`: inclusive; either may be left out, and out means open.
 *   Unlike the bare calendar, `max` does NOT default to today: pass `todayKey`
 *   for a day that has already happened.
 * - `label`: the accessible name and the calendar's heading. Required.
 * - `placeholder`: the words while empty ("Pick a date").
 * - `disabled`, `id`, `aria-labelledby`, `aria-describedby`, `name`
 *   (a hidden input for a posting form), `className` (on the button).
 * - `invalid`: draws the edge red. A value outside `min` / `max` (an end left
 *   before a start that moved) is drawn so without being asked.
 * - `clearable`: the calendar's footer offers Clear, which hands back "".
 * - `todayKey`: pass it when the screen has one; otherwise the device's today
 *   is read when the calendar opens (never the server's, which is UTC).
 * - `ref`: `{ open(), focus() }`. A Save that is missing this date should say
 *   so and can open the calendar (W47: Save is never dead without a reason).
 *
 * Wrapped in a `<label>` with a `FIELD_LABEL` span, as the inputs it replaces
 * were, a tap on the words opens it too.
 *
 * Keyboard: Enter or Space opens it; focus lands on the chosen day (or today);
 * the arrows move a day or a week, Page Up / Down a month; Enter picks; Escape
 * closes and focus returns to the field. The month's title opens a
 * month-and-year view for a date far away.
 */
export function DateField({
  value,
  onChange,
  min,
  max,
  label,
  placeholder = "Pick a date",
  disabled = false,
  id,
  "aria-labelledby": labelledBy,
  "aria-describedby": describedBy,
  invalid,
  clearable = false,
  todayKey,
  name,
  className,
  ref,
}: DateFieldProps) {
  const [open, setOpen] = useState(false)
  /** The device's today, read on open when the caller did not pass one. */
  const [deviceToday, setDeviceToday] = useState<string | null>(null)
  /** Only for the year in the field's words, before the calendar has ever
   *  opened. Read once on the device; the server's clock is not the user's. */
  const [yearNow] = useState(() => new Date().getFullYear())
  const buttonRef = useRef<HTMLButtonElement>(null)
  /** Whether the day just picked was a different one: the value only rises
   *  when something actually changed. */
  const changed = useRef(false)
  const valueId = useId()

  const today = todayKey ?? deviceToday ?? ""
  const thisYear = isDateKey(today) ? monthOfKey(today).year : yearNow
  const text = dateFieldText(value, thisYear)
  /** The value's own span: fitted to the field, and where the new date rises. */
  const valueRef = useFitText<HTMLSpanElement>(text)
  const outside = isDateKey(value) && isDayOutside(value, dayBounds(min, max))
  const wrong = invalid ?? outside

  function openCalendar() {
    if (disabled) return
    if (!todayKey) setDeviceToday(toDateKey(new Date()))
    changed.current = false
    setOpen(true)
  }

  useImperativeHandle(
    ref,
    () => ({
      open: openCalendar,
      focus: () => buttonRef.current?.focus(),
    }),
  )

  function pick(key: string) {
    changed.current = key !== value
    onChange(key)
  }

  /** The calendar has had its beat: close, and let the new date arrive in the
   *  field. Restarted by class, not by `key` (see globals.css). */
  function settle() {
    setOpen(false)
    const el = valueRef.current
    if (!el || !changed.current) return
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
    el.classList.remove("animate-date-value")
    void el.offsetWidth
    el.classList.add("animate-date-value")
  }

  function clear() {
    changed.current = false
    onChange("")
    setOpen(false)
  }

  return (
    <>
      <button
        ref={buttonRef}
        id={id}
        type="button"
        disabled={disabled}
        onClick={openCalendar}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={labelledBy ? undefined : `${label}, ${text || "not set"}`}
        aria-labelledby={labelledBy ? `${labelledBy} ${valueId}` : undefined}
        aria-describedby={describedBy}
        // A button cannot carry aria-invalid; the form's own words say what is wrong.
        data-invalid={wrong ? "true" : undefined}
        className={cn(
          PRESS.field,
          "inset-focus flex h-11 w-full min-w-0 max-w-full items-center gap-2 overflow-hidden rounded-xl border border-border-default bg-bg-input px-3 text-left outline-none transition-[border-color,box-shadow] duration-200 disabled:opacity-50",
          wrong && "border-state-error",
          className,
        )}
      >
        <span className="relative min-w-0 flex-1">
          <span
            ref={valueRef}
            id={valueId}
            suppressHydrationWarning
            className="block min-w-0 whitespace-nowrap font-mono text-base text-foreground"
          >
            {text}
            {!text ? <span className="font-sans text-sm text-text-muted">{placeholder}</span> : null}
          </span>
        </span>
        <SolidIcon name="date" size={16} tone="off" className="shrink-0" />
      </button>
      {name ? <input type="hidden" name={name} value={isDateKey(value) ? value : ""} /> : null}

      <PopDialog open={open} onClose={() => setOpen(false)} title={<span className={CARD_EYEBROW}>{label}</span>}>
        <DatePickerPanel
          className="mt-3"
          value={isDateKey(value) ? value : ""}
          todayKey={today}
          active={open}
          min={min ?? null}
          max={max ?? null}
          monthJump
          autoFocus
          onPick={pick}
          onSettled={settle}
          secondaryAction={clearable ? { label: "Clear", onClick: clear, disabled: !value } : undefined}
        />
      </PopDialog>
    </>
  )
}
