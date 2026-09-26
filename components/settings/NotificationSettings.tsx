"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { CircleNotch } from "@/components/icons";

import { AddToHomeScreenPrompt } from "@/components/push/AddToHomeScreenPrompt";
import { usePushNotifications } from "@/components/push/usePushNotifications";
import { NotificationPreview } from "@/components/settings/NotificationPreview";
import { doseReminderMessage, type ReminderCompound } from "@/lib/notifications/reminders";
import { sendMyRemindersNow } from "@/lib/notifications/actions";
import {
  saveReminderPrefs,
  saveTimezone,
  type ReminderPrefsInput,
} from "@/lib/notifications/prefsActions";
import { guessPlatform } from "@/lib/onboarding/platform";
import { showToast } from "@/lib/toast";
import { CARD, PRESS, ROWS, ROW_NAME } from "@/lib/ui-presets";
import { cn } from "@/lib/utils";

/**
 * The Notifications page's controls.
 *
 * ## Three things to set, and nothing else (Adrian, 2026-09-26)
 *
 * He asked whether people need to choose all this, and the account data said
 * no: of 19 people with notifications on, 3 had ever changed a setting (all the
 * reminder time), one had changed quiet hours, and nobody had turned a reminder
 * type off or changed the don't-forget wait. So the page is the Notifications
 * switch, the daily reminder time, and Hide compound names. The reminder types,
 * the wait and quiet hours are fixed in the runner (`runner.ts`), and there is
 * no Check-ins switch: the Notifications switch turns everything off.
 *
 * Reminders stay ONE daily digest rather than one per dose time, on purpose:
 * somebody running 16 compounds would otherwise be pinged all day, and most
 * dose times are the add form's prefill rather than a time anybody chose.
 *
 * ## Kept from layout A
 *
 *  - **The preview**: the reminder as the phone draws it, worded by the runner's
 *    own builder from the user's own compounds, so hiding names shows its effect
 *    without a line of explanation.
 *  - **Saving as you go**, with the one "Saved" toast and its Undo, and a change
 *    still waiting when you leave is saved on the way out.
 */

export interface NotificationPrefsInitial {
  reminderTime: string; // "HH:MM"
  /** False while `supabase/notifications/007` is unapplied: no Hide names row. */
  privacyAvailable: boolean;
  hideNames: boolean;
}

/** A compact time field inside a row. Mono, like every figure. The desktop picker
 *  glyph is hidden: it pushed "AM" out of the box at row width, and a phone opens
 *  its own picker on tap whatever the field draws. */
const ROW_FIELD =
  "h-9 w-[5.75rem] shrink-0 rounded-lg border border-border-default bg-bg-input px-2 text-center font-mono text-sm tabular-nums text-foreground outline-none [color-scheme:dark] [&::-webkit-calendar-picker-indicator]:hidden focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

