/**
 * What the stack sheet's Save needs before it can save (sweep, ruling 10).
 *
 * Save is never disabled without the screen saying why. A stack needs at least
 * one compound; a blank name falls back to "Stack N" and never blocks. A
 * refused Save shakes the compounds and says this, under their heading, until
 * one is ticked. Pure: no React.
 *
 * `offerable`: how many compounds the sheet can tick. With none (every
 * compound is already in a stack, or there are none yet), the only way on is
 * the "Add a new compound" card under the list.
 */
export function stackSaveIssue(members: number, offerable: number): string | null {
  if (members > 0) return null
  return offerable > 0 ? "Tick a compound to save this stack." : "Add a compound to save this stack."
}
