"use server"

/**
 * Cloud backup for the three interim device-local stores — the protocol stack
 * (`lib/home/stack.ts`), the dose log (`lib/home/doseLog.ts`), and the
 * "Make your own" custom compounds (`components/navigation/add-to-stack-menu.tsx`).
 * localStorage stays the instant, offline-capable cache the UI reads; these
 * server actions mirror every change up to the user's Supabase account (tables in
 * `supabase/home/001_device_state_sync.sql`) so the protocol survives a PWA
 * delete/reinstall, which wipes the installed app's localStorage.
 *
 * House pattern (mirrors `app/(app)/weight/actions.ts`): identity is ALWAYS
 * derived from the verified session (`auth.getUser()`) and never trusted from the
 * client; RLS is the backstop. Every action is BEST-EFFORT — it returns
 * `{ ok }` and never throws, because the synchronous localStorage write has
 * already succeeded. The cloud is a durable backup, not the read path, so a
 * network blip must never break logging.
 *
 * Each row stores the verbatim client object in a `jsonb` `data` payload (zero
 * client↔DB translation; the stores' own read-normalisers harden the shape on the
 * way back into localStorage). `compound_id` is the client-generated id.
 */
import { createClient } from "@/lib/supabase/server"
import { guard } from "@/lib/resilience/circuitBreaker"
import type { StackCompound } from "@/lib/home/stack"
import type { DayLogs } from "@/lib/home/doseLog"
import type { DoseLog } from "@/lib/home/mockHomeData"

type Ok = { ok: boolean }

/** The verified session + its user id, or null when signed out. Not exported, so
 *  it is exempt from the "use server" serialisation rules and may return a client. */
async function sessionCtx() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  return { supabase, userId: user.id }
}

/* ------------------------------------------------------------------- stack */

export async function pushStackCompound(compound: StackCompound): Promise<Ok> {
  try {
    const ctx = await sessionCtx()
    if (!ctx) return { ok: false }
    const { error } = await ctx.supabase.from("user_stack_compounds").upsert(
      { profile_id: ctx.userId, compound_id: compound.id, data: compound },
      { onConflict: "profile_id,compound_id" },
    )
    return { ok: !error }
  } catch (e) {
    console.error("pushStackCompound failed", e)
    return { ok: false }
  }
}

export async function deleteStackCompound(compoundId: string): Promise<Ok> {
  try {
    const ctx = await sessionCtx()
    if (!ctx) return { ok: false }
    const { error } = await ctx.supabase
      .from("user_stack_compounds")
      .delete()
      .eq("profile_id", ctx.userId)
      .eq("compound_id", compoundId)
    return { ok: !error }
  } catch (e) {
    console.error("deleteStackCompound failed", e)
    return { ok: false }
  }
}

/* --------------------------------------------------------------- dose logs */

export async function pushDoseLog(
  loggedOn: string,
  compoundId: string,
  log: DoseLog,
): Promise<Ok> {
  try {
    const ctx = await sessionCtx()
    if (!ctx) return { ok: false }
    const { error } = await ctx.supabase.from("user_dose_logs").upsert(
      { profile_id: ctx.userId, logged_on: loggedOn, compound_id: compoundId, data: log },
      { onConflict: "profile_id,logged_on,compound_id" },
    )
    return { ok: !error }
  } catch (e) {
    console.error("pushDoseLog failed", e)
    return { ok: false }
  }
}

export async function deleteDoseLog(
  loggedOn: string,
  compoundId: string,
): Promise<Ok> {
  try {
    const ctx = await sessionCtx()
    if (!ctx) return { ok: false }
    const { error } = await ctx.supabase
      .from("user_dose_logs")
      .delete()
      .eq("profile_id", ctx.userId)
      .eq("logged_on", loggedOn)
      .eq("compound_id", compoundId)
    return { ok: !error }
  } catch (e) {
    console.error("deleteDoseLog failed", e)
    return { ok: false }
  }
}

/** Erase every logged dose for a compound across all days (the hard-delete path). */
export async function deleteCompoundLogs(compoundId: string): Promise<Ok> {
  try {
    const ctx = await sessionCtx()
    if (!ctx) return { ok: false }
    const { error } = await ctx.supabase
      .from("user_dose_logs")
      .delete()
      .eq("profile_id", ctx.userId)
      .eq("compound_id", compoundId)
    return { ok: !error }
  } catch (e) {
    console.error("deleteCompoundLogs failed", e)
    return { ok: false }
  }
}

/* --------------------------------------------------------- custom compounds */

export async function pushCustom(custom: { id: string }): Promise<Ok> {
  try {
    const ctx = await sessionCtx()
    if (!ctx) return { ok: false }
    const { error } = await ctx.supabase.from("user_custom_compounds").upsert(
      { profile_id: ctx.userId, compound_id: custom.id, data: custom },
      { onConflict: "profile_id,compound_id" },
    )
    return { ok: !error }
  } catch (e) {
    console.error("pushCustom failed", e)
    return { ok: false }
  }
}

export async function deleteCustom(compoundId: string): Promise<Ok> {
  try {
    const ctx = await sessionCtx()
    if (!ctx) return { ok: false }
    const { error } = await ctx.supabase
      .from("user_custom_compounds")
      .delete()
      .eq("profile_id", ctx.userId)
      .eq("compound_id", compoundId)
    return { ok: !error }
  } catch (e) {
    console.error("deleteCustom failed", e)
    return { ok: false }
  }
}

/* ----------------------------------------------------------------- pulls */

/** The user's cloud-saved stack + dose logs, for hydrating localStorage on load.
 *  Returns empty shapes (never throws) when signed out or on any read error. */
export async function pullStackAndLogs(): Promise<{
  stack: StackCompound[]
  doseLogs: DayLogs
}> {
  const empty = { stack: [], doseLogs: {} as DayLogs }
  // Guarded: a hung Supabase fast-fails to `empty` rather than blocking hydration.
  // An empty pull is safe — the hydrator merges (never wipes) the local cache.
  return guard(
    "supabase:pullStackAndLogs",
    async () => {
      const ctx = await sessionCtx()
      if (!ctx) return empty
      const [stackRes, logRes] = await Promise.all([
        ctx.supabase
          .from("user_stack_compounds")
          .select("data")
          .eq("profile_id", ctx.userId),
        ctx.supabase
          .from("user_dose_logs")
          .select("logged_on, compound_id, data")
          .eq("profile_id", ctx.userId),
      ])

      const stack = (stackRes.data ?? [])
        .map((r) => r.data as StackCompound)
        .filter((c): c is StackCompound => !!c && typeof c.id === "string")

      const doseLogs: DayLogs = {}
      for (const r of logRes.data ?? []) {
        const day = r.logged_on as string
        const compoundId = r.compound_id as string
        ;(doseLogs[day] ??= {})[compoundId] = r.data as DoseLog
      }

      return { stack, doseLogs }
    },
    { fallback: empty }
  )
}

/** The user's cloud-saved custom compounds (raw `data` payloads; the caller
 *  re-normalises). Empty array (never throws) when signed out or on error. */
export async function pullCustoms(): Promise<unknown[]> {
  return guard(
    "supabase:pullCustoms",
    async () => {
      const ctx = await sessionCtx()
      if (!ctx) return [] as unknown[]
      const { data } = await ctx.supabase
        .from("user_custom_compounds")
        .select("data")
        .eq("profile_id", ctx.userId)
      return (data ?? []).map((r) => r.data)
    },
    { fallback: [] as unknown[] }
  )
}
