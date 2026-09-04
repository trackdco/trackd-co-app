/**
 * ⚠️ ACCOUNT DELETION, DRIVEN END TO END AGAINST THE REAL PROJECT.
 *
 * `16-account-deletion.md` Step 7 and the §5 checklist. Every box this file
 * claims is answered **by observation** — by reading the buckets and the tables
 * back afterwards — and never by trusting a return value. `describeSweep` and
 * `deleteAccountFor` both answer `ok`; that answer is not evidence and is not
 * what any assertion here rests on.
 *
 * ## ⚠️ SAFETY, and none of it is optional
 *
 *   · Every account is `@trackd-qa.invalid`, created here, torn down BY ID.
 *   · `deleteAccountFor` is only ever pointed at an id this file just created.
 *   · A census of `storage.objects` is taken before and after. If it does not
 *     return to its starting value the run FAILS — that is the guard against
 *     touching a real user's files, or the six unattributable objects that are
 *     EVIDENCE and are not to be deleted.
 *   · Nothing here matches on email, domain, or any pattern.
 *
 * ## What this does NOT exercise, stated rather than implied
 *
 * The Stripe step is a **no-op** on these accounts, because a fresh QA account
 * holds no `billing_customers` row and `cancelNowForUser` returns an empty list
 * before contacting Stripe at all. That is not a gap in the drive — it is the
 * real-world shape of every account this flow will meet first: measured
 * 2026-09-03, all 87 comp rows and zero of them hold a Stripe customer. The
 * cancel path's own behaviour, including running it twice, is proven against
 * fakes in `lib/billing/cancelNowForUser.test.ts`, because proving it live would
 * mean writing a test-mode Stripe customer into the production billing tables.
 */
import { createClient } from "@supabase/supabase-js"
import { describe, it, expect, beforeAll, afterAll } from "vitest"

import { deleteAccountFor, DELETION_ORDER } from "@/lib/account/deleteAccount"
import { hasOpenRefundRequest, REFUND_REQUEST_MARKER } from "@/lib/account/openRefundRequest"
import { SWEEP_BUCKETS } from "@/lib/storage/sweep"

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
const KEY = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
const QA_PASSWORD = process.env.QA_TEST_PASSWORD ?? ""

if (!URL_ || !KEY) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set")
if (!QA_PASSWORD) throw new Error("QA_TEST_PASSWORD is not set in .env.local")

const admin = createClient(URL_, KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
])

/** Every user-scoped table, with the column that owns the row. Read from
 *  production `pg_constraint` on 2026-09-03: 38 cascade constraints, no
 *  exceptions. "Every cascaded table is empty of that user" is checked against
 *  ALL of them rather than the handful the seed happens to touch. */
const OWNED: [string, string][] = [
  ["beta_feedback", "user_id"], ["billing_customers", "user_id"], ["biomarker_results", "user_id"],
  ["block_targets", "user_id"], ["blocks", "user_id"], ["body_metrics", "user_id"],
  ["compound_pauses", "user_id"], ["consent_records", "user_id"], ["cycles", "user_id"],
  ["dose_logs", "user_id"], ["entitlements", "user_id"], ["inventory_items", "user_id"],
  ["journal_attachments", "user_id"], ["journal_entries", "user_id"], ["lab_panels", "user_id"],
  ["marker_readings", "user_id"], ["notification_preferences", "user_id"], ["one_off_logs", "user_id"],
  ["progress_photos", "user_id"], ["protocol_compound_schedules", "user_id"],
  ["protocol_compounds", "user_id"], ["push_subscriptions", "user_id"],
  ["signup_attribution", "user_id"], ["signup_intake", "user_id"], ["stack_members", "user_id"],
  ["stacks", "user_id"], ["subscriptions", "user_id"], ["user_custom_compounds", "profile_id"],
  ["user_dose_logs", "profile_id"], ["user_markers", "user_id"], ["user_stack_compounds", "profile_id"],
  ["weight_logs", "profile_id"],
]

/**
 * ⚠️ THE CENSUS RETRIES, BECAUSE A GUARD THAT CANNOT COMPLETE IS NOT A GUARD.
 *
 * Measured on the first run of this file: the after-census died on a **Gateway
 * Timeout** partway through walking `progress-photos`. Every test had passed and
 * the flow was clean, but the one check that proves the drive touched nobody
 * else's files could not answer — so the run reported failure while telling us
 * nothing about the thing it exists to tell us.
 *
 * That is the wrong shape twice over. A transient 504 from someone else's server
 * is not evidence of damage, and treating it as a failed assertion trains a
 * reader to ignore the check. But swallowing it would be far worse: a census
 * that silently gave up would read as "clean".
 *
 * So it retries, and if it still cannot read it THROWS with a message saying the
 * census could not be taken — which is a third state, not a pass and not a
 * mismatch. Absent is not unknown.
 */
