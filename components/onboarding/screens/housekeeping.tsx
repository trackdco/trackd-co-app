"use client";

import Link from "next/link";
import { useId, useState } from "react";

import { GenderFemale, GenderMale } from "@/components/icons";
import { track } from "@/lib/onboarding/analytics";
import {
  ageVerdict,
  canLeaveHousekeeping,
  hasAgeAndConsent,
  hasName,
  parseDateKey,
} from "@/lib/onboarding/session";
import { cn } from "@/lib/utils";

import { FlowCta, StepFrame } from "../chrome";
import { ConsentRow } from "../controls";
import { HealthConsentText } from "@/components/legal/HealthConsentText";
import { useFlow } from "../flow-context";

/**
 * Housekeeping — FOUR screens, one question each (Adrian, 2026-08-05).
 *
 * It used to be a single page carrying a photo, a name, a date of birth, a sex
 * control and a three-link consent tick. His note was that it looked cluttered,
 * and the fix is not tighter spacing: a first-run flow that opens with a form
 * reads as admin, where one question at a time reads as a conversation. It is
 * also the arrangement that makes the age gate legible instead of leaving it as
 * the fourth field down a page of product questions.
 *
 * ## The gate did not get weaker by being split
 *
 * `firstIncompleteHousekeeping` (`session.ts`) is the single thing that decides
 * where an untrusted `?step=` may land, and it walks to the EARLIEST unanswered
 * screen. A deep link to the paywall with an empty session lands on `name`.
 * Each screen's own button reads the predicate for the question it asks — and
 * only that one, because a button disabled by a field the user has not been
 * shown yet is a dead end with nothing on screen to explain it.
 *
 * Nothing here touches Postgres. The whole flow is anonymous until the paywall,
 * where the account is created and the consent becomes a real
 * `consent_records` row. The tick on `birthday` is a PRODUCT gate; it is not
 * the legal record, and it must not be mistaken for one.
 */

/* ===========================================================================
   1 — Name, and the photo
   =========================================================================== */

/**
 * NO PROFILE PHOTO, ANYWHERE (Adrian, 2026-08-05).
 *
 * It was on this screen, large, as the first thing you saw. Removed entirely
 * rather than made smaller: it was optional, it was never uploaded (the whole
 * anonymous half writes nothing), and nothing downstream read it — so it asked
 * for something personal on screen one and did nothing with it. A question with
 * no consequence is the most expensive kind on a first-run screen.
 *
 * NO SUBTITLE EITHER. "So Trackd can greet you properly" explained a field
 * nobody needs explained, and the pattern repeated on all three screens made
 * housekeeping read as a form with help text. The question IS the screen.
 */
export function NameScreen() {
  const { session, patch, goNext } = useFlow();
  const nameId = useId();

  const canContinue = hasName(session);

  return (
    <StepFrame
      center
      title="What's your name?"
      footer={
        <FlowCta onClick={goNext} disabled={!canContinue}>
          Continue
        </FlowCta>
      }
    >
      <input
        id={nameId}
        type="text"
        value={session.name ?? ""}
        onChange={(e) => patch({ name: e.target.value || null })}
        placeholder="First name"
        aria-label="First name"
        autoComplete="given-name"
        enterKeyHint="next"
        maxLength={24}
        className="h-14 w-full rounded-2xl bg-bg-input px-5 text-center text-[1.05rem] text-foreground outline-none placeholder:text-text-subtle focus-visible:ring-2 focus-visible:ring-ring"
      />
    </StepFrame>
  );
}

/* ===========================================================================
   2 — Date of birth, AND the consent. THE AGE GATE.
   =========================================================================== */

