/**
 * The Restart / End sync race (cold review F2), end to end through the real
 * hydration merge, with the Delete-for-good remap (S1) beside it.
 *
 * What happened: the compound row and its schedule versions were two server
 * actions, and Next runs a page's server actions one at a time. A reload in the
 * seconds between them landed the row and dropped the versions. Hydration then
 * let the server's OLDER version for the same day win, while the compound's
 * cycle survived from the landed row: Cycles showed it running, Ended still
 * listed it, and the server held both.
 *
 * The server here is a fake that holds rows and versions the way Postgres does.
 * A "reload" is `vi.resetModules()` and a fresh import of every module: the
 * page's memory is gone, and only the device's storage carries over.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { StackCompound } from "@/lib/home/stack"
import type { CycleColumns, CycleRule } from "@/lib/protocol/cycleRule"

/* ------------------------------------------------------------ fake server */

type Row = Record<string, unknown> & { effectiveFrom: string }

const server = vi.hoisted(() => ({
  /** What `protocol_compounds` holds, already in the device's shape. */
  stack: [] as unknown[],
  /** What `protocol_compound_schedules` holds, keyed by compound id. */
  versions: {} as Record<string, Record<string, unknown>[]>,
  /** False: every push is lost (the reload dropped it). True: pushes land. */
  land: false,
  /** The read-only gate refuses every compound push. */
  refuse: false,
  /** Every compound push, in order: [compound, trail]. */
  compoundPushes: [] as [unknown, unknown][],
  /** Every separate version push, in order: [clientId, versions, opts]. */
  versionPushes: [] as [string, unknown, unknown][],
  /**
   * True: a compound push waits in `held` until the test lands it and delivers
   * its reply, in whatever order the test chooses (the one-at-a-time action
   * queue, with replies arriving seconds after the tap).
   */
  hold: false,
  held: [] as { c: unknown; trail: unknown; resolve: (r: unknown) => void }[],
  /** Every `reconcileCompoundCycle` call, by compound id. */
  reconciles: [] as string[],
}))

function applyVersions(id: string, rows: Row[], supersede: boolean) {
  const byDay = new Map<string, Record<string, unknown>>()
  for (const r of server.versions[id] ?? []) byDay.set(r.effectiveFrom as string, r)
  for (const r of rows) byDay.set(r.effectiveFrom, structuredClone(r))
  const newest = rows.map((r) => r.effectiveFrom).sort().at(-1)
  server.versions[id] = [...byDay.values()]
    .filter((r) => !supersede || newest === undefined || (r.effectiveFrom as string) <= newest)
    .sort((a, b) => (a.effectiveFrom as string).localeCompare(b.effectiveFrom as string))
}

