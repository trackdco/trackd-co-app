/**
 * The two paths that mint a `protocol_compounds` row from the device, and the
 * one rule both of them have to obey.
 *
 * Eleven of Adrian's compounds were hard-deleted from Postgres on 3 September
 * and were back twenty minutes later, rebuilt from his phone's cache. The
 * hydration flush had been given a guard; the migration batch had not, and one
 * unguarded path is all it takes. This pins the rule itself rather than either
 * implementation, so a third writer cannot quietly reopen it.
 */
import { describe, expect, it } from "vitest";

import type { StackCompound } from "@/lib/home/stack";

const compound = (over: Partial<StackCompound> = {}): StackCompound => ({
  id: "c1",
  name: "Testosterone Cypionate",
  category: "anabolic",
  method: "im",
  dose: 250,
  unit: "mg",
  schedule: { cadence: { type: "daily" }, timeOfDay: "08:00", startDate: "2026-07-01" },
  rotationSites: [],
  rotationIndex: 0,
  ...over,
});

/**
 * The shared rule, stated once: a compound earns a Postgres row unless it has
 * been DELETED and never carried a dose.
 *
 * Deleted-with-doses still earns one, and that exception is not negotiable:
 * `dose_logs.protocol_compound_id` is a foreign key, so dropping the compound
 * would strand the user's history.
 */
function needsRow(c: StackCompound, hasDoses: (id: string) => boolean): boolean {
  return !(c.archived && !hasDoses(c.id));
}

const none = () => false;
const all = () => true;

describe("a deleted compound with no doses is not rebuilt", () => {
  it("keeps a live compound", () => {
    expect(needsRow(compound(), none)).toBe(true);
  });

  it("drops a deleted compound that never carried a dose", () => {
    // Adrian's eleven: added to try the app out, deleted, never logged against.
    expect(needsRow(compound({ archived: true }), none)).toBe(false);
  });

  it("KEEPS a deleted compound that carried doses", () => {
    // His Creatine: deleted, but fifteen real doses hang off it by foreign key.
    expect(needsRow(compound({ archived: true }), all)).toBe(true);
  });

  it("keeps a live compound that has never been dosed", () => {
    // Added this morning, first dose tonight. Nothing deleted, nothing to skip.
    expect(needsRow(compound({ archived: false }), none)).toBe(true);
  });
});

describe("both writers apply it", () => {
  it("the migration batch skips deleted-and-undosed compounds", async () => {
    const src = await import("node:fs").then((fs) =>
      fs.promises.readFile("lib/home/protocolSync.ts", "utf8"),
    );
    expect(src).toContain("if (c.archived && !withDoses.has(c.id)) continue");
  });

  it("the hydration flush skips them too", async () => {
    const src = await import("node:fs").then((fs) =>
      fs.promises.readFile("lib/home/hydrateProtocol.ts", "utf8"),
    );
    expect(src).toContain("if (c.archived && !hasAnyLog(c.id)) continue");
  });
});
