import { describe, expect, it } from "vitest";

import type { JournalEntry, MarkerOption } from "./journal";
import {
  draftOnRead,
  draftSnapshot,
  entriesAfterSave,
  isSavedDraft,
  journalSaveBlock,
  markersTileWord,
  mergeRatedIntoRows,
  mergeTypedNote,
  ratedRows,
  rowsFromEntry,
  uploadLands,
} from "./journalDraft";

const TODAY = "2026-09-26";
const EARLIER = "2026-09-20";

const entries: JournalEntry[] = [
  {
    id: "e1",
    date: TODAY,
    body: "Today's note",
    markers: [{ markerId: "energy", name: "Energy", tierValue: 4, word: "High" }],
    attachments: [],
  },
  {
    id: "e2",
    date: EARLIER,
    body: "The 20th's own note",
    markers: [{ markerId: "sleep", name: "Sleep", tierValue: 2, word: "Fair" }],
    attachments: [{ id: "a1", url: "https://x/a1" }],
  },
];

const option = (id: string, name: string, tierLabels: string[]): MarkerOption => ({
  id,
  name,
  polarity: "positive",
  tierLabels,
  isDefault: true,
  kind: "catalogue",
  addable: true,
});

describe("B5: the journal read landing after the day changed, or after typing", () => {
  // Ported from the cold review's proof (tests/home/homeJournal.test.ts): the
  // card opened on today, the 20th was picked before the read landed.
  it("fills the day shown NOW, never the day the card was opened on", () => {
    const d = draftOnRead(entries, EARLIER, null);
    expect(d).toEqual({ body: "The 20th's own note", rows: [{ markerId: "sleep", tierValue: 2 }] });
    // ...so the save sends the 20th's own note and markers to the 20th.
    expect(ratedRows(d.rows)).toEqual([{ markerId: "sleep", tierValue: 2 }]);
  });

  it("keeps what was typed while the read was out, on a day with no entry", () => {
    const d = draftOnRead([entries[0]], EARLIER, "Slept badly, left delt sore");
    expect(d.body).toBe("Slept badly, left delt sore");
    expect(d.rows).toEqual([]);
  });

  it("keeps both the day's saved note and the typing, so neither is lost", () => {
    expect(draftOnRead(entries, TODAY, "Pumped after legs").body).toBe("Today's note\n\nPumped after legs");
  });

  it("untouched or blank typing takes the saved note", () => {
    expect(mergeTypedNote("Saved", null)).toBe("Saved");
    expect(mergeTypedNote("Saved", "   ")).toBe("Saved");
    expect(mergeTypedNote(null, null)).toBe("");
  });

  it("typing that already holds the saved note is not doubled", () => {
    expect(mergeTypedNote("Saved", "Saved")).toBe("Saved");
    expect(mergeTypedNote("Saved", "Saved and more")).toBe("Saved and more");
  });
});

describe("B6 and F11: the rows a dialer reports", () => {
  it("a dialer that reports only ratings keeps the rows not rated yet", () => {
    const rows = [
      { markerId: "energy", tierValue: 0 },
      { markerId: "mood", tierValue: 3 },
    ];
    expect(mergeRatedIntoRows(rows, [{ markerId: "energy", tierValue: 4 }])).toEqual([
      { markerId: "energy", tierValue: 4 },
      { markerId: "mood", tierValue: 0 },
    ]);
  });

  it("a newly rated marker joins at the end", () => {
    expect(mergeRatedIntoRows([], [{ markerId: "energy", tierValue: 4 }])).toEqual([{ markerId: "energy", tierValue: 4 }]);
  });

  // The proof's sequence: rate Energy, look at Photos, come back. The draft
  // keeps Energy, and it is what the dialer is handed back.
  it("the draft still holds the rating after another tile", () => {
    const afterRating = mergeRatedIntoRows([], [{ markerId: "energy", tierValue: 4 }]);
    expect(afterRating.map((m) => [m.markerId, m.tierValue])).toEqual([["energy", 4]]);
  });

  it("the save sends only rated rows, in order", () => {
    expect(
      ratedRows([
        { markerId: "a", tierValue: 0 },
        { markerId: "b", tierValue: 2 },
        { markerId: "c", tierValue: 5 },
      ]),
    ).toEqual([
      { markerId: "b", tierValue: 2 },
      { markerId: "c", tierValue: 5 },
    ]);
  });

  it("F11: after Add 3 with none rated, the tile says Not rated, not None", () => {
    const three = ["energy", "libido", "acne"].map((markerId) => ({ markerId, tierValue: 0 }));
    expect(markersTileWord(three)).toBe("Not rated");
    expect(markersTileWord([{ markerId: "energy", tierValue: 3 }, ...three.slice(1)])).toBe("1 noted");
    expect(markersTileWord([])).toBe("None");
  });

  it("an entry's saved markers are its starting rows", () => {
    expect(rowsFromEntry(entries[1])).toEqual([{ markerId: "sleep", tierValue: 2 }]);
    expect(rowsFromEntry(null)).toEqual([]);
  });
});

