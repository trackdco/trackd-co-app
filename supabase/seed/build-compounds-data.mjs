// Build the app's bundled compounds catalogue from the seed CSV.
//
// The CSV (supabase/seed/compounds.csv) is the single source of truth — the same
// file that seeds the database. This script emits a typed, read-only TS module
// the app imports so the Add-to-Stack search works offline (PWA) with no network
// round-trip. Re-run after editing the CSV:
//
//   node supabase/seed/build-compounds-data.mjs
//
// Output: lib/compounds-catalogue.ts (generated — do not edit by hand).

import fs from "node:fs"
import path from "node:path"

function parseCSV(text) {
  const rows = []
  let row = [],
    field = "",
    inQ = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else inQ = false
      } else field += c
    } else {
      if (c === '"') inQ = true
      else if (c === ",") {
        row.push(field)
        field = ""
      } else if (c === "\n") {
        row.push(field)
        rows.push(row)
        row = []
        field = ""
      } else if (c === "\r") {
        /* skip */
      } else field += c
    }
  }
  if (field.length || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

const seedDir = import.meta.dirname
const csvPath = path.join(seedDir, "compounds.csv")
const outPath = path.join(seedDir, "..", "..", "lib", "compounds-catalogue.ts")

// Allowed values — keep in lockstep with lib/compound-categories.ts (the
// CompoundCategory union + the form option lists). A CSV typo here fails the
// build loudly instead of baking an invalid value into the bundle.
const VALID = {
  category: new Set([
    "anabolic", "oral", "sarm", "peptide",
    "ancillary", "thyroid", "supplement", "stimulant",
  ]),
  default_unit: new Set(["mg", "mcg", "iu", "g", "capsule"]),
  default_route: new Set(["im", "subq", "po", "nasal"]),
  default_inventory_type: new Set(["reconstituted", "preconcentrated", "oral_solid"]),
}

const rows = parseCSV(fs.readFileSync(csvPath, "utf8")).filter((r) => r.length > 1)
const header = rows[0].map((h) => h.trim())
const data = rows.slice(1)
const idx = Object.fromEntries(header.map((h, i) => [h, i]))

for (const r of data) {
  const name = (r[idx.name] ?? "").trim()
  for (const col of Object.keys(VALID)) {
    const value = (r[idx[col]] ?? "").trim()
    if (!VALID[col].has(value)) {
      throw new Error(
        `Invalid ${col} "${value}" for compound "${name}" in compounds.csv. ` +
          `Allowed: ${[...VALID[col]].join(", ")}`
      )
    }
  }
}

const compounds = data
  .map((r) => {
    const aliasesRaw = (r[idx.aliases] ?? "").trim()
    const aliases = aliasesRaw
      ? aliasesRaw.split(",").map((a) => a.trim()).filter(Boolean)
      : []
    const hl = (r[idx.half_life_hours] ?? "").trim()
    return {
      name: r[idx.name].trim(),
      category: r[idx.category].trim(),
      aliases,
      defaultUnit: r[idx.default_unit].trim(),
      defaultRoute: r[idx.default_route].trim(),
      defaultInventoryType: r[idx.default_inventory_type].trim(),
      halfLifeHours: hl ? Number(hl) : null,
    }
  })
  .sort((a, b) => a.name.localeCompare(b.name))

const banner =
  "// GENERATED FILE — do not edit by hand.\n" +
  "// Source: supabase/seed/compounds.csv (the single source of truth).\n" +
  "// Regenerate: node supabase/seed/build-compounds-data.mjs\n"

const out = `${banner}
import type { Compound } from "@/lib/compound-categories"

export const COMPOUNDS: Compound[] = ${JSON.stringify(compounds, null, 2)}
`

fs.writeFileSync(outPath, out)
console.log(`Wrote ${compounds.length} compounds → ${path.relative(path.join(seedDir, "..", ".."), outPath)}`)
