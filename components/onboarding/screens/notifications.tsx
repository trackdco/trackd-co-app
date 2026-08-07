"use client";

import { useRef, useState } from "react";

import { track } from "@/lib/onboarding/analytics";
import { guessPlatform } from "@/lib/onboarding/platform";

import { FlowCta, SkipLink, StepFrame } from "../chrome";
import { useFlow } from "../flow-context";
import { NotificationMock } from "../notification-mock";

/**
 * Notifications (Spec 3-01 §9, §12).
 *
 * ## iOS ASKS FOR NOTHING HERE, and that is the point of the screen
 *
 * This used to come after install, because iOS cannot grant web push to a site
 * that is not on the Home Screen. Install moved to the END of the flow on
 * 2026-08-07 (see `STEP_ORDER` — an installed iOS app has its own storage
 * container, so installing mid-flow signed people out), which puts this screen
 * ahead of it and inverts that constraint.
 *
 * So on iOS the request is NOT made. Calling `Notification.requestPermission()`
 * from an uninstalled iOS site does not merely fail, it spends the single
 * prompt the OS grants and leaves the user permanently denied with no way back
 * except system settings. The screen states the intent instead, and the real
 * request happens in the installed app where it can actually succeed.
 *
 * Deferring is honest rather than a downgrade: the toggle in Profile is the
 * same one that would have been flipped here, and `components/push` owns the
 * subscribe either way.
 *
 * **Android is unchanged** and still asks in place, because Chrome can grant it
 * in a tab and there is no reason to make Android wait for iOS's problem.
 *
 * On Android this asks the BROWSER for permission for real (`Notification.requestPermission`),
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

  /**
   * iOS gets ONE permission prompt per site, ever. Spending it from a browser
   * tab that cannot receive push leaves the user denied with no route back
   * except system settings, so the request is deferred to the installed app.
   */
  const deferred = platform === "ios";

  const onAllow = async () => {
    if (fired.current) return;
    fired.current = true;
    if (deferred) {
      track("notifications_deferred", { platform });
      goNext();
      return;
    }
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
      // The iOS line says WHEN it will be asked, because the button no longer
      // opens anything and a control that does nothing visible reads as broken.
      sub={
        deferred
          ? "A nudge on dose days. Nothing else. Your phone will ask once Trackd is on your home screen."
          : "A nudge on dose days. Nothing else."
      }
      footer={
        <div className="space-y-1">
          {/* Measured at 1317ms to advance on a "default" outcome and 1315ms
              on "denied". Without a label the button just went flat and stayed
              there, which reads as a dead tap and invites a second one. */}
          <FlowCta onClick={onAllow} disabled={busy}>
            {busy
              ? "Waiting for your answer"
              : deferred
                ? "Yes, remind me"
                : "Allow notifications"}
          </FlowCta>
          <SkipLink onClick={goNext}>Not now</SkipLink>
        </div>
      }
    >
      {/* `shrink-0`, not `flex-1`: the frame centres this block as a whole now,
          so a child that grows to fill pushed the mock back off centre. */}
      <div className="shrink-0">
        {/* Drawn the way their own phone draws it, and LIVE: pressing the Allow
            in the picture asks for permission exactly as the CTA does. Same
            handler, so `fired` latches across both and two taps cannot request
            twice. */}
        <NotificationMock platform={platform} onActivate={onAllow} />
      </div>
    </StepFrame>
  );
}
