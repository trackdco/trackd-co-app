"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { claimOnboardingSession } from "@/app/onboarding/actions";
import { track } from "@/lib/onboarding/analytics";
import { readSession } from "@/lib/onboarding/session";
import type { StepId } from "@/lib/onboarding/steps";
import type { ClaimStatus } from "@/app/onboarding/actions";

/**
 * The device half of the answer handoff (Spec w2b-14, step 4).
 *
 * ## Why it runs here and not on the sign-in button
 *
 * Every auth path leaves the page and comes back through a full document load —
 * Google via `/auth/callback`, email confirmation via the inbox and
 * `/auth/confirm`, email sign-in via the hard navigate in
 * `app/login/actions.ts`. No callback, no promise and no React state survives
 * that. The only reliable moment to claim the answers is ON ARRIVAL, which is
 * what this is.
 *
 * ## It fires on a SESSION, not on a step
 *
 * It used to fire only on a step whose phase is `authed`, and a cold review
 * showed what that costs: one failed claim, the user taps past the retry banner
 * to the end of the flow, and there is no way back. Re-entering `/onboarding`
 * lands on `hook` — an anonymous step — so the claim never fired again and the
 * key sat on the device forever, taking the 18+/ToS gate with it (so the user
 * was then sent to `/welcome` to re-answer what onboarding had already asked).
 *
 * `signedIn` comes from the server (`app/onboarding/page.tsx`), so ANY visit to
 * the flow by a signed-in user with answers still on the device now claims them.
 *
 * ## The ordering is the whole feature
 *
 * Write, confirm, THEN clear. `clearSession()` is called only for a status the
 * server returned, and never for `no-session` or `error`. If the write fails the
 * device copy is untouched — the answers exist in exactly one place until the
 * server says otherwise, so an optimistic clear would be a silent,
 * unrecoverable loss on the single most invested user in the flow.
 *
 * ## The empty case is normal, not an error
 *
 * Safari clears storage more aggressively than you expect, an installed iOS PWA
 * gets its own storage container, and a confirmation link can be opened in a
 * different browser entirely. So arriving with nothing to claim is expected: the
 * call still runs, because the server can answer with the name already on the
 * account, which is what the Welcome screen needs after a reload.
 */

/**
 * How many times to retry on its own before saying anything.
 *
 * Almost every failure here is transient — a cold function, an auth server
 * blip, a phone changing towers between the redirect and the claim. Showing a
 * banner for those trains the user to ignore the one that matters, and the
 * banner is the only recovery there is. So the quiet attempts happen first.
 *
 * Backed off rather than immediate: three requests inside a second all fail for
 * the same reason the first one did.
 */
const AUTO_RETRIES = 2;
const BACKOFF_MS = [1200, 4000];

