"use client";

import { useCallback, useState } from "react";

import { Check, Copy } from "@/components/icons";
import { cn } from "@/lib/utils";

/**
 * Getting somebody from Chrome on iPhone into Safari (Adrian, 2026-08-29).
 *
 * The install step told them to "copy this page's address" and then gave them
 * nothing to copy it with, so the fix was a manual URL selection in an address
 * bar, mid-signup, on a phone. `OpenInSafariPrompt` on the dashboard already
 * had a copy button; the harder version was the one people hit FIRST.
 *
 * ## Two buttons, because neither is reliable alone
 *
 * **`x-safari-https://`** opens Safari regardless of the default browser, and
 * Adrian confirmed it works on his handset. But Apple has never documented it,
 * it stopped working entirely on iOS 16, and there is no supported API that
 * guarantees opening Safari — Apple does not want apps overriding the default
 * browser. So it is offered, and it can NEVER be the only way across.
 *
 * ⚠️ A FAILED SCHEME NAVIGATION IS SILENT. The page simply stays put; there is
 * no error and nothing to catch. So the copy button is not a fallback that
 * appears after a failure — it is always visible, because a failure looks
 * exactly like nothing happening.
 */
export function OpenInSafari({ className }: { className?: string }) {
  const [copied, setCopied] = useState(false);

  /**
   * ⚠️ SAFARI STARTS SIGNED OUT, so the destination has to be carried.
   *
   * Chrome and Safari are separate apps with separate cookie jars. Handing
   * Safari `/onboarding?step=install` means an authed step with no session, and
   * the guard sends them to the START of onboarding — which is what Adrian hit:
   * "when I press Open in Safari, it takes me to the very start."
   *
   * So it hands over `/login?next=/onboarding?step=install` instead, through
   * the `?next=` thread `safeNextPath` already validates. They sign in once in
   * Safari and land back on this step rather than at the beginning.
   *
   * This is a floor, not the finish. Signing in a second time at all is the
   * thing worth removing, and that needs a one-time token on the link.
   */
  const handoff = () => {
    const next = encodeURIComponent("/onboarding?step=install");
    return `${window.location.host}/login?next=${next}`;
  };

  const openSafari = useCallback(() => {
    window.location.href = `x-safari-https://${handoff()}`;
  }, []);

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(`https://${handoff()}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked. The address is on screen above to type by
      // hand, which is where this started, so failing here loses nothing.
    }
  }, []);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <button
        type="button"
        onClick={openSafari}
        className="flex h-12 w-full items-center justify-center rounded-xl bg-bg-surface-raised text-[0.92rem] font-medium text-foreground transition-colors hover:bg-bg-input focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        Open in Safari
      </button>
      <button
        type="button"
        onClick={copyLink}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border-default text-[0.88rem] text-text-muted transition-colors hover:bg-bg-surface focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {copied ? (
          <Check className="size-4" aria-hidden="true" />
        ) : (
          <Copy className="size-4" aria-hidden="true" />
        )}
        {copied ? "Link copied" : "Copy the link instead"}
      </button>
    </div>
  );
}
