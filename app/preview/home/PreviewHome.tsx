"use client";

import { useEffect, useState, type ComponentProps } from "react";

import { HomeScreen } from "@/components/home/HomeScreen";

/**
 * DEV-ONLY. Home with an optional simulated load: the skeleton for
 * `loadingMs`, then the log lands and the skeleton crossfades out (feel pass
 * §1). Without `loadingMs` it is the plain populated preview.
 */
export function PreviewHome({
  loadingMs,
  ...props
}: ComponentProps<typeof HomeScreen> & { loadingMs: number | null }) {
  const [known, setKnown] = useState(loadingMs == null);
  useEffect(() => {
    if (loadingMs == null) return;
    const t = window.setTimeout(() => setKnown(true), loadingMs);
    return () => window.clearTimeout(t);
  }, [loadingMs]);
  return <HomeScreen {...props} previewLogKnown={loadingMs == null ? undefined : known} />;
}
