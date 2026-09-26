/**
 * B15 (cold review, 26 Sep 2026): `026` must carry the plan's safety settings
 * in the file itself, since the file is what gets pasted into the SQL Editor.
 * Build brief §5: one transaction with a 5 second lock timeout, avoiding the
 * cron's minutes, and only once the embeds are hinted and deployed (B1).
 *
 * Applied behaviour (it applies, twice over; a failure leaves nothing behind;
 * the timeout ends with the transaction) was checked in PGlite and is recorded
 * in the file's header. This pins the text.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

const DIR = join(__dirname, "..", "..", "supabase", "protocol")
const read = (name: string) => readFileSync(join(DIR, name), "utf8")

/** The statements alone: line comments stripped, blank lines dropped. */
function code(sql: string): string[] {
  return sql
    .split("\n")
    .map((line) => line.replace(/--.*$/, "").trim())
    .filter((line) => line.length > 0)
}

/** The header: every comment line before the first statement. */
function header(sql: string): string {
  const lines = sql.split("\n")
  const first = lines.findIndex((l) => l.trim().length > 0 && !l.trim().startsWith("--"))
  return lines.slice(0, first).join("\n")
}

describe("026 runs as one transaction with a lock timeout", () => {
  const sql = read("026_stock_spares_and_dropper.sql")
  const lines = code(sql)

  it("opens with BEGIN and a LOCAL 5 second lock timeout", () => {
    expect(lines[0]).toBe("BEGIN;")
    expect(lines[1]).toBe("SET LOCAL lock_timeout = '5s';")
  })

  it("closes with COMMIT, and nothing ends the transaction early", () => {
    expect(lines[lines.length - 1]).toBe("COMMIT;")
    const control = lines.filter((l) => /^(BEGIN|COMMIT|ROLLBACK|END)\s*;$/i.test(l))
    expect(control).toEqual(["BEGIN;", "COMMIT;"])
  })

  it("holds nothing that cannot run inside a transaction", () => {
    // An enum value added in the same transaction cannot be used by it (that
    // is why 025 is separate), and CONCURRENTLY refuses a transaction block.
    expect(lines.join("\n")).not.toMatch(/ADD VALUE|CONCURRENTLY|VACUUM/i)
  })
})

describe("026's HOW TO RUN", () => {
  const top = header(read("026_stock_spares_and_dropper.sql"))

  it("makes the hinted, deployed code step 0", () => {
    const step0 = top.slice(top.indexOf("--   0."), top.indexOf("--   1."))
    expect(step0).toMatch(/BEFORE `025` AND BEFORE THIS FILE/)
    expect(step0).toContain("inventory_items_protocol_compound_id_fkey")
    expect(step0).toMatch(/deploy/)
    expect(step0).toContain("lib/db/embedHints.test.ts")
  })

  it("names every bare embed on `main`, the check-ups' read included", () => {
    // `main` at a938d5a: Stock's two, the runner's low-stock read, and
    // `readStock` in `checkupFacts.ts`, which this branch does not have and
    // the merge must hint by hand. The file used to say "three".
    const step0 = top.slice(top.indexOf("--   0."), top.indexOf("--   1."))
    expect(step0).toMatch(/FOUR such embeds/)
    for (const file of [
      "lib/db/inventory.ts",
      "lib/notifications/runner.ts",
      "INVENTORY_REMINDER_SELECT",
      "lib/notifications/checkupFacts.ts",
    ]) {
      expect(step0).toContain(file)
    }
    expect(step0).toMatch(/MERGE must/)
    expect(top).not.toMatch(/three such embeds|in all three/i)
  })

  it("warns off the cron's minutes", () => {
    expect(top).toMatch(/NOT :00, :15, :30 or :45/)
  })

  it("no longer claims it is backward compatible with an unhinted main", () => {
    expect(top).not.toMatch(/^-- BACKWARD COMPATIBLE WITH `main`/m)
    expect(top).toMatch(/NOT BACKWARD COMPATIBLE WITH AN UNHINTED `main`/)
  })

  it("says what to check afterwards: the views' options and grants, and PGRST201", () => {
    expect(top).toMatch(/reloptions/)
    // Asked as a yes/no, not read off `relacl`: `grants/002`'s default
    // privileges give `service_role` far more than `r`, which is correct but
    // reads like a failure against "service_role=r".
    expect(top).toMatch(/has_table_privilege\('authenticated', oid, 'SELECT'\)/)
    expect(top).toMatch(/has_table_privilege\('service_role', oid, 'SELECT'\)/)
    expect(top).not.toMatch(/service_role=r`/)
    expect(top).toMatch(/PGRST201/)
  })
})

describe("025's HOW TO RUN", () => {
  it("waits for the same step 0", () => {
    const top = header(read("025_dropper_enums.sql"))
    const step0 = top.slice(top.indexOf("--   0."), top.indexOf("--   1."))
    expect(step0).toMatch(/step 0\s+--\s+of `026`/)
  })
})
