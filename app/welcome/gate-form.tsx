"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { CircleNotch } from "@/components/icons";

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
  "h-12 w-full min-w-0 rounded-xl border border-input bg-transparent px-3 text-base text-foreground shadow-xs outline-none transition-colors [color-scheme:dark] dark:bg-input/30 focus-visible:border-border-strong";

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
 * Sex is asked here too, and is required: it decides which body the
 * injection-site map draws (male / female figure). There's no "prefer not to
 * say" — without a value the map has no body to pick.
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
  const [sex, setSex] = useState(""); // "male" | "female" — required, see below

  // Three separate, un-ticked consents (Spec 12). All required to continue.
  const [agreeTosPrivacy, setAgreeTosPrivacy] = useState(false);
  const [agreeDisclaimer, setAgreeDisclaimer] = useState(false);
  const [agreeHealth, setAgreeHealth] = useState(false);

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

  // Enable "Enter Trackd" only once a DOB + sex are entered and all three
  // consents are ticked. The server still enforces the 18+ age check on top of
  // this, and re-validates sex (the client never decides either).
  const canSubmit =
    agreeTosPrivacy &&
    agreeDisclaimer &&
    agreeHealth &&
    dob !== "" &&
    sex !== "" &&
    !isPending;

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

      {/* Sex — required. Sets which body the injection-site map draws; changeable
          later in Settings (behind a confirm). */}
      <fieldset className="mt-6 border-0 p-0">
        <legend className="mb-2 block text-xs uppercase tracking-[0.18em] text-text-muted">
          Sex
        </legend>
        <select
          name="sex"
          required
          aria-label="Sex"
          value={sex}
          onChange={(e) => setSex(e.target.value)}
          className={SELECT_CLASS}
        >
          <option value="">Select…</option>
          <option value="male">Male</option>
          <option value="female">Female</option>
        </select>
      </fieldset>
      <p className="mt-2 text-[0.7rem] text-text-subtle">
        Sets your injection-site body map. You can change it later in Settings.
      </p>

      <fieldset className="mt-6 space-y-4 border-0 p-0">
        <Consent
          name="agree_tos_privacy"
          checked={agreeTosPrivacy}
          onChange={setAgreeTosPrivacy}
        >
          I agree to the <DocLink href="/terms">Terms of Service</DocLink> and{" "}
          <DocLink href="/privacy">Privacy Policy</DocLink>.
        </Consent>
        <Consent
          name="agree_disclaimer"
          checked={agreeDisclaimer}
          onChange={setAgreeDisclaimer}
        >
          I have read and agree to the{" "}
          <DocLink href="/medical-disclaimer">Medical Disclaimer</DocLink>.
        </Consent>
        <Consent
          name="agree_health"
          checked={agreeHealth}
          onChange={setAgreeHealth}
        >
          I explicitly consent to Trackd processing my health-related data
          (compounds, doses, bloodwork, body metrics, photos and journal entries)
          to provide the Service, as described in the{" "}
          <DocLink href="/privacy">Privacy Policy</DocLink>.
        </Consent>
      </fieldset>

      {state.error ? (
        <p role="alert" className="mt-4 text-sm text-[var(--state-error)]">
          {state.error}
        </p>
      ) : null}

      <Button
        type="submit"
        size="lg"
        disabled={!canSubmit}
        aria-busy={isPending}
        className="mt-6 h-12 w-full touch-manipulation select-none rounded-xl text-[0.95rem] transition-transform duration-100 active:scale-[0.98] motion-reduce:active:scale-100"
      >
        {isPending ? (
          <CircleNotch className="size-5 animate-spin" aria-hidden="true" />
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

/** One consent row: a checkbox + its label. Controlled, so the parent can gate
 *  the submit button on all three being ticked. A ticked consent is a settled
 *  selection, so the checkbox takes the white primary accent (not amber). */
function Consent({
  name,
  checked,
  onChange,
  children,
}: {
  name: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        name={name}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-5 shrink-0 rounded accent-[var(--accent-primary)]"
      />
      <span className="text-[0.8rem] leading-relaxed text-text-muted">
        {children}
      </span>
    </label>
  );
}
