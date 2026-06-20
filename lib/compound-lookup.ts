/**
 * Catalogue membership check, client-safe (reads the bundled, generated
 * `lib/compounds-catalogue.ts`). Used to tell a real catalogue compound from a
 * user-made "custom" one without a network round-trip.
 *
 * WHY it matters: since the Protocol Cutover, **Postgres `protocol_compounds` is the
 * canonical store for catalogue compounds**; the `user_stack_compounds` jsonb mirror
 * is now only a backup for device-local CUSTOM compounds. Knowing which a name is
 * lets the hydrator refuse to resurrect a catalogue compound from the stale mirror
 * (the reinstall "deleted compounds came back" bug) and lets the stores mirror only
 * customs.
 */
import { COMPOUNDS } from "@/lib/compounds-catalogue"

const CATALOGUE_NAMES: ReadonlySet<string> = new Set(
  COMPOUNDS.map((c) => c.name.trim().toLowerCase())
)

/** True when `name` matches a bundled catalogue compound (case/space-insensitive). */
export function isCatalogueName(name: string): boolean {
  return CATALOGUE_NAMES.has(name.trim().toLowerCase())
}

/** True for a user-made "custom" compound — i.e. NOT in the catalogue. */
export function isCustomName(name: string): boolean {
  return !isCatalogueName(name)
}
