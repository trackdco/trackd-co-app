"use client";

import { useState } from "react";
import { Bell } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useMounted } from "@/components/home/useMounted";
import { AddToHomeScreenPrompt } from "@/components/push/AddToHomeScreenPrompt";
import { usePushNotifications } from "@/components/push/usePushNotifications";

const DISMISS_KEY = "trackd:push-onboard-dismissed";

/**
 * The second push entry point (Spec 14 D5) — a one-time, skippable prime shown on
 * the dashboard for a signed-in user who hasn't turned notifications on. There is
 * no multi-step onboarding flow in the app, so this stands alone like the install
 * prompt: it primes, a button triggers subscribe() on tap (a real user gesture),
 * and it's remembered once enabled or skipped so it never nags.
 *
 * Backed by the SAME usePushNotifications hook as the Settings toggle, so there is
 * one code path. Renders nothing unless there is something actionable to do.
 */
export function EnableNotificationsStep({
  initialEnabled,
}: {
  initialEnabled: boolean;
}) {
  const mounted = useMounted();
  const { status, busy, enable } = usePushNotifications(initialEnabled);
  // Session-level dismissal; persisted dismissal is read from localStorage during
  // render (post-mount, so SSR stays deterministic — no setState-in-effect).
  const [sessionDismissed, setSessionDismissed] = useState(false);

  function remember() {
    window.localStorage.setItem(DISMISS_KEY, "1");
    setSessionDismissed(true);
  }

  async function handleEnable() {
    const result = await enable();
    // Either way, don't show this prime again — Settings is the place to retry.
    if (result.ok || result.reason === "denied") remember();
  }

  // Server + first hydration render nothing (gate on mount) to avoid a flash.
  if (!mounted) return null;
  const persistedDismissed =
    window.localStorage.getItem(DISMISS_KEY) === "1";
  // Nothing to onboard: dismissed, already on, still probing, blocked, or N/A.
  if (sessionDismissed || persistedDismissed) return null;
  if (status !== "off" && status !== "ios-needs-install") return null;

  if (status === "ios-needs-install") {
    return (
      <div className="mt-8">
        <AddToHomeScreenPrompt />
        <button
          type="button"
          onClick={remember}
          className="mt-3 text-sm text-text-muted transition-colors hover:text-foreground"
        >
          Not now
        </button>
      </div>
    );
  }

  return (
    <div className="mt-8 rounded-2xl border border-border bg-bg-surface p-5">
      <div className="flex items-start gap-3">
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-accent-amber/25 bg-accent-amber/10 text-accent-amber"
          aria-hidden="true"
        >
          <Bell className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="font-display text-lg text-foreground">
            Never miss a dose
          </p>
          <p className="mt-1 text-sm leading-relaxed text-text-muted">
            Get a quiet reminder when a dose is due. You can change this any time
            in Settings.
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Button
          type="button"
          onClick={handleEnable}
          disabled={busy}
          aria-busy={busy}
          className="h-11 flex-1 rounded-xl"
        >
          {busy ? "Enabling…" : "Turn on reminders"}
        </Button>
        <button
          type="button"
          onClick={remember}
          disabled={busy}
          className="px-3 text-sm text-text-muted transition-colors hover:text-foreground disabled:opacity-60"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