/** "09:00" in the viewer's own clock style ("9:00 am" or "09:00"). */
function clock(t: string): string {
  const [h, m] = t.split(":").map(Number);
  return new Date(2000, 0, 1, h || 0, m || 0).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

/** The platform does not change while the page is open, so nothing to subscribe to. */
const noSubscribe = () => () => {};

export function NotificationSettings({
  initialEnabled,
  currentTimezone,
  initial,
  compoundNames,
}: {
  initialEnabled: boolean;
  currentTimezone: string | null;
  initial: NotificationPrefsInitial;
  /** Up to three of the user's active compounds, for a preview in their own words. */
  compoundNames: string[];
}) {
  const { status, busy, enable, disable } = usePushNotifications(initialEnabled);
  const on = status === "on";

  // The device's real timezone, so reminders fire on the user's clock. Once, on
  // mount, only when it differs. Best-effort, never blocks.
  const syncedTz = useRef(false);
  useEffect(() => {
    if (syncedTz.current) return;
    syncedTz.current = true;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && tz !== currentTimezone) saveTimezone(tz).catch(() => {});
  }, [currentTimezone]);

  const [prefs, setPrefs] = useState<NotificationPrefsInitial>(initial);
  /** The latest values, for a save scheduled from an event handler. */
  const prefsRef = useRef<NotificationPrefsInitial>(initial);
  const [switchMessage, setSwitchMessage] = useState<string | null>(null);

  /* ------------------------------------------------------------ saving */

  const toInput = (p: NotificationPrefsInitial): ReminderPrefsInput =>
    p.privacyAvailable
      ? { reminderTime: p.reminderTime, hideNames: p.hideNames }
      : { reminderTime: p.reminderTime };

  /** What is saved right now. Undo puts this back. */
  const savedRef = useRef<ReminderPrefsInput>(toInput(initial));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** A change waiting out the pause, so leaving the page still saves it. */
  const pending = useRef<NotificationPrefsInitial | null>(null);

  /**
   * One save per pause, not per keystroke: a time field fires as each digit
   * changes, and three toasts for one time would bury the Undo that matters.
   */
  function change(patch: Partial<NotificationPrefsInitial>) {
    const next = { ...prefsRef.current, ...patch };
    prefsRef.current = next;
    setPrefs(next);
    setTested("idle");
    if (timer.current) clearTimeout(timer.current);
    pending.current = next;
    timer.current = setTimeout(() => {
      pending.current = null;
      void save(next);
    }, 600);
  }

  async function save(next: NotificationPrefsInitial) {
    const input = toInput(next);
    const before = savedRef.current;
    const { ok } = await saveReminderPrefs(input);
    if (!ok) {
      showToast("Couldn’t save. Try again.");
      return;
    }
    savedRef.current = input;
    showToast("Saved", {
      undo: () => {
        void saveReminderPrefs(before).then((back) => {
          if (!back.ok) {
            showToast("Couldn’t undo. Try again.");
            return;
          }
          savedRef.current = before;
          prefsRef.current = { ...prefsRef.current, ...before };
          setPrefs(prefsRef.current);
        });
      },
    });
  }

  // Leaving within the pause must not lose the change: that is the bug the old
  // "Save reminders" button caused. The toast is app-wide, so its "Saved" still
  // shows on the next screen.
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    if (pending.current) void save(pending.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ------------------------------------------------------------ master switch */

  async function flipMaster() {
    if (busy) return;
    setSwitchMessage(null);
    const result = on ? await disable() : await enable();
    if (!result.ok) {
      if (result.reason === "denied") {
        setSwitchMessage("Notifications are blocked. Turn them on for Trakabl in your phone’s settings, then try again.");
      } else if (result.reason === "error") {
        setSwitchMessage("Couldn’t update notifications. Try again.");
      }
      // "dismissed" (the OS prompt closed) is silent: nothing to apologise for.
    }
  }

  /* ------------------------------------------------------------ test send */

  const [testing, startTest] = useTransition();
  const [tested, setTested] = useState<"idle" | "sent" | "failed">("idle");
  function sendTest() {
    setTested("idle");
    startTest(async () => {
      const { ok } = await sendMyRemindersNow();
      setTested(ok ? "sent" : "failed");
    });
  }

  /* ------------------------------------------------------------ the preview */

  // "Trakabl • " on iPhone only, exactly as public/sw.js does it: Android and
  // desktop print the app name in their own header.
  const iphone = useSyncExternalStore(noSubscribe, () => guessPlatform() === "ios", () => false);

  const preview = useMemo(() => {
    const hide = prefs.hideNames || compoundNames.length === 0;
    const compounds = (compoundNames.length ? compoundNames : ["BPC-157"]).map(
      (name, i): ReminderCompound => ({
        id: `p${i}`, name, schedule_type: "every_day", days_of_week: null,
        interval_days: null, first_dose_on: "2000-01-01", end_date: null,
      }),
    );
    const m = doseReminderMessage(compounds, { hideNames: hide });
    const t = m?.title ?? "Dose Reminder";
    return {
      title: iphone ? `Trakabl • ${t}` : t,
      body: m?.body ?? "",
      time: clock(prefs.reminderTime),
    };
  }, [prefs.hideNames, prefs.reminderTime, compoundNames, iphone]);

  const controllable = status === "on" || status === "off";

  /* ------------------------------------------------------------ render */

  return (
    <div className="space-y-5">
      <NotificationPreview
        title={preview.title}
        body={preview.body}
        time={preview.time}
        dim={!on}
        footer={
          on ? (
            <>
              <span className="text-sm text-text-muted" role="status">
                {tested === "sent" ? "Sent to this phone" : tested === "failed" ? "Couldn’t send. Try again" : ""}
              </span>
              <button
                type="button"
                onClick={sendTest}
                disabled={testing}
                className={cn(PRESS.text, "-my-2 inline-flex min-h-11 items-center gap-2 text-sm text-foreground transition-opacity hover:opacity-80 disabled:opacity-60")}
              >
                {testing ? <CircleNotch className="size-4 animate-spin" aria-hidden="true" /> : null}
                Send me a test
              </button>
            </>
          ) : null
        }
      />

      <section className={cn(CARD, "p-5")}>
        <div className="flex min-h-11 items-center justify-between gap-4">
          <p className="text-[15px] text-foreground">Notifications</p>
          {controllable && (
            <Switch label="Notifications" on={on} disabled={busy} onFlip={flipMaster} />
          )}
        </div>
        {status === "loading" && <p className="mt-2 text-sm text-text-muted">Checking…</p>}
        {status === "unsupported" && (
          <p className="mt-2 text-sm text-text-muted">This browser doesn&apos;t support notifications.</p>
        )}
        {status === "unconfigured" && (
          <p className="mt-2 text-sm text-text-muted">Notifications aren&apos;t available yet.</p>
        )}
        {status === "ios-needs-install" && (
          <div className="mt-4">
            <AddToHomeScreenPrompt />
          </div>
        )}
        {status === "denied" && (
          <p className="mt-2 text-sm leading-relaxed text-text-muted">
            Notifications are blocked. Allow them for Trakabl in your phone&apos;s settings.
          </p>
        )}
        {status === "off" && !switchMessage && (
          <p className="mt-2 text-sm text-text-muted">Turn on to get reminders on this phone.</p>
        )}
        {switchMessage && (
          <p role="alert" className="mt-2 text-sm leading-relaxed text-text-muted">{switchMessage}</p>
        )}

        {on && (
          <div className={cn(ROWS, "mt-4 overflow-hidden")}>
            <div className="flex min-h-[3.25rem] items-center gap-3 px-4 py-2.5">
              <label htmlFor="reminder-time" className={cn(ROW_NAME, "min-w-0 flex-1")}>
                Daily reminder
              </label>
              <input
                id="reminder-time"
                type="time"
                value={prefs.reminderTime}
                onChange={(e) => e.target.value && change({ reminderTime: e.target.value })}
                className={ROW_FIELD}
              />
            </div>
            {prefs.privacyAvailable && (
              <div className="flex min-h-[3.25rem] items-center gap-3 px-4 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className={cn(ROW_NAME, "block")}>Hide compound names</span>
                  <span className="block text-xs text-text-muted">On the lock screen</span>
                </span>
                <Switch
                  label="Hide compound names"
                  on={prefs.hideNames}
                  onFlip={() => change({ hideNames: !prefs.hideNames })}
                />
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

/** The switch (ui-context → "a switch that is ON is amber"), half-life's machined rail and knob. */
function Switch({
  label,
  on,
  disabled,
  onFlip,
}: {
  label: string;
  on: boolean;
  disabled?: boolean;
  onFlip: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onFlip}
      className={cn(
        "relative inline-flex h-7 w-12 shrink-0 items-center rounded-[11px] transition-colors duration-200 disabled:opacity-60",
        on ? "bg-accent-amber" : "inst-rail",
      )}
    >
      <span
        className={cn(
          "pointer-events-none inline-block size-5 inst-knob transition-transform duration-200",
          on ? "translate-x-6" : "translate-x-1",
        )}
      />
    </button>
  );
}
