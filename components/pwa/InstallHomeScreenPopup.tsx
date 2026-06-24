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

const DISMISS_KEY = "trackd:ios-install-dismissed";

// Fallback for privacy-restricted contexts (Safari private mode) where
// localStorage throws: a module-level flag persists the dismissal for the rest of
// the session, so a client remount doesn't re-show the popup (component state
// alone would reset to false).
let sessionDismissedFallback = false;

// localStorage can throw in privacy-restricted contexts — guard so it can never
// crash the dashboard (matches EnableNotificationsStep's pattern).
function getDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return sessionDismissedFallback;
  }
}
function setDismissed() {
  try {
    window.localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    sessionDismissedFallback = true; // storage unavailable — session-only dismissal
  }
}

/**
 * One-time "Add Trackd to your Home Screen" popup, shown to a new iPhone user who
 * is in Safari and hasn't installed the PWA yet (iOS only delivers reminders to an
 * installed standalone app, and the app simply feels better installed). It auto-
 * opens once after signup, is remembered once dismissed so it never nags, and
 * never shows on Android, desktop, or an already-installed PWA. The same visuals
 * live permanently in Profile → "Add to Home Screen" (components/profile/
 * InstallAppRow) so it's always re-findable.
 *
 * Reuses the shared AddToHomeScreenPrompt — the single source of the install copy,
 * also used by the notifications flow.
 */
export function InstallHomeScreenPopup() {
  const mounted = useMounted();
  const [closed, setClosed] = useState(false);

  function dismiss() {
    setDismissed();
    setClosed(true);
  }

  // Eligibility is computed during render (post-mount, so SSR stays deterministic
  // and there's no setState-in-effect) — capability + the one-time dismiss flag.
  if (!mounted) return null;
  const cap = getCapability();
  const eligible = cap.isIOS && !cap.isStandalone && !getDismissed();
  if (!eligible) return null;

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