vi.mock("@/lib/home/protocolSync", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/home/protocolSync")>()),
  pushProtocolCompound: vi.fn(
    async (c: StackCompound, trail?: { versions: Row[]; supersede: boolean }) => {
      server.compoundPushes.push([structuredClone(c), structuredClone(trail)])
      if (server.refuse) return { ok: false, refusal: "read-only" as const }
      if (server.hold) {
        return new Promise((resolve) =>
          server.held.push({ c: structuredClone(c), trail: structuredClone(trail), resolve })
        )
      }
      if (!server.land) return new Promise(() => {})
      const { scheduleHistory, ...row } = structuredClone(c)
      void scheduleHistory
      server.stack = [...server.stack.filter((s) => (s as StackCompound).id !== c.id), row]
      if (trail) applyVersions(c.id, trail.versions, trail.supersede)
      return { ok: true, protocolCompoundId: c.id }
    }
  ),
  pushScheduleVersions: vi.fn(
    async (id: string, _name: string | null, rows: Row[], opts: { supersede?: boolean } = {}) => {
      server.versionPushes.push([id, structuredClone(rows), opts])
      if (!server.land) return new Promise(() => {})
      applyVersions(id, rows, opts.supersede === true)
      return { ok: true }
    }
  ),
  archiveProtocolCompound: vi.fn(async () => ({ ok: true })),
  pushCompoundPause: vi.fn(async () => ({ ok: true })),
  // The server's own trail decides the row's cycle; nothing from the device.
  reconcileCompoundCycle: vi.fn(async (id: string) => {
    server.reconciles.push(id)
    if (!server.land) return new Promise(() => {})
    const { cycleRuleFromColumns } = await import("@/lib/protocol/cycleRule")
    const newest = (server.versions[id] ?? []).at(-1)
    if (!newest || newest.stopped === true) return { ok: true, skipped: true }
    const cycle = cycleRuleFromColumns(newest as Partial<CycleColumns>)
    server.stack = (server.stack as StackCompound[]).map((s) => {
      if (s.id !== id) return s
      const { cycle: _old, ...rest } = s
      void _old
      return cycle ? { ...rest, cycle } : rest
    })
    return { ok: true }
  }),
  pullProtocolStackAndLogs: vi.fn(async () => ({
    stack: structuredClone(server.stack),
    doseRows: [],
  })),
  pullScheduleVersions: vi.fn(async () => structuredClone(server.versions)),
  pullPauses: vi.fn(async () => ({})),
}))
vi.mock("@/lib/home/syncActions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/home/syncActions")>()),
  pushStackCompound: vi.fn(async () => ({ ok: true })),
  pullStackAndLogs: vi.fn(async () => ({ stack: [], doseLogs: {} })),
}))
vi.mock("@/lib/home/stackSync", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/home/stackSync")>()),
  pullStacks: vi.fn(async () => []),
  pushStacks: vi.fn(async () => ({ ok: true })),
}))
vi.mock("@/lib/db/oneOffLogs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db/oneOffLogs")>()),
  listOneOffLogs: vi.fn(async () => []),
}))

/* ------------------------------------------------------------- the device */

function fakeStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size
    },
  }
}

beforeEach(() => {
  vi.stubGlobal("window", {
    localStorage: fakeStorage(),
    dispatchEvent: () => true,
    addEventListener: () => {},
    removeEventListener: () => {},
  })
  vi.stubGlobal("CustomEvent", class { constructor(public type: string) {} })
  server.stack = []
  server.versions = {}
  server.land = false
  server.refuse = false
  server.compoundPushes = []
  server.versionPushes = []
  server.hold = false
  server.held = []
  server.reconciles = []
})
afterEach(() => {
  vi.unstubAllGlobals()
})

/** A page load: fresh modules, the same storage. */
async function app() {
  vi.resetModules()
  const stack = await import("@/lib/home/stack")
  const hydrate = await import("@/lib/home/hydrateProtocol")
  const actions = await import("@/lib/home/endedCycleActions")
  const ended = await import("@/lib/protocol/endedCycles")
  return { ...stack, ...hydrate, ...actions, ...ended }
}

/** Let fire-and-forget pushes settle. */
const flush = () => new Promise((r) => setTimeout(r, 0))

/* --------------------------------------------------------------- fixtures */

const TODAY = "2026-09-26"
const R: CycleRule = {
  pattern: { type: "onOff", onDays: 5, offDays: 2 },
  end: { type: "never" },
  colour: "steel",
  anchor: "2026-08-21",
}
const v = (effectiveFrom: string, over: Record<string, unknown> = {}) => ({
  effectiveFrom,
  cadence: { type: "daily" as const },
  timeOfDay: "09:00",
  dose: 200,
  unit: "mcg",
  ...over,
})
const ipamorelin = (over: Partial<StackCompound> = {}): StackCompound => ({
  id: "pc-ipa",
  name: "Ipamorelin",
  category: "peptide",
  method: "subq",
  dose: 200,
  unit: "mcg",
  schedule: { cadence: { type: "daily" }, timeOfDay: "09:00", startDate: "2026-08-21" },
  rotationSites: [],
  rotationIndex: 0,
  ...over,
})

