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
 * ⚠️ MAY THE PRODUCT PROMISE A REMINDER BEFORE A COURTESY CHARGE?
 *
 * Spec `04` §0 makes `04` and `07-notifications.md` a ship-together pair, and per
 * the amended D1 the release condition is a reminder VERIFIABLY FIRING before a
 * courtesy charge on a Stripe test clock. That observation is made the Monday
 * before launch. If it fails, `04` still ships, with two strings withheld —
 * which is Adrian's amendment of 2026-08-16 and NOT what `04` §0 says as written.
 * See `lib/billing/reminderPromise.ts`, which records the divergence in full.
 *
 * So this is a switch rather than an edit: the withhold is built now and flipped
 * later, which makes the Monday outcome a config change instead of a Wednesday
 * code change against a launch deadline.
 *
 * **Same shape as `BILLING_GATE_ENABLED` deliberately** — an explicit `"true"`,
 * read server-side, defaulting OFF — so there is one idiom for "a launch switch"
 * in this codebase rather than two that have to be remembered separately.
 *
 * ⚠️ **UNSET WITHHOLDS THE PROMISE, and the direction is the whole point.**
 * Forgetting to set it costs a promise that could have been made. Defaulting it
 * on would make a promise the product does not keep, to somebody who is about to
 * be charged. See `lib/billing/reminderPromise.ts`, which owns both strings and
 * derives them from this one answer so neither can ship without the other.
 */
