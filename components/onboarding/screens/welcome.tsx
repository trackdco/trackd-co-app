"use client";

import { useRef, useState } from "react";

import { Camera } from "@/components/icons";
import { TRIAL_DAYS } from "@/lib/onboarding/pricing";

import { FlowCta, StepFrame } from "../chrome";
import { Confetti } from "../confetti";
import { useFlow } from "../flow-context";
import { Mascot } from "../mascot";

/**
 * Screen 11 — Welcome, with Screen 12 folded in (Spec 3-01 D-3, default: fold).
 *
 * The profile photo was a screen of its own carrying one optional control, so
 * it lives here instead and the flow is one step shorter. The photo is
 * genuinely optional: there is no skip button because there is nothing to skip,
 * the CTA simply moves on.
 *
 * The greeting falls back cleanly when auth returned no name, which it always
 * does while the paywall's auth chain is stubbed.
 *
 * The preview is LOCAL ONLY. The real avatar path (`components/profile`
 * → the private `avatars` bucket) needs an account and a storage write, so it
 * is left for the auth integration rather than half-wired here.
 */
export function WelcomeScreen() {
  const { goNext, accountName } = useFlow();
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(file);
    });
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <Confetti />

      <StepFrame
        center
        title={accountName ? `Welcome, ${accountName}.` : "You're in. Welcome to Trackd."}
        sub={`${TRIAL_DAYS} days on the house. Let's get you set up, it takes a minute.`}
        footer={<FlowCta onClick={goNext}>Let&apos;s set things up</FlowCta>}
      >
        <div className="flex flex-col items-center gap-8">
          <Mascot pose="happy" size={170} />

          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              aria-label="Add a profile photo"
              className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-bg-surface transition-all duration-[var(--motion-base)] ease-[var(--motion-ease)] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
            >
              {preview ? (
                // A local object URL, not an upload. next/image would want a
                // configured loader for a blob: URL and buys nothing here.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={preview}
                  alt="Your profile photo"
                  className="h-full w-full object-cover"
                />
              ) : (
                <Camera className="h-6 w-6 text-text-subtle" />
              )}
            </button>
            <p className="text-[0.75rem] text-text-subtle">
              Add a photo. Optional.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={onPick}
              className="sr-only"
            />
          </div>
        </div>
      </StepFrame>
    </div>
  );
}
