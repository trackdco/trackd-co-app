"use client";

import type { CSSProperties } from "react";
import Link from "next/link";

import { fit } from "@/lib/onboarding/fit";
import { TRIAL_DAYS } from "@/lib/onboarding/pricing";
import { FLOW_EMPHASIS } from "@/lib/ui-presets";

import { FlowCta, FlowSub, FlowTitle, FOOTER_BOTTOM, ScrollPort } from "../chrome";
import { useFlow } from "../flow-context";

/**
 * THE FIRST SCREEN OF THE FLOW: WHAT IS ABOUT TO HAPPEN (Adrian, 2026-09-17).
 *
 * "When you click Start tracking ... it should open up to a page ... an
 * onboarding introduction page that introduces and explains what's about to
 * happen, and then it goes to 'What's your name?'"
 *
 * It replaces the hook ("Take your protocol out of your notes app"), whose job
 * the public landing page at `/` now does: somebody arriving here has already
 * been sold the idea, and what they need is to know what the next two minutes
 * hold. It renders for the `hook` step id, which is kept so links, analytics and
 * the step tests do not move.
 *
 * The four steps are a fair summary of `STEP_ORDER`, in its order: the
 * questions (name to struggle), the demo, the free week (free, account, plans,
 * start), and setting the app up (install, notifications). If the flow changes
 * shape, change this list with it.
 *
 * The sign-in line and the four statutory links came across from the hook
 * unchanged: this is still the first thing a logged-out visitor sees in the
 * flow, and the Consumer Health Data Privacy Policy must be reachable from it
 * by that exact name.
 */

const STEPS = [
  { title: "A few quick questions", line: "Your name, your age and what you run." },
  { title: "See it working", line: "Log a dose in a short demo and watch where it lands." },
  { title: "Your free week", line: `Pick a plan. ${TRIAL_DAYS} days free, $0 today.` },
  { title: "Make it yours", line: "Add it to your home screen and set your reminders." },
];

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
        <div className="flex w-full flex-1 flex-col justify-center" style={{ gap: fit(32, 20) }}>
          <header className="shrink-0 space-y-3 text-center">
            <FlowTitle>
              Here&apos;s what happens <em className={FLOW_EMPHASIS}>next</em>.
            </FlowTitle>
            <FlowSub className="mx-auto max-w-[19rem]">
              About two minutes, and then {TRIAL_DAYS} days of the full app on us.
            </FlowSub>
          </header>

          <ol className="flow-card shrink-0 divide-hairline divide-border-default rounded-2xl bg-bg-surface">
            {STEPS.map((s, i) => (
              <li
                key={s.title}
                className="animate-flow-in flex items-start gap-4 px-5"
                style={
                  {
                    animationDelay: `${120 + i * 90}ms`,
                    paddingBlock: fit(16, 11),
                  } as CSSProperties
                }
              >
                <span className="mt-px flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-bg-input font-mono text-xs tabular-nums text-foreground">
                  {i + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-[0.98rem] text-foreground">{s.title}</span>
                  <span className="mt-0.5 block text-sm leading-snug text-text-muted">{s.line}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </ScrollPort>

      <footer
        className="flex shrink-0 flex-col"
        style={{ gap: fit(12, 6, 4), paddingTop: fit(16, 8), paddingBottom: FOOTER_BOTTOM }}
      >
        <FlowCta onClick={goNext}>Let&apos;s begin</FlowCta>

        <p className="text-center text-[0.8rem] leading-relaxed text-text-muted">
          Existing user?{" "}
          <Link
            href="/login"
            className="text-foreground underline-offset-4 transition-colors hover:text-text-muted hover:underline"
          >
            Sign in
          </Link>
        </p>

        <p className="text-center text-[0.7rem] leading-relaxed text-text-subtle">
          Paid plan. 18+ only.
        </p>

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
