"use client";

import { useState } from "react";

import { Bell } from "@/components/icons";
import { track } from "@/lib/onboarding/analytics";
import { CARD_EYEBROW, DATA_MONO } from "@/lib/ui-presets";
import { cn } from "@/lib/utils";

import { FlowCta, SkipLink, StepFrame } from "../chrome";
import { useFlow } from "../flow-context";

/**
 * Screen 14 — Notifications (Spec 3-01 §9, §12).
 *
 * Reached only after the install screen, because on iOS the permission call
 * cannot succeed before the PWA is installed.
 *
 * This asks the BROWSER for permission for real (`Notification.requestPermission`),
 * because that is the one part of this screen that cannot be simulated
 * meaningfully. It does NOT subscribe a push endpoint: that writes a row to
 * `push_subscriptions` against an account, and the account here is stubbed.
 * `components/push` owns the real subscribe and is where this hands off once
 * auth is live.
 *
 * The copy stays tool-framed. A reminder says a dose is due; it never says what
 * to take or how much.
 */
export function NotificationsScreen() {
  const { goNext } = useFlow();
  const [busy, setBusy] = useState(false);

  const onAllow = async () => {
    setBusy(true);
    try {
      if (typeof Notification !== "undefined" && Notification.requestPermission) {
        const result = await Notification.requestPermission();
        if (result === "granted") track("notifications_granted");
      }
    } catch {
      // A blocked or unsupported prompt is not an error worth a screen: the
      // user can turn reminders on later from Profile.
    } finally {
      setBusy(false);
      goNext();
    }
  };

  return (
    <StepFrame
      title="Stay on schedule"
      sub="A nudge on dose days, nothing else. You control what fires."
      footer={
        <div className="space-y-1">
          <FlowCta onClick={onAllow} disabled={busy}>
            Allow notifications
          </FlowCta>
          <SkipLink onClick={goNext}>Not now</SkipLink>
        </div>
      }
    >
      <div className="flex flex-1 flex-col justify-center">
        {/* A sample of the real thing, in the shape iOS draws it. */}
        <div className="rounded-2xl bg-bg-surface-raised p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.625rem] bg-bg-input">
              <Bell className="h-4 w-4 text-text-muted" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className={cn(CARD_EYEBROW, "text-text-muted")}>Trackd</p>
                <span className={cn(DATA_MONO, "text-[10px] text-text-subtle")}>
                  now
                </span>
              </div>
              <p className="mt-1 text-[0.9rem] text-foreground">
                Due today: Test E
              </p>
              <p className="mt-0.5 font-mono text-[11px] tabular-nums text-text-muted">
                0.5 mL
              </p>
            </div>
          </div>
        </div>

        <p className="mt-4 text-center text-[0.75rem] leading-relaxed text-text-subtle">
          Dose days, missed doses and low stock. Each one is a separate switch
          in your profile.
        </p>
      </div>
    </StepFrame>
  );
}
