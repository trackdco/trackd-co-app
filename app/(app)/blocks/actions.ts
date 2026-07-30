"use server"

/**
 * Server actions for Blocks. Thin wrappers over `lib/db/blocks.ts` whose only
 * job is to revalidate the two routes a block is visible on once the write has
 * landed.
 *
 * The data layer is where identity, validation and RLS live (identity always
 * from the verified session, never from the client), so nothing here re-checks
 * ownership — it would be a second, driftable copy of a rule the database
 * already enforces. What is here is what the data layer cannot know: which
 * rendered pages are now stale.
 *
 * `/progress` is revalidated alongside `/blocks` because the banner at the top
 * of Progress reads the live block, and a block started, extended or closed here
 * would otherwise leave that banner showing the previous state until something
 * else happened to refresh it.
 */

import { revalidatePath } from "next/cache"

import {
  closeBlock,
  extendBlock,
  saveReflection,
  startBlock,
  type StartBlockInput,
} from "@/lib/db/blocks"

function revalidate() {
  revalidatePath("/blocks")
  revalidatePath("/progress")
}

export async function startBlockAction(
  input: StartBlockInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await startBlock(input)
  if (!res.ok) return res
  revalidate()
  return { ok: true }
}

export async function extendBlockAction(
  blockId: string,
  endsOn: string,
): Promise<{ ok: boolean; error?: string }> {
  const res = await extendBlock(blockId, endsOn)
  if (res.ok) revalidate()
  return res
}

export async function closeBlockAction(
  blockId: string,
  opts: { reflection?: string; abandoned?: boolean } = {},
): Promise<{ ok: boolean; error?: string }> {
  const res = await closeBlock(blockId, opts)
  if (res.ok) revalidate()
  return res
}

export async function saveReflectionAction(
  blockId: string,
  reflection: string,
): Promise<{ ok: boolean }> {
  const res = await saveReflection(blockId, reflection)
  if (res.ok) revalidate()
  return res
}
