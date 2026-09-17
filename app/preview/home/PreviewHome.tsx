"use client";

import { useEffect, useState, type ComponentProps } from "react";

import { HomeScreen } from "@/components/home/HomeScreen";
import { notifyDoseLogsChanged, saveDoseLogs } from "@/lib/home/doseLog";

/**
 * DEV-ONLY. Home with two review switches for the feel pass:
 *
 * - `loadingMs` holds the loading skeleton that long, then lands the log, so
 *   the skeleton and its crossfade can be reviewed (§1).
 * - `live` seeds the sample doses into the DEVICE store instead of passing
 *   them in, so logging from the sheet updates the row and its tick pops (§8).
 */
export function PreviewHome({
  loadingMs,
  live,
  previewLogs,
  ...props
}: ComponentProps<typeof HomeScreen> & { loadingMs: number | null; live: boolean }) {
  const [known, setKnown] = useState(loadingMs == null);
  useEffect(() => {
    if (loadingMs == null) return;
    const t = window.setTimeout(() => setKnown(true), loadingMs);
    return () => window.clearTimeout(t);
  }, [loadingMs]);
  const [seeded, setSeeded] = useState(!live);
  useEffect(() => {
    if (!live || !previewLogs) return;
    saveDoseLogs(props.userId, previewLogs);
    notifyDoseLogsChanged();
    // Mounted a frame later, so the screen's first read is the seeded store.
    const raf = requestAnimationFrame(() => setSeeded(true));
    return () => cancelAnimationFrame(raf);
  }, [live, previewLogs, props.userId]);
  if (!seeded) return null;
  return (
    <HomeScreen
      {...props}
      previewLogs={live ? undefined : previewLogs}
      previewLogKnown={loadingMs == null ? undefined : known}
    />
  );
}
