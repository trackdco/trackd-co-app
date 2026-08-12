import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createWriteCoalescer } from "@/lib/home/writeCoalescer"

const landed = { ok: true }
const skipped = { ok: true, skipped: true }
const failed = { ok: false }

/** Let every queued microtask run, so settled promises reach their handlers. */
const flush = () => Promise.resolve().then(() => Promise.resolve())

describe("createWriteCoalescer", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it("fires ONCE for a burst, not once per write", async () => {
    const notify = vi.fn()
    const c = createWriteCoalescer(notify)
    // A stack tick registers every write synchronously, before any can resolve —
    // which is exactly why counting beats a timer.
    for (let i = 0; i < 5; i++) c.track(Promise.resolve(landed))
    expect(c.pending()).toBe(5)
    await flush()
    expect(notify).toHaveBeenCalledTimes(1)
    expect(c.pending()).toBe(0)
  })

  it("does not fire early when writes resolve at different times", async () => {
    const notify = vi.fn()
    const c = createWriteCoalescer(notify)
    let releaseSlow: (v: typeof landed) => void = () => {}
    const slow = new Promise<typeof landed>((r) => (releaseSlow = r))
    c.track(Promise.resolve(landed))
    c.track(slow)

    await flush()
    expect(notify).not.toHaveBeenCalled() // one still outstanding
    releaseSlow(landed)
    await flush()
    expect(notify).toHaveBeenCalledTimes(1)
  })

  it("stays silent when nothing landed — offline must not trigger a read", async () => {
    const notify = vi.fn()
    const c = createWriteCoalescer(notify)
    c.track(Promise.resolve(failed))
    c.track(Promise.reject(new Error("network")))
    await flush()
    expect(notify).not.toHaveBeenCalled()
    expect(c.pending()).toBe(0)
  })

  it("stays silent when every write was a no-op skip", async () => {
    // A custom compound has no Postgres row, so there is nothing new to read.
    const notify = vi.fn()
    const c = createWriteCoalescer(notify)
    c.track(Promise.resolve(skipped))
    await flush()
    expect(notify).not.toHaveBeenCalled()
  })

  it("fires when only SOME of the burst landed", async () => {
    const notify = vi.fn()
    const c = createWriteCoalescer(notify)
    c.track(Promise.resolve(failed))
    c.track(Promise.resolve(landed))
    c.track(Promise.reject(new Error("network")))
    await flush()
    expect(notify).toHaveBeenCalledTimes(1)
  })

  it("does not leak the count on a REJECTED write", async () => {
    // A rejection with only a success handler would pin the count above zero and
    // disarm the signal for the rest of the session.
    const notify = vi.fn()
    const c = createWriteCoalescer(notify)
    c.track(Promise.reject(new Error("boom")))
    await flush()
    expect(c.pending()).toBe(0)
    c.track(Promise.resolve(landed))
    await flush()
    expect(notify).toHaveBeenCalledTimes(1)
  })

  it("recovers from a write that never settles, via the watchdog", async () => {
    const notify = vi.fn()
    const c = createWriteCoalescer(notify, 30_000)
    c.track(new Promise<typeof landed>(() => {})) // never resolves
    c.track(Promise.resolve(landed))
    await flush()
    // Still held by the stalled write.
    expect(notify).not.toHaveBeenCalled()
    expect(c.pending()).toBe(1)

    vi.advanceTimersByTime(30_000)
    await flush()
    expect(c.pending()).toBe(0)
    expect(notify).toHaveBeenCalledTimes(1) // the one that DID land

    // ...and the coalescer still works afterwards, which is the whole point.
    c.track(Promise.resolve(landed))
    await flush()
    expect(notify).toHaveBeenCalledTimes(2)
  })

  it("never double-counts when the watchdog and the promise race", async () => {
    const notify = vi.fn()
    const c = createWriteCoalescer(notify, 1_000)
    c.track(Promise.resolve(landed))
    await flush()
    expect(c.pending()).toBe(0)
    // The watchdog for that write must not decrement a second time.
    vi.advanceTimersByTime(5_000)
    await flush()
    expect(c.pending()).toBe(0)
    expect(notify).toHaveBeenCalledTimes(1)
  })

  it("keeps consecutive bursts independent", async () => {
    const notify = vi.fn()
    const c = createWriteCoalescer(notify)

    c.track(Promise.resolve(landed))
    await flush()
    expect(notify).toHaveBeenCalledTimes(1)

    // The landed flag must have been cleared, or a burst where nothing lands
    // would inherit the previous one's success and fire anyway.
    c.track(Promise.resolve(failed))
    await flush()
    expect(notify).toHaveBeenCalledTimes(1)
  })

  it("counts a log and an un-log in flight together as one burst", async () => {
    const notify = vi.fn()
    const c = createWriteCoalescer(notify)
    c.track(Promise.resolve(landed)) // a log
    c.track(Promise.resolve(landed)) // an un-log racing it
    await flush()
    expect(notify).toHaveBeenCalledTimes(1)
  })

  it("keeps separate coalescers isolated", async () => {
    const a = vi.fn()
    const b = vi.fn()
    const ca = createWriteCoalescer(a)
    const cb = createWriteCoalescer(b)
    ca.track(Promise.resolve(landed))
    cb.track(new Promise<typeof landed>(() => {}))
    await flush()
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).not.toHaveBeenCalled()
  })
})
