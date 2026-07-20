"use client";

import { useEffect, useState } from "react";
import { Compass, Download, X } from "@/components/icons";

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
  | "android" // Chromium: real one-tap native install (beforeinstallprompt)
  | "ios-safari" // iOS Safari: guide the manual Share -> Add to Home Screen
  | "ios-open-in-safari"; // iOS in-app webview / non-Safari browser: install impossible here

/**
 * "Add to Home Screen" prompt shown post sign-in on the dashboard.
 *
 * iOS gives a website NO way to trigger or shortcut the install (no
 * `beforeinstallprompt`, and `navigator.share()` opens a sheet that does not
 * contain "Add to Home Screen"). So we cannot cut taps on iOS — we can only
 * raise the share of people who finish:
 *  - Android/Chromium: one real one-tap install button.
 *  - iOS Safari: clear, well-timed Share -> Add to Home Screen steps. iOS 26's
 *    Compact Safari hides Share inside the "..." menu, so we say so rather than
 *    point a (now often wrong) arrow at the toolbar.
 *  - iOS inside an in-app browser (Instagram/TikTok/Facebook…) or a non-Safari
 *    browser (Chrome/Firefox/Edge): "Add to Home Screen" doesn't exist there at
 *    all, so we don't show steps that can't work — we tell them to open in
 *    Safari first (rescues social-link traffic that would otherwise dead-end).
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

    // iOS has no install API. Detect it (incl. iPadOS, which reports as a
    // desktop Mac but has touch), then work out whether Add to Home Screen is
    // even reachable: it ONLY works in real Safari. Deferred to after paint so
    // the server/first-client render match (both start as null).
    const ua = window.navigator.userAgent;
    const isIos =
      /iphone|ipad|ipod/i.test(ua) ||
      (window.navigator.platform === "MacIntel" &&
        window.navigator.maxTouchPoints > 1);

    let raf = 0;
    if (isIos) {
      // Non-Safari iOS browsers carry their own UA token (CriOS=Chrome,
      // FxiOS=Firefox, EdgiOS=Edge, OPiOS=Opera, GSA=Google app).
      const isOtherBrowser = /crios|fxios|edgios|opios|gsa|mercury/i.test(ua);
      // In-app webviews either name themselves or — being WKWebViews — omit
      // the "Safari" token that real Safari always includes.
      const isInAppWebview =
        /instagram|fbav|fban|fbios|fb_iab|musical_ly|bytedance|tiktok|barcelona|linkedinapp|twitter|snapchat|pinterest|line\//i.test(
          ua,
        ) || !/safari/i.test(ua);
      raf = window.requestAnimationFrame(() =>
        setPlatform(
          isOtherBrowser || isInAppWebview ? "ios-open-in-safari" : "ios-safari",
        ),
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
    <div className="relative mt-8 rounded-2xl bg-bg-surface p-5">
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute right-3 top-3 p-1 text-text-subtle transition-colors hover:text-text-muted"
      >
        <X className="size-4" aria-hidden="true" />
      </button>

      <p className="text-lg font-light tracking-[-0.02em] text-foreground">
        Install Trackd
      </p>

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
            Add Trackd to your home screen for a full-screen, app-like
            experience.
          </p>
          <ol className="mt-4 space-y-3">
            <li className="flex items-start gap-3">
              <span className="mt-0.5 w-4 shrink-0 text-center font-mono text-xs tabular-nums text-text-subtle">
                1
              </span>
              <span className="text-sm leading-snug text-text-muted">
                Tap the{" "}
                <span className="text-foreground">Share</span>{" "}
                button — on newer iPhones it&apos;s inside the{" "}
                <span className="text-foreground">•••</span>{" "}
                menu
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 w-4 shrink-0 text-center font-mono text-xs tabular-nums text-text-subtle">
                2
              </span>
              <span className="text-sm leading-snug text-text-muted">
                Scroll down and choose{" "}
                <span className="text-foreground">Add to Home Screen</span>{" "}
                — tap{" "}
                <span className="text-foreground">View More</span>{" "}
                if you don&apos;t see it
              </span>
            </li>
          </ol>
        </>
      )}

      {platform === "ios-open-in-safari" && (
        <>
          <p className="mt-1.5 text-sm leading-relaxed text-text-muted">
            You&apos;re viewing Trackd inside another app. To install it, open it
            in Safari first.
          </p>
          <div className="mt-4 flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center text-text-muted">
              <Compass className="size-5" aria-hidden="true" />
            </span>
            <span className="text-sm leading-snug text-text-muted">
              Tap this app&apos;s{" "}
              <span className="text-foreground">•••</span>{" "}
              (or share) menu and choose{" "}
              <span className="text-foreground">Open in Safari</span>{" "}
              — then add Trackd to your home screen from there.
            </span>
          </div>
        </>
      )}
    </div>
  );
}
