/**
 * ⚠️ THE STORAGE SWEEP, DRIVEN AGAINST REAL SUPABASE STORAGE.
 *
 * `16-account-deletion.md` §3.4: *"The sweep is verified by listing afterwards,
 * not by trusting the delete call. Storage deletes can partially succeed, and
 * 'no error returned' is not 'nothing remains'."* This file is what makes that
 * sentence a measurement instead of a hope.
 *
 * ## What it proves that the unit suite cannot
 *
 * `lib/storage/sweep.test.ts` drives a double. A double answers the way the
 * person who wrote the code expected Storage to answer, so it can only prove the
 * logic is self-consistent. Three claims are about somebody else's server and are
 * measured here instead:
 *
 *   1. `list()` on an UNREADABLE bucket answers an `error`, NOT an empty `data`.
 *      Everything rests on this. If Storage answered `[]` on a failed read, the
 *      sweep would report "swept" over files it never saw, and the three-state
 *      would be decoration.
 *   2. `list()` is ONE level deep and marks folders with a null `id`, so the
 *      recursion is load-bearing rather than defensive.
 *   3. A sweep whose delete did not happen reports the objects PRESENT.
 *
 * ## ⚠️ SAFETY, and it is not negotiable
 *
 *   · Every account is `@trackd-qa.invalid`, created here and torn down BY ID.
 *   · The sweep is only ever pointed at an id this file created.
 *   · A census of `storage.objects` is taken before and after. If the count does
 *     not return to its starting value, the test FAILS — that is the guard
 *     against this drive touching a real user's files or the five unattributable
 *     harness objects under the two orphan prefixes, which are EVIDENCE and are
 *     not to be deleted.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { describe, it, expect, beforeAll, afterAll } from "vitest"

import { sweepUserStorage, SWEEP_BUCKETS, describeSweep } from "@/lib/storage/sweep"

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
const KEY = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
const QA_PASSWORD = process.env.QA_TEST_PASSWORD ?? ""

if (!URL_ || !KEY) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set in .env.local")
if (!QA_PASSWORD) throw new Error("QA_TEST_PASSWORD is not set in .env.local")

const admin = createClient(URL_, KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

/** A one-pixel PNG. Every bucket allows `image/png`; all four cap well above this. */
const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
])

/**
 * The real layouts, so the recursion and the flat avatar case are both exercised.
 * `avatars` is one level; the other three are two.
 */
const layout = (id: string): Record<string, string[]> => ({
  bloodwork: [`${id}/panel-a/report.png`, `${id}/panel-b/report.png`],
  "progress-photos": [`${id}/sess-a/photo.png`, `${id}/sess-b/photo.png`, `${id}/sess-c/photo.png`],
  journal: [`${id}/entry-a/photo.png`],
  avatars: [`${id}/avatar.png`],
})

/** Objects in the whole project. The census that proves we touched nobody else. */
async function census(): Promise<number> {
  let total = 0
  for (const bucket of SWEEP_BUCKETS) {
    // Counted through the same API the sweep uses, at the BUCKET root, so a stray
    // object outside any user prefix would still be seen.
    const { data, error } = await admin.storage.from(bucket).list("", { limit: 1000, offset: 0 })
    if (error) throw new Error(`census: ${bucket}: ${error.message}`)
    for (const entry of data ?? []) {
      if (entry.id !== null) { total += 1; continue }
      const sub = await admin.storage.from(bucket).list(entry.name, { limit: 1000, offset: 0 })
      if (sub.error) throw new Error(`census: ${bucket}/${entry.name}: ${sub.error.message}`)
      for (const child of sub.data ?? []) {
        if (child.id !== null) { total += 1; continue }
        const leaf = await admin.storage.from(bucket).list(`${entry.name}/${child.name}`, { limit: 1000, offset: 0 })
        if (leaf.error) throw new Error(`census: ${bucket}: ${leaf.error.message}`)
        total += (leaf.data ?? []).filter((o) => o.id !== null).length
      }
    }
  }
  return total
}

let userId = ""
let censusBefore = 0

