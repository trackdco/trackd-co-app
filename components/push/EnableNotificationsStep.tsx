"use client";

import { Bell } from "@/components/icons";

import { Button } from "@/components/ui/button";
import { useMounted } from "@/components/home/useMounted";
import { usePushNotifications } from "@/components/push/usePushNotifications";

/**
 * The dashboard's "Enable notifications" banner — a slim, PERSISTENT prompt that
 * sits above Today's Log and stays until the user actually turns notifications on.
 * Notifications are core to the app (dose reminders), so this is deliberately NOT
 * dismissable: there's no "Not now" and no remembered-dismissed flag. It self-hides
 * only when there's nothing to do — already on, permission denied (can't re-prompt;
 * Settings has re-enable guidance), iOS-not-installed (the install popup owns that),
 * or the browser can't do push at all. So it shows exactly when enabling is possible
 * and not yet done, and disappears the moment the user accepts.
 *
 * Backed by the SAME usePushNotifications hook as the Settings toggle, so there is
 * one code path. Intentionally smaller than the glance cards: a single row (badge +
 * label + compact action), not a full p-5 card.
 */
export function EnableNotificationsStep({
  initialEnabled,
}: {
  initialEnabled: boolean;
}) {
  const mounted = useMounted();
  const { status, busy, enable } = usePushNotifications(initialEnabled);

  // Server + first hydration render nothing (gate on mount) to avoid a flash.
  if (!mounted) return null;
  // Only actionable when push CAN be turned on but isn't yet. Every other state
  // (on, denied, ios-needs-install, unsupported, unconfigured, still probing) has
  // nothing for this banner to do, so it stays hidden.
  if (status !== "off") return null;

  return (
    <div className="animate-home-up" style={{ animationDelay: "100ms" }}>
      <div className="flex items-center gap-3 rounded-2xl bg-bg-surface p-4">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center text-text-muted"
          aria-hidden="true"
        >
          <Bell className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">
            Enable notifications
          </p>
          <p className="text-xs leading-snug text-text-muted">
            Reminders when a dose is due.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => void enable()}
          disabled={busy}
          aria-busy={busy}
          className="h-9 shrink-0 rounded-lg px-4 text-sm"
        >
          {busy ? "Enabling…" : "Enable"}
        </Button>
      </div>
    </div>
  );
}
