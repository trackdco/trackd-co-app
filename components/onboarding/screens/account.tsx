"use client";

import { EmailPasswordForm } from "@/components/auth/email-password-form";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { FLOW_EMPHASIS } from "@/lib/ui-presets";

import { StepFrame } from "../chrome";

/**
 * The account screen (Spec w2b-14) — the last anonymous step, immediately
 * before the paywall.
 *
 * ## It is framed as KEEPING work, not as a gate
 *
 * By the time someone reaches this screen they have answered five questions and
 * driven the demo, and every bit of that lives in one `localStorage` key on one
 * device. The screen's job is to say so. It is deliberately NOT phrased as
 * "sign up", "register", or "create an account to continue" — a toll in front of
 * a price the user has not been shown yet is the fastest way to lose them at the
 * exact moment they have invested the most.
 *
 * ## Nothing here mentions money
 *
 * No price, no trial length, no "next you'll…". The price is revealed on the
 * paywall and nowhere earlier, which is spec §Framing and is also what stops
 * this screen reading as the first half of a checkout.
 *
 * ## Nothing here is skippable
 *
 * There is no skip link and no guest path. The account is what the next screen
 * and every screen after it assume exists.
 *
 * ## The controls are MOVED, not redesigned
 *
 * `GoogleSignInButton` and `EmailPasswordForm` are the same components `/login`
 * mounts, in the same order, with the same treatment and the same divider
 * between them. Nothing is restyled — the only per-caller difference is where
 * they land afterwards, and which half of the email form opens first.
 */

/**
 * WHERE AUTH RETURNS TO.
 *
 * Both providers leave the page — Google navigates to accounts.google.com and
 * back, email confirmation goes via the inbox — so neither can resume the client
 * flow by calling `goNext()`. Both come back through a real HTTP request, and
 * this is the URL they come back to.
 *
 * It is the paywall rather than this screen for two reasons: this screen has
 * nothing left to ask a signed-in user, and landing back here would show a
 * sign-in form to someone who is already signed in. (The redirect that enforces
 * that in the other direction is added in a later step.)
 */
const AUTH_RETURN = "/onboarding?step=paywall";

export function AccountScreen() {
  return (
    <StepFrame
      title={
        <>
          Let&apos;s make sure this <em className={FLOW_EMPHASIS}>sticks</em>.
        </>
      }
      sub="Everything you've set up so far lives on this phone and nowhere else. Save it to an account and it's still here tomorrow, on whichever device you open."
    >
      <div className="flex w-full flex-1 flex-col justify-center pb-4">
        <GoogleSignInButton next={AUTH_RETURN} />

        {/* The login screen's divider, verbatim. */}
        <div className="my-5 flex items-center gap-3" aria-hidden>
          <span className="h-[0.5px] flex-1 bg-border-default" />
          <span className="text-xs text-text-subtle">or</span>
          <span className="h-[0.5px] flex-1 bg-border-default" />
        </div>

        {/* Opens on sign-UP here, unlike /login. Almost everyone reaching this
            screen is new — they have just walked eleven screens of a first-run
            flow — and the "Already have an account? Sign in" toggle the form
            already carries covers the one who is not. */}
        <EmailPasswordForm next={AUTH_RETURN} defaultMode="signup" />
      </div>
    </StepFrame>
  );
}
