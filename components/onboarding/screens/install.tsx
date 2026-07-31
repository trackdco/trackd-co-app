"use client";

import { useCallback, useState, useSyncExternalStore } from "react";

import { DotsThree, Plus, Share } from "@/components/icons";
import { usePwaInstall } from "@/components/pwa/usePwaInstall";
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
 * ## Three states, because there are genuinely three
 *
 * Adrian asked whether the install can be automated. The honest answer is that
 * it depends entirely on the platform, so this screen stops pretending
 * otherwise:
 *
 * 1. **Already installed** — detected via `display-mode: standalone`. There is
 *    nothing to do, so the screen says so and moves on. This turns a
 *    self-reported step into a verified one.
 * 2. **Android / Chrome** — `beforeinstallprompt` fires, the app already
 *    captures it (`components/pwa/usePwaInstall.ts`), and one tap opens the
 *    real OS install dialog. No instructions needed.
 * 3. **iOS** — there is no install API and never has been. Apple has shipped
 *    nothing for this, so the job here is clarity, not automation: the Share
 *    sheet, spelled out.
 *
 * The "I've added it" button only exists in the case where we genuinely cannot
 * know, which is iOS.
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

/** Is the page running as an installed app rather than in a browser tab? */
const subscribeStandalone = (cb: () => void) => {
  if (typeof window === "undefined") return () => {};
  const mq = window.matchMedia("(display-mode: standalone)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
const standaloneSnapshot = () =>
  typeof window !== "undefined" &&
  (window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari's own flag, which predates the standard media query.
    (window.navigator as { standalone?: boolean }).standalone === true);

export function InstallScreen() {
  const { goNext } = useFlow();
  const [platform, setPlatform] = useState<Platform>(guessPlatform);
  const { canInstall, promptInstall } = usePwaInstall();
  const [busy, setBusy] = useState(false);

  const installed = useSyncExternalStore(
    subscribeStandalone,
    standaloneSnapshot,
    () => false,
  );

  const confirmManually = useCallback(() => {
    track("install_confirmed", { platform, method: "self-reported" });
    goNext();
  }, [goNext, platform]);

  const install = useCallback(async () => {
    setBusy(true);
    const outcome = await promptInstall();
    setBusy(false);
    if (outcome === "accepted") {
      track("install_confirmed", { platform, method: "prompt" });
      goNext();
    }
    // Dismissed or unavailable: stay put. They can try again or skip.
  }, [goNext, platform, promptInstall]);

  /* ---- 1. Already installed. Nothing to ask for. ---- */
  if (installed) {
    return (
      <StepFrame
        center
        title="You're already set up"
        sub="Trackd is on your home screen, so reminders can reach you."
        footer={<FlowCta onClick={confirmManually}>Continue</FlowCta>}
      >
        <div className="flex items-center justify-center" />
      </StepFrame>
    );
  }

  /* ---- 2. Android: a real button, no instructions. ---- */
  if (canInstall) {
    return (
      <StepFrame
        center
        title="Add Trackd to your home screen"
        sub="One tap. It works like a normal app once it's there, and reminders need it."
        footer={
          <div className="space-y-1">
            <FlowCta onClick={install} disabled={busy}>
              {busy ? "Opening" : "Add to home screen"}
            </FlowCta>
            <SkipLink onClick={goNext}>Skip for now</SkipLink>
          </div>
        }
      >
        <div className="flex items-center justify-center" />
      </StepFrame>
    );
  }

  /* ---- 3. iOS, or a browser that will not offer it: spell it out. ---- */
  return (
    <StepFrame
      center
      title="Add Trackd to your home screen"
      sub="It works like a normal app once it's there. Do this first, or reminders can't reach you."
      footer={
        <div className="space-y-1">
          <FlowCta onClick={confirmManually}>I&apos;ve added it</FlowCta>
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
