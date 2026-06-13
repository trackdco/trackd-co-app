import type { Metadata } from "next";

import {
  CalendarScreen,
  type CalendarJournalDay,
} from "@/components/calendar/CalendarScreen";
import { createClient } from "@/lib/supabase/server";
import { toDateKey, type DateKey } from "@/lib/home/mockHomeData";
import {
  wordFor,
  type EntryMarker,
  type MarkerCatalogueItem,
} from "@/lib/progress/journal";
import type { CalendarPhoto } from "@/lib/calendar/calendar";

export const metadata: Metadata = { title: "Calendar — Trackd Co" };

const SIGNED_URL_TTL = 60 * 60; // 1h — regenerated on every page load

/**
 * The Calendar tab's route — reached from the calendar shortcut on the Dashboard
 * header (NOT a sixth nav tab). The (app) layout already enforced auth + the
 * 18+/ToS gate. This server wrapper reads the user's own (RLS-scoped) weight and
 * journal/markers, keys them by day, and threads them into the client screen,
 * which adds the device-local "Running" read. Read-only: nothing is written here.
 */
export default async function CalendarPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // The (app) layout redirects unauthenticated users; this guards the render that
  // runs concurrently with that redirect so it never dereferences a null user.
  if (!user) return null;

  const [
    { data: profile },
    { data: weightData },
    { data: markerData },
    { data: entryData },
    { data: readingData },
    { data: userMarkerData },
    { data: photoData },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("units_preference")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("weight_logs")
      .select("logged_for, weight")
      .order("logged_for", { ascending: true })
      .limit(2000),
    supabase
      .from("markers")
      .select("id, name, polarity, is_default, tier_labels")
      .order("name", { ascending: true }),
    supabase
      .from("journal_entries")
      .select("id, entry_date, free_text")
      .order("entry_date", { ascending: false }),
    supabase.from("marker_readings").select("entry_id, user_marker_id, tier_value"),
    supabase.from("user_markers").select("id, marker_id"),
    supabase
      .from("progress_photos")
      .select("id, pose, taken_on, created_at, storage_path")
      .order("taken_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1000),
  ]);

  // Weight by day (kg).
  const weightByDate: Record<DateKey, number> = {};
  for (const r of weightData ?? []) {
    weightByDate[r.logged_for as string] = Number(r.weight);
  }

  // ── Journal: stitch entries ← readings ← user_markers ← catalogue ──
  // (the same chain the Progress page walks; words displayed, never the ordinal).
  const catalogueById = new Map<string, MarkerCatalogueItem>();
  for (const m of markerData ?? []) {
    catalogueById.set(m.id as string, {
      id: m.id as string,
      name: m.name as string,
      polarity: m.polarity as string,
      isDefault: Boolean(m.is_default),
      tierLabels: (m.tier_labels as string[] | null) ?? [],
    });
  }
  // user_markers.id → catalogue marker
  const markerByUserMarker = new Map<string, MarkerCatalogueItem>();
  for (const um of userMarkerData ?? []) {
    const cat = um.marker_id
      ? catalogueById.get(um.marker_id as string)
      : undefined;
    if (cat) markerByUserMarker.set(um.id as string, cat);
  }
  const markersByEntry = new Map<string, EntryMarker[]>();
  for (const r of readingData ?? []) {
    const cat = markerByUserMarker.get(r.user_marker_id as string);
    if (!cat) continue; // custom markers aren't created by this app
    const tierValue = Number(r.tier_value);
    const arr = markersByEntry.get(r.entry_id as string) ?? [];
    arr.push({
      markerId: cat.id,
      name: cat.name,
      tierValue,
      word: wordFor(cat.tierLabels, tierValue),
    });
    markersByEntry.set(r.entry_id as string, arr);
  }
  // One entry per day (DB invariant), so key straight by entry_date.
  const journalByDate: Record<DateKey, CalendarJournalDay> = {};
  for (const e of entryData ?? []) {
    journalByDate[e.entry_date as string] = {
      id: e.id as string,
      body: (e.free_text as string | null) ?? null,
      markers: (markersByEntry.get(e.id as string) ?? []).sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    };
  }

  // ── Progress photos: sign each path (private bucket), group by day ──
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
  const photosByDate: Record<DateKey, CalendarPhoto[]> = {};
  for (const p of photoRows) {
    const date =
      (p.taken_on as string | null) ??
      toDateKey(new Date(p.created_at as string));
    (photosByDate[date] ??= []).push({
      id: p.id as string,
      pose: p.pose as string,
      url: photoSigned.get(p.storage_path as string) ?? null,
    });
  }

  return (
    <CalendarScreen
      weightByDate={weightByDate}
      journalByDate={journalByDate}
      photosByDate={photosByDate}
      userId={user.id}
      todayKey={toDateKey(new Date())}
      unitPreference={profile?.units_preference ?? "metric"}
    />
  );
}
