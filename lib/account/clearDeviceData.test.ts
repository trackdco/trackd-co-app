/**
 * ⚠️ THE DEVICE SWEEP, AND THE ONE INPUT THAT WOULD MAKE IT DESTROY EVERYTHING.
 *
 * `clearDeviceDataFor` matches keys by SUBSTRING on the user id, which is what
 * lets it catch every present and future user-scoped store without a list to
 * keep in sync. The cost of that choice is that a bad id is catastrophic rather
 * than merely wrong: `"anything".includes("")` is true, so an empty id would
 * sweep the whole origin including a different signed-in account's data.
 *
 * So the empty-id case is not an edge here, it is the headline test.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { clearDeviceDataFor } from "./clearDeviceData";
import { ONBOARDING_SESSION_KEY } from "@/lib/onboarding/session";

const MINE = "11111111-2222-4333-8444-555555555555";
const THEIRS = "99999999-8888-4777-8666-555555555555";

/** A localStorage that behaves like the real one, including `key(i)` ordering. */
function makeStore(seed: Record<string, string>) {
  const map = new Map(Object.entries(seed));
  return {
    get length() { return map.size; },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
    clear: () => map.clear(),
    _keys: () => [...map.keys()],
  };
}

const SEED = () => ({
  [`trackd.stack.v2.${MINE}`]: "{}",
  [`trackd.doselog.v1.${MINE}`]: "{}",
  [`trackd.oneoff.tombstones.v1.${MINE}`]: "{}",
  [`trackd.customCompounds.${MINE}`]: "{}",
  [`trackd.migrated.v1.${MINE}`]: "1",
  [ONBOARDING_SESSION_KEY]: '{"dob":"1990-01-01","sex":"male"}',
  [`trackd.stack.v2.${THEIRS}`]: "{}",
  [`trackd.doselog.v1.${THEIRS}`]: "{}",
  "trackd.calculator.syringeSize": "1",
  "trackd.home.weekStripOpen": "1",
  "trackd-amber": "on",
});

let store: ReturnType<typeof makeStore>;

beforeEach(() => {
  store = makeStore(SEED());
  (globalThis as unknown as { window: unknown }).window = { localStorage: store };
});
afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window;
});

describe("it removes what is the leaving user's", () => {
  it("removes every store keyed on their id", () => {
    clearDeviceDataFor(MINE);
    expect(store._keys().filter((k) => k.includes(MINE))).toEqual([]);
  });

  it("removes the onboarding answers, which hold date of birth and sex", () => {
    clearDeviceDataFor(MINE);
    expect(store.getItem(ONBOARDING_SESSION_KEY)).toBeNull();
  });
});

describe("⚠️ it does NOT reach anybody else's data on a shared device", () => {
  it("leaves another signed-in account's stores alone", () => {
    clearDeviceDataFor(MINE);
    expect(store.getItem(`trackd.stack.v2.${THEIRS}`)).toBe("{}");
    expect(store.getItem(`trackd.doselog.v1.${THEIRS}`)).toBe("{}");
  });

  it("leaves device-wide preferences that carry no health data", () => {
    clearDeviceDataFor(MINE);
    expect(store.getItem("trackd.calculator.syringeSize")).toBe("1");
    expect(store.getItem("trackd.home.weekStripOpen")).toBe("1");
    expect(store.getItem("trackd-amber")).toBe("on");
  });
});

describe("⚠️ BY ID ONLY — a bad id removes NOTHING, never everything", () => {
  /**
   * The empty string is the one that matters: every key `includes("")`, so
   * without the guard this call would empty the entire origin.
   */
  it.each(["", "%", "*", "a@b.com", "trackd", "11111111-2222-4333-8444-5555555555"])(
    "refuses %o and leaves the store untouched",
    (bad) => {
      const before = store._keys();
      clearDeviceDataFor(bad);
      expect(store._keys()).toEqual(before);
    },
  );
});

describe("it never throws, because it runs on the success path", () => {
  it("survives storage that refuses to be read", () => {
    (globalThis as unknown as { window: unknown }).window = {
      get localStorage(): never { throw new Error("SecurityError: site data blocked"); },
    };
    expect(() => clearDeviceDataFor(MINE)).not.toThrow();
  });

  it("survives having no window at all", () => {
    delete (globalThis as unknown as { window?: unknown }).window;
    expect(() => clearDeviceDataFor(MINE)).not.toThrow();
  });
});

describe("removing while iterating cannot skip keys", () => {
  /**
   * `key(i)` is positional. Removing during the loop re-numbers what is left and
   * skips every other match, so the collection is deliberately done first. Two
   * adjacent matches at the head of the store is the shape that catches it.
   */
  it("removes ALL matches, not every other one", () => {
    store = makeStore({
      [`trackd.a.${MINE}`]: "1",
      [`trackd.b.${MINE}`]: "1",
      [`trackd.c.${MINE}`]: "1",
      [`trackd.d.${MINE}`]: "1",
    });
    (globalThis as unknown as { window: unknown }).window = { localStorage: store };
    clearDeviceDataFor(MINE);
    expect(store._keys()).toEqual([]);
  });
});
