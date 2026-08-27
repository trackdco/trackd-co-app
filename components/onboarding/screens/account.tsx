"use client";

import { useState } from "react";

import { CircleNotch } from "@/components/icons";
import { EmailPasswordForm } from "@/components/auth/email-password-form";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";

import { StepFrame } from "../chrome";
import { useFlow } from "../flow-context";

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
 * **The wording is Adrian's pick (2026-08-08)** from four directions: ownership,
 * over loss-framing ("Don't lose this"), the long-game argument ("this gets more
 * valuable the longer you keep it") and a flat functional one ("Save your
 * setup"). It reframes what they have just driven from a demo into the thing
 * that becomes theirs, which is the only one of the four that makes the account
 * sound like a gain rather than an insurance policy.
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
 * WHERE AUTH RETURNS TO — AND IT IS THIS SCREEN, NOT THE PAYWALL.
 *
 * Both providers leave the page: Google navigates to accounts.google.com and
 * back, email confirmation goes via the inbox. Neither can resume the client
 * flow by calling `goNext()`, so both come back through a real HTTP request.
 *
 * It used to be `?step=paywall`, and a cold review showed why that cannot work
 * once the paywall requires a PROVEN age rather than a bare session: the thing
 * that proves it is the claim, the claim needs this device's `localStorage`, and
 * `localStorage` is not readable by the server deciding the redirect. Landing on
 * the paywall meant being bounced straight back off it.
 *
 * So the user returns HERE, the claim runs, and the flow moves them on once the
 * gate is written (`onClaimed` in `flow.tsx`). A fully gated user never sees
 * this screen at all — `app/onboarding/page.tsx` 307s them to the paywall before
 * a byte of it renders.
 */
const AUTH_RETURN = "/onboarding?step=account";

export function AccountScreen() {
  const { signedIn } = useFlow();

  /**
   * Whether the form is showing its SIGN-IN half.
   *
   * Mirrored here only so the heading can follow it — the form still owns the
   * mode. Starts false because the form opens on sign-up: almost everyone
   * reaching this screen has just walked eleven screens of a first-run flow.
   */
  const [returning, setReturning] = useState(false);

  /**
   * SIGNED IN, AND STILL HERE. The claim is in flight.
   *
   * Showing the sign-in controls to someone who has just signed in is the exact
   * thing §Back navigation calls out, and it would also invite a second sign-in
   * on top of the first. This is a couple of seconds at most: the handoff fires
   * on mount and moves the user the moment the server confirms.
   *
   * No CTA, deliberately. There is nothing for a tap to do that waiting does not
   * already do, and a button that appears to be the way forward while the real
   * way forward is a network call is how a double-submit gets invented.
   */
  if (signedIn) {
    return (
      <StepFrame
        center
        title="Saving your setup."
        sub="One moment. We're putting everything you've done onto your account."
      >
        <div className="flex justify-center pt-2" aria-hidden>
          <CircleNotch className="h-6 w-6 animate-spin text-text-subtle" />
        </div>
      </StepFrame>
    );
  }

  return (
    <StepFrame
      // `pt-8` over the frame's own `pt-2`: the header pins to the top on a
      // screen with a form under it, and against the top edge it read "way too
      // high" on a handset (Adrian, 2026-08-27). `center` is not the fix — this
      // screen has a real form beneath it, which is the case `center` is
      // explicitly NOT for (see StepFrame).
      className="pt-8"
      title={returning ? "Welcome back." : "Let's get you started."}
      // The demo/every-device pitch is gone: it argued the VALUE of an account
      // on the screen that asks for one, which is the moment to say plainly
      // what to do instead of selling again (Adrian, 2026-08-27).
      sub={
        returning
          ? "Sign in below and pick up exactly where you left off."
          : "Select one of the options below and create an account."
      }
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
        <EmailPasswordForm
          next={AUTH_RETURN}
          defaultMode="signup"
          // The heading lives outside the form, so without this a returning
          // user who taps "Sign in" is still told to create an account
          // (Adrian, 2026-08-27).
          onModeChange={(mode) => setReturning(mode === "signin")}
        />
      </div>
    </StepFrame>
  );
}
