"use server"

/**
 * Data access for `blocks` + `block_targets` (`supabase/blocks/001_blocks.sql`).
 * Postgres is the source of truth, not a mirror: a block is a RECORD of a period
 * someone trained through, and losing a sixteen-week prep to a PWA reinstall
 * would be the worst possible bug in a feature whose whole point is looking back.
 *
 * House pattern (`lib/db/cycles.ts`, `lib/home/syncActions.ts`): identity always
 * comes from the verified session, never from the client, and RLS is the
 * backstop rather than the only gate. The cookie-bound server client uses the
 * publishable key; the service role is never used here.
 *
 * The one-live-block rule is enforced by a partial unique index in the schema,
 * so `startBlock` closes the current one in the same call rather than racing it.
 */

import { createClient } from "@/lib/supabase/server"
import type { Block, BlockTarget } from "@/lib/blocks/block"

/** Matches the column's own CHECK (`001_blocks.sql`: length <= 4000). */
const REFLECTION_MAX = 4000

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/

/** A "YYYY-MM-DD" that is also a real calendar day. */
function isDateKey(value: string): boolean {
  if (!DATE_KEY_RE.test(value)) return false
  const [y, m, d] = value.split("-").map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return (
    dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
  )
}

async function sessionCtx() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  return { supabase, userId: user.id }
}

interface BlockRow {
  id: string
  name: string
  started_on: string
  ends_on: string | null
  status: string
  closed_on: string | null
  reflection: string | null
  block_targets?: {
    variable: string
    target_value: number
    direction: string
  }[]
}

function rowToBlock(r: BlockRow): Block {
  return {
    id: r.id,
    name: r.name,
    startedOn: r.started_on,
    endsOn: r.ends_on,
    status:
      r.status === "completed" || r.status === "abandoned" ? r.status : "active",
    closedOn: r.closed_on,
    reflection: r.reflection,
    targets: (r.block_targets ?? [])
      // Narrow defensively even though a CHECK constraint guards both columns:
      // this is the boundary, and the row could predate a future schema change.
      .filter(
        (t): t is { variable: BlockTarget["variable"]; target_value: number; direction: BlockTarget["direction"] } =>
          (t.variable === "weight" || t.variable === "consistency") &&
          (t.direction === "up" || t.direction === "down"),
      )
      .map((t) => ({
        variable: t.variable,
        value: Number(t.target_value),
        direction: t.direction,
      })),
  }
}

/** Every block this user has, newest start first. Empty when signed out. */
export async function listBlocks(): Promise<Block[]> {
  const ctx = await sessionCtx()
  if (!ctx) return []
  const { data, error } = await ctx.supabase
    .from("blocks")
    .select("*, block_targets(variable, target_value, direction)")
    .eq("user_id", ctx.userId)
    .order("started_on", { ascending: false })
  if (error) {
    console.error("listBlocks failed", error)
    return []
  }
  return (data ?? []).map((r) => rowToBlock(r as BlockRow))
}

export interface StartBlockInput {
  name: string
  startedOn: string
  endsOn: string | null
  targets: BlockTarget[]
  /**
   * The CALLER'S local date, "YYYY-MM-DD".
   *
   * Not derived here, and this is load-bearing. The server runs in UTC, so
   * `new Date().toISOString().slice(0,10)` is the UTC date — which is yesterday
   * for a Sydney user before 10am and tomorrow for a Californian after 5pm.
   * That is not cosmetic here: `blocks_closed_after_start` is a CHECK, so a
   * UTC-yesterday `closed_on` against a locally-started-today block is REJECTED,
   * and the user is left unable to close their block or start another. The rest
   * of the app has the same hazard documented in `lib/home/protocolSync.ts`;
   * this table's constraints turn it into a lockout, so the local date comes
   * from the client that knows it.
   */
  todayKey: string
}

/**
 * The date to stamp as `closed_on`, never earlier than the day the block
 * started.
 *
 * The clamp is the second half of the lockout fix. Even with a correct local
 * date, a block whose start is in the FUTURE cannot be closed "today" without
 * violating `blocks_closed_after_start` — and since only one block may be
 * active, that user could neither close it nor start another until the start
 * date arrived. Closing such a block on its own start date is the honest
 * reading: it ran for no days.
 */
