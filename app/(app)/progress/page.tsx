import type { Metadata } from "next";

import { ProgressScreen } from "@/components/progress/ProgressScreen";
import { listBlocks } from "@/lib/db/blocks";
import { createClient } from "@/lib/supabase/server";
import { toDateKey } from "@/lib/home/mockHomeData";
import { bloodworkDateKey, type BloodworkPhoto } from "@/lib/progress/bloodwork";
import { readJournal } from "@/lib/db/journalRead";
import type { ProgressPhoto } from "@/lib/progress/photos";
import { SIGNED_URL_TTL } from "@/lib/storage/signedUrl";

export const metadata: Metadata = { title: "Progress · Trakabl" };

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

  // Blocks come from Postgres, not the device store: a block is a RECORD of a
  // period trained through, and a PWA reinstall must not lose one.
  const blocksPromise = listBlocks();

  const [
    { data: profile },
    { data: weightData },
    { data: panelData },
    { data: photoData },
    journal,
  ] = await Promise.all([
    supabase
      // `sex` rides along on the read the page already makes — the same column the
      // injection-site body map reads, not a second source (Spec 04).
      .from("profiles")
      .select("units_preference, sex")
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
    supabase
      .from("progress_photos")
      .select("id, pose, taken_on, created_at, storage_path, note")
      .order("taken_on", { ascending: false })
      .order("created_at", { ascending: false }),
    // The journal (entries, markers, photos), the same read Home's journal uses.
    readJournal(supabase, user.id),
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
      // The draw date as picked, read as a key (W42).
      date: bloodworkDateKey(p.drawn_on as string | null, p.created_at as string),
      url: signedByPath.get(path) ?? null,
      note: (p.notes as string | null) ?? null,
    };
  });

  const { entries: journalEntries, options: markerOptions } = journal;

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

  const blocks = await blocksPromise;

  return (
    <ProgressScreen
      blocks={blocks}
      weight={weight}
      unitPreference={profile?.units_preference ?? "metric"}
      // The SERVER's today (UTC on Vercel): only the first paint's seed. Every
      // client section that dates something corrects it to the device's day
      // (`useDeviceToday`), or a new photo, report or entry defaults to
      // yesterday before about 10am in Sydney.
      todayKey={toDateKey(new Date())}
      userId={user.id}
      bloodworkPhotos={bloodworkPhotos}
      journalEntries={journalEntries}
      markerOptions={markerOptions}
      progressPhotos={progressPhotos}
    />
  );
}