let n = 0
const freshUser = () => `race-${++n}`

type App = Awaited<ReturnType<typeof app>>
const find = (a: App, u: string, id = "pc-ipa") => a.loadStack(u)!.find((c) => c.id === id)!

/** The compound's cycle and today's version agree: both on it, or both off. */
function expectAgreement(a: App, c: StackCompound) {
  expect(c.cycle ?? null).toEqual(a.resolveScheduleOn(c, TODAY).cycle ?? null)
  // And the Ended list agrees with both.
  const listed = a.endedCycles([c], TODAY).length > 0
  expect(listed).toBe(!c.cycle)
}

/** Land a held push on the fake server, then deliver its reply. */
async function landHeld(i: number) {
  const call = server.held[i] as {
    c: StackCompound
    trail?: { versions: Row[]; supersede: boolean }
    resolve: (r: unknown) => void
  }
  const { scheduleHistory, ...row } = structuredClone(call.c)
  void scheduleHistory
  server.stack = [...server.stack.filter((s) => (s as StackCompound).id !== call.c.id), row]
  if (call.trail) applyVersions(call.c.id, call.trail.versions, call.trail.supersede)
  call.resolve({ ok: true, protocolCompoundId: call.c.id })
  await flush()
}

/** The server as it looks once the morning's End has landed. */
async function endedThisMorning(a: App, u: string) {
  const c = ipamorelin({ scheduleHistory: [v("2026-08-21", { cycle: R }), v(TODAY)] })
  a.saveStack(u, [c])
  const { scheduleHistory, ...row } = c
  server.stack = [row]
  server.versions = { "pc-ipa": scheduleHistory!.map(a.scheduleVersionToRow) }
}

/* ------------------------------------------------------------------ F2 */

describe("one call carries the row and its trail", () => {
  it("a cycle change sends the compound and its versions together", async () => {
    const a = await app()
    const u = freshUser()
    a.saveStack(u, [ipamorelin()])
    expect(a.setCompoundCycle(u, "pc-ipa", R, TODAY)).toBe(true)
    expect(server.compoundPushes).toHaveLength(1)
    expect(server.versionPushes).toHaveLength(0)
    const [pushed, trail] = server.compoundPushes[0] as [StackCompound, { versions: Row[]; supersede: boolean }]
    expect(pushed.cycle).toEqual(R)
    expect(trail.supersede).toBe(true)
    expect(trail.versions.find((r) => r.effectiveFrom === TODAY)?.cycle_anchor).toBe(R.anchor)
  })

  it("a delete sends only its trail, through the path the read-only gate lets a delete use", async () => {
    const a = await app()
    const u = freshUser()
    a.saveStack(u, [ipamorelin()])
    expect(a.archiveInStack(u, "pc-ipa", true)).toBe(true)
    expect(server.compoundPushes).toHaveLength(0)
    expect(server.versionPushes).toHaveLength(1)
    const [, rows, opts] = server.versionPushes[0] as [string, Row[], { supersede: boolean }]
    expect(opts).toEqual({ supersede: true })
    expect(rows.at(-1)?.stopped).toBe(true)
  })
})

