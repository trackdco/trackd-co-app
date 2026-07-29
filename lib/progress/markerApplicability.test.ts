/**
 * Regression suite for Spec 04 · Sex-Specific Markers.
 *
 * The split itself is easy; the risk is the constraint around it — filtering must
 * change what a user can log GOING FORWARD without ever hiding, altering or
 * deleting what they already logged. These pin both halves, plus the three
 * judgement calls that are deliberately shared.
 */
import { describe, expect, it } from "vitest"

import {
  markerAppliesTo,
  markerApplicability,
} from "@/lib/progress/markerApplicability"

const MALE_ONLY = ["Erection Quality", "Gyno Symptoms"]
const FEMALE_ONLY = [
  "Clitoral Enlargement",
  "Voice Deepening",
  "Menstrual Changes",
]
/** The full shared set from the spec — all 31. */
const SHARED = [
  "Energy",
  "Libido",
  "Sleep Quality",
  "Mood",
  "Pumps",
  "Strength",
  "Recovery",
  "Motivation",
  "Focus",
  "Vascularity",
  "Muscle Fullness",
  "Appetite",
  "Aggression",
  "Water Retention",
  "Acne",
  "Night Sweats",
  "Joint Pain",
  "Bloating",
  "Injection Site Pain",
  "Insomnia",
  "Irritability",
  "Back Pumps",
  "Anxiety",
  "Headaches",
  "Oily Skin",
  "Breathlessness",
  "Hand Tremors",
  "Muscle Cramps",
  "Hot Flushes",
  "Hair Shedding",
  "Facial / Body Hair",
]

describe("the split", () => {
  it("covers all 36 catalogue markers", () => {
    expect(MALE_ONLY.length + FEMALE_ONLY.length + SHARED.length).toBe(36)
  })

  it("offers the male-only markers to male only", () => {
    for (const name of MALE_ONLY) {
      expect(markerApplicability(name)).toBe("male")
      expect(markerAppliesTo(name, "male")).toBe(true)
      expect(markerAppliesTo(name, "female")).toBe(false)
    }
  })

  it("offers the female-only markers to female only", () => {
    for (const name of FEMALE_ONLY) {
      expect(markerApplicability(name)).toBe("female")
      expect(markerAppliesTo(name, "female")).toBe(true)
      expect(markerAppliesTo(name, "male")).toBe(false)
    }
  })

  it("offers every shared marker to both", () => {
    for (const name of SHARED) {
      expect(markerApplicability(name)).toBe("shared")
      expect(markerAppliesTo(name, "male")).toBe(true)
      expect(markerAppliesTo(name, "female")).toBe(true)
    }
  })

  // The three judgement calls, named explicitly: both sexes track these for
  // opposite reasons, so restricting either would take a useful marker away from
  // half the users.
  it("keeps Hair Shedding, Facial / Body Hair and Hot Flushes shared", () => {
    for (const name of ["Hair Shedding", "Facial / Body Hair", "Hot Flushes"]) {
      expect(markerApplicability(name)).toBe("shared")
    }
  })
})

describe("no sex set", () => {
  // The body map falls back to the male figure when sex is null, because it has
  // to draw SOMETHING. Offering markers is a different question and must not
  // inherit that guess.
  it("shows shared markers only and never defaults to male", () => {
    for (const sex of [null, undefined, ""]) {
      for (const name of SHARED) expect(markerAppliesTo(name, sex)).toBe(true)
      for (const name of [...MALE_ONLY, ...FEMALE_ONLY]) {
        expect(markerAppliesTo(name, sex)).toBe(false)
      }
    }
  })
})

describe("the Cycle Changes rename", () => {
  // The rename lives in the DB (supabase/markers/001). Until it is applied the
  // catalogue still returns the old name, and the filter has to be right either
  // way — otherwise a female user loses the marker the moment the SQL runs, or
  // before it does.
  it("treats the pre-rename name identically", () => {
    expect(markerApplicability("Cycle Changes")).toBe("female")
    expect(markerAppliesTo("Cycle Changes", "female")).toBe(true)
    expect(markerAppliesTo("Cycle Changes", "male")).toBe(false)
  })
})

describe("unknown markers", () => {
  // A user's own custom markers, and anything added to the catalogue later, are
  // shared by default — the catalogue can grow without this file knowing.
  it("treats an unlisted marker as shared", () => {
    expect(markerApplicability("Some Custom Thing")).toBe("shared")
    expect(markerAppliesTo("Some Custom Thing", null)).toBe(true)
  })

  it("matches names case- and whitespace-insensitively", () => {
    expect(markerAppliesTo("  gyno symptoms ", "male")).toBe(true)
    expect(markerAppliesTo("GYNO SYMPTOMS", "female")).toBe(false)
  })
})
