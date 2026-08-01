"use server"

/**
 * Stacks ⇄ Postgres (Spec 05). The device store is the synchronous, offline read
 * path; `stacks` + `stack_members` (`supabase/protocol/007`) are the durable
 * source that survives a PWA reinstall.
 *
 * Identity always from the verified session, RLS the backstop, never the service
 * role (house pattern). Best-effort and never throws: the local write has
 * already succeeded by the time these run.
 *
 * Membership is written as `protocol_compounds.id`, which is NOT always the
 * client's `StackCompound.id` — the two legitimately diverge (see
 * `findProtocolCompoundId` in `protocolSync.ts`). Resolution goes through the
 * same lookup, so a stack can't end up pointing at a row that doesn't exist.
 */
import { createClient } from "@/lib/supabase/server"
import { resolveProtocolCompoundIds } from "@/lib/home/protocolSync"
import type { Stack, StackMembership } from "@/lib/home/stacks"

type Ok = { ok: boolean; skipped?: boolean }

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function ctx() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  return { supabase, userId: user.id }
}

/** The 007 tables may not exist yet in an environment that hasn't migrated. */
function isMissingTable(error: { code?: string } | null): boolean {
  return error?.code === "42P01" || error?.code === "PGRST205"
}

/**
 * "That column doesn't exist" — the 013 dating columns before the migration runs.
 * `PGRST204` is what a WRITE gets (PostgREST rejects the payload against its
 * schema cache first); `42703` is what a READ gets from Postgres itself.
 *
 * The house helper, copied from `protocolSync.ts` where the same lesson was
 * learned for the 006 cycle columns. Without it this whole file hard-fails on a
 * database that has `stacks` but not yet 013: every pull returns nothing (so
 * stacks stop surviving a reinstall) and every push reports a sync failure.
 * Migrations are applied by hand here, so the un-migrated state is a real state
 * the deployed code has to sit in, not a hypothetical.
 */
function isUndefinedColumn(error: { code?: string } | null): boolean {
  return error?.code === "42703" || error?.code === "PGRST204"
}

/**
 * Replace the user's stacks with `stacks`. A full replace rather than a diff:
 * the list is tiny, and a replace is idempotent, so a re-run after an offline
 * gap converges instead of accumulating.
 */
