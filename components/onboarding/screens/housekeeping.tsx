"use client";

import Link from "next/link";
import { useId, useRef, useState } from "react";

import { Camera } from "@/components/icons";
import { track } from "@/lib/onboarding/analytics";
import { ageVerdict, canLeaveHousekeeping } from "@/lib/onboarding/session";

import { FlowCta, StepFrame } from "../chrome";
import { ConsentRow, FieldRow, Segmented } from "../controls";
import { useFlow } from "../flow-context";

/**
 * Screen 1 — the setup screen, and THE AGE GATE (Spec 3-01 §3.2, §9).
 *
 * The legally required part is unchanged: DOB, sex and consent are captured
 * before any substance-adjacent content and before any payment path, and
 * `canLeaveHousekeeping` is the only thing that opens the button, so there is
 * no onward path for an under-18 and none without consent.
 *
 * What changed is what sits alongside it. The spec kept this screen lean and
 * took the name from Google at the paywall (D-2, default: no name field).
 * Adrian overrode that: he wants the user to feel they have already built
 * something of their own before the demo, so name and photo are asked for here
 * and Welcome greets them with both. The photo is local-only and optional; the
 * name is required, because a greeting with a blank in it is worse than no
 * greeting.
 *
 * Still no account. Nothing on this screen touches Postgres.
 */
export function HousekeepingScreen() {
  const { session, patch, goNext, todayKey } = useFlow();
  const nameId = useId();
  const dobId = useId();
  const [photo, setPhoto] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const verdict = ageVerdict(session.dob, todayKey);
  const canContinue = canLeaveHousekeeping(session, todayKey);

  const onPickPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhoto((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(file);
    });
  };

  const onContinue = () => {
    if (!canContinue) return;
    track("age_gate_passed");
    goNext();
  };

  return (
    <StepFrame
      title="Set up your account"
      sub="Takes about a minute."
      footer={
        <FlowCta onClick={onContinue} disabled={!canContinue}>
          Continue
        </FlowCta>
      }
    >
      <div className="space-y-6">
        {/* Name and photo together: one row that reads as "this is you". */}
        <div className="flex items-end gap-4">
          <div className="shrink-0">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              aria-label="Add a profile photo"
              className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-bg-surface transition-all duration-[var(--motion-base)] ease-[var(--motion-ease)] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
            >
              {photo ? (
                // A local object URL, not an upload. next/image would want a
                // configured loader for a blob: URL and buys nothing here.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photo} alt="" className="h-full w-full object-cover" />
              ) : (
                <Camera className="h-5 w-5 text-text-subtle" />
              )}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={onPickPhoto}
              className="sr-only"
            />
          </div>

          <div className="min-w-0 flex-1">
            <FieldRow label="Your name" htmlFor={nameId}>
              <input
                id={nameId}
                type="text"
                value={session.name ?? ""}
                onChange={(e) => patch({ name: e.target.value || null })}
                placeholder="First name"
                autoComplete="given-name"
                enterKeyHint="next"
                maxLength={60}
                className="h-13 w-full rounded-xl bg-bg-input px-4 text-[0.95rem] text-foreground outline-none placeholder:text-text-subtle focus-visible:ring-2 focus-visible:ring-ring"
              />
            </FieldRow>
          </div>
        </div>

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
            Sets the reference ranges and which body the site map draws.
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