describe("Restart, reload before the push lands, hydrate", () => {
  it("keeps the compound on its cycle AND today's version on it (the reviewer's server state)", async () => {
    let a = await app()
    const u = freshUser()
    await endedThisMorning(a, u)

    // Tap Restart. The push never lands on this page.
    const [row] = a.endedCycles([find(a, u)], TODAY, a.hiddenEndedCycles(u))
    expect(a.restartCycle(u, row, TODAY)).toEqual({ ok: true })
    // The row half landed and the trail half did not: what F2 found in Postgres.
    const { scheduleHistory, ...restartedRow } = find(a, u)
    void scheduleHistory
    server.stack = [restartedRow]

    // Reload, and the new page hydrates.
    a = await app()
    server.compoundPushes = []
    await a.hydrateFromPostgres(u)

    const c = find(a, u)
    expect(c.cycle).toEqual(R)
    expect(a.resolveScheduleOn(c, TODAY).cycle).toEqual(R)
    expect(a.endedCycles([c], TODAY)).toEqual([])
    expectAgreement(a, c)

    // And the lost push is sent again, carrying the version that was missing.
    expect(server.compoundPushes).toHaveLength(1)
    const [pushed, trail] = server.compoundPushes[0] as [StackCompound, { versions: Row[]; supersede: boolean }]
    expect(pushed.cycle).toEqual(R)
    expect(trail.versions.find((r) => r.effectiveFrom === TODAY)?.cycle_anchor).toBe(R.anchor)
  })

  it("also when neither half landed", async () => {
    let a = await app()
    const u = freshUser()
    await endedThisMorning(a, u)
    const [row] = a.endedCycles([find(a, u)], TODAY)
    a.restartCycle(u, row, TODAY)

    a = await app()
    await a.hydrateFromPostgres(u)
    const c = find(a, u)
    expect(c.cycle).toEqual(R)
    expectAgreement(a, c)
  })

  it("converges once the re-sent push lands, and stays agreed on the next load", async () => {
    let a = await app()
    const u = freshUser()
    await endedThisMorning(a, u)
    const [row] = a.endedCycles([find(a, u)], TODAY)
    a.restartCycle(u, row, TODAY)

    a = await app()
    server.land = true
    await a.hydrateFromPostgres(u)
    await flush()
    // Postgres now holds both halves.
    expect((server.stack[0] as StackCompound).cycle).toEqual(R)
    expect(server.versions["pc-ipa"].find((r) => r.effectiveFrom === TODAY)?.cycle_anchor).toBe(R.anchor)
    // Nothing is pending any more.
    expect(a.pendingPushFor(u, find(a, u))).toBeNull()

    a = await app()
    await a.hydrateFromPostgres(u)
    const c = find(a, u)
    expect(c.cycle).toEqual(R)
    expectAgreement(a, c)
  })

  it("a hydration on the same page, before the push lands, does not undo it either", async () => {
    const a = await app()
    const u = freshUser()
    await endedThisMorning(a, u)
    const [row] = a.endedCycles([find(a, u)], TODAY)
    a.restartCycle(u, row, TODAY)
    // Focus fires a re-pull while the push is still queued.
    await a.hydrateFromPostgres(u)
    const c = find(a, u)
    expect(c.cycle).toEqual(R)
    expectAgreement(a, c)
  })
})

/**
 * The verifier's sequence (second round). Settled by CONTENT, the reply to the
 * first push cleared the third push's record, because the two carry identical
 * content; the second (Undo) then landed and a reload before the third was sent
 * pulled the Undo back as the truth.
 */
