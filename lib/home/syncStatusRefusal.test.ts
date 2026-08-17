import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * ⚠️ NO REFUSED WRITE RENDERS THE SYNCING NOTICE (05 §3.9, §5, Q85).
 *
 * This is the funnel, and it is the whole fix. Fifteen of the sixteen gated
 * writes are fire-and-forget pushes that land in `trackSync`, so what `trackSync`
 * does with a refusal is what every one of those surfaces shows.
 *
 * The defect it replaces: a lapsed user tapped to log a dose, the server refused,
 * and the app said **"Saved on your device. Still syncing to your account. We'll
 * keep trying."** Nothing was saved, nothing was syncing, nothing would be
 * retried, and it hid the one fact they needed.
 *
 * Three branches, and the discriminator has to survive to the surface:
 *
 *   read succeeded, no entitlement  ->  KNOWN lapsed      ->  the pop-up
 *   read FAILED                     ->  genuinely unknown ->  the syncing notice
 *   an ordinary failure             ->  unchanged         ->  the syncing notice
 *
 * ## Two things this test has to do to be worth anything
 *
 * **A `window`.** `syncStatus` is guarded by `typeof window === "undefined"` and
 * the suite runs in node, so without a stub every dispatch is a silent no-op and
 * all seven assertions would pass while measuring nothing.
 *
 * **A fresh module per test.** `notifySyncFailed` holds a 60-second module-level
 * cooldown, so the SECOND test to expect the syncing notice would be swallowed by
 * the first one's throttle and fail for a reason that has nothing to do with the
 * gate. `resetModules` gives each test its own counter.
 */

/** Counts for the run in progress. Reset with the module. */
let syncFailed = 0
let readOnly = 0

async function freshModule() {
  vi.resetModules()

  const target = new EventTarget()
  // A minimal window: `syncStatus` only ever dispatches and subscribes.
  vi.stubGlobal("window", target)

  const mod = await import("./syncStatus")
  syncFailed = 0
  readOnly = 0
  target.addEventListener(mod.SYNC_FAILED_EVENT, () => {
    syncFailed += 1
  })
  target.addEventListener(mod.READ_ONLY_REFUSED_EVENT, () => {
    readOnly += 1
  })
  return mod
}

beforeEach(() => {
  // `looksOnline()` reads `navigator`; undefined means "no reason to think we are
  // offline", which is the branch that actually notifies.
  vi.stubGlobal("navigator", undefined)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("a KNOWN read-only refusal", () => {
  it("opens the pop-up and NEVER renders the syncing notice", async () => {
    const { trackSync } = await freshModule()
    await trackSync(Promise.resolve({ ok: false, refusal: "read-only" as const }))
    expect(readOnly, "the read-only signal should have fired").toBe(1)
    expect(syncFailed, "the syncing notice must NOT fire for a lapsed account").toBe(0)
  })
})

describe("an UNKNOWN refusal — the entitlement read failed", () => {
  /**
   * The one branch where a retry is genuinely worth offering. We do not know the
   * user has lapsed, so claiming "You're not on a plan at the moment" would be a
   * claim the server cannot back.
   */
  it("keeps the syncing notice and does NOT claim read-only", async () => {
    const { trackSync } = await freshModule()
    await trackSync(Promise.resolve({ ok: false, refusal: "unknown" as const }))
    expect(syncFailed, "an unreadable entitlement IS worth retrying").toBe(1)
    expect(readOnly, "we must not assert a lapse we could not verify").toBe(0)
  })
})

describe("CONTROL: everything else behaves exactly as it did", () => {
  it("an ordinary failure still shows the syncing notice", async () => {
    const { trackSync } = await freshModule()
    await trackSync(Promise.resolve({ ok: false }))
    expect(syncFailed).toBe(1)
    expect(readOnly).toBe(0)
  })

  it("a success shows nothing", async () => {
    const { trackSync } = await freshModule()
    await trackSync(Promise.resolve({ ok: true }))
    expect(syncFailed).toBe(0)
    expect(readOnly).toBe(0)
  })

  it("a skip is a no-op, not a failure", async () => {
    const { trackSync } = await freshModule()
    await trackSync(Promise.resolve({ ok: false, skipped: true }))
    expect(syncFailed).toBe(0)
    expect(readOnly).toBe(0)
  })

  it("a thrown push still shows the syncing notice", async () => {
    const { trackSync } = await freshModule()
    await trackSync(Promise.reject(new Error("network")))
    expect(syncFailed).toBe(1)
    expect(readOnly).toBe(0)
  })

  /**
   * ⚠️ The read-only signal is deliberately NOT throttled. The syncing notice is
   * throttled because it nags about a transient condition; this one answers an
   * action the user just took, and swallowing the second tap would leave a
   * control doing visibly nothing.
   */
  it("a second read-only refusal fires again, unlike the syncing notice", async () => {
    const { trackSync } = await freshModule()
    await trackSync(Promise.resolve({ ok: false, refusal: "read-only" as const }))
    await trackSync(Promise.resolve({ ok: false, refusal: "read-only" as const }))
    expect(readOnly).toBe(2)
    expect(syncFailed).toBe(0)
  })

  /** And the throttle the syncing notice DOES have is still there. */
  it("the syncing notice is still throttled to one per window", async () => {
    const { trackSync } = await freshModule()
    await trackSync(Promise.resolve({ ok: false }))
    await trackSync(Promise.resolve({ ok: false }))
    expect(syncFailed).toBe(1)
  })
})
