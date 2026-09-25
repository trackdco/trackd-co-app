"use client";

import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * The notification you will get, drawn the way a phone draws it (Adrian picked
 * this layout, "A · Preview first", 2026-09-25).
 *
 * The same idea as the onboarding permission mock (`notification-mock.tsx`):
 * showing the real thing is quicker than describing it. It answers the two
 * questions the switches below raise — "what will it say?" and "what does hiding
 * names change?" — without a line of explanation on the page.
 *
 * Decorative to a screen reader, like that mock: the switches carry the meaning,
 * and the notification's own text is read out once as the region's label.
 */
export function NotificationPreview({
  title,
  body,
  time,
  dim,
  footer,
}: {
  /** Already prefixed for the platform ("Trakabl • Dose Reminder" on iPhone). */
  title: string;
  body: string;
  time: string;
  /** Notifications are off: the preview recedes rather than disappearing. */
  dim: boolean;
  footer?: React.ReactNode;
}) {
  return (
    <section
      aria-label={`Example notification. ${title}. ${body.replace(/\n/g, " ")}`}
      className={cn(
        "inst-inset rounded-2xl p-2.5 transition-opacity duration-300",
        dim && "opacity-40",
      )}
    >
      <div
        aria-hidden
        className="grid grid-cols-[38px_minmax(0,1fr)] items-center gap-2.5 rounded-2xl bg-bg-surface-raised/95 py-3 pl-3 pr-3.5 shadow-[0_12px_30px_-16px_rgb(0_0_0/0.9)] backdrop-blur-xl"
      >
        <Image
          src="/icon-192.png"
          alt=""
          width={192}
          height={192}
          className="h-[38px] w-[38px] rounded-[9px]"
        />
        <div className="min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate text-[15px] font-medium leading-5 text-foreground">{title}</p>
            <span className="shrink-0 text-[13px] text-text-muted tabular-nums">{time}</span>
          </div>
          <p className="whitespace-pre-line text-[15px] leading-5 text-foreground">{body}</p>
        </div>
      </div>
      {footer ? <div className="flex min-h-11 items-center justify-between px-2 pt-1">{footer}</div> : null}
    </section>
  );
}
