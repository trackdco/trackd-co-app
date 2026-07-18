"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getActiveCycle } from "@/lib/db/cycles";
import {
  customMarkerKey,
  customMarkerUserMarkerId,
  isCustomMarkerKey,
  type MarkerOption,
} from "@/lib/progress/journal";

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
  /** New photo storage paths already uploaded client-side to the `journal` bucket. */
  attachmentsAdd?: string[];
  /** Existing journal_attachments ids to remove (row + storage bytes). */
  attachmentsRemove?: string[];
}): Promise<{ ok: boolean; error?: string }> {
  const { entryDate, touchBody } = input;
  if (!isValidDateKey(entryDate)) return { ok: false, error: "Invalid date." };
  if (isFuture(entryDate)) {
    return { ok: false, error: "You can't journal a future date." };
  }

  // Dedupe (last wins); keep only well-formed rows. A key is EITHER a catalogue
  // markers.id or the user's own custom marker `own:<user_markers.id>` (Spec 22 · 1).
  const wanted = new Map<string, number>();
  for (const m of input.markers ?? []) {
    if (typeof m?.markerId === "string" && Number.isFinite(m.tierValue)) {
      wanted.set(m.markerId, Math.trunc(m.tierValue));
    }
  }
  const catalogueWanted = new Map<string, number>(); // markers.id -> tier
  const customWanted = new Map<string, number>(); // user_markers.id -> tier
  for (const [key, tv] of wanted) {
    if (isCustomMarkerKey(key)) customWanted.set(customMarkerUserMarkerId(key), tv);
    else catalogueWanted.set(key, tv);
  }
  const body = typeof input.body === "string" ? input.body.trim() : "";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You're not signed in." };

  // Validate catalogue ids + tier ranges against the read-only catalogue.
  if (catalogueWanted.size > 0) {
    const { data: cat, error: catErr } = await supabase
      .from("markers")
      .select("id, tier_labels")
      .in("id", [...catalogueWanted.keys()]);
    if (catErr) return { ok: false, error: catErr.message };
    if (!cat || cat.length !== catalogueWanted.size) {
      return { ok: false, error: "Unknown marker." };
    }
    for (const c of cat) {
      const tv = catalogueWanted.get(c.id as string)!;
      const len = (c.tier_labels as string[] | null)?.length ?? 0;
      if (tv < 1 || tv > len) return { ok: false, error: "Invalid marker value." };
    }
  }

  // Validate the user's OWN custom markers: ownership + it really is a custom row +
  // tier within its scale. We deliberately do NOT gate on is_active — editing an old
  // entry may re-save a reading for a marker since soft-removed, and that history
  // must round-trip (removing only stops it being OFFERED, never erases readings).
  if (customWanted.size > 0) {
    const { data: ums, error: umErr } = await supabase
      .from("user_markers")
      .select("id, marker_id, custom_tier_labels")
      .eq("user_id", user.id)
      .in("id", [...customWanted.keys()]);
    if (umErr) return { ok: false, error: umErr.message };
    if (!ums || ums.length !== customWanted.size) {
      return { ok: false, error: "Unknown marker." };
    }
    for (const um of ums) {
      if (um.marker_id) return { ok: false, error: "Unknown marker." };
      const len = (um.custom_tier_labels as string[] | null)?.length ?? 0;
      const tv = customWanted.get(um.id as string)!;
      if (tv < 1 || tv > len) return { ok: false, error: "Invalid marker value." };
    }
  }

  // Photo attachments (Spec 22 · 3). New paths were uploaded client-side to the
  // private `journal` bucket; re-verify each sits under the caller's own uid folder.
  const addPaths = Array.isArray(input.attachmentsAdd)
    ? input.attachmentsAdd.filter(
        (p): p is string =>
          typeof p === "string" &&
          p.length > 0 &&
          !p.includes("..") &&
          p.split("/")[0] === user.id,
      )
    : [];
  const removeIds = new Set(
    Array.isArray(input.attachmentsRemove)
      ? input.attachmentsRemove.filter(
          (id): id is string => typeof id === "string" && id.length > 0,
        )
      : [],
  );

  // Find the day's entry (one per day) + its current attachments.
  const { data: existing } = await supabase
    .from("journal_entries")
    .select("id, free_text")
    .eq("user_id", user.id)
    .eq("entry_date", entryDate)
    .maybeSingle();

  let existingAttachments: { id: string; storage_path: string }[] = [];
  if (existing) {
    const { data: atts } = await supabase
      .from("journal_attachments")
      .select("id, storage_path")
      .eq("journal_entry_id", existing.id)
      .eq("user_id", user.id);
    existingAttachments = (atts ?? []).map((a) => ({
      id: a.id as string,
      storage_path: a.storage_path as string,
    }));
  }
  const keptCount =
    existingAttachments.filter((a) => !removeIds.has(a.id)).length + addPaths.length;

  const finalBody = touchBody
    ? body || null
    : ((existing?.free_text as string | null) ?? null);

  // Nothing left to hold (no body, no markers, no photos) → clear the day. Clean up
  // any attachment BYTES first (the rows cascade with the entry, the bytes don't).
  if (!finalBody && wanted.size === 0 && keptCount === 0) {
    if (existing) {
      const paths = existingAttachments.map((a) => a.storage_path);
      if (paths.length > 0) await supabase.storage.from("journal").remove(paths);
      await supabase.from("journal_entries").delete().eq("id", existing.id);
      revalidatePath("/progress");
      return { ok: true };
    }
    return { ok: false, error: "Write something, dial a marker, or add a photo." };
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

  // Resolve every dialed marker to a user_markers row id → its desired tier value.
  const desired = new Map<string, number>(); // user_markers.id -> tier_value
  // Custom markers: the id IS the user_markers row (validated above).
  for (const [umId, tv] of customWanted) desired.set(umId, tv);
  // Catalogue markers: find (or lazily create) the join row per catalogue marker.
  if (catalogueWanted.size > 0) {
    const userMarkerByMarker = new Map<string, string>();
    const { data: ums } = await supabase
      .from("user_markers")
      .select("id, marker_id")
      .eq("user_id", user.id)
      .in("marker_id", [...catalogueWanted.keys()]);
    for (const um of ums ?? []) {
      if (um.marker_id) userMarkerByMarker.set(um.marker_id as string, um.id as string);
    }
    const missing = [...catalogueWanted.keys()].filter(
      (id) => !userMarkerByMarker.has(id),
    );
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
        if (um.marker_id) userMarkerByMarker.set(um.marker_id as string, um.id as string);
      }
    }
    for (const [markerId, tv] of catalogueWanted) {
      desired.set(userMarkerByMarker.get(markerId)!, tv);
    }
  }

  // Sync the entry's readings to exactly `desired`.
  const desiredUserMarkerIds = [...desired.keys()];
  if (desiredUserMarkerIds.length > 0) {
    const rows = [...desired.entries()].map(([userMarkerId, tierValue]) => ({
      user_id: user.id,
      entry_id: entryId,
      user_marker_id: userMarkerId,
      tier_value: tierValue,
    }));
    const { error } = await supabase
      .from("marker_readings")
      .upsert(rows, { onConflict: "entry_id,user_marker_id" });
    if (error) return { ok: false, error: error.message };
    const { error: pruneError } = await supabase
      .from("marker_readings")
      .delete()
      .eq("entry_id", entryId)
      .not("user_marker_id", "in", `(${desiredUserMarkerIds.join(",")})`);
    if (pruneError) return { ok: false, error: pruneError.message };
  } else {
    const { error: clearError } = await supabase
      .from("marker_readings")
      .delete()
      .eq("entry_id", entryId);
    if (clearError) return { ok: false, error: clearError.message };
  }

  // Attachments: remove the ones the user cleared (row + bytes), add the new ones.
  const toRemove = existingAttachments.filter((a) => removeIds.has(a.id));
  if (toRemove.length > 0) {
    await supabase.storage
      .from("journal")
      .remove(toRemove.map((a) => a.storage_path));
    await supabase
      .from("journal_attachments")
      .delete()
      .eq("user_id", user.id)
      .in(
        "id",
        toRemove.map((a) => a.id),
      );
  }
  if (addPaths.length > 0) {
    const { error } = await supabase.from("journal_attachments").insert(
      addPaths.map((storage_path) => ({
        user_id: user.id,
        journal_entry_id: entryId,
        storage_path,
      })),
    );
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/progress");
  return { ok: true };
}

