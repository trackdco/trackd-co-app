import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

/**
 * Cold review D15: onboarding's welcome said "You're in, {name}!" and "You're
 * in!". The app's copy has no exclamation marks; the one exception is "Trakabl
 * is going paid!" (ruling 6), which is not on this screen. Read from the
 * screen's source, since the screen needs the whole onboarding flow to render.
 */
const source = readFileSync(
  fileURLToPath(new URL("../../components/onboarding/screens/welcome.tsx", import.meta.url)),
  "utf8",
)
  // Comments may quote the old copy; only the code counts.
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:])\/\/.*$/gm, "$1")

/** Every string and template literal in the screen's code. */
const literals = [...source.matchAll(/(["'`])((?:\\.|(?!\1)[^\\])*)\1/g)].map((m) => m[2])

describe("the welcome screen's words (D15)", () => {
  it("greets with and without a name, with a full stop", () => {
    expect(literals).toContain("You're in, ${name}.")
    expect(literals).toContain("You're in.")
  })

  it("has no exclamation mark anywhere in its copy", () => {
    const shown = literals.filter((l) => /[A-Za-z]/.test(l) && !l.startsWith("@/") && !l.startsWith("."))
    for (const l of shown) expect(l, l).not.toContain("!")
    // JSX text between tags, too (not only literals).
    const jsxText = [...source.matchAll(/>([^<>{}]*[A-Za-z][^<>{}]*)</g)].map((m) => m[1])
    for (const t of jsxText) expect(t, t).not.toContain("!")
  })
})
