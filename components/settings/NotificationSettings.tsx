"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { CircleNotch } from "@/components/icons";

import { AddToHomeScreenPrompt } from "@/components/push/AddToHomeScreenPrompt";
import { usePushNotifications } from "@/components/push/usePushNotifications";
import { NotificationPreview } from "@/components/settings/NotificationPreview";
import {
  doseReminderMessage,
  lowStockMessage,
  missedNudgeMessage,
  type ReminderCompound,
} from "@/lib/notifications/reminders";
import { sendMyRemindersNow } from "@/lib/notifications/actions";
import {
  saveReminderPrefs,
  saveTimezone,
  type ReminderPrefsInput,
} from "@/lib/notifications/prefsActions";
import { guessPlatform } from "@/lib/onboarding/platform";
import { showToast } from "@/lib/toast";
import { CARD, CARD_EYEBROW, INLINE_NOTE, PRESS, ROWS, ROW_NAME } from "@/lib/ui-presets";
import { cn } from "@/lib/utils";

/**
 * The Notifications page's controls — layout "A · Preview first", which Adrian
 * picked on 2026-09-25 over a plain list.
 *
 * ## What changed from the page it replaces, and why
 *
 *  - **It saves as you go.** The master switch always saved instantly and the
 *    reminder switches waited for a "Save reminders" button, so a switch flipped
 *    on the way out was quietly lost. Every change now saves on its own, with the
 *    one "Saved" toast and its Undo.
 *  - **It shows the notification.** The preview at the top is the message you
 *    would get for whichever row you last touched, worded by the SAME functions
 *    the reminder runner sends with, so it cannot show a sentence the phone would
 *    not.
 *  - **No hint under every row.** The preview does that job.
 *  - **Two new switches**: Check-ins and Hide compound names
 *    (`supabase/notifications/007`). Both are left out while 007 cannot be read,
 *    so there is never a switch on screen that cannot save.
 */

export interface NotificationPrefsInitial extends ReminderPrefsInput {
  /** False while `supabase/notifications/007` is unapplied: no Check-ins, no Hide names. */
  privacyAvailable: boolean;
  hideNames: boolean;
  checkinsOn: boolean;
}

type Focus = "dose" | "missed" | "low" | "checkins" | "test";

const WAITS = [
  { value: "min_30", label: "after 30 min" },
  { value: "hour_1", label: "after 1 hr" },
  { value: "hour_2", label: "after 2 hr" },
  { value: "hour_4", label: "after 4 hr" },
];

/** When the evening don't-forget goes out: the runner's `missed_cutoff_time` default. */
const MISSED_AT = "20:00";
/** The Sunday recap, the check-up the preview uses as its example. */
const CHECKIN_AT = "18:00";

/**
 * A compact time field or select inside a row. Mono, like every figure. The
 * desktop picker glyph is hidden: at row width it pushed "AM" out of the box,
 * and a phone opens its own picker on tap whatever the field draws.
 */
const ROW_FIELD =
  "h-9 shrink-0 rounded-lg border border-border-default bg-bg-input px-2 font-mono text-sm tabular-nums text-foreground outline-none [color-scheme:dark] [&::-webkit-calendar-picker-indicator]:hidden focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

/** The platform does not change while the page is open, so nothing to subscribe to. */
const noSubscribe = () => () => {};

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

function inQuiet(t: string, start: string, end: string): boolean {
  const x = toMin(t), a = toMin(start), b = toMin(end);
  if (a === b) return false;
  return a < b ? x >= a && x < b : x >= a || x < b;
}

