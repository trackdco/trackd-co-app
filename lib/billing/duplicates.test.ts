import { describe, expect, it } from "vitest";

import { survivorOf } from "./duplicates";

/**
 * The property under test is not "it sorts". It is that TWO CONCURRENT REQUESTS
 * REACH THE SAME VERDICT, because if they do not they cancel each other's
 * subscription and the user ends up with none.
 */

const sub = (id: string, created: number) => ({ id, created });

describe("survivorOf", () => {
  it("has no winner in an empty list", () => {
    expect(survivorOf([])).toEqual({ winner: null, losers: [] });
  });

  it("keeps the only one", () => {
    const only = sub("sub_a", 100);
    expect(survivorOf([only])).toEqual({ winner: only, losers: [] });
  });

  it("keeps the OLDEST", () => {
    // Older is likelier to have a card behind it, an invoice against it, or a
    // user part-way through a 3DS challenge. Cancelling the thing furthest
    // along is the expensive direction.
    const old = sub("sub_zzz", 100);
    const recent = sub("sub_aaa", 200);
    const { winner, losers } = survivorOf([recent, old]);
    expect(winner).toBe(old);
    expect(losers).toEqual([recent]);
  });

  it("breaks a SAME-SECOND tie by id, which is the case that actually happens", () => {
    // `created` is second-resolution and the race that produces duplicates is
    // measured in milliseconds, so ties are the norm rather than the exception.
    const a = sub("sub_aaa", 100);
    const b = sub("sub_bbb", 100);
    expect(survivorOf([a, b]).winner).toBe(a);
    expect(survivorOf([b, a]).winner).toBe(a);
  });

  it("gives the SAME answer whatever order the list arrives in", () => {
    // Stripe's list order is not a contract, and two racers each get their own
    // response. This is the property the whole rule exists for.
    const subs = [
      sub("sub_ccc", 100),
      sub("sub_aaa", 100),
      sub("sub_bbb", 99),
      sub("sub_ddd", 101),
    ];
    const expected = survivorOf(subs).winner;
    expect(expected?.id).toBe("sub_bbb");

    const permutations = [
      [subs[3], subs[2], subs[1], subs[0]],
      [subs[1], subs[3], subs[0], subs[2]],
      [subs[2], subs[0], subs[3], subs[1]],
      [subs[0], subs[1], subs[2], subs[3]],
    ];
    for (const order of permutations) {
      expect(survivorOf(order).winner?.id).toBe("sub_bbb");
      expect(survivorOf(order).losers.map((s) => s.id).sort()).toEqual([
        "sub_aaa",
        "sub_ccc",
        "sub_ddd",
      ]);
    }
  });

  it("names every non-winner as a loser, so nothing is silently left running", () => {
    const subs = [sub("sub_a", 1), sub("sub_b", 2), sub("sub_c", 3)];
    const { winner, losers } = survivorOf(subs);
    expect(winner?.id).toBe("sub_a");
    expect(losers).toHaveLength(2);
    expect(losers.map((s) => s.id)).toEqual(["sub_b", "sub_c"]);
  });

  it("does not mutate the list it is given", () => {
    const subs = [sub("sub_z", 200), sub("sub_a", 100)];
    const before = subs.map((s) => s.id);
    survivorOf(subs);
    expect(subs.map((s) => s.id)).toEqual(before);
  });
});
