"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Download, Plus, Share, X } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Minimal version of the Chrome "beforeinstallprompt" event we capture.
 */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "trackd:install-prompt-dismissed";

type Platform =
  | "android" // Chrome/Android: real one-tap install via beforeinstallprompt
  | "ios-safari" // iOS Safari: no install API exists — guide the Share flow
  | "ios-other"; // iOS Chrome/Firefox/etc: Add to Home Screen only works in Safari

/**
 * "Add to Home Screen" prompt shown post sign-in on the dashboard.
 *
 * Goal: the fewest taps each platform allows.
 *  - Android/Chrome fires `beforeinstallprompt` -> we show ONE button that opens
 *    the native install dialog (the platform minimum).
 *  - iOS Safari has NO install API (Apple); the Share -> Add to Home Screen taps
 *    are Apple's and can't be skipped, so we add no dead button — just an
 *    auto-shown, visually guided card (Share icon + animated arrow) so there's
 *    no fumbling.
 *  - iOS in a non-Safari browser can't Add to Home Screen at all, so we don't
 *    show steps that can't work — we point them to Safari instead.
 *
 * Hidden when already running as an installed PWA, or once dismissed
 * (remembered in localStorage).
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null,
  );
  const [platform, setPlatform] = useState<Platform | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone ===
        true;
    if (isStandalone) return;

    if (window.localStorage.getItem(DISMISS_KEY) === "1") return;

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setPlatform("android");
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    const onInstalled = () => {
      setPlatform(null);
      setDeferred(null);
    };
    window.addEventListener("appinstalled", onInstalled);

    // iOS has no beforeinstallprompt. Detect it (incl. iPadOS, which reports as
    // a desktop Mac but has touch) and split Safari from other iOS browsers —
    // only Safari can Add to Home Screen. Deferred to after paint so the
    // server/first-client render match (both start as null).
    const ua = window.navigator.userAgent;
    const isIos =
      /iphone|ipad|ipod/i.test(ua) ||
      (window.navigator.platform === "MacIntel" &&
        window.navigator.maxTouchPoints > 1);
    let raf = 0;
    if (isIos) {
      // Chrome (CriOS), Firefox (FxiOS), Edge (EdgiOS), Opera (OPiOS) etc. embed
      // their token in the UA; plain Safari does not. Anything else -> Safari.
      const isOtherBrowser = /crios|fxios|edgios|opios|mercury/i.test(ua);
      raf = window.requestAnimationFrame(() =>
        setPlatform(isOtherBrowser ? "ios-other" : "ios-safari"),
      );
    }

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  function dismiss() {
    window.localStorage.setItem(DISMISS_KEY, "1");
    setPlatform(null);
    setDeferred(null);
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    dismiss();
  }

  if (!platform) return null;

  return (
    <div className="relative mt-8 rounded-2xl border border-border bg-bg-surface p-5">
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute right-3 top-3 p-1 text-text-subtle transition-colors hover:text-text-muted"
      >
        <X className="size-4" aria-hidden="true" />
      </button>

      <p className="font-display text-lg text-foreground">Install Trackd</p>

      {platform === "android" && (
        <>
          <p className="mt-1.5 text-sm leading-relaxed text-text-muted">
            Add Trackd to your home screen for a full-screen, app-like
            experience.
          </p>
          {/* The platform minimum: one tap opens the native install dialog. */}
          <Button
            type="button"
            onClick={install}
            className="mt-4 h-11 w-full rounded-xl"
          >
            <Download className="size-5" aria-hidden="true" />
            Add to home screen
          </Button>
        </>
      )}

      {platform === "ios-safari" && (
        <>
          <p className="mt-1.5 text-sm leading-relaxed text-text-muted">
            Two quick taps and Trackd lives on your home screen.
          </p>
          {/* No button — iOS gives a website no way to open the Add to Home
              Screen sheet, so we just make Apple's two taps unmistakable. */}
          <ol className="mt-4 space-y-3">
            <li className="flex items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-bg-surface-raised text-accent-amber">
                <Share className="size-5" aria-hidden="true" />
              </span>
              <span className="text-sm leading-snug text-text-muted">
                Tap the <span className="text-foreground">Share</span> button in
                the toolbar below
              </span>
            </li>
            <li className="flex items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-bg-surface-raised text-accent-amber">
                <Plus className="size-5" aria-hidden="true" />
              </span>
              <span className="text-sm leading-snug text-text-muted">
                Choose{" "}
                <span className="text-foreground">Add to Home Screen</span>
              </span>
            </li>
          </ol>
          <div className="mt-3 flex justify-center" aria-hidden="true">
            <ChevronDown className="size-5 animate-bounce text-text-subtle" />
          </div>
        </>
      )}

      {platform === "ios-other" && (
        <p className="mt-1.5 text-sm leading-relaxed text-text-muted">
          Open <span className="text-foreground">trackdco.app</span> in{" "}
          <span className="text-foreground">Safari</span> to add Trackd to your
          home screen — other browsers can&apos;t install it.
        </p>
      )}
    </div>
  );
}
