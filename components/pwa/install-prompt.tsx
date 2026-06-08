"use client";

import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Minimal version of the Chrome "beforeinstallprompt" event we capture.
 */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "trackd:install-prompt-dismissed";

/**
 * "Add to Home Screen" prompt shown post sign-in on the dashboard.
 *
 * Android/Chrome fires `beforeinstallprompt`, which we defer and trigger from a
 * button. iOS Safari has no such event, so we detect it and show the manual
 * Share -> Add to Home Screen steps instead. Hidden when already running as an
 * installed PWA, or once the user dismisses it (remembered in localStorage).
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null,
  );
  const [platform, setPlatform] = useState<"android" | "ios" | null>(null);

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

    // iOS Safari has no beforeinstallprompt event. Detect it and show the manual
    // steps — deferred to after paint so we don't setState synchronously in the
    // effect (and so the server/first-client render match: both start as null).
    let raf = 0;
    if (/iphone|ipad|ipod/i.test(window.navigator.userAgent)) {
      raf = window.requestAnimationFrame(() => setPlatform("ios"));
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

      {platform === "android" ? (
        <>
          <p className="mt-1.5 text-sm leading-relaxed text-text-muted">
            Add Trackd to your home screen for a full-screen, app-like
            experience.
          </p>
          <Button
            type="button"
            onClick={install}
            className="mt-4 h-11 w-full rounded-xl"
          >
            <Download className="size-5" aria-hidden="true" />
            Add to home screen
          </Button>
        </>
      ) : (
        <p className="mt-1.5 text-sm leading-relaxed text-text-muted">
          Add Trackd to your home screen: tap the Share button{" "}
          <Share className="inline size-4 -translate-y-0.5" aria-hidden="true" />{" "}
          in Safari, then choose{" "}
          <span className="text-foreground">Add to Home Screen</span>.
        </p>
      )}
    </div>
  );
}
