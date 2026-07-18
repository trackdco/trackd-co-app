import type { Metadata } from "next";

import { ProgressScreen } from "@/components/progress/ProgressScreen";
import { createClient } from "@/lib/supabase/server";
import { toDateKey } from "@/lib/home/mockHomeData";
import type { BloodworkPhoto } from "@/lib/progress/bloodwork";
import {
  customMarkerKey,
  wordFor,
  type EntryMarker,
  type JournalAttachment,
  type JournalEntry,
  type MarkerCatalogueItem,
  type MarkerOption,
} from "@/lib/progress/journal";
import type { ProgressPhoto } from "@/lib/progress/photos";

export const metadata: Metadata = { title: "Progress — Trackd Co" };

const SIGNED_URL_TTL = 60 * 60; // 1h — regenerated on every page load

// Progress tab root. The (app) layout already enforced auth + the 18+/ToS gate.
// This server wrapper fetches each section's user-scoped data (RLS does the
// scoping) and threads it into the screen.
export default async function ProgressPage() {
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
    { data: panelData },
    { data: markerData },
    { data: entryData },
    { data: readingData },
    { data: userMarkerData },
    { data: photoData },
    { data: attachmentData },
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
    // Photo panels only (a source file present); newest draw first.
    supabase
      .from("lab_panels")
      .select("id, drawn_on, created_at, source_file_path, notes")
      .not("source_file_path", "is", null)
      .order("drawn_on", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
    // The global marker catalogue (read-only) for the dialer.
    supabase
      .from("markers")
      .select("id, name, polarity, is_default, tier_labels")
      .order("name", { ascending: true }),
    supabase
      .from("journal_entries")
      .select("id, entry_date, free_text")
      .order("entry_date", { ascending: false }),
    supabase.from("marker_readings").select("entry_id, user_marker_id, tier_value"),
    supabase
      .from("user_markers")
      .select("id, marker_id, custom_name, custom_tier_labels, custom_polarity, is_active"),
    supabase
      .from("progress_photos")
      .select("id, pose, taken_on, created_at, storage_path, note")
      .order("taken_on", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("journal_attachments")
      .select("id, journal_entry_id, storage_path")
      .order("created_at", { ascending: false }),
  ]);

  const weight = (weightData ?? []).map((r) => ({
    key: r.logged_for as string,
    kg: Number(r.weight),
  }));

  // Sign each photo's storage path for display (the bucket is private).
  const panels = panelData ?? [];
  const paths = panels
    .map((p) => p.source_file_path as string | null)
    .filter((p): p is string => Boolean(p));
  const signedByPath = new Map<string, string>();
  if (paths.length > 0) {
    const { data: signed } = await supabase.storage
      .from("bloodwork")
      .createSignedUrls(paths, SIGNED_URL_TTL);
    for (const s of signed ?? []) {
      if (s.path && s.signedUrl) signedByPath.set(s.path, s.signedUrl);
    }
  }

  const bloodworkPhotos: BloodworkPhoto[] = panels.map((p) => {
    const path = p.source_file_path as string;
    return {
      id: p.id as string,
      date:
        (p.drawn_on as string | null) ??
        toDateKey(new Date(p.created_at as string)),
      url: signedByPath.get(path) ?? null,
      note: (p.notes as string | null) ?? null,
    };
  });

  // ── Journal: stitch entries ← readings ← user_markers ← (catalogue | custom) ──
  const markerCatalogue: MarkerCatalogueItem[] = (markerData ?? []).map((m) => ({
    id: m.id as string,
    name: m.name as string,
    polarity: m.polarity as string,
    isDefault: Boolean(m.is_default),
    tierLabels: (m.tier_labels as string[] | null) ?? [],
  }));
  const catalogueById = new Map(markerCatalogue.map((m) => [m.id, m]));

  // A user_markers row resolves to a dialer/reading identity — either a catalogue
  // marker (marker_id set) or the user's OWN custom marker (custom_* columns). We
  // resolve BOTH; custom markers resolve regardless of is_active so a soft-removed
  // marker's PAST readings still render (Spec 22 · 1: removing keeps history).
  const resolvedUserMarker = new Map<
    string,
    { key: string; name: string; tierLabels: string[] }
  >();
  const customOptions: MarkerOption[] = [];
  for (const um of userMarkerData ?? []) {
    if (um.marker_id) {
      const cat = catalogueById.get(um.marker_id as string);
      if (cat) {
        resolvedUserMarker.set(um.id as string, {
          key: cat.id,
          name: cat.name,
          tierLabels: cat.tierLabels,
        });
      }
      continue;
    }
    if (um.custom_name) {
      const key = customMarkerKey(um.id as string);
      const tierLabels = (um.custom_tier_labels as string[] | null) ?? [];
      resolvedUserMarker.set(um.id as string, {
        key,
        name: um.custom_name as string,
        tierLabels,
      });
      customOptions.push({
        id: key,
        name: um.custom_name as string,
        polarity: (um.custom_polarity as string | null) ?? "neutral",
        tierLabels,
        isDefault: false,
        kind: "custom",
        addable: Boolean(um.is_active),
      });
    }
  }

  // What the dialer offers: the whole catalogue + the user's custom markers.
  const markerOptions: MarkerOption[] = [
    ...markerCatalogue.map((m) => ({
      id: m.id,
      name: m.name,
      polarity: m.polarity,
      tierLabels: m.tierLabels,
      isDefault: m.isDefault,
      kind: "catalogue" as const,
      addable: true,
    })),
    ...customOptions,
  ];

  const markersByEntry = new Map<string, EntryMarker[]>();
  for (const r of readingData ?? []) {
    const resolved = resolvedUserMarker.get(r.user_marker_id as string);
    if (!resolved) continue; // an orphaned reading (marker hard-removed) — skip
    const tierValue = Number(r.tier_value);
    const arr = markersByEntry.get(r.entry_id as string) ?? [];
    arr.push({
      markerId: resolved.key,
      name: resolved.name,
      tierValue,
      word: wordFor(resolved.tierLabels, tierValue),
    });
    markersByEntry.set(r.entry_id as string, arr);
  }
  // ── Journal attachments: sign each path (private `journal` bucket) ──
  const attachmentRows = attachmentData ?? [];
  const attachmentPaths = attachmentRows
    .map((a) => a.storage_path as string | null)
    .filter((p): p is string => Boolean(p));
  const attachmentSigned = new Map<string, string>();
  if (attachmentPaths.length > 0) {
    const { data: signed } = await supabase.storage
      .from("journal")
      .createSignedUrls(attachmentPaths, SIGNED_URL_TTL);
    for (const s of signed ?? []) {
      if (s.path && s.signedUrl) attachmentSigned.set(s.path, s.signedUrl);
    }
  }
  const attachmentsByEntry = new Map<string, JournalAttachment[]>();
  for (const a of attachmentRows) {
    const entryId = a.journal_entry_id as string;
    const arr = attachmentsByEntry.get(entryId) ?? [];
    arr.push({
      id: a.id as string,
      url: attachmentSigned.get(a.storage_path as string) ?? null,
    });
    attachmentsByEntry.set(entryId, arr);
  }

  const journalEntries: JournalEntry[] = (entryData ?? []).map((e) => ({
    id: e.id as string,
    date: e.entry_date as string,
    body: (e.free_text as string | null) ?? null,
    markers: (markersByEntry.get(e.id as string) ?? []).sort((a, b) =>
      a.name.localeCompare(b.name),
    ),
    attachments: attachmentsByEntry.get(e.id as string) ?? [],
  }));

  // ── Progress photos: sign each path (private bucket) ──
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
  // Link weight ↔ photo by date.
  const weightByDate = new Map(weight.map((w) => [w.key, w.kg]));
  const progressPhotos: ProgressPhoto[] = photoRows.map((p) => {
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

  return (
    <ProgressScreen
      weight={weight}
      unitPreference={profile?.units_preference ?? "metric"}
      todayKey={toDateKey(new Date())}
      userId={user.id}
      bloodworkPhotos={bloodworkPhotos}
      journalEntries={journalEntries}
      markerOptions={markerOptions}
      progressPhotos={progressPhotos}
    />
  );
}
