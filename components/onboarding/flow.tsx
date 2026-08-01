"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
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
  clampIntent,
  clampStep,
  FIRST_STEP,
  isStepId,
  nextStep,
  prevStep,
  stepProgress,
  type StepId,
} from "@/lib/onboarding/steps";
import { canLeaveHousekeeping } from "@/lib/onboarding/session";
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

/**
 * How long an incoming screen refuses input.
 *
 * Rate-limiting `goNext` was not enough on its own: an async CTA (the trial
 * button, the notification permission request) calls it AFTER any time window
 * has expired, so a second tap still landed on the new screen and ran it. The
 * honest fix is that the arriving screen is not tappable until it has
 * arrived — which is also just true, visually.
 *
 * 750ms, chosen from measurement rather than taste: taps were still slipping
 * through at a 600ms gap, and 600ms is squarely inside the window where
 * someone who thinks their first tap missed tries again. By 750ms the new
 * screen has been on display for nearly half a second and any tap is a
 * decision about IT.
 */
const SETTLE_MS = 750;

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
  if (!isClient) return <div className="flow-canvas flow-viewport" aria-hidden />;

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

  const [todayKey] = useState(resolveTodayKey);

  /**
   * How many history entries THIS flow has pushed.
   *
   * A boolean was not enough. `prevStep` only says a step exists before this
   * one, which is why the arrow rendered and did nothing on a deep link and
   * pointed back at Google after the OAuth round-trip — hence the flag. But a
   * flag that is only ever set to true fixes the first entry and not the
   * return: land on `?step=welcome` from OAuth (no arrow, correct), go forward
   * once, come back, and the arrow is STILL shown because the flag never went
   * down. Tapping it then walks out of the flow and back to the callback URL,
   * which is the exact bug the flag exists to prevent.
   *
   * A depth counts up on push and down on popstate, so it is zero again
   * whenever we are back where this flow started. State rather than a ref,
   * because it is read during render.
   */
  const [depth, setDepth] = useState(0);
  // Whether a screen has claimed BACK for itself, mirrored into state for the
  // same reason.
  const [backOwned, setBackOwned] = useState(false);

  const [step, setStep] = useState<StepId>(() => {
    const requested = new URLSearchParams(window.location.search).get("step");
    if (!isStepId(requested)) return FIRST_STEP;
    // A deep link cannot walk past the age gate, and cannot skip the intent
    // screens either. See `clampStep` and `clampIntent`.
    return clampIntent(
      clampStep(requested, canLeaveHousekeeping(session, todayKey)),
      session,
    );
  });
  const [accountName, setAccountName] = useState<string | null>(null);
  // Which way the last move went, so the entering screen slides in from the
  // side it came from. Forward from the right, back from the left.
  const [direction, setDirection] = useState<"forward" | "back">("forward");

  useEffect(() => {
    track("onboarding_start");
  }, []);

  // True while the incoming screen is arriving. See SETTLE_MS.
  const [settling, setSettling] = useState(false);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const beginSettle = useCallback(() => {
    setSettling(true);
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => setSettling(false), SETTLE_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (settleTimer.current) clearTimeout(settleTimer.current);
    };
  }, []);


  // The popstate listener must read the CURRENT gate state rather than whatever
  // was captured when it was attached. Written in an effect (not during render,
  // which the refs lint rule rightly forbids) and read inside the handler.
  const gateRef = useRef(false);
  // The intent answers, for the same reason: browser FORWARD must be judged
  // against what the session holds NOW, not what it held when the listener was
  // attached. Untick your only answer, then press Forward.
  const answersRef = useRef<{ running: readonly unknown[]; struggle: readonly unknown[] }>({
    running: [],
    struggle: [],
  });
  useEffect(() => {
    gateRef.current = canLeaveHousekeeping(session, todayKey);
    answersRef.current = { running: session.running, struggle: session.struggle };
  }, [session, todayKey]);

  // The hardware/browser back button walks the flow.
  useEffect(() => {
    const onPop = () => {
      const requested = new URLSearchParams(window.location.search).get("step");
      setDirection("back");
      beginSettle();
      // One step closer to wherever this flow was entered. Clamped at zero:
      // `popstate` also fires on FORWARD, and a forward move must not take the
      // depth negative.
      setDepth((d) => Math.max(0, d - 1));
      if (!isStepId(requested)) {
        setStep(FIRST_STEP);
        return;
      }
      // Same clamps as the initial read: history is user-editable too.
      setStep(clampIntent(clampStep(requested, gateRef.current), answersRef.current));
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [beginSettle]);

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
    setDepth((d) => d + 1);
    beginSettle();
    // The browser keeps the old scroll offset otherwise, and a long screen
    // opens half-way down.
    window.scrollTo({ top: 0 });
  }, [beginSettle]);

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
  /**
   * Every screen's CTA sits in the same place in the footer, and a step change
   * remounts the screen underneath the finger. So a second tap — a deliberate
   * one, by someone who thinks the first missed — landed on the NEW screen's
   * button and skipped a whole screen.
   *
   * Measured at gaps of 0, 60, 120, 200, 350 AND 600ms: two taps on install
   * jumped past the notification request entirely, which breaks spec §12's
   * install-before-notifications requirement; two taps on attribution left
   * onboarding altogether.
   *
   * So advancing is rate-limited. Not a disabled button (that flickers on every
   * screen and reads as jank) — just a refusal to move twice inside one
   * transition.
   */
  const goNext = useCallback(() => {
    const target = nextStep(step);
    if (!target) return;
    setDirection("forward");
    setStep(target);
    pushStep(target);
  }, [step, pushStep]);

  // A screen may claim BACK for itself (the demo does, to step between its
  // stages). A ref rather than state: this is a registration, and re-rendering
  // the whole flow because a child claimed the button would be silly.
  const backHandler = useRef<(() => boolean) | null>(null);
  const setBackHandler = useCallback((fn: (() => boolean) | null) => {
    backHandler.current = fn;
    setBackOwned(fn !== null);
  }, []);

  const goBack = useCallback(() => {
    if (backHandler.current?.()) return;
    // Otherwise real history, so the in-app control and the phone's back button
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
      setBackHandler,
    }),
    [
      session,
      patch,
      step,
      goNext,
      goBack,
      goTo,
      finish,
      accountName,
      todayKey,
      setBackHandler,
    ],
  );

  // A screen that owns BACK always shows the arrow (the demo steps its own
  // stages); otherwise it only shows if this flow actually pushed something.
  const canGoBack =
    backOwned || (depth > 0 && step !== FIRST_STEP && prevStep(step) !== null);

  return (
    <FlowContext.Provider value={value}>
      {/* overflow-x clipped: the directional entrance starts the incoming screen
          18px off-frame, which without this creates a real horizontal scroll
          area for the length of the animation (measured: 408px on a 390 phone). */}
      <div className="flow-canvas flow-viewport flex flex-col overflow-x-clip">
        {/* `min-h-0` on BOTH this column and the step box below it. A flex
              item defaults to `min-height: auto`, which means it cannot be
              shrunk below its own content — so without these the whole column
              grew past the fixed-height shell and `overflow: hidden` clipped
              the footer. Measured: the paywall CTA sat 177px outside a 660px
              viewport with no way to scroll to it. The chain from the shell
              down to a screen's scroll port has to be able to shrink at every
              link, or the port never gets the chance to scroll. */}
          <div className="relative mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col">
          {/* Back arrow and progress on ONE row. The back control sits in the
              LAYOUT, not over it: absolutely positioned it collided with the
              first line of a long centred headline (measured on the paywall at
              390). The row is always present so screens do not jump vertically
              when either thing appears.

              The RAIL is centred on the row rather than railed right (Adrian,
              2026-08-01). It is absolutely positioned so the back arrow's
              presence or absence cannot shift it — with the arrow in flow, a
              screen that has no back button would slide the bar sideways, and a
              progress bar that moves horizontally between screens is worse than
              one sitting in a corner. `pointer-events-none` because it is a
              readout, and it overlaps the arrow's 40px target at 360. */}
          {/* THE HEADER ROW. Back arrow left, progress centred, and it must
              clear the notch.

              Written as a 3-column GRID with equal outer columns, so the rail
              is centred by the layout and the back arrow's presence cannot
              shift it. The previous version positioned the rail absolutely at
              `top-[env(safe-area-inset-top)]` inside a FIXED `h-10` row, which
              was wrong in a way desktop could not show: the row never grew with
              the inset, so on a notched iPhone (44-59px, all of them bigger
              than the 40px row) the bar was pushed straight out of its own box
              and rendered THROUGH the first line of the headline. Measured with
              the inset simulated at 59px: bar at 71..87, h1 at 67..101.

              So: no fixed height, no absolute positioning. `pt` carries the
              inset and the row is as tall as it needs to be. */}
          <div className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-1">
            <div className="flex min-h-10 items-center justify-start">
              {canGoBack ? (
                <button
                  type="button"
                  onClick={goBack}
                  aria-label="Go back"
                  className="-ml-1 flex h-10 w-10 items-center justify-center rounded-full text-text-subtle transition-colors duration-[var(--motion-fast)] hover:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
                >
                  <CaretLeft className="h-5 w-5" />
                </button>
              ) : null}
            </div>

            <ProgressRail progress={stepProgress(step)} />

            {/* Balances the arrow's column so the rail sits on the true centre. */}
            <span aria-hidden />
          </div>

          {/* `key` remounts on every step, which is what replays the entrance
              and guarantees no screen inherits another's local state. */}
          <div
            key={step}
            className={cn(
              "flex min-h-0 flex-1 flex-col",
              direction === "forward" ? "animate-flow-forward" : "animate-flow-back",
              // Not tappable until it has arrived. Every CTA sits in the same
              // place in the footer, so without this a second tap ran the NEW
              // screen's action and skipped it entirely — including, measured,
              // the notification opt-in that spec §12 requires to come first.
              settling && "pointer-events-none",
            )}
          >
            <StepRenderer step={step} />
          </div>
        </div>
      </div>
    </FlowContext.Provider>
  );
}