describe("Restart, Undo, Restart: an earlier reply never clears a later write", () => {
  it("keeps the second Restart when the first reply arrives after it, the Undo lands, and the page reloads", async () => {
    let a = await app()
    const u = freshUser()
    await endedThisMorning(a, u)
    server.hold = true

    const [e1] = a.endedCycles([find(a, u)], TODAY, a.hiddenEndedCycles(u))
    expect(a.restartCycle(u, e1, TODAY)).toEqual({ ok: true }) // A
    expect(a.endCycle(u, "pc-ipa", TODAY)).toBe(true) // B: the toast's Undo
    const [e2] = a.endedCycles([find(a, u)], TODAY, a.hiddenEndedCycles(u))
    expect(a.restartCycle(u, e2, TODAY)).toEqual({ ok: true }) // C
    expect(server.held).toHaveLength(3)

    await landHeld(0) // A lands, and its reply arrives after C was tapped
    expect(a.pendingPushFor(u, find(a, u))).not.toBeNull()
    await landHeld(1) // B (the Undo) lands
    expect(a.pendingPushFor(u, find(a, u))).not.toBeNull()

    // Reload before C is sent.
    a = await app()
    server.hold = false
    server.compoundPushes = []
    await a.hydrateFromPostgres(u)
    const c = find(a, u)
    expect(c.cycle).toEqual(R)
    expect(a.resolveScheduleOn(c, TODAY).cycle).toEqual(R)
    expect(a.endedCycles([c], TODAY)).toEqual([])
    expectAgreement(a, c)
    // And C is sent again.
    expect(server.compoundPushes).toHaveLength(1)
    expect((server.compoundPushes[0][0] as StackCompound).cycle).toEqual(R)
  })

  it("End, Undo, End: keeps the second End", async () => {
    let a = await app()
    const u = freshUser()
    const c0 = ipamorelin({ cycle: R, scheduleHistory: [v("2026-08-21", { cycle: R })] })
    a.saveStack(u, [c0])
    const { scheduleHistory, ...row } = c0
    server.stack = [row]
    server.versions = { "pc-ipa": scheduleHistory!.map(a.scheduleVersionToRow) }
    server.hold = true

    expect(a.endCycle(u, "pc-ipa", TODAY)).toBe(true) // A
    expect(a.setCompoundCycle(u, "pc-ipa", R, TODAY)).toBe(true) // B: Undo
    expect(a.endCycle(u, "pc-ipa", TODAY)).toBe(true) // C
    await landHeld(0)
    await landHeld(1)

    a = await app()
    server.hold = false
    await a.hydrateFromPostgres(u)
    const c = find(a, u)
    expect(c.cycle).toBeUndefined()
    expect(a.resolveScheduleOn(c, TODAY).cycle).toBeUndefined()
    expect(a.endedCycles([c], TODAY)).toHaveLength(1)
    expectAgreement(a, c)
  })

  it("the reply to the LATEST push does clear it, whatever order the earlier ones arrive in", async () => {
    const a = await app()
    const u = freshUser()
    await endedThisMorning(a, u)
    server.hold = true
    const [e1] = a.endedCycles([find(a, u)], TODAY)
    a.restartCycle(u, e1, TODAY)
    a.endCycle(u, "pc-ipa", TODAY)
    const [e2] = a.endedCycles([find(a, u)], TODAY)
    a.restartCycle(u, e2, TODAY)

    await landHeld(2) // the newest lands first
    expect(a.pendingPushFor(u, find(a, u))).toBeNull()
    await landHeld(0)
    await landHeld(1)
    expect(a.pendingPushFor(u, find(a, u))).toBeNull()
  })

  it("two taps with identical content each get their own record", async () => {
    const a = await app()
    const u = freshUser()
    await endedThisMorning(a, u)
    server.hold = true
    const key = `trackd.stack.pendingPush.v1.${u}`
    const [e1] = a.endedCycles([find(a, u)], TODAY)
    a.restartCycle(u, e1, TODAY)
    const first = JSON.parse(window.localStorage.getItem(key)!)["pc-ipa"]
    a.endCycle(u, "pc-ipa", TODAY)
    const [e2] = a.endedCycles([find(a, u)], TODAY)
    a.restartCycle(u, e2, TODAY)
    const third = JSON.parse(window.localStorage.getItem(key)!)["pc-ipa"]
    expect(third.sig).toBe(first.sig)
    expect(third.token).not.toBe(first.token)
  })
})

describe("End, reload before the push lands, hydrate", () => {
  it("keeps the compound off its cycle AND today's version off it", async () => {
    let a = await app()
    const u = freshUser()
    // Restarted this morning and synced; now End.
    const c0 = ipamorelin({
      cycle: R,
      scheduleHistory: [v("2026-08-21", { cycle: R }), v("2026-09-20"), v(TODAY, { cycle: R })],
    })
    a.saveStack(u, [c0])
    const { scheduleHistory, ...row } = c0
    server.stack = [row]
    server.versions = { "pc-ipa": scheduleHistory!.map(a.scheduleVersionToRow) }

    expect(a.endCycle(u, "pc-ipa", TODAY)).toBe(true)

    a = await app()
    await a.hydrateFromPostgres(u)
    const c = find(a, u)
    expect(c.cycle).toBeUndefined()
    expect(a.resolveScheduleOn(c, TODAY).cycle).toBeUndefined()
    expect(a.endedCycles([c], TODAY)).toHaveLength(1)
    expectAgreement(a, c)
  })
})

