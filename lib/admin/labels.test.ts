import { describe, expect, it } from "vitest"

import { RUNNING_TAGS, STRUGGLE_TAGS } from "@/lib/onboarding/session"

import { RUNNING_LABELS, STRUGGLE_LABELS, labelFor } from "./labels"

/**
 * THE DRIFT GUARD.
 *
 * The dashboard's labels are restated rather than imported, because the
 * onboarding source of truth (`components/onboarding/screens/intent.tsx`) pairs
 * each label with a `ReactNode` icon and `lib/` may not import React.
 *
 * Duplication is only acceptable when something checks it. These tests are that
 * something: add a tag to the onboarding flow without adding it here and the
 * suite fails, instead of /admin quietly ranking a raw `blast_cruise` key
 * alongside properly-labelled rows.
 *
 * Note the direction — EVERY tag needs a label, including the retired ones. A
 * tag is removed from the OFFER, never from the PARSER, so an account created
 * before a retirement still holds it and it still has to render as words.
 */

describe("onboarding label coverage", () => {
  it("labels every running tag, retired ones included", () => {
    const missing = RUNNING_TAGS.filter((tag) => !(tag in RUNNING_LABELS))
    expect(missing).toEqual([])
  })

  it("labels every struggle tag, retired ones included", () => {
    const missing = STRUGGLE_TAGS.filter((tag) => !(tag in STRUGGLE_LABELS))
    expect(missing).toEqual([])
  })

  it("has no label for a tag that does not exist", () => {
    const stray = Object.keys(RUNNING_LABELS).filter(
      (key) => !(RUNNING_TAGS as readonly string[]).includes(key)
    )
    expect(stray).toEqual([])
  })

  it("has no struggle label for a tag that does not exist", () => {
    const stray = Object.keys(STRUGGLE_LABELS).filter(
      (key) => !(STRUGGLE_TAGS as readonly string[]).includes(key)
    )
    expect(stray).toEqual([])
  })
})

describe("labelFor", () => {
  it("returns the label when known", () => {
    expect(labelFor(RUNNING_LABELS, "trt")).toBe("TRT / hormone optimisation")
  })

  it("falls back to the raw key so nothing ever renders blank", () => {
    expect(labelFor(RUNNING_LABELS, "something_new")).toBe("something_new")
  })
})