export async function pushStacks(
  stacks: Stack[],
  /** Client compound id → its NAME. Needed because a client id can diverge from
   *  its `protocol_compounds` row id, and NAME is the only key that still
   *  resolves it (see `resolveProtocolCompoundIds`). Absent names fall back to
   *  id-only resolution, which is correct in the common case. */
  names: Record<string, string> = {}
): Promise<Ok> {
  try {
    const cx = await ctx()
    if (!cx) return { ok: false }

    // Resolve every client compound id to its protocol_compounds row up front.
    // PAST members count: a closed span is what keeps a historical day reading
    // the way it was lived, so it has to reach Postgres like any other row.
    const clientIds = [
      ...new Set(stacks.flatMap((s) => s.members.map((m) => m.compoundId))),
    ]
    const idMap = await resolveProtocolCompoundIds(
      clientIds.map((id) => ({ id, name: names[id] ?? null }))
    )

    // BUILD THE REPLACEMENT BEFORE DESTROYING ANYTHING.
    //
    // The membership rows used to be computed AFTER the delete-all below, which
    // made a transient failure catastrophic: `resolveProtocolCompoundIds` returns
    // an empty map on any error it catches, so one blip on that lookup left every
    // member unresolved, produced zero rows, and returned early — after the wipe.
    // Pre-013 that was survivable (the wiped rows were present-tense membership,
    // rebuildable from any device on the next edit); now they include every CLOSED
    // span, which is the only durable record of what past days looked like.
    //
    // Two client ids can resolve to the SAME protocol_compounds row (an offline
    // add of a name Postgres already has, before hydration de-dupes). Inserting
    // two OPEN spans for it violates `stack_members_one_current_stack_per_compound`,
    // so collapse them here. First occurrence wins, matching `dedupeMembership` on
    // the read side.
    //
    // Only OPEN spans compete for that slot (013 scoped the index to the present).
    // A closed span is history and several may legitimately exist for the same
    // compound — a compound that moved from one stack to another has one in each —
    // so those are de-duplicated on the span itself, which only collapses rows
    // that are genuinely identical.
    const claimedOpen = new Set<string>()
    const seenClosed = new Set<string>()
    const rows = stacks.flatMap((s) =>
      s.members
        .map((m: StackMembership) => {
          // `Object.hasOwn`, not `idMap[clientId]`: a member id of "__proto__"
          // reads Object.prototype off an EMPTY map, which is truthy, so it was
          // counted as resolved and sent as `protocol_compound_id: {}` — and the
          // membership delete had already run, so that one bad id wiped every
          // stack's membership in Postgres and then failed the insert.
          const pcId = Object.hasOwn(idMap, m.compoundId)
            ? idMap[m.compoundId]
            : undefined
          // A member with no Postgres row yet (an unmigrated custom) is skipped
          // rather than faked — the device store still holds the membership.
          if (!pcId) return null
          // A span that ends on or before it starts fails
          // `stack_members_span_valid` (23514), and the membership delete has
          // already run by the time the insert reports it — so one bad local row
          // would empty the mirror and do it again on every push. Every mutator
          // upstream prunes these, and `isDateKey` now rejects an impossible-but-
          // well-shaped date; this is the last gate before the wire, next to the
          // `UUID_RE` check that guards stack ids for the same reason.
          if (m.to !== undefined && m.to <= m.from) return null
          if (m.to === undefined) {
            if (claimedOpen.has(pcId)) return null
            claimedOpen.add(pcId)
          } else {
            const key = `${s.id}|${pcId}|${m.from}|${m.to}`
            if (seenClosed.has(key)) return null
            seenClosed.add(key)
          }
          return {
            stack_id: s.id,
            protocol_compound_id: pcId,
            user_id: cx.userId,
            position: m.position,
            effective_from: m.from,
            effective_to: m.to ?? null,
          }
        })
        .filter((r): r is NonNullable<typeof r> => r !== null)
    )

    // The honest success signal is "did every CURRENT member resolve". A past
    // member that no longer resolves cannot be fixed by retrying — the compound it
    // named is gone — so counting it would pin the mirror to `ok: false` forever
    // and show the user a sync-failed notice after every single stack edit.
    const currentIds = new Set(
      stacks.flatMap((s) =>
        s.members.filter((m) => m.to === undefined).map((m) => m.compoundId)
      )
    )
    const unresolved = [...currentIds].filter((id) => !Object.hasOwn(idMap, id)).length

    // Nothing to put back, but something to take away ⇒ abort untouched. This is
    // the guard that makes the ordering above matter.
    const hasMembers = stacks.some((s) => s.members.length > 0)
    if (hasMembers && rows.length === 0) {
      console.error("pushStacks aborted: no member resolved, refusing to clear")
      return { ok: false }
    }

    // Drop stacks the device no longer has. With an EMPTY list this must be a
    // plain delete-all, not `NOT IN ('')` — Postgres cannot cast '' to uuid, so
    // the filtered form errors (22P02) and deleting your last stack would fail
    // server-side while reporting success.
    // Only uuid-shaped ids reach the filter string. A legacy `s_…` id, or one
    // carrying a comma or quote, would otherwise break the PostgREST parse and
    // permanently fail the mirror.
    const keep = stacks.map((s) => s.id).filter((id) => UUID_RE.test(id))
    const del = cx.supabase.from("stacks").delete().eq("user_id", cx.userId)
    const { error: delErr } = await (keep.length > 0
      ? del.not("id", "in", `(${keep.join(",")})`)
      : del)
    if (delErr) {
      if (isMissingTable(delErr)) return { ok: true, skipped: true }
      // Any other failure is real: the mirror is now wrong, so say so rather
      // than carrying on and reporting success.
      console.error("pushStacks failed", delErr)
      return { ok: false }
    }

    if (stacks.length === 0) return { ok: true }

    // `effective_from` is OMITTED for a stack whose start date is a guess (the
    // v1→v2 migration's "today"). PostgREST's upsert only writes the columns the
    // payload carries, so leaving it out preserves whatever the server already
    // holds — which for those stacks is the true `created_at`-derived date, the
    // thing the guess exists to be corrected by. Sending it would destroy the
    // only accurate copy and make the correction in `hydrateStacks` a no-op.
    const dated = stacks.filter((s) => !s.provisionalStart)
    const guessed = stacks.filter((s) => s.provisionalStart)
    const base = (s: Stack) => ({
      id: s.id,
      user_id: cx.userId,
      name: s.name,
      colour: s.colour,
    })
    for (const [batch, withDate] of [
      [dated, true],
      [guessed, false],
    ] as const) {
      if (batch.length === 0) continue
      const payload = batch.map((s) =>
        // The day the grouping began (supabase/protocol/013). Sent from the
        // device because only the device knows the user's local day; the column
        // defaults to the DATABASE's current date, which is a different day for
        // anyone far enough from UTC.
        withDate ? { ...base(s), effective_from: s.effectiveFrom } : base(s)
      )
      let { error: upErr } = await cx.supabase
        .from("stacks")
        .upsert(payload, { onConflict: "id" })
      // A database that has `stacks` but not 013 rejects the whole payload for
      // one unknown column. Retry without it: the stack itself still mirrors, and
      // the dating simply waits for the migration.
      if (upErr && withDate && isUndefinedColumn(upErr)) {
        ;({ error: upErr } = await cx.supabase
          .from("stacks")
          .upsert(batch.map(base), { onConflict: "id" }))
      }
      if (upErr) {
        if (isMissingTable(upErr)) return { ok: true, skipped: true }
        console.error("pushStacks failed", upErr)
        return { ok: false }
      }
    }

    // Membership: clear this user's rows then re-insert, so a removal is a
    // removal. Scoped by user_id, and RLS is the backstop.
    const { error: clearErr } = await cx.supabase
      .from("stack_members")
      .delete()
      .eq("user_id", cx.userId)
    if (clearErr && !isMissingTable(clearErr)) {
      console.error("pushStacks failed", clearErr)
      return { ok: false }
    }

    if (rows.length === 0) return { ok: unresolved === 0 }

    let { error: memErr } = await cx.supabase.from("stack_members").insert(rows)
    // Pre-013 tolerance, and it must send ONLY THE OPEN SPANS.
    //
    // Before 013 the table's contract is present-tense membership: 007's PK is
    // (stack_id, protocol_compound_id) and 008's unique index is
    // (user_id, protocol_compound_id) with no partial predicate. Two spans for one
    // compound — which is what any move between stacks, or any remove-then-re-add,
    // produces — collapse onto one key and the insert dies 23505. The membership
    // delete has already run by then, so that would leave the mirror EMPTY and
    // repeat identically on every subsequent push until the migration is applied.
    //
    // Dropping the closed spans is the honest translation: the old schema has
    // nowhere to say "this membership ended", and the device store keeps the full
    // history regardless. The alternative — sending them stripped of their dates —
    // writes them back as CURRENT members, and the next pull then resurrects every
    // compound the user ever removed from a stack.
    if (memErr && isUndefinedColumn(memErr)) {
      const undated = rows
        .filter((r) => r.effective_to === null)
        .map(({ effective_from, effective_to, ...rest }) => {
          void effective_from
          void effective_to
          return rest
        })
      ;({ error: memErr } =
        undated.length > 0
          ? await cx.supabase.from("stack_members").insert(undated)
          : { error: null })
    }
    if (memErr) {
      if (isMissingTable(memErr)) return { ok: true, skipped: true }
      console.error("pushStacks failed", memErr)
      return { ok: false }
    }
    return { ok: unresolved === 0 }
  } catch (e) {
    console.error("pushStacks failed", e)
    return { ok: false }
  }
}