describe("Postgres still wins what it should", () => {
  it("once the push has landed, a later change on the server wins the day", async () => {
    let a = await app()
    const u = freshUser()
    await endedThisMorning(a, u)
    server.land = true
    const [row] = a.endedCycles([find(a, u)], TODAY)
    a.restartCycle(u, row, TODAY)
    await flush()
    expect(a.pendingPushFor(u, find(a, u))).toBeNull()

    // Another device ends it again, with a new dose.
    const [sRow] = server.stack as StackCompound[]
    server.stack = [{ ...sRow, cycle: undefined, dose: 300 }]
    server.versions["pc-ipa"] = server.versions["pc-ipa"].map((r) =>
      r.effectiveFrom === TODAY ? a.scheduleVersionToRow(v(TODAY, { dose: 300 })) : r
    )

    a = await app()
    await a.hydrateFromPostgres(u)
    const c = find(a, u)
    expect(c.cycle).toBeUndefined()
    expect(a.resolveScheduleOn(c, TODAY).dose).toBe(300)
    expectAgreement(a, c)
  })

  it("a pending record past its half hour replays nothing, and the two still agree", async () => {
    let a = await app()
    const u = freshUser()
    await endedThisMorning(a, u)
    const [row] = a.endedCycles([find(a, u)], TODAY)
    a.restartCycle(u, row, TODAY)
    const { scheduleHistory, ...restartedRow } = find(a, u)
    void scheduleHistory
    server.stack = [restartedRow]

    // Age the record.
    const key = `trackd.stack.pendingPush.v1.${u}`
    const rec = JSON.parse(window.localStorage.getItem(key)!)
    rec["pc-ipa"].at -= a.PENDING_PUSH_TTL_MS + 1
    window.localStorage.setItem(key, JSON.stringify(rec))

    a = await app()
    server.compoundPushes = []
    await a.hydrateFromPostgres(u)
    const c = find(a, u)
    // The server's day wins, as before the record existed, and the cycle follows it.
    expect(a.resolveScheduleOn(c, TODAY).cycle).toBeUndefined()
    expectAgreement(a, c)
    expect(server.compoundPushes).toHaveLength(0)
  })

  it("re-sending does not restart the half hour, so a push that keeps failing stops replaying", async () => {
    let a = await app()
    const u = freshUser()
    await endedThisMorning(a, u)
    const [row] = a.endedCycles([find(a, u)], TODAY)
    a.restartCycle(u, row, TODAY)
    const key = `trackd.stack.pendingPush.v1.${u}`
    const sentAt = JSON.parse(window.localStorage.getItem(key)!)["pc-ipa"].at as number

    // Three reloads, each re-sending, none landing.
    for (let i = 0; i < 3; i++) {
      a = await app()
      await a.hydrateFromPostgres(u)
    }
    expect(JSON.parse(window.localStorage.getItem(key)!)["pc-ipa"].at).toBe(sentAt)
  })

  it("a re-sent push the read-only gate refuses settles quietly, with no pop-up", async () => {
    let a = await app()
    const u = freshUser()
    await endedThisMorning(a, u)
    const [row] = a.endedCycles([find(a, u)], TODAY)
    a.restartCycle(u, row, TODAY)

    a = await app()
    server.refuse = true
    const events: string[] = []
    ;(window as unknown as { dispatchEvent: (e: { type: string }) => boolean }).dispatchEvent = (e) => {
      events.push(e.type)
      return true
    }
    await a.hydrateFromPostgres(u)
    await flush()
    expect(server.compoundPushes.length).toBeGreaterThan(0)
    expect(a.pendingPushFor(u, find(a, u))).toBeNull()
    expect(events).not.toContain("trackd:read-only-refused")

    // A write the user makes is still answered with it.
    a.setCompoundCycle(u, "pc-ipa", null, TODAY)
    await flush()
    expect(events).toContain("trackd:read-only-refused")
  })

  it("a record for something the device no longer holds does not apply", async () => {
    let a = await app()
    const u = freshUser()
    await endedThisMorning(a, u)
    const [row] = a.endedCycles([find(a, u)], TODAY)
    a.restartCycle(u, row, TODAY)
    // The device copy changes without a push (a restored snapshot, say).
    a.saveStack(u, [{ ...find(a, u), dose: 999 }])
    a = await app()
    expect(a.pendingPushFor(u, find(a, u))).toBeNull()
  })
})

