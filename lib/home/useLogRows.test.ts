/**
 * The open dose row's behaviour over time (`useLogRows`, Flow B), from the cold
 * bug review, 26 Sep 2026. The hook runs on a tiny hook runtime (below), so no
 * DOM is needed: state is set in place, the test re-renders explicitly, and
 * effects run right after each render, like a commit.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/* ------------------------------------------------------ a tiny hook runtime */

type Cell = { v?: unknown; set?: (n: unknown) => void; current?: unknown; deps?: readonly unknown[]; cleanup?: () => void }
type Inst = { cells: Cell[]; effects: Array<() => void> }
const shim = vi.hoisted(() => {
  const state: { cur: Inst | null; idx: number } = { cur: null, idx: 0 }
  const changed = (a?: readonly unknown[], b?: readonly unknown[]) =>
    !a || !b || a.length !== b.length || a.some((x, i) => !Object.is(x, b[i]))
  const hooks = {
    useState(init: unknown) {
      const inst = state.cur!
      const i = state.idx++
      if (!(i in inst.cells)) inst.cells[i] = { v: typeof init === "function" ? (init as () => unknown)() : init }
      const cell = inst.cells[i]
      if (!cell.set) {
        cell.set = (n: unknown) => {
          cell.v = typeof n === "function" ? (n as (v: unknown) => unknown)(cell.v) : n
        }
      }
      return [cell.v, cell.set]
    },
    useRef(init: unknown) {
      const inst = state.cur!
      const i = state.idx++
      if (!(i in inst.cells)) inst.cells[i] = { current: init }
      return inst.cells[i]
    },
    useEffect(fn: () => unknown, deps?: readonly unknown[]) {
      const inst = state.cur!
      const i = state.idx++
      const prev = inst.cells[i]
      if (!prev || changed(deps, prev.deps)) {
        inst.effects.push(() => {
          prev?.cleanup?.()
          const c = fn()
          inst.cells[i] = { deps, cleanup: typeof c === "function" ? (c as () => void) : undefined }
        })
      }
    },
  }
  return { state, hooks }
})

vi.mock("react", async (orig) => {
  const R = (await orig()) as Record<string, unknown>
  return { ...R, ...shim.hooks, default: { ...R, ...shim.hooks } }
})
vi.mock("@/lib/db/inventory", () => ({ openStockItem: vi.fn(async () => ({ ok: true })) }))
vi.mock("@/lib/toast", () => ({ showToast: vi.fn() }))
vi.mock("@/components/home/log/LogRowPanel", () => ({ LogRowPanel: () => null }))
vi.mock("@/components/home/log/TrackBar", () => ({ SAVE_CONFIRM_MS: 620 }))
vi.mock("@/lib/home/syncActions", () => ({ pushDoseLog: vi.fn(), deleteDoseLog: vi.fn() }))
vi.mock("@/lib/home/protocolSync", () => ({ pushProtocolDoseLog: vi.fn(), deleteProtocolDoseLog: vi.fn() }))

import { useLogRows, type LogRowsOptions } from "@/components/home/log/useLogRows"
import { openStockItem } from "@/lib/db/inventory"
import type { DoseLog } from "@/lib/home/mockHomeData"
import type { StackCompound } from "@/lib/home/stack"
import { showToast } from "@/lib/toast"

function mount<P, R>(hook: (p: P) => R) {
  const inst: Inst = { cells: [], effects: [] }
  return {
    render(props: P): R {
      shim.state.cur = inst
      shim.state.idx = 0
      const out = hook(props)
      shim.state.cur = null
      inst.effects.splice(0).forEach((e) => e())
      return out
    },
  }
}

/* ------------------------------------------------------------------ setup */

const T = "2026-09-26"

const compound = (id: string): StackCompound => ({
  id,
  name: id,
  category: "peptide",
  method: "subq",
  dose: 2,
  unit: "mg",
  schedule: { cadence: { type: "daily" }, timeOfDay: "08:00", startDate: "2026-01-01" },
  rotationSites: [],
  rotationIndex: 0,
})

