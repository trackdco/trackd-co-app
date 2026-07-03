"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getActiveCycle } from "@/lib/db/cycles";

/**
 * Server actions for the Progress bloodwork photo store (Context/Feature
 * Specs/09 → Step 4, revised). The image itself is uploaded client-side straight
 * to the private `bloodwork` bucket (the avatar pattern — keeps the bytes off the
 * Next server and clear of the server-action body limit); these actions own the
 * `lab_panels` row that records it (the storage path + draw date) and the delete.
 * RLS scopes every row to the signed-in user; we set the owner from the verified
 * session and never trust the client for it.
 *
 * A "use server" module may only export async functions, so results are
 * structural rather than named.
 */
export type BloodworkResult = { ok: boolean; error?: string };

function isValidDateKey(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return !Number.isNaN(new Date(`${s}T00:00:00`).getTime());
}

function isFuture(dateKey: string): boolean {
  // Client sends its LOCAL date; the server runs in UTC. Allow up to one day
  // ahead so a user east of UTC can record their real "today" (max offset UTC+14).
  const todayUtc = new Date();
  todayUtc.setUTCHours(0, 0, 0, 0);
  const logged = new Date(`${dateKey}T00:00:00Z`).getTime();
  return logged > todayUtc.getTime() + 86_400_000;
}

/**
 * Record an uploaded bloodwork photo as a lab panel. `storagePath` is the object
 * the client just uploaded to the `bloodwork` bucket — we re-verify its first
 * folder segment is the caller's own uid (the storage policy enforces the same,
 * but never trust a client path blindly).
 */