/** "09:00" in the viewer's own clock style ("9:00 am" or "09:00"). */
function clock(t: string): string {
  const [h, m] = t.split(":").map(Number);
  return new Date(2000, 0, 1, h || 0, m || 0).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

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
  const [focus, setFocus] = useState<Focus>("dose");
  const [switchMessage, setSwitchMessage] = useState<string | null>(null);

  /* ------------------------------------------------------------ saving */

  /** What is saved right now. Undo puts this back. */
  const savedRef = useRef<ReminderPrefsInput>(toInput(initial));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** A change waiting out the pause, so leaving the page still saves it. */
  const pending = useRef<NotificationPrefsInitial | null>(null);

  function toInput(p: NotificationPrefsInitial): ReminderPrefsInput {
    const base: ReminderPrefsInput = {
      doseRemindersOn: p.doseRemindersOn,
      missedOn: p.missedOn,
      unloggedWait: p.unloggedWait,
      lowStockOn: p.lowStockOn,
      reminderTime: p.reminderTime,
      quietStart: p.quietStart,
      quietEnd: p.quietEnd,
    };
    return p.privacyAvailable ? { ...base, hideNames: p.hideNames, checkinsOn: p.checkinsOn } : base;
  }

  /**
   * One save per pause, not per keystroke: a time field fires as each digit
   * changes, and three toasts for one time would bury the Undo that matters.
   */
  function change(patch: Partial<NotificationPrefsInitial>, nextFocus?: Focus) {
    if (nextFocus) setFocus(nextFocus);
    const next = { ...prefsRef.current, ...patch };
    prefsRef.current = next;
    setPrefs(next);
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

  // Leaving within the pause must not lose the change: that is the bug this page
  // replaced. The toast is app-wide, so its "Saved" still shows on the next screen.
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
    setFocus("test");
    startTest(async () => {
      const { ok } = await sendMyRemindersNow();
      setTested(ok ? "sent" : "failed");
    });
  }

  /* ------------------------------------------------------------ the preview */

  // "Trakabl • " on iPhone only, exactly as public/sw.js does it: Android and
  // desktop print the app name in their own header. Read after mount, since the
  // server cannot know the phone.
  const iphone = useSyncExternalStore(
    noSubscribe,
    () => guessPlatform() === "ios",
    () => false,
  );

  const preview = useMemo(() => {
    const names = compoundNames.length ? compoundNames : ["BPC-157"];
    const hide = prefs.hideNames || compoundNames.length === 0;
    const compounds = names.map(
      (name, i): ReminderCompound => ({
        id: `p${i}`, name, schedule_type: "every_day", days_of_week: null,
        interval_days: null, first_dose_on: "2000-01-01", end_date: null,
      }),
    );
    const at = (m: { title: string; body: string } | null, time: string) =>
      m ? { title: m.title, body: m.body, time } : null;
    const pick =
      focus === "test"
        ? { title: "Trakabl", body: "Notifications are working. Nothing’s due right now", time: "now" }
        : focus === "missed"
          ? at(missedNudgeMessage(compounds.slice(0, 1), { hideNames: hide }), MISSED_AT)
          : focus === "low"
            ? at(lowStockMessage([{ name: names[0], estEmptyDate: null, daysToEmpty: 5, dosesRemaining: 4 }], { hideNames: hide }), prefs.reminderTime)
            : focus === "checkins"
              // One of the signed-off check-ups (lib/notifications/checkups.ts),
              // the Sunday recap, as the example of the kind.
              ? { title: "Your Week", body: "13 of 14 doses logged. Nearly perfect. Nearly", time: CHECKIN_AT }
              : at(doseReminderMessage(compounds, { hideNames: hide }), prefs.reminderTime);
    const m = pick ?? { title: "Dose Reminder", body: "", time: prefs.reminderTime };
    const title = !m.title || m.title === "Trakabl" ? "Trakabl" : iphone ? `Trakabl • ${m.title}` : m.title;
    return { title, body: m.body, time: m.time === "now" ? "now" : clock(m.time) };
  }, [focus, prefs.hideNames, prefs.reminderTime, compoundNames, iphone]);

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
      </section>

      {on && (
        <>
          <section className={cn(CARD, "p-5")}>
            <p className={CARD_EYEBROW}>Reminders</p>
            <div className={cn(ROWS, "mt-3 overflow-hidden")}>
              <Row label="Dose reminder" onFocus={() => setFocus("dose")} dim={!prefs.doseRemindersOn}>
                <input
                  type="time"
                  aria-label="Dose reminder time"
                  value={prefs.reminderTime}
                  onChange={(e) => e.target.value && change({ reminderTime: e.target.value }, "dose")}
                  className={cn(ROW_FIELD, "w-[6.75rem]")}
                />
                <Switch label="Dose reminder" on={prefs.doseRemindersOn} onFlip={() => change({ doseRemindersOn: !prefs.doseRemindersOn }, "dose")} />
              </Row>
              <Row label="Don’t forget" onFocus={() => setFocus("missed")} dim={!prefs.missedOn}>
                <select
                  aria-label="Nudge after"
                  value={prefs.unloggedWait}
                  onChange={(e) => change({ unloggedWait: e.target.value }, "missed")}
                  className={cn(ROW_FIELD, "appearance-none text-center")}
                >
                  {WAITS.map((w) => (
                    <option key={w.value} value={w.value}>{w.label}</option>
                  ))}
                </select>
                <Switch label="Don’t forget" on={prefs.missedOn} onFlip={() => change({ missedOn: !prefs.missedOn }, "missed")} />
              </Row>
              <Row label="Low stock" onFocus={() => setFocus("low")} dim={!prefs.lowStockOn}>
                <Switch label="Low stock" on={prefs.lowStockOn} onFlip={() => change({ lowStockOn: !prefs.lowStockOn }, "low")} />
              </Row>
              {prefs.privacyAvailable && (
                <Row label="Check-ins" onFocus={() => setFocus("checkins")} dim={!prefs.checkinsOn}>
                  <Switch label="Check-ins" on={prefs.checkinsOn} onFlip={() => change({ checkinsOn: !prefs.checkinsOn }, "checkins")} />
                </Row>
              )}
            </div>
            {prefs.doseRemindersOn && inQuiet(prefs.reminderTime, prefs.quietStart, prefs.quietEnd) && (
              <p className={cn(INLINE_NOTE, "mt-3")}>
                {clock(prefs.reminderTime)} is in quiet hours, so it arrives at {clock(prefs.quietEnd)}
              </p>
            )}
          </section>

          <section className={cn(CARD, "p-5")}>
            <p className={CARD_EYEBROW}>Privacy</p>
            <div className={cn(ROWS, "mt-3 overflow-hidden")}>
              {prefs.privacyAvailable && (
                <Row label="Hide compound names" meta="On the lock screen" onFocus={() => setFocus("dose")}>
                  <Switch
                    label="Hide compound names"
                    on={prefs.hideNames}
                    onFlip={() => change({ hideNames: !prefs.hideNames }, focus === "checkins" || focus === "test" ? "dose" : undefined)}
                  />
                </Row>
              )}
              <Row label="Quiet hours" wrap>
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    aria-label="Quiet hours start"
                    value={prefs.quietStart}
                    onChange={(e) => e.target.value && change({ quietStart: e.target.value })}
                    className={cn(ROW_FIELD, "w-[6.75rem]")}
                  />
                  <span className="text-sm text-text-muted">to</span>
                  <input
                    type="time"
                    aria-label="Quiet hours end"
                    value={prefs.quietEnd}
                    onChange={(e) => e.target.value && change({ quietEnd: e.target.value })}
                    className={cn(ROW_FIELD, "w-[6.75rem]")}
                  />
                </div>
              </Row>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

/**
 * One row: its name (tapping it shows that notification in the preview), then
 * its controls. `wrap` lets a wide control drop under the name on a narrow
 * phone rather than squeezing it (quiet hours is two times and a "to").
 */
function Row({
  label,
  meta,
  onFocus,
  dim,
  wrap,
  children,
}: {
  label: string;
  meta?: string;
  onFocus?: () => void;
  dim?: boolean;
  wrap?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex min-h-[3.25rem] items-center gap-3 px-4 py-2.5", wrap && "flex-wrap")}>
      <button
        type="button"
        tabIndex={-1}
        onClick={onFocus}
        className={cn("min-w-0 flex-1 text-left transition-opacity", dim && "opacity-60", wrap && "basis-full")}
      >
        <span className={cn(ROW_NAME, "block")}>{label}</span>
        {meta ? <span className="block text-xs text-text-muted">{meta}</span> : null}
      </button>
      <div className={cn("flex items-center gap-3", wrap && "ml-auto")}>{children}</div>
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
