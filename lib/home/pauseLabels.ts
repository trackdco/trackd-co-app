/**
 * The words on the Pause sheet's two main buttons (sweep, ruling 10).
 *
 * A button that cannot act says why on its own face, in place of its verb, the
 * way "Pick a date" already did: a disabled "Pause" or "Resume now" with
 * nothing ticked read as a broken control. Pure: no React.
 */

/** The resume button. `mates`: other paused members are listed with ticks. */
export function resumeButtonLabel(ticked: number, mates: boolean): string {
  if (mates && ticked === 0) return "Tick one to resume"
  return ticked > 1 ? `Resume ${ticked} now` : "Resume now"
}

/** The pause button. `targets`: how many ticked compounds it would pause. */
export function pauseButtonLabel(targets: number, awaitingDate: boolean): string {
  if (targets === 0) return "Tick one to pause"
  if (awaitingDate) return "Pick a date"
  return "Pause"
}
