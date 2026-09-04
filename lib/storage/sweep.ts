import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * ⚠️ THE STORAGE SWEEP. Deletes one user's objects from all four private
 * buckets, and PROVES afterwards that they are gone.
 *
 * `16-account-deletion.md` §3.4: a database cascade deletes rows and does not
 * touch object storage, so a bare row delete leaves bloodwork scans, progress
 * photos, journal photos and avatars sitting in a bucket. This is the step that
 * reaches them, and §3.2 puts it BEFORE the row delete — the rows are the map.
 *
 * ⚠️ THIS MODULE IS `server-only`, NOT `"use server"`. Every export of a
 * `"use server"` module is a publicly dispatchable HTTP endpoint, and
 * `sweepUserStorage` takes a user id — as an action it would be the most
 * dangerous endpoint in the product. `server-only` makes it unreachable from a
 * browser and fails the BUILD if anyone imports it into a client bundle. The
 * caller resolves the id from a verified session; this function never does.
 *
 * ## ⚠️ BY ID ONLY
 *
 * Never by email, never by domain, never by any matcher. `assertUserId` rejects
 * anything that is not a bare UUID before a single call is made. A previous
 * cleanup on this project matched a whole domain and destroyed sixteen real
 * fixtures.
 *
 * ## Two enumerations, because one of them has been measured to miss
 *
 * PRIMARY is the PREFIX enumeration: every object under `<user_id>/` in each
 * bucket. All four buckets store objects that way and it is not merely
 * convention — `WITH CHECK ((storage.foldername(name))[1] = auth.uid()::text)`
 * in `trackd_storage_policies.sql`, `avatar/001`, `journal/001` and
 * `progress/001` makes the database refuse any other shape.
 *
 * SECONDARY is the ROW MAP: `lab_panels.source_file_path`,
 * `progress_photos.storage_path`, `journal_attachments.storage_path` and
 * `profiles.avatar_path`.
 *
 * ⚠️ **The row map alone is NOT sufficient, and that is measured rather than
 * assumed.** Against production on 2026-09-03: 53 rows record a path, 59 objects
 * exist, and SIX objects have no row pointing at them. One of the six —
 * `journal/e120f593-…/a28a3034-…/photo.jpg`, 845,660 bytes, uploaded
 * 2026-08-17 — is under the prefix of a LIVE account that signed in three days
 * later. A row-driven sweep would have left a real person's journal photo in the
 * bucket and reported success. The uploads happen client-side BEFORE the row is
 * written (`JournalEntrySheet.tsx`, `AttachBloodworkSheet.tsx`,
 * `AddProgressPhotoSheet.tsx`), so any interruption between the two strands an
 * object the rows cannot see.
 *
 * The secondary is still read, because the reverse hole is real too: a row whose
 * path somehow sits outside the user's prefix is invisible to the primary.
 *
 * ## ⚠️ A PATH FROM THE ROW MAP IS NEVER DELETED OUTSIDE THE USER'S PREFIX
 *
 * If a row belonging to user A records a path under user B's prefix — corruption,
 * a bad backfill, a bug in a future writer — deleting it would destroy B's file
 * while deleting A's account. So an out-of-prefix path is REPORTED as a finding
 * and left alone. Refusing is the recoverable direction; deleting is not.
 *
 * ## ⚠️ VERIFIED BY LISTING, NEVER BY THE DELETE'S RETURN VALUE
 *
 * `remove()` can partially succeed and answer without an error. So the sweep
 * re-LISTS every bucket after deleting and reports what is actually still there.
 * "No error returned" is not "nothing remains", and this module never treats it
 * as such.
 *
 * ## ⚠️ THREE STATES, BECAUSE "COULD NOT READ" IS NOT "EMPTY"
 *
 * The one failure this instrument must not have is reporting success on a bucket
 * it never read. So every bucket resolves to `swept`, `remaining` or `unknown`,
 * and the two inputs are kept apart at the only place they could be confused:
 * `list()` answers `{data, error}` as separate fields, so an ERROR becomes
 * `unknown` and an empty `data` array becomes zero objects. A failed read can
 * never take the `swept` branch — see {@link listPrefix}, which returns a
 * discriminated union rather than an array, so there is no empty array for a
 * failure to masquerade as.
 *
 * ## Idempotent
 *
 * A second run lists nothing, deletes nothing, verifies nothing remains and
 * answers `swept`. Deleting an absent object is not an error in Storage, and the
 * verification is a fresh read either way, so a retry after a partial failure is
 * safe and is the intended repair.
 */

