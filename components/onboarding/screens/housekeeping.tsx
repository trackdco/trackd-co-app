"use client";

import Link from "next/link";
import { useId } from "react";

import { track } from "@/lib/onboarding/analytics";
import { ageVerdict, canLeaveHousekeeping } from "@/lib/onboarding/session";

import { FlowCta, StepFrame } from "../chrome";
import { ConsentRow, FieldRow, Segmented } from "../controls";
import { useFlow } from "../flow-context";

/**
 * Screen 1 — Quick housekeeping. THE AGE GATE (Spec 3-01 §3.2, §9).
 *
 * The only legally-required data, captured before any substance-adjacent
 * content and before any payment path. Continue is disabled until consent is
 * ticked AND the DOB resolves to 18+ AND a sex is chosen; there is no onward
 * path for an under-18 and none for a skipped consent, because the button is
 * the only way forward and `canLeaveHousekeeping` is the only thing that opens
 * it.
 *
 * No name field: the name comes from Google at the paywall (§6).
 */
export function HousekeepingScreen() {
  const { session, patch, goNext, todayKey } = useFlow();
  const dobId = useId();

  const verdict = ageVerdict(session.dob, todayKey);
  const canContinue = canLeaveHousekeeping(session, todayKey);

  const onContinue = () => {
    if (!canContinue) return;
    track("age_gate_passed");
    goNext();
  };

  return (
    <StepFrame
      title="Quick housekeeping"
      sub="Trackd is for adults 18+. Required before we go further."
      footer={
        <FlowCta onClick={onContinue} disabled={!canContinue}>
          Continue
        </FlowCta>
      }
    >
      <div className="space-y-6">
        <FieldRow label="Date of birth" htmlFor={dobId}>
          <input
            id={dobId}
            type="date"
            value={session.dob ?? ""}
            max={todayKey}
            // The value is taken EXACTLY as the field reports it. An empty
            // change event is empty, never "today": a native wheel picker fires
            // one mid-pick, and coercing it is how a back-dated entry ends up
            // saved under today (wave3, commit ed3eed5).
            onChange={(e) => patch({ dob: e.target.value || null })}
            className="h-13 w-full rounded-xl bg-bg-input px-4 text-[0.95rem] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring [color-scheme:dark]"
          />

          {/* Categorical, plain, and never alarming. A blocked date states the
              fact and stops; it does not warn. */}
          {verdict === "under" ? (
            <p role="alert" className="text-[0.8rem] leading-relaxed text-text-muted">
              Trackd is for adults 18 and over. You cannot continue.
            </p>
          ) : null}
          {verdict === "future" ? (
            <p role="alert" className="text-[0.8rem] leading-relaxed text-text-muted">
              That date is in the future. Check the year.
            </p>
          ) : null}
        </FieldRow>

        <FieldRow label="Sex">
          <Segmented
            label="Sex"
            value={session.sex}
            onChange={(sex) => patch({ sex })}
            options={[
              { value: "male", label: "Male" },
              { value: "female", label: "Female" },
            ]}
          />
          <p className="text-[0.75rem] leading-relaxed text-text-subtle">
            Sets the reference ranges and the body map. You can change it later.
          </p>
        </FieldRow>

        <ConsentRow
          checked={session.consent}
          onToggle={() => patch({ consent: !session.consent })}
        >
          I&apos;m 18 or older and accept the{" "}
          <Link href="/terms" className="text-text-primary underline-offset-2">
            Terms of Service
          </Link>
          ,{" "}
          <Link
            href="/medical-disclaimer"
            className="text-text-primary underline-offset-2"
          >
            Medical Disclaimer
          </Link>
          , and{" "}
          <Link href="/privacy" className="text-text-primary underline-offset-2">
            Privacy Policy
          </Link>
          .
        </ConsentRow>
      </div>
    </StepFrame>
  );
}