async function seedObjects(id: string) {
  for (const [bucket, paths] of Object.entries(layout(id))) {
    for (const path of paths) {
      const { error } = await admin.storage
        .from(bucket)
        .upload(path, PNG, { contentType: "image/png", upsert: true })
      if (error) throw new Error(`seed ${bucket}/${path}: ${error.message}`)
    }
  }
}

beforeAll(async () => {
  censusBefore = await census()

  const email = `sweepdrive-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@trackd-qa.invalid`
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: QA_PASSWORD,
    email_confirm: true,
  })
  if (error) throw new Error(`createUser: ${error.message}`)
  userId = data.user.id
  if (!userId) throw new Error("createUser answered without an id")

  console.info(`[drive] seeded ${email} -> ${userId}`)
})

afterAll(async () => {
  // ⚠️ TEARDOWN BY ID. Never by email, never by domain.
  if (userId) {
    for (const bucket of SWEEP_BUCKETS) {
      const paths = layout(userId)[bucket] ?? []
      await admin.storage.from(bucket).remove(paths)
    }
    const { error } = await admin.auth.admin.deleteUser(userId)
    // The Supabase client RETURNS the error rather than throwing it, so
    // destructuring and ignoring it is how a teardown silently does nothing.
    if (error) throw new Error(`TEARDOWN FAILED for ${userId}: ${error.message}`)
    console.info(`[drive] torn down ${userId}`)
  }

  const after = await census()
  expect(
    after,
    `CENSUS MISMATCH: ${censusBefore} objects before, ${after} after. This drive must leave the project exactly as it found it, including the five unattributable harness objects.`,
  ).toBe(censusBefore)
})

