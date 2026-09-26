import { describe, expect, it } from "vitest"

import { pauseButtonLabel, resumeButtonLabel } from "@/lib/home/pauseLabels"

describe("SW: the Pause sheet's buttons say why they cannot act", () => {
  it("resume with nothing ticked names the missing tick", () => {
    expect(resumeButtonLabel(0, true)).toBe("Tick one to resume")
  })
  it("resume keeps its count and its plain verb", () => {
    expect(resumeButtonLabel(1, true)).toBe("Resume now")
    expect(resumeButtonLabel(3, true)).toBe("Resume 3 now")
    // One compound, no list of mates: it resumes itself.
    expect(resumeButtonLabel(0, false)).toBe("Resume now")
  })
  it("pause with nothing ticked names the missing tick, before the date", () => {
    expect(pauseButtonLabel(0, false)).toBe("Tick one to pause")
    expect(pauseButtonLabel(0, true)).toBe("Tick one to pause")
  })
  it("pause waiting on a date, then the verb", () => {
    expect(pauseButtonLabel(2, true)).toBe("Pick a date")
    expect(pauseButtonLabel(1, false)).toBe("Pause")
  })
})
