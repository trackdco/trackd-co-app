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
  nextStepFor,
  prevStep,
  stepIndex,
  stepProgress,
  type StepId,
} from "@/lib/onboarding/steps";
import { firstIncompleteHousekeeping } from "@/lib/onboarding/session";
import { guessPlatform } from "@/lib/onboarding/platform";
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

/** The screens that rise rather than slide. See the entrance class below. */
const HOUSEKEEPING_STEPS: readonly StepId[] = [
  "name",
  "birthday",
  "gender",
  "greeting",
];

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
   * Guessed ONCE, and only ever read by `goNext` — never rendered.
   *
   * It decides whether the forward walk skips `notifications` (see
   * `stepAppliesTo`). Nothing on screen depends on it, so the server's guess
   * differing from the device's cannot produce a hydration mismatch; the
   * initialiser re-runs on the client during hydration and that value is the
   * one that sticks. Same idiom as `install.tsx` and `notifications.tsx`, from
   * the same helper, so no two screens can disagree about the device.
   */
  const [platform] = useState(guessPlatform);

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

  /**
   * Resolve an untrusted `?step=` AND make the URL tell the truth about it.
   *
   * The clamp used to render the safe step and leave the address bar saying
   * whatever had been asked for. That is not cosmetic — it desynchronises the
   * flow from history, and the failure it produced was: open
   * `?step=paywall` cold, land correctly on `name` with the URL still reading
   * `paywall`, Continue (pushes `birthday`), then press Back. `popstate` reads
   * `paywall`, clamps to `birthday` again, and NOTHING CHANGES ON SCREEN — but
   * a history entry has been spent. The second Back leaves the site. Two
   * presses: one dead, one exit.
   *
   * `replaceState` rather than `pushState`: the entry being corrected is the
   * one we are standing on, and pushing would add the very entry that makes
   * Back ambiguous.
   */
  const resolveStep = useCallback(
    (requested: string | null, s: OnboardingSession, today: string): StepId => {
      if (!isStepId(requested)) return FIRST_STEP;
      // A deep link cannot walk past the age gate, and cannot skip the intent
      // screens either. See `clampStep` and `clampIntent`.
      const allowed = clampIntent(
        clampStep(requested, firstIncompleteHousekeeping(s, today)),
        s,
      );
      if (allowed !== requested) {
        const url = new URL(window.location.href);
        url.searchParams.set("step", allowed);
        window.history.replaceState({ step: allowed }, "", url);
      }
      return allowed;
    },
    [],
  );

  const [step, setStep] = useState<StepId>(() =>
    resolveStep(
      new URLSearchParams(window.location.search).get("step"),
      session,
      todayKey,
    ),
  );
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
  // Holds the EARLIEST unanswered housekeeping screen (or null once they are
  // all done) rather than a bare pass/fail, so a back or forward press with a
  // half-filled session lands on the first hole instead of a later screen.
  const gateRef = useRef<StepId | null>(null);
  // The intent answers, for the same reason: browser FORWARD must be judged
  // against what the session holds NOW, not what it held when the listener was
  // attached. Untick your only answer, then press Forward.
  const answersRef = useRef<{ running: readonly unknown[]; struggle: readonly unknown[] }>({
    running: [],
    struggle: [],
  });
  // Which step is on screen NOW, for the popstate handler. It has to compare
  // against the live value to tell a back traversal from a forward one, and a
  // listener attached once would otherwise close over the step it was mounted
  // with. Same reason as the two refs above.
  const stepRef = useRef<StepId>(step);
  useEffect(() => {
    gateRef.current = firstIncompleteHousekeeping(session, todayKey);
    answersRef.current = { running: session.running, struggle: session.struggle };
    stepRef.current = step;
  }, [session, todayKey, step]);

  // The hardware/browser back button walks the flow.
  useEffect(() => {
    const onPop = () => {
      const requested = new URLSearchParams(window.location.search).get("step");
      beginSettle();

      // Same clamps as the initial read: history is user-editable too, and the
      // URL is corrected to whatever actually renders.
      const target = isStepId(requested)
        ? clampIntent(
            clampStep(requested, gateRef.current),
            answersRef.current,
          )
        : FIRST_STEP;

      /**
       * WHICH WAY DID HISTORY JUST MOVE?
       *
       * `popstate` fires on FORWARD exactly as it does on back, and this used
       * to assume back unconditionally — `setDirection("back")` and a blanket
       * `depth - 1`. So a forward traversal DECREMENTED the depth the back
       * arrow is gated on: Continue, Continue, Back, Forward left you on
       * `birthday` at depth 0 with no arrow, having slid in from the left as
       * though you had gone backwards. Alternating back and forward pinned
       * depth at 0 arbitrarily deep in the flow.
       *
       * The step order is the only thing that actually knows: a lower index
       * than the one on screen is a move back, a higher one is a move forward.
       * That is true regardless of how the entry was reached, which a flag on
       * the push side could never be.
       */
      const delta = stepIndex(target) - stepIndex(stepRef.current);
      // A clamp can land on the step already showing. Nothing moved, so the
      // depth must not move either — counting it would be the same
      // off-by-one in miniature.
      if (delta !== 0) {
        setDirection(delta < 0 ? "back" : "forward");
        setDepth((d) => (delta < 0 ? Math.max(0, d - 1) : d + 1));
      }

      // Correct the address bar when the clamp refused what was asked for,
      // for the same reason as the initial read: a URL that disagrees with the
      // screen spends a Back press doing nothing.
      if (isStepId(requested) && target !== requested) {
        const url = new URL(window.location.href);
        url.searchParams.set("step", target);
        window.history.replaceState({ step: target }, "", url);
      }

      setStep(target);
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
    const target = nextStepFor(step, platform);
    if (!target) return;
    setDirection("forward");
    setStep(target);
    pushStep(target);
  }, [step, pushStep, platform]);

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
              // The four housekeeping screens RISE; everything else slides
              // sideways. They are one conversation rather than four places,
              // and a set of questions answering in turn should stack upward
              // the way the log sheet's cards do (Adrian, 2026-08-05). Back
              // still slides, so reversing always reads as reversing.
              direction === "back"
                ? "animate-flow-back"
                : HOUSEKEEPING_STEPS.includes(step)
                  ? "animate-flow-rise"
                  : "animate-flow-forward",
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
