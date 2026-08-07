"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { claimOnboardingSession } from "@/app/onboarding/actions";
import { track } from "@/lib/onboarding/analytics";
import { readSession } from "@/lib/onboarding/session";
import { stepMeta, type StepId } from "@/lib/onboarding/steps";

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
 * what this is: mounted by the flow, it fires once the flow is standing on a
 * step that has a session behind it.
 *
 * ## The ordering is the whole feature
 *
 * Write, confirm, THEN clear. `clearSession()` is called only for a status the
 * server returned, and never for `no-session` or `error`. If the write fails the
 * device copy is untouched and a retry appears — the answers exist in exactly
 * one place until the server says otherwise, so an optimistic clear would be a
 * silent, unrecoverable data loss on the single most invested user in the flow.
 *
 * ## The empty case is normal, not an error
 *
 * Safari clears storage more aggressively than you expect, an installed iOS PWA
 * gets its own storage container, and a confirmation link can be opened in a
 * different browser entirely. So arriving with nothing to claim is expected: the
 * call still runs, because the server can answer with the name already on the
 * account, which is what the Welcome screen needs after a reload.
 */
export function AnswerHandoff({
  step,
  onClaimed,
}: {
  step: StepId;
  /** Called once the server confirms. `name` is whichever row won. */
  onClaimed: (name: string | null) => void;
}) {
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  // ONE ATTEMPT PER PAGE LOAD, not one per step change. The flow re-renders on
  // every screen and `step` changes as the user walks forward; without this the
  // claim would fire again on `welcome`, on `notifications`, and on every step
  // after that. A ref rather than state because it must not cause a render.
  const attempted = useRef(false);

  const claim = useCallback(async () => {
    setBusy(true);
    setFailed(false);
    try {
      // Read at CALL time, not at mount. A retry has to send whatever is on the
      // device now, and reading it into a closure would pin the first attempt's
      // snapshot for the life of the screen.
      const result = await claimOnboardingSession(readSession());

      if (result.status === "error") {
        setFailed(true);
        return;
      }
      // Neither of these is a failure, and neither may clear or latch anything.
      //  - `no-session` is a signed-out visitor at a post-account step; the
      //    server guard sends them away, not this component.
      //  - `nothing-to-claim` is a device with no answers on an account with
      //    none yet — a confirmation link opened on a second device, most
      //    likely. Latching would be actively harmful: the device that DOES
      //    hold the answers still has to be able to claim them.
      if (result.status === "no-session" || result.status === "nothing-to-claim") {
        return;
      }

      // THE ONLY SERVER-CONFIRMED "there is an account" MOMENT in the flow, so
      // it is where `auth_completed` belongs. The paywall used to fire it beside
      // a stubbed trial under `method: "preview"`, reporting a sign-in that had
      // not happened on a screen that could not do one.
      track("auth_completed", {
        claim: result.status,
        returning: result.status === "already-claimed",
      });

      // CONFIRMED. This is the only line allowed to drop the device copy, and
      // it is reached only for "written" or "already-claimed".
      onClaimed(result.name);
    } catch {
      // A network blip, a serialisation failure, a cold function timing out.
      // Same treatment as a server-reported error: keep the answers, offer the
      // retry. Never let a rejection escape and take the flow with it.
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }, [onClaimed]);

  const phase = stepMeta(step)?.phase;
  useEffect(() => {
    if (phase !== "authed" || attempted.current) return;
    attempted.current = true;
    void claim();
  }, [phase, claim]);

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
        onClick={() => void claim()}
        disabled={busy}
        className="shrink-0 rounded-lg bg-bg-surface-raised px-3 py-2 text-[0.8rem] text-foreground transition-opacity disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {busy ? "Saving…" : "Try again"}
      </button>
    </div>
  );
}