describe("the compound's cycle follows its trail on every hydration", () => {
  it("heals a server that already disagrees (the account F2 left behind)", async () => {
    const a = await app()
    const u = freshUser()
    await endedThisMorning(a, u)
    // Postgres: row on the cycle, today's version off it. Nothing pending.
    server.stack = [{ ...(server.stack[0] as StackCompound), cycle: R }]
    server.land = true
    await a.hydrateFromPostgres(u)
    await flush()
    const c = find(a, u)
    expect(c.cycle).toBeUndefined()
    expectAgreement(a, c)
    // The row the notification runner reads is fixed too, from the server's
    // own trail, and nothing else about it was written.
    expect(server.reconciles).toEqual(["pc-ipa"])
    expect((server.stack[0] as StackCompound).cycle).toBeUndefined()
    expect(server.compoundPushes).toHaveLength(0)

    // Healed: the next load asks nothing more.
    const b = await app()
    await b.hydrateFromPostgres(u)
    expect(server.reconciles).toEqual(["pc-ipa"])
  })

  it("heals the other way round: row off, today's version on", async () => {
    const a = await app()
    const u = freshUser()
    const c0 = ipamorelin({
      scheduleHistory: [v("2026-08-21", { cycle: R }), v("2026-09-20"), v(TODAY, { cycle: R })],
    })
    a.saveStack(u, [c0])
    const { scheduleHistory, ...row } = c0
    server.stack = [row]
    server.versions = { "pc-ipa": scheduleHistory!.map(a.scheduleVersionToRow) }
    server.land = true
    await a.hydrateFromPostgres(u)
    await flush()
    expect(find(a, u).cycle).toEqual(R)
    expect(server.reconciles).toEqual(["pc-ipa"])
    expect((server.stack[0] as StackCompound).cycle).toEqual(R)
  })

  it("asks nothing of a server that agrees with itself", async () => {
    const a = await app()
    const u = freshUser()
    await endedThisMorning(a, u)
    await a.hydrateFromPostgres(u)
    expect(server.reconciles).toEqual([])
  })

  it("leaves a compound with a push still pending to that push", async () => {
    let a = await app()
    const u = freshUser()
    await endedThisMorning(a, u)
    const [row] = a.endedCycles([find(a, u)], TODAY)
    a.restartCycle(u, row, TODAY)
    // The split F2 found: the row landed on the cycle, today's version did not.
    const { scheduleHistory, ...restartedRow } = find(a, u)
    void scheduleHistory
    server.stack = [restartedRow]
    a = await app()
    await a.hydrateFromPostgres(u)
    expect(server.reconciles).toEqual([])
  })

  it("serverRowSplit reads the pull alone, and not a stop, a delete or a pre-006 trail", async () => {
    const a = await app()
    const rows = (xs: ReturnType<typeof v>[]) => xs.map(a.scheduleVersionToRow)
    const on = ipamorelin({ cycle: R })
    const off = ipamorelin()
    const trailOff = rows([v("2026-08-21", { cycle: R }), v(TODAY)])
    expect(a.serverRowSplit(on, trailOff)).toBe(true)
    expect(a.serverRowSplit(off, trailOff)).toBe(false)
    expect(a.serverRowSplit(on, [])).toBe(false)
    expect(a.serverRowSplit({ ...on, archived: true }, trailOff)).toBe(false)
    expect(a.serverRowSplit(on, rows([v("2026-08-21", { cycle: R }), v(TODAY, { stopped: true })]))).toBe(false)
    const pre006 = trailOff.map((r) => {
      const out: Record<string, unknown> = { ...r }
      for (const k of Object.keys(out)) if (k.startsWith("cycle_")) delete out[k]
      return out as (typeof trailOff)[number]
    })
    expect(a.serverRowSplit(on, pre006)).toBe(false)
    // Unsorted rows: the newest is found by date, not position.
    expect(a.serverRowSplit(off, [...trailOff].reverse())).toBe(false)
    expect(a.serverRowSplit(on, [...trailOff].reverse())).toBe(true)
  })

  it("does not strip a cycle when the pull could not see the cycle columns", async () => {
    const a = await app()
    const u = freshUser()
    const c0 = ipamorelin({ cycle: R, scheduleHistory: [v("2026-08-21", { cycle: R })] })
    a.saveStack(u, [c0])
    const { scheduleHistory, ...row } = c0
    server.stack = [row]
    // The pre-006 fallback: rows with no cycle keys at all.
    server.versions = {
      "pc-ipa": scheduleHistory!.map((x) => {
        const r: Record<string, unknown> = { ...a.scheduleVersionToRow(x) }
        for (const k of Object.keys(r)) if (k.startsWith("cycle_")) delete r[k]
        return r
      }),
    }
    await a.hydrateFromPostgres(u)
    expect(find(a, u).cycle).toEqual(R)
  })
})