/** A panel element as `renderPanel` returns it: its props are the callbacks. */
type Panel = { key: string; props: { onDraft: (p: object) => void; onSpare: (id: string | null) => void } }
type Rows = ReturnType<typeof useLogRows>
const panelOf = (r: Rows, c: StackCompound, slot = 0) => r.flow.renderPanel(c, slot) as unknown as Panel

const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve()
}

let commit: ReturnType<typeof vi.fn>
let remove: ReturnType<typeof vi.fn>
function options(logs: LogRowsOptions["logs"], over: Partial<LogRowsOptions> = {}): LogRowsOptions {
  return {
    day: T,
    todayKey: T,
    logs,
    guard: (f) => {
      f()
      return true
    },
    commit: commit as unknown as LogRowsOptions["commit"],
    remove: remove as unknown as LogRowsOptions["remove"],
    catalogue: [],
    bodySex: "male",
    ...over,
  }
}

beforeEach(() => {
  ;(globalThis as unknown as { window: unknown }).window = globalThis
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] })
  commit = vi.fn()
  remove = vi.fn()
  vi.mocked(openStockItem).mockClear()
  vi.mocked(showToast).mockClear()
  vi.setSystemTime(new Date(2026, 8, 26, 9, 30))
})
afterEach(() => {
  vi.useRealTimers()
})

/* ------------------------------------------------------------------ tests */

describe("B7: the spare a CLOSING row's late stock read picked", () => {
  it("is not started by Track on the row opened after it", async () => {
    const A = compound("A")
    const B = compound("B")
    const h = mount(useLogRows)
    let r = h.render(options({}))
    r.flow.onTick(A, 0) // A opens and starts reading its stock
    r = h.render(options({}))
    const panelA = panelOf(r, A)
    r.flow.onTick(B, 0) // B opens; A folds away, still mounted
    r = h.render(options({}))
    // A's read lands now: it holds only a sealed spare.
    panelA.props.onDraft({ inventoryItemId: "spare-of-A" })
    panelA.props.onSpare("spare-of-A")
    r = h.render(options({}))
    panelOf(r, B).props.onDraft({ inventoryItemId: "open-vial-of-B" })
    r = h.render(options({}))
    r.bar.onTrack()
    await flush()
    expect(commit).toHaveBeenCalledWith("B", expect.objectContaining({ inventoryItemId: "open-vial-of-B" }), T, 0)
    expect(openStockItem).not.toHaveBeenCalled()
  })

  it("still starts the row's OWN spare before linking the dose", async () => {
    const A = compound("A")
    const h = mount(useLogRows)
    let r = h.render(options({}))
    r.flow.onTick(A, 0)
    r = h.render(options({}))
    const panel = panelOf(r, A)
    panel.props.onDraft({ inventoryItemId: "spare-of-A" })
    panel.props.onSpare("spare-of-A")
    r = h.render(options({}))
    r.bar.onTrack()
    await flush()
    expect(openStockItem).toHaveBeenCalledWith("spare-of-A", T)
    expect(commit).toHaveBeenCalledWith("A", expect.objectContaining({ inventoryItemId: "spare-of-A" }), T, 0)
  })
})

describe("B16: a spare that fails to start", () => {
  it("leaves the dose's container undecided instead of linking it to a spare never started", async () => {
    vi.mocked(openStockItem).mockResolvedValueOnce({ ok: false })
    const A = compound("A")
    const h = mount(useLogRows)
    let r = h.render(options({}))
    r.flow.onTick(A, 0)
    r = h.render(options({}))
    const panel = panelOf(r, A)
    panel.props.onDraft({ inventoryItemId: "spare-of-A" })
    panel.props.onSpare("spare-of-A")
    r = h.render(options({}))
    r.bar.onTrack()
    await flush()
    expect(openStockItem).toHaveBeenCalledWith("spare-of-A", T)
    expect(commit).toHaveBeenCalledTimes(1)
    const log = commit.mock.calls[0][1] as DoseLog
    expect("inventoryItemId" in log).toBe(false)
  })
})

