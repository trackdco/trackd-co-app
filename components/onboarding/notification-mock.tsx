"use client";

import Image from "next/image";

import type { Platform } from "@/lib/onboarding/platform";
import { cn } from "@/lib/utils";

/**
 * A sample push notification drawn as THE USER'S OS DRAWS IT (Adrian,
 * 2026-07-31: "it should have that exact same look to it").
 *
 * A generic card here is a wasted screen: the whole point is to show them the
 * thing they are about to say yes to, so it has to be recognisable as their
 * own notification shade. iOS and Android lay these out differently enough
 * that one card cannot pass for both.
 *
 * Both are decorative. `aria-hidden` on the chrome, with the content exposed
 * once through a label on the wrapper, so a screen reader hears the message and
 * not the furniture.
 *
 * Uses the real app icon (`/icon-192.png`), which is the same one that would
 * actually appear.
 */

const TITLE = "Due today: Test E";
const BODY = "0.5 mL";

export function NotificationMock({ platform }: { platform: Platform }) {
  return (
    <div
      role="img"
      aria-label={`Example notification: Trackd, ${TITLE}, ${BODY}`}
      className="animate-flow-in"
    >
      {platform === "ios" ? <IosNotification /> : <AndroidNotification />}
    </div>
  );
}

/**
 * iOS: a heavily rounded, translucent card. App icon top-left at ~20px, app
 * name in caps-ish small text beside it, timestamp right-aligned on the same
 * line, then a bold title and a regular body beneath.
 */
function IosNotification() {
  return (
    <div
      aria-hidden
      className={cn(
        "rounded-[1.375rem] px-3.5 py-3",
        // The frosted look, in our own tokens rather than an iOS grey.
        "bg-bg-surface-raised/80 backdrop-blur-xl",
        "shadow-[0_8px_28px_-12px_rgba(0,0,0,0.7)]",
      )}
    >
      <div className="flex items-start gap-2.5">
        <Image
          src="/icon-192.png"
          alt=""
          width={192}
          height={192}
          priority
          className="mt-[1px] h-[22px] w-[22px] shrink-0 rounded-[6px]"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-[13px] font-medium leading-none text-foreground">
              Trackd
            </span>
            <span className="shrink-0 text-[12px] leading-none text-text-muted">
              now
            </span>
          </div>
          <p className="mt-1.5 text-[15px] font-medium leading-[1.25] text-foreground">
            {TITLE}
          </p>
          <p className="text-[15px] leading-[1.25] text-text-muted">{BODY}</p>
        </div>
      </div>
    </div>
  );
}

/**
 * Android / One UI: a squarer card, the app name and a dot-separated timestamp
 * on one header line ABOVE the title, the icon smaller and circular.
 */
function AndroidNotification() {
  return (
    <div
      aria-hidden
      className="rounded-2xl bg-bg-surface-raised px-4 py-3.5 shadow-[0_8px_28px_-12px_rgba(0,0,0,0.7)]"
    >
      <div className="flex items-center gap-2">
        <Image
          src="/icon-192.png"
          alt=""
          width={192}
          height={192}
          priority
          className="h-[15px] w-[15px] shrink-0 rounded-full"
        />
        <span className="text-[12px] leading-none text-text-muted">
          Trackd
          <span className="mx-1.5 text-text-subtle">&middot;</span>
          now
        </span>
      </div>

      <p className="mt-2 text-[15px] font-medium leading-[1.3] text-foreground">
        {TITLE}
      </p>
      <p className="text-[14px] leading-[1.3] text-text-muted">{BODY}</p>
    </div>
  );
}
