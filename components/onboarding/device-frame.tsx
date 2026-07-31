"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Phone chrome (Spec 3-01 §11 "device-frame chrome"): a bezel, a Dynamic
 * Island, a status bar and a home indicator, drawn from the same tokens as the
 * app inside it.
 *
 * Drawn rather than photographed for the same reason the containers are: a
 * screenshot of a phone cannot be themed, cannot animate, and goes stale the
 * day the app changes. It is decorative, so the whole frame is `aria-hidden`
 * except for the content passed in.
 */
export function DeviceFrame({
  children,
  className,
  time = "10:10",
}: {
  children: ReactNode;
  className?: string;
  time?: string;
}) {
  return (
    <div
      className={cn(
        "relative mx-auto w-full max-w-[17rem] rounded-[2.25rem] bg-bg-surface-raised p-[3px] shadow-lg",
        className,
      )}
    >
      <div className="relative overflow-hidden rounded-[2.05rem] bg-bg-base">
        {/* Status bar */}
        <div className="relative flex h-9 items-center justify-between px-5 pt-1">
          <span className="font-mono text-[10px] tabular-nums text-foreground">
            {time}
          </span>

          {/* Dynamic Island */}
          <span
            aria-hidden
            className="absolute left-1/2 top-1.5 h-5 w-[4.5rem] -translate-x-1/2 rounded-full bg-bg-surface-raised"
          />

          <span aria-hidden className="flex items-center gap-1">
            <span className="block h-2 w-3 rounded-[1px] bg-text-subtle" />
            <span className="block h-2.5 w-4 rounded-[2px] border-[0.5px] border-text-subtle" />
          </span>
        </div>

        {children}

        {/* Home indicator */}
        <div className="flex h-5 items-center justify-center">
          <span
            aria-hidden
            className="block h-[3px] w-24 rounded-full bg-text-subtle"
          />
        </div>
      </div>
    </div>
  );
}
