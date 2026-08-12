import "server-only";

import { cache } from "react";

import { hasProAccess } from "./entitlements";

/**
 * ⚠️ THE READ-ONLY GATE. Whether a lapsed account may still WRITE.
 *
 * ## What "read-only" means, exactly (Adrian, 2026-08-13)
 *
 * A lapsed trial or subscription does NOT lock anybody out. They can open every
 * screen, read every dose, every photo, every reading, every block, all of their
 * history. **Nothing is hidden and nothing is deleted.** What stops is adding to
 * it: logging a dose, adding a compound, recording a weight, writing a journal
 * entry, uploading a photo, editing the protocol.
 *
 * That distinction is not softness. This is health data somebody entered about
 * their own body, and withholding it to apply commercial pressure is the one
 * thing this product must never do.
 *
 * ## Deleting is still allowed, deliberately
 *
 * Adrian's list is creates and edits. A user must always be able to remove their
 * own data — that is a data-rights matter rather than a feature — and refusing
 * to let somebody delete a dose they mis-logged serves no commercial purpose
 * whatsoever. The gate covers what ADDS.
 *
 * ## ⚠️ IT IS OFF UNLESS `BILLING_GATE_ENABLED` IS SET, AND THAT IS LOAD-BEARING
 *
 * Today there are ~90 real accounts on production and **not one of them has an
 * `entitlements` row**, because nothing has ever billed. Switching this on
 * before those rows exist would put every single real user into read-only
 * overnight, having promised them nothing of the kind.
 *
 * So it is an explicit switch, defaulting to OFF, and the go-live order is:
 *
 *   1. Stripe off sandbox, live keys and prices in Vercel.
 *   2. Run the beta backfill: `comp` for the comp list, 14 days for everybody
 *      else (see `lib/billing/betaGrace.ts`).
 *   3. Verify the rows exist.
 *   4. THEN set `BILLING_GATE_ENABLED=true`.
 *
 * Merging this branch changes nothing until step 4. That is the point: a gate
 * that goes live as a side effect of a deploy is a gate that goes live at the
 * wrong moment.
 *
 * **The same switch decides `NO_ENTITLEMENT_LABEL`**, which is why it is here
 * and not inline. Off, an account with no entitlement genuinely has the whole
 * product and the screen says "Pro". On, it does not, and a screen still saying
 * "Pro" to a locked-out user would be the app lying at the worst moment.
 */
export function billingGateEnabled(): boolean {
  return process.env.BILLING_GATE_ENABLED === "true";
}

/**
 * May the signed-in user write?
 *
 * Request-`cache()`d, so the layout asking and three actions asking cost one
 * entitlement read between them. `hasProAccess` is itself cached, so this is
 * belt and braces on a query that is already free.
 *
 * FAILS CLOSED via `hasProAccess`, which returns false when the entitlements
 * read errors: a database that will not answer is not permission to write.
 * FAILS OPEN on the switch, which is the opposite direction and correct for the
 * same reason — an unset environment variable must not lock out a paying user.
 */
export const canWriteData = cache(async (): Promise<boolean> => {
  if (!billingGateEnabled()) return true;
  return hasProAccess();
});

/**
 * What a refused write says. One string, so every surface refuses in the same
 * words and a future session cannot invent a second phrasing.
 *
 * ## It does NOT say "your subscription has ended"
 *
 * That was the first draft and it is false for most of the people who will read
 * it. The ~90 beta accounts reach read-only when their fourteen-day grace runs
 * out, and **they never had a subscription** — telling them one of theirs ended
 * is the app describing a transaction that never happened, in the message
 * explaining why they cannot log a dose.
 *
 * "Trackd is read only until you subscribe" is true for a lapsed subscriber, a
 * lapsed trial and a lapsed beta account alike, and it is the same sentence the
 * pop-up leads with, so the two surfaces cannot describe the same state
 * differently.
 *
 * The reassurance comes second and it is the true one. It names the state and
 * not the remedy: the remedy is the pop-up, which has the real prices on it, and
 * a server action's error string is the fallback for paths the pop-up does not
 * cover. It should not try to sell anything.
 */
