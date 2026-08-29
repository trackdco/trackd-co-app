"use client";

import Image from "next/image";
import { useCallback, useState, useSyncExternalStore } from "react";

import { DotsThree, Plus, Share } from "@/components/icons";
import { useMounted } from "@/components/home/useMounted";
import { usePwaInstall } from "@/components/pwa/usePwaInstall";
import { track } from "@/lib/onboarding/analytics";
import {
  BROWSER_LABEL,
  canInstallHere,
  guessDevice,
  installFlowId,
  installSteps,
  type Browser,
  type DeviceGuess,
} from "@/lib/onboarding/platform";
import { DATA_MONO } from "@/lib/ui-presets";
import { cn } from "@/lib/utils";

import { ChromeMark, SafariMark } from "../browser-marks";
import { FlowCta, SkipLink, StepFrame } from "../chrome";
import { SkipConfirm, SkipTrigger } from "../skip-install";
import { InstallWalkthrough } from "../install-walkthrough";
import { OpenInSafari } from "../open-in-safari";
import { Segmented } from "../controls";
import { useFlow } from "../flow-context";

/**
 * Screen 13 — Add to Home Screen (Spec 3-01 §9, §12).
 *
 * **This is the LAST screen of the flow** (Adrian, 2026-08-07); it used to be
 * the first of the post-paywall four. An installed iOS app has its own storage
 * container, so adding the icon mid-flow and opening it landed the user signed
 * out on `/login` with the rest of onboarding abandoned. `STEP_ORDER` carries
 * the full reasoning and a test pins the position.
 *
 * The old rule here was the reverse — install BEFORE notifications, because iOS
 * cannot grant push to an uninstalled site. That constraint has not gone away,
 * it has MOVED: `notifications` no longer makes the request on iOS, and defers
 * it to the installed app where it is the only place it can succeed.
 *
 * ## Four states, because there are genuinely four
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
 *    real OS install dialog. No instructions until it fails.
 * 3. **Android, prompt refused** — `beforeinstallprompt` having fired is not a
 *    promise that the dialog appears or succeeds: it can be dismissed, Chrome
 *    can decline to show it twice, and some builds resolve it with no dialog at
 *    all. So the manual steps appear underneath and the OS button stays
 *    available (Adrian, 2026-08-01). Leaving someone on a button that already
 *    did nothing is the dead end this avoids.
 * 4. **iOS** — there is no install API and never has been. Apple has shipped
 *    nothing for this, so the job here is clarity, not automation: the Share
 *    sheet, spelled out.
 *
 * The "I've added it" button exists in the two cases where we genuinely cannot
 * know: iOS, and an Android install we were never told the outcome of.
 */

