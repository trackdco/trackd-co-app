"use client";

import type { ReactNode } from "react";

import {
  Barbell,
  ChartLine,
  Calculator,
  ClipboardText,
  Compass,
  Flask,
  Lightning,
  Package,
  Pulse,
  Scales,
  Syringe,
} from "@/components/icons";
import { track } from "@/lib/onboarding/analytics";
import type { RunningTag, StruggleTag } from "@/lib/onboarding/session";

import { FlowCta, StepFrame } from "../chrome";
import { Chip } from "../controls";
import { useFlow } from "../flow-context";

/**
 * Screens 2 and 3 — the two intent screens (Spec 3-01 §9).
 *
 * Both are multi-select and both are OPTIONAL data (§8), so Continue is always
 * enabled: making an optional question block the flow is how a user learns the
 * app argues with them.
 *
 * TGA discipline is the whole point of the copy here. The first screen's
 * options describe the user's PHASE, never a goal or an outcome ("Comp prep",
 * not "get lean"). The struggle options name TRACKING pains, never dosing pains
 * ("Can't remember my last site", never "not knowing when to pin").
 *
 * The question used to be "What are you running?" and Adrian killed it: to him
 * that reads as "which compounds are you on", which is not what the six answers
 * are. "Where are you at right now?" asks for the phase, which is what they
 * actually describe.
 */

const ICON = "h-5 w-5";

const RUNNING_OPTIONS: { value: RunningTag; label: string; icon: ReactNode }[] = [
  { value: "comp_prep", label: "Comp prep", icon: <Barbell className={ICON} /> },
  { value: "off_season", label: "Off-season", icon: <Package className={ICON} /> },
  { value: "trt", label: "TRT / hormone optimisation", icon: <Pulse className={ICON} /> },
  { value: "peptides", label: "Peptides", icon: <Flask className={ICON} /> },
  { value: "first_cycle", label: "First cycle", icon: <Compass className={ICON} /> },
  { value: "blast_cruise", label: "Blast & cruise", icon: <Lightning className={ICON} /> },
  { value: "recomp", label: "Recomp", icon: <Scales className={ICON} /> },
];

const STRUGGLE_OPTIONS: { value: StruggleTag; label: string; icon: ReactNode }[] = [
  { value: "whats_left", label: "Losing track of what's left", icon: <Package className={ICON} /> },
  { value: "recon_maths", label: "Reconstitution maths by hand", icon: <Calculator className={ICON} /> },
  { value: "last_site", label: "Can't remember my last site", icon: <Syringe className={ICON} /> },
  { value: "spreadsheet", label: "Spreadsheet's a mess", icon: <ClipboardText className={ICON} /> },
  { value: "no_history", label: "No history when I get bloods", icon: <ChartLine className={ICON} /> },
];

/** Toggle a value in a multi-select list. */
function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function RunningScreen() {
  const { session, patch, goNext } = useFlow();

  return (
    <StepFrame
      title="Where are you at right now?"
      sub="Pick any that fit."
      footer={
        <FlowCta
          onClick={() => {
            track("running_selected", { count: session.running.length });
            goNext();
          }}
        >
          Continue
        </FlowCta>
      }
    >
      <div className="space-y-2">
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

  return (
    <StepFrame
      title="What's the hard part?"
      sub="Pick any that fit."
      footer={
        <FlowCta
          onClick={() => {
            track("struggle_selected", { count: session.struggle.length });
            goNext();
          }}
        >
          Continue
        </FlowCta>
      }
    >
      <div className="space-y-2">
        {STRUGGLE_OPTIONS.map((option) => (
          <Chip
            key={option.value}
            label={option.label}
            icon={option.icon}
            selected={session.struggle.includes(option.value)}
            onToggle={() => patch({ struggle: toggle(session.struggle, option.value) })}
          />
        ))}
      </div>
    </StepFrame>
  );
}
