import type { Metadata } from "next";
import Link from "next/link";

import { LandingDevice } from "@/components/landing/device";
import { PrimaryCta } from "@/components/landing/cta";
import {
  BellGlyph,
  BodyGlyph,
  SparkGlyph,
  SyringeGlyph,
  VialGlyph,
} from "@/components/landing/glyphs";
import { StickyCta } from "@/components/landing/sticky-cta";
import { TodayPanel } from "@/components/landing/today-panel";
import { UpdatesForm } from "@/components/landing/updates-form";
import {
  ACN,
  CURRENCY,
  LEGAL_ENTITY,
  PLANS,
  PRODUCT_NAME,
  SUPPORT_EMAIL,
  YEARLY_PER_WEEK,
} from "@/lib/brand";
import {
  CARD_EYEBROW,
  DATA_MONO,
  FLOW_EMPHASIS,
  FLOW_SUB,
  FLOW_TITLE,
  LANDING_DISPLAY,
} from "@/lib/ui-presets";
import { cn } from "@/lib/utils";

/**
 * `/` — the public landing page (Spec 3-02).
 *
 * ## This route used to be a redirect, and the redirect is gone
 *
 * It sent every visitor into the onboarding flow, on the reasoning that the
 * flow WAS the landing page. That made the first thing a stranger met a quiz.
 * The funnel is now landing, then "Start tracking", then the quiz at `/start`,
 * then an account, then the paywall.
 *
 * ## ⚠️ THE SITE'S PUBLIC IDENTITY LIVES HERE AGAIN
 *
 * While `/` only redirected, the `openGraph` block sat on the flow's page,
 * because that is where a crawler following trackdco.app actually ended up. It
 * has come back and `/start` gave it up in the same change, so exactly one
 * route claims to be the site.
 *
 * ## ⚠️ STATIC, AND `force-static` IS A TRIPWIRE RATHER THAN AN OPTIMISATION
 *
 * Nothing here reads cookies, headers or a search param, so Next would render
 * it statically anyway. Declaring it means the BUILD fails if someone later
 * adds a session read, instead of the page quietly going dynamic and every
 * visitor paying for a render. A signed-in visitor never arrives: `proxy.ts`
 * sends them to `/dashboard` first.
 *
 * ## The shape, and why it is this shape
 *
 * Adrian rejected a text-heavy first draft (2026-09-16): "more visual than
 * words", "I wouldn't read through the whole thing", "a massive hero section
 * which is visual", and make it look like the app. So the hero is the app —
 * a device carrying the real today's log, with the due dose being logged while
 * you watch — and every section below it is one idea, one visual and a line.
 * The whole page is about 250 words.
 */
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: `${PRODUCT_NAME} · Track the whole protocol`,
  description:
    "Everything you're running, in one place you'll actually open. Built by people who run real protocols.",
  alternates: { canonical: "https://trackdco.app" },
  openGraph: {
    title: `${PRODUCT_NAME} · Track the whole protocol`,
    description: "Everything you're running, in one place you'll actually open.",
    type: "website",
    url: "https://trackdco.app",
    siteName: "Trackd Co",
  },
};

const STEPS = [
  {
    n: "1",
    title: "Add what you run",
    line: "Compounds, doses, the days they fall on, and the vial you are working from.",
  },
  {
    n: "2",
    title: "Log it as you take it",
    line: "One tap. Choose the site and the rotation map updates itself.",
  },
  {
    n: "3",
    title: "See where you stand",
    line: "Stock, history, weight, photos and bloodwork, in one record.",
  },
];

const FEATURES = [
  {
    glyph: <VialGlyph />,
    title: "Stock that counts itself down",
    line: "Every dose you log comes off the vial, down to the day it runs dry.",
  },
  {
    glyph: <BodyGlyph />,
    title: "Injection sites",
    line: "Where each shot went, and which sites have rested.",
  },
  {
    glyph: <SyringeGlyph />,
    title: "Reconstitution calculator",
    line: "Powder and water in. Units on the syringe out.",
  },
  {
    glyph: <SparkGlyph />,
    title: "Progress in context",
    line: "Weight, photos and bloodwork, beside the protocol that made them.",
  },
  {
    glyph: <BellGlyph />,
    title: "Reminders you control",
    line: "Due doses, missed doses, low stock. Each one yours to switch off.",
  },
];

/**
 * TODO(3-02): placeholder quotes. These are NOT real testimonials and must be
 * replaced with attributed quotes from real users before this page is merged.
 * Invented testimonials on a live page are not a rounding error.
 */
