/**
 * ⚠️ THE SWEEP IS AN INSTRUMENT, SO THESE TESTS PROVE IT CAN FAIL.
 *
 * A sweep that answers "swept" is a claim that somebody's bloodwork scans are
 * gone. The only way that claim is worth anything is if the same code says
 * "remaining" when they are not, and "unknown" when it could not look. So the
 * load-bearing cases here are the NEGATIVE ones:
 *
 *   · `remove` silently no-ops   → must report REMAINING, never swept
 *   · `list` errors              → must report UNKNOWN, never swept
 *   · a bucket genuinely empty   → must report SWEPT, and must NOT look like
 *                                  the errored bucket above
 *
 * That third pairing is the one this project has been caught by: an unreadable
 * bucket and an empty bucket must not produce the same answer.
 */
import { describe, it, expect } from "vitest";

import { sweepUserStorage, SWEEP_BUCKETS, type SweepBucket } from "./sweep";

const USER = "11111111-2222-4333-8444-555555555555";
const OTHER = "99999999-8888-4777-8666-555555555555";

interface FakeOpts {
  /** bucket -> object paths present */
  objects?: Partial<Record<SweepBucket, string[]>>;
  /** bucket -> paths the ROWS claim exist */
  rows?: Partial<Record<SweepBucket, string[]>>;
  /** buckets whose `list` fails */
  listFails?: SweepBucket[];
  /** buckets whose row read fails */
  rowsFail?: SweepBucket[];
  /** buckets where `remove` answers ok but deletes NOTHING */
  removeIsALie?: SweepBucket[];
  /** buckets where `remove` errors but the objects DO go */
  removeErrorsButWorks?: SweepBucket[];
}

/**
 * An in-memory Storage + PostgREST double.
 *
 * `list` is implemented the way Storage really behaves — ONE level, folders
 * marked with a null `id` — because a fake that returned every descendant would
 * hide the exact defect `listPrefix`'s recursion exists for.
 */
