import { notFound } from "next/navigation"

import { ArchiveWeightPreview } from "./preview"

/**
 * DEV-ONLY preview for two changes, viewable WITHOUT signing in (desktop too):
 *  1. An ARCHIVED compound in the Add-to-Stack search renders dimmed with a
 *     Reactivate (↺) control; reactivating resumes it from TODAY (no backfill).
 *  2. The Weight view defaults to the raw SCALE reading, not the trend.
 * Seeds a throwaway "preview-archive" store with mock data. 404s in production.
 */
export default function PreviewArchiveWeightPage() {
  if (process.env.NODE_ENV === "production") notFound()
  return <ArchiveWeightPreview />
}