export function AnswerHandoff({
  signedIn,
  step,
  onResolved,
}: {
  /** Server-verified. See `app/onboarding/page.tsx`. */
  signedIn: boolean;
  /** The step on screen. Only used to decide WHEN to try again — see the effect. */
  step: StepId;
  /**
   * Every non-error outcome, handed to the flow to act on. `name` is whichever
   * row won; `gated` says whether the account now passes the 18+/ToS gate, which
   * is what decides where the account screen sends the user next.
   */
  onResolved: (status: ClaimStatus, name: string | null, gated: boolean) => void;
}) {
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  // A claim has SUCCEEDED. Nothing retries after this.
  const done = useRef(false);
  // Which trigger last fired, so a re-render does not re-enter. Refs rather than
  // state because neither must cause a render, and the effect below must not
  // re-run when `busy` flips.
  const firedFor = useRef<string | null>(null);
  // Cancels an in-flight backoff if the component goes away mid-sleep.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /** One attempt. Returns whether it is worth trying again. */
  const attempt = useCallback(async (): Promise<boolean> => {
    try {
      // Read at CALL time, not at mount. A retry has to send whatever is on the
      // device now, and reading it into a closure would pin the first attempt's
      // snapshot for the life of the screen.
      const result = await claimOnboardingSession(readSession());

      if (result.status === "error") return true;

      // Neither of these is a failure, and neither may clear or latch anything.
      //  - `no-session` is a signed-out visitor; the server guard sends them
      //    away, not this component. It is no longer reachable for a transient
      //    auth outage — the action reports that as `error` — so it now means
      //    what it says.
      //  - `nothing-to-claim` is a device with no answers on an account with
      //    none yet. Latching would be actively harmful: the device that DOES
      //    hold the answers still has to be able to claim them.
      if (result.status === "no-session" || result.status === "nothing-to-claim") {
        onResolved(result.status, null, result.gated);
        return false;
      }

      // THE ONLY SERVER-CONFIRMED "there is an account" MOMENT in the flow, so
      // it is where `auth_completed` belongs. The paywall used to fire it beside
      // a stubbed trial under `method: "preview"`, reporting a sign-in that had
      // not happened on a screen that could not do one.
      track("auth_completed", {
        claim: result.status,
        returning: result.status === "already-claimed",
      });

      // CONFIRMED. This is the only line the flow is allowed to clear on, and
      // it is reached only for "written" or "already-claimed".
      done.current = true;
      onResolved(result.status, result.name, result.gated);
      return false;
    } catch {
      // A network blip, a serialisation failure, a cold function timing out.
      // Same treatment as a server-reported error. Never let a rejection escape
      // and take the flow with it.
      return true;
    }
  }, [onResolved]);

  const claim = useCallback(
    async (autoRetries: number) => {
      setBusy(true);
      setFailed(false);
      try {
        for (let i = 0; i <= autoRetries; i += 1) {
          const shouldRetry = await attempt();
          if (!shouldRetry) return;
          if (i === autoRetries) break;
          await new Promise((r) => setTimeout(r, BACKOFF_MS[i] ?? 4000));
          if (!alive.current) return;
        }
        setFailed(true);
      } finally {
        setBusy(false);
      }
    },
    [attempt],
  );

  /**
   * WHEN TO TRY.
   *
   * On arrival, and again on reaching the account screen — and once a claim has
   * succeeded, never again.
   *
   * The second trigger is not belt-and-braces, it is a dead end otherwise. A
   * signed-in account that has NOT passed the age gate and has no answers on the
   * device (signed up at `/login`, or opened a confirmation link on a second
   * machine) is sent by the route guard to the account step, where the client
   * clamp then correctly walks it back to `name` — there is genuinely nothing to
   * claim yet. The user answers the questions, walks forward, and arrives at the
   * account screen WITH answers. Firing only on mount would leave them looking
   * at a spinner that never resolves.
   */
  useEffect(() => {
    if (!signedIn || done.current) return;
    const trigger = step === "account" ? "account" : "arrival";
    if (firedFor.current === trigger) return;
    firedFor.current = trigger;
    void claim(AUTO_RETRIES);
  }, [signedIn, step, claim]);

  if (!failed) return null;

  return (
    /**
     * The retry.
     *
     * `--state-error` is a sanctioned use — `ui-context.md` reserves the state
     * colours for system feedback, and a save that did not land is exactly that.
     * It is a hairline outline rather than a filled alarm: the user is signed
     * in, their trial is unaffected and their answers are safe on the device.
     * The only thing wrong is that we have not copied them up yet.
     *
     * A press here gets NO automatic retries — the quiet ones have already been
     * spent, and a button that sits there saying "Saving…" for six seconds reads
     * as broken.
     */
    <div
      role="alert"
      className="mx-5 mb-2 flex shrink-0 items-center gap-3 rounded-xl border border-[var(--state-error)]/40 bg-bg-surface px-4 py-3"
    >
      <p className="min-w-0 flex-1 text-[0.8rem] leading-relaxed text-text-muted">
        We couldn&apos;t save your answers just now. They&apos;re still here.
      </p>
      <button
        type="button"
        onClick={() => void claim(0)}
        disabled={busy}
        className="shrink-0 rounded-lg bg-bg-surface-raised px-3 py-2 text-[0.8rem] text-foreground transition-opacity disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {busy ? "Saving…" : "Try again"}
      </button>
    </div>
  );
}
