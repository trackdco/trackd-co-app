"use client";

import type { ReactNode } from "react";

import { Check } from "@/components/icons";
import { cn } from "@/lib/utils";

/**
 * Onboarding form controls (Spec 3-01 §11 component list): multi-select chip,
 * segmented control, consent row.
 *
 * Built from the documented tokens and the radius scale, so they read as the
 * same system as the app they lead into. Onboarding-scoped by design.
 */

/**
 * A multi-select chip. Selected reads WHITE, not amber: a set of six selected
 * chips would be six amber beats on one screen, which is exactly the blanket
 * amber `ui-context.md` retired. Amber stays for the single live moment.
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
          ? "bg-bg-surface-raised text-foreground"
          : "bg-bg-surface text-text-muted",
      )}
    >
      {icon ? (
        <span
          className={cn(
            "shrink-0 transition-colors duration-[var(--motion-base)]",
            selected ? "text-foreground" : "text-text-subtle",
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
            ? "bg-accent-primary text-bg-base"
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
      className="flex w-full gap-1 rounded-xl bg-bg-surface p-1"
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
    <div className="flex items-start gap-3 rounded-2xl bg-bg-surface p-4">
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-labelledby="consent-copy"
        onClick={onToggle}
        className={cn(
          "mt-[0.1rem] flex h-5 w-5 shrink-0 items-center justify-center rounded-[0.375rem]",
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
        className="block text-[10px] font-sans uppercase tracking-[0.18em] text-text-muted"
      >
        {label}
      </label>
      {children}
    </div>
  );
}