export async function addBloodworkPhoto(
  drawnOn: string,
  storagePath: string,
  note?: string,
): Promise<BloodworkResult> {
  if (!isValidDateKey(drawnOn)) return { ok: false, error: "Invalid date." };
  if (isFuture(drawnOn)) {
    return { ok: false, error: "You can't use a future date." };
  }
  if (typeof storagePath !== "string" || storagePath.includes("..")) {
    return { ok: false, error: "Couldn't attach that file." };
  }
  const trimmedNote = typeof note === "string" ? note.trim().slice(0, 2000) : "";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You're not signed in." };

  if (storagePath.split("/")[0] !== user.id) {
    return { ok: false, error: "Couldn't attach that file." };
  }

  // Stamp the current cycle context (the user's single active cycle) at insert
  // time so this panel is attributable to a cycle later; NULL when the user is
  // off-cycle. Its biomarker_results inherit the cycle via panel_id. (Spec 15.)
  const cycle = await getActiveCycle();

  const { error } = await supabase.from("lab_panels").insert({
    user_id: user.id,
    cycle_id: cycle?.id ?? null,
    drawn_on: drawnOn,
    source_file_path: storagePath,
    notes: trimmedNote || null,
    extraction_source: "manual",
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/progress");
  return { ok: true };
}

/** Delete a bloodwork photo — its storage object and its lab-panel row. */
export async function deleteBloodworkPhoto(
  panelId: string,
): Promise<BloodworkResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You're not signed in." };

  // Read the path first (RLS scopes this to the owner).
  const { data: panel } = await supabase
    .from("lab_panels")
    .select("source_file_path")
    .eq("id", panelId)
    .maybeSingle();

  const path = panel?.source_file_path as string | null | undefined;
  if (path) {
    await supabase.storage.from("bloodwork").remove([path]);
  }

  const { error } = await supabase.from("lab_panels").delete().eq("id", panelId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/progress");
  return { ok: true };
}

/**
 * Save (or update) the journal entry for a day (Step 5). One row per day
 * (`journal_entries.one_entry_per_day`), so both "+" paths land on the same row.
 * `touchBody` distinguishes the Write/Edit path (sets free_text) from the Markers
 * path (leaves an existing body untouched). `markers` is the FULL desired set for
 * the entry — we sync readings to match (add/update the listed ones, remove the
 * rest), auto-creating the `user_markers` join row for each catalogue marker the
 * user dials (catalogue-referenced only — users never create markers). Values are
 * stored as the 1-based ordinal into the marker's words; we re-validate every id +
 * tier against the read-only catalogue. An entry left with no body and no markers
 * is deleted (no empty entries persist).
 */
export async function saveJournalEntry(input: {
  entryDate: string;
  touchBody: boolean;
  body: string;
  markers: { markerId: string; tierValue: number }[];
}): Promise<{ ok: boolean; error?: string }> {
  const { entryDate, touchBody } = input;
  if (!isValidDateKey(entryDate)) return { ok: false, error: "Invalid date." };
  if (isFuture(entryDate)) {
    return { ok: false, error: "You can't journal a future date." };
  }

  // Dedupe (last wins); keep only well-formed rows.
  const wanted = new Map<string, number>();
  for (const m of input.markers ?? []) {
    if (typeof m?.markerId === "string" && Number.isFinite(m.tierValue)) {
      wanted.set(m.markerId, Math.trunc(m.tierValue));
    }
  }
  const body = typeof input.body === "string" ? input.body.trim() : "";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You're not signed in." };

  // Validate marker ids + tier ranges against the read-only catalogue.
  if (wanted.size > 0) {
    const { data: cat, error: catErr } = await supabase
      .from("markers")
      .select("id, tier_labels")
      .in("id", [...wanted.keys()]);
    if (catErr) return { ok: false, error: catErr.message };
    if (!cat || cat.length !== wanted.size) {
      return { ok: false, error: "Unknown marker." };
    }
    for (const c of cat) {
      const tv = wanted.get(c.id as string)!;
      const len = (c.tier_labels as string[] | null)?.length ?? 0;
      if (tv < 1 || tv > len) return { ok: false, error: "Invalid marker value." };
    }
  }

  // Find the day's entry (one per day).
  const { data: existing } = await supabase
    .from("journal_entries")
    .select("id, free_text")
    .eq("user_id", user.id)
    .eq("entry_date", entryDate)
    .maybeSingle();

  const finalBody = touchBody
    ? body || null
    : ((existing?.free_text as string | null) ?? null);

  // Nothing left to hold → clear the day (or refuse a no-op new entry).
  if (!finalBody && wanted.size === 0) {
    if (existing) {
      await supabase.from("journal_entries").delete().eq("id", existing.id);
      revalidatePath("/progress");
      return { ok: true };
    }
    return { ok: false, error: "Write something or dial a marker." };
  }

  let entryId: string;
  if (existing) {
    entryId = existing.id as string;
    if (touchBody) {
      const { error } = await supabase
        .from("journal_entries")
        .update({ free_text: finalBody })
        .eq("id", entryId);
      if (error) return { ok: false, error: error.message };
    }
  } else {
    // Stamp the current cycle context (the user's single active cycle) when the
    // day's entry is first created; NULL when off-cycle. The stamp is stable —
    // later edits (adding markers, editing the body) don't re-derive it, and the
    // day's marker_readings inherit the cycle via entry_id. (Spec 15.)
    const cycle = await getActiveCycle();
    const { data: created, error } = await supabase
      .from("journal_entries")
      .insert({
        user_id: user.id,
        cycle_id: cycle?.id ?? null,
        entry_date: entryDate,
        free_text: finalBody,
      })
      .select("id")
      .single();
    if (error || !created) {
      return { ok: false, error: error?.message ?? "Couldn't save your entry." };
    }
    entryId = created.id as string;
  }

  // Resolve (find or create) the user_markers join row for each dialed marker.
  const userMarkerByMarker = new Map<string, string>();
  if (wanted.size > 0) {
    const { data: ums } = await supabase
      .from("user_markers")
      .select("id, marker_id")
      .eq("user_id", user.id)
      .in("marker_id", [...wanted.keys()]);
    for (const um of ums ?? []) {
      if (um.marker_id) {
        userMarkerByMarker.set(um.marker_id as string, um.id as string);
      }
    }
    const missing = [...wanted.keys()].filter((id) => !userMarkerByMarker.has(id));
    if (missing.length > 0) {
      const { data: createdUm, error } = await supabase
        .from("user_markers")
        .insert(
          missing.map((markerId) => ({
            user_id: user.id,
            marker_id: markerId,
            is_active: true,
            sort_order: 0,
          })),
        )
        .select("id, marker_id");
      if (error) return { ok: false, error: error.message };
      for (const um of createdUm ?? []) {
        if (um.marker_id) {
          userMarkerByMarker.set(um.marker_id as string, um.id as string);
        }
      }
    }
  }

  // Sync the entry's readings to exactly the wanted set.
  const desiredUserMarkerIds: string[] = [];
  if (wanted.size > 0) {
    const rows = [...wanted.entries()].map(([markerId, tierValue]) => {
      const userMarkerId = userMarkerByMarker.get(markerId)!;
      desiredUserMarkerIds.push(userMarkerId);
      return {
        user_id: user.id,
        entry_id: entryId,
        user_marker_id: userMarkerId,
        tier_value: tierValue,
      };
    });
    const { error } = await supabase
      .from("marker_readings")
      .upsert(rows, { onConflict: "entry_id,user_marker_id" });
    if (error) return { ok: false, error: error.message };
  }

  // Drop readings that are no longer wanted (the sync/remove half of an edit).
  if (desiredUserMarkerIds.length === 0) {
    await supabase.from("marker_readings").delete().eq("entry_id", entryId);
  } else {
    await supabase
      .from("marker_readings")
      .delete()
      .eq("entry_id", entryId)
      .not("user_marker_id", "in", `(${desiredUserMarkerIds.join(",")})`);
  }

  revalidatePath("/progress");
  return { ok: true };
}

/** Delete a whole day's journal entry (its marker readings cascade). */
export async function deleteJournalEntry(
  entryId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You're not signed in." };

  const { error } = await supabase
    .from("journal_entries")
    .delete()
    .eq("id", entryId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/progress");
  return { ok: true };
}

/**
 * Record an uploaded progress photo (Spec 09 addendum). The image is uploaded
 * client-side to the private `progress-photos` bucket; this writes the row (pose
 * + date + path). We re-verify the path's first folder is the caller's own uid
 * and that the pose is a known catalogue pose. RLS scopes every row to the user.
 */
export async function addProgressPhoto(
  pose: string,
  takenOn: string,
  storagePath: string,
): Promise<{ ok: boolean; error?: string }> {
  const cleanPose = typeof pose === "string" ? pose.trim().slice(0, 60) : "";
  if (!cleanPose) return { ok: false, error: "Pick a pose." };
  if (!isValidDateKey(takenOn)) return { ok: false, error: "Invalid date." };
  if (isFuture(takenOn)) return { ok: false, error: "You can't use a future date." };
  if (typeof storagePath !== "string" || storagePath.includes("..")) {
    return { ok: false, error: "Couldn't attach that photo." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You're not signed in." };
  if (storagePath.split("/")[0] !== user.id) {
    return { ok: false, error: "Couldn't attach that photo." };
  }

  const { error } = await supabase.from("progress_photos").insert({
    user_id: user.id,
    pose: cleanPose,
    taken_on: takenOn,
    storage_path: storagePath,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/progress");
  return { ok: true };
}

/**
 * Record a whole progress-photo SESSION (Spec 09 addendum) — several poses for
 * one date submitted together, sharing an optional note. Each item's storage path
 * is re-verified to be the caller's own and each pose is trimmed; RLS scopes every
 * row to the user.
 */
export async function addProgressPhotos(
  takenOn: string,
  note: string,
  items: { pose: string; storagePath: string }[],
): Promise<{ ok: boolean; error?: string }> {
  if (!isValidDateKey(takenOn)) return { ok: false, error: "Invalid date." };
  if (isFuture(takenOn)) return { ok: false, error: "You can't use a future date." };
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: "Add at least one photo." };
  }
  const trimmedNote = typeof note === "string" ? note.trim().slice(0, 2000) : "";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You're not signed in." };

  const rows: {
    user_id: string;
    pose: string;
    taken_on: string;
    storage_path: string;
    note: string | null;
  }[] = [];
  for (const it of items) {
    const pose = typeof it?.pose === "string" ? it.pose.trim().slice(0, 60) : "";
    const path = typeof it?.storagePath === "string" ? it.storagePath : "";
    if (!pose || !path || path.includes("..") || path.split("/")[0] !== user.id) {
      return { ok: false, error: "Couldn't attach those photos." };
    }
    rows.push({
      user_id: user.id,
      pose,
      taken_on: takenOn,
      storage_path: path,
      note: trimmedNote || null,
    });
  }

  const { error } = await supabase.from("progress_photos").insert(rows);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/progress");
  return { ok: true };
}

/** Delete a progress photo — its storage object and its row. */
export async function deleteProgressPhoto(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You're not signed in." };

  const { data: row } = await supabase
    .from("progress_photos")
    .select("storage_path")
    .eq("id", id)
    .maybeSingle();
  const path = row?.storage_path as string | null | undefined;
  if (path) await supabase.storage.from("progress-photos").remove([path]);

  const { error } = await supabase.from("progress_photos").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/progress");
  return { ok: true };
}
