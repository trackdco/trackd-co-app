"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

import {
  saveReminderPrefs,
  type ReminderPrefsInput,
} from "@/lib/notifications/prefsActions";

export interface ReminderPrefsInitial {
  doseRemindersOn: boolean;
  missedOn: boolean;
  lowStockOn: boolean;
  reminderTime: string; // "HH:MM"
  quietStart: string; // "HH:MM"
  quietEnd: string; // "HH:MM"
}

const TIME_INPUT_CLASS =
  "h-11 w-32 rounded-xl border border-input bg-transparent px-3 text-base text-foreground shadow-xs outline-none [color-scheme:dark] dark:bg-input/30 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

/**
 * Reminder preferences (Spec 14, Phase 2): which reminders fire, the daily time,
 * and the quiet window. Writes the user's own notification_preferences row.
 * Defaults: dose 9am, quiet 10pm–8am — all editable here.
 */
export function ReminderSettings({ initial }: { initial: ReminderPrefsInitial }) {
  const [doseRemindersOn, setDose] = useState(initial.doseRemindersOn);
  const [missedOn, setMissed] = useState(initial.missedOn);
  const [lowStockOn, setLowStock] = useState(initial.lowStockOn);
  const [reminderTime, setReminderTime] = useState(initial.reminderTime);
  const [quietStart, setQuietStart] = useState(initial.quietStart);
  const [quietEnd, setQuietEnd] = useState(initial.quietEnd);

  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState<"idle" | "ok" | "err">("idle");

  function save() {
    setSaved("idle");
    const input: ReminderPrefsInput = {
      doseRemindersOn,
      missedOn,
      lowStockOn,
      reminderTime,
      quietStart,
      quietEnd,
    };
    startTransition(async () => {
      const { ok } = await saveReminderPrefs(input);
      setSaved(ok ? "ok" : "err");
    });
  }

  return (
    <div className="mt-3 rounded-2xl border border-border bg-bg-surface p-5">
      <p className="font-display text-lg text-foreground">Reminders</p>
      <p className="mt-1 text-sm leading-relaxed text-text-muted">
        Choose what we remind you about and when.
      </p>

      <div className="mt-4 space-y-1">
        <SwitchRow
          label="Dose reminders"
          hint="A daily nudge listing what's due"
          on={doseRemindersOn}
          onToggle={() => setDose((v) => !v)}
        />
        <SwitchRow
          label="Missed-dose nudge"
          hint="If a due dose is still unlogged later in the day"
          on={missedOn}
          onToggle={() => setMissed((v) => !v)}
        />
        <SwitchRow
          label="Low stock"
          hint="When a vial is about to run out"
          on={lowStockOn}
          onToggle={() => setLowStock((v) => !v)}
        />
      </div>

      <div className="mt-5 space-y-4 border-t border-border/60 pt-4">
        <TimeRow label="Daily reminder time" value={reminderTime} onChange={setReminderTime} />
        <div>
          <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-text-muted">
            Quiet hours
          </span>
          <div className="flex items-center gap-3">
            <input
              type="time"
              aria-label="Quiet hours start"
              value={quietStart}
              onChange={(e) => setQuietStart(e.target.value)}
              className={TIME_INPUT_CLASS}
            />
            <span className="text-sm text-text-muted">to</span>
            <input
              type="time"
              aria-label="Quiet hours end"
              value={quietEnd}
              onChange={(e) => setQuietEnd(e.target.value)}
              className={TIME_INPUT_CLASS}
            />
          </div>
          <p className="mt-2 text-xs text-text-subtle">
            Nothing is sent during this window.
          </p>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-accent-primary px-5 text-sm font-medium text-bg-base transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
          {pending ? "Saving…" : "Save reminders"}
        </button>
        {saved === "ok" && <span className="text-sm text-text-muted">Saved</span>}
        {saved === "err" && (
          <span className="text-sm text-text-muted">Couldn&apos;t save</span>
        )}
      </div>
    </div>
  );
}

function SwitchRow({
  label,
  hint,
  on,
  onToggle,
}: {
  label: string;
  hint: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="min-w-0">
        <p className="text-sm text-foreground">{label}</p>
        <p className="text-xs leading-snug text-text-muted">{hint}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={onToggle}
        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-200 ${
          on ? "bg-accent-amber" : "bg-bg-input border border-border-strong"
        }`}
      >
        <span
          className={`pointer-events-none inline-block size-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
            on ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}

function TimeRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-xs uppercase tracking-[0.18em] text-text-muted">
        {label}
      </span>
      <input
        type="time"
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={TIME_INPUT_CLASS}
      />
    </div>
  );
}
