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
import { useIsDesktop } from "@/lib/desktop/breakpoint";

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
  const isDesktop = useIsDesktop();

  const cap = mounted ? getCapability() : null;
  const platform: "ios" | "ios-other" | "android" | null =
    cap === null || cap.isStandalone
      ? null
      : // NOTHING ON A COMPUTER. This test runs FIRST and short-circuits.
        //
        // The sibling `components/profile/InstallAppRow.tsx` grew this guard
        // when the app gained a desktop layout, and this popup did not, so a
        // laptop still met "Add Trackd to your Home Screen" on the dashboard
        // immediately after an onboarding that had just decided it had no home
        // screen to add anything to. On desktop Chrome `cap.isIOS` is false and
        // `beforeinstallprompt` does fire (the manifest qualifies), so it fell
        // straight through to the "android" branch.
        //
        // The behaviour predates the desktop branch: `guessPlatform` used to
        // answer "ios" for a MacBook, so this popup reached laptops before too,
        // over the interstitial that used to stand there. It is fixed here
        // because desktop is now a real surface and because two install
        // surfaces disagreeing is the kind of thing nobody finds twice.
        //
        // Offering the desktop PWA install is a separate decision, and it is
        // parked: `app/manifest.ts` still declares `orientation: "portrait"`.
        isDesktop
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
        data-desktop="dialog"
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
                Get the full app, not a browser tab. Full-screen and one tap away.
              </p>
            </div>
            {/* The actions rise in as the sheet lands (feel pass §4); the
                heading above lands with it. */}
            <div data-sheet-body>
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
            </div>
          </>
        ) : (
          <>
            {/* Visible heading lives inside each prompt. Safari → Share-sheet steps;
                any other iOS browser → "open in Safari" (it can't install a PWA). */}
            {platform === "ios" ? <AddToHomeScreenPrompt /> : <OpenInSafariPrompt />}
            {/* The prompt carries its own heading and steps, so only the action
                below it rises (feel pass §4). */}
            <div data-sheet-body>
              <div>
                <Button
                  type="button"
                  onClick={dismiss}
                  className="mt-4 h-11 w-full rounded-xl"
                >
                  Got it
                </Button>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
