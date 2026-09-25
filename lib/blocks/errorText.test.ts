import { describe, expect, it } from "vitest"

import { blockErrorText } from "./errorText"

describe("blockErrorText", () => {
  it("turns a generic failure into the app's one line", () => {
    expect(blockErrorText("Could not close the block.", "close")).toBe("Couldn’t close. Try again.")
    expect(blockErrorText("could not extend the block", "extend")).toBe("Couldn’t extend. Try again.")
    expect(blockErrorText("Couldn't save.", "save")).toBe("Couldn’t save. Try again.")
  })

  it("says the same line when there is no answer", () => {
    expect(blockErrorText(undefined, "delete")).toBe("Couldn’t delete. Try again.")
    expect(blockErrorText(null, "delete")).toBe("Couldn’t delete. Try again.")
    expect(blockErrorText("   ", "delete")).toBe("Couldn’t delete. Try again.")
  })

  it("keeps a specific reason the person can act on", () => {
    expect(blockErrorText("That block has already finished.", "extend")).toBe(
      "That block has already finished.",
    )
    expect(
      blockErrorText("Trakabl is read only until you subscribe. Everything you've logged is still here.", "save"),
    ).toBe("Trakabl is read only until you subscribe. Everything you've logged is still here.")
  })
})
