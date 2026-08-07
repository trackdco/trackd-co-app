"use client";

import Image from "next/image";

import type { Platform } from "@/lib/onboarding/platform";
import { cn } from "@/lib/utils";

/**
 * The OS PERMISSION PROMPT, drawn as the user's phone draws it (Adrian,
 * 2026-08-01: "the actual, like, when it says Trackd would like to send you
 * notifications").
 *
 * Showing a sample notification was answering a different question. What the
 * user is about to be asked is whether to grant permission, so the screen
 * should show them that dialog: they recognise it, they know exactly which
 * button they are being asked to press, and the real one landing a second later
 * is then familiar rather than a surprise.
 *
 * iOS and Android word and lay this out differently enough that one card cannot
 * pass for both, so there are two. Copy is Apple's and Google's own, because
 * the whole point is recognition.
 *
 * Entirely decorative: `aria-hidden` chrome with one label on the wrapper, so a
 * screen reader hears what it is and not the furniture.
 *
 * ## It is TAPPABLE (Adrian, on his phone, 2026-08-05)
 *
 * It draws a dialog with an Allow button in it, so people press the Allow
 * button. That is not a misread of the screen — it is the screen working — and
 * a picture of a control that does nothing when you press it is worse than no
 * picture. Tapping anywhere on the card now runs the same request the footer
 * CTA runs; `onActivate` is that one handler passed down, never a second copy
 * of the permission logic, so the caller's "only once" latch covers both.
 *
 * NOT in the tab order and still `aria-hidden`. It is a convenience for a
 * thumb that is already on the card; the footer CTA is the labelled control and
 * is always present, so putting a second identically-named button in front of a
 * screen reader would add noise and no capability.
 */

const APP = "Trackd";

export function NotificationMock({
  platform,
  onActivate,
}: {
  platform: Platform;
  /** Runs the real permission request. Omit and the card is inert. */
  onActivate?: () => void;
}) {
  const art = platform === "ios" ? <IosPrompt /> : <AndroidPrompt />;

  if (!onActivate) {
    return (
      <div
        role="img"
        aria-label={`Example of the permission prompt: ${APP} would like to send you notifications`}
        // Fades and rises into place, which is what Adrian asked for and also
        // roughly how the real dialog arrives.
        className="animate-flow-in"
      >
        {art}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onActivate}
      tabIndex={-1}
      aria-hidden
      // `block w-full` so the card keeps the width it had as a div; a button
      // shrink-wraps its content otherwise and the mock stopped being centred.
      className="animate-flow-in block w-full cursor-pointer text-left"
    >
      {art}
    </button>
  );
}

/**
 * iOS: a centred alert, title and body stacked and centred, then two equal
 * buttons side by side divided by hairlines. "Allow" is the emphasised one.
 */
function IosPrompt() {
  return (
    <div
      aria-hidden
      className="mx-auto w-full max-w-[17rem] overflow-hidden rounded-[0.875rem] bg-bg-surface-raised/95 backdrop-blur-xl shadow-[0_20px_50px_-18px_rgb(0_0_0/0.95)]"
    >
      <div className="px-4 pb-4 pt-5 text-center">
        <Image
          src="/icon-192.png"
          alt=""
          width={192}
          height={192}
          priority
          className="mx-auto mb-3 h-[42px] w-[42px] rounded-[9px]"
        />
        <p className="text-[15px] font-medium leading-tight text-foreground">
          &ldquo;{APP}&rdquo; Would Like to Send You Notifications
        </p>
        <p className="mt-1.5 text-[12px] leading-[1.35] text-text-muted">
          Notifications may include alerts, sounds and icon badges. These can be
          configured in Settings.
        </p>
      </div>

      <div className="grid grid-cols-2 border-t-[0.5px] border-border-strong">
        <span className="border-r-[0.5px] border-border-strong py-2.5 text-center text-[15px] text-text-muted">
          Don&apos;t Allow
        </span>
        <span className="py-2.5 text-center text-[15px] font-medium text-foreground">
          Allow
        </span>
      </div>
    </div>
  );
}

/**
 * Android / One UI: a squarer sheet, left-aligned, with the actions ranged
 * right and no dividers.
 */
function AndroidPrompt() {
  return (
    <div
      aria-hidden
      className="mx-auto w-full max-w-[17rem] rounded-[1.75rem] bg-bg-surface-raised px-6 pb-4 pt-6 shadow-[0_20px_50px_-18px_rgb(0_0_0/0.95)]"
    >
      <Image
        src="/icon-192.png"
        alt=""
        width={192}
        height={192}
        priority
        className="mx-auto mb-4 h-[40px] w-[40px] rounded-full"
      />
      <p className="text-center text-[16px] leading-snug text-foreground">
        Allow {APP} to send you notifications?
      </p>

      <div className="mt-6 flex items-center justify-end gap-6 pb-1">
        <span className="text-[14px] font-medium text-text-muted">
          Don&apos;t allow
        </span>
        <span className={cn("text-[14px] font-medium text-accent-amber")}>
          Allow
        </span>
      </div>
    </div>
  );
}
