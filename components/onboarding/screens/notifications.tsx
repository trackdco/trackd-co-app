"use client";

import { useState } from "react";

import { track } from "@/lib/onboarding/analytics";
import { guessPlatform } from "@/lib/onboarding/platform";

import { FlowCta, SkipLink, StepFrame } from "../chrome";
import { useFlow } from "../flow-context";
import { NotificationMock } from "../notification-mock";

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
  // Same guess the install screen made, from one helper, so the two screens
  // cannot show a user Safari's Share sheet and then an Android notification.
  const [platform] = useState(guessPlatform);

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
      title="Turn on reminders"
      sub="A nudge on dose days. Nothing else."
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
        {/* Drawn the way their own phone draws it. */}
        <NotificationMock platform={platform} />

      </div>
    </StepFrame>
  );
}
