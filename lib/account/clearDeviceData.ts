import { ONBOARDING_SESSION_KEY } from "@/lib/onboarding/session";

/**
 * ⚠️ REMOVE THIS USER'S DEVICE-LOCAL COPY, SO "COMPLETELY ERASED" IS TRUE.
 *
 * ## Why this exists
 *
 * The deletion screen tells somebody their compounds, doses, photos, bloodwork
 * and metrics "will be completely erased and unrecoverable". A cold review found
 * that the Privacy Policy said the opposite and was the ACCURATE one: §7
 * declared that "Deleting your account does not remove it either. Account
 * deletion happens on our servers and cannot reach your browser's storage."
 *
 * Two signed documents disagreeing, and the leaving user reading the one that
 * overstated. Adrian ruled to make the promise TRUE rather than trim it, so this
 * is the piece that reaches the browser, and Privacy §7 changes to match.
 *
 * The device copy is real health data — §7 names "the compounds in your
 * protocol, your schedules, the doses you have logged, one-off logs, custom
 * compounds you create, and your onboarding answers, which include your date of
 * birth and sex."
 *
 * ## ⚠️ IT MATCHES ON THE USER ID, NOT ON A LIST OF KEYS
 *
 * Every user-scoped store embeds the id in its key — twelve builders at the time
 * of writing (`trackd.stack.v2.<id>`, `trackd.doselog.v1.<id>`,
 * `trackd.oneoff.tombstones.v1.<id>`, `trackd.customCompounds.<id>` and so on).
 * A hardcoded list here would be a second list to keep in sync with those
 * builders, and the failure mode is silent: a store added later would simply
 * survive the deletion and nothing would report it. Matching the id catches
 * every present and future key by construction.
 *
 * ## ⚠️ AN EMPTY OR NON-UUID ID WOULD MATCH EVERY KEY IN THE STORE
 *
 * `"anything".includes("")` is TRUE, so an empty id would sweep the whole
 * origin, including a DIFFERENT signed-in account's cached data on a shared
 * device. That is the same class of defect as the storage sweep's empty prefix
 * listing a whole bucket, so it is refused the same way — by UUID, before a
 * single key is read.
 *
 * ## What it deliberately does NOT remove
 *
 * Device-wide preferences that carry no health data and may belong to somebody
 * else on a shared device: the calculator's syringe size, the week strip's open
 * state, the amber switch, the install hint. Deleting one person's account must
 * not reach into another person's settings, and §7 names none of these.
 *
 * ⚠️ `trackd.onboarding.v1` IS removed despite not being user-scoped, because it
 * holds the onboarding answers — **date of birth and sex** — which §7 names
 * explicitly as part of the on-device copy. It is a pre-account draft, so on a
 * shared device it belongs to whoever onboarded last, which at this moment is
 * the person leaving.
 *
 * ## It reaches ONE browser, and the policy says so
 *
 * A copy in another browser, or on another device they signed in on, is not
 * reachable from here by any means. Privacy §7 and §8 both say that plainly
 * rather than implying a completeness this cannot deliver.
 *
 * ## Never throws
 *
 * It runs on the success path, immediately before a redirect that ends the
 * session. Storage can be unavailable — Safari private mode, a browser set to
 * block site data — and an exception there must not turn a completed deletion
 * into a visible error. The server-side deletion has already happened and is
 * what the promise rests on; this is the last, best-effort mile.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Keys to remove that do NOT carry the user id. See the module comment. */
const UNSCOPED_KEYS = [ONBOARDING_SESSION_KEY] as const;

export function clearDeviceDataFor(userId: string): void {
  // ⚠️ BY ID ONLY. See the module comment: an empty id sweeps the whole origin.
  if (!UUID.test(userId)) return;
  if (typeof window === "undefined") return;

  try {
    const store = window.localStorage;

    // Collected BEFORE removing: mutating the store while indexing into it by
    // position re-numbers the remaining keys and silently skips every other one.
    const doomed: string[] = [];
    for (let i = 0; i < store.length; i += 1) {
      const key = store.key(i);
      if (!key) continue;
      if (key.includes(userId) || (UNSCOPED_KEYS as readonly string[]).includes(key)) {
        doomed.push(key);
      }
    }

    for (const key of doomed) store.removeItem(key);
  } catch {
    // Deliberately silent. See "Never throws" above.
  }
}
