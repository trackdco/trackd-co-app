import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CARD_EYEBROW, DATA_MONO, PAGE_TITLE } from "@/lib/ui-presets";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Desktop tour · Trackd Co",
};

/**
 * DEV-ONLY index of every screen, for reviewing the desktop layer.
 *
 * Two lists, because there are two ways to look at this and they answer
 * different questions:
 *
 *  1. **The real app.** Needs a signed-in session, and it is the only place the
 *     SHELL exists — the sidebar, the rail, the command palette all live in
 *     `app/(app)/layout.tsx`. This is what to review.
 *  2. **The preview harness.** The same screen components with seeded data and
 *     no auth, rendered bare with no shell. Useful for checking a screen's grid
 *     in isolation, and the only way to see these without signing in.
 *
 * 404s in production, like every other `/preview` route.
 */

interface Screen {
  href: string;
  name: string;
  /** What the desktop layer actually does to this screen. */
  desktop: string;
  /** The matching unauthenticated preview, where one exists. */
  preview?: string;
}

const APP_SCREENS: Screen[] = [
  {
    href: "/dashboard",
    name: "Dashboard",
    desktop:
      "Two columns. The week strip runs full width instead of squeezing seven days into 350px; Today's Log takes the tall left column and the day's readings stack on the right.",
    preview: "/preview/home",
  },
  {
    href: "/protocol",
    name: "Protocol",
    desktop:
      "Compounds and the schedule grid go full width, so twelve weeks are visible at once rather than scrubbed through. Stacks and Cycles sit side by side beneath.",
    preview: "/preview/protocol",
  },
  {
    href: "/calculator",
    name: "Reconstitution calculator",
    desktop:
      "Two columns. The form on the left, the barrel and the three figures on the right, so they move as you type instead of living a scroll away. The one screen whose phone problem was ORDER rather than width.",
    preview: "/preview/recon",
  },
  {
    href: "/progress",
    name: "Progress",
    desktop:
      "Photos take ONE column, tall on the left, because that card fills its width at a portrait aspect and two columns made it 1000px high. The block sits top right with the four reading widgets in a 2x2 beneath it.",
    preview: "/preview/progress",
  },
  {
    href: "/calendar",
    name: "Calendar",
    desktop:
      "The month keeps the full column and the day cells finally get height. Clicking a day opens it in the RAIL, so the month stays readable behind it. The clearest single argument for the rail.",
    preview: "/preview/calendar",
  },
  {
    href: "/profile",
    name: "Profile",
    desktop:
      'One column at a readable measure. Carries the new "Get it on your phone" row with the QR code, which is where the retired interstitial ended up.',
    preview: "/preview/profile",
  },
  {
    href: "/weight",
    name: "Weight",
    desktop: "Wider column (920px), because the subject is a graph and a trend line is the one thing genuinely cramped on a phone.",
    preview: "/preview/weight",
  },
  {
    href: "/blocks",
    name: "Blocks",
    desktop: "Same wider column as Weight, for the same reason.",
    preview: "/preview/blocks",
  },
  {
    href: "/notifications",
    name: "Notifications",
    desktop: "Settings. One column at 640px: a switch row stretched across a monitor puts the label and its control at opposite ends.",
  },
  { href: "/billing", name: "Billing", desktop: "Settings column." },
  { href: "/billing/manage", name: "Billing · manage", desktop: "Settings column." },
];

const OUTSIDE_SHELL: Screen[] = [
  {
    href: "/login",
    name: "Login",
    desktop:
      "Was BLOCKED on desktop before this branch: the old gate did not exempt it, so a laptop visitor hit the wall instead of a sign-in form. Now it works.",
  },
  {
    href: "/welcome",
    name: "Welcome · 18+ gate",
    desktop: "Also newly reachable on a laptop.",
  },
  {
    href: "/onboarding",
    name: "Onboarding",
    desktop:
      'Was already exempt from the old gate. What changed: there is no "add to home screen" step on a laptop (nothing to add it to), so the founder letter is the last screen and its button reads "Open Trackd". The notification prompt is drawn as a browser panel rather than an Android sheet.',
  },
  {
    href: "/forgot-password",
    name: "Forgot password",
    desktop: "Newly reachable.",
  },
  { href: "/admin", name: "Admin", desktop: "Untouched. It had its own desktop design already." },
];

const ART: Screen[] = [
  {
    href: "/preview/notify-prompts",
    name: "Notification prompts",
    desktop:
      "The three permission dialogs side by side: desktop, iOS, Android. The desktop one is new. They exist as three drawings because the point is that somebody recognises the dialog they are about to be shown.",
  },
];