export const READ_ONLY_MESSAGE =
  "Trackd is read only until you subscribe. Everything you've logged is still here.";

/**
 * The guard a server action calls.
 *
 * Returns a discriminated result rather than throwing, because these actions are
 * called from `useTransition` callbacks whose error handling is a `try/catch`
 * that a thrown Next control-flow signal would swallow. The same reasoning as
 * `openBillingPortal` returning a URL instead of redirecting.
 */
export async function requireWriteAccess(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  return (await canWriteData())
    ? { ok: true }
    : { ok: false, error: READ_ONLY_MESSAGE };
}

/**
 * ⚠️ WHAT IS COVERED, AND WHAT IS NOT. Read this before assuming.
 *
 * Adrian's instruction was to cover the logging paths properly and DOCUMENT the
 * rest rather than half-wire it. This is the rest.
 *
 * ## Two layers, and only one of them is enforcement
 *
 * The CLIENT layer (`components/billing/ReadOnlyGate.tsx`) is what a user meets:
 * it stops the action before a sheet opens and shows the pop-up with the real
 * prices. It is a UX affordance and it is not a security boundary.
 *
 * The SERVER layer is the rule. Every function below calls `requireWriteAccess`
 * or `canWriteData` and refuses regardless of what the browser thinks:
 *
 *   app/(app)/weight/actions.ts    logWeight
 *   app/(app)/progress/actions.ts  addBloodworkPhoto, saveJournalEntry,
 *                                  createCustomMarker, addProgressPhoto,
 *                                  addProgressPhotos
 *   app/(app)/blocks/actions.ts    startBlockAction, saveReflectionAction
 *   lib/db/inventory.ts            addStockItem, updateStockItem
 *   lib/db/oneOffLogs.ts           upsertOneOffLog
 *   lib/home/syncActions.ts        pushDoseLog
 *   lib/home/protocolSync.ts       pushProtocolDoseLog
 *
 * ## Deliberately NOT gated, with the reason
 *
 * **Every delete.** `deleteWeight`, `deleteJournalEntry`, `deleteProgressPhoto`,
 * `deleteBloodworkPhoto`, `deleteDoseLog`, `deleteProtocolDoseLog`,
 * `deleteOneOffLog`, `removeCustomMarker`, `setStockArchived`,
 * `archiveProtocolCompound`, `deleteBlockAction`, `closeBlockAction`. Removing
 * data you put in is yours to do, and refusing it serves no commercial purpose.
 *
 * **The profile.** `updatePhysical`, `setAvatarPath`, `clearAvatar`,
 * `saveTimezone`, `saveReminderPrefs`, push subscriptions. These are settings,
 * not the product. A read-only user must still be able to fix their timezone,
 * turn off notifications about a subscription they no longer have, and sign out.
 *
 * **The protocol PLAN writes** — `pushProtocolCompound`, `pushStackCompound`,
 * `pushScheduleVersions`, `pushStacks`, `pushCustom`, the pause pushes. Client
 * guarded (Protocol's "add compound", the add-stock entry) but NOT server
 * guarded, and that is a judgement rather than an oversight: those functions are
 * shared with `hydrateProtocol` and `migrateDeviceState`, which REPLAY data the
 * user already owns. Refusing them would break a returning subscriber's
 * device-to-cloud repair rather than stop a new write.
 *
 * The dose pushes are gated even though `repushDoseLogs` shares them, because
 * that path is genuinely safe to refuse: it reads `localStorage` fresh on every
 * reconnect and upserts on a deterministic id, so a refused dose stays on the
 * device and syncs the moment the account is entitled again. Nothing is lost.
 * The protocol pushes have no equivalent guarantee, which is the difference.
 *
 * **Anything a future session adds.** A new write action is not gated by
 * default. There is no interceptor and no route middleware doing this; it is an
 * explicit call in each function, which is legible but is not automatic.
 */