describe("Save says why it cannot save (ruling 10)", () => {
  const base = { read: "ready" as const, uploading: false, body: "", rows: [], photoCount: 0 };
  it("waits for the read, and says so", () => {
    expect(journalSaveBlock({ ...base, read: "loading", body: "Typed" })).toBe("Loading your journal…");
    expect(journalSaveBlock({ ...base, read: "failed", body: "Typed" })).toBe("Couldn’t load your journal.");
  });
  it("waits for a photo on its way", () => {
    expect(journalSaveBlock({ ...base, uploading: true, body: "x" })).toBe("Adding your photo…");
  });
  it("asks for something to save", () => {
    expect(journalSaveBlock(base)).toBe("Add a note, a marker or a photo first.");
    expect(journalSaveBlock({ ...base, rows: [{ markerId: "a", tierValue: 0 }] })).toBe("Rate a marker, or add a note, to save.");
  });
  it("where there is no note (Log markers), the reason never asks for one, and a hidden note does not count", () => {
    expect(journalSaveBlock({ ...base, noteShown: false })).toBe("Add a marker or a photo first.");
    expect(journalSaveBlock({ ...base, noteShown: false, rows: [{ markerId: "a", tierValue: 0 }] })).toBe("Rate a marker to save.");
    expect(journalSaveBlock({ ...base, noteShown: false, body: "kept, not shown" })).toBe("Add a marker or a photo first.");
  });
  it("a note, a rating or a photo is enough", () => {
    expect(journalSaveBlock({ ...base, body: "Legs" })).toBeNull();
    expect(journalSaveBlock({ ...base, rows: [{ markerId: "a", tierValue: 1 }] })).toBeNull();
    expect(journalSaveBlock({ ...base, photoCount: 1 })).toBeNull();
  });
  it("no reason is ever an em dash or an exclamation", () => {
    for (const r of [
      journalSaveBlock({ ...base, read: "loading" }),
      journalSaveBlock({ ...base, read: "failed" }),
      journalSaveBlock({ ...base, uploading: true, body: "x" }),
      journalSaveBlock(base),
    ]) {
      expect(r).not.toMatch(/[—!]/);
    }
  });
});

describe("W10: Saved until the next change", () => {
  const d = { date: TODAY, body: "Legs", rows: [{ markerId: "a", tierValue: 2 }] };
  it("is saved while nothing changed and nothing waits", () => {
    const snap = draftSnapshot(d);
    expect(isSavedDraft(snap, d, 0)).toBe(true);
    expect(isSavedDraft(snap, { ...d, body: "Legs." }, 0)).toBe(false);
    expect(isSavedDraft(snap, { ...d, date: EARLIER }, 0)).toBe(false);
    expect(isSavedDraft(snap, { ...d, rows: [{ markerId: "a", tierValue: 3 }] }, 0)).toBe(false);
    expect(isSavedDraft(snap, d, 1)).toBe(false);
    expect(isSavedDraft(null, d, 0)).toBe(false);
  });
  it("an unrated row added after the save does not undo Saved (it is not saved either way)", () => {
    const snap = draftSnapshot(d);
    expect(isSavedDraft(snap, { ...d, rows: [...d.rows, { markerId: "b", tierValue: 0 }] }, 0)).toBe(true);
  });
});

describe("S8: an upload belongs to the draft it started in", () => {
  it("attaches only under the same ticket", () => {
    expect(uploadLands(3, 3)).toBe("attach");
    // The day changed, or the card closed or reopened, while it uploaded.
    expect(uploadLands(3, 4)).toBe("discard");
  });
});

describe("entriesAfterSave: the card keeps showing the saved entry (W10)", () => {
  const options = [option("energy", "Energy", ["Low", "Okay", "Good", "High", "Peak"])];
  it("replaces the day's entry with what was saved, words filled in", () => {
    const next = entriesAfterSave(entries, {
      date: TODAY,
      body: "New note",
      rows: [
        { markerId: "energy", tierValue: 5 },
        { markerId: "mood", tierValue: 0 },
      ],
      options,
      photosAdded: [{ id: "u/1/photo.jpg", url: "blob:1" }],
    });
    const today = next.find((e) => e.date === TODAY)!;
    expect(today.id).toBe("e1");
    expect(today.body).toBe("New note");
    expect(today.markers).toEqual([{ markerId: "energy", name: "Energy", tierValue: 5, word: "Peak" }]);
    expect(today.attachments).toEqual([{ id: "u/1/photo.jpg", url: "blob:1" }]);
    expect(next.map((e) => e.date)).toEqual([TODAY, EARLIER]);
  });
  it("adds a new day's entry in date order, photos after the ones already there", () => {
    const next = entriesAfterSave(entries, {
      date: EARLIER,
      body: "",
      rows: [],
      options,
      photosAdded: [{ id: "p2", url: "blob:2" }],
    });
    const e = next.find((x) => x.date === EARLIER)!;
    expect(e.body).toBeNull();
    expect(e.attachments.map((a) => a.id)).toEqual(["a1", "p2"]);
    const fresh = entriesAfterSave(entries, { date: "2026-09-23", body: "Mid", rows: [], options, photosAdded: [] });
    expect(fresh.map((x) => x.date)).toEqual([TODAY, "2026-09-23", EARLIER]);
  });
});
