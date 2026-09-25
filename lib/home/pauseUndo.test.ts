import { describe, expect, it } from "vitest"

import { pauseUndoable, pausesEndedBy, rangesTouch } from "./pauseUndo"

describe("which pauses Undo may take back", () => {
  it("treats overlapping and end-to-end ranges as touching, as the store does", () => {
    expect(rangesTouch({ startedOn: "2026-09-01", endsOn: "2026-09-10" }, { startedOn: "2026-09-11", endsOn: null })).toBe(true)
    expect(rangesTouch({ startedOn: "2026-09-01", endsOn: "2026-09-10" }, { startedOn: "2026-09-12", endsOn: "2026-09-20" })).toBe(false)
    expect(rangesTouch({ startedOn: "2026-09-01", endsOn: null }, { startedOn: "2026-10-01", endsOn: "2026-10-02" })).toBe(true)
  })

  it("offers Undo on a pause that stood alone, never on one merged into another", () => {
    const range = { startedOn: "2026-09-24", endsOn: "2026-10-07" }
    expect(pauseUndoable([{ pauses: [] }, {}], range)).toBe(true)
    expect(pauseUndoable([{ pauses: [{ id: "a", startedOn: "2026-09-01", endsOn: "2026-09-10" }] }], range)).toBe(true)
    expect(pauseUndoable([{ pauses: [{ id: "a", startedOn: "2026-09-01", endsOn: "2026-09-23" }] }], range)).toBe(false)
    expect(pauseUndoable([], range)).toBe(false)
  })

  it("remembers the pause a resume ends, or a group's still-running pauses", () => {
    const compounds = [
      { id: "a", pauses: [{ id: "p1", startedOn: "2026-09-20", endsOn: null, groupId: "g" }] },
      { id: "b", pauses: [{ id: "p2", startedOn: "2026-09-01", endsOn: "2026-09-05", groupId: "g" }] },
      { id: "c", pauses: [{ id: "p3", startedOn: "2026-09-20", endsOn: "2026-09-30", groupId: "g" }] },
    ]
    expect(pausesEndedBy(compounds, "2026-09-24", { compoundId: "a" })).toEqual([
      { compoundId: "a", pause: compounds[0].pauses[0] },
    ])
    expect(pausesEndedBy(compounds, "2026-09-24", { groupId: "g" }).map((x) => x.pause.id)).toEqual(["p1", "p3"])
    expect(pausesEndedBy(compounds, "2026-09-24", { compoundId: "b" })).toEqual([])
  })
})
