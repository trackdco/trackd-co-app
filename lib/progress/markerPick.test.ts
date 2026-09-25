import { describe, expect, it } from "vitest";

import type { MarkerOption } from "@/lib/progress/journal";
import {
  SUGGESTED_MARKERS,
  addableMarkers,
  asksBetterEnd,
  exactNameMatch,
  lastUsedToAdd,
  markerNamed,
  pickerSections,
  polarityFor,
  scaleWords,
  searchMarkers,
  searchPlaceholder,
  titleCaseMarkerName,
} from "@/lib/progress/markerPick";

const cat = (name: string, words: string[] = ["Low", "High"], addable = true): MarkerOption => ({
  id: `m-${name.toLowerCase().replace(/\W+/g, "-")}`,
  name,
  polarity: "neutral",
  tierLabels: words,
  isDefault: false,
  kind: "catalogue",
  addable,
});
const own = (name: string, addable = true): MarkerOption => ({
  id: `own:${name.toLowerCase().replace(/\W+/g, "-")}`,
  name,
  polarity: "neutral",
  tierLabels: ["None", "Some"],
  isDefault: false,
  kind: "custom",
  addable,
});

const OPTIONS: MarkerOption[] = [
  cat("Acne"),
  cat("Mood"),
  cat("Energy", ["Drained", "Flat", "Coasting", "Charged", "Wired"]),
  cat("Strength"),
  cat("Focus"),
  cat("Libido"),
  cat("Menstrual Changes", ["None", "Absent"], false), // not offered to this person
  cat("Sleep Quality"),
  own("Neck Pain"),
  own("Gut Feel"),
  own("Old One", false), // soft-removed
];
const id = (name: string) => OPTIONS.find((m) => m.name === name)!.id;

describe("addableMarkers", () => {
  it("drops markers already on the entry and markers that cannot be added", () => {
    const names = addableMarkers(OPTIONS, [id("Mood")]).map((m) => m.name);
    expect(names).not.toContain("Mood");
    expect(names).not.toContain("Menstrual Changes");
    expect(names).not.toContain("Old One");
    expect(names).toHaveLength(OPTIONS.length - 3);
  });
});

describe("pickerSections", () => {
  it("orders Suggested by the fixed list, skipping what is missing or on the entry", () => {
    const s = pickerSections(OPTIONS, [id("Libido")]);
    expect(s.suggested.map((m) => m.name)).toEqual(["Energy", "Sleep Quality", "Mood", "Strength"]);
  });

  it("puts your own markers under Yours, alphabetical, never a removed one", () => {
    expect(pickerSections(OPTIONS, []).yours.map((m) => m.name)).toEqual(["Gut Feel", "Neck Pain"]);
  });

  it("puts the rest of the catalogue under All, alphabetical, and each marker in one section only", () => {
    const s = pickerSections(OPTIONS, []);
    expect(s.all.map((m) => m.name)).toEqual(["Acne", "Focus"]);
    const every = [...s.suggested, ...s.yours, ...s.all].map((m) => m.id);
    expect(new Set(every).size).toBe(every.length);
    expect(every.length).toBe(addableMarkers(OPTIONS, []).length);
  });

  it("the suggested list is the settled one", () => {
    expect(SUGGESTED_MARKERS).toEqual([
      "Energy", "Libido", "Sleep Quality", "Mood", "Pumps", "Strength", "Recovery", "Motivation",
    ]);
  });
});

describe("searchPlaceholder", () => {
  it("counts what is left", () => {
    expect(searchPlaceholder(34)).toBe("Search 34 markers");
    expect(searchPlaceholder(1)).toBe("Search 1 marker");
    expect(searchPlaceholder(0)).toBe("Search markers");
  });
});

describe("searchMarkers", () => {
  it("ranks a name that starts with the query before one that contains it, then word matches", () => {
    const opts = [cat("Back Pumps"), cat("Pumps"), cat("Vascularity", ["Smooth", "Pumped"])];
    expect(searchMarkers(opts, [], "pump").map((m) => m.name)).toEqual(["Pumps", "Back Pumps", "Vascularity"]);
  });

  it("finds a marker by one of its words", () => {
    expect(searchMarkers(OPTIONS, [], "wir").map((m) => m.name)).toEqual(["Energy"]);
  });

  it("never returns what is on the entry or cannot be added", () => {
    expect(searchMarkers(OPTIONS, [id("Mood")], "mood")).toEqual([]);
    expect(searchMarkers(OPTIONS, [], "menstrual")).toEqual([]);
    expect(searchMarkers(OPTIONS, [], "old")).toEqual([]);
    expect(searchMarkers(OPTIONS, [], "  ")).toEqual([]);
  });

  it("knows an exact name, ignoring case", () => {
    expect(exactNameMatch(OPTIONS, " neck pain ")).toBe(true);
    expect(exactNameMatch(OPTIONS, "neck")).toBe(false);
    expect(exactNameMatch(OPTIONS, "menstrual changes")).toBe(false);
  });
});

describe("lastUsedToAdd", () => {
  it("keeps the previous entry's order and drops what is already on", () => {
    expect(lastUsedToAdd([id("Sleep Quality"), id("Energy"), id("Mood")], OPTIONS, [id("Energy")])).toEqual([
      id("Sleep Quality"),
      id("Mood"),
    ]);
  });

  it("drops unknown, removed and not-offered markers, and duplicates", () => {
    expect(
      lastUsedToAdd(["nope", id("Old One"), id("Menstrual Changes"), id("Acne"), id("Acne")], OPTIONS, []),
    ).toEqual([id("Acne")]);
  });

  it("is empty when everything is already on", () => {
    expect(lastUsedToAdd([id("Acne")], OPTIONS, [id("Acne")])).toEqual([]);
    expect(lastUsedToAdd([], OPTIONS, [])).toEqual([]);
  });
});

describe("create your own", () => {
  it("title-cases a name and keeps capitals as typed", () => {
    expect(titleCaseMarkerName("  neck   pain ")).toBe("Neck Pain");
    expect(titleCaseMarkerName("HRV dip")).toBe("HRV Dip");
    expect(titleCaseMarkerName("")).toBe("");
  });

  it("finds an addable marker already using a name", () => {
    expect(markerNamed(OPTIONS, "energy")?.name).toBe("Energy");
    expect(markerNamed(OPTIONS, "Old One")).toBeUndefined();
    expect(markerNamed(OPTIONS, "Menstrual changes")).toBeUndefined();
  });

  it("asks which end is better only for Level and own words", () => {
    expect(asksBetterEnd("severity")).toBe(false);
    expect(asksBetterEnd("quality")).toBe(false);
    expect(asksBetterEnd("level")).toBe(true);
    expect(asksBetterEnd("own")).toBe(true);
  });

  it("stores the axis the scale implies, or the one you picked", () => {
    expect(polarityFor("severity", "high")).toBe("negative");
    expect(polarityFor("quality", "low")).toBe("positive");
    expect(polarityFor("level", "high")).toBe("positive");
    expect(polarityFor("own", "low")).toBe("negative");
    expect(polarityFor("own", "neither")).toBe("neutral");
  });

  it("uses the filled own words, low to high", () => {
    expect(scaleWords("own", [" Calm", "", "Tense ", "", ""])).toEqual(["Calm", "Tense"]);
    expect(scaleWords("severity", [])).toEqual(["None", "Low", "Medium", "High", "Severe"]);
  });
});
