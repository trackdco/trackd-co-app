import { describe, expect, it } from "vitest"

import {
  JOURNAL_READ_FAILED,
  POINTER_ECHO_MS,
  focusBackToPlus,
  isPointerEcho,
  journalOpen,
  weightPageHref,
} from "@/lib/shortcuts/quickActions"

describe("S3: the + takes every activation once", () => {
  it("drops the click a press sends after it (the press already toggled)", () => {
    expect(isPointerEcho(1_000, 990)).toBe(true)
    expect(isPointerEcho(1_000, 1_000)).toBe(true)
  })

  it("takes a click that came with no press at all, whatever its detail says", () => {
    // Enter, Space, a switch, or a screen reader's activation.
    expect(isPointerEcho(1_000, null)).toBe(false)
  })

  it("takes a click that comes long after the last press", () => {
    expect(isPointerEcho(10_000, 10_000 - POINTER_ECHO_MS)).toBe(false)
    expect(isPointerEcho(10_000, 2_000)).toBe(false)
  })

  it("never counts a press that ended after the click", () => {
    expect(isPointerEcho(1_000, 1_050)).toBe(false)
  })
})

describe("F12: focus goes back to the + only after a keyboard", () => {
  it("leaves no ring on the + after a touch", () => {
    expect(focusBackToPlus("pointer", "dismiss")).toBe(false)
    expect(focusBackToPlus(null, "dismiss")).toBe(false)
  })

  it("hands focus back after the keyboard opened it", () => {
    expect(focusBackToPlus("keyboard", "dismiss")).toBe(true)
  })

  it("hands focus back on Escape, which is a key", () => {
    expect(focusBackToPlus("pointer", "escape")).toBe(true)
  })

  it("does not pull focus to the + as a flow opens", () => {
    expect(focusBackToPlus("keyboard", "pick")).toBe(false)
    expect(focusBackToPlus("pointer", "pick")).toBe(false)
  })
})

describe("W44: Weight opens the Weight page behind the pad", () => {
  it("goes to the Weight page from anywhere else", () => {
    for (const p of ["/dashboard", "/protocol/stacks", "/progress", "/calculator", "/blocks"]) {
      expect(weightPageHref(p)).toBe("/weight")
    }
  })

  it("stays put on the Weight page, and on the signed-out previews", () => {
    expect(weightPageHref("/weight")).toBeNull()
    expect(weightPageHref("/preview/home")).toBeNull()
    expect(weightPageHref("/preview")).toBeNull()
  })

  it("does not mistake a path that only starts with the word", () => {
    expect(weightPageHref("/previewer")).toBe("/weight")
  })
})

describe("W11: the + opens the full-page writer, never on a failed read", () => {
  const read = { ok: true as const, entries: [{ date: "2026-09-26" }], options: [{ id: "energy" }] }

  it("opens the writer with the journal it read", () => {
    expect(journalOpen(read, "/dashboard")).toEqual({ kind: "open", entries: read.entries, options: read.options })
  })

  it("refuses on a failed read, so today's note is never saved over by an empty writer", () => {
    expect(journalOpen({ ok: false }, "/protocol")).toEqual({ kind: "refuse", message: JOURNAL_READ_FAILED })
    expect(JOURNAL_READ_FAILED).not.toMatch(/[—!]/)
  })

  it("opens empty on a preview page, which has no session and nothing to overwrite", () => {
    expect(journalOpen({ ok: false }, "/preview/protocol")).toEqual({ kind: "open", entries: [], options: [] })
  })
})
