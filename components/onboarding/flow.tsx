"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

import { CaretLeft } from "@/components/icons";
import { cn } from "@/lib/utils";
import { track } from "@/lib/onboarding/analytics";
import { codeFromSearch } from "@/lib/onboarding/affiliate";
import {
  clearSession,
  readSession,
  writeSession,
  type OnboardingSession,
} from "@/lib/onboarding/session";
import {
  clampIntent,
  clampStep,
  FIRST_STEP,
  nextStep,
  nextStepFor,
  prevStep,
  resolveStepId,
  stepIndex,
  stepProgress,
  type StepId,
} from "@/lib/onboarding/steps";
import { firstIncompleteHousekeeping } from "@/lib/onboarding/session";
import { PLANS, type PlanId, type PricedPlan } from "@/lib/onboarding/pricing";
import type { TrialEligibility } from "@/app/onboarding/billing-actions";
import { guessPlatform } from "@/lib/onboarding/platform";
import { todayKey as resolveTodayKey } from "@/lib/protocol/cycle";

import type { ClaimStatus } from "@/app/onboarding/actions";

import { AnswerHandoff } from "./answer-handoff";
import { HowItWorks } from "./how-it-works";
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

export function OnboardingFlow({
  signedIn = false,
  passedGate = false,
  prices = [],
  eligibility,
  firstChargeOn,
  graceEndsOn,
  chrome = "onboarding",
  startAt,
}: {
  /**
   * ⚠️ WHO IS DRIVING THIS FLOW — and it decides the header, nothing else.
   *
   * `"onboarding"` is a person working through sign-up: the progress rail is
   * honest for them, because there genuinely is a fixed number of steps left.
   *
   * `"billing"` is somebody who ALREADY HAS AN ACCOUNT and came from `/billing`
   * to pick a plan or change a card. A percentage is a lie to that person —
   * there is no flow to be 73% of the way through — and Adrian named it as the
   * thing that made the contact sheet hard to read (2026-08-23).
   *
   * ⚠️ IT CHANGES THE HEADER AND NOTHING ELSE. Same screens, same steps, same
   * eligibility, same Stripe calls. Behaviour is deliberately untouched: this is
   * a chrome switch, not a second flow, so the two entry points cannot drift
   * into rendering different products.
   */
  chrome?: "onboarding" | "billing";
  /**
   * Which screen to open on when the URL carries no `?step=`.
   *
   * `/plans` and `/checkout` are real routes rather than query strings, so the
   * step cannot be read out of the address bar the way `/onboarding?step=` is.
   * The route names the screen and passes it here.
   */
  startAt?: StepId;
  /** A session exists. Server-verified in `app/onboarding/page.tsx`. */
  signedIn?: boolean;
  /**
   * The account has PASSED the 18+/ToS gate. Strictly stronger than `signedIn`,
   * and the two are not interchangeable — see `clampStep`.
   */
  passedGate?: boolean;
  /** What Stripe says each plan costs. Empty when Stripe could not be reached. */
  prices?: readonly StripePlanPrice[];
  /**
   * ⚠️ RESOLVED ON THE SERVER at page render (spec 02b §3.6), so the checkout
   * screen's promise cannot change under somebody reading it.
   *
   * It used to be fetched from an effect, which on a payment screen means "7
   * days free" can become "First charge today" mid-read — and since `02a` the
   * Elements mode is derived from the same answer.
   *
   * Optional so the `/preview/paywall` harness, which mounts this flow with no
   * server behind it, keeps working on the generous default.
   */
  eligibility?: TrialEligibility;
  /**
   * ⚠️ THE FIRST-CHARGE DATE, FORMATTED ON THE SERVER in the user's stored
   * timezone (spec 02b §3.5), so the paywall and the checkout screen cannot
   * name different days and neither can drift with the device's zone.
   */
  firstChargeOn?: string;
  /**
   * A mid-grace user's grace end, formatted the same way. Null for everybody
   * else. Unlike {@link firstChargeOn} this is NOT a projection: it is a stored
   * `active_until`, so it can never be earlier than the date they were promised.
   */
  graceEndsOn?: string | null;
}) {
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

  return (
    <OnboardingFlowClient
      signedIn={signedIn}
      passedGate={passedGate}
      prices={prices}
      eligibility={eligibility}
      firstChargeOn={firstChargeOn}
      graceEndsOn={graceEndsOn}
      chrome={chrome}
      startAt={startAt}
    />
  );
}