/** The three icons the step list can ask for, resolved once. */
const STEP_ICON = {
  share: <Share className="h-4 w-4" />,
  menu: <DotsThree className="h-4 w-4" />,
  plus: <Plus className="h-4 w-4" />,
} as const;

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
  // LAST SCREEN, so every exit calls `finish()`. There is no next step, and
  // advancing past the end of `STEP_ORDER` is a silent no-op — the buttons
  // would simply have stopped working.
  const { finish } = useFlow();
  /**
   * Platform AND browser, guessed after mount and overridable. `device` is what
   * every piece of copy on this screen reads from, so the toggle genuinely
   * changes the instructions rather than only the label above them.
   *
   * ⚠️ GUESSED AFTER MOUNT, NOT IN THE INITIALISER. `useState(guessDevice)` runs
   * on the server too, where there is no `navigator` — so SSR always guessed
   * iPhone/Safari and every other device hydrated into a mismatch. Measured:
   * clean on iPhone Safari, one hydration error each on iPhone Chrome, Android
   * Chrome and Samsung Internet. React recovered by throwing the subtree away
   * and re-rendering, which is a flash of the wrong instructions for the
   * majority of Android users. Same `useMounted` shape `InstallHomeScreenPopup`
   * already uses for `getCapability`.
   */
  const mounted = useMounted();
  const [override, setOverride] = useState<DeviceGuess | null>(null);
  const device: DeviceGuess =
    override ?? (mounted ? guessDevice() : { platform: "ios", browser: "safari" });
  const setDevice = useCallback(
    (next: DeviceGuess | ((d: DeviceGuess) => DeviceGuess)) => {
      // Only ever called from a toggle, so `guessDevice()` is safely client-side.
      setOverride((prev) =>
        typeof next === "function" ? next(prev ?? guessDevice()) : next,
      );
    },
    [],
  );
  const platform = device.platform;
  const { canInstall, promptInstall } = usePwaInstall();
  const [busy, setBusy] = useState(false);

  const installed = useSyncExternalStore(
    subscribeStandalone,
    standaloneSnapshot,
    () => false,
  );

  /**
   * "I've added it" lands on a confirmation, not the dashboard.
   *
   * Adrian: "it takes me to the home page. I want it to take me to the page
   * where it says Trackd is on your home screen." He is right — the tab they
   * are looking at is now the WRONG copy of the app, and dropping them on the
   * dashboard inside it is an invitation to carry on in a browser tab whose
   * notifications will never arrive.
   *
   * A state on this screen rather than a new entry in `STEP_ORDER`: install is
   * deliberately last, a test pins that, and the position carries reasoning
   * about iOS storage containers that a new step would quietly disturb.
   */
  const [confirmed, setConfirmed] = useState(false);
  const confirmManually = useCallback(() => {
    track("install_confirmed", { platform, method: "self-reported" });
    setConfirmed(true);
  }, [platform]);

  /**
   * Has the OS dialog been tried and NOT resulted in an install?
   *
   * Adrian, 2026-08-01: "if for some reason any issues with it then they should
   * give the instructions". `beforeinstallprompt` having fired is not a promise
   * that the dialog appears or succeeds — the user can dismiss it, Chrome can
   * refuse to show it twice, and some builds resolve it with no dialog at all.
   * Leaving the user on a button that already did nothing is the dead end this
   * avoids: the manual steps appear underneath, and they get a way past.
   */
  const [pickerOpen, setPickerOpen] = useState(false);
  const [skipAsking, setSkipAsking] = useState(false);
  const [promptFailed, setPromptFailed] = useState(false);

  /**
   * Android, prompt working, user still wants to see it done.
   *
   * The one-tap path stays the default and nothing is shown by default, because
   * a wall of instructions above a button that already works is noise. But
   * "I'd rather see it" is a reasonable thing to want from a step that is about
   * to change their home screen, and refusing to show it until the automatic
   * route FAILS makes them fail first to earn the explanation.
   */
  const [showSteps, setShowSteps] = useState(false);

  const install = useCallback(async () => {
    setBusy(true);
    // A rejected promise here used to be an unhandled rejection that also left
    // `busy` true, so the button read "Opening" for ever.
    const outcome = await promptInstall().catch(() => "unavailable" as const);
    setBusy(false);
    if (outcome === "accepted") {
      track("install_confirmed", { platform, method: "prompt" });
      finish();
      return;
    }
    track("install_prompt_failed", { platform, outcome: String(outcome) });
    setPromptFailed(true);
  }, [finish, platform, promptInstall]);

  /* ---- 0. They say it is done. Point them AT the thing they just made. ---- */
  if (confirmed) {
    return (
      <StepFrame
        center
        title="Trackd is on your home screen"
        sub="Open it from there, not from this tab. That is where your reminders come from."
        footer={
          <div className="space-y-1">
            <FlowCta onClick={finish}>Done</FlowCta>
            <SkipLink onClick={() => setConfirmed(false)}>
              Actually, show me the steps again
            </SkipLink>
          </div>
        }
      >
        <div className="flex justify-center">
          <span className="relative block size-24 overflow-hidden rounded-[26.4%] bg-bg-base">
            <Image src="/icon-192.png" alt="" width={192} height={192} className="size-full" />
          </span>
        </div>
      </StepFrame>
    );
  }

  /* ---- 1. Already installed. Nothing to ask for. ---- */
  if (installed) {
    return (
      <StepFrame
        center
        title="You're already set up"
        sub="Trackd is on your home screen, so reminders can reach you."
        footer={<FlowCta onClick={confirmManually}>Enter Trackd</FlowCta>}
      />
    );
  }

  /* ---- 2. Android: a real button, and the manual steps only if it fails. ---- */
  if (canInstall) {
    return (
      <StepFrame
        center
        title="Add Trackd to your home screen"
        sub={
          promptFailed
            ? "The install prompt did not open. You can add it from the browser menu instead."
            : "One tap. It works like a normal app once it's there, and reminders need it."
        }
        footer={
          <div className="space-y-1">
            <FlowCta onClick={promptFailed ? confirmManually : install} disabled={busy}>
              {busy
                ? "Opening"
                : promptFailed
                  ? "I've added it"
                  : "Add to home screen"}
            </FlowCta>
            {/* The OS button stays available underneath: Chrome will often
                show the dialog on a second attempt, and taking the automatic
                path away because it missed once would be the wrong trade. */}
            {promptFailed ? (
              <SkipLink onClick={install}>Try again</SkipLink>
            ) : (
              <SkipLink onClick={() => setShowSteps((s) => !s)}>
                {showSteps ? "Hide the steps" : "Show me how instead"}
              </SkipLink>
            )}
            <SkipLink onClick={finish}>Skip for now</SkipLink>
          </div>
        }
      >
        {/* Nothing at all until the automatic path fails — an empty box here
            would take the centred block off centre for a spacer. */}
        {promptFailed || showSteps ? <InstallHowTo device={device} /> : null}
      </StepFrame>
    );
  }

  /* ---- 3. iOS, or a browser that will not offer it: spell it out. ---- */

  // ON iOS, ONLY SAFARI CAN INSTALL (Adrian, 2026-08-05: "make it whatever the
  // user is on"). Chrome, Firefox and Edge on iOS have no Add to Home Screen at
  // all — Apple does not expose it — so describing Safari's Share sheet to them
  // sends them hunting for a control that does not exist. The honest screen
  // says which browser they need.
  const wrongBrowser = !canInstallHere(device);

  return (
    <StepFrame
      center
      title={
        wrongBrowser
          ? `Open Trackd in Safari to add it`
          : "Add Trackd to your home screen"
      }
      // "Do this first." and nothing after it (Adrian, 2026-08-05). The tail
      // used to explain the consequence — "or reminders can't reach you" —
      // which is true and is still the reason the screen exists, but it argues
      // where the line above already instructs. Reminders get their own screen
      // immediately after this one and can make their own case there.
      sub={
        wrongBrowser
          ? `${BROWSER_LABEL[device.browser]} on iPhone can't add apps to the home screen. Only Safari can.`
          : "It works like a normal app once it's there. Do this first."
      }
    >
      <div className="space-y-4">
        {/* ⚠️ NO DEVICE PICKER (Adrian, 2026-08-29). Asking somebody which phone
            they are holding reads as the app not knowing, and it is right
            almost always. The override survives as a quiet link below, because
            UA sniffing IS a guess and a wrong one otherwise strands them on
            instructions for a menu they do not have. */}
        <InstallHowTo device={device} />
        {wrongBrowser ? <OpenInSafari /> : null}

        {/* The actions live AFTER the steps, so reaching them means having
            scrolled past them. Pinned, they read as the end of the screen and
            the walkthrough underneath went unseen. */}
        <div className="space-y-1 pt-2">
          {skipAsking ? (
            <SkipConfirm onCancel={() => setSkipAsking(false)} onSkip={finish} />
          ) : (
            <>
              {wrongBrowser ? null : (
                <FlowCta onClick={confirmManually}>I&apos;ve added it</FlowCta>
              )}
              {wrongBrowser ? (
                <SkipLink onClick={confirmManually}>I&apos;ve added it</SkipLink>
              ) : null}

              {/* ⚠️ iOS ONLY, AND ON PURPOSE.
                  On iOS the wrong guess is BINARY and the cost is total: Chrome
                  cannot install at all, so somebody reading Safari's steps is
                  hunting for a control Apple never gave their browser. One
                  named button fixes it.

                  Android deliberately does NOT get this. It is a three-way
                  choice (Chrome, Samsung Internet, Firefox), so a single
                  "instead" button cannot name the right one — and being wrong
                  there is recoverable, because every Android browser can
                  install and the one-tap prompt works regardless of whose menu
                  we drew. The picker below is the right tool for a three-way
                  choice. */}
              {platform === "ios" ? (
                <button
                  type="button"
                  onClick={() =>
                    setDevice({
                      platform: "ios",
                      browser: device.browser === "safari" ? "chrome" : "safari",
                    })
                  }
                  className="flex h-12 w-full items-center justify-center gap-2.5 rounded-2xl border border-border-strong bg-bg-base text-[0.9rem] font-medium text-foreground transition-colors duration-[var(--motion-fast)] hover:bg-bg-surface focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none motion-reduce:transition-none"
                >
                  {device.browser === "safari" ? (
                    <>
                      <ChromeMark className="size-[18px]" />
                      On Chrome instead
                    </>
                  ) : (
                    <>
                      <SafariMark className="size-[18px]" />
                      On Safari instead
                    </>
                  )}
                </button>
              ) : null}

              <SkipLink onClick={() => setPickerOpen((o) => !o)}>
                {pickerOpen ? "Hide" : "Not the phone you\u2019re on?"}
              </SkipLink>
              {pickerOpen ? (
                <DevicePicker device={device} onChange={setDevice} />
              ) : null}
              <SkipTrigger onClick={() => setSkipAsking(true)} />
            </>
          )}
        </div>
      </div>
    </StepFrame>
  );
}

