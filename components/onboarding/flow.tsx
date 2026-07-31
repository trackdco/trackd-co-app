"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";

import { CaretLeft } from "@/components/icons";
import { cn } from "@/lib/utils";
import { track } from "@/lib/onboarding/analytics";
import { codeFromSearch } from "@/lib/onboarding/affiliate";
import {
  readSession,
  writeSession,
  type OnboardingSession,
} from "@/lib/onboarding/session";
import {
  FIRST_STEP,
  isStepId,
  nextStep,
  prevStep,
  stepProgress,
  type StepId,
} from "@/lib/onboarding/steps";
import { todayKey as resolveTodayKey } from "@/lib/protocol/cycle";

import { FlowContext, type FlowContextValue } from "./flow-context";
import { ProgressRail } from "./chrome";
import { StepRenderer } from "./step-renderer";

/**
 * The onboarding host (Spec 3-01 §15 step 1).
 *
 * Owns three things and nothing else: the anonymous session, which step is on
 * screen, and the transition between them. Every screen is a leaf that reads
 * the session and calls `goNext()`; none of them knows what comes after it.
 *
 * **The step lives in the URL** (`?step=`) so the phone's hardware back button
 * walks back through the flow instead of leaving the site, and so any screen
 * can be linked to directly for review. It is pushed with
 * `window.history.pushState` rather than the router, because the flow is one
 * client tree and a router navigation would re-run the server render and throw
 * the transition away.
 */

/** Never notifies: the client/server answer cannot change after hydration. */
const subscribeNever = () => () => {};

export function OnboardingFlow() {
  // The session and the step both come from the browser (localStorage, the
  // URL). Rendering a guessed value on the server and correcting it on the
  // client is a hydration mismatch, so the flow proper does not mount until
  // there IS a browser. `useSyncExternalStore` is the sanctioned way to ask
  // that question without a setState-in-effect.
  const isClient = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );

  // Same near-black as the flow, so the frame this costs is invisible.
  if (!isClient) return <div className="flow-canvas min-h-dvh" aria-hidden />;

  return <OnboardingFlowClient />;
}

/**
 * Client-only, so every initial value can be read straight out of the browser
 * in a lazy initialiser rather than being patched in from an effect.
 */
function OnboardingFlowClient() {
  const router = useRouter();

  const [session, setSession] = useState<OnboardingSession>(() => {
    const stored = readSession();
    // A creator's deep link (?code=) is captured on FIRST LOAD onto the
    // anonymous session, so it survives to the paywall and most users never
    // type anything.
    const deepLinkCode = codeFromSearch(window.location.search);
    const hydrated: OnboardingSession = {
      ...stored,
      affiliateCode: deepLinkCode ?? stored.affiliateCode,
      startedAt: stored.startedAt ?? new Date().toISOString(),
    };
    writeSession(hydrated);
    return hydrated;
  });

  const [step, setStep] = useState<StepId>(() => {
    const requested = new URLSearchParams(window.location.search).get("step");
    return isStepId(requested) ? requested : FIRST_STEP;
  });

  const [todayKey] = useState(resolveTodayKey);
  const [accountName, setAccountName] = useState<string | null>(null);
  // Which way the last move went, so the entering screen slides in from the
  // side it came from. Forward from the right, back from the left.
  const [direction, setDirection] = useState<"forward" | "back">("forward");

  useEffect(() => {
    track("onboarding_start");
  }, []);

  // The hardware/browser back button walks the flow.
  useEffect(() => {
    const onPop = () => {
      const requested = new URLSearchParams(window.location.search).get("step");
      setDirection("back");
      setStep(isStepId(requested) ? requested : FIRST_STEP);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const patch = useCallback((next: Partial<OnboardingSession>) => {
    setSession((current) => {
      const merged = { ...current, ...next };
      writeSession(merged);
      return merged;
    });
  }, []);

  /** Push a step into history and scroll to the top of the new screen. */
  const pushStep = useCallback((target: StepId) => {
    const url = new URL(window.location.href);
    url.searchParams.set("step", target);
    window.history.pushState({ step: target }, "", url);
    // The browser keeps the old scroll offset otherwise, and a long screen
    // opens half-way down.
    window.scrollTo({ top: 0 });
  }, []);

  const goTo = useCallback(
    (target: StepId) => {
      setDirection("forward");
      setStep(target);
      pushStep(target);
    },
    [pushStep],
  );

  // The target is resolved OUTSIDE the state updater. A `setStep(fn)` updater
  // runs during the render phase, and `pushStep` calls `history.pushState`,
  // which Next patches to update its Router: doing it in there updates the
  // Router while this component renders (React says so, loudly) and pushes two
  // history entries for one tap, so a single Back moves nowhere. Measured.
  const goNext = useCallback(() => {
    const target = nextStep(step);
    if (!target) return;
    setDirection("forward");
    setStep(target);
    pushStep(target);
  }, [step, pushStep]);

  const goBack = useCallback(() => {
    // Uses real history so the in-app control and the phone's back button
    // cannot disagree about where "back" is.
    window.history.back();
  }, []);

  const finish = useCallback(() => {
    track("onboarding_completed");
    router.push("/dashboard");
  }, [router]);

  const value = useMemo<FlowContextValue>(
    () => ({
      session,
      patch,
      step,
      goNext,
      goBack,
      goTo,
      finish,
      accountName,
      setAccountName,
      todayKey,
    }),
    [session, patch, step, goNext, goBack, goTo, finish, accountName, todayKey],
  );

  const canGoBack = step !== FIRST_STEP && prevStep(step) !== null;

  return (
    <FlowContext.Provider value={value}>
      {/* overflow-x clipped: the directional entrance starts the incoming screen
          18px off-frame, which without this creates a real horizontal scroll
          area for the length of the animation (measured: 408px on a 390 phone). */}
      <div className="flow-canvas flex min-h-dvh flex-col overflow-x-clip">
        <ProgressRail progress={stepProgress(step)} />

        <div className="relative mx-auto flex w-full max-w-md flex-1 flex-col">
          {/* The back control sits in the LAYOUT, not over it. Absolutely
              positioned it collided with the first line of a long centred
              headline (measured on the paywall at 390). The row is always
              present so screens do not jump vertically when it appears. */}
          <div className="flex h-10 shrink-0 items-center px-2 pt-2">
            {canGoBack ? (
              <button
                type="button"
                onClick={goBack}
                aria-label="Go back"
                className="flex h-10 w-10 items-center justify-center rounded-full text-text-subtle transition-colors duration-[var(--motion-fast)] hover:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
              >
                <CaretLeft className="h-5 w-5" />
              </button>
            ) : null}
          </div>

          {/* `key` remounts on every step, which is what replays the entrance
              and guarantees no screen inherits another's local state. */}
          <div
            key={step}
            className={cn(
              "flex flex-1 flex-col",
              direction === "forward" ? "animate-flow-forward" : "animate-flow-back",
            )}
          >
            <StepRenderer step={step} />
          </div>
        </div>
      </div>
    </FlowContext.Provider>
  );
}