/**
 * The user's stacks from Postgres, keyed back to CLIENT compound ids. Returns an
 * empty array when signed out, offline, or unmigrated — a failed pull must never
 * wipe the local cache, so callers treat empty as "no news".
 */
export async function pullStacks(): Promise<Stack[]> {
  try {
    const cx = await ctx()
    if (!cx) return []
    const DATED_SELECT =
      "id, name, colour, effective_from, created_at, " +
      "stack_members(protocol_compound_id, position, effective_from, effective_to)"
    // What a database without 013 can answer. `created_at` is in both, and is
    // what the fallbacks below derive an undated stack's start from.
    const UNDATED_SELECT =
      "id, name, colour, created_at, stack_members(protocol_compound_id, position)"

    let { data, error } = await cx.supabase
      .from("stacks")
      .select(DATED_SELECT)
      .eq("user_id", cx.userId)
      .order("created_at", { ascending: true })
    // Asking for a column Postgres doesn't have fails the WHOLE select, so
    // without this retry a pre-013 database returns nothing and every user's
    // stacks silently stop surviving a reinstall.
    if (error && isUndefinedColumn(error)) {
      const undated = await cx.supabase
        .from("stacks")
        .select(UNDATED_SELECT)
        .eq("user_id", cx.userId)
        .order("created_at", { ascending: true })
      // The two selects infer different row shapes, so the retry is re-typed
      // through the same `Row` widening the mapper below already applies.
      data = undated.data as unknown as typeof data
      error = undated.error
    }
    if (error) {
      if (!isMissingTable(error)) console.error("pullStacks failed", error)
      return []
    }

    type Row = {
      id: string
      name: string
      colour: string
      /** Absent entirely on a pre-013 database (the undated select). */
      effective_from?: string | null
      created_at: string
      stack_members:
        | {
            protocol_compound_id: string
            position: number
            effective_from?: string | null
            effective_to?: string | null
          }[]
        | null
    }
    // Whether the rows carry real dates or invented ones. On the undated retry
    // every `from` below is derived from `created_at` and every span reads as
    // open, because the old schema cannot express an ended membership — so the
    // result is marked provisional and `hydrateStacks` keeps the device's own
    // dating in preference to it.
    const undatedPull = !Object.hasOwn((data ?? [{}])[0] ?? {}, "effective_from")

    return ((data ?? []) as unknown as Row[]).map((r) => {
      // A database that has `stacks` but not yet 013 answers the undated select
      // above, so there is no `effective_from`. Fall back to the creation DAY
      // rather than to "no gate at all": an ungated stack is the
      // retroactive-grouping bug, whereas a creation-day gate is the same answer
      // 013's own backfill computes.
      const effectiveFrom = r.effective_from ?? r.created_at.slice(0, 10)
      return {
        id: r.id,
        name: r.name,
        colour: r.colour as Stack["colour"],
        effectiveFrom,
        ...(undatedPull ? { provisionalStart: true as const } : {}),
        members: (r.stack_members ?? [])
          .slice()
          .sort((a, b) => a.position - b.position)
          .map((m, i) => ({
            compoundId: m.protocol_compound_id,
            from: m.effective_from ?? effectiveFrom,
            ...(m.effective_to ? { to: m.effective_to } : {}),
            position: typeof m.position === "number" ? m.position : i,
          })),
      }
    })
  } catch (e) {
    console.error("pullStacks failed", e)
    return []
  }
}
