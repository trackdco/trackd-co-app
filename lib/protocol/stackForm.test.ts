import { describe, expect, it } from "vitest"

import { stackSaveIssue } from "@/lib/protocol/stackForm"

describe("SW: the stack sheet's Save says why it cannot save", () => {
  it("a stack with a member saves", () => {
    expect(stackSaveIssue(1, 3)).toBeNull()
    expect(stackSaveIssue(2, 0)).toBeNull()
  })
  it("no member, compounds to tick: asks for a tick", () => {
    expect(stackSaveIssue(0, 2)).toBe("Tick a compound to save this stack.")
  })
  it("no member and nothing to tick: points at adding one", () => {
    expect(stackSaveIssue(0, 0)).toBe("Add a compound to save this stack.")
  })
})