describe("⚠️ the assumptions the sweep rests on, measured against real Storage", () => {
  it("an UNREADABLE bucket answers an error, not an empty list", async () => {
    // The whole three-state design depends on this. Driven with a deliberately
    // invalid key so the read genuinely fails rather than being simulated.
    const broken = createClient(URL_, "sb_secret_this_key_is_not_valid", {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data, error } = await broken.storage.from("bloodwork").list(userId, { limit: 100, offset: 0 })

    expect(error, "a failed read must report an error").not.toBeNull()
    expect(
      data,
      "⚠️ if a failed read ever answers [] instead of an error, the sweep is reporting success over files it never saw",
    ).not.toEqual([])
  })

  it("an EMPTY prefix answers [] with no error — the other half of the pair", async () => {
    const { data, error } = await admin.storage.from("bloodwork").list(userId, { limit: 100, offset: 0 })
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it("⚠️ a MISSING bucket is indistinguishable from an empty one", async () => {
    // The hole the existence check exists for. Both answer `[], null`, so
    // nothing downstream of list() can tell them apart - which is why the check
    // is at the bucket layer instead.
    const missing = await admin.storage.from("does-not-exist").list("x", { limit: 100, offset: 0 })
    expect(missing.error).toBeNull()
    expect(missing.data).toEqual([])
  })

  it("⚠️ listBuckets shows an UNDER-PRIVILEGED client an empty world, not an error", async () => {
    // Why the check tests for PRESENCE rather than for an error. An anon key is
    // not refused here; it is shown nothing. A check that only inspected
    // `error` would fail open on exactly this client.
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!anonKey) return // nothing to measure in this environment

    const anon = createClient(URL_, anonKey, { auth: { autoRefreshToken: false, persistSession: false } })
    const seen = await anon.storage.listBuckets()
    expect(seen.error, "an anon key is not refused by listBuckets").toBeNull()
    expect(seen.data, "it is shown an empty world instead").toEqual([])

    // And the service role, which the sweep actually uses, sees all four.
    const mine = await admin.storage.listBuckets()
    expect(mine.error).toBeNull()
    expect(new Set((mine.data ?? []).map((b) => b.id))).toEqual(new Set(SWEEP_BUCKETS))
  })

  it("list() is ONE level deep and marks folders with a null id", async () => {
    await seedObjects(userId)
    const { data, error } = await admin.storage.from("journal").list(userId, { limit: 100, offset: 0 })
    expect(error).toBeNull()
    // `entry-a`, a FOLDER — not `entry-a/photo.png`. This is why listPrefix recurses.
    expect(data?.map((e) => e.name)).toEqual(["entry-a"])
    expect(data?.[0]?.id).toBeNull()
  })
})

describe("⚠️ IT CAN FAIL — proven before it is trusted", () => {
  it("reports the objects PRESENT when the delete did not happen", async () => {
    // The objects seeded above are still there. This run's `remove` is neutered,
    // so the sweep must report exactly what a real partial failure would look
    // like: no error from the delete, and the files still in the bucket.
    const neutered = {
      ...admin,
      storage: {
        from(bucket: string) {
          const real = admin.storage.from(bucket)
          return {
            list: real.list.bind(real),
            async remove() {
              return { data: [], error: null } // answers success, deletes nothing
            },
          }
        },
      },
      from: admin.from.bind(admin),
    } as unknown as SupabaseClient

    const result = await sweepUserStorage(neutered, userId)
    console.info(describeSweep(result))

    expect(result.ok, "a sweep that deleted nothing must NOT report ok").toBe(false)
    for (const bucket of SWEEP_BUCKETS) {
      const outcome = result.buckets.find((b) => b.bucket === bucket)
      expect(outcome?.state, `${bucket} must report remaining`).toBe("remaining")
    }
    const journal = result.buckets.find((b) => b.bucket === "journal")
    expect(journal).toMatchObject({ remaining: [`${userId}/entry-a/photo.png`] })
  })
})

describe("the sweep, for real", () => {
  it("deletes every object across all four buckets and verifies by listing", async () => {
    const result = await sweepUserStorage(admin, userId)
    console.info(describeSweep(result))

    expect(result.refusedOutOfPrefix).toEqual([])
    expect(result.ok, describeSweep(result)).toBe(true)
    expect(result.buckets.map((b) => b.state)).toEqual(["swept", "swept", "swept", "swept"])

    // Deleted counts match what was seeded, so nothing was quietly skipped.
    const seeded = layout(userId)
    for (const bucket of SWEEP_BUCKETS) {
      const outcome = result.buckets.find((b) => b.bucket === bucket)
      expect(outcome).toMatchObject({ state: "swept", deleted: seeded[bucket].length })
    }
  })

  it("is confirmed by an INDEPENDENT read, not by the sweep's own answer", async () => {
    // A fresh client, asking the question again from the outside.
    const fresh = createClient(URL_, KEY, { auth: { autoRefreshToken: false, persistSession: false } })
    for (const bucket of SWEEP_BUCKETS) {
      const { data, error } = await fresh.storage.from(bucket).list(userId, { limit: 100, offset: 0 })
      expect(error, `${bucket}: verification read failed`).toBeNull()
      expect(data, `${bucket} still holds objects for ${userId}`).toEqual([])
    }
  })

  it("is idempotent — a second run is a clean success, not an error", async () => {
    const again = await sweepUserStorage(admin, userId)
    expect(again.ok).toBe(true)
    expect(again.buckets.every((b) => b.state === "swept")).toBe(true)
    expect(again.buckets.every((b) => b.state === "swept" && b.deleted === 0)).toBe(true)
  })

  it("an UNREADABLE project reports unknown for every bucket, never swept", async () => {
    const broken = createClient(URL_, "sb_secret_this_key_is_not_valid", {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const result = await sweepUserStorage(broken, userId)
    expect(result.ok).toBe(false)
    expect(result.buckets.map((b) => b.state)).toEqual(["unknown", "unknown", "unknown", "unknown"])
  })
})

describe("⚠️ BY ID ONLY, against the live project", () => {
  it.each(["", "%", "sweepdrive@trackd-qa.invalid", "trackd-qa.invalid"])(
    "refuses %j without issuing a single call",
    async (bad) => {
      await expect(sweepUserStorage(admin, bad)).rejects.toThrow(/BY ID ONLY/)
    },
  )
})