const QUOTES = [
  { quote: "It replaced three notes and a spreadsheet.", who: "Beta tester" },
  { quote: "I stopped guessing what I had already taken.", who: "Beta tester" },
  { quote: "Knowing what is left in each vial is the whole thing.", who: "Beta tester" },
];

const FAQS = [
  {
    q: "Is this medical advice?",
    a: `No. ${PRODUCT_NAME} is a tracking tool for adults. It records what you run and shows it back to you. It does not diagnose, prescribe, or replace a doctor.`,
  },
  {
    // TODO(3-02): the privacy answer is a placeholder. Confirm the exact wording
    // against the Privacy Policy before merge.
    q: "Who can see my data?",
    a: "Only you. Your protocol is tied to your account, it is never sold, and you can delete all of it from the app.",
  },
  {
    q: "How does the free trial work?",
    a: "Seven days, with every feature. We remind you on day 5, and your plan starts on day 7 unless you cancel before then.",
  },
  {
    q: "What if I stop paying?",
    a: "Your account goes read only. Every dose, photo and reading stays where it is and nothing is deleted. Start a plan again and you can add to it straight away.",
  },
  {
    q: "Do I need to download an app?",
    a: "No. It runs in your browser, and adds to your home screen so it opens like any other app. It works on a laptop too.",
  },
  {
    q: "Can I delete my account?",
    a: "Yes, from your profile. It cancels any subscription, then removes your account and your uploaded files straight away.",
  },
];

const LEGAL_LINKS = [
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/medical-disclaimer", label: "Medical disclaimer" },
  /**
   * ⚠️ THE FULL NAME, VERBATIM, AND FOUR LINKS RATHER THAN THE SPEC'S THREE.
   *
   * Washington's MHMDA requires this policy to be published under this exact
   * name and reachable without logging in, and `lib/legal/verbatimQuotes.test.ts`
   * pins both the route and the label against the front page for that reason.
   * A tidy-up to "Health data" reads better and fails the statute.
   */
  { href: "/consumer-health-data", label: "Consumer Health Data Privacy Policy" },
];