/** The four private buckets that hold user files. */
export const SWEEP_BUCKETS = [
  "bloodwork",
  "progress-photos",
  "journal",
  "avatars",
] as const;

export type SweepBucket = (typeof SWEEP_BUCKETS)[number];

/**
 * Where each bucket's paths are recorded, for the SECONDARY enumeration.
 *
 * `avatars` is keyed on `profiles.id` rather than a `user_id` column, which is
 * why the column to filter on is named here instead of being assumed.
 */
const ROW_MAP: Record<SweepBucket, { table: string; column: string; owner: string }> = {
  bloodwork: { table: "lab_panels", column: "source_file_path", owner: "user_id" },
  "progress-photos": { table: "progress_photos", column: "storage_path", owner: "user_id" },
  journal: { table: "journal_attachments", column: "storage_path", owner: "user_id" },
  avatars: { table: "profiles", column: "avatar_path", owner: "id" },
};

/** Storage `list` pages at 100 by default; asked for explicitly so it is visible. */
const PAGE = 100;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * ⚠️ BY ID ONLY. Throws on anything that is not a bare UUID.
 *
 * The point is not type-safety — TypeScript already says `string`. It is that a
 * `%`, a `*`, an email or an empty string must never reach a path prefix. An
 * empty id would make the prefix `/`, which lists the WHOLE BUCKET.
 */
function assertUserId(userId: string): void {
  if (!UUID.test(userId)) {
    throw new Error(
      "sweepUserStorage: refusing a user id that is not a bare UUID. BY ID ONLY, never by email, domain or matcher.",
    );
  }
}

/** A read that either answered, or did not. There is no empty-array failure. */
type Listing =
  | { ok: true; paths: string[] }
  | { ok: false; reason: string };

/**
 * Every object under a prefix, recursing into folders, paging to the end.
 *
 * ⚠️ RECURSIVE, because Storage's `list` is not. It answers one level and marks
 * a folder with a null `id`. The layouts here are two deep
 * (`<user>/<random>/photo.jpg`) except avatars (`<user>/avatar.webp`), so a
 * single-level list would return the FOLDER NAMES for three of the four buckets
 * and delete nothing while reporting success.
 *
 * ⚠️ PAGED. A user with more than 100 objects in one folder would otherwise have
 * the tail silently left behind — the same class of defect
 * `listAllSubscriptions` exists for on the billing side.
 *
 * ⚠️ ANY error at any depth fails the WHOLE listing. A partial answer is exactly
 * the input that makes a sweep report success over files it never saw.
 */
async function listPrefix(
  client: SupabaseClient,
  bucket: string,
  prefix: string,
): Promise<Listing> {
  const found: string[] = [];
  const queue: string[] = [prefix];

  while (queue.length > 0) {
    const dir = queue.shift() as string;
    let offset = 0;

    for (;;) {
      const { data, error } = await client.storage
        .from(bucket)
        .list(dir, { limit: PAGE, offset });

      if (error) return { ok: false, reason: `${bucket}: list(${dir}) failed: ${error.message}` };
      // Belt and braces: a client that answers neither data nor error is a read
      // that did not happen, and must not read as "this folder is empty".
      if (!data) return { ok: false, reason: `${bucket}: list(${dir}) returned no data and no error` };

      for (const entry of data) {
        if (!entry.name) continue;
        const full = `${dir}/${entry.name}`;
        // Storage marks a folder with a null `id`. A placeholder row Supabase
        // creates for an empty folder has a null id too, and recursing into it
        // simply finds nothing, which is correct.
        if (entry.id === null) queue.push(full);
        else found.push(full);
      }

      if (data.length < PAGE) break;
      offset += PAGE;
    }
  }

  return { ok: true, paths: found };
}

/** The paths this user's ROWS say exist in a bucket. Secondary enumeration. */
async function listFromRows(
  client: SupabaseClient,
  bucket: SweepBucket,
  userId: string,
): Promise<Listing> {
  const { table, column, owner } = ROW_MAP[bucket];
  const { data, error } = await client.from(table).select(column).eq(owner, userId);

  if (error) return { ok: false, reason: `${bucket}: ${table}.${column} read failed: ${error.message}` };
  if (!data) return { ok: false, reason: `${bucket}: ${table}.${column} returned no data and no error` };

  const paths: string[] = [];
  for (const row of data as unknown as Record<string, unknown>[]) {
    const value = row[column];
    if (typeof value === "string" && value.length > 0) paths.push(value);
  }
  return { ok: true, paths };
}

