import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { PrimaryCta } from "@/components/landing/cta";
import { LandingDevice } from "@/components/landing/device";
import {
  BellGlyph,
  BodyGlyph,
  SparkGlyph,
  SyringeGlyph,
  VialGlyph,
} from "@/components/landing/glyphs";
import { LandingLaptop } from "@/components/landing/laptop";
import { StickyCta } from "@/components/landing/sticky-cta";
import { TodayPanel } from "@/components/landing/today-panel";
import { UpdatesForm } from "@/components/landing/updates-form";
import {
  ACN,
  BUSINESS_NAME,
  LEGAL_ENTITY,
  PRODUCT_NAME,
  SUPPORT_EMAIL,
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
 * `/` — the public landing page (Spec 3-02, revised by Adrian 2026-09-16).
 *
 * ## ⚠️ THREE OF THE SPEC'S ELEVEN SECTIONS ARE GONE, BY HIS INSTRUCTION
 *
 * The spec fixes eleven sections in order. It now carries eight, and each
 * removal is his call rather than a shortcut:
 *
 *   - **The proof strip** ("in private beta since June") and **social proof**.
 *     "Remove all that stuff that says from the beta." Both were placeholders,
 *     and the quotes were invented ones a review had already flagged as unable
 *     to reach production. Deleting them settles that finding outright.
 *   - **Pricing.** "They don't have pricing, so I don't want us to have
 *     pricing", after looking at a competitor he rates. ⚠️ THE COST, NAMED:
 *     the charge timing, the cancellation terms and the read-only-on-lapse
 *     line went with it, and those were partly there for Apple's review of the
 *     domain. What survives is the trial promise under every button, and the
 *     FAQ's answers on the trial and on lapsing.
 *
 * `lib/brand.ts` keeps the amounts and the live guard still runs against
 * Stripe, so pricing can come back without re-deriving anything.
 *
 * ## The shape, and why it is this shape
 *
 * He rejected the first draft as text-heavy and the second as "made for phone
 * but on a laptop": "a massive hero section which is visual", "more visual
 * than words". So the hero is centred, in the order he asked for — name, then
 * the claim, then the device, then the sentence, then the button — and there
 * are now two devices, because Trackd runs on a laptop too.
 *
 * ⚠️ BOTH DEVICES ARE PLACEHOLDERS. He is replacing them tomorrow. Do not
 * spend time on them.
 *
 * ## ⚠️ STATIC, AND `force-static` IS A TRIPWIRE RATHER THAN AN OPTIMISATION
 *
 * Nothing here reads cookies, headers or a search param, so Next would render
 * it statically anyway. Declaring it means the BUILD fails if someone later
 * adds a session read, instead of the page quietly going dynamic and every
 * visitor paying for a render. A signed-in visitor never arrives: `proxy.ts`
 * sends them to `/dashboard` first.
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
    siteName: BUSINESS_NAME,
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
   * Washington's MHMDA requires this policy published under this exact name and
   * reachable without logging in, and `lib/legal/verbatimQuotes.test.ts` pins
   * both the route and the label against the front page for that reason. A
   * tidy-up to "Health data" reads better and fails the statute.
   */
  { href: "/consumer-health-data", label: "Consumer Health Data Privacy Policy" },
];

