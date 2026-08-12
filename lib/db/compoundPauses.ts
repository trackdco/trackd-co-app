"use server"

/**
 * Data access for `compound_pauses` (`supabase/protocol/018`) — the stretches
 * during which a compound is not being taken.
 *
 * RLS-scoped; identity from the verified session, never the service role (house
 * pattern). **Nothing derived is stored**: there is no "paused" flag to maintain
 * and no end date to rewrite, so every write here is either creating a pause or
 * ending one. See `lib/home/pauses.ts` for why that matters.
 *
 * TOLERANT OF THE TABLE NOT EXISTING YET, exactly as the schedule versions are:
 * `018` is additive and pending, so until it is applied every call is a no-op
 * rather than an error. The device store holds the pause meanwhile and pushes it
 * once the migration lands.
 */
import { createClient } from "@/lib/supabase/server"
import { canWriteData } from "@/lib/billing/gate"

/** A pause row, in the shape the device model uses. */
export interface PauseRow {
  id: string
  protocolCompoundId: string
  startedOn: string
  endsOn: string | null
  groupId: string | null
}

type Ok = { ok: boolean; skipped?: boolean }

/** PostgREST answers `PGRST205` from its schema cache before Postgres ever sees
 *  the request, so a genuinely absent table never surfaces `42P01`. Checking
 *  only the latter makes the "not applied yet" path dead code. */
function isMissingTable(error: { code?: string } | null): boolean {
  return error?.code === "42P01" || error?.code === "PGRST205"
}

async function ctx() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  return { supabase, userId: user.id }
}

/** Every active pause for the user, oldest first. Empty (never throws) when
 *  signed out, on error, or before `018` is applied. */
export async function listPauses(): Promise<PauseRow[]> {
  try {
    const cx = await ctx()
    if (!cx) return []
    const { data, error } = await cx.supabase
      .from("compound_pauses")
      .select("id, protocol_compound_id, started_on, ends_on, pause_group_id")
      .eq("user_id", cx.userId)
      .eq("is_active", true)
      .order("started_on", { ascending: true })
    if (error) {
      if (!isMissingTable(error)) console.error("listPauses failed", error)
      return []
    }
    return (data ?? []).map((r) => ({
      id: r.id as string,
      protocolCompoundId: r.protocol_compound_id as string,
      startedOn: r.started_on as string,
      endsOn: (r.ends_on as string | null) ?? null,
      groupId: (r.pause_group_id as string | null) ?? null,
    }))
  } catch (e) {
    console.error("listPauses failed", e)
    return []
  }
}

/**
 * Create or update a pause. `id` is CLIENT-generated, so replaying this write is
 * idempotent — the house pattern, and the reason a background push that runs
 * twice cannot leave two pauses where the user made one.
 */
export async function upsertPause(row: PauseRow): Promise<Ok> {
  // ⚠️ THE READ-ONLY GATE, AT THE DATA LAYER.
  //
  // NOT at the wrapper. Every export of a `"use server"` module is a dispatchable
  // action with its own id, so gating `startBlockAction` while leaving
  // `startBlock` open is a lock on a door beside an open window. A cold review
  // drove exactly that: `startBlockAction` refused, `startBlock` wrote the row.
  //
  // See `lib/billing/gate.ts` for what is deliberately NOT gated.
  if (!(await canWriteData())) return { ok: false };
  try {
    const cx = await ctx()
    if (!cx) return { ok: false }
    const { error } = await cx.supabase.from("compound_pauses").upsert(
      {
        id: row.id,
        user_id: cx.userId,
        protocol_compound_id: row.protocolCompoundId,
        started_on: row.startedOn,
        ends_on: row.endsOn,
        pause_group_id: row.groupId,
        is_active: true,
      },
      { onConflict: "id" }
    )
    if (error) {
      if (isMissingTable(error)) return { ok: true, skipped: true }
      console.error("upsertPause failed", error)
      return { ok: false }
    }
    return { ok: true }
  } catch (e) {
    console.error("upsertPause failed", e)
    return { ok: false }
  }
}

/**
 * End a pause on a given day — what Resume writes.
 *
 * `endsOn` is the LAST paused day, so resuming today passes YESTERDAY and today
 * is due again. This is an UPDATE rather than a delete: the pause happened, and
 * the days it covered must keep resolving as "nothing was due" rather than
 * turning back into missed days.
 */