export function reminderPromiseEnabled(): boolean {
  return process.env.REMINDER_PROMISE_ENABLED === "true";
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
 * ⚠️ WHAT IS COVERED, AND WHAT IS NOT.
 *
 * ## This list is CHECKED, not remembered
 *
 * The first version was written by hand and a cold review found it wrong IN BOTH
 * DIRECTIONS — seven functions documented as ungated were gated, four gated ones
 * appeared in neither list, and a whole paragraph explaining why the protocol
 * pushes were left open described the opposite of what the code did.
 *
 * `scripts/gate-audit.mjs` regenerates it by PARSING each function body rather
 * than grepping the file. Re-run it after touching any of these modules. A doc
 * that quietly goes stale about which writes are enforced is worse than no doc at
 * all, and this one already had been.
 *
 * It lived in `scratchpad/`, which `.gitignore` excludes — so the script this
 * paragraph rests its credibility on was on one machine and in nobody's clone. A
 * cold review pointed that out. It is tracked now.
 *
 * ## Two layers, and only one of them is enforcement
 *
 * The CLIENT layer (`components/billing/ReadOnlyGate.tsx`) is what a user meets:
 * it stops the action before a sheet opens and shows the pop-up with the real
 * prices. It is a UX affordance and it is not a security boundary.
 *
 * The SERVER layer is the rule, and it sits on the WRITE ITSELF rather than on a
 * wrapper. Every export of a `"use server"` module is a dispatchable action with
 * its own id, so gating `startBlockAction` while leaving `startBlock` open is a
 * lock on a door beside an open window. A cold review drove exactly that.
 *
 * ## GATED — 32 functions (8 route actions + 24 in the data layer)
 *
 *   app/(app)/blocks/actions.ts    startBlockAction, saveReflectionAction
 *   app/(app)/progress/actions.ts  addBloodworkPhoto, saveJournalEntry,
 *                                  createCustomMarker, addProgressPhoto,
 *                                  addProgressPhotos
 *   app/(app)/weight/actions.ts    logWeight
 *   lib/db/blocks.ts               startBlock, saveReflection
 *   lib/db/compoundPauses.ts       upsertPause, endPause, endPauseGroup
 *   lib/db/cycles.ts               ensureActiveCycle, updateCycle
 *   lib/db/doseLogs.ts             upsertDoseLog, upsertDoseLogs
 *   lib/db/inventory.ts            addStockItem, updateStockItem
 *   lib/db/oneOffLogs.ts           upsertOneOffLog
 *   lib/db/protocolCompounds.ts    upsertProtocolCompound,
 *                                  upsertProtocolCompounds
 *   lib/home/protocolSync.ts       pushProtocolCompound, pushProtocolBatch,
 *                                  pushCompoundPause, pushPauseEnd,
 *                                  pushPauseGroupEnd, pushProtocolDoseLog
 *   lib/home/stackSync.ts          pushStacks
 *   lib/home/syncActions.ts        pushStackCompound, pushDoseLog, pushCustom
 *
 * Sixteen of them return a bare `Ok`, so they carry `readOnly: true` on the
 * refusal. Without it the UI cannot tell the gate from a dropped connection, and
 * a cold review watched `AddStockSheet` tell a lapsed user to check their
 * connection and try again. ⚠️ Only `AddStockSheet` actually READS that flag;
 * `trackSync` does not, so every other refusal still shows the generic
 * "still syncing, we'll keep trying" notice for a write that will never be
 * retried. Known, and not fixed here.
 *
 * ## CONDITIONALLY GATED — 2, and in both cases the condition is the whole point
 *
 *   lib/db/protocolCompounds.ts    setProtocolCompoundActive (`is_active = true`
 *                                  only — the re-add. The DELETE direction is
 *                                  open.)
 *   lib/home/protocolSync.ts       pushScheduleVersions (a trail ending in a
 *                                  `stopped` version is the second half of a
 *                                  DELETE, and goes through. Adds and edits are
 *                                  gated.)
 *
 * One function serves both directions in each case, so gating the function gated
 * the delete. That contradicted the rule below and it would have failed SILENTLY:
 * the compound disappears from the app on the device's own copy, `is_active`
 * stays true in Postgres, and the reminder engine goes on announcing it as due. A
 * real account ran in exactly that state for thirteen days for an unrelated
 * reason (the write was fire-and-forget and simply never landed), which is what
 * `lib/notifications/reminders.ts`'s `stopped` gate now catches. Switching
 * `BILLING_GATE_ENABLED` on with the function-level gates in place would have
 * reproduced it deliberately, for every lapsed account at once — and worse for
 * the versions half, since the `stopped` row is what that new gate READS.
 *
 * `scripts/gate-audit.mjs` reports this bucket separately for the same reason it
 * exists at all: "gated" would be true of half the calls and misleading about the
 * other half.
 *
 * ## NOT GATED, and why
 *
 * **Every delete, and everything that winds something down.** `deleteWeight`,
 * `deleteJournalEntry`, `deleteProgressPhoto`, `deleteBloodworkPhoto`,
 * `deleteDoseLog`, `deleteProtocolDoseLog`, `deleteOneOffLog`,
 * `removeCustomMarker`, `deletePause`, `pushPauseDelete`, `deleteStockItem`,
 * `setStockArchived`, `archiveProtocolCompound`, `deleteCustom`,
 * `deleteBlock(Action)`, `extendBlock(Action)`, `closeBlock(Action)`.
 *
 * Removing data you put in is yours to do. A cold review found the version that
 * gated `closeBlockAction` while leaving `deleteBlockAction` open, so the app
 * REFUSED the non-destructive action and PERMITTED the destructive one, leaving
 * a lapsed user with a block that said "running" forever.
 *
 * **Every read.** All `list*`, `pull*`, `get*`, `resolve*`. The core promise is
 * that nothing is hidden.
 *
 * **The profile and its settings.** `updatePhysical`, `setAvatarPath`,
 * `clearAvatar`, `saveTimezone`, `saveReminderPrefs`, `savePushSubscription`,
 * `removePushSubscription`, `releaseDeviceSubscription`,
 * `refreshDeviceSubscription`, `sendMyRemindersNow`, `sendTestNotification`. A
 * read-only user must still be able to fix their timezone and turn off
 * notifications about a subscription they no longer have.
 *
 * **`submitBetaFeedback`.** Blocking a lapsed user from telling us why they left
 * would be actively stupid.
 *
 * **`markMigratedInCloud`.** A flag, not user data.
 *
 * ## The one that changed its mind, and why
 *
 * `pushProtocolBatch` IS gated, reversing an earlier note here. It is the
 * migration path, and the argument for leaving it open was that
 * `migrateDeviceState` replays data the user already owns. That does not
 * survive contact: it writes compounds AND dose logs, and the migration only
 * ever runs on a first session, when the user is inside a trial or the beta
 * grace and therefore entitled. A lapsed user's migration ran months ago.
 *
 * ## Anything a future session adds is NOT gated by default
 *
 * There is no interceptor and no middleware doing this. It is an explicit call
 * in each function, which is legible and is not automatic.
 */
