"use client";

import Image from "next/image";
import Link from "next/link";

import { PRODUCT_NAME } from "@/lib/brand";
import { fit } from "@/lib/onboarding/fit";
import { FLOW_EMPHASIS } from "@/lib/ui-presets";

import { FlowCta, FlowSub, FlowTitle, FOOTER_BOTTOM, ScrollPort } from "../chrome";
import { useFlow } from "../flow-context";

/**
 * THE FIRST SCREEN OF THE FLOW: KYLE SAYS HELLO (Adrian, 2026-09-17).
 *
 * Somebody has just pressed "Start tracking" on the landing page. This screen
 * is the hand-off: a welcome, one line on what happens now, and a button. Then
 * "What's your name?".
 *
 * A first version listed the four stages of the flow and Adrian did not like
 * it ("I want this to be a good way to transition into onboarding ... more of
 * an introduction message than anything else"). He chose this from four
 * directions: Kyle, waving, big and centred, one warm line, one practical line.
 * The waving render is his (`public/onboarding/kyle-wave.png`).
 *
 * ## ⚠️ THE BUTTON IS NOT PINNED TO THE BOTTOM HERE
 *
 * His call: "the button should not be glued to the bottom of the screen in
 * this section". Every other flow screen pins its CTA; this one sits it
 * directly under the text, so the screen reads as one welcome with its answer
 * attached. The group is centred in the port and scrolls on a phone too short
 * for it, which is the flow's rule for anything that cannot fit.
 *
 * Only the fine print is pinned: the 18+ line and the four statutory links,
 * which must stay reachable from the first logged-out screen, the Consumer
 * Health Data Privacy Policy by that exact name.
 *
 * Renders for the `hook` step id (see `lib/onboarding/steps.ts`).
 */

const LEGAL = [
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/medical-disclaimer", label: "Disclaimer" },
  // ⚠️ The full name, verbatim: Washington's MHMDA requires it. Never shorten.
  { href: "/consumer-health-data", label: "Consumer Health Data Privacy Policy" },
];

export function IntroScreen() {
  const { goNext } = useFlow();

  return (
    <div className="relative flex min-h-0 flex-1 flex-col px-5 pt-2">
      <ScrollPort>
        <div className="flex w-full flex-1 flex-col items-center justify-center text-center">
          {/* Kyle arrives, then stays still: the flow's sanctioned loops are
              the two celebration beats, and this is not one of them. */}
          <div
            className="animate-flow-hero relative shrink-0"
            style={{ width: fit(230, 158, 130) }}
          >
            <div
              aria-hidden
              className="pointer-events-none absolute left-1/2 top-1/2 h-[140%] w-[140%] -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                background:
                  "radial-gradient(circle, color-mix(in srgb, var(--accent-amber) 20%, transparent) 0%, transparent 62%)",
              }}
            />
            <Image
              src="/onboarding/kyle-wave.png"
              alt="Kyle, the Trakabl vial, waving hello"
              /* The art's real pixels. Kyle is cropped to one box shared by
                 every pose now, so this matches the other three — see
                 scripts/brand/kyle.mjs. It was 800x730 against the previous
                 render; left stale it reserves the wrong aspect box and the
                 text below jumps as the image loads. */
              width={1018}
              height={900}
              priority
              sizes="230px"
              className="relative h-auto w-full drop-shadow-[0_22px_36px_rgb(0_0_0/0.55)]"
            />
          </div>

          <div className="animate-flow-in shrink-0" style={{ marginTop: fit(28, 16), animationDelay: "160ms" }}>
            <FlowTitle>
              Welcome to <em className={FLOW_EMPHASIS}>{PRODUCT_NAME}</em>.
            </FlowTitle>
            <FlowSub className="mx-auto mt-3 max-w-[18rem]">
              Let&apos;s set it up around what you run. It takes about two minutes.
            </FlowSub>
          </div>

          <div
            className="animate-flow-in w-full max-w-[22rem] shrink-0"
            style={{ marginTop: fit(32, 20), animationDelay: "280ms" }}
          >
            <FlowCta onClick={goNext}>Let&apos;s go</FlowCta>
            <p className="mt-4 text-[0.8rem] leading-relaxed text-text-muted">
              Existing user?{" "}
              <Link
                href="/login"
                className="text-foreground underline-offset-4 transition-colors hover:text-text-muted hover:underline"
              >
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </ScrollPort>

      <footer
        className="flex shrink-0 flex-col items-center"
        style={{ gap: fit(6, 4), paddingTop: fit(12, 6), paddingBottom: FOOTER_BOTTOM }}
      >
        <p className="text-center text-[0.7rem] leading-relaxed text-text-subtle">Paid plan. 18+ only.</p>
        <p className="text-center text-[0.6rem] leading-relaxed text-text-subtle">
          {LEGAL.map((doc, i) => (
            <span key={doc.href}>
              {i > 0 ? " · " : null}
              <Link
                href={doc.href}
                target="_blank"
                rel="noopener noreferrer"
                className="whitespace-nowrap underline underline-offset-2 transition-colors hover:text-text-muted"
              >
                {doc.label}
              </Link>
            </span>
          ))}
        </p>
      </footer>
    </div>
  );
}
