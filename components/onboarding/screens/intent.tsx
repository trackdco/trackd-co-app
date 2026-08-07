"use client";

import type { ReactNode } from "react";

import {
  ArrowsLeftRight,
  Barbell,
  ChartLine,
  Calculator,
  Check,
  Compass,
  DotsThree,
  Drop,
  Flask,
  Lightning,
  Package,
  Pulse,
} from "@/components/icons";
import { track } from "@/lib/onboarding/analytics";
import { cn } from "@/lib/utils";
import { DETAIL_MAX, type RunningTag, type StruggleTag } from "@/lib/onboarding/session";

import { FlowCta, StepFrame } from "../chrome";
import { Chip } from "../controls";
import { useFlow } from "../flow-context";

/**
 * Screens 2 and 3 — the two intent screens (Spec 3-01 §9).
 *
 * Both are multi-select and **at least one answer is REQUIRED** (Adrian,
 * 2026-08-01, overriding §8's "optional"). Continue stays disabled until
 * something is picked.
 *
 * The reason is not data collection. The screen after these two answers what
 * the user just said, and with nothing picked it has to invent an answer out of
 * the top-up list — so a user who skipped both got a reply to a question they
 * never answered, which is the least convincing thing on the screen. Requiring
 * one pick is also the smallest possible ask: seven and seven options, tap one,
 * and there is a "Just tracking for now" and a "Something else" so nobody is
 * forced into a claim that is untrue of them.
 *
 * NOTE this makes the two screens harder to skip than the spec intends. Nothing
 * downstream treats an empty list as invalid, so relaxing it is deleting one
 * `disabled` prop.
 *
 * TGA discipline is the whole point of the copy here. The first screen's
 * options describe the user's PHASE, never a goal or an outcome ("Comp prep",
 * not "get lean"). The struggle options name TRACKING pains, never dosing pains
 * ("Can't remember my last site", never "not knowing when to pin").
 *
 * The first question has been round the houses: "What are you running?" was
 * killed for reading as "which compounds are you on", "Where are you at right
 * now?" was killed too, and "What's the plan?" stuck for a while. Adrian settled
 * it on 2026-08-01 and went BACK to "What are you running?" — his words: he knew
 * he had said it was not good, and he wants it anyway. "What's the plan?" reads
 * as though the app is about to give you one, which is the one thing it must
 * never do; "running" is the word this audience actually uses about a phase.
 */

const ICON = "h-5 w-5";

const RUNNING_OPTIONS: { value: RunningTag; label: string; icon: ReactNode }[] = [
  { value: "comp_prep", label: "Comp prep", icon: <Barbell className={ICON} /> },
  { value: "trt", label: "TRT / hormone optimisation", icon: <Pulse className={ICON} /> },
  { value: "peptides", label: "Peptides", icon: <Flask className={ICON} /> },
  { value: "first_cycle", label: "First cycle", icon: <Compass className={ICON} /> },
  { value: "blast_cruise", label: "Blast & cruise", icon: <Lightning className={ICON} /> },
  // Sits directly above the catch-all, because it IS the broadest real answer:
  // supplements and general health cover everyone who is not running gear at
  // all, and they are the largest slice of the compound catalogue.
  { value: "health", label: "Supplements & general health", icon: <Pulse className={ICON} /> },
  { value: "nothing", label: "Just tracking for now", icon: <Compass className={ICON} /> },
];

const STRUGGLE_OPTIONS: { value: StruggleTag; label: string; icon: ReactNode }[] = [
  { value: "whats_left", label: "Losing track of what's left", icon: <Package className={ICON} /> },
  { value: "recon_maths", label: "Reconstitution maths by hand", icon: <Calculator className={ICON} /> },
  { value: "last_site", label: "Can't remember my last site", icon: <Drop className={ICON} /> },
  { value: "no_history", label: "No history when I get bloods", icon: <ChartLine className={ICON} /> },
  { value: "took_today", label: "Forgetting if I've already taken it today", icon: <Check className={ICON} /> },
  { value: "cant_compare", label: "Can't compare one run to the last", icon: <ArrowsLeftRight className={ICON} /> },
  { value: "other", label: "Something else", icon: <DotsThree className={ICON} /> },
];

