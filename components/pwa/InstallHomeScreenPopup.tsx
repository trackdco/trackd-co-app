"use client";

import { useState } from "react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { AddToHomeScreenPrompt } from "@/components/push/AddToHomeScreenPrompt";
import { useMounted } from "@/components/home/useMounted";
import { getCapability } from "@/lib/push/pushService";
import { dismissInstallPrompt } from "@/lib/pwa/installActions";

const DISMISS_KEY = "trackd:ios-install-dismissed";

// Local backup of the account-level dismissal — guards against the server write
// failing (offline) so the popup still won't re-show on this device. The account
// flag (props) is authoritative across devices.
function getLocalDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}
function setLocalDismissed() {
  try {
    window.localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    /* storage unavailable — the account flag still records it */
  }
}

/**
 * One-time "Add Trackd to your Home Screen" popup for a new iPhone user who is in
 * Safari and hasn't installed the PWA. Shows ONCE PER ACCOUNT (not every login,
 * not once-per-device): the dismissal and the "already installed" state live on the
 * profile (`install_prompt_dismissed_at` / `pwa_installed_at`, passed in as
 * `dismissed` / `installed`). `pwa_installed_at` is stamped by PwaInstallTracker
 * the first time the app runs from the Home Screen, so once they've added it the
 * popup never shows again — on any device.
 *
 * Never shows on Android, desktop, or an already-installed (standalone) launch. The
 * same visuals live permanently in Profile → "Add to Home Screen".
 */
export function InstallHomeScreenPopup({
  installed,
  dismissed,
}: {
  installed: boolean;
  dismissed: boolean;
}) {
  const mounted = useMounted();
  const [closed, setClosed] = useState(false);

  function dismiss() {
    setClosed(true);
    setLocalDismissed();
    void dismissInstallPrompt(); // best-effort account-level record
  }

  // Eligibility is computed during render (post-mount, so SSR stays deterministic
  // and there's no setState-in-effect).
  if (!mounted) return null;
  if (installed || dismissed || getLocalDismissed()) return null;
  const cap = getCapability();
  if (!cap.isIOS || cap.isStandalone) return null;

  return (
    <Sheet
      open={!closed}
      onOpenChange={(o) => {
        if (!o) dismiss();
      }}
    >
      <SheetContent
        side="bottom"
        className="gap-0 rounded-t-3xl border-border-default bg-bg-surface px-5 pt-6 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]"
      >
        {/* The visible heading lives inside AddToHomeScreenPrompt; these satisfy
            Radix Dialog's required a11y title/description. */}
        <SheetTitle className="sr-only">Add Trackd to your Home Screen</SheetTitle>
        <SheetDescription className="sr-only">
          How to install Trackd as an app on your iPhone Home Screen.
        </SheetDescription>
        <AddToHomeScreenPrompt />
        <Button type="button" onClick={dismiss} className="mt-4 h-11 w-full rounded-xl">
          Got it
        </Button>
      </SheetContent>
    </Sheet>
  );
}
