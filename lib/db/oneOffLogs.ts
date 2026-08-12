"use server"

/**
 * Data access for `one_off_logs` (`supabase/protocol/020`) — something taken
 * once, off-plan.
 *
 * RLS-scoped; identity from the verified session, never the service role.
 *
 * TOLERANT OF THE TABLE NOT EXISTING YET, exactly as the pauses and schedule
 * versions are: `020` is additive and pending, so until it is applied every call
 * is a no-op rather than an error and the device store carries the logs alone.
 */
import { createClient } from "@/lib/supabase/server"
import { canWriteData } from "@/lib/billing/gate"

export interface OneOffRow {
  /** Client-generated and RANDOM — see `lib/home/oneOffLogs.ts`. */
  id: string
  /** The CATALOGUE compound's name, when it is one. Resolved to an id
   *  server-side, because the client holds names and the table holds ids. */
  compoundName?: string | null
  label: string
  amount?: number | null
  unit?: string | null
  loggedFor: string
  takenAtIso: string
  note?: string | null
}

type Ok = { ok: boolean; skipped?: boolean }

/** PostgREST answers `PGRST205` from its schema cache before Postgres sees the
 *  request, so a genuinely absent table never surfaces `42P01`. */
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

/** Every one-off for the user, most recent day first. */
export async function listOneOffLogs(): Promise<OneOffRow[]> {
  try {
    const cx = await ctx()
    if (!cx) return []
    const { data, error } = await cx.supabase
      .from("one_off_logs")
      .select("id, label, amount, unit, logged_for, taken_at, note, compounds(name)")
      .eq("user_id", cx.userId)
      .order("logged_for", { ascending: false })
    if (error) {
      if (!isMissingTable(error)) console.error("listOneOffLogs failed", error)
      return []
    }
    return (data ?? []).map((row) => {
      const r = row as Record<string, unknown>
      const cmp = r.compounds as { name?: string } | null
      return {
        id: r.id as string,
        compoundName: cmp?.name ?? null,
        label: r.label as string,
        amount: r.amount == null ? null : Number(r.amount),
        unit: (r.unit as string | null) ?? null,
        loggedFor: r.logged_for as string,
        takenAtIso: r.taken_at as string,
        note: (r.note as string | null) ?? null,
      }
    })
  } catch (e) {
    console.error("listOneOffLogs failed", e)
    return []
  }
}

/**
 * Write one. Idempotent on the client's own random id, so a replay overwrites in
 * place rather than inserting a second entry — which is the whole reason that id
 * is held from the moment of writing rather than generated per attempt.
 */
export async function upsertOneOffLog(row: OneOffRow): Promise<Ok> {
  // ⚠️ THE READ-ONLY GATE, ENFORCED. The client guard is UX; this is the rule.
  // A server action is a public HTTP endpoint. See `lib/billing/gate.ts`.
  if (!(await canWriteData())) return { ok: false }
  try {
    const cx = await ctx()
    if (!cx) return { ok: false }
    // The catalogue id, resolved from the name the client holds. NULL for a
    // user's own compound, which has no catalogue row — `label` still names it.
    let compoundId: string | null = null
    if (row.compoundName) {
      const { data } = await cx.supabase
        .from("compounds")
        .select("id")
        .eq("name", row.compoundName)
        .limit(1)
        .maybeSingle()
      compoundId = (data?.id as string | undefined) ?? null
    }
    const { error } = await cx.supabase.from("one_off_logs").upsert(
      {
        id: row.id,
        user_id: cx.userId,
        compound_id: compoundId,
        label: row.label.slice(0, 80),
        amount: row.amount ?? null,
        unit: row.unit ?? null,
        // The DEVICE's day. Never `current_date`: the server cannot know which
        // calendar day the user was standing in.
        logged_for: row.loggedFor,
        taken_at: row.takenAtIso,
        note: row.note ?? null,
      },
      { onConflict: "id" }
    )
    if (error) {
      if (isMissingTable(error)) return { ok: true, skipped: true }
      console.error("upsertOneOffLog failed", error)
      return { ok: false }
    }
    return { ok: true }
  } catch (e) {
    console.error("upsertOneOffLog failed", e)
    return { ok: false }
  }
}

/**
 * Delete one. A hard delete, unlike everything else in this app — a one-off
 * carries no history that anything else depends on, and it WILL be mis-typed
 * constantly, so the honest verb is the one the user means.
 */
export async function deleteOneOffLog(id: string): Promise<Ok> {
  try {
    const cx = await ctx()
    if (!cx) return { ok: false }
    // `count: "exact"` is load-bearing, exactly as it is in `deleteDoseLog`.
    // PostgREST calls a delete that matched NOTHING a success, and the caller
    // clears its tombstone on success — so a delete that raced ahead of its own
    // in-flight insert reported ok, the tombstone went, the insert then landed,
    // and the next hydration resurrected the entry the user had just removed.
    const { error, count } = await cx.supabase
      .from("one_off_logs")
      .delete({ count: "exact" })
      .eq("id", id)
      .eq("user_id", cx.userId)
    if (error) {
      if (isMissingTable(error)) return { ok: true, skipped: true }
      console.error("deleteOneOffLog failed", error)
      return { ok: false }
    }
    // Matched nothing: not a failure (the row may legitimately never have
    // reached Postgres), but not a confirmed delete either — so the tombstone
    // stays, which is the right outcome in every one of those cases.
    if ((count ?? 0) === 0) return { ok: true, skipped: true }
    return { ok: true }
  } catch (e) {
    console.error("deleteOneOffLog failed", e)
    return { ok: false }
  }
}