export function BirthdayScreen() {
  const { session, patch, goNext, todayKey } = useFlow();
  const dobId = useId();
  /**
   * The date field's own value, separate from the session's.
   *
   * A date input has intermediate states that are not answers — half-typed on a
   * desktop, and on iOS empty over and over while the WHEEL is still turning.
   * Binding it straight to the session meant every one of those was treated as
   * the user's answer, which is why NOBODY COULD GET PAST THIS SCREEN ON AN
   * IPHONE (Adrian, 2026-08-01): one empty event wiped a date already
   * committed, the gate closed, and there was no way forward at all.
   *
   * Refusing to coerce an empty to "today" is right for a JOURNAL date, where a
   * coerced value mis-files an entry. A date of birth has no such failure mode:
   * an empty one is not a wrong answer, it is no answer, and destroying a good
   * one only locks the user out. Hence the draft — the field shows whatever it
   * currently says, and the session takes it only when it parses.
   */
  const [dobDraft, setDobDraft] = useState(session.dob ?? "");

  const verdict = ageVerdict(session.dob, todayKey);
  const canContinue = hasAgeAndConsent(session, todayKey);

  const onContinue = () => {
    if (!canContinue) return;
    track("age_gate_passed");
    goNext();
  };

  return (
    <StepFrame
      center
      title="When were you born?"
      // The fact, and nothing about ourselves (Adrian, 2026-08-05). "so we have
      // to ask" was an apology for the one question on this flow that is not
      // optional, and apologising for an age gate invites the reader to treat
      // it as negotiable.
      sub="Trackd Co is for adults only."
      footer={
        <div className="space-y-3">
          {/* THE REFUSAL LIVES HERE, NOT UNDER THE FIELD (Adrian, 2026-08-05).
              It used to sit beside the date input reading "You cannot
              continue." — a flat refusal next to the thing they had just typed,
              which is the harshest possible place to put it. It now sits
              directly above the button it is explaining, states the rule rather
              than the verdict, and uses the destructive red so it reads as a
              stop rather than as a hint.

              `--accent-destructive` is the sanctioned colour for this: it is
              the sign-out / delete treatment, and this IS the one hard stop in
              the flow. It is UI feedback about a rule, not a health value, so
              the "state colours never touch health data" rule is not in play. */}
          {verdict === "under" ? (
            <p
              role="alert"
              className="text-center text-[0.8rem] leading-relaxed text-accent-destructive"
            >
              Trackd is for adults 18 and over.
            </p>
          ) : null}
          {verdict === "future" ? (
            <p
              role="alert"
              className="text-center text-[0.8rem] leading-relaxed text-accent-destructive"
            >
              That date is in the future. Check the year.
            </p>
          ) : null}
          <FlowCta onClick={onContinue} disabled={!canContinue}>
            Continue
          </FlowCta>
        </div>
      }
    >
      <div className="space-y-6">
        <input
          id={dobId}
          type="date"
          value={dobDraft}
          max={todayKey}
          aria-label="Date of birth"
          onChange={(e) => {
            const next = e.target.value;
            setDobDraft(next);
            /**
             * A DELIBERATE CLEAR MUST CLEAR THE SESSION TOO.
             *
             * This used to only ever WRITE a date, never remove one, so
             * emptying the field left the last good value committed: the input
             * showed nothing, Continue stayed enabled, and no refusal rendered.
             * Not a gate bypass — the date still being judged is one the user
             * really entered — but "the field says nothing and the button says
             * yes" is not a state this screen may reach.
             *
             * The iOS wheel's mid-pick empties are still ignored, which is the
             * whole reason the draft exists (2026-08-01): they arrive while the
             * field is FOCUSED and still turning. A real clear is a completed
             * interaction, and `onBlur` below settles either way.
             */
            if (parseDateKey(next)) patch({ dob: next });
            else if (next === "" && session.dob !== null && document.activeElement !== e.target) {
              patch({ dob: null });
            }
          }}
          onBlur={(e) => {
            const settled = e.target.value;
            patch({ dob: parseDateKey(settled) ? settled : null });
          }}
          /* SMALLER THAN THE NAME FIELD (Adrian, 2026-08-05: "the card of the
             calendar thing is too far, it cuts off on the page").
             iOS renders `type="date"` as a wheel whose intrinsic width is set
             by the locale's longest date string, and at `text-[1.05rem]` in a
             full-width box that overran the column on a 390 phone. A smaller
             type size and `max-w-full` keep the control inside its own card at
             every width; `min-w-0` stops the flex parent handing it its
             intrinsic width instead of the available one.

             `appearance-none` IS WHAT MAKES THE CORNERS ROUND (Adrian,
             2026-08-07: "the birthday thing cuts off, the corners should be
             rounded"). With the default `appearance: auto`, iOS Safari draws
             `input[type="date"]` as a NATIVE control and paints its own square
             box over ours: `rounded-2xl` is on the element and simply is not
             honoured, and the native box takes its own intrinsic width rather
             than the one we gave it, which is the "cuts off". Desktop Chromium
             renders the radius fine at every width, which is why this survived
             review — measured at 402, 360 and 320 with a 16px radius and no
             overflow on all three. It is only wrong on the device.

             Stripping the appearance does NOT take the picker away: the wheel
             still opens on tap, because that is the input TYPE, not its
             chrome. */
          className="h-14 w-full min-w-0 max-w-full appearance-none rounded-2xl bg-bg-input px-4 text-[0.95rem] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring [color-scheme:dark]"
        />

        {/* The tick sits WITH the date (Adrian, 2026-08-05). "I confirm I'm over
            18" belongs beside the date that proves it — on a page of its own it
            reads as fine print, and the two halves of one legal statement should
            not be separated by a navigation. */}
        {/**
          * ⚠️ THE HEALTH-DATA SENTENCE IS PART OF THIS TICK (Adrian, 2026-08-25),
          * AND THAT IS THE WHOLE FIX.
          *
          * Onboarding wrote a `consent_records` row with
          * `document: "health_data_consent"` off a tick whose sentence named
          * three documents and no health data at all — a record of an agreement
          * to words that were never on the screen, for special-category data, in
          * a health product. Measured 25 Aug 2026: 81 accounts carry that row.
          *
          * ⚠️ THE WRITE IS UNCHANGED AND DELIBERATELY SO. Stopping it would leave
          * new signups with no health consent captured at all, which is worse than
          * the defect. The record was not wrong about WHAT was agreed; it was
          * wrong that the sentence had been shown. Showing it is the fix.
          *
          * ⚠️ ONE TICK, NOT TWO (Adrian's call, overruling a mirror of
          * `/welcome`'s three separate boxes). `/welcome` makes all three
          * mandatory anyway, so separate ticks never offered a real choice — the
          * user cannot reach the app without every one of them either way. What
          * matters is that the words are SHOWN and sit inside the label, so the
          * checkbox genuinely authorises them.
          *
          * The sentence comes from `lib/legal/consentCopy.ts`, character for
          * character the one `/welcome` has always shown. It is not retyped here.
          */}
        <ConsentRow
          checked={session.consent}
          onToggle={() => patch({ consent: !session.consent })}
>
          I&apos;m 18 or older and accept the{" "}
          <Link
            href="/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="text-text-primary underline underline-offset-2"
          >
            Terms of Service
          </Link>
          ,{" "}
          <Link
            href="/medical-disclaimer"
            target="_blank"
            rel="noopener noreferrer"
            className="text-text-primary underline underline-offset-2"
          >
            Medical Disclaimer
          </Link>
          , and{" "}
          <Link
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-text-primary underline underline-offset-2"
          >
            Privacy Policy
          </Link>
          .
        </ConsentRow>

        {/**
          * ⚠️ ITS OWN BOX, BECAUSE THE DOCUMENTS SAY SO (v2.0, 2026-08-25).
          *
          * Privacy Policy §1: "we ask for your explicit, specific consent through
          * a separate consent step, distinct from accepting our Terms of Service.
          * You give this consent by ticking a dedicated box that reads: …", and
          * the Terms open with "three things through separate, affirmative
          * steps". `/welcome` has always had three boxes; this is the onboarding
          * path catching up.
          *
          * It spent one day as a second sentence inside the tick above. Adrian
          * asked for one tick and that was a reasonable product call — but the
          * v2.0 documents describe a dedicated box, and a Privacy Policy that
          * describes a control the app does not have is the same defect as a
          * consent record for a sentence nobody was shown, pointing the other
          * way. The documents are immutable, so the screen moved.
          *
          * ⚠️ THE SENTENCE IS NOT TYPED HERE. It comes from
          * `lib/legal/consentCopy.ts`, and `verbatimQuotes.test.ts` diffs that
          * value against the quoted sentence in the committed Privacy Policy,
          * codepoint by codepoint. If the document is re-exported with different
          * wording, the build fails before a user can see the mismatch.
          */}
        <ConsentRow
          checked={session.healthConsent}
          onToggle={() => patch({ healthConsent: !session.healthConsent })}
        >
          <HealthConsentText linkClassName="text-text-primary underline underline-offset-2" />
        </ConsentRow>

        {/* `-mt-3` pulls this up against the tick (Adrian, 2026-08-05: "move
            the disclaimer text slightly closer to the checkbox"). It is a
            footnote ON the consent, not the next item in the column, and the
            parent's `space-y-6` was spacing it as though it were.

            THE HIGHEST-VALUE SENTENCE IN THE FLOW, and it costs nothing
            (2026-08-05). Two independent customer reviews put this first,
            unprompted: seventeen screens take a name, a date of birth and a sex
            on the subject of anabolic use, and the word "privacy" appears
            exactly once, as the third grey link inside the consent sentence.

            The answer was already good and simply never said. Nothing in the
            anonymous half of this flow leaves the device — `session.ts` writes
            to `localStorage` and nothing else — so this is a statement of fact
            about the code, not a reassurance.

            **It stops being true the moment anything here posts to Postgres
            before the paywall.** If that ever changes, this line changes with
            it or it becomes a lie on the screen carrying the consent tick. */}
        <p className="-mt-3 text-center text-[0.8rem] leading-relaxed text-text-muted">
          Nothing leaves your phone until you make an account.
        </p>
      </div>
    </StepFrame>
  );
}