/** What happened to one bucket. `swept` is the only success. */
export type BucketOutcome =
  | { bucket: SweepBucket; state: "swept"; deleted: number }
  | { bucket: SweepBucket; state: "remaining"; deleted: number; remaining: string[] }
  | { bucket: SweepBucket; state: "unknown"; reason: string };

export interface SweepResult {
  /** True only when EVERY bucket is `swept`. Never true on an `unknown`. */
  ok: boolean;
  userId: string;
  buckets: BucketOutcome[];
  /**
   * Row-map paths that sit outside this user's prefix. NOT deleted, deliberately
   * — see the module comment. A non-empty list is a data-integrity finding and
   * it forces `ok` to false, because something is recorded that the sweep will
   * not touch.
   */
  refusedOutOfPrefix: string[];
}

/**
 * Delete every object this user has, then PROVE the buckets are empty of them.
 *
 * The caller must have resolved `userId` from a verified session. This does not
 * authenticate anybody and must never be handed an id off a request.
 */
export async function sweepUserStorage(
  client: SupabaseClient,
  userId: string,
): Promise<SweepResult> {
  assertUserId(userId);

  const prefix = userId;
  const buckets: BucketOutcome[] = [];
  const refusedOutOfPrefix: string[] = [];

  for (const bucket of SWEEP_BUCKETS) {
    // ── ENUMERATE ────────────────────────────────────────────────────────────
    const primary = await listPrefix(client, bucket, prefix);
    if (!primary.ok) {
      buckets.push({ bucket, state: "unknown", reason: primary.reason });
      continue;
    }

    const secondary = await listFromRows(client, bucket, userId);
    if (!secondary.ok) {
      // ⚠️ NOT downgraded to "the primary will do". Losing the cross-check means
      // we cannot say an out-of-prefix path does not exist, and "we could not
      // check" is not "there is nothing there".
      buckets.push({ bucket, state: "unknown", reason: secondary.reason });
      continue;
    }

    const targets = new Set(primary.paths);
    for (const path of secondary.paths) {
      if (path === prefix || path.startsWith(`${prefix}/`)) targets.add(path);
      else refusedOutOfPrefix.push(`${bucket}:${path}`);
    }

    // ── DELETE ───────────────────────────────────────────────────────────────
    // The result is deliberately NOT consulted. `remove()` can partially succeed
    // and answer without an error, so the only thing that decides the outcome is
    // the verification read below. An error here is not even fatal: the retry is
    // free and the listing is what settles it.
    if (targets.size > 0) {
      const { error } = await client.storage.from(bucket).remove([...targets]);
      if (error) console.warn(`[sweep] ${bucket}: remove reported ${error.message}; verifying anyway`);
    }

    // ── VERIFY BY LISTING ────────────────────────────────────────────────────
    const after = await listPrefix(client, bucket, prefix);
    if (!after.ok) {
      // Deleted, but unverified. That is `unknown`, never `swept`.
      buckets.push({ bucket, state: "unknown", reason: `after delete: ${after.reason}` });
      continue;
    }

    if (after.paths.length > 0) {
      buckets.push({
        bucket,
        state: "remaining",
        deleted: targets.size - after.paths.length,
        remaining: after.paths,
      });
      continue;
    }

    buckets.push({ bucket, state: "swept", deleted: targets.size });
  }

  const ok =
    refusedOutOfPrefix.length === 0 && buckets.every((b) => b.state === "swept");

  return { ok, userId, buckets, refusedOutOfPrefix };
}

/** One line per bucket, for a runbook or a log. Never used as the verdict. */
export function describeSweep(result: SweepResult): string {
  const lines = result.buckets.map((b) =>
    b.state === "swept"
      ? `  ${b.bucket}: swept (${b.deleted} deleted, 0 remain)`
      : b.state === "remaining"
        ? `  ${b.bucket}: REMAINING ${b.remaining.length} — ${b.remaining.join(", ")}`
        : `  ${b.bucket}: UNKNOWN — ${b.reason}`,
  );
  if (result.refusedOutOfPrefix.length > 0) {
    lines.push(`  REFUSED (outside the user's prefix, NOT deleted): ${result.refusedOutOfPrefix.join(", ")}`);
  }
  return `sweep ${result.userId}: ${result.ok ? "ok" : "NOT COMPLETE"}\n${lines.join("\n")}`;
}