describe("B17: Unticked's Undo", () => {
  it("does not overwrite a dose re-logged in the same slot inside the 3s", async () => {
    const A = compound("A")
    const old: DoseLog = { amount: "2.5", unit: "mg", siteId: "sq-abdo-l", time24: "07:10", inventoryItemId: "v1" }
    const h = mount(useLogRows)
    let r = h.render(options({ [T]: { A: old } }))
    r.flow.onTick(A, 0) // logged → un-log, with Undo
    expect(remove).toHaveBeenCalledWith("A", T, 0)
    const undo = vi.mocked(showToast).mock.calls[0][1]!.undo!
    r = h.render(options({}))
    r.flow.onTick(A, 0) // opens
    r = h.render(options({}))
    r.flow.onTick(A, 0) // tracks a fresh dose
    await flush()
    expect(commit).toHaveBeenCalledTimes(1)
    undo()
    expect(commit).toHaveBeenCalledTimes(1)
  })

  it("does not overwrite a dose logged there from elsewhere (the host's logs say so)", () => {
    const A = compound("A")
    const old: DoseLog = { amount: "2.5", unit: "mg", siteId: null, time24: "07:10" }
    const h = mount(useLogRows)
    const r = h.render(options({ [T]: { A: old } }))
    r.flow.onTick(A, 0)
    const undo = vi.mocked(showToast).mock.calls[0][1]!.undo!
    // A stack's tick logged it again meanwhile.
    h.render(options({ [T]: { A: { amount: "2", unit: "mg", siteId: null, time24: "09:00" } } }))
    undo()
    expect(commit).not.toHaveBeenCalled()
  })

  it("puts the very same dose back when the slot is still empty", () => {
    const A = compound("A")
    const old: DoseLog = { amount: "2.5", unit: "mg", siteId: "sq-abdo-l", time24: "07:10", inventoryItemId: "v1" }
    const h = mount(useLogRows)
    const r = h.render(options({ [T]: { A: old } }))
    r.flow.onTick(A, 0)
    const undo = vi.mocked(showToast).mock.calls[0][1]!.undo!
    h.render(options({}))
    undo()
    expect(commit).toHaveBeenCalledWith("A", old, T, 0)
  })
})

describe("B18: Save's confirm", () => {
  it("is not written back when the dose is unticked during it", async () => {
    const A = compound("A")
    const old: DoseLog = { amount: "2", unit: "mg", siteId: null, time24: "07:10" }
    const h = mount(useLogRows)
    let r = h.render(options({ [T]: { A: old } }))
    r.flow.onOpen(A, 0) // edit mode
    r = h.render(options({ [T]: { A: old } }))
    panelOf(r, A).props.onDraft({ note: "edited" })
    r = h.render(options({ [T]: { A: old } }))
    r.bar.onTrack() // Save: confirm, commit after 620ms
    await flush()
    r = h.render(options({ [T]: { A: old } }))
    r.flow.onTick(A, 0) // unticked meanwhile
    expect(remove).toHaveBeenCalledWith("A", T, 0)
    h.render(options({}))
    vi.advanceTimersByTime(700)
    expect(commit).not.toHaveBeenCalled()
  })

  it("is not stopped by a Save on another row opened during it", async () => {
    const A = compound("A")
    const B = compound("B")
    const a: DoseLog = { amount: "2", unit: "mg", siteId: null, time24: "07:10" }
    const b: DoseLog = { amount: "2", unit: "mg", siteId: null, time24: "07:20" }
    const logs = { [T]: { A: a, B: b } }
    const h = mount(useLogRows)
    let r = h.render(options(logs))
    r.flow.onOpen(A, 0)
    r = h.render(options(logs))
    panelOf(r, A).props.onDraft({ note: "a" })
    r = h.render(options(logs))
    r.bar.onTrack()
    await flush()
    r = h.render(options(logs))
    r.flow.onOpen(B, 0) // another row, inside A's 620ms
    r = h.render(options(logs))
    panelOf(r, B).props.onDraft({ note: "b" })
    r = h.render(options(logs))
    r.bar.onTrack()
    await flush()
    vi.advanceTimersByTime(700)
    expect(commit).toHaveBeenCalledWith("A", expect.objectContaining({ note: "a" }), T, 0)
    expect(commit).toHaveBeenCalledWith("B", expect.objectContaining({ note: "b" }), T, 0)
  })

  it("writes the edit when nothing got in its way", async () => {
    const A = compound("A")
    const old: DoseLog = { amount: "2", unit: "mg", siteId: null, time24: "07:10" }
    const h = mount(useLogRows)
    let r = h.render(options({ [T]: { A: old } }))
    r.flow.onOpen(A, 0)
    r = h.render(options({ [T]: { A: old } }))
    panelOf(r, A).props.onDraft({ note: "edited" })
    r = h.render(options({ [T]: { A: old } }))
    r.bar.onTrack()
    await flush()
    vi.advanceTimersByTime(700)
    expect(commit).toHaveBeenCalledWith("A", expect.objectContaining({ note: "edited", time24: "07:10" }), T, 0)
  })
})

