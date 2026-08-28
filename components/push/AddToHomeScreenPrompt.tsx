import { InstallWalkthrough } from "@/components/onboarding/install-walkthrough";
import { SHEET_TITLE } from "@/lib/ui-presets";

/**
 * The shared "Add to Home Screen" instructions for iPhone. Used by the install
 * popup (components/pwa/InstallHomeScreenPopup), the permanent Profile → "Add to
 * Home Screen" row (components/profile/InstallAppRow), and the push flow when iOS
 * isn't installed yet (iOS only delivers Web Push to a Home-Screen-installed
 * standalone PWA).
 *
 * ## Why this shows the walkthrough (Adrian, 2026-08-29)
 *
 * He asked how somebody is told what to do **once they have got themselves into
 * Safari**, and the honest answer was: by this component, with a three-line text
 * list — while the person who never left the onboarding flow got the drawn
 * walkthrough. That is backwards. The user who lands here is the one who was
 * just bounced out of Chrome, told to copy a URL, and made to sign in a second
 * time; they have spent more patience than anybody and understand less about
 * where they are. They get the pictures.
 *
 * ⚠️ ALL THREE CALLERS GATE ON iOS SAFARI before rendering this — non-Safari
 * iOS gets `OpenInSafariPrompt` instead, because the install is impossible
 * there. So the device is pinned rather than guessed: this component is only
 * ever reached in one situation, and re-deriving it here would invite the two
 * checks to disagree.
 *
 * Presentational only (no hook, no state) — the parent decides when to show it.
 */
export function AddToHomeScreenPrompt() {
  return (
    <div className="rounded-2xl bg-bg-surface p-5">
      <p className={SHEET_TITLE}>Add Trackd to your Home Screen</p>
      <p className="mt-1.5 mb-4 text-sm leading-relaxed text-text-muted">
        Get the full app, not a Safari tab. Here&apos;s how:
      </p>
      <InstallWalkthrough device={{ platform: "ios", browser: "safari" }} />
    </div>
  );
}
