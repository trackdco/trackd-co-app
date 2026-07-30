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
  if (input.endsOn && input.endsOn < input.startedOn) {
    return { ok: false, error: "The end date is before the start date." }
  }

  const today = new Date().toISOString().slice(0, 10)
  const { error: closeError } = await ctx.supabase
    .from("blocks")
    .update({ status: "completed", closed_on: today })
    .eq("user_id", ctx.userId)
    .eq("status", "active")
  if (closeError) {
    console.error("startBlock could not close the live block", closeError)
    return { ok: false, error: "Could not close your current block." }
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
  opts: { reflection?: string; abandoned?: boolean } = {},
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await sessionCtx()
  if (!ctx) return { ok: false, error: "Not signed in." }
  const { error } = await ctx.supabase
    .from("blocks")
    .update({
      status: opts.abandoned ? "abandoned" : "completed",
      closed_on: new Date().toISOString().slice(0, 10),
      reflection: opts.reflection?.trim() || null,
    })
    .eq("id", blockId)
    .eq("user_id", ctx.userId)
  if (error) {
    console.error("closeBlock failed", error)
    return { ok: false, error: "Could not close the block." }
  }
  return { ok: true }
}

/** Rewrite a finished block's reflection. */
export async function saveReflection(
  blockId: string,
  reflection: string,
): Promise<{ ok: boolean }> {
  const ctx = await sessionCtx()
  if (!ctx) return { ok: false }
  const { error } = await ctx.supabase
    .from("blocks")
    .update({ reflection: reflection.trim() || null })
    .eq("id", blockId)
    .eq("user_id", ctx.userId)
  if (error) {
    console.error("saveReflection failed", error)
    return { ok: false }
  }
  return { ok: true }
}