/** Toggle a value in a multi-select list. */
function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function RunningScreen() {
  const { session, patch, goNext } = useFlow();

  return (
    <StepFrame
      title="What are you running?"
      sub="Pick any that fit."
      footer={
        <FlowCta
          disabled={session.running.length === 0}
          onClick={() => {
            if (session.running.length === 0) return;
            track("running_selected", { count: session.running.length });
            goNext();
          }}
        >
          Continue
        </FlowCta>
      }
    >
      {/* `-mt-2` for the same reason as the consent footnote: the chip list is
          the ANSWER to the line above it, and `StepFrame`'s default gap spaced
          it as an unrelated block (Adrian, 2026-08-05). */}
      <div className="-mt-2 space-y-2">
        {RUNNING_OPTIONS.map((option) => (
          <Chip
            key={option.value}
            label={option.label}
            icon={option.icon}
            selected={session.running.includes(option.value)}
            onToggle={() => patch({ running: toggle(session.running, option.value) })}
          />
        ))}
      </div>
    </StepFrame>
  );
}

export function StruggleScreen() {
  const { session, patch, goNext } = useFlow();

  const showDetail = session.struggle.includes("other");

  return (
    <StepFrame
      title="What keeps going wrong?"
      sub="Pick any that fit."
      footer={
        <FlowCta
          disabled={session.struggle.length === 0}
          onClick={() => {
            if (session.struggle.length === 0) return;
            track("struggle_selected", { count: session.struggle.length });
            goNext();
          }}
        >
          Continue
        </FlowCta>
      }
    >
      {/* `-mt-2` for the same reason as the consent footnote: the chip list is
          the ANSWER to the line above it, and `StepFrame`'s default gap spaced
          it as an unrelated block (Adrian, 2026-08-05). */}
      <div className="-mt-2 space-y-2">
        {STRUGGLE_OPTIONS.map((option) => (
          <Chip
            key={option.value}
            label={option.label}
            icon={option.icon}
            selected={session.struggle.includes(option.value)}
            onToggle={() => {
              const next = toggle(session.struggle, option.value);
              patch({
                struggle: next,
                // Unticking the catch-all clears what was typed under it.
                // Leaving an orphan string would file "can't remember my
                // schedule" against whichever chips they kept, which is the
                // same rule `normaliseSession` enforces on read.
                ...(option.value === "other" && !next.includes("other")
                  ? { struggleDetail: null }
                  : {}),
              });
            }}
          />
        ))}

        {/* Unfolds under the catch-all, and ONLY under it (Adrian, 2026-08-05:
            "maybe they should be able to write something in the something else
            section"). The whole reason the option exists is to collect the
            answers we did not put on the list, so "Something else" with nowhere
            to say what is the one chip on this screen that teaches us nothing.

            Grid-rows so it animates open without its height being known, and
            capped/normalised at the boundaries rather than per keystroke —
            `normaliseDetail` collapses whitespace, which on every change would
            eat the space the moment you typed it. Same idiom as the attribution
            screen; the two must not drift. */}
        <div
          className={cn(
            "grid transition-[grid-template-rows] duration-[420ms] ease-[var(--motion-ease)] motion-reduce:transition-none",
            showDetail ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
          )}
        >
          <div className="overflow-hidden">
            <input
              value={showDetail ? (session.struggleDetail ?? "") : ""}
              onChange={(e) =>
                patch({ struggleDetail: e.target.value.slice(0, DETAIL_MAX) || null })
              }
              // Not focusable while folded away, or a keyboard user tabs into a
              // field they cannot see.
              tabIndex={showDetail ? 0 : -1}
              aria-hidden={!showDetail}
              maxLength={DETAIL_MAX}
              placeholder="What is it? Optional."
              aria-label="What else keeps going wrong"
              autoComplete="off"
              className="mt-2 h-12 w-full rounded-xl bg-bg-input px-4 text-sm text-foreground outline-none placeholder:text-text-subtle focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </div>
      </div>
    </StepFrame>
  );
}
