/**
 * ⚠️ THE LOOP BOUND IS THE THING UNDER TEST.
 *
 * A recovery that re-signs on failure is one bad condition away from refreshing
 * a page forever. The two cases that matter are the two the founder named:
 *
 *   · an EXPIRED signed URL must recover without a manual reload
 *   · a DELETED object must NOT cause repeated refreshes
 *
 * Both are driven here as sequences, because a single call cannot show a bound —
 * the property is about what happens the SECOND time.
 */
import { readFileSync } from "node:fs";

import { describe, it, expect } from "vitest";

import {
  decideResign,
  signedObjectKey,
  MAX_REFRESHES_PER_MOUNT,
  type ResignState,
} from "./resignOnExpiry";

const ORIGIN = "https://boqqra.supabase.co";
const objectUrl = (path: string, token: string) =>
  `${ORIGIN}/storage/v1/object/sign/${path}?token=${token}`;

const fresh = (): ResignState => ({ attempted: new Set(), pending: false, fired: 0 });

/** What the React shell does on a `refresh: true`. Kept here so tests drive the
 *  real sequence rather than a simplified one. */
function record(state: ResignState, key: string): ResignState {
  state.attempted.add(key);
  state.pending = true;
  state.fired += 1;
  return state;
}

describe("signedObjectKey", () => {
  it("keys on the OBJECT, not the token — the token is what a re-sign changes", () => {
    const a = objectUrl("journal/user-1/entry/photo.jpg", "tokenAAA");
    const b = objectUrl("journal/user-1/entry/photo.jpg", "tokenBBB");
    expect(signedObjectKey(a)).toBe("journal/user-1/entry/photo.jpg");
    expect(signedObjectKey(a)).toBe(signedObjectKey(b));
  });

  it("tells signed storage URLs apart from everything else", () => {
    expect(signedObjectKey(objectUrl("avatars/u/avatar.webp", "t"))).toBe("avatars/u/avatar.webp");
    expect(signedObjectKey("/trackd-wordmark.png")).toBeNull();
    expect(signedObjectKey("https://example.com/cat.jpg")).toBeNull();
    expect(signedObjectKey("data:image/png;base64,AAAA")).toBeNull();
    expect(signedObjectKey(`${ORIGIN}/storage/v1/object/public/avatars/u/a.webp`)).toBeNull();
    expect(signedObjectKey("")).toBeNull();
    expect(signedObjectKey(null)).toBeNull();
    expect(signedObjectKey(undefined)).toBeNull();
  });

  it("decodes an escaped path so two spellings of one object share a key", () => {
    expect(signedObjectKey(objectUrl("journal/u/a%20b/photo.jpg", "t"))).toBe("journal/u/a b/photo.jpg");
  });
});

describe("⚠️ an EXPIRED image recovers", () => {
  it("refreshes once on the first failure", () => {
    const url = objectUrl("progress-photos/u/s/photo.jpg", "expired");
    expect(decideResign(url, fresh())).toEqual({
      refresh: true,
      key: "progress-photos/u/s/photo.jpg",
    });
  });

  it("a whole screen of expired images causes ONE refresh, not one each", () => {
    const state = fresh();
    const urls = Array.from({ length: 50 }, (_, i) =>
      objectUrl(`progress-photos/u/s${i}/photo.jpg`, "expired"),
    );

    let refreshes = 0;
    for (const url of urls) {
      const d = decideResign(url, state);
      if (d.refresh) { refreshes += 1; record(state, d.key); }
    }
    expect(refreshes).toBe(1);
  });
});

describe("⚠️ a DELETED object does NOT loop", () => {
  it("is retried exactly once, then never again", () => {
    // The object is gone, so every re-sign returns a URL that also fails. The
    // token differs each time, which is precisely why the key is the object.
    const state = fresh();
    const path = "journal/u/entry/deleted.jpg";
    let refreshes = 0;

    for (let attempt = 0; attempt < 20; attempt++) {
      const d = decideResign(objectUrl(path, `token-${attempt}`), state);
      if (d.refresh) { refreshes += 1; record(state, d.key); }
      state.pending = false; // the refresh settled; the image failed again
    }

    expect(refreshes, "a deleted object must cost exactly one refresh").toBe(1);
    expect(decideResign(objectUrl(path, "token-99"), state)).toEqual({
      refresh: false,
      reason: "already-attempted",
    });
  });

  it("one dead object does not stop a DIFFERENT image recovering", () => {
    const state = fresh();
    const dead = "journal/u/entry/deleted.jpg";
    const live = "journal/u/entry/fine.jpg";

    const first = decideResign(objectUrl(dead, "t1"), state);
    expect(first.refresh).toBe(true);
    if (first.refresh) record(state, first.key);
    state.pending = false;

    expect(decideResign(objectUrl(dead, "t2"), state)).toMatchObject({ reason: "already-attempted" });
    expect(decideResign(objectUrl(live, "t3"), state)).toMatchObject({ refresh: true });
  });
});

describe("the other two bounds", () => {
  it("swallows everything while a refresh is in flight", () => {
    const state = { ...fresh(), pending: true };
    expect(decideResign(objectUrl("journal/u/a/p.jpg", "t"), state)).toEqual({
      refresh: false,
      reason: "in-flight",
    });
  });

  it("stops at the ceiling rather than asking forever", () => {
    const state: ResignState = { attempted: new Set(), pending: false, fired: MAX_REFRESHES_PER_MOUNT };
    expect(decideResign(objectUrl("journal/u/a/p.jpg", "t"), state)).toEqual({
      refresh: false,
      reason: "ceiling",
    });
  });

  it("never acts on an image that is not a signed storage object", () => {
    // A broken onboarding asset or an external image must not refresh the page.
    for (const src of ["/trackd-wordmark.png", "https://example.com/x.png", "data:image/gif;base64,AA"]) {
      expect(decideResign(src, fresh())).toEqual({ refresh: false, reason: "not-a-signed-url" });
    }
  });

  it("⚠️ NO CLOCK IS CONSULTED — the bound is state, not time", () => {
    // Pinned as source: a future session adding a setTimeout/backoff here would
    // reintroduce exactly the polling the founder ruled out (2026-09-03).
    const source = readFileSync("lib/media/resignOnExpiry.ts", "utf8");
    expect(source).not.toMatch(/setTimeout|setInterval|Date\.now|performance\.now/);
  });
});
