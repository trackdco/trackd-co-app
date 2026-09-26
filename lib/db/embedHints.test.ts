/**
 * B1 (cold review, 26 Sep 2026): every PostgREST embed between
 * `inventory_items` and `protocol_compounds` must NAME its foreign key.
 *
 * `supabase/protocol/026` adds a second key between the two tables
 * (`protocol_compounds.cycle_end_item_id` → `inventory_items`) and makes
 * `protocol_compound_schedules` a junction between them. PostgREST then finds
 * several relationships for a bare embed and refuses it (PGRST201): Stock fails
 * to load for every user and the low-stock push goes silent. PGlite cannot see
 * this (it has no PostgREST), so the guard reads the source.
 *
 * Only string literals are read, through the TypeScript scanner, so a comment
 * that names the bare form to explain it is not a false alarm.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs"
import { join, relative } from "node:path"

import ts from "typescript"
import { describe, expect, it } from "vitest"

const ROOT = join(__dirname, "..", "..")
const FK = "inventory_items_protocol_compound_id_fkey"
const HINTED = `protocol_compounds!${FK}!inner(`

/** `readStock`'s select in `lib/notifications/checkupFacts.ts` on `main`
 *  (a938d5a, line 220), verbatim. */
const MAIN_CHECKUP_STOCK =
  "id, protocol_compound_id, reconstituted_on, protocol_compounds!inner(is_active, compounds(name))"

/** A bare embed of either table: `x(`, `x!inner(` or `x!left(`, alias or not.
 *  A hinted one (`x!<key>…(`) does not match. */
const BARE_EMBED = /\b(protocol_compounds|inventory_items)\s*(?:!(?:inner|left))?\s*\(/

function sourceFiles(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) sourceFiles(path, out)
    else if (/\.(ts|tsx|mts|js|mjs)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name)) {
      out.push(path)
    }
  }
  return out
}

/** Every string literal and template chunk in a file, comments excluded. */
function stringsIn(path: string, text: string): string[] {
  const kind = path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const file = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, false, kind)
  const out: string[] = []
  const visit = (node: ts.Node) => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      out.push(node.text)
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  return out
}

/** The strings in the app's own code that mention either table. */
function candidateStrings(): Array<{ file: string; text: string }> {
  const files = ["lib", "app", "components", "scripts", join("supabase", "functions")].flatMap(
    (d) => sourceFiles(join(ROOT, d)),
  )
  const out: Array<{ file: string; text: string }> = []
  for (const path of files) {
    const text = readFileSync(path, "utf8")
    if (!text.includes("protocol_compounds") && !text.includes("inventory_items")) continue
    for (const s of stringsIn(path, text)) out.push({ file: relative(ROOT, path), text: s })
  }
  return out
}

describe("embeds between inventory_items and protocol_compounds (cold review B1)", () => {
  it("the detector tells a bare embed from a hinted one", () => {
    expect(BARE_EMBED.test("id, protocol_compounds!inner(is_active)")).toBe(true)
    expect(BARE_EMBED.test("id, protocol_compounds(is_active)")).toBe(true)
    expect(BARE_EMBED.test("id, pc:protocol_compounds!left (is_active)")).toBe(true)
    expect(BARE_EMBED.test("id, inventory_items(id)")).toBe(true)
    expect(BARE_EMBED.test(`id, ${HINTED}is_active)`)).toBe(false)
    expect(BARE_EMBED.test("protocol_compounds.is_active")).toBe(false)
    expect(BARE_EMBED.test("inventory_items")).toBe(false)
    // The check-ups' stock read on `main` (a938d5a, `checkupFacts.ts`), which
    // this branch does not have: once merged, the scan below flags it until the
    // merge hints it (026, step 0 c).
    expect(BARE_EMBED.test(MAIN_CHECKUP_STOCK)).toBe(true)
    expect(
      BARE_EMBED.test(MAIN_CHECKUP_STOCK.replace("protocol_compounds!inner(", HINTED)),
    ).toBe(false)
  })

  it("no select in the app embeds either table without naming the key", () => {
    const bare = candidateStrings().filter((s) => BARE_EMBED.test(s.text))
    expect(
      bare.map((s) => `${s.file}: ${s.text.slice(0, 120)}`),
      `Name the key: ${HINTED}...)`,
    ).toEqual([])
  })

  it("the reads that join them are hinted", () => {
    const hinted = candidateStrings().filter((s) => s.text.includes(HINTED))
    const files = new Set(hinted.map((s) => s.file))
    // Stock (both column lists share one embed) and the low-stock push. A
    // superset, not an exact list: the merge with `main` adds the check-ups'
    // read (`lib/notifications/checkupFacts.ts`), hinted, and any later read
    // that names the key is right too. A read that does NOT name it is the
    // failure, and the scan above catches that wherever it is.
    expect([...files]).toEqual(
      expect.arrayContaining([
        join("lib", "db", "inventory.ts"),
        join("lib", "notifications", "reminders.ts"),
      ]),
    )
  })

  it("the hint is the key the schema declares, and nothing renames or drops it", () => {
    // Declared inline in `inventory_items`, so Postgres names it
    // `<table>_<column>_fkey`. The live catalogue has it under that name
    // (checked read-only in the cold review).
    const schema = readFileSync(join(ROOT, "supabase", "trackd_schema_v0_4_2.sql"), "utf8")
    const table = schema.slice(schema.indexOf("CREATE TABLE inventory_items ("))
    expect(table.slice(0, table.indexOf(");"))).toMatch(
      /protocol_compound_id\s+uuid\s+NOT NULL\s+REFERENCES\s+protocol_compounds\(id\)/,
    )
    const sql = (dir: string): string[] =>
      existsSync(dir)
        ? readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
            e.isDirectory() ? sql(join(dir, e.name)) : e.name.endsWith(".sql") ? [join(dir, e.name)] : [],
          )
        : []
    const touches = sql(join(ROOT, "supabase")).filter((f) =>
      new RegExp(`(DROP|RENAME)\\s+CONSTRAINT\\s+(IF\\s+EXISTS\\s+)?${FK}`, "i").test(
        readFileSync(f, "utf8"),
      ),
    )
    expect(touches).toEqual([])
  })
})