async function listWithRetry(bucket: string, dir: string) {
  let last = ""
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data, error } = await admin.storage.from(bucket).list(dir, { limit: 1000, offset: 0 })
    if (!error && data) return data
    last = error?.message ?? "no data and no error"
    // Linear back-off. The failure seen was a 504 under load, not a rate limit.
    await new Promise((r) => setTimeout(r, 400 * (attempt + 1)))
  }
  throw new Error(
    `CENSUS COULD NOT BE TAKEN for ${bucket}/${dir} after 4 attempts: ${last}. ` +
      `This is NOT a mismatch - it is a failed read, and the drive's effect on ` +
      `other accounts is unverified. Re-run before drawing any conclusion.`,
  )
}

async function census(): Promise<number> {
  let total = 0
  for (const bucket of SWEEP_BUCKETS) {
    const walk = async (dir: string, depth: number): Promise<void> => {
      for (const e of await listWithRetry(bucket, dir)) {
        if (e.id !== null) total += 1
        else if (depth < 3) await walk(dir ? `${dir}/${e.name}` : e.name, depth + 1)
      }
    }
    await walk("", 0)
  }
  return total
}

/** Objects, in the real layouts. `avatars` is one level; the rest are two. */
const layout = (id: string): Record<string, string[]> => ({
  bloodwork: [`${id}/panel-a/report.png`],
  "progress-photos": [`${id}/sess-a/photo.png`, `${id}/sess-b/photo.png`],
  journal: [`${id}/entry-a/photo.png`],
  avatars: [`${id}/avatar.png`],
})

async function seedAccount(tag: string, opts: { refundRequest: boolean }) {
  const email = `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@trackd-qa.invalid`
  const { data, error } = await admin.auth.admin.createUser({
    email, password: QA_PASSWORD, email_confirm: true,
  })
  if (error) throw new Error(`createUser: ${error.message}`)
  const id = data.user.id
  if (!id) throw new Error("createUser answered without an id")

  for (const [bucket, paths] of Object.entries(layout(id))) {
    for (const path of paths) {
      const up = await admin.storage.from(bucket).upload(path, PNG, {
        contentType: "image/png", upsert: true,
      })
      if (up.error) throw new Error(`seed ${bucket}/${path}: ${up.error.message}`)
    }
  }

  const paths = layout(id)
  const rows: [string, Record<string, unknown>][] = [
    ["cycles", { user_id: id, name: "QA cycle" }],
    ["body_metrics", { user_id: id }],
    ["lab_panels", { user_id: id, source_file_path: paths.bloodwork[0] }],
    ["progress_photos", { user_id: id, pose: "front", storage_path: paths["progress-photos"][0] }],
  ]
  for (const [table, row] of rows) {
    const { error: e } = await admin.from(table).insert(row)
    if (e) throw new Error(`seed ${table}: ${e.message}`)
  }

  const { data: entry, error: entryErr } = await admin
    .from("journal_entries").insert({ user_id: id }).select("id").single()
  if (entryErr) throw new Error(`seed journal_entries: ${entryErr.message}`)
  const { error: attErr } = await admin.from("journal_attachments").insert({
    user_id: id, journal_entry_id: entry.id, storage_path: paths.journal[0],
  })
  if (attErr) throw new Error(`seed journal_attachments: ${attErr.message}`)

  // ⚠️ Step 6's shape, per D41 and 10 3.3: the marker is the literal
  // `refund_request` in `beta_feedback.path`. Nothing invented.
  const { error: fbErr } = await admin.from("beta_feedback").insert({
    user_id: id,
    email,
    message: "QA fixture. Not a real request.",
    path: opts.refundRequest ? REFUND_REQUEST_MARKER : "/dashboard",
  })
  if (fbErr) throw new Error(`seed beta_feedback: ${fbErr.message}`)

  return { id, email }
}

let censusBefore = 0
const created: string[] = []

beforeAll(async () => {
  censusBefore = await census()
})

afterAll(async () => {
  // ⚠️ BY ID. Anything the drive failed to delete is cleaned up here so a failed
  // assertion does not leave a QA account behind.
  for (const id of created) {
    await admin.auth.admin.deleteUser(id).catch(() => undefined)
    for (const [bucket, paths] of Object.entries(layout(id))) {
      await admin.storage.from(bucket).remove(paths).catch(() => undefined)
    }
  }
  const after = await census()
  expect(
    after,
    `CENSUS MISMATCH: ${censusBefore} before, ${after} after. Stop and report before any cleanup.`,
  ).toBe(censusBefore)
})

