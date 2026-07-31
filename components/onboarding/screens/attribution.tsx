"use client";

import type { ReactNode } from "react";

import {
  ChatCircleDots,
  Compass,
  InstagramLogo,
  TiktokLogo,
  UsersThree,
} from "@/components/icons";
import { track } from "@/lib/onboarding/analytics";
import type { AttributionTag } from "@/lib/onboarding/session";

import { FlowCta, SkipLink, StepFrame } from "../chrome";
import { Chip } from "../controls";
import { useFlow } from "../flow-context";

/**
 * Screen 15 — Where did you hear about us? (Spec 3-01 §9).
 *
 * Optional, and single-select: unlike the two intent screens, this is one
 * answer about one origin.
 *
 * If a creator code arrived on the deep link, attribution is already recorded
 * and the strongest form of it (§4), so the screen says so rather than asking
 * the user to confirm something the link already told us.
 */

const ICON = "h-5 w-5";

const OPTIONS: { value: AttributionTag; label: string; icon: ReactNode }[] = [
  { value: "instagram", label: "Instagram", icon: <InstagramLogo className={ICON} /> },
  { value: "tiktok", label: "TikTok", icon: <TiktokLogo className={ICON} /> },
  { value: "mate", label: "A mate", icon: <ChatCircleDots className={ICON} /> },
  { value: "community", label: "A community or group", icon: <UsersThree className={ICON} /> },
  { value: "elsewhere", label: "Somewhere else", icon: <Compass className={ICON} /> },
];

export function AttributionScreen() {
  const { session, patch, goNext } = useFlow();

  const onContinue = () => {
    if (session.attribution) {
      track("attribution_selected", { source: session.attribution });
    }
    goNext();
  };

  if (session.affiliateCode) {
    return (
      <StepFrame
        title="Where did you hear about us?"
        sub="You came in on a creator link, so we already know."
        footer={<FlowCta onClick={goNext}>Continue</FlowCta>}
      >
        <div className="flex flex-1 items-center justify-center">
          <p className="font-mono text-sm uppercase tracking-[0.08em] text-text-muted">
            {session.affiliateCode}
          </p>
        </div>
      </StepFrame>
    );
  }

  return (
    <StepFrame
      title="Where did you hear about us?"
      sub="Optional."
      footer={
        <div className="space-y-1">
          <FlowCta onClick={onContinue}>Continue</FlowCta>
          <SkipLink onClick={goNext}>Skip</SkipLink>
        </div>
      }
    >
      <div className="space-y-2">
        {OPTIONS.map((option) => (
          <Chip
            key={option.value}
            label={option.label}
            icon={option.icon}
            selected={session.attribution === option.value}
            onToggle={() =>
              patch({
                attribution:
                  session.attribution === option.value ? null : option.value,
              })
            }
          />
        ))}
      </div>
    </StepFrame>
  );
}
