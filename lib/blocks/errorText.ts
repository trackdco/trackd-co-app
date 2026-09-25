/**
 * The words a Blocks write shows when it fails (consistency fix #29: one
 * shape, "Couldn’t <verb>. Try again.", and no exclamation marks).
 *
 * The block writes (`lib/db/blocks.ts`) answer in two kinds of sentence: a
 * specific reason the person can act on ("That block has already finished.",
 * the read-only line, "The end date is before the start date."), and a generic
 * "Could not close the block." when the database said no. The reason is shown
 * as it is. The generic one, or no answer at all, becomes the app's one line.
 * Pure.
 */
export function blockErrorText(error: string | null | undefined, verb: string): string {
  const said = error?.trim() ?? ""
  if (said === "" || /^could not\b/i.test(said) || /^couldn[’']t\b/i.test(said)) {
    return `Couldn’t ${verb}. Try again.`
  }
  return said
}