/* -------------------------------------------------------- B14 across sync */

describe("a cycle ended the day it began stays under Ended after a sync", () => {
  it("the device's ended rule rides onto the pulled row for that day", async () => {
    let a = await app()
    const u = freshUser()
    const c0 = ipamorelin({ scheduleHistory: [v("2026-08-21")] })
    a.saveStack(u, [c0])
    server.land = true
    const today: CycleRule = { ...R, anchor: TODAY }
    a.setCompoundCycle(u, "pc-ipa", today, TODAY)
    a.endCycle(u, "pc-ipa", TODAY)
    await flush()
    expect(a.endedCycles([find(a, u)], TODAY)).toHaveLength(1)

    a = await app()
    await a.hydrateFromPostgres(u)
    const rows = a.endedCycles([find(a, u)], TODAY)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ key: `pc-ipa|${TODAY}`, rule: today, endedOn: TODAY })
  })
})

/* ------------------------------------------------------------------ S1 */

describe("Delete for good follows a compound to its Postgres id", () => {
  it("a hidden ended cycle stays hidden after hydration re-keys the compound", async () => {
    const a = await app()
    const u = freshUser()
    // The device knows the compound by an id Postgres does not use.
    const local = ipamorelin({
      id: "device-ipa",
      scheduleHistory: [v("2026-08-21", { cycle: R }), v("2026-09-20")],
    })
    a.saveStack(u, [local])
    const [row] = a.endedCycles([local], TODAY)
    expect(row.key).toBe("device-ipa|2026-08-21")
    a.hideEndedCycle(u, row.key)

    const { scheduleHistory, ...pgRow } = { ...local, id: "pc-ipa" }
    server.stack = [pgRow]
    server.versions = { "pc-ipa": scheduleHistory!.map(a.scheduleVersionToRow) }

    await a.hydrateFromPostgres(u)
    const c = find(a, u, "pc-ipa")
    expect(a.hiddenEndedCycles(u).has("pc-ipa|2026-08-21")).toBe(true)
    expect(a.endedCycles([c], TODAY, a.hiddenEndedCycles(u))).toEqual([])
  })
})