/**
 * Create the caller's OWN custom marker (Spec 22 · 1): a name, an ordered set of
 * scale words (low → high), and a polarity. Stored on user_markers (marker_id NULL
 * + custom_name / custom_tier_labels / custom_polarity). Polarity is axis
 * orientation only, never a good/bad verdict (architecture Invariant 3). Names are
 * unique per user among the user's ACTIVE custom markers.
 */
export async function createCustomMarker(input: {
  name: string;
  labels: string[];
  polarity: string;
}): Promise<{ ok: boolean; marker?: MarkerOption; error?: string }> {
  const name = typeof input?.name === "string" ? input.name.trim() : "";
  const labels = Array.isArray(input?.labels)
    ? input.labels
        .map((l) => (typeof l === "string" ? l.trim() : ""))
        .filter((l) => l.length > 0)
    : [];
  const polarity = ["positive", "negative", "neutral"].includes(input?.polarity)
    ? input.polarity
    : "neutral";

  if (name.length < 1 || name.length > 40) {
    return { ok: false, error: "Give your marker a name." };
  }
  if (labels.length < 2) {
    return { ok: false, error: "Add at least two scale words, low to high." };
  }
  if (labels.length > 7) {
    return { ok: false, error: "Keep the scale to 7 words or fewer." };
  }
  if (labels.some((l) => l.length > 24)) {
    return { ok: false, error: "Keep each scale word short." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You're not signed in." };

  // Unique per user among ACTIVE custom markers (case-insensitive). The DB has a
  // partial unique index as the backstop; this is the friendly pre-check.
  const { data: mine } = await supabase
    .from("user_markers")
    .select("custom_name")
    .eq("user_id", user.id)
    .is("marker_id", null)
    .eq("is_active", true);
  const lower = name.toLowerCase();
  if (
    (mine ?? []).some(
      (r) => (r.custom_name as string | null)?.trim().toLowerCase() === lower,
    )
  ) {
    return { ok: false, error: "You already have a marker with that name." };
  }

  const { data: created, error } = await supabase
    .from("user_markers")
    .insert({
      user_id: user.id,
      marker_id: null,
      custom_name: name,
      custom_tier_labels: labels,
      custom_polarity: polarity,
      is_active: true,
      sort_order: 0,
    })
    .select("id")
    .single();
  if (error || !created) {
    return { ok: false, error: error?.message ?? "Couldn't create that marker." };
  }

  revalidatePath("/progress");
  return {
    ok: true,
    marker: {
      id: customMarkerKey(created.id as string),
      name,
      polarity,
      tierLabels: labels,
      isDefault: false,
      kind: "custom",
      addable: true,
    },
  };
}

/**
 * Soft-remove the caller's custom marker (forward-only): is_active = false, so it's
 * no longer OFFERED for new readings, but every past reading stays intact
 * (Spec 22 · 1 — removing preserves history). The `.is("marker_id", null)` guard
 * means this can only ever touch a custom row, never a catalogue reference.
 */
export async function removeCustomMarker(
  userMarkerId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (typeof userMarkerId !== "string" || userMarkerId.length === 0) {
    return { ok: false, error: "Unknown marker." };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You're not signed in." };

  const { error } = await supabase
    .from("user_markers")
    .update({ is_active: false })
    .eq("id", userMarkerId)
    .eq("user_id", user.id)
    .is("marker_id", null);
  if (error) return { ok: false, error: error.message };

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

  // Clean up attachment BYTES before the rows cascade with the entry (Spec 22 · 3).
  const { data: atts } = await supabase
    .from("journal_attachments")
    .select("storage_path")
    .eq("journal_entry_id", entryId)
    .eq("user_id", user.id);
  const attPaths = (atts ?? [])
    .map((a) => a.storage_path as string)
    .filter((p) => Boolean(p));
  if (attPaths.length > 0) await supabase.storage.from("journal").remove(attPaths);

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
