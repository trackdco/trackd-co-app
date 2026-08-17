/**
 * THE DELETE IS NEVER GATED — pinned as source invariants rather than as
 * behaviour, deliberately.
 *
 * `gate.ts` states the rule in prose: a lapsed account may not ADD, and may
 * always REMOVE its own data. Two functions serve both directions at once
 * (`setProtocolCompoundActive` is delete-and-re-add, `pushScheduleVersions` is
 * edit-and-the-stop-a-delete-writes), so each carries a CONDITIONAL guard, and a
 * future session "tidying" the condition away would re-gate the delete.
 *
 * That failure is silent and expensive: the compound vanishes from the app, its
 * `is_active` stays true in Postgres, and the reminder engine keeps announcing it
 * as due — thirteen days of it on a real account, which is what the `stopped`
 * gate in `lib/notifications/reminders.ts` was written to catch. And for the
 * versions half it is worse, because the `stopped` row is what that gate READS.
 *
 * These are source assertions because the alternative is not available: both
 * functions live in `"use server"` modules whose imports (`next/headers`, the
 * Supabase server client) cannot be exercised in this pure-lib suite, and mocking
 * them wholesale — which `stackSync.test.ts` does — would test the mock. The
 * house already uses this shape where the risk is a silent omission rather than a
 * wrong answer: see `PC_REMINDER_SELECT` asserting it names every cycle column.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"

const read = (path: string) => readFileSync(path, "utf8")

/** The body of an exported function, up to the next top-level export. */
function bodyOf(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}(`)
  expect(start, `${name} not found — was it renamed?`).toBeGreaterThan(-1)
  const rest = source.slice(start + 1)
  const next = rest.indexOf("\nexport ")
  return next === -1 ? rest : rest.slice(0, next)
}

describe("setProtocolCompoundActive", () => {
  const body = bodyOf(read("lib/db/protocolCompounds.ts"), "setProtocolCompoundActive")

  it("still consults the read-only gate at all", () => {
    // The other direction of the same mistake: an ungated re-add would let a
    // lapsed account put a compound back, which IS an add.
    expect(body).toContain("canWriteData()")
  })

  it("gates ONLY the reactivate direction", () => {
    // `if (isActive && !(await canWriteData()))`. Without `isActive &&` the
    // delete is refused, silently, for every lapsed user.
    const guard = body.split("\n").find((l) => l.includes("canWriteData()")) ?? ""
    expect(guard, "the guard must be conditional on the direction").toMatch(/isActive\s*&&/)
  })
})

describe("pushScheduleVersions", () => {
  const source = read("lib/home/protocolSync.ts")
  const body = bodyOf(source, "pushScheduleVersions")

  it("still gates ordinary edits", () => {
    expect(body).toContain("refuseWrite()")
  })

  it("lets a trail that ends in a stop through, because that is a delete", () => {
    // ⚠️ The guard now returns the WIDENED refusal (Q85): three states, not a
    // boolean, so a surface can tell "we know they lapsed" from "we could not
    // find out". The exemption itself is unchanged and is what this pins.
    expect(body, "the refusal must exempt a delete").toMatch(
      /if \(!isDelete\) \{\s*const refused = await refuseWrite\(\);\s*if \(refused\) return refused;\s*\}/,
    )
    expect(body, "isDelete must be read from the newest version, not the last array slot")
      .toContain("newest?.stopped === true")
  })

  it("will not open the gate for a FUTURE-dated stop", () => {
    // The payload is client-supplied. Without the date bound, appending a stop
    // dated 2099 to an ordinary edit opens the gate and the edit lands — a
    // general write bypass wearing a delete's clothes.
    expect(body).toMatch(/newest\.effectiveFrom <= utcDayKey\(1\)/)
  })

  it("writes the WHOLE trail, stops and baseline alike", () => {
    // Filtering to the stop rows was tried and was worse: a compound that had
    // never been edited seeds its baseline and its stop in the same push, and
    // dropping the baseline left Postgres holding a lone stop — which
    // `versionInForceOn` resolves for every day that predates it, so the
    // compound read as stopped for its entire life on any second device.
    expect(body).not.toMatch(/versions\.filter\(\(v\) => v\.stopped\)/)
    expect(body).toContain("versions.map((v) => ({")
  })

  it("only sweeps when the caller says it recorded a version", () => {
    // A pause re-pushes the trail without changing it. Sweeping on that deletes
    // versions this device may simply not have pulled yet.
    expect(body).toContain("opts.supersede")
  })

  it("sweeps the versions the client superseded", () => {
    // Without this, a back-dated re-add leaves the delete's stop as the newest
    // row in Postgres and every push about that compound goes silent forever.
    expect(body).toContain("sweepSupersededVersions")
    expect(source).toContain('.gt("effective_from", newest)')
  })
})

describe("the two callers that push a trail", () => {
  const source = read("lib/home/stack.ts")

  it("only asks to supersede when the trail actually changed", () => {
    // `upsertStack` runs on writes that touch no version at all — a pause, a
    // resume — and those re-push a possibly stale trail.
    expect(source).toContain("supersede: recordedAVersion")
    expect(source).toMatch(/JSON\.stringify\(before \?\? \[\]\) !==/)
  })

  it("always supersedes on a delete, which is the case the sweep exists for", () => {
    expect(source).toMatch(/supersede: true/)
  })
})

describe("archiveProtocolCompound", () => {
  const body = bodyOf(read("lib/home/protocolSync.ts"), "archiveProtocolCompound")

  it("is not gated — deleting is a data right, not a feature", () => {
    expect(body).not.toContain("canWriteData()")
  })

  it("reports a failed lookup as a failure rather than a skip", () => {
    // `{ ok: true, skipped: true }` reads as success to `trackSync`, so the user
    // sees a green tick while Postgres keeps the compound active.
    expect(body).toMatch(/if \(failed\) return \{ ok: false \}/)
  })
})

describe("pushProtocolDoseLog", () => {
  const body = bodyOf(read("lib/home/protocolSync.ts"), "pushProtocolDoseLog")

  it("fails loudly on every lookup, not just the first", () => {
    // Three reads resolve the compound. A timeout on any of them is not "this is
    // a custom compound", and treating it as one loses the dose to the device.
    expect(body).toMatch(/if \(first\.error\)/)
    expect(body).toMatch(/if \(byName\.failed\) return \{ ok: false \}/)
    expect(body).toMatch(/if \(reread\.error\)/)
  })
})