const CHECKS: { label: string; detail: string }[] = [
  {
    label: "Resize past 1024px",
    detail:
      "The shell should snap between phone and desktop with no flash and no reload. Below 1024 you should get exactly the phone app, bottom nav and all.",
  },
  {
    label: "Press ⌘K",
    detail: "The command palette. Arrow keys move, return goes, escape closes.",
  },
  {
    label: "Press 1 to 6",
    detail:
      "Jumps between the six sidebar screens. It must NOT fire while you are typing in a field, which is the thing worth trying to break.",
  },
  {
    label: "Open anything that was a bottom sheet",
    detail:
      "A compound, a calendar day, a dose. It should slide in from the right as the rail, with the screen behind it still readable and no dimming. Escape closes it.",
  },
  {
    label: "Add a compound",
    detail:
      "That one is a centred dialog with a scrim instead, because it takes over a task rather than showing you one thing.",
  },
  {
    label: "Log a dose from the rail",
    detail: "On any screen, not just Dashboard. That is the thing a phone cannot do.",
  },
  {
    label: "Type into the calculator",
    detail:
      "5 mg powder, 2 mL BAC, 250 mcg dose. The barrel, the concentration, the mL per dose and the insulin units should all move with the inputs still under your hands, with nothing scrolling.",
  },
];

function ScreenRow({ screen }: { screen: Screen }) {
  return (
    <li className="hairline-t">
      <div className="flex flex-col gap-2 py-4 sm:flex-row sm:items-baseline sm:gap-5">
        <Link
          href={screen.href}
          className="min-w-[11rem] text-[0.9375rem] text-foreground underline-offset-4 outline-none hover:underline focus-visible:underline"
        >
          {screen.name}
          <span className={cn(DATA_MONO, "ml-2")}>{screen.href}</span>
        </Link>
        <p className="flex-1 text-sm leading-relaxed text-text-muted">{screen.desktop}</p>
        {screen.preview ? (
          <Link
            href={screen.preview}
            className={cn(
              DATA_MONO,
              "shrink-0 rounded-full border border-border-default px-2.5 py-1 uppercase tracking-[0.08em] outline-none transition-colors hover:border-border-strong hover:text-foreground focus-visible:text-foreground",
            )}
          >
            no-auth preview
          </Link>
        ) : null}
      </div>
    </li>
  );
}

export default function DesktopTourPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-14">
      <p className={CARD_EYEBROW}>Trackd Co · branch desktop-app</p>
      <h1 className={cn(PAGE_TITLE, "mt-3 text-[2rem]")}>The desktop tour</h1>
      <p className="mt-4 max-w-[62ch] text-sm leading-relaxed text-text-muted">
        Every screen in the app, on a laptop. Open these in a window wider than
        1024px with a mouse or trackpad attached: below that, or on a touch-only
        device, you get the phone app exactly as it was.
      </p>

      <section className="mt-10">
        <h2 className={CARD_EYEBROW}>In the shell · needs a signed-in session</h2>
        <p className="mt-2 max-w-[62ch] text-sm leading-relaxed text-text-muted">
          The sidebar, the rail and the command palette live in the app layout, so
          these are the only routes where you see the whole thing.
        </p>
        <ul className="mt-4">
          {APP_SCREENS.map((s) => (
            <ScreenRow key={s.href} screen={s} />
          ))}
        </ul>
      </section>

      <section className="mt-12">
        <h2 className={CARD_EYEBROW}>Outside the shell</h2>
        <p className="mt-2 max-w-[62ch] text-sm leading-relaxed text-text-muted">
          Full-screen flows with no sidebar or rail by design. Listed because
          most of them were unreachable on a laptop until this branch.
        </p>
        <ul className="mt-4">
          {OUTSIDE_SHELL.map((s) => (
            <ScreenRow key={s.href} screen={s} />
          ))}
        </ul>
      </section>

      <section className="mt-12">
        <h2 className={CARD_EYEBROW}>Art, in isolation</h2>
        <p className="mt-2 max-w-[62ch] text-sm leading-relaxed text-text-muted">
          Drawings that only appear behind the auth gate, rendered on their own so
          they can be compared.
        </p>
        <ul className="mt-4">
          {ART.map((s) => (
            <ScreenRow key={s.href} screen={s} />
          ))}
        </ul>
      </section>

      <section className="mt-12">
        <h2 className={CARD_EYEBROW}>Worth trying to break</h2>
        <ul className="mt-4 flex flex-col">
          {CHECKS.map((c) => (
            <li key={c.label} className="hairline-t py-4">
              <p className="text-[0.9375rem] text-foreground">{c.label}</p>
              <p className="mt-1 max-w-[68ch] text-sm leading-relaxed text-text-muted">
                {c.detail}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
