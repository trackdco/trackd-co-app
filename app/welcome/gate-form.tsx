"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { completeGate, type GateState } from "./actions";

const initialState: GateState = {};

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// Match the look of components/ui/input.tsx so the selects sit with the rest of
// the form. color-scheme:dark renders the native dropdown + arrow dark.
const SELECT_CLASS =
  "h-12 w-full min-w-0 rounded-xl border border-input bg-transparent px-3 text-base text-foreground shadow-xs outline-none transition-[color,box-shadow] [color-scheme:dark] dark:bg-input/30 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

/**
 * The 18+/ToS gate form.
 *
 * Date of birth uses three dropdowns (Day / Month / Year, AU order) instead of a
 * native date calendar — picking a birthday by paging a calendar month-by-month
 * is brutal (200+ taps for an adult). Dropdowns let you jump straight to a year,
 * and on mobile they open the native wheel picker. The three values are composed
 * into a hidden `date_of_birth` field (YYYY-MM-DD) so the server action contract
 * is unchanged; the server still validates the date and the age (the client
 * never decides age). The day list adapts to the chosen month/year so an
 * impossible date (e.g. 31 February) can't be selected.
 *
 * Acceptance is a single checkbox covering all three legal documents, each
 * opening in a new tab so reading them doesn't drop the form. On success the
 * action redirects to /dashboard.
 */
export function GateForm() {
  const [state, formAction, isPending] = useActionState(
    completeGate,
    initialState,
  );

  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 101 }, (_, i) => thisYear - i);

  const [day, setDay] = useState("");
  const [month, setMonth] = useState(""); // "1".."12"
  const [year, setYear] = useState("");

  // Days available for the chosen month/year (so Feb never offers 30/31).
  const daysInMonth =
    month && year ? new Date(Number(year), Number(month), 0).getDate() : 31;
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  // If a previously-picked day no longer exists (e.g. 31, then switch to Feb),
  // drop it so we never submit an impossible date.
  const safeDay = day && Number(day) > daysInMonth ? "" : day;

  const dob =
    safeDay && month && year
      ? `${year}-${String(month).padStart(2, "0")}-${String(safeDay).padStart(2, "0")}`
      : "";

  return (
    <form action={formAction} className="mt-10 w-full max-w-[20rem] text-left">
      <fieldset className="border-0 p-0">
        <legend className="mb-2 block text-xs uppercase tracking-[0.18em] text-text-muted">
          Date of birth
        </legend>
        <div className="grid grid-cols-[1fr_1.4fr_1.1fr] gap-2">
          <select
            aria-label="Day"
            value={safeDay}
            onChange={(e) => setDay(e.target.value)}
            className={SELECT_CLASS}
          >
            <option value="">Day</option>
            {days.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <select
            aria-label="Month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className={SELECT_CLASS}
          >
            <option value="">Month</option>
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
          <select
            aria-label="Year"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className={SELECT_CLASS}
          >
            <option value="">Year</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </fieldset>
      {/* Composed value the server action reads + validates. */}
      <input type="hidden" name="date_of_birth" value={dob} />
      <p className="mt-2 text-[0.7rem] text-text-subtle">
        Trackd is for adults 18 and over. We use this to confirm your age.
      </p>

      <label className="mt-6 flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          name="agree"
          className="mt-0.5 size-5 shrink-0 rounded accent-[var(--accent-amber)]"
        />
        <span className="text-[0.8rem] leading-relaxed text-text-muted">
          I confirm I&apos;m 18 or older and I agree to Trackd&apos;s{" "}
          <DocLink href="/terms">Terms of Service</DocLink>,{" "}
          <DocLink href="/privacy">Privacy Policy</DocLink>, and{" "}
          <DocLink href="/medical-disclaimer">Medical Disclaimer</DocLink>.
        </span>
      </label>

      {state.error ? (
        <p role="alert" className="mt-4 text-sm text-[var(--state-error)]">
          {state.error}
        </p>
      ) : null}

      <Button
        type="submit"
        size="lg"
        disabled={isPending}
        aria-busy={isPending}
        className="mt-6 h-12 w-full touch-manipulation select-none rounded-xl text-[0.95rem] transition-transform duration-100 active:scale-[0.98] motion-reduce:active:scale-100"
      >
        {isPending ? (
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
        ) : null}
        {isPending ? "Setting up…" : "Enter Trackd"}
      </Button>
    </form>
  );
}

function DocLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-foreground underline underline-offset-2 hover:text-text-muted"
    >
      {children}
    </Link>
  );
}