/**
 * The override, behind a link rather than on the screen.
 *
 * UA sniffing is a good guess, not a certainty, and the cost of a wrong one is
 * somebody hunting for a menu item their browser does not have. So the controls
 * still exist; they are just not the first thing on a screen that already knows
 * the answer.
 */
function DevicePicker({
  device,
  onChange,
}: {
  device: DeviceGuess;
  onChange: (next: DeviceGuess | ((d: DeviceGuess) => DeviceGuess)) => void;
}) {
  return (
    <div className="space-y-2 pt-2">
      <Segmented
        label="Your device"
        value={device.platform}
        onChange={(next) =>
          // Resetting the browser with the platform, because a stale "Samsung
          // Internet" against iPhone describes a combination that cannot exist.
          onChange({ platform: next, browser: next === "ios" ? "safari" : "chrome" })
        }
        options={[
          { value: "ios", label: "iPhone" },
          { value: "android", label: "Android" },
        ]}
      />
      <Segmented
        label="Your browser"
        value={device.browser}
        onChange={(browser) => onChange((d) => ({ ...d, browser }))}
        options={
          device.platform === "ios"
            ? ([
                { value: "safari", label: "Safari" },
                { value: "chrome", label: "Chrome" },
              ] as { value: Browser; label: string }[])
            : ([
                { value: "chrome", label: "Chrome" },
                { value: "samsung", label: "Samsung" },
              ] as { value: Browser; label: string }[])
        }
      />
    </div>
  );
}

/**
 * Show the walkthrough where there is one, and fall back to the text list
 * where there is not.
 *
 * The only case without one is iOS outside Safari, where the install cannot
 * happen at all: there is no Share sheet to draw, and the instruction is to
 * change browser rather than to press anything. A picture would be inventing a
 * screen that does not exist.
 */
function InstallHowTo({ device }: { device: DeviceGuess }) {
  return installFlowId(device) ? (
    <InstallWalkthrough device={device} />
  ) : (
    <InstallSteps device={device} />
  );
}

/**
 * The manual Share-sheet / menu steps. One component, two callers: the iOS path
 * (where there has never been an install API) and the Android FALLBACK (where
 * there is one and it did not work). Shared rather than duplicated, because two
 * copies of a set of instructions is how one of them ends up describing a menu
 * that moved.
 */
function InstallSteps({ device }: { device: DeviceGuess }) {
  return (
    <ol className="flow-card rounded-2xl bg-bg-surface px-5">
      {installSteps(device).map((step, i) => (
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
                {STEP_ICON[step.icon]}
              </span>
            ) : null}
            {step.text}
          </span>
        </li>
      ))}
    </ol>
  );
}