/* ===========================================================================
   3 — Sex
   =========================================================================== */

/**
 * TWO CARDS, not a segmented control (Adrian, 2026-08-05: "make it a bigger
 * card and have the gender name and then the little man logo").
 *
 * An 11px-tall segment is the right control for a preference buried in a form;
 * it is the wrong one for the whole content of a screen, where it reads as an
 * afterthought floating in space. Two large cards give the question the weight
 * the screen already implies, and the icon makes the choice readable before the
 * label is.
 */
const SEXES = [
  { value: "male" as const, label: "Male", Icon: GenderMale },
  { value: "female" as const, label: "Female", Icon: GenderFemale },
];

export function GenderScreen() {
  const { session, patch, goNext, todayKey } = useFlow();

  // The FULL check here, not just `session.sex`: this is the last housekeeping
  // screen, so its button is the last thing standing between an incomplete
  // session and the rest of the flow.
  const canContinue = canLeaveHousekeeping(session, todayKey);

  return (
    <StepFrame
      center
      title="Male or female?"
      // Short, and about THEM (Adrian, 2026-08-05). The old line listed the
      // mechanics — body maps, marker sets — which is true and is not what
      // anyone needs at the moment of answering.
      sub="So Trackd can tailor your experience."
      footer={
        <FlowCta onClick={goNext} disabled={!canContinue}>
          Continue
        </FlowCta>
      }
    >
      <div role="radiogroup" aria-label="Sex" className="grid grid-cols-2 gap-3">
        {SEXES.map(({ value, label, Icon }) => {
          const active = session.sex === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => patch({ sex: value })}
              className={cn(
                "flex aspect-[4/5] flex-col items-center justify-center gap-4 rounded-2xl",
                "transition-all duration-[var(--motion-base)] ease-[var(--motion-ease)]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                "motion-reduce:transition-none active:scale-[0.98]",
                // Selection by SURFACE, not by a border — the same language the
                // paywall's plan rows use, and what `ui-context.md` asks for.
                active ? "flow-card bg-bg-surface-raised" : "bg-bg-surface/40",
              )}
            >
              <Icon
                className={cn(
                  "h-12 w-12 transition-colors duration-[var(--motion-base)] motion-reduce:transition-none",
                  active ? "text-accent-amber" : "text-text-subtle",
                )}
                aria-hidden
              />
              <span
                className={cn(
                  "text-[1.05rem] transition-colors duration-[var(--motion-base)] motion-reduce:transition-none",
                  active ? "text-foreground" : "text-text-muted",
                )}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </StepFrame>
  );
}
