"use client";

import { useState } from "react";
import { Check, Compass, Copy, Share } from "lucide-react";

import { CARD_TITLE } from "@/lib/ui-presets";

/**
 * Shown when the user is on iOS but NOT in Safari — Chrome/Firefox/Edge on iPhone,
 * or an in-app browser like Gmail's or Instagram's. Those all report `isIOS` yet
 * CANNOT add a PWA to the Home Screen (only Safari can on iOS), so the Share-sheet
 * steps would be a dead end. This tells them to reopen the app in Safari instead.
 *
 * The common trigger: a confirmation email opens the link in Chrome, signs the
 * user in fine, but they can't install from there — this unblocks that.
 *
 * NOTE on spacing: bold <span>s are followed by an explicit {" "} so the space
 * survives JSX whitespace collapsing (same convention as AddToHomeScreenPrompt).
 */
export function OpenInSafariPrompt() {
  const [copied, setCopied] = useState(false);

  const host =
    typeof window !== "undefined" ? window.location.host : "trackdco.app";

  async function copyLink() {
    const url =
      typeof window !== "undefined"
        ? window.location.origin
        : "https://trackdco.app";
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (rare) — the address is shown above to type by hand.
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-bg-surface p-5">
      <p className={CARD_TITLE}>Open in Safari to install</p>
      <p className="mt-1.5 text-sm leading-relaxed text-text-muted">
        Adding Trackd to your Home Screen only works in Safari on iPhone — not this
        browser. Here&apos;s how:
      </p>
      <ol className="mt-4 space-y-3">
        <li className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-bg-surface-raised text-accent-amber">
            <Compass className="size-5" aria-hidden="true" />
          </span>
          <span className="text-sm leading-snug text-text-muted">
            Open <span className="text-foreground">Safari</span> and go to{" "}
            <span className="text-foreground">{host}</span>, then sign in.
          </span>
        </li>
        <li className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-bg-surface-raised text-accent-amber">
            <Share className="size-5" aria-hidden="true" />
          </span>
          <span className="text-sm leading-snug text-text-muted">
            Tap the <span className="text-foreground">Share</span> button, then{" "}
            <span className="text-foreground">Add to Home Screen</span>.
          </span>
        </li>
      </ol>
      <button
        type="button"
        onClick={copyLink}
        className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border-default text-sm text-foreground outline-none transition-colors hover:bg-bg-surface-raised focus-visible:ring-2 focus-visible:ring-ring"
      >
        {copied ? (
          <Check className="size-4" aria-hidden="true" />
        ) : (
          <Copy className="size-4" aria-hidden="true" />
        )}
        {copied ? "Link copied" : `Copy link (${host})`}
      </button>
    </div>
  );
}
