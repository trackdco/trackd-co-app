"use client"

import { useEffect } from "react"

import { AmberNotice, useAmberNotice } from "@/components/notifications/amber-notice"
import { subscribeSyncFailed } from "@/lib/home/syncStatus"

/**
 * Listens for the `trackd:sync-failed` signal (a best-effort cloud write that
 * failed while online) and shows ONE brief amber banner — "saved on your device,
 * still syncing" — so a tester never assumes data vanished. Re-fired failures
 * just re-show the single notice (the hook replaces the prior one), so a burst
 * never stacks. Mounted once in the app shell. The actual retry is handled by
 * `useCloudHydration` (reconnect / focus re-sync); this is the user-facing signal.
 */
export function SyncStatusNotice() {
  const { notice, show, dismiss } = useAmberNotice(4000)

  useEffect(
    () =>
      subscribeSyncFailed((kind) =>
        show(
          kind === "pull"
            ? // A failed READ saved nothing, so it cannot say "saved on your
              // device" (feel pass §1).
              // Adrian's wording (2026-09-17).
              "No connection. We're having trouble connecting to your account, so you're seeing what's saved on this phone. We'll keep trying."
            : "Saved on your device. Still syncing to your account. We'll keep trying."
        )
      ),
    [show]
  )

  return <AmberNotice notice={notice} onDismiss={dismiss} />
}