describe("⚠️ Step 6 — the refund warning, both branches, against real rows", () => {
  it("is ABSENT when the account has no refund request", async () => {
    const { id } = await seedAccount("del-norefund", { refundRequest: false })
    created.push(id)
    // An ordinary feedback row exists, so this proves the marker is what
    // decides - not merely that the table is empty.
    expect(await hasOpenRefundRequest(admin, id)).toBe(false)
  })

  it("is PRESENT when an open request exists, and gone once resolved", async () => {
    const { id } = await seedAccount("del-refund", { refundRequest: true })
    created.push(id)
    expect(await hasOpenRefundRequest(admin, id)).toBe(true)

    // `resolved_at IS NULL` is what "open" means - the same predicate /admin
    // already uses. A resolved request is not an open one.
    const { error } = await admin
      .from("beta_feedback")
      .update({ resolved_at: new Date().toISOString() })
      .eq("user_id", id)
      .eq("path", REFUND_REQUEST_MARKER)
    expect(error).toBeNull()
    expect(await hasOpenRefundRequest(admin, id)).toBe(false)
  })
})

describe("⚠️ Step 7 — the deletion, observed", () => {
  it("erases the account, and NOTHING of theirs remains", async () => {
    const { id, email } = await seedAccount("del-full", { refundRequest: true })
    created.push(id)

    // ── BEFORE: prove there was something to delete ──────────────────────
    const seeded = layout(id)
    for (const bucket of SWEEP_BUCKETS) {
      const { data, error } = await admin.storage.from(bucket).list(id, { limit: 100, offset: 0 })
      expect(error, `${bucket} pre-check`).toBeNull()
      expect((data ?? []).length, `${bucket} should hold the seed`).toBeGreaterThan(0)
    }
    const seededTables: string[] = []
    for (const [table, col] of OWNED) {
      const { count } = await admin.from(table).select("*", { count: "exact", head: true }).eq(col, id)
      if ((count ?? 0) > 0) seededTables.push(table)
    }
    expect(seededTables.length, "the seed must actually populate rows").toBeGreaterThan(4)

    // ── THE FLOW ─────────────────────────────────────────────────────────
    const outcome = await deleteAccountFor(id)
    expect(outcome, JSON.stringify(outcome)).toEqual({ ok: true, stepsRun: [...DELETION_ORDER] })

    // ── AFTER, BY OBSERVATION ────────────────────────────────────────────
    // All four buckets confirmed empty of that user's objects BY LISTING.
    for (const bucket of SWEEP_BUCKETS) {
      const { data, error } = await admin.storage.from(bucket).list(id, { limit: 100, offset: 0 })
      expect(error, `${bucket} verify`).toBeNull()
      expect(data, `${bucket} still holds objects for ${id}`).toEqual([])
      // And a direct read of one seeded path, which `list` on a prefix cannot
      // answer for a nested object.
      for (const path of seeded[bucket] ?? []) {
        const dl = await admin.storage.from(bucket).download(path)
        expect(dl.error, `${path} is still downloadable`).not.toBeNull()
      }
    }

    // Every cascaded table empty of that user - all 32, not just the seeded ones.
    for (const [table, col] of OWNED) {
      const { count, error } = await admin
        .from(table).select("*", { count: "exact", head: true }).eq(col, id)
      expect(error, `${table} verify`).toBeNull()
      expect(count ?? 0, `${table} still holds rows for ${id}`).toBe(0)
    }
    const { count: profileCount } = await admin
      .from("profiles").select("*", { count: "exact", head: true }).eq("id", id)
    expect(profileCount ?? 0).toBe(0)

    // The auth user no longer exists.
    const { data: gone } = await admin.auth.admin.getUserById(id)
    expect(gone?.user ?? null, `auth user ${email} still exists`).toBeNull()
  })

  it("is idempotent — a second deletion of the same id is not an error", async () => {
    const { id } = await seedAccount("del-twice", { refundRequest: false })
    created.push(id)

    expect((await deleteAccountFor(id)).ok).toBe(true)

    // ⚠️ The retry a half-failed deletion would make. Nothing is left, so every
    // step finds nothing - which must read as success, not as a failure.
    const again = await deleteAccountFor(id)
    expect(again.ok, JSON.stringify(again)).toBe(true)
  })

  it("⚠️ a LAPSED, read-only account completes deletion end to end", async () => {
    // The exit is never gated. An account nobody can leave is data held hostage.
    const { id } = await seedAccount("del-lapsed", { refundRequest: false })
    created.push(id)

    // An expired entitlement: with BILLING_GATE_ENABLED on, this account is
    // read-only and every ordinary write is refused.
    const { error } = await admin.from("entitlements").insert({
      user_id: id, product: "pro", source: "comp",
      active_until: "2020-01-01T00:00:00Z",
    })
    expect(error, "seeding the lapsed entitlement").toBeNull()

    const outcome = await deleteAccountFor(id)
    expect(outcome, JSON.stringify(outcome)).toEqual({ ok: true, stepsRun: [...DELETION_ORDER] })

    const { data: gone } = await admin.auth.admin.getUserById(id)
    expect(gone?.user ?? null).toBeNull()
  })

  it("⚠️ BY ID ONLY — refuses anything that is not a bare UUID", async () => {
    for (const bad of ["", "%", "*", "del-full@trackd-qa.invalid", "trackd-qa.invalid"]) {
      await expect(deleteAccountFor(bad)).rejects.toThrow(/bare UUID/)
    }
  })
})
