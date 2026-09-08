/**
 * ⚠️ ARE THE AUTH COOKIES ACTUALLY GONE? ASSERTED ON THE JAR, NOT ON THE CALL.
 *
 * Q108. `signOut()` returns early WITHOUT clearing the session on a session-read
 * error or a non-404/401/403 admin error, so the cookie survived while this
 * action reported the deletion succeeded. The action now clears them itself.
 *
 * ⚠️ "A clearing call was made" is not the property under test - that would pass
 * against a version that called something which did nothing. Every assertion
 * here reads the JAR back afterwards.
 *
 * ⚠️ AND IT IS TWO-SIDED. The failing-signOut case alone would pass against an
 * implementation that wipes cookies unconditionally in every circumstance,
 * including ones where it should not, so the clean path and an unrelated cookie
 * are asserted too.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const jarRef: { current: ReturnType<typeof makeJar> } = { current: makeJar({}) };
const supabaseRef: { current: unknown } = { current: null };
const outcomeRef: { current: unknown } = { current: { ok: true, stepsRun: [] } };

vi.mock("next/headers", () => ({ cookies: async () => jarRef.current }));
vi.mock("next/navigation", () => ({
  redirect: () => {
    // The real one reports itself by throwing this shape.
    throw Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/;307;" });
  },
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => supabaseRef.current }));
vi.mock("@/lib/account/deleteAccount", () => ({
  deleteAccountFor: async () => outcomeRef.current,
}));

import { deleteMyAccount } from "@/app/(app)/profile/delete-account-action";

/** A cookie jar shaped like Next's, that actually forgets what it deletes. */
function makeJar(initial: Record<string, string>) {
  const map = new Map(Object.entries(initial));
  return {
    getAll: () => [...map.entries()].map(([name, value]) => ({ name, value })),
    get: (name: string) => (map.has(name) ? { name, value: map.get(name)! } : undefined),
    set: (name: string, value: string) => { map.set(name, value); },
    delete: (name: string) => { map.delete(name); },
    names: () => [...map.keys()],
  };
}

const SESSION = {
  "sb-boqqracwdpuisgvwbqlc-auth-token": "header.payload.sig",
  "sb-boqqracwdpuisgvwbqlc-auth-token.0": "chunk-one",
  "sb-boqqracwdpuisgvwbqlc-auth-token.1": "chunk-two",
  "trackd-amber": "on",
};

/** Runs the action to completion, swallowing the redirect it throws on success. */
async function runDeletion() {
  try {
    return await deleteMyAccount("DELETE");
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e) return undefined;
    throw e;
  }
}

function withSignOut(signOutResult: { error: { message: string } | null }) {
  supabaseRef.current = {
    auth: {
      getUser: async () => ({ data: { user: { id: "11111111-2222-4333-8444-555555555555" } }, error: null }),
      signOut: async () => signOutResult,
    },
  };
}

beforeEach(() => {
  jarRef.current = makeJar(SESSION);
  outcomeRef.current = { ok: true, stepsRun: [] };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("⚠️ the jar really did start full", () => {
  it("otherwise every assertion below is vacuous", () => {
    expect(jarRef.current.names()).toContain("sb-boqqracwdpuisgvwbqlc-auth-token");
    expect(jarRef.current.names()).toHaveLength(4);
  });
});

describe("a deletion where signOut FAILS", () => {
  it("still leaves NO auth cookie in the jar", async () => {
    withSignOut({ error: { message: "500 Internal Server Error" } });
    await runDeletion();
    expect(jarRef.current.names().filter((n) => n.startsWith("sb-"))).toEqual([]);
  });

  it("removes the CHUNKED cookies too, not just the unsuffixed one", async () => {
    withSignOut({ error: { message: "fetch failed" } });
    await runDeletion();
    expect(jarRef.current.get("sb-boqqracwdpuisgvwbqlc-auth-token.0")).toBeUndefined();
    expect(jarRef.current.get("sb-boqqracwdpuisgvwbqlc-auth-token.1")).toBeUndefined();
  });
});

describe("⚠️ THE OTHER SIDE — the normal path still works", () => {
  it("a clean signOut also ends with no auth cookie", async () => {
    withSignOut({ error: null });
    await runDeletion();
    expect(jarRef.current.names().filter((n) => n.startsWith("sb-"))).toEqual([]);
  });

  it("it does not empty the whole jar - somebody else's cookie survives", async () => {
    withSignOut({ error: { message: "500" } });
    await runDeletion();
    expect(jarRef.current.get("trackd-amber")?.value).toBe("on");
  });
});

describe("⚠️ it does NOT clear cookies for a deletion that failed", () => {
  it("a stopped deletion leaves the session alone, because the account still exists", async () => {
    outcomeRef.current = { ok: false, failedAt: "sweep-storage", error: "boom", stepsRun: ["cancel-stripe"] };
    withSignOut({ error: null });
    const result = await runDeletion();
    expect(result).toMatchObject({ ok: false });
    // Signing them out of an account that still exists would strand them.
    expect(jarRef.current.names()).toContain("sb-boqqracwdpuisgvwbqlc-auth-token");
  });
});
