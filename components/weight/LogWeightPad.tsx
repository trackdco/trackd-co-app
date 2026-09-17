"use client"

import { useState, useTransition, type RefObject } from "react"
import { useRouter } from "next/navigation"

import { NumberPad } from "@/components/feel/NumberPad"
import { AmberNotice, useAmberNotice } from "@/components/notifications/amber-notice"
import { logWeight } from "@/app/(app)/weight/actions"
import { toDateKey } from "@/lib/home/mockHomeData"
import { formatDateKeyNumeric } from "@/lib/calendar/calendar"
import { formatWeight, sanitizeWeightInput, unitToKg, type WeightUnit } from "@/lib/weight"

/**
 * LOG WEIGHT IS THE PAD AND NOTHING ELSE (feel pass §3, approved round 5).
 *
 * Tapping "Log weight" opens the number pad at once: no sheet, no date line.
 * The last weight is prefilled and SELECTED, so the first key replaces it and
 * Delete clears it. Done saves and confirms with the drop-down notice ("Weight
 * logged: 85.2 kg", amber outline, no icon). The hide chevron or a tap on the
 * scrim cancels without saving.
 *
 * The sheet this replaces (`components/home/AddWeightSheet.tsx`) also offered a
 * different date and progress photos. Both still live elsewhere: the Weight
 * screen logs and edits any day, and the Progress photo sheet takes photos with
 * a weight for its date.
 *
 * `dateKey` is for a caller logging a PAST day: the pad then names that date in
 * its label, because nothing else on screen says which day is being written.
 * `returnFocusRef` is where focus goes when the pad closes (the control that
 * opened it, or the nearest one that survives).
 */
export function LogWeightPad({
  open,
  onOpenChange,
  unit,
  lastKg,
  dateKey,
  returnFocusRef,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  unit: WeightUnit
  /** The most recent weigh-in, in kilograms, or null for none. */
  lastKg: number | null
  /** A day other than today to log for. */
  dateKey?: string
  returnFocusRef?: RefObject<HTMLElement | null>
}) {
  const router = useRouter()
  const [draft, setDraft] = useState("")
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    // Every open starts on the last weight, selected.
    if (open) setDraft(lastKg != null ? formatWeight(lastKg, unit) : "")
  }
  const [, startTransition] = useTransition()
  const confirm = useAmberNotice(2600)
  const warn = useAmberNotice(4000)

  const today = toDateKey(new Date())
  const pastDay = dateKey && dateKey !== today ? dateKey : null
  const label = pastDay ? `Weight for ${formatDateKeyNumeric(pastDay)}` : "Weight"

  function save() {
    const n = Number(draft)
    if (!draft || !Number.isFinite(n)) {
      warn.show("Enter your weight.")
      return
    }
    const kg = unitToKg(n, unit)
    if (kg < 30 || kg > 300) {
      warn.show(`Enter a weight between ${formatWeight(30, unit)} and ${formatWeight(300, unit)} ${unit}.`)
      return
    }
    onOpenChange(false)
    // The device's own date, asked now: the server's is UTC and can be a day out.
    const loggedFor = pastDay ?? toDateKey(new Date())
    // The saved value, formatted: the draft can end in "." ("85.").
    const shown = formatWeight(kg, unit)
    startTransition(async () => {
      // A rejected server action (offline, a deploy the open app has not picked
      // up) would otherwise reach the error boundary and replace the whole shell.
      try {
        const res = await logWeight(kg, loggedFor)
        if (!res.ok) {
          warn.show(res.error ?? "Couldn't save. Try again.")
          return
        }
        confirm.show(`Weight logged: ${shown} ${unit}`)
        router.refresh()
      } catch {
        warn.show("Couldn't save. Try again.")
      }
    })
  }

  return (
    <>
      <NumberPad
        active={open ? 0 : null}
        fields={[
          {
            id: "weight",
            label,
            unit,
            value: draft,
            onChange: setDraft,
            sanitize: sanitizeWeightInput,
          },
        ]}
        onActiveChange={() => {}}
        onClose={() => onOpenChange(false)}
        onDone={save}
        selectOnOpen
        label="Log weight"
        returnFocusRef={returnFocusRef}
      />
      <AmberNotice notice={confirm.notice} onDismiss={confirm.dismiss} icon={null} />
      <AmberNotice notice={warn.notice} onDismiss={warn.dismiss} />
    </>
  )
}