function fakeClient(opts: FakeOpts) {
  const store = new Map<string, Set<string>>();
  for (const b of SWEEP_BUCKETS) store.set(b, new Set(opts.objects?.[b] ?? []));
  const calls = { list: 0, remove: 0 };

  const listOneLevel = (bucket: SweepBucket, dir: string) => {
    const out = new Map<string, { name: string; id: string | null }>();
    for (const path of store.get(bucket) as Set<string>) {
      if (!path.startsWith(`${dir}/`)) continue;
      const rest = path.slice(dir.length + 1);
      const slash = rest.indexOf("/");
      if (slash === -1) out.set(rest, { name: rest, id: "obj" });
      else out.set(rest.slice(0, slash), { name: rest.slice(0, slash), id: null });
    }
    return [...out.values()];
  };

  return {
    calls,
    store,
    storage: {
      from(bucket: SweepBucket) {
        return {
          async list(dir: string, { limit, offset }: { limit: number; offset: number }) {
            calls.list++;
            if (opts.listFails?.includes(bucket)) {
              return { data: null, error: { message: "bucket unreadable" } };
            }
            const all = listOneLevel(bucket, dir);
            return { data: all.slice(offset, offset + limit), error: null };
          },
          async remove(paths: string[]) {
            calls.remove++;
            if (opts.removeIsALie?.includes(bucket)) return { data: [], error: null };
            for (const p of paths) (store.get(bucket) as Set<string>).delete(p);
            if (opts.removeErrorsButWorks?.includes(bucket)) {
              return { data: null, error: { message: "partial failure" } };
            }
            return { data: [], error: null };
          },
        };
      },
    },
    from(table: string) {
      const bucket = SWEEP_BUCKETS.find((b) =>
        ({ bloodwork: "lab_panels", "progress-photos": "progress_photos", journal: "journal_attachments", avatars: "profiles" })[b] === table,
      ) as SweepBucket;
      return {
        select(column: string) {
          return {
            async eq() {
              if (opts.rowsFail?.includes(bucket)) {
                return { data: null, error: { message: "row read failed" } };
              }
              return {
                data: (opts.rows?.[bucket] ?? []).map((p) => ({ [column]: p })),
                error: null,
              };
            },
          };
        },
      };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("⚠️ BY ID ONLY", () => {
  it.each(["", "a@b.com", "%", "*", "trackd-qa.invalid", "11111111-2222-4333-8444-55555555555"])(
    "refuses %j before touching anything",
    async (bad) => {
      const c = fakeClient({});
      await expect(sweepUserStorage(c, bad)).rejects.toThrow(/BY ID ONLY/);
      // An empty id would make the prefix "/" and list the WHOLE bucket.
      expect(c.calls.list).toBe(0);
      expect(c.calls.remove).toBe(0);
    },
  );
});

describe("the happy path", () => {
  it("deletes everything under the prefix and verifies it is gone", async () => {
    const c = fakeClient({
      objects: {
        bloodwork: [`${USER}/aaa/report.pdf`],
        "progress-photos": [`${USER}/bbb/photo.jpg`, `${USER}/ccc/photo.jpg`],
        journal: [`${USER}/ddd/photo.jpg`],
        avatars: [`${USER}/avatar.webp`],
      },
    });
    const r = await sweepUserStorage(c, USER);
    expect(r.ok).toBe(true);
    expect(r.buckets.every((b) => b.state === "swept")).toBe(true);
    for (const b of SWEEP_BUCKETS) expect([...c.store.get(b)]).toEqual([]);
  });

  it("recurses — a one-level list would return folder names and delete nothing", async () => {
    // `<user>/<random>/photo.jpg` is the real layout for three of four buckets.
    const c = fakeClient({ objects: { journal: [`${USER}/deep/deeper/photo.jpg`] } });
    const r = await sweepUserStorage(c, USER);
    expect(r.ok).toBe(true);
    expect([...c.store.get("journal")]).toEqual([]);
  });

  it("pages past 100 objects in one folder", async () => {
    const many = Array.from({ length: 250 }, (_, i) => `${USER}/p${i}.jpg`);
    const c = fakeClient({ objects: { avatars: many } });
    const r = await sweepUserStorage(c, USER);
    expect(r.ok).toBe(true);
    expect([...c.store.get("avatars")]).toEqual([]);
  });

  it("never touches another user's prefix", async () => {
    const c = fakeClient({
      objects: { journal: [`${USER}/a/x.jpg`, `${OTHER}/b/y.jpg`] },
    });
    await sweepUserStorage(c, USER);
    expect([...c.store.get("journal")]).toEqual([`${OTHER}/b/y.jpg`]);
  });

  it("is idempotent — a second run on an empty account is a clean success", async () => {
    const c = fakeClient({ objects: { bloodwork: [`${USER}/a/report.pdf`] } });
    expect((await sweepUserStorage(c, USER)).ok).toBe(true);
    const second = await sweepUserStorage(c, USER);
    expect(second.ok).toBe(true);
    expect(second.buckets.every((b) => b.state === "swept")).toBe(true);
  });
});

describe("⚠️ IT CAN FAIL — the whole reason to trust it", () => {
  it("reports REMAINING when `remove` answers ok and deletes nothing", async () => {
    // THE instrument test. A storage delete can partially succeed and return no
    // error; only the verification read can tell.
    const c = fakeClient({
      objects: { bloodwork: [`${USER}/a/report.pdf`] },
      removeIsALie: ["bloodwork"],
    });
    const r = await sweepUserStorage(c, USER);
    expect(r.ok).toBe(false);
    const b = r.buckets.find((x) => x.bucket === "bloodwork");
    expect(b?.state).toBe("remaining");
    expect(b).toMatchObject({ remaining: [`${USER}/a/report.pdf`] });
  });

  it("does not report success for the OTHER buckets' sake", async () => {
    const c = fakeClient({
      objects: { bloodwork: [`${USER}/a/r.pdf`], journal: [`${USER}/b/p.jpg`] },
      removeIsALie: ["journal"],
    });
    const r = await sweepUserStorage(c, USER);
    expect(r.ok).toBe(false);
    expect(r.buckets.find((x) => x.bucket === "bloodwork")?.state).toBe("swept");
    expect(r.buckets.find((x) => x.bucket === "journal")?.state).toBe("remaining");
  });

  it("trusts the LISTING, not the delete: an errored remove that worked is swept", async () => {
    const c = fakeClient({
      objects: { journal: [`${USER}/a/p.jpg`] },
      removeErrorsButWorks: ["journal"],
    });
    const r = await sweepUserStorage(c, USER);
    expect(r.buckets.find((x) => x.bucket === "journal")?.state).toBe("swept");
  });
});

describe("⚠️ COULD NOT READ IS NOT EMPTY", () => {
  it("an unreadable bucket is UNKNOWN, never swept", async () => {
    const c = fakeClient({ listFails: ["bloodwork"] });
    const r = await sweepUserStorage(c, USER);
    expect(r.ok).toBe(false);
    expect(r.buckets.find((x) => x.bucket === "bloodwork")?.state).toBe("unknown");
  });

  it("an EMPTY bucket and an UNREADABLE bucket do not produce the same answer", async () => {
    // The pairing this project has been caught by. If these two ever converge,
    // the sweep is reporting success over files it never read.
    const empty = await sweepUserStorage(fakeClient({}), USER);
    const broken = await sweepUserStorage(fakeClient({ listFails: [...SWEEP_BUCKETS] }), USER);

    expect(empty.ok).toBe(true);
    expect(broken.ok).toBe(false);
    expect(empty.buckets.map((b) => b.state)).not.toEqual(broken.buckets.map((b) => b.state));
  });

  it("a bucket that fails only the VERIFY read is unknown, not swept", async () => {
    // Deleted, but unverified. The delete "worked"; nothing proved it.
    let listed = 0;
    const inner = fakeClient({ objects: { avatars: [`${USER}/avatar.webp`] } });
    const c = {
      ...inner,
      storage: {
        from(bucket: SweepBucket) {
          const real = inner.storage.from(bucket);
          return {
            ...real,
            async list(dir: string, opts: { limit: number; offset: number }) {
              if (bucket === "avatars" && listed++ > 0) {
                return { data: null, error: { message: "unreadable after delete" } };
              }
              return real.list(dir, opts);
            },
          };
        },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    const r = await sweepUserStorage(c, USER);
    const b = r.buckets.find((x) => x.bucket === "avatars");
    expect(b?.state).toBe("unknown");
    expect(r.ok).toBe(false);
  });

  it("a failed ROW read is unknown — losing the cross-check is not 'nothing there'", async () => {
    const c = fakeClient({ objects: { journal: [`${USER}/a/p.jpg`] }, rowsFail: ["journal"] });
    const r = await sweepUserStorage(c, USER);
    expect(r.buckets.find((x) => x.bucket === "journal")?.state).toBe("unknown");
    expect(r.ok).toBe(false);
    // And it did NOT delete on a half-known enumeration.
    expect([...c.store.get("journal")]).toEqual([`${USER}/a/p.jpg`]);
  });
});

describe("the secondary enumeration", () => {
  it("catches a row-recorded path the prefix listing missed", async () => {
    // Contrived here; measured in production — see the module comment.
    const c = fakeClient({
      objects: { journal: [`${USER}/a/p.jpg`] },
      rows: { journal: [`${USER}/a/p.jpg`, `${USER}/b/q.jpg`] },
    });
    const r = await sweepUserStorage(c, USER);
    const b = r.buckets.find((x) => x.bucket === "journal");
    expect(b?.state).toBe("swept");
    // Both were asked for, not just the one the listing saw.
    expect(b).toMatchObject({ deleted: 2 });
  });

  it("⚠️ REFUSES a row path outside the user's prefix rather than deleting it", async () => {
    // A row of A's naming a path under B is corruption. Deleting it destroys B's
    // file; refusing it is recoverable.
    const c = fakeClient({
      objects: { journal: [`${OTHER}/b/victim.jpg`] },
      rows: { journal: [`${OTHER}/b/victim.jpg`] },
    });
    const r = await sweepUserStorage(c, USER);
    expect(r.refusedOutOfPrefix).toEqual([`journal:${OTHER}/b/victim.jpg`]);
    expect(r.ok).toBe(false);
    expect([...c.store.get("journal")]).toEqual([`${OTHER}/b/victim.jpg`]);
  });
});