/**
 * Client-only, so every initial value can be read straight out of the browser
 * in a lazy initialiser rather than being patched in from an effect.
 */
/** The shape `lib/billing/prices.ts` returns. Declared structurally rather than
 *  imported, because that module is `server-only` and this file is a client
 *  component — importing it would fail the build. */
export interface StripePlanPrice {
  plan: PlanId;
  priceId: string;
  amount: number;
  /**
   * The same amount in Stripe's minor units, for a payment-mode Elements mount
   * (spec 02a §3.4). Never derived from {@link amount} — see `PlanPrice`.
   */
  amountMinor: number;
  currency: string;
  interval: string;
  /**
   * How many intervals one charge covers. Stripe says "every three months" as
   * `interval: "month"` with `interval_count: 3`, so a screen reading only the
   * interval prices a quarterly plan as monthly (spec 02b §3.3).
   */
  intervalCount: number;
}

function OnboardingFlowClient({
  signedIn,
  passedGate,
  prices,
  eligibility,
  firstChargeOn,
  graceEndsOn,
  chrome,
  startAt,
}: {
  /** See `OnboardingFlow`. Decides the header only; behaviour is identical. */
  chrome: "onboarding" | "billing";
  startAt?: StepId;
  signedIn: boolean;
  passedGate: boolean;
  prices: readonly StripePlanPrice[];
  eligibility?: TrialEligibility;
  firstChargeOn?: string;
  graceEndsOn?: string | null;
}) {
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
   * A SIGNED-IN USER NEVER STANDS ON THE ACCOUNT SCREEN.
   *
   * `app/onboarding/page.tsx` enforces this for every request that reaches a
   * server. This is the same rule for the moves that do not — chiefly `popstate`
   * inside one mounted tree, which no server sees.
   *
   * **It does NOT cover a tab that loaded before the sign-in happened.**
   * `passedGate` is baked into that tab's render, so it is false there and this
   * is a no-op. A cold review measured exactly that: tab A sits on `free`, tab B
   * signs in, tab A walks forward and gets the sign-in form. Nothing
   * client-side can fix it, because nothing asked a server; the next real
   * request corrects it. The earlier version of this comment claimed that case
   * as covered, and it never was.
   *
   * It is a backstop, not the protection — the spec is explicit that a
   * client-side redirect is not protection, which is why the server rule exists
   * and is not replaced by this.
   *
   * The destination is read from `STEP_ORDER` rather than named, so inserting a
   * step after `account` later cannot leave this pointing past it.
   */
  const pastAccount = useCallback(
    (target: StepId): StepId =>
      passedGate && target === "account" ? (nextStep(target) ?? target) : target,
    [passedGate],
  );

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
   *
   * ## The correction happens in an EFFECT, not here
   *
   * This is called from a `useState` lazy initialiser, and it used to call
   * `history.replaceState` itself. Next patches that method to update its
   * Router, so a clamp that rewrote the URL was setState-ing the Router DURING
   * this component's render — React says so out loud
   * ("Cannot update a component (Router) while rendering a different
   * component"), reproduced by opening `?step=demo` with an empty session. It is
   * the same hazard `goNext` documents at length and was fixed for; this was the
   * one place still doing it. So this function is now PURE and `syncUrlToStep`
   * below owns the address bar.
   */
  const resolveStep = useCallback(
    (requested: string | null, s: OnboardingSession, today: string): StepId => {
      // `resolveStepId`, so a bookmark or a Stripe return carrying the retired
      // `paywall` / `checkout` ids still lands on the right screen. The URL is
      // then corrected to the real id by `syncUrlToStep`, which is why the old
      // name never survives past the first render.
      const resolved = resolveStepId(requested);
      if (!resolved) return FIRST_STEP;
      // A deep link cannot walk past the age gate, and cannot skip the intent
      // screens either. See `clampStep` and `clampIntent`.
      /**
       * ⚠️ THE COMP SKIP APPLIES TO DEEP LINKS TOO, or `/plans` would still hand
       * a free-for-life account a price list it cannot buy from.
       */
      const landed = pastAccount(
        clampIntent(
          clampStep(resolved, firstIncompleteHousekeeping(s, today), passedGate),
          s,
          passedGate,
        ),
      );
      return (eligibility?.comp ?? false) && (landed === "plans" || landed === "start")
        ? "welcome"
        : landed;
    },
    [passedGate, pastAccount, eligibility?.comp],
  );

  /**
   * ⚠️ THE ROUTE MAY NAME THE STEP INSTEAD OF THE QUERY STRING.
   *
   * `/plans` and `/checkout` carry no `?step=`, so reading the URL alone would
   * land them on `FIRST_STEP` — the very beginning of onboarding — for somebody
   * who already has an account. `startAt` is the route's own answer, and it is
   * still passed through `resolveStep`, so every clamp (the age gate, the intent
   * screens, housekeeping) applies exactly as it does to a deep link.
   */
  const [step, setStep] = useState<StepId>(() =>
    resolveStep(
      new URLSearchParams(window.location.search).get("step") ?? startAt ?? null,
      session,
      todayKey,
    ),
  );
  const [accountName, setAccountName] = useState<string | null>(null);

  /**
   * The plan definitions joined to what Stripe says they cost.
   *
   * `PLANS` keeps the label, the period and the order; the amount comes from
   * Stripe. Undefined for a plan whose price did not load — which every caller
   * has to handle, because the loader swallows a Stripe outage on purpose so a
   * free flow does not go down with a billing provider.
   */
  const priceFor = useCallback(
    (plan: PlanId): PricedPlan | undefined => {
      const match = prices.find((p) => p.plan === plan);
      return match
        ? {
            ...PLANS[plan],
            price: match.amount,
            amountMinor: match.amountMinor,
            currency: match.currency,
            interval: match.interval,
            intervalCount: match.intervalCount,
          }
        : undefined;
    },
    [prices],
  );

  /**
   * THE ADDRESS BAR TELLS THE TRUTH ABOUT WHAT IS ON SCREEN.
   *
   * A URL that disagrees with the screen is not cosmetic — it desynchronises the
   * flow from history, and the measured failure was: open `?step=paywall` cold,
   * land correctly on `name` with the URL still reading `paywall`, Continue
   * (pushes `birthday`), then press Back. `popstate` reads `paywall`, clamps to
   * `birthday` again, and NOTHING MOVES — but a history entry has been spent.
   * The second Back leaves the site. Two presses: one dead, one exit.
   *
   * In an effect rather than in `resolveStep`, so the Router is never updated
   * mid-render. A no-op on every ordinary step change, because `pushStep` and
   * the `popstate` handler have already written the URL by the time this runs.
   */
  useEffect(() => {
    /**
     * ⚠️ THE BILLING ENTRY POINTS OWN THEIR URLS AND MUST NOT BE REWRITTEN.
     *
     * This exists so `/onboarding` reflects the step in its address bar. On
     * `/plans` and `/checkout` the ROUTE already names the screen, and stamping
     * `?step=` onto it would produce `/plans?step=plans` and put an onboarding
     * query string on a billing route — exactly the bleed Adrian asked to end.
     */
    if (chrome === "billing") return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("step") === step) return;
    url.searchParams.set("step", step);
    window.history.replaceState({ step }, "", url);
  }, [step, chrome]);
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
      // URL is corrected to whatever actually renders. `resolveStepId` for the
      // same reason as the initial read — a history entry pushed before the
      // rename still carries an old id.
      const resolved = resolveStepId(requested);
      const target = resolved
        ? pastAccount(
            clampIntent(
              clampStep(resolved, gateRef.current, passedGate),
              answersRef.current,
              passedGate,
            ),
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

      // The address bar is corrected by `syncUrlToStep` once this lands — see
      // that effect for why a URL disagreeing with the screen costs a Back
      // press. Doing it here as well would be a second writer for one value.
      setStep(target);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [beginSettle, passedGate, pastAccount]);

  /**
   * ONCE THE ANSWERS ARE ON THE ACCOUNT, THE DEVICE COPY STOPS BEING A RECORD.
   *
   * Not cosmetic. `patch` persists on every call, and the paywall calls it on
   * every plan tap. So without this latch the very next tap after a confirmed
   * claim would write the whole answer set straight back into the key the claim
   * had just cleared — undoing "cleared only after the write is confirmed" one
   * render later, and leaving a stale copy on the device forever.
   *
   * The in-memory session deliberately survives, because the paywall still needs
   * `plan` and nothing else has anywhere to read it from yet.
   *
   * A ref, not state: `patch` must not be re-created when this flips, or every
   * screen holding it re-renders for a change none of them can see.
   */
  const claimed = useRef(false);

  const patch = useCallback((next: Partial<OnboardingSession>) => {
    setSession((current) => {
      const merged = { ...current, ...next };
      if (!claimed.current) writeSession(merged);
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

  /**
   * EVERY NON-ERROR OUTCOME OF THE CLAIM, AND WHERE IT SENDS THE USER.
   *
   * The account screen is a waiting room once you are signed in — the auth
   * redirect lands there, because the paywall requires a PROVEN age and the
   * thing that proves it is the claim, which needs this page's `localStorage`
   * and so cannot run before the redirect resolves. Arrive, claim, then move.
   *
   * Nobody is left looking at a spinner. Each outcome has a destination:
   *
   *   written / already-claimed  the device copy is dropped (the ONLY place
   *                              that happens, and only after the server said
   *                              so) and, if gated, the flow walks on to the
   *                              paywall.
   *   nothing-to-claim           there is nothing here and nothing on the
   *                              account, so the gate cannot be written from
   *                              answers that do not exist. `/welcome` is the
   *                              screen that exists for exactly that.
   *   no-session                 this tab's `signedIn` was stale. A full load
   *                              of the flow re-asks the server, which is the
   *                              only thing that can answer it.
   */
  const onResolved = useCallback(
    (status: ClaimStatus, name: string | null, gated: boolean) => {
      if (status === "no-session") {
        // Not a client-side redirect standing in for a guard — it is a request,
        // and the guard runs on it. See `app/onboarding/page.tsx`.
        window.location.assign("/onboarding");
        return;
      }

      if (status === "written" || status === "already-claimed") {
        claimed.current = true;
        clearSession();
        if (name) setAccountName(name);
      }

      // Only the account screen has anywhere to be sent. Everywhere else the
      // user is already where they should be and a navigation would be a jolt.
      if (stepRef.current !== "account") return;

      if (gated) {
        const target = nextStep("account");
        if (target) {
          setDirection("forward");
          setStep(target);
          pushStep(target);
        }
        return;
      }

      // Signed in, standing on the account screen, and still not gated. Only
      // reachable with nothing to claim; the flow cannot gate them, so hand
      // them to the screen that can.
      router.replace("/welcome");
    },
    [pushStep, router],
  );

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
  /**
   * ⚠️ A FREE-FOR-LIFE ACCOUNT NEVER SEES A PLAN LIST OR A CARD SCREEN
   * (Adrian, 2026-08-25).
   *
   * `01` already refuses a subscription for a comp, so both screens were dead
   * ends for this cohort: a price list they cannot buy from, and a card form
   * that would be refused. Adrian's ruling on the copy review was to remove them
   * outright rather than soften them — *"can we get rid of the screen? Can it
   * just automatically say... you're in, and then have Kyle."*
   *
   * So `plans` and `start` are stepped over and the flow lands on `welcome`,
   * which now carries the comp's own sentence ("You've been given complimentary
   * access.") instead of the free-days line it withholds.
   *
   * ⚠️ IT IS A SKIP, NOT A REMOVAL. Both steps stay in `STEP_ORDER` — that list
   * is the canonical sequence for everybody else, and a comp whose entitlement
   * were ever withdrawn walks the ordinary path again with no code change.
   */
  /** Free for life. `TrialEligibility.comp`; false where no server backs the flow. */
  const comp = eligibility?.comp ?? false;

  const pastComp = useCallback(
    (target: StepId): StepId =>
      comp && (target === "plans" || target === "start") ? "welcome" : target,
    [comp],
  );

  const goNext = useCallback(() => {
    const next = nextStepFor(step, platform);
    if (!next) return;
    // `pastAccount` because a signed-in user walking forward from `free` must
    // not land on a sign-in form they have no use for. See `pastAccount`.
    const target = pastComp(pastAccount(next));
    setDirection("forward");
    setStep(target);
    pushStep(target);
  }, [step, pushStep, platform, pastAccount, pastComp]);

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

  /**
   * The "Here's how it works." beat. See `playHandoff` on the context for why
   * it is owned here rather than by the screen that fires it.
   */
  const [handoff, setHandoff] = useState(false);
  const playHandoff = useCallback(() => setHandoff(true), []);

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
      signedIn,
      priceFor,
      todayKey,
      setBackHandler,
      playHandoff,
      eligibility,
      firstChargeOn,
      graceEndsOn,
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
      signedIn,
      priceFor,
      todayKey,
      setBackHandler,
      playHandoff,
      eligibility,
      firstChargeOn,
      graceEndsOn,
    ],
  );

  // A screen that owns BACK always shows the arrow (the demo steps its own
  // stages); otherwise it only shows if this flow actually pushed something.
  const canGoBack =
    backOwned || (depth > 0 && step !== FIRST_STEP && prevStep(step) !== null);

  return (
    <FlowContext.Provider value={value}>
      {/* Portalled to the body, so it sits over the header as well as the step.
          It dismisses ITSELF — the step has already moved on by the time it is
          visible, so there is nothing left for it to advance. */}
      {handoff ? <HowItWorks onDone={() => setHandoff(false)} /> : null}
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

            {/**
              * ⚠️ NO PROGRESS RAIL FOR SOMEBODY WHO IS NOT ONBOARDING.
              *
              * The rail answers "how much of sign-up is left". Asked from
              * `/billing` that question has no answer, and the screen was
              * showing "73%" to a person who had finished onboarding weeks ago.
              *
              * The grid column is kept (an empty span) rather than removed, so
              * the back arrow stays in exactly the same place and the header
              * does not reflow between the two entry points.
              */}
            {/* ⚠️ THE MIDDLE CELL MUST ALWAYS EXIST, even when it is empty.
                `ProgressRail` returns null on the hook (nothing done yet, and a
                bar reading 0% is a worse first impression than no bar) — and a
                component returning null renders NO NODE, so the grid was left
                with two children and the third one silently slid into the
                middle column. Measured: the wordmark sat at x=164 on the hook
                and x=315 on every other step, i.e. the logo moved between
                screens, which is the one thing this header is built not to do.
                A wrapper that always renders pins the cell. */}
            <div className="flex items-center justify-center">
              {chrome === "onboarding" ? (
                <ProgressRail progress={stepProgress(step)} />
              ) : null}
            </div>

            {/* THE WORDMARK, ON EVERY STEP (Adrian, 2026-08-27), so the flow
                reads as one product rather than twenty loose screens.

                ⚠️ IT IS NOT TOP-LEFT, WHICH IS WHAT HE ASKED FOR, AND HERE IS
                WHY. Top-left is the back arrow's, on nineteen of twenty steps.
                Putting the mark beside it means it sits at x=0 on the hook and
                x=40 everywhere else — a logo that moves between screens — and
                putting it in the left column outright pushes the centred
                progress rail off true, because the grid's outer columns are
                `1fr` each and the mark is wider than the arrow. The right
                column was empty and exists only to balance the arrow, so the
                mark takes it and the rail stays centred by the layout.

                `h-3` and not larger: this column is `1fr`, and a mark wide
                enough to exceed it would push the rail after all.

                Not `priority` — it is chrome on every screen, and the hook's
                own hero is what should win the first paint. */}
            <div className="flex items-center justify-end">
              <Image
                src="/trackd-wordmark.png"
                alt="Trackd.co"
                width={1049}
                height={200}
                className="h-3 w-auto opacity-70"
              />
            </div>
          </div>

          {/* THE ANSWER HANDOFF. Renders nothing unless the claim failed, in
              which case it is a retry notice under the progress rail. It sits
              OUTSIDE the keyed step wrapper on purpose: that wrapper remounts on
              every step change, and a retry that vanished the moment the user
              moved would be a retry nobody ever pressed.

              It takes the SESSION, not the step. Gating it on the step's phase
              meant one failed claim was unrecoverable: the user taps past the
              banner to the end of the flow, and re-entering `/onboarding` lands
              on `hook`, an anonymous step, so it never fired again. */}
          <AnswerHandoff signedIn={signedIn} step={step} onResolved={onResolved} />

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
