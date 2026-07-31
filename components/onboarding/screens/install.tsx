"use client";

import { useState } from "react";

import { DotsThree, Plus, Share } from "@/components/icons";
import { track } from "@/lib/onboarding/analytics";
import { guessPlatform, type Platform } from "@/lib/onboarding/platform";
import { DATA_MONO } from "@/lib/ui-presets";
import { cn } from "@/lib/utils";

import { FlowCta, SkipLink, StepFrame } from "../chrome";
import { Segmented } from "../controls";
import { useFlow } from "../flow-context";

/**
 * Screen 13 — Add to Home Screen (Spec 3-01 §9, §12).
 *
 * **This must precede the notification request.** An iOS PWA cannot request or
 * receive web push until it has been installed to the Home Screen, so asking
 * first fails silently and burns the one prompt the OS gives you. The order is
 * enforced by `STEP_ORDER` and pinned by a test.
 *
 * There is no programmatic Add-to-Home-Screen on iOS, so the job here is
 * clarity, not automation (`progress-tracker.md`: "iOS PWA install is
 * manual-only").
 */

const STEPS: Record<Platform, { icon: React.ReactNode; text: string }[]> = {
  ios: [
    { icon: <Share className="h-4 w-4" />, text: "Tap Share in Safari" },
    { icon: <Plus className="h-4 w-4" />, text: "Choose Add to Home Screen" },
    { icon: null, text: "Tap Add" },
  ],
  android: [
    { icon: <DotsThree className="h-4 w-4" />, text: "Open the Chrome menu" },
    { icon: <Plus className="h-4 w-4" />, text: "Choose Add to Home screen" },
    { icon: null, text: "Tap Add" },
  ],
};

export function InstallScreen() {
  const { goNext } = useFlow();
  // Read once in a lazy initialiser. The whole flow is client-only, so
  // `navigator` is there and there is no server render to mismatch against.
  const [platform, setPlatform] = useState<Platform>(guessPlatform);

  const onConfirm = () => {
    track("install_confirmed", { platform });
    goNext();
  };

  return (
    <StepFrame
      title="Add Trackd to your home screen"
      sub="It works like a normal app once it's there. Do this first, or reminders can't reach you."
      footer={
        <div className="space-y-1">
          <FlowCta onClick={onConfirm}>I&apos;ve added it</FlowCta>
          <SkipLink onClick={goNext}>Skip for now</SkipLink>
        </div>
      }
    >
      <div className="space-y-5">
        <Segmented
          label="Your device"
          value={platform}
          onChange={setPlatform}
          options={[
            { value: "ios", label: "iPhone" },
            { value: "android", label: "Android" },
          ]}
        />

        <ol className="flow-card rounded-2xl bg-bg-surface px-5">
          {STEPS[platform].map((step, i) => (
            <li
              key={step.text}
              className={cn(
                "flex items-center gap-3 py-4",
                i > 0 && "border-t-[0.5px] border-border-default",
              )}
            >
              {/* A plain mono numeral, never a badge (icon badges are retired). */}
              <span className={cn(DATA_MONO, "w-3 shrink-0 text-text-subtle")}>
                {i + 1}
              </span>
              <span className="flex min-w-0 flex-1 items-center gap-2 text-[0.9rem] text-foreground">
                {step.icon ? (
                  <span className="text-text-muted" aria-hidden>
                    {step.icon}
                  </span>
                ) : null}
                {step.text}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </StepFrame>
  );
}
