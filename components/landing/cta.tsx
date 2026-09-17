import Link from "next/link";

import { cn } from "@/lib/utils";

/** Where every call to action on the public pages goes: the onboarding quiz. */
export const START_HREF = "/start";

/** The existing sign-in route. */
export const LOGIN_HREF = "/login";

/**
 * The line under a call to action (Adrian, 2026-09-17). It was "Cancel in one
 * tap", and review flagged that cancelling is Billing, Cancel, a confirm and
 * sometimes a retention offer, so the line promised more than the app does.
 *
 * ⚠️ It sits BENEATH the button as its own text, never inside it (spec 3-03
 * §3.2).
 */
export const TRIAL_LINE = "7-day free trial. Cancel anytime.";

/**
 * THE BUTTON. Gradient-filled and outlined; the whole recipe, including why the
 * ink is `--bg-base` rather than white, is `.lp-cta` in `globals.css`.
 *
 * `data-cta` is how the docked widget knows a call to action is already on
 * screen and gets out of the way, so two of the same button are never in view
 * at once.
 */
export function StartButton({
  label = "Start tracking",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <Link href={START_HREF} data-cta className={cn("lp-cta", className)}>
      <span aria-hidden className="lp-cta-sheen" />
      {label}
    </Link>
  );
}

/**
 * "Already a current user? Log in" (Adrian, 2026-09-17), with the link
 * underlined. Under the hero button and in the docked widget.
 *
 * "Log in" rather than "Login": the verb, which is how the app's own sign-in
 * link has always read.
 */
export function LoginLine({ className }: { className?: string }) {
  return (
    <p className={cn("text-xs text-text-secondary", className)}>
      Already a current user?{" "}
      <Link
        href={LOGIN_HREF}
        className="rounded-sm text-foreground underline decoration-text-secondary underline-offset-[3px] transition-colors hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
      >
        Log in
      </Link>
    </p>
  );
}

/**
 * The button with its trial line beneath it, and optionally the sign-in line.
 * `align="start"` left-aligns the group from the laptop breakpoint up, for the
 * two-column hero; on a phone everything is centred.
 */
export function PrimaryCta({
  label,
  withLogin = false,
  align = "center",
  className,
}: {
  label?: string;
  withLogin?: boolean;
  align?: "center" | "start";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-4 text-center",
        align === "start" && "lg:items-start lg:text-left",
        className,
      )}
    >
      <StartButton label={label} className="w-full max-w-[20rem]" />
      <div className="space-y-1.5">
        <p className="text-xs text-text-secondary">{TRIAL_LINE}</p>
        {withLogin ? <LoginLine /> : null}
      </div>
    </div>
  );
}
