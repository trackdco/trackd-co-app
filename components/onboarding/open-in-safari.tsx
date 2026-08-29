"use client";

import { useCallback, useState } from "react";

import { Check, Copy } from "@/components/icons";
import { cn } from "@/lib/utils";

/**
 * ⚠️ THERE IS NO "OPEN IN SAFARI" BUTTON HERE, AND THAT IS THE POINT.
 *
 * There was one. It navigated to `x-safari-https://…`, which opens Safari when
 * you type it into an address bar — Adrian confirmed that much — but NOT when a
 * page assigns it to `location.href`. Chrome kept the navigation for itself, so
 * the button quietly did the wrong thing twice:
 *
 *   "when I press Open in Safari, it just takes me to the Trackd dashboard"
 *   "it keeps opening in Google, not in Safari"
 *
 * His call, and the right one: *"we don't want to give people [a button] that
 * doesn't work."* A control that silently fails is worse than no control,
 * because the person concludes the app is broken rather than trying the route
 * that does work.
 *
 * ## What works instead
 *
 * Chrome's OWN share sheet has an "Open in Safari" row, and it carries the
 * exact URL across WITH the session — Adrian: *"it takes you exactly straight
 * to the page that you were on. You're already signed in."* That is one tap,
 * needs nothing from us, and is what the steps now teach.
 *
 * The copy button stays as the fallback for anyone who cannot find that row.
 */
export function OpenInSafari({ className }: { className?: string }) {
  const [copied, setCopied] = useState(false);

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked. The address is in the bar above to type by
      // hand, which is where this started, so failing here loses nothing.
    }
  }, []);

  return (
    <button
      type="button"
      onClick={copyLink}
      className={cn(
        "flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border-default text-[0.88rem] text-text-muted transition-colors hover:bg-bg-surface focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        className,
      )}
    >
      {copied ? (
        <Check className="size-4" aria-hidden="true" />
      ) : (
        <Copy className="size-4" aria-hidden="true" />
      )}
      {copied ? "Link copied" : "Copy the link instead"}
    </button>
  );
}
