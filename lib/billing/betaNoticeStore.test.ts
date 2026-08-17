import { describe, expect, it } from "vitest";

import { betaNoticeSeen, withBetaNoticeSeen } from "./betaNoticeStore";

/**
 * D90 — ONE PERSON'S DISMISSAL MUST NOT CONSUME ANOTHER'S NOTICE.
 *
 * The behaviour these pin was found by driving, not by reading
 * (`scratchpad/harness/notice.scenario.ts`): A dismissed, B signed into the same
 * browser and dismissed, and A's notice came back because the cookie held one id
 * and B's write had replaced it.
 *
 * ⚠️ Rejecting a mismatch on read was NEVER the missing half — `betaNoticeSeen`
 * always did that, which is why B never inherited A's dismissal. The missing half
 * was on the WRITE. So most of what is worth pinning here is `withBetaNoticeSeen`.
 */

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";

describe("betaNoticeSeen", () => {
  it("is false with no cookie at all", () => {
    // ABSENT. Nobody has dismissed it, so the notice shows.
    expect(betaNoticeSeen(undefined, A)).toBe(false);
    expect(betaNoticeSeen(null, A)).toBe(false);
    expect(betaNoticeSeen("", A)).toBe(false);
  });

  it("is true only for an account actually in the list", () => {
    const value = withBetaNoticeSeen(withBetaNoticeSeen(null, A), B);
    expect(betaNoticeSeen(value, A)).toBe(true);
    expect(betaNoticeSeen(value, B)).toBe(true);
    // ⚠️ THE LEAK DIRECTION, which was always closed and must stay closed: a
    // third account is not silenced by the other two.
    expect(betaNoticeSeen(value, C)).toBe(false);
  });

  /**
   * ⚠️ An unreadable value answers "not seen", so the notice SHOWS. For this one
   * surface that is the correct failure direction: a second going-paid notice
   * costs an interruption, a suppressed one costs somebody their only warning
   * (06 §7). It must never be inverted into a silence.
   */
  it("treats a malformed value as nobody having dismissed it", () => {
    expect(betaNoticeSeen("~~~", A)).toBe(false);
    expect(betaNoticeSeen("not-a-uuid", A)).toBe(false);
    expect(betaNoticeSeen("%%%not-decodable", A)).toBe(false);
  });

  it("never matches an empty user id against a stray separator", () => {
    // A blank id is "we do not know who this is", which is not a dismissal.
    expect(betaNoticeSeen(`${A}~`, "")).toBe(false);
  });
});

describe("withBetaNoticeSeen — D90's actual fix", () => {
  it("keeps the earlier account when a second one dismisses", () => {
    const afterA = withBetaNoticeSeen(null, A);
    const afterB = withBetaNoticeSeen(afterA, B);

    // The regression this exists for, stated as directly as it can be:
    expect(betaNoticeSeen(afterB, A), "B's dismissal consumed A's notice").toBe(true);
    expect(betaNoticeSeen(afterB, B)).toBe(true);
  });

  it("does not grow when the same account dismisses twice", () => {
    const once = withBetaNoticeSeen(null, A);
    const twice = withBetaNoticeSeen(once, A);
    expect(twice).toBe(once);
    expect(twice.split("~")).toHaveLength(1);
  });

  it("caps the list and evicts the OLDEST, never the newest", () => {
    const ids = Array.from(
      { length: 10 },
      (_, i) => `0000000${i}-0000-4000-8000-000000000000`,
    );
    const value = ids.reduce<string>((acc, id) => withBetaNoticeSeen(acc, id), "");
    const kept = value.split("~");

    expect(kept).toHaveLength(8);
    // The two oldest are gone...
    expect(betaNoticeSeen(value, ids[0])).toBe(false);
    expect(betaNoticeSeen(value, ids[1])).toBe(false);
    // ...and the account that just dismissed is definitely still there. An
    // eviction that dropped the newest would re-show the notice to the very
    // person who had just closed it.
    expect(betaNoticeSeen(value, ids[9])).toBe(true);
  });
});