describe("B4: Save on an opened SKIPPED row", () => {
  it("writes the dose back still skipped", async () => {
    const A = compound("A")
    const skipped: DoseLog = { amount: "2", unit: "mg", siteId: null, time24: "08:00", status: "skipped" }
    const h = mount(useLogRows)
    let r = h.render(options({ [T]: { A: skipped } }))
    r.flow.onOpen(A, 0)
    r = h.render(options({ [T]: { A: skipped } }))
    panelOf(r, A).props.onDraft({ note: "was ill" })
    r = h.render(options({ [T]: { A: skipped } }))
    r.bar.onTrack()
    await flush()
    vi.advanceTimersByTime(700)
    expect(commit.mock.calls[0]?.[1]).toMatchObject({ status: "skipped", note: "was ill" })
  })
})

describe("B23: Track in the first minute after local midnight", () => {
  it("logs a dose taken at 00:00 on the 27th on the 27th", async () => {
    vi.setSystemTime(new Date(2026, 8, 27, 0, 0, 30))
    const A = compound("A")
    const stale = options({}, { day: T, todayKey: T }) // the host's minute tick has not fired yet
    const h = mount(useLogRows)
    let r = h.render(stale)
    r.flow.onTick(A, 0)
    r = h.render(stale)
    r.flow.onTick(A, 0)
    await flush()
    const [, log, day] = commit.mock.calls[0]
    expect(day).toBe("2026-09-27")
    expect((log as DoseLog).time24).toBe("00:00")
  })
})

describe("B32: reopening a row while it folds away", () => {
  it("gets a fresh panel, not the closing one", () => {
    const A = compound("A")
    const h = mount(useLogRows)
    let r = h.render(options({}))
    r.flow.onTick(A, 0)
    r = h.render(options({}))
    const first = panelOf(r, A).key
    r.flow.onOpen(A, 0) // the name again closes it
    r = h.render(options({}))
    expect(r.flow.closingKey).toBe("A#0")
    r.flow.onOpen(A, 0) // and opens it again inside the 520ms
    r = h.render(options({}))
    expect(r.flow.openKey).toBe("A#0")
    expect(panelOf(r, A).key).not.toBe(first)
  })

  it("keeps a closing panel's late read off the reopened row", () => {
    const A = compound("A")
    const h = mount(useLogRows)
    let r = h.render(options({}))
    r.flow.onTick(A, 0)
    r = h.render(options({}))
    const closing = panelOf(r, A)
    r.flow.onOpen(A, 0)
    r = h.render(options({}))
    r.flow.onOpen(A, 0)
    r = h.render(options({}))
    closing.props.onDraft({ inventoryItemId: "stale" })
    r = h.render(options({}))
    expect(r.openRow?.draft.inventoryItemId).toBeUndefined()
  })
})