export default function LandingPage() {
  return (
    <>
      <main className="min-h-dvh bg-bg-base">
        <nav aria-label="Main" className="lp-col flex items-center justify-between py-4">
          <span className="text-[1.05rem] font-medium tracking-[-0.04em] text-foreground">
            {PRODUCT_NAME.toLowerCase()}
          </span>
          <Link
            href="/login"
            className="rounded-md px-2 py-2 text-sm text-foreground transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
          >
            Log in
          </Link>
        </nav>

        {/* THE HERO IS THE PRODUCT. Type, the control, then the device carrying
            the real today's log with the due dose being logged as you watch. */}
        <section
          id="hero"
          aria-labelledby="hero-title"
          className="flow-canvas overflow-x-clip pb-20 pt-6 md:pb-28"
        >
          <div className="lp-col">
            <h1 id="hero-title" className={cn(LANDING_DISPLAY, "text-balance")}>
              Track the whole <em className={FLOW_EMPHASIS}>protocol</em>.
            </h1>
            <p className={cn(FLOW_SUB, "mt-4 max-w-[26rem] text-pretty text-text-secondary")}>
              Every compound, dose and injection site, in one place you&apos;ll actually
              open. Built by people who run real protocols.
            </p>
            <PrimaryCta className="mt-8 max-w-[22rem]" />

            <div className="mt-14 flex justify-center">
              <LandingDevice className="w-[min(88%,20rem)] animate-flow-hero">
                <div className="px-3 pb-5 pt-9">
                  <TodayPanel />
                </div>
              </LandingDevice>
            </div>
          </div>
        </section>

        {/* Proof strip. */}
        <section aria-label="Proof" className="lp-col hairline-t border-border-default py-5">
          {/* TODO(3-02): placeholder proof line. Replace with the claim that is
              true and checkable at launch. */}
          <p className="text-sm text-text-secondary">
            In private beta since June, with the people it was built for.
          </p>
        </section>

        <section id="how" aria-labelledby="how-title" className="lp-col lp-sec hairline-t border-border-default">
          <p className={CARD_EYEBROW}>How it works</p>
          <h2 id="how-title" className={cn(FLOW_TITLE, "mt-3 text-balance")}>
            Set it up once. Log it in seconds.
          </h2>
          <ol className="mt-8 space-y-6">
            {STEPS.map((s) => (
              <li key={s.n} className="grid grid-cols-[1.75rem_1fr] items-baseline gap-x-3">
                {/* One of the page's four amber beats: the step numerals. */}
                <span className={cn(DATA_MONO, "text-accent-amber")}>{s.n}</span>
                <div>
                  <h3 className="text-[1.05rem] font-normal tracking-[-0.01em] text-foreground">
                    {s.title}
                  </h3>
                  <p className="mt-1.5 max-w-[34rem] text-sm leading-relaxed text-text-secondary">
                    {s.line}
                  </p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-10 max-w-[30rem] border-border-default pt-6 text-[1.05rem] font-light leading-relaxed text-foreground hairline-t">
            {PRODUCT_NAME} records what you run and shows it back to you. It never
            recommends a compound, a dose or a change.
          </p>
        </section>

        <section id="features" aria-labelledby="features-title" className="lp-col lp-sec hairline-t border-border-default">
          <p className={CARD_EYEBROW}>What is inside</p>
          <h2 id="features-title" className={cn(FLOW_TITLE, "mt-3 text-balance")}>
            Built around how a protocol actually runs.
          </h2>
          <dl className="mt-6 divide-hairline divide-border-default">
            {FEATURES.map((f) => (
              <div key={f.title} className="grid grid-cols-[3rem_1fr] items-start gap-x-3 py-5">
                {/* One optical height for five drawings of different shapes:
                    the tall ones (vial, body, bell) and the wide ones (syringe,
                    sparkline) were rendering at noticeably different weights. */}
                <span aria-hidden className="flex h-8 items-center justify-center">
                  {f.glyph}
                </span>
                <div>
                  <dt className="text-[1.05rem] tracking-[-0.01em] text-foreground">{f.title}</dt>
                  <dd className="mt-1.5 max-w-[34rem] text-sm leading-relaxed text-text-secondary">
                    {f.line}
                  </dd>
                </div>
              </div>
            ))}
          </dl>
        </section>

        <section id="voices" aria-labelledby="voices-title" className="lp-col lp-sec hairline-t border-border-default">
          <p className={CARD_EYEBROW}>From the beta</p>
          <h2 id="voices-title" className="sr-only">
            What people running it say
          </h2>
          <ul className="mt-4 divide-hairline divide-border-default">
            {QUOTES.map((q) => (
              <li key={q.quote} className="py-5">
                <blockquote className="text-[1.15rem] font-light leading-snug text-foreground">
                  {q.quote}
                </blockquote>
                <p className={cn(DATA_MONO, "mt-2 tracking-[0.08em]")}>{q.who}</p>
              </li>
            ))}
          </ul>
        </section>

        <section id="pricing" aria-labelledby="pricing-title" className="lp-col lp-sec hairline-t border-border-default">
          <p className={CARD_EYEBROW}>Pricing</p>
          <h2 id="pricing-title" className={cn(FLOW_TITLE, "mt-3 text-balance")}>
            Every feature, on every plan.
          </h2>

          {/*
            ⚠️ THE ANCHOR IS SANS, AND IT IS THE ONE FIGURE ON THE PAGE THAT IS.
            Geist Mono gives every glyph the same advance width, which is the
            whole point of it for a column of doses and times. At 3rem it gives
            the DECIMAL POINT a full cell too, and "$1.35" renders with a 15px
            hole in the middle of it. Measured on the desktop render, not
            guessed. `METRIC_VALUE` is the app's own treatment for a big number
            on a card and is Geist Light with `tabular-nums` for exactly this
            reason; this is that treatment scaled up for a display figure. The
            smaller figures below stay mono, where the even spacing reads as
            intended rather than as a gap.
          */}
          <p className="mt-8 flex items-baseline gap-2">
            <span className="text-[3.25rem] font-light leading-none tracking-[-0.03em] tabular-nums text-foreground">
              ${YEARLY_PER_WEEK.toFixed(2)}
            </span>
            <span className="text-sm text-text-secondary">a week</span>
          </p>
          <p className={cn(DATA_MONO, "mt-3 text-foreground")}>
            ${PLANS.yearly.amount.toFixed(2)} billed yearly
          </p>

          <ul className="mt-7 divide-hairline divide-border-default border-border-default hairline-t hairline-b">
            <li className="flex items-baseline justify-between py-3.5">
              <span className="text-sm text-foreground">Monthly</span>
              <span className={cn(DATA_MONO, "text-foreground")}>
                ${PLANS.monthly.amount.toFixed(2)}
              </span>
            </li>
            <li className="flex items-baseline justify-between py-3.5">
              <span className="text-sm text-foreground">Weekly</span>
              <span className={cn(DATA_MONO, "text-foreground")}>
                ${PLANS.weekly.amount.toFixed(2)}
              </span>
            </li>
          </ul>
          <p className="mt-3 text-xs text-text-secondary">Prices in {CURRENCY}.</p>

          <ol className="mt-8 space-y-2.5">
            <li className="grid grid-cols-[4rem_1fr] items-baseline gap-3">
              <span className={cn(DATA_MONO, "tracking-[0.08em] text-foreground")}>TODAY</span>
              <span className="text-sm text-text-secondary">Everything unlocks. Nothing to pay.</span>
            </li>
            <li className="grid grid-cols-[4rem_1fr] items-baseline gap-3">
              <span className={cn(DATA_MONO, "tracking-[0.08em] text-foreground")}>DAY 5</span>
              <span className="text-sm text-text-secondary">We remind you the trial is ending.</span>
            </li>
            <li className="grid grid-cols-[4rem_1fr] items-baseline gap-3">
              <span className={cn(DATA_MONO, "tracking-[0.08em] text-foreground")}>DAY 7</span>
              <span className="text-sm text-text-secondary">Your plan starts and your card is charged.</span>
            </li>
          </ol>
          <p className="mt-5 max-w-[34rem] text-sm leading-relaxed text-text-secondary">
            Cancel before day 7 and you pay nothing. If a plan ends, your account goes
            read only: everything you logged stays visible, you just cannot add to it.
          </p>

          <PrimaryCta className="mt-8 max-w-[22rem]" />
        </section>

        <section id="questions" aria-labelledby="questions-title" className="lp-col lp-sec hairline-t border-border-default">
          <p className={CARD_EYEBROW}>Questions</p>
          <h2 id="questions-title" className={cn(FLOW_TITLE, "mt-3 text-balance")}>
            Before you start.
          </h2>
          <div className="mt-6 divide-hairline divide-border-default border-border-default hairline-b">
            {FAQS.map((f) => (
              <details key={f.q} className="group">
                <summary className="flex cursor-pointer list-none items-baseline justify-between gap-4 py-4 text-[0.95rem] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {f.q}
                  {/* One of the four amber beats: the toggle glyph. */}
                  <span
                    aria-hidden
                    className="shrink-0 font-mono text-base leading-none text-accent-amber"
                  >
                    <span className="group-open:hidden">+</span>
                    <span className="hidden group-open:inline">&minus;</span>
                  </span>
                </summary>
                <p className="max-w-[36rem] pb-4 text-sm leading-relaxed text-text-secondary">
                  {f.a}
                </p>
              </details>
            ))}
          </div>
        </section>

        <section id="start" aria-labelledby="start-title" className="flow-canvas hairline-t border-border-default">
          <div className="lp-col lp-sec">
            <h2 id="start-title" className={cn(FLOW_TITLE, "text-balance")}>
              Get your protocol out of the notes app.
            </h2>
            <PrimaryCta className="mt-8 max-w-[22rem]" />
          </div>
        </section>

        <section id="founders" aria-labelledby="founders-title" className="lp-col lp-sec hairline-t border-border-default">
          <p className={CARD_EYEBROW} id="founders-title">
            A note from the founders
          </p>
          <div className="mt-5 max-w-[32rem] space-y-4 text-[1.05rem] font-light leading-relaxed text-foreground">
            <p>
              Our own protocols lived in a notes app, a spreadsheet and a calculator.
              None of them knew what was left in a vial.
            </p>
            <p>So we built the one we wanted to open every day.</p>
          </div>
          <p className="mt-5 text-sm text-text-secondary">Angus and Adrian, founders</p>
        </section>

        <footer className="lp-col hairline-t border-border-default pb-16 pt-10">
          <div className="max-w-[24rem]">
            <p className={CARD_EYEBROW}>Product updates, now and then</p>
            <div className="mt-3">
              <UpdatesForm />
            </div>
          </div>

          <nav aria-label="Legal" className="mt-10 flex flex-wrap gap-x-5 gap-y-2">
            {LEGAL_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="text-sm text-text-secondary transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
              >
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="mt-8 space-y-1.5">
            <p className="text-xs leading-relaxed text-text-secondary">
              trackdco.app is operated by {LEGAL_ENTITY}, ACN {ACN}.
            </p>
            <p className="text-xs text-text-secondary">
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="text-foreground transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
              >
                {SUPPORT_EMAIL}
              </a>
            </p>
            <p className="text-xs leading-relaxed text-text-secondary">
              For adults 18 and over. {PRODUCT_NAME} is a tracking tool and does not give
              medical advice.
            </p>
          </div>
        </footer>
      </main>

      <StickyCta />
    </>
  );
}
