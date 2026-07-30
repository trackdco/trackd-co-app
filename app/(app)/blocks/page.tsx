import type { Metadata } from "next";

import { BlocksScreen } from "@/components/blocks/BlocksScreen";
import { listBlocks } from "@/lib/db/blocks";
import { createClient } from "@/lib/supabase/server";
import { toDateKey } from "@/lib/home/mockHomeData";
import type { BloodworkPhoto } from "@/lib/progress/bloodwork";
import type { JournalEntry } from "@/lib/progress/journal";
import type { ProgressPhoto } from "@/lib/progress/photos";

export const metadata: Metadata = { title: "Blocks — Trackd Co" };

const SIGNED_URL_TTL = 60 * 60; // 1h — regenerated on every page load

/**
 * Blocks — the live block and the look-back list (Adrian, 2026-07-30).
 *
 * A real route rather than a sheet, following `/weight`: this is a canonical,
 * deep view, and a retrospective is long enough to want a page it can scroll
 * rather than a sheet's height to fight.
 *
 * The retrospective is a QUERY over data the app already holds, so this server
 * wrapper fetches the same user-scoped sources Progress does (RLS does the
 * scoping) and hands them over whole. Clipping to a block's window happens in
 * `lib/blocks/retrospective.ts`, not here — one rule, applied in one place, so
 * no two sections can disagree about which days belong to a block.
 *
 * The dosing model is still read from the DEVICE stores (`lib/home/stack.ts`,
 * `doseLog.ts`), exactly as Progress's own consistency and running list do, so
 * "what you ran" and consistency resolve client-side.
 */
export default async function BlocksPage({
  searchParams,
}: {
  searchParams: Promise<{ block?: string }>;
}) {
  const { block: selectedId } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // The (app) layout redirects unauthenticated users; this guards the render that
  // runs concurrently with that redirect so it never dereferences a null user.
  if (!user) return null;

  const blocksPromise = listBlocks();

  const [
    { data: weightData },
    { data: panelData },
    { data: photoData },
    { data: entryData },
    { data: readingData },
    { data: userMarkerData },
    { data: markerData },
  ] = await Promise.all([
    supabase
      .from("weight_logs")
      .select("logged_for, weight")
      .order("logged_for", { ascending: true })
      .limit(2000),
    supabase
      .from("lab_panels")
      .select("id, drawn_on, created_at, source_file_path, notes")
      .not("source_file_path", "is", null)
      .order("drawn_on", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("progress_photos")
      .select("id, pose, taken_on, created_at, storage_path, note")
      .order("taken_on", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("journal_entries")
      .select("id, entry_date, free_text")
      .order("entry_date", { ascending: false }),
    supabase.from("marker_readings").select("entry_id, user_marker_id, tier_value"),
    supabase
      .from("user_markers")
      .select("id, marker_id, custom_name, custom_tier_labels"),
    supabase.from("markers").select("id, name, tier_labels"),
  ]);

  const weight = (weightData ?? []).map((r) => ({
    key: r.logged_for as string,
    kg: Number(r.weight),
  }));

  // ── Bloodwork panels (private bucket → short-lived signed URLs) ──
  const panels = panelData ?? [];
  const panelPaths = panels
    .map((p) => p.source_file_path as string | null)
    .filter((p): p is string => Boolean(p));
  const panelSigned = new Map<string, string>();
  if (panelPaths.length > 0) {
    const { data: signed } = await supabase.storage
      .from("bloodwork")
      .createSignedUrls(panelPaths, SIGNED_URL_TTL);
    for (const s of signed ?? []) {
      if (s.path && s.signedUrl) panelSigned.set(s.path, s.signedUrl);
    }
  }
  const bloods: BloodworkPhoto[] = panels.map((p) => ({
    id: p.id as string,
    date:
      (p.drawn_on as string | null) ?? toDateKey(new Date(p.created_at as string)),
    url: panelSigned.get(p.source_file_path as string) ?? null,
    note: (p.notes as string | null) ?? null,
  }));

  // ── Progress photos (private bucket) ──
  const photoRows = photoData ?? [];
  const photoPaths = photoRows
    .map((p) => p.storage_path as string | null)
    .filter((p): p is string => Boolean(p));
  const photoSigned = new Map<string, string>();
  if (photoPaths.length > 0) {
    const { data: signed } = await supabase.storage
      .from("progress-photos")
      .createSignedUrls(photoPaths, SIGNED_URL_TTL);
    for (const s of signed ?? []) {
      if (s.path && s.signedUrl) photoSigned.set(s.path, s.signedUrl);
    }
  }
  const weightByDate = new Map(weight.map((w) => [w.key, w.kg]));
  const photos: ProgressPhoto[] = photoRows.map((p) => {
    const date =
      (p.taken_on as string | null) ??
      toDateKey(new Date(p.created_at as string));
    return {
      id: p.id as string,
      pose: p.pose as string,
      date,
      url: photoSigned.get(p.storage_path as string) ?? null,
      weightKg: weightByDate.get(date) ?? null,
      note: (p.note as string | null) ?? null,
    };
  });

  // ── Journal: entries ← readings ← user_markers ← (catalogue | custom) ──
  // Only the marker NAME is needed here (the look-back counts how often each was
  // noted), so this resolves names and stops. Severity words are deliberately
  // absent: the retrospective reports that a marker was dialed, never how badly.
  const markerNameById = new Map(
    (markerData ?? []).map((m) => [m.id as string, m.name as string]),
  );
  const nameByUserMarker = new Map<string, string>();
  for (const um of userMarkerData ?? []) {
    const name = um.marker_id
      ? markerNameById.get(um.marker_id as string)
      : ((um.custom_name as string | null) ?? undefined);
    if (name) nameByUserMarker.set(um.id as string, name);
  }
  const markersByEntry = new Map<string, { markerId: string; name: string }[]>();
  for (const r of readingData ?? []) {
    const name = nameByUserMarker.get(r.user_marker_id as string);
    if (!name) continue; // an orphaned reading (marker hard-removed)
    const arr = markersByEntry.get(r.entry_id as string) ?? [];
    arr.push({ markerId: r.user_marker_id as string, name });
    markersByEntry.set(r.entry_id as string, arr);
  }
  const journal: JournalEntry[] = (entryData ?? []).map((e) => ({
    id: e.id as string,
    date: e.entry_date as string,
    body: (e.free_text as string | null) ?? null,
    markers: (markersByEntry.get(e.id as string) ?? []).map((m) => ({
      markerId: m.markerId,
      name: m.name,
      // The look-back never renders a severity, so these carry the neutral
      // values the type requires rather than a reading this page did not read.
      tierValue: 0,
      word: "",
    })),
    attachments: [],
  }));

  const blocks = await blocksPromise;

  return (
    <BlocksScreen
      blocks={blocks}
      selectedId={selectedId}
      todayKey={toDateKey(new Date())}
      userId={user.id}
      weight={weight}
      photos={photos}
      bloods={bloods}
      journal={journal}
    />
  );
}
