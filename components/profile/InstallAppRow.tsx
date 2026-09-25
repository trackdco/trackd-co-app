"use client";

import { useState } from "react";
import { CaretRight, DeviceMobile } from "@/components/icons";

import { BottomSheet } from "@/components/layout/BottomSheet";
import { AddToHomeScreenPrompt } from "@/components/push/AddToHomeScreenPrompt";
import { PhoneHandoffPrompt } from "@/components/desktop/PhoneHandoffPrompt";
import { useIsDesktop } from "@/lib/desktop/breakpoint";
import { OpenInSafariPrompt } from "@/components/pwa/OpenInSafariPrompt";
import { useMounted } from "@/components/home/useMounted";
import { usePwaInstall } from "@/components/pwa/usePwaInstall";
import { getCapability } from "@/lib/push/pushService";
import { PRESS, ROW_CHEVRON } from "@/lib/ui-presets";
import { cn } from "@/lib/utils";

/**
 * Profile → App row to install Trakabl, platform-aware and self-hiding:
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
 *  - **Laptop or desktop:** a QR code to scan with your phone. This is where the
 *    retired desktop interstitial's one genuinely useful part ended up (Adrian,
 *    2026-09-10). The app runs perfectly well on a laptop now, so this is no
 *    longer a wall telling you to go away; it is an offer, on the settings screen
 *    where somebody would go looking for it. The row reads "Get it on your
 *    phone", not "Add to Home Screen", because that is the true instruction when
 *    the Home Screen in question is not this device's.
 *
 * The desktop test runs FIRST and short-circuits, because a touchscreen Windows
 * laptop can satisfy both this and the Android branch, and firing Chrome's
 * install dialog for a desktop PWA is not what "add to home screen" means to
 * somebody sitting at a desk.
 */
export function InstallAppRow() {
  const mounted = useMounted();
  const { canInstall, promptInstall } = usePwaInstall();
  const [sheetOpen, setSheetOpen] = useState(false);

  const isDesktop = useIsDesktop();

  const cap = mounted ? getCapability() : null;
  const mode: "ios" | "ios-other" | "android" | "desktop" | null =
    cap === null || cap.isStandalone
      ? null
      : isDesktop
        ? "desktop"
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
      <div className="mx-4 hairline-t" aria-hidden />
      <button
        type="button"
        onClick={onClick}
        className={cn(
          PRESS.row,
          "flex w-full items-center gap-3 px-4 py-3.5 text-left outline-none transition-colors hover:bg-bg-surface-raised focus-visible:bg-bg-surface-raised focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        )}
      >
        <DeviceMobile className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
        <span className="flex-1 text-sm text-foreground">
          {mode === "desktop" ? "Get it on your phone" : "Add to Home Screen"}
        </span>
        <CaretRight className={ROW_CHEVRON} aria-hidden />
      </button>

      {/* THE ONE SHEET FRAME (consistency fix #1): a handle to drag down, no
          ×. The prompts carry their own headings, so the title is for screen
          readers. */}
      {mode === "desktop" && (
        <BottomSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          title="Get Trakabl on your phone"
          hideTitle
          description="Scan this code with your phone camera to open Trakabl there."
        >
          <PhoneHandoffPrompt />
        </BottomSheet>
      )}

      {(mode === "ios" || mode === "ios-other") && (
        <BottomSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          title="Add Trakabl to your Home Screen"
          hideTitle
          description="How to install Trakabl as an app on your iPhone Home Screen."
        >
          {mode === "ios" ? <AddToHomeScreenPrompt /> : <OpenInSafariPrompt />}
        </BottomSheet>
      )}
    </>
  );
}
