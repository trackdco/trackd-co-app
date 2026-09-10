import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import { DESKTOP_QUERY } from "@/lib/desktop/breakpoint"

/**
 * THE PROMISE THIS SUITE PINS
 *
 * Desktop was built on one commitment: **nothing below 1024px changes**. The
 * phone renders from the same components it always did, and the entire desktop
 * layer lives inside a media query it never matches.
 *
 * That promise has exactly one way to break, and it is a quiet one. Somebody
 * adds a desktop rule to `app/desktop.css` and puts it OUTSIDE the `@media`
 * block — a stray closing brace, a rule appended after the block, a helper class
 * written at the top of the file "just for a second". Nothing errors. The build
 * passes. Every desktop screenshot still looks right. And a phone somewhere
 * starts rendering a rule that was never meant for it.
 *
 * A component snapshot would not catch that: the DOM is identical either way,
 * which is the whole point of the CSS-placement approach. What has to be
 * asserted is the STYLESHEET's shape, so that is what this does. It parses the
 * file and insists every declaration is nested inside a media query that carries
 * both halves of the breakpoint.
 *
 * The second test guards the other drift: the query is stated twice, once in CSS
 * and once in TypeScript, and if the two ever disagree the JS half would gate
 * work for a viewport the CSS half is already laying out (or the reverse).
 */

const CSS_PATH = fileURLToPath(new URL("../../app/desktop.css", import.meta.url))
const css = readFileSync(CSS_PATH, "utf8")

/** Strip `/* … *\/` comments so a brace or selector inside prose is not parsed. */
function stripComments(input: string): string {
  return input.replace(/\/\*[\s\S]*?\*\//g, "")
}

/**
 * Every at-rule prelude that opens a block at the TOP level of the file, paired
 * with the raw text that sits at the top level outside any block.
 */
function scanTopLevel(input: string): {
  blocks: string[]
  looseText: string
} {
  const blocks: string[] = []
  let looseText = ""
  let depth = 0
  let prelude = ""

  for (const char of input) {
    if (char === "{") {
      if (depth === 0) {
        blocks.push(prelude.trim())
        prelude = ""
      }
      depth += 1
      continue
    }
    if (char === "}") {
      depth = Math.max(0, depth - 1)
      continue
    }
    if (depth === 0) {
      // A `;` at the top level ends a statement that opened no block (the
      // `@custom-variant` declaration). Without this reset its text would be
      // carried forward and reported as part of the NEXT block's prelude.
      if (char === ";") {
        looseText += char
        prelude = ""
        continue
      }
      prelude += char
      looseText += char
    }
  }
  return { blocks, looseText }
}

describe("the desktop layer cannot reach a phone", () => {
  const bare = stripComments(css)
  const { blocks, looseText } = scanTopLevel(bare)

  it("opens every top-level block with the desktop media query", () => {
    // `@custom-variant` is a Tailwind declaration, not a block, so it never
    // appears here. Anything that DOES open a block at the top of this file has
    // to be a media query carrying the full breakpoint.
    expect(blocks.length).toBeGreaterThan(0)
    for (const prelude of blocks) {
      expect(
        prelude.startsWith("@media"),
        `Top-level block "${prelude}" is not a media query. Every rule in ` +
          `desktop.css must sit inside the desktop media query, or it reaches phones.`,
      ).toBe(true)
      expect(
        prelude.includes("min-width: 1024px"),
        `Media query "${prelude}" is missing the width half of the breakpoint.`,
      ).toBe(true)
      expect(
        prelude.includes("pointer: fine"),
        `Media query "${prelude}" is missing the pointer half of the breakpoint. ` +
          `Width alone hands the desktop shell to a touch-only iPad in landscape.`,
      ).toBe(true)
    }
  })

  it("declares nothing at the top level except @custom-variant", () => {
    // Whatever is left once the blocks are accounted for should be the variant
    // declaration and nothing else. A stray `.foo { … }` shows up in `blocks`
    // above; a stray bare declaration shows up here.
    const leftovers = looseText
      .split(";")
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !line.startsWith("@custom-variant"))
      // The prelude of each media query is consumed into `blocks`, but its text
      // also lands here since it precedes a `{`. Drop those.
      .filter((line) => !line.startsWith("@media"))

    expect(
      leftovers,
      "desktop.css has top-level declarations outside the media query. " +
        "Those apply to phones.",
    ).toEqual([])
  })

  it("states the same breakpoint in CSS and in TypeScript", () => {
    // `DESKTOP_QUERY` is what gates the rail's client-side work; the CSS is what
    // lays the shell out. If they disagree, one of the two is wrong for some
    // real viewport and the symptom (an empty rail, or a phone doing desktop
    // work) is a long way from the cause.
    expect(DESKTOP_QUERY).toBe("(min-width: 1024px) and (pointer: fine)")
    expect(bare).toContain(`@media ${DESKTOP_QUERY}`)
    expect(bare).toContain(`@custom-variant desktop (@media ${DESKTOP_QUERY})`)
  })
})
