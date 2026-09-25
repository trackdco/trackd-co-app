/**
 * The Details card's saved values, as the form `updatePhysical` reads them.
 *
 * The toast after a Profile save ("Saved", build-brief-final §3.16) offers
 * Undo, and Undo is the SAME action run again with what was saved before: no
 * second write path. This turns the card's previous values back into that
 * form.
 *
 * Height is stored in centimetres and posted in the user's units. The card
 * shows inches to one decimal, and posting that rounded figure back would move
 * a metric-entered height by up to 0.1 cm, so an imperial height is posted at
 * full precision: `updatePhysical` multiplies it back and rounds to the
 * column's one decimal, landing on the stored value exactly.
 *
 * Null when the previous values cannot be saved as they were: the action
 * refuses an unset sex and an unknown units value, so an Undo there would only
 * fail. Pure.
 */
export interface PhysicalValues {
  displayName: string | null
  sex: string | null
  goal: string | null
  unitsPreference: string
  heightCm: number | null
}

const CM_PER_IN = 2.54

export function physicalUndoForm(before: PhysicalValues): Record<string, string> | null {
  if (before.sex !== "male" && before.sex !== "female") return null
  if (before.unitsPreference !== "metric" && before.unitsPreference !== "imperial") return null
  const imperial = before.unitsPreference === "imperial"
  const height =
    before.heightCm == null || !Number.isFinite(before.heightCm)
      ? ""
      : String(imperial ? before.heightCm / CM_PER_IN : before.heightCm)
  return {
    display_name: before.displayName ?? "",
    sex: before.sex,
    goal: before.goal ?? "",
    units_preference: before.unitsPreference,
    height,
  }
}
