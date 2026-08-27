/**
 * WHICH OF SEVERAL LIVE SUBSCRIPTIONS SURVIVES — pure, so the rule can be tested
 * without Stripe, and so both sides of a race can be proven to compute the same
 * answer.
 *
 * ## Why this is a function and not a `sort` inline
 *
 * The whole point of the rule is that two concurrent requests reach the SAME
 * verdict. If they do not, they cancel each other's subscription and the user is
 * left with none, having asked for one. That property is worth a test, and a
 * comparator buried in an action cannot have one.
 */

/** As much of a Stripe subscription as the rule reads. */
export interface DuplicateCandidate {
  id: string;
  /** Stripe's creation time, in whole seconds. Can tie. */
  created: number;
}

/**
 * OLDEST WINS, with the id breaking ties.
 *
 * ## Oldest, not newest
 *
 * An older subscription is the one more likely to have a card behind it, an
 * invoice against it, or a user part-way through a 3D Secure challenge for it.
 * Cancelling the thing furthest along is the expensive direction, and it is the
 * one that can take money before anybody notices.
 *
 * ## The id is not a tiebreaker of convenience
 *
 * `created` is second-resolution, and two subscriptions made by two concurrent
 * requests land in the same second essentially always — the race that produces
 * duplicates is measured in milliseconds. So the timestamp alone is NOT a total
 * order, and a comparator that returns 0 for a tie leaves the winner up to the
 * sort's stability and the order Stripe's list happened to return. Two racers
 * would then pick different winners and cancel each other.
 *
 * Stripe ids are stable, unique strings, so comparing them makes the order
 * total. It does not matter which of two same-second subscriptions wins; it
 * matters that everybody agrees.
 *
 * Does not mutate the input.
 */
export function survivorOf<T extends DuplicateCandidate>(
  subscriptions: readonly T[],
): { winner: T | null; losers: T[] } {
  if (subscriptions.length === 0) return { winner: null, losers: [] };

  const ordered = [...subscriptions].sort(
    (a, b) => a.created - b.created || compareIds(a.id, b.id),
  );
  const [winner, ...losers] = ordered;
  return { winner, losers };
}

/**
 * Byte order, not locale order.
 *
 * `localeCompare` is locale-dependent and can order the same two strings
 * differently on two machines — which for this rule means two servers in
 * different regions disagreeing about which subscription to cancel. `<` on
 * strings is code-unit comparison and is the same everywhere.
 */
function compareIds(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}