export default function LandingPage() {
  return (
    <>
      <main className="min-h-dvh bg-bg-base">
        {/* The name centred, sign-in hard right (Adrian, 2026-09-16). A
            three-column grid rather than flex, so the wordmark is centred on
            the PAGE and not on whatever is left over beside the link. */}
        <nav
          aria-label="Main"
          className="lp-col grid grid-cols-[1fr_auto_1fr] items-center py-5"
        >
          <span aria-hidden />
          <Link href="/" aria-label={`${BUSINESS_NAME} home`} className="justify-self-center">
            <Image
              src="/trackd-wordmark.png"
              alt={BUSINESS_NAME}
              width={1049}
              height={200}
              priority
              className="h-4 w-auto"
            />
          </Link>
          <Link
            href="/login"
            className="justify-self-end rounded-md px-2 py-2 text-sm text-foreground transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
          >
            Log in
          </Link>
        </nav>

        {/* THE HERO, in his order: the claim, the devices, the sentence, the
            button. Centred throughout. */}
        <section
          id="hero"
          aria-labelledby="hero-title"
          className="flow-canvas overflow-x-clip pb-20 pt-8 text-center md:pb-28 md:pt-12"
        >
          <div className="lp-col">
            <h1 id="hero-title" className={cn(LANDING_DISPLAY, "text-balance")}>
              Track the whole <em className={FLOW_EMPHASIS}>protocol</em>.
            </h1>
          </div>

          {/* The devices get their own column, wider than the reading measure:
              a laptop cropped to a reading width is just a bright rectangle.

              ⚠️ SIDE BY SIDE, NEVER OVERLAPPING, AND NEVER BELOW ~20rem WIDE.
              Both rules were learned from the render rather than reasoned out.
              The phone was absolutely positioned over the laptop's corner, and
              on a 1280 desktop it rode up over the headline: "Track the whole
              proto" was clipped and the Log in link was underneath it. And at
              15rem the panel inside had about 200px of content width, so every
              dose row wrapped: "In...", "Pe...", "Sup...", with "250 mg · 8:10
              am" broken across two lines. The panel is built at the app's real
              proportions, so the device has to be wide enough to hold it. */}
          <div className="mx-auto mt-12 w-full max-w-[58rem] px-5">
            <div className="mx-auto flex items-end justify-center gap-8">
              <LandingLaptop className="hidden w-[34rem] shrink-0 md:block">
                <div className="aspect-[16/10] bg-bg-base px-6 py-5">
                  <div className="mx-auto h-full max-w-[19rem] overflow-hidden">
                    <TodayPanel />
                  </div>
                </div>
              </LandingLaptop>

              <LandingDevice className="w-[min(84vw,20rem)] shrink-0 animate-flow-hero md:w-[20rem]">
                <div className="px-3 pb-5 pt-9">
                  <TodayPanel />
                </div>
              </LandingDevice>
            </div>
          </div>

          <div className="lp-col mt-14 md:mt-20">
            <p className={cn(FLOW_SUB, "mx-auto max-w-[30rem] text-pretty text-text-secondary")}>
              Every compound, dose and injection site, in one place you&apos;ll actually
              open. Built by people who run real protocols.
            </p>
            <PrimaryCta className="mx-auto mt-8 max-w-[22rem]" />
          </div>
        </section>

        <section
          id="how"
          aria-labelledby="how-title"
          className="lp-col lp-sec hairline-t border-border-default"
        >
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

        <section
          id="features"
          aria-labelledby="features-title"
          className="lp-col lp-sec hairline-t border-border-default"
        >
          <p className={CARD_EYEBROW}>What is inside</p>
          <h2 id="features-title" className={cn(FLOW_TITLE, "mt-3 text-balance")}>
            Built around how a protocol actually runs.
          </h2>
          <dl className="mt-6 divide-hairline divide-border-default">
            {FEATURES.map((f) => (
              <div key={f.title} className="grid grid-cols-[3rem_1fr] items-start gap-x-3 py-5">
                {/* One optical height for five drawings of different shapes. */}
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

        <section
          id="questions"
          aria-labelledby="questions-title"
          className="lp-col lp-sec hairline-t border-border-default"
        >
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

        <section
          id="start"
          aria-labelledby="start-title"
          className="flow-canvas hairline-t border-border-default"
        >
          <div className="lp-col lp-sec text-center">
            <h2 id="start-title" className={cn(FLOW_TITLE, "text-balance")}>
              Get your protocol out of the notes app.
            </h2>
            <PrimaryCta className="mx-auto mt-8 max-w-[22rem]" />
          </div>
        </section>

        <section
          id="founders"
          aria-labelledby="founders-title"
          className="lp-col lp-sec hairline-t border-border-default"
        >
          <p className={CARD_EYEBROW} id="founders-title">
            A note from the founders
          </p>
          <div className="mt-5 max-w-[32rem] space-y-4 text-[1.05rem] font-light leading-relaxed text-foreground">
            <p>
              We are two people who run protocols, and for years we ran them badly:
              a note on one phone, a spreadsheet neither of us opened, and a
              calculator app we used at the kitchen bench on a Sunday.
            </p>
            <p>
              The thing that finally got us was smaller than you would think. Neither
              of us could answer, without counting backwards through a notes app, how
              much was left in the vial in front of us.
            </p>
            <p>
              So we built this, we use it every day, and we would rather hear that it
              is wrong than never hear from you.
            </p>
          </div>
          <p className="mt-5 text-sm text-text-secondary">Angus and Adrian, founders</p>
        </section>

        {/*
          ⚠️ THE BOTTOM PADDING CLEARS THE FIXED CTA BAR, AND THE NUMBER IS MEASURED.
          `StickyCta` is `position: fixed` and is SHOWN by the time anyone reaches
          the footer, because it appears once the hero leaves. Measured at 103px
          tall, against `pb-16`'s 64px: the last line of the footer sat 39px
          UNDER the bar at both 402x700 and 375x548. That last line is the 18+
          and not-medical-advice disclaimer, which is the one line on the page
          that has to stay readable.
        */}
        <footer className="lp-col hairline-t border-border-default pb-[calc(7rem+env(safe-area-inset-bottom))] pt-10">
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
