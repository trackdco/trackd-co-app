"use client";

import { useEffect, useRef, useState } from "react";

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
import { clearInstallHint } from "@/lib/pwa/installActions";

/**
 * "Add Trackd to your Home Screen" popup, shown on EVERY physical sign-in / sign-up
 * (Adrian's call) — not once per account. `freshSignIn` comes from the
 * `trackd-install-hint` cookie the auth callback sets, so it only fires when the
 * user actually signs in (a returning user reopening the app with a live session
 * doesn't hit the callback and so doesn't get nagged). On show it clears that
 * cookie so it appears once per login, then returns on the next sign-in.
 *
 * Still gated to iPhone + Safari (not standalone) — the copy is iOS-specific and
 * there's nothing to install in the standalone app — and suppressed once we've seen
 * the app run installed (`installed`, from profiles.pwa_installed_at), so people who
 * already added it aren't told to again. The same visuals live permanently in
 * Profile → "Add to Home Screen".
 */
export function InstallHomeScreenPopup({
  freshSignIn,
  installed,
}: {
  freshSignIn: boolean;
  installed: boolean;
}) {
  const mounted = useMounted();
  const [closed, setClosed] = useState(false);

  // Computed during render (post-mount, so SSR stays deterministic — no
  // setState-in-effect). getCapability touches navigator/window, hence the gate.
  const cap = mounted ? getCapability() : null;
  const eligible =
    mounted &&
    cap !== null &&
    freshSignIn &&
    !installed &&
    cap.isIOS &&
    !cap.isStandalone;

  // Clear the one-shot hint as soon as we show it (a side effect to the cookie, not
  // React state) so it doesn't reappear on later navigations this session.
  const clearedRef = useRef(false);
  useEffect(() => {
    if (eligible && !clearedRef.current) {
      clearedRef.current = true;
      void clearInstallHint();
    }
  }, [eligible]);

  if (!eligible) return null;

  return (
    <Sheet
      open={!closed}
      onOpenChange={(o) => {
        if (!o) setClosed(true);
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
        <Button
          type="button"
          onClick={() => setClosed(true)}
          className="mt-4 h-11 w-full rounded-xl"
        >
          Got it
        </Button>
      </SheetContent>
    </Sheet>
  );
}
