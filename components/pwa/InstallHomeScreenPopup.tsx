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
import { OpenInSafariPrompt } from "@/components/pwa/OpenInSafariPrompt";
import { useMounted } from "@/components/home/useMounted";
import { usePwaInstall } from "@/components/pwa/usePwaInstall";
import { getCapability } from "@/lib/push/pushService";

/**
 * "Add Trackd to your Home Screen" popup, shown on EVERY physical sign-in / sign-up
 * (Adrian's call). `freshSignIn` comes from the `trackd-install-hint` cookie the
 * auth callback sets; the cookie is consumed only on DISMISS (POST
 * /api/install-hint — a route handler, NOT a Server Action, so it can't trigger an
 * RSC refresh that would auto-drop the popup). A live-session reopen doesn't hit the
 * callback, so isn't nagged.
 *
 * Three platform paths (never on desktop or an already-installed standalone launch):
 *  - iPhone (Safari): manual Share-sheet steps (`AddToHomeScreenPrompt`) — iOS has
 *    no install API.
 *  - iPhone (non-Safari): Chrome/Firefox/Edge on iOS and in-app browsers (Gmail,
 *    Instagram) can't install a PWA at all, so we show "open in Safari" guidance
 *    (`OpenInSafariPrompt`) instead of dead-end Share steps. This is the common
 *    case right after a confirmation email opens the link in Chrome.
 *  - Android (Chrome/Samsung Internet): a single "Add to Home Screen" button that
 *    fires the OS's native install dialog via `beforeinstallprompt` (`usePwaInstall`),
 *    shown only when Chrome has actually offered an install (`canInstall`).
 */
export function InstallHomeScreenPopup({
  freshSignIn,
}: {
  freshSignIn: boolean;
}) {
  const mounted = useMounted();
  const { canInstall, promptInstall } = usePwaInstall();
  const [closed, setClosed] = useState(false);

  // Computed during render (post-mount, so SSR stays deterministic). getCapability
  // touches navigator/window, hence the gate.
  const cap = mounted ? getCapability() : null;
  const platform: "ios" | "ios-other" | "android" | null =
    cap === null || cap.isStandalone
      ? null
      : cap.isIOS
        ? cap.isIOSSafari
          ? "ios"
          : "ios-other"
        : canInstall
          ? "android"
          : null;

  function consume() {
    // Plain fetch (NOT a Server Action) so it can't trigger an RSC refresh.
    void fetch("/api/install-hint", { method: "POST", keepalive: true }).catch(
      () => {},
    );
  }
  function dismiss() {
    setClosed(true);
    consume();
  }
  async function install() {
    await promptInstall();
    dismiss();
  }

  if (!freshSignIn || platform === null) return null;

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
        <SheetTitle className="sr-only">Add Trackd to your Home Screen</SheetTitle>
        <SheetDescription className="sr-only">
          Install Trackd as an app on your Home Screen.
        </SheetDescription>

        {platform === "android" ? (
          <>
            <div className="rounded-2xl bg-bg-surface p-5">
              <p className="text-lg font-light tracking-[-0.02em] text-foreground">
                Add Trackd to your Home Screen
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-text-muted">
                Get the full app, not a browser tab — full-screen and one tap away.
              </p>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <Button
                type="button"
                onClick={install}
                className="h-11 flex-1 rounded-xl"
              >
                Add to Home Screen
              </Button>
              <button
                type="button"
                onClick={dismiss}
                className="px-3 text-sm text-text-muted transition-colors hover:text-foreground"
              >
                Not now
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Visible heading lives inside each prompt. Safari → Share-sheet steps;
                any other iOS browser → "open in Safari" (it can't install a PWA). */}
            {platform === "ios" ? <AddToHomeScreenPrompt /> : <OpenInSafariPrompt />}
            <Button
              type="button"
              onClick={dismiss}
              className="mt-4 h-11 w-full rounded-xl"
            >
              Got it
            </Button>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