export async function endPause(id: string, endsOn: string): Promise<Ok> {
  // ⚠️ THE READ-ONLY GATE, AT THE DATA LAYER.
  //
  // NOT at the wrapper. Every export of a `"use server"` module is a dispatchable
  // action with its own id, so gating `startBlockAction` while leaving
  // `startBlock` open is a lock on a door beside an open window. A cold review
  // drove exactly that: `startBlockAction` refused, `startBlock` wrote the row.
  //
  // See `lib/billing/gate.ts` for what is deliberately NOT gated.
  if (!(await canWriteData())) return { ok: false };
  try {
    const cx = await ctx()
    if (!cx) return { ok: false }
    const { error } = await cx.supabase
      .from("compound_pauses")
      .update({ ends_on: endsOn })
      .eq("id", id)
      .eq("user_id", cx.userId)
    if (error) {
      if (isMissingTable(error)) return { ok: true, skipped: true }
      console.error("endPause failed", error)
      return { ok: false }
    }
    return { ok: true }
  } catch (e) {
    console.error("endPause failed", e)
    return { ok: false }
  }
}

/**
 * Drop a pause outright — the undo path, for a pause created by mistake.
 *
 * Distinct from {@link endPause}, and the difference is meaning rather than
 * mechanism: ending a pause records that the break happened and is over;
 * deleting one records that it never should have existed, so its days go back to
 * being ordinary days and can read as missed again.
 */
export async function deletePause(id: string): Promise<Ok> {
  try {
    const cx = await ctx()
    if (!cx) return { ok: false }
    const { error } = await cx.supabase
      .from("compound_pauses")
      .delete()
      .eq("id", id)
      .eq("user_id", cx.userId)
    if (error) {
      if (isMissingTable(error)) return { ok: true, skipped: true }
      console.error("deletePause failed", error)
      return { ok: false }
    }
    return { ok: true }
  } catch (e) {
    console.error("deletePause failed", e)
    return { ok: false }
  }
}

/** End every pause sharing a group id — Resume, for a whole-stack pause. Only
 *  what THAT action paused: a member paused separately has no group id and is
 *  left running its own pause. */
export async function endPauseGroup(
  groupId: string,
  endsOn: string
): Promise<Ok> {
  // ⚠️ THE READ-ONLY GATE, AT THE DATA LAYER.
  //
  // NOT at the wrapper. Every export of a `"use server"` module is a dispatchable
  // action with its own id, so gating `startBlockAction` while leaving
  // `startBlock` open is a lock on a door beside an open window. A cold review
  // drove exactly that: `startBlockAction` refused, `startBlock` wrote the row.
  //
  // See `lib/billing/gate.ts` for what is deliberately NOT gated.
  if (!(await canWriteData())) return { ok: false };
  try {
    const cx = await ctx()
    if (!cx) return { ok: false }
    // ⚠️ TWO statements, and the split is load-bearing.
    //
    // `018` declares `CHECK (ends_on IS NULL OR ends_on >= started_on)`. A single
    // blanket UPDATE over the whole group violates it for any pause that has not
    // STARTED yet — and Postgres then rejects the ENTIRE statement, including
    // the rows that would have been fine. Resuming a holiday you had scheduled
    // for next week therefore cleared it locally, failed server-side, and the
    // next hydration paused the whole stack again.
    //
    // So: end the ones already under way, DELETE the ones that never began. That
    // mirrors what `resumeCompound` does per-pause, and a pause that never
    // started is not a break the user took.
    const { error } = await cx.supabase
      .from("compound_pauses")
      .update({ ends_on: endsOn })
      .eq("pause_group_id", groupId)
      .eq("user_id", cx.userId)
      .lte("started_on", endsOn)
    if (error) {
      if (isMissingTable(error)) return { ok: true, skipped: true }
      console.error("endPauseGroup failed", error)
      return { ok: false }
    }
    const { error: dropError } = await cx.supabase
      .from("compound_pauses")
      .delete()
      .eq("pause_group_id", groupId)
      .eq("user_id", cx.userId)
      .gt("started_on", endsOn)
    if (dropError) {
      console.error("endPauseGroup: dropping unstarted pauses failed", dropError)
      return { ok: false }
    }
    return { ok: true }
  } catch (e) {
    console.error("endPauseGroup failed", e)
    return { ok: false }
  }
}
