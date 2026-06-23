"use client";

import { useState, useTransition } from "react";
import { Bell, Loader2 } from "lucide-react";

import { AddToHomeScreenPrompt } from "@/components/push/AddToHomeScreenPrompt";
import { usePushNotifications } from "@/components/push/usePushNotifications";
import { CARD_ICON_BADGE } from "@/lib/ui-presets";
import { sendMyRemindersNow } from "@/lib/notifications/actions";

/**
 * Settings entry point for push (Spec 14 D5). One of two surfaces over the shared
 * usePushNotifications hook (the other is the onboarding step). Reflects live
 * state: off→on subscribes, on→off unsubscribes; iOS-not-installed shows the
 * Add-to-Home-Screen guidance; a denied OS permission shows re-enable steps (we
 * cannot re-prompt once denied); unsupported/unconfigured stay a quiet line.
 *
 * `initialEnabled` is the stored intent flag (profiles.notifications_enabled),
 * read on the server so the toggle seeds without a flash.
 */
export function NotificationsToggle({
  initialEnabled,
}: {
  initialEnabled: boolean;
}) {
  const { status, busy, enable, disable } = usePushNotifications(initialEnabled);
  const [message, setMessage] = useState<string | null>(null);

  const on = status === "on";

  async function handleToggle() {
    if (busy) return;
    setMessage(null);
    const result = on ? await disable() : await enable();
    if (!result.ok) {
      if (result.reason === "denied") {
        setMessage(
          "Notifications are blocked. Turn them on for Trackd in your browser or phone settings, then try again.",
        );
      } else if (result.reason === "error") {
        setMessage("Couldn't update notifications. Please try again.");
      }
      // "dismissed" (closed the OS prompt) is silent — nothing to apologise for.
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-bg-surface p-5">
      <div className="flex items-start gap-3">
        <span className={CARD_ICON_BADGE} aria-hidden="true">
          <Bell className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg text-foreground">Notifications</p>
          <p className="mt-1 text-sm leading-relaxed text-text-muted">
            Dose reminders and protocol nudges, sent to this device.
          </p>
        </div>

        {(status === "on" || status === "off") && (
          <Toggle on={on} busy={busy} onClick={handleToggle} />
        )}
      </div>

      {status === "loading" && (
        <p className="mt-3 text-sm text-text-subtle">Checking…</p>
      )}

      {status === "unsupported" && (
        <p className="mt-3 text-sm text-text-muted">
          This browser doesn&apos;t support notifications.
        </p>
      )}

      {status === "unconfigured" && (
        <p className="mt-3 text-sm text-text-muted">
          Notifications aren&apos;t available yet.
        </p>
      )}

      {status === "ios-needs-install" && (
        <div className="mt-4">
          <AddToHomeScreenPrompt />
        </div>
      )}

      {status === "denied" && (
        <p className="mt-3 text-sm leading-relaxed text-text-muted">
          Notifications are blocked. To turn them on, allow notifications for
          Trackd in your browser or phone settings — we can&apos;t ask again from
          here.
        </p>
      )}

      {message && (
        <p role="alert" className="mt-3 text-sm leading-relaxed text-text-muted">
          {message}
        </p>
      )}

      {on && <TestSend />}
    </section>
  );
}

/** The on/off switch — amber when on (UI/active accent, not health data). */
function Toggle({
  on,
  busy,
  onClick,
}: {
  on: boolean;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label="Notifications"
      disabled={busy}
      onClick={onClick}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-200 disabled:opacity-60 ${
        on ? "bg-accent-amber" : "bg-bg-input border border-border-strong"
      }`}
    >
      {/* Knob: flex-centered vertically; travel is exact so the 4px inset is equal
          on both ends (off → translate-x-1, on → translate-x-6) — no overflow. */}
      <span
        className={`pointer-events-none inline-block size-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
          on ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

/** "Send test notification" — the verification affordance + a genuinely useful
 *  feature. Calls send-push for the current user via a server action. */
function TestSend() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<"idle" | "sent" | "failed">("idle");

  function send() {
    setResult("idle");
    startTransition(async () => {
      const { ok } = await sendMyRemindersNow();
      setResult(ok ? "sent" : "failed");
    });
  }

  return (
    <div className="mt-4 border-t border-border/60 pt-4">
      <button
        type="button"
        onClick={send}
        disabled={pending}
        className="inline-flex items-center gap-2 text-sm text-accent-amber transition-opacity hover:opacity-80 disabled:opacity-60"
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : null}
        Send a test notification
      </button>
      {result === "sent" && (
        <p className="mt-2 text-sm text-text-muted">
          Sent — it should arrive on this device shortly.
        </p>
      )}
      {result === "failed" && (
        <p className="mt-2 text-sm text-text-muted">
          Couldn&apos;t send a test just now.
        </p>
      )}
    </div>
  );
}
