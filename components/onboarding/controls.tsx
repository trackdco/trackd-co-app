"use client";

import type { ReactNode } from "react";

import { Check } from "@/components/icons";
import { CARD_EYEBROW } from "@/lib/ui-presets";
import { cn } from "@/lib/utils";

/**
 * Onboarding form controls (Spec 3-01 §11 component list): multi-select chip,
 * segmented control, consent row.
 *
 * Built from the documented tokens and the radius scale, so they read as the
 * same system as the app they lead into. Onboarding-scoped by design.
 */

/**
 * A multi-select chip.
 *
 * **Selected reads AMBER** (Adrian, 2026-08-01). This is a deliberate, narrow
 * exception to the one-or-two-amber-beats rule, and the argument for it is the
 * same one that carried the switch rule: on an answer screen the SELECTION is
 * the live state, and it is the only thing on the screen the user is looking
 * for. Unselected stays exactly as it was, so the amber still marks a change
 * rather than coating the screen.
 *
 * Scoped to onboarding answer lists. It is NOT licence to amber a list in the
 * app, where amber means "this needs you now" against real data.
 */
export function Chip({
  label,
  icon,
  selected,
  onToggle,
}: {
  label: string;
  icon?: ReactNode;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={selected}
      onClick={onToggle}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-left",
        "transition-all duration-[var(--motion-base)] ease-[var(--motion-ease)]",
        "active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "motion-reduce:transition-none motion-reduce:active:scale-100",
        selected
          // A wash rather than a fill: the amber reads at a glance without the
          // row becoming a block of colour.
          ? "bg-accent-amber/10 text-accent-amber"
          : "flow-card bg-bg-surface text-text-muted",
      )}
    >
      {icon ? (
        <span
          className={cn(
            "shrink-0 transition-colors duration-[var(--motion-base)]",
            selected ? "text-accent-amber" : "text-text-subtle",
          )}
          aria-hidden
        >
          {icon}
        </span>
      ) : null}

      <span className="min-w-0 flex-1 text-[0.9rem] leading-snug">{label}</span>

      {/* The tick resolves to a filled white mark, the same settled state a
          logged dose uses. */}
      <span
        aria-hidden
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
          "transition-all duration-[var(--motion-base)] ease-[var(--motion-ease)]",
          "motion-reduce:transition-none",
          selected
            ? "bg-accent-amber text-bg-base"
            : "border-[0.5px] border-border-strong bg-transparent",
        )}
      >
        {selected ? <Check className="h-3 w-3" weight="bold" /> : null}
      </span>
    </button>
  );
}

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

/**
 * Two-or-more-way segmented control. The active selection is white, per
 * "the active selection in a control is white".
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly SegmentedOption<T>[];
  value: T | null;
  onChange: (next: T) => void;
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flow-card flex w-full gap-1 rounded-xl bg-bg-surface p-1"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "h-11 flex-1 rounded-[0.625rem] text-[0.9rem]",
              "transition-all duration-[var(--motion-base)] ease-[var(--motion-ease)]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              "motion-reduce:transition-none",
              active
                ? "bg-accent-primary font-medium text-bg-base"
                : "bg-transparent text-text-muted",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The consent row (§9 Screen 1). A single tick covering Terms, Medical
 * Disclaimer and Privacy, with each document reachable. The links open in a new
 * tab so a user reading the Terms does not lose the flow behind them.
 */
export function ConsentRow({
  checked,
  onToggle,
  children,
}: {
  checked: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flow-card flex items-start gap-3 rounded-2xl bg-bg-surface p-4">
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-labelledby="consent-copy"
        onClick={onToggle}
        className={cn(
          "mt-[0.1rem] flex h-5 w-5 shrink-0 items-center justify-center rounded-[0.375rem]",
          // The tick stays 20px; the TARGET is grown to 44 with a transparent
          // pseudo-element, the same trick the weight toggle uses. This is the
          // control that gates the entire flow and it was the smallest thing on
          // the screen. (An earlier attempt at this edit targeted a class string
          // that does not exist here and silently changed nothing.)
          "relative before:absolute before:-inset-3 before:content-['']",
          "transition-all duration-[var(--motion-base)] ease-[var(--motion-ease)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "motion-reduce:transition-none",
          checked
            ? "bg-accent-primary text-bg-base"
            : "border-[0.5px] border-border-strong",
        )}
      >
        {checked ? <Check className="h-3.5 w-3.5" weight="bold" /> : null}
      </button>

      <p
        id="consent-copy"
        className="min-w-0 flex-1 text-[0.8rem] leading-relaxed text-text-muted"
      >
        {children}
      </p>
    </div>
  );
}

/** A labelled field row, used by the date input on housekeeping. */
export function FieldRow({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label
        htmlFor={htmlFor}
        className={CARD_EYEBROW + " block"}
      >
        {label}
      </label>
      {children}
    </div>
  );
}
