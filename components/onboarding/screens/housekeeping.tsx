"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

import { Camera } from "@/components/icons";
import { track } from "@/lib/onboarding/analytics";
import {
  ageVerdict,
  canLeaveHousekeeping,
  parseDateKey,
} from "@/lib/onboarding/session";

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
  /**
   * The date field's own value, separate from the session's.
   *
   * A date input has intermediate states that are not answers — half-typed on a
   * desktop, and on iOS empty over and over while the WHEEL is still turning.
   * Binding it straight to the session meant every one of those was treated as
   * the user's answer. Keeping a draft lets the field say whatever it currently
   * says while the session only ever holds a complete date.
   */
  const [dobDraft, setDobDraft] = useState(session.dob ?? "");
  const fileRef = useRef<HTMLInputElement>(null);

  const verdict = ageVerdict(session.dob, todayKey);
  const canContinue = canLeaveHousekeeping(session, todayKey);

  // The object URL is revoked when replaced AND when the screen goes, or the
  // blob outlives the flow.
  useEffect(
    () => () => {
      if (photo) URL.revokeObjectURL(photo);
    },
    [photo],
  );

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
      // Pulls the form up under the header. Every other screen keeps the
      // flow's default rhythm; this one is the tallest and the only one where
      // the primary action fell off a real phone.
      className="[&>div:nth-child(2)]:pt-4"
      title="Make Trackd yours"
      sub="Quick housekeeping first."
      footer={
        <FlowCta onClick={onContinue} disabled={!canContinue}>
          Continue
        </FlowCta>
      }
    >
      {/* TIGHT ON PURPOSE. Measured on Adrian's own phone (402x874 at 3x, so
          about 700 of usable height once Safari's bars are up): this screen ran
          85px past the bottom, which put the only way forward off the screen on
          the one page you cannot skip. Everything here is a notch smaller than
          the flow's default rhythm, and it is the only screen that needs to be. */}
      <div className="space-y-3">
        {/* The photo is the centrepiece and larger than everything else
            (Adrian, 2026-08-01) — the first thing on the screen should feel
            like it is about them, not like a form field. */}
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            aria-label="Add a profile photo"
            className="flow-card flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-bg-surface transition-all duration-[var(--motion-base)] ease-[var(--motion-ease)] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
          >
            {photo ? (
              // A local object URL, not an upload. next/image would want a
              // configured loader for a blob: URL and buys nothing here.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo} alt="" className="h-full w-full object-cover" />
            ) : (
              <Camera className="h-6 w-6 text-text-subtle" />
            )}
          </button>
          <div className="text-center">
            <p className="text-[0.8rem] text-foreground">
              {photo ? "Tap to change" : "Add a photo"}
              {photo ? null : (
                <span className="text-text-subtle">{" "}(optional)</span>
              )}
            </p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={onPickPhoto}
            // Not a tab stop: it is 1x1px with no visible focus, and the button
            // above it already opens the picker.
            tabIndex={-1}
            aria-hidden
            className="sr-only"
          />
        </div>

        <FieldRow label="First name" htmlFor={nameId}>
          <input
            id={nameId}
            type="text"
            value={session.name ?? ""}
            onChange={(e) => patch({ name: e.target.value || null })}
            placeholder="First name"
            autoComplete="given-name"
            enterKeyHint="next"
            maxLength={24}
            className="h-12 w-full rounded-xl bg-bg-input px-4 text-[0.95rem] text-foreground outline-none placeholder:text-text-subtle focus-visible:ring-2 focus-visible:ring-ring"
          />
        </FieldRow>

        <FieldRow label="Date of birth" htmlFor={dobId}>
          <input
            id={dobId}
            type="date"
            value={dobDraft}
            max={todayKey}
            /**
             * ONLY A COMPLETE DATE IS AN ANSWER. THIS IS WHY NOBODY COULD GET
             * PAST THIS SCREEN ON AN IPHONE (Adrian, 2026-08-01).
             *
             * iOS renders a date input as a WHEEL and fires `change` while it is
             * still turning, including with an empty value. The field used to be
             * bound straight to the session and took each of those exactly as
             * reported — so one wiped a date the user had already committed,
             * `canLeaveHousekeeping` went back to false, Continue greyed out,
             * and there was no way forward at all. Reproduced at 390x844,
             * 390x660 and 360x560 by dispatching a native empty change through
             * React's value setter, the closest a desktop browser gets to a
             * wheel.
             *
             * The comment this replaces had the right OBSERVATION and drew the
             * wrong conclusion for this field. Refusing to coerce an empty to
             * "today" is correct for a JOURNAL date, where a coerced value
             * silently mis-files an entry under the wrong day. A date of birth
             * has no such failure mode: an empty one is not a wrong answer, it
             * is no answer, and destroying a good one only locks the user out.
             *
             * Simply ignoring empties was tried and was worse: the input is
             * controlled, so React put the old date straight back, which would
             * also fight anyone retyping a year on a desktop. Hence the draft —
             * the field shows whatever it currently says, and the session takes
             * it only when it parses. Blur settles it either way, so clearing on
             * purpose still works.
             */
            onChange={(e) => {
              const next = e.target.value;
              setDobDraft(next);
              if (parseDateKey(next)) patch({ dob: next });
            }}
            onBlur={(e) => {
              const settled = e.target.value;
              patch({ dob: parseDateKey(settled) ? settled : null });
            }}
            className="h-12 w-full rounded-xl bg-bg-input px-4 text-[0.95rem] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring [color-scheme:dark]"
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
        </FieldRow>

        <ConsentRow
          checked={session.consent}
          onToggle={() => patch({ consent: !session.consent })}
        >
          I&apos;m 18 or older and accept the{" "}
          <Link href="/terms" className="text-text-primary underline underline-offset-2">
            Terms of Service
          </Link>
          ,{" "}
          <Link
            href="/medical-disclaimer"
            className="text-text-primary underline underline-offset-2"
          >
            Medical Disclaimer
          </Link>
          , and{" "}
          <Link href="/privacy" className="text-text-primary underline underline-offset-2">
            Privacy Policy
          </Link>
          .
        </ConsentRow>
      </div>
    </StepFrame>
  );
}
