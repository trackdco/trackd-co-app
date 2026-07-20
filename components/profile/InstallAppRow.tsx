"use client";

import { useState } from "react";
import { CaretRight, DeviceMobile } from "@/components/icons";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { AddToHomeScreenPrompt } from "@/components/push/AddToHomeScreenPrompt";
import { OpenInSafariPrompt } from "@/components/pwa/OpenInSafariPrompt";
import { useMounted } from "@/components/home/useMounted";
import { usePwaInstall } from "@/components/pwa/usePwaInstall";
import { getCapability } from "@/lib/push/pushService";

/**
 * Profile → App row to install Trackd, platform-aware and self-hiding:
 *  - **Already on the Home Screen** (running standalone): the row is REMOVED — no
 *    point telling someone who's in the installed app to install it. (It renders
 *    its OWN leading divider, so when it returns null the list closes up cleanly —
 *    the page drops the divider that used to precede it.)
 *  - **iPhone (Safari):** opens the manual Share-sheet steps (`AddToHomeScreenPrompt`).
 *  - **iPhone (non-Safari):** Chrome/Firefox/Edge on iOS and in-app browsers can't
 *    install a PWA, so the sheet shows "open in Safari" guidance (`OpenInSafariPrompt`).
 *  - **Android (Chrome/Samsung Internet):** one tap fires the OS's native install
 *    dialog (`usePwaInstall`); shown only when an install is actually on offer
 *    (`canInstall` — which is also false once it's installed, so the row hides).
 */
export function InstallAppRow() {
  const mounted = useMounted();
  const { canInstall, promptInstall } = usePwaInstall();
  const [sheetOpen, setSheetOpen] = useState(false);

  const cap = mounted ? getCapability() : null;
  const mode: "ios" | "ios-other" | "android" | null =
    cap === null || cap.isStandalone
      ? null
      : cap.isIOS
        ? cap.isIOSSafari
          ? "ios"
          : "ios-other"
        : canInstall
          ? "android"
          : null;

  if (mode === null) return null;

  function onClick() {
    if (mode === "android") void promptInstall();
    else setSheetOpen(true);
  }

  return (
    <>
      {/* Own leading divider so the row self-contains: when it returns null the page
          has no stray divider (the page drops the one that used to precede it). */}
      <div className="mx-4 border-t border-border-default" aria-hidden />
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left outline-none transition-colors hover:bg-bg-surface-raised active:bg-bg-surface-raised focus-visible:bg-bg-surface-raised focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        <DeviceMobile className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
        <span className="flex-1 text-sm text-foreground">Add to Home Screen</span>
        <CaretRight className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
      </button>

      {(mode === "ios" || mode === "ios-other") && (
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent
            side="bottom"
            className="gap-0 rounded-t-3xl border-border-default bg-bg-surface px-5 pt-6 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]"
          >
            <SheetTitle className="sr-only">Add Trackd to your Home Screen</SheetTitle>
            <SheetDescription className="sr-only">
              How to install Trackd as an app on your iPhone Home Screen.
            </SheetDescription>
            {mode === "ios" ? <AddToHomeScreenPrompt /> : <OpenInSafariPrompt />}
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}