function closeDateFor(startedOn: string, todayKey: string): string {
  return todayKey < startedOn ? startedOn : todayKey
}

/**
 * Start a block, closing whatever was live first.
 *
 * Closing first is not politeness, it is the only way this can succeed: the
 * schema's partial unique index permits exactly one active block per user, so an
 * insert alongside a live one is rejected. Marking the old one `completed` is
 * also the honest reading — you did run it, right up until you started this.
 */
export async function startBlock(
  input: StartBlockInput,
): Promise<{ ok: true; block: Block } | { ok: false; error: string }> {
  const ctx = await sessionCtx()
  if (!ctx) return { ok: false, error: "Not signed in." }

  const name = input.name.trim()
  if (!name) return { ok: false, error: "A block needs a name." }
  if (!isDateKey(input.startedOn)) {
    return { ok: false, error: "That is not a date." }
  }
  if (input.endsOn && !isDateKey(input.endsOn)) {
    return { ok: false, error: "That is not a date." }
  }
  if (input.endsOn && input.endsOn < input.startedOn) {
    return { ok: false, error: "The end date is before the start date." }
  }
  // A block records a period you TRAINED THROUGH, so it cannot begin in the
  // future. The sheet already refuses it; this is a server action, which is a
  // public endpoint, so the rule belongs beside the one above rather than only
  // in the form. Judged against the caller's own local date for the same reason
  // `todayKey` exists at all.
  if (isDateKey(input.todayKey) && input.startedOn > input.todayKey) {
    return { ok: false, error: "A block starts today or earlier." }
  }

  // Read the live block BEFORE closing it, so a failed insert can put it back.
  // These are two statements with no transaction between them (PostgREST has no
  // multi-statement call), and without the restore a network blip between them
  // would end a sixteen-week prep and replace it with nothing.
  const { data: liveRows } = await ctx.supabase
    .from("blocks")
    .select("id, started_on")
    .eq("user_id", ctx.userId)
    .eq("status", "active")
  const live = liveRows?.[0] ?? null

  if (live) {
    const { error: closeError } = await ctx.supabase
      .from("blocks")
      .update({
        status: "completed",
        closed_on: closeDateFor(live.started_on as string, input.todayKey),
      })
      .eq("id", live.id)
      .eq("user_id", ctx.userId)
      .eq("status", "active")
    if (closeError) {
      console.error("startBlock could not close the live block", closeError)
      return { ok: false, error: "Could not close your current block." }
    }
  }

  const { data, error } = await ctx.supabase
    .from("blocks")
    .insert({
      user_id: ctx.userId,
      name,
      started_on: input.startedOn,
      ends_on: input.endsOn,
    })
    .select("*")
    .single()
  if (error || !data) {
    console.error("startBlock insert failed", error)
    // Compensate: hand the user back the block we just closed on their behalf.
    // They asked to start a new one, not to end the old one, and ending it
    // without replacing it is the one outcome nobody wanted.
    if (live) {
      const { error: restoreError } = await ctx.supabase
        .from("blocks")
        .update({ status: "active", closed_on: null })
        .eq("id", live.id)
        .eq("user_id", ctx.userId)
      if (restoreError) {
        console.error("startBlock could not restore the live block", restoreError)
      }
    }
    return { ok: false, error: "Could not start the block." }
  }

  if (input.targets.length > 0) {
    const { error: tErr } = await ctx.supabase.from("block_targets").insert(
      input.targets.map((t) => ({
        block_id: data.id,
        user_id: ctx.userId,
        variable: t.variable,
        target_value: t.value,
        direction: t.direction,
      })),
    )
    // The block exists and is usable without its targets, so this reports rather
    // than rolling back — losing the block over a target would be worse.
    if (tErr) console.error("startBlock targets insert failed", tErr)
  }

  return { ok: true, block: rowToBlock({ ...(data as BlockRow), block_targets: [] }) }
}

