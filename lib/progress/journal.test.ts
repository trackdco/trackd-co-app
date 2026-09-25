import { describe, expect, it } from "vitest";

import {
  attachmentsAsPhotos,
  bodyFirstLine,
  entryRestoreInput,
  groupJournalByMonth,
  type JournalEntry,
} from "./journal";

const entry = (over: Partial<JournalEntry> = {}): JournalEntry => ({
  id: "e1",
  date: "2026-09-24",
  body: "Slept well.\nTrained legs.",
  markers: [
    { markerId: "m-energy", name: "Energy", tierValue: 4, word: "Charged" },
    { markerId: "own:u1", name: "Neck pain", tierValue: 2, word: "Mild" },
  ],
  attachments: [],
  ...over,
});

describe("bodyFirstLine", () => {
  it("skips blank lines to the first with words", () => {
    expect(bodyFirstLine("\n  \nSecond line\nThird")).toBe("Second line");
  });
  it("is null for no note or an empty one", () => {
    expect(bodyFirstLine(null)).toBeNull();
    expect(bodyFirstLine("  \n ")).toBeNull();
  });
});

describe("entryRestoreInput (the Undo for a deleted entry)", () => {
  it("writes back the day's note and markers exactly", () => {
    expect(entryRestoreInput(entry())).toEqual({
      entryDate: "2026-09-24",
      touchBody: true,
      body: "Slept well.\nTrained legs.",
      markers: [
        { markerId: "m-energy", tierValue: 4 },
        { markerId: "own:u1", tierValue: 2 },
      ],
    });
  });

  it("restores a markers-only entry with an empty note", () => {
    const r = entryRestoreInput(entry({ body: null }));
    expect(r?.body).toBe("");
    expect(r?.markers).toHaveLength(2);
  });

  it("offers no Undo when the entry had photos (their files are gone)", () => {
    expect(entryRestoreInput(entry({ attachments: [{ id: "a1", url: "blob:x" }] }))).toBeNull();
  });

  it("offers no Undo for an entry with nothing in it", () => {
    expect(entryRestoreInput(entry({ body: "  ", markers: [] }))).toBeNull();
  });
});

describe("attachmentsAsPhotos", () => {
  it("puts every signed photo on the entry's day, in order, with no pose or weight", () => {
    const photos = attachmentsAsPhotos(
      [
        { id: "a1", url: "https://x/1" },
        { id: "a2", url: null },
        { id: "a3", url: "https://x/3" },
      ],
      "2026-09-24",
    );
    expect(photos.map((p) => p.id)).toEqual(["a1", "a3"]);
    expect(photos.every((p) => p.date === "2026-09-24" && p.pose === "" && p.weightKg === null)).toBe(true);
  });
});

describe("groupJournalByMonth", () => {
  it("groups newest month first and keeps each month's order", () => {
    const groups = groupJournalByMonth([
      entry({ id: "a", date: "2026-09-24" }),
      entry({ id: "b", date: "2026-09-02" }),
      entry({ id: "c", date: "2026-08-30" }),
    ]);
    expect(groups.map((g) => [g.key, g.label, g.entries.map((e) => e.id)])).toEqual([
      ["2026-09", "September 2026", ["a", "b"]],
      ["2026-08", "August 2026", ["c"]],
    ]);
  });
});
