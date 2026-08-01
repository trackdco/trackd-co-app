"use client";

import { useRef, useState } from "react";

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
  // `disabled={busy}` is a render away; two synchronous clicks both get through
  // it. A ref latches immediately, the same way the demo's log button does.
  const fired = useRef(false);
  // Same guess the install screen made, from one helper, so the two screens
  // cannot show a user Safari's Share sheet and then an Android notification.
  const [platform] = useState(guessPlatform);

  const onAllow = async () => {
    if (fired.current) return;
    fired.current = true;
    setBusy(true);
    try {
      if (typeof Notification !== "undefined" && Notification.requestPermission) {
        // RACED AGAINST A TIMEOUT. `requestPermission()` is not guaranteed to
        // settle: a browser that has blocked the prompt, or one that ignores a
        // request it does not consider user-initiated, can leave the promise
        // pending forever — and this screen awaits it before moving on, so the
        // user would be stranded on it with a latched button. Measured: two
        // rapid taps in Chrome left it hanging. Whatever happens, the flow
        // continues; the permission itself is optional by design.
        const result = await Promise.race([
          Notification.requestPermission(),
          new Promise<NotificationPermission>((resolve) =>
            setTimeout(() => resolve("default"), 4000),
          ),
        ]);
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
      center
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
      {/* `shrink-0`, not `flex-1`: the frame centres this block as a whole now,
          so a child that grows to fill pushed the mock back off centre. */}
      <div className="shrink-0">
        {/* Drawn the way their own phone draws it. */}
        <NotificationMock platform={platform} />
      </div>
    </StepFrame>
  );
}
