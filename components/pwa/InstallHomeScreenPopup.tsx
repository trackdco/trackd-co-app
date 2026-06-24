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

/**
 * "Add Trackd to your Home Screen" popup, shown on EVERY physical sign-in / sign-up
 * (Adrian's call). `freshSignIn` comes from the `trackd-install-hint` cookie the
 * auth callback sets, so it only fires on an actual sign-in (a returning user
 * reopening the app with a live session doesn't hit the callback, so isn't nagged).
 *
 * The cookie is consumed only on DISMISS (via a POST to /api/install-hint), NOT on
 * show — clearing on show let any post-load RSC refresh re-read `freshSignIn=false`
 * and auto-drop the popup. Now it stays until the user closes it, then won't return
 * until the next sign-in. Gated to iPhone + Safari (not standalone); the copy is
 * iOS-specific and there's nothing to install when already in the standalone app.
 * The same visuals live permanently in Profile → "Add to Home Screen".
 */
export function InstallHomeScreenPopup({
  freshSignIn,
}: {
  freshSignIn: boolean;
}) {
  const mounted = useMounted();
  const [closed, setClosed] = useState(false);

  // Computed during render (post-mount, so SSR stays deterministic — no
  // setState-in-effect). getCapability touches navigator/window, hence the gate.
  const cap = mounted ? getCapability() : null;
  const eligible =
    mounted && cap !== null && freshSignIn && cap.isIOS && !cap.isStandalone;

  function dismiss() {
    setClosed(true);
    // Consume the one-shot hint via a plain fetch (NOT a Server Action, so it can't
    // trigger an RSC refresh) so it won't reappear until the next sign-in.
    void fetch("/api/install-hint", { method: "POST", keepalive: true }).catch(
      () => {},
    );
  }

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
        <Button
          type="button"
          onClick={dismiss}
          className="mt-4 h-11 w-full rounded-xl"
        >
          Got it
        </Button>
      </SheetContent>
    </Sheet>
  );
}