/** Push a live block's end date out. The user picks the new date. */
export async function extendBlock(
  blockId: string,
  endsOn: string,
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await sessionCtx()
  if (!ctx) return { ok: false, error: "Not signed in." }
  // A server action is a public endpoint, and this one validated nothing: it
  // accepted "1999-01-01", and it accepted a string that was not a date at all.
  if (!isDateKey(endsOn)) return { ok: false, error: "That is not a date." }

  // Read first, exactly as `closeBlock` does. An update that matches no row is
  // not an error to PostgREST, so extending a block that is finished, or one
  // that belongs to someone else, used to return ok and the sheet closed as
  // though the date had moved.
  const { data: row } = await ctx.supabase
    .from("blocks")
    .select("started_on, status")
    .eq("id", blockId)
    .eq("user_id", ctx.userId)
    .maybeSingle()
  if (!row) return { ok: false, error: "Could not extend the block." }
  if ((row.status as string) !== "active") {
    return { ok: false, error: "That block has already finished." }
  }
  if (endsOn < (row.started_on as string)) {
    return { ok: false, error: "The end date is before the start date." }
  }

  const { error } = await ctx.supabase
    .from("blocks")
    .update({ ends_on: endsOn })
    .eq("id", blockId)
    .eq("user_id", ctx.userId)
    .eq("status", "active")
  if (error) {
    console.error("extendBlock failed", error)
    return { ok: false, error: "Could not extend the block." }
  }
  return { ok: true }
}

/**
 * Close a block and keep whatever the user wrote about it.
 *
 * `closedOn` bounds the retrospective, which is why it is the close date and not
 * the planned end: a block finished early covers the days it actually ran.
 */
export async function closeBlock(
  blockId: string,
  /** The caller's LOCAL date — see {@link StartBlockInput.todayKey}. */
  todayKey: string,
  opts: { reflection?: string; abandoned?: boolean } = {},
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await sessionCtx()
  if (!ctx) return { ok: false, error: "Not signed in." }

  // The start date decides the earliest legal close, so read it rather than
  // assume today is after it (`blocks_closed_after_start` is a CHECK, and a
  // rejected close is a block the user cannot get rid of).
  const { data: row } = await ctx.supabase
    .from("blocks")
    .select("started_on, status")
    .eq("id", blockId)
    .eq("user_id", ctx.userId)
    .maybeSingle()
  if (!row) return { ok: false, error: "Could not close the block." }
  // Only a LIVE block closes. Re-closing a finished one moved `closed_on` to
  // today, and `closed_on` bounds the retrospective — so a stray second close
  // silently re-cut the window of a block that ended months ago.
  if ((row.status as string) !== "active") {
    return { ok: false, error: "That block has already finished." }
  }

  // The reflection is only WRITTEN when one was supplied. It used to be set
  // unconditionally, so closing with an empty box erased a note the user had
  // already written on the live block — and it is the one thing in the whole
  // retrospective that cannot be regenerated from the data. Clearing a
  // reflection on purpose is `saveReflection`'s job, on a screen that shows you
  // what you are clearing.
  const reflection = opts.reflection?.trim()
  const patch: Record<string, unknown> = {
    status: opts.abandoned ? "abandoned" : "completed",
    closed_on: closeDateFor(row.started_on as string, todayKey),
  }
  if (reflection) patch.reflection = reflection.slice(0, REFLECTION_MAX)

  const { error } = await ctx.supabase
    .from("blocks")
    .update(patch)
    .eq("id", blockId)
    .eq("user_id", ctx.userId)
    .eq("status", "active")
  if (error) {
    console.error("closeBlock failed", error)
    return { ok: false, error: "Could not close the block." }
  }
  return { ok: true }
}

/**
 * Rewrite a block's reflection. Unlike `closeBlock` this one MAY clear it: the
 * user is looking at the note while they empty the box.
 */
export async function saveReflection(
  blockId: string,
  reflection: string,
): Promise<{ ok: boolean }> {
  const ctx = await sessionCtx()
  if (!ctx) return { ok: false }
  // Truncated to the column's own CHECK rather than sent and rejected, so a long
  // note saves what fits instead of failing whole. The editor caps input at the
  // same figure; this is the boundary that cannot assume it did.
  const next = reflection.trim().slice(0, REFLECTION_MAX)
  const { data, error } = await ctx.supabase
    .from("blocks")
    .update({ reflection: next || null })
    .eq("id", blockId)
    .eq("user_id", ctx.userId)
    .select("id")
    .maybeSingle()
  if (error) {
    console.error("saveReflection failed", error)
    return { ok: false }
  }
  // A zero-row update is a success to PostgREST. It is not one here: the editor
  // closed and said the note was kept, having written nothing.
  return { ok: data != null }
}
