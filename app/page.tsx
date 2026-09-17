import type { Metadata } from "next";

import { CompareTable } from "@/components/landing/compare";
import { PrimaryCta, StartButton, TRIAL_LINE } from "@/components/landing/cta";
import { Dock } from "@/components/landing/dock";
import { FaqList, type Faq } from "@/components/landing/faq";
import { FeatureWidget } from "@/components/landing/features/feature-widget";
import { HandUnderline } from "@/components/landing/hand-underline";
import { KyleCloser } from "@/components/landing/kyle-closer";
import { HeroVideo } from "@/components/landing/hero-video";
import { SiteFooter, type LegalLink } from "@/components/landing/site-footer";
import { SiteHeader } from "@/components/landing/site-header";
import { Testimonials } from "@/components/landing/testimonials";
import { BUSINESS_NAME, PRODUCT_NAME } from "@/lib/brand";
import type { CompoundCategory } from "@/lib/compound-categories";
import { COMPOUNDS } from "@/lib/compounds-catalogue";
import { showTestimonials } from "@/lib/landing/testimonials";
import {
  CARD_EYEBROW,
  FLOW_EMPHASIS,
  LANDING_DISPLAY,
  LANDING_SUB,
  LANDING_TITLE,
} from "@/lib/ui-presets";
import { cn } from "@/lib/utils";

/**
 * `/`, THE PUBLIC LANDING PAGE (spec 3-03, a rebuild of 3-02).
 *
 * Adrian's verdict on the 3-02 page was "you can just tell that this is
 * AI-generated". He drew the page he wanted on paper and dictated it; spec
 * 3-03 transcribes that sketch and this file follows it top to bottom:
 *
 *   header inside the hero · hero · join the movement · features ·
 *   what are you waiting for · compare · founders' note · questions ·
 *   the closing call to action · footer · the docked widget
 *
 * The site does NOT have to look like the app (his words). The palette and the
 * type still come from `ui-context.md`; the layout vocabulary is its own, and
 * lives in `globals.css` under the `lp-` prefix. The laptop layouts are
 * designed, not the phone column stretched.
 *
 * ## Kept from 3-02, on purpose
 *
 * `lib/brand.ts` for every visible name, `--text-secondary` for AA prose,
 * `--bg-base` ink on amber, the proxy redirect for a signed-in visitor, and
 * the static rendering below.
 *
 * ## ⚠️ STATIC, AND `force-static` IS A TRIPWIRE RATHER THAN AN OPTIMISATION
 *
 * Nothing here reads cookies, headers or a search param. Declaring it means the
 * BUILD fails if someone later adds a session read, instead of the page quietly
 * going dynamic and every visitor paying for a render. A signed-in visitor
 * never arrives: `proxy.ts` sends them to `/dashboard` first.
 *
 * ## ⚠️ TODO(3-03) BEFORE THIS SHIPS
 *
 * - The testimonials are invented (`lib/landing/testimonials.ts`). They are
 *   switched off on the production deployment by `showTestimonials`, so the
 *   worst case is a missing section, never a fake review.
 * - The comparison rows are claims about other apps; Adrian confirms each.
 * - The privacy answer below is a placeholder.
 * - Adrian is doing a copy pass over the whole page, and rewriting the
 *   founders' note.
 */
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: `${PRODUCT_NAME} · Track the whole protocol`,
  description:
    "Every compound, dose and injection site in one place. Built by people who run real protocols.",
  alternates: { canonical: "https://trackdco.app" },
  openGraph: {
    title: `${PRODUCT_NAME} · Track the whole protocol`,
    description: "Every compound, dose and injection site in one place.",
    type: "website",
    url: "https://trackdco.app",
    siteName: BUSINESS_NAME,
  },
};

const FAQS: readonly Faq[] = [
  {
    q: "Is this medical advice?",
    a: `No. ${PRODUCT_NAME} is a tracking tool for adults. It records what you run and shows it back to you. It does not diagnose, prescribe, or replace a doctor.`,
  },
  {
    // TODO(3-03): the privacy answer is a placeholder. Confirm the exact wording
    // against the Privacy Policy before this ships.
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
    q: "Is the reconstitution calculator really free?",
    a: "Yes. It is on this site, it needs no account, and it does the same arithmetic as the one inside the app.",
  },
  {
    q: "Can I delete my account?",
    a: "Yes, from your profile. It cancels any subscription, then removes your account and your uploaded files straight away.",
  },
];

const LEGAL_LINKS: readonly LegalLink[] = [
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/medical-disclaimer", label: "Medical disclaimer" },
  // ⚠️ The full name, verbatim. See `SiteFooter` and
  // `lib/legal/verbatimQuotes.test.ts`: the statute requires this label.
  { href: "/consumer-health-data", label: "Consumer Health Data Privacy Policy" },
];

/** Compounds per category, for the library screen. Counted here, on the
 *  server, so the 200-entry catalogue never reaches the browser. */
function libraryCounts() {
  const counts: Partial<Record<CompoundCategory, number>> = {};
  for (const c of COMPOUNDS) {
    const k = c.category as CompoundCategory;
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return { counts, total: COMPOUNDS.length };
}

export default function LandingPage() {
  const reviews = showTestimonials();
  const library = libraryCounts();

  return (
    <>
      <main className="min-h-dvh overflow-x-clip bg-bg-base">
        {/* ------------------------------------------------ Header and hero */}
        <section id="hero" aria-labelledby="hero-title" className="lp-hero relative">
          <SiteHeader hide={reviews ? [] : ["movement"]} />

          <div className="lp-wide grid items-center gap-y-12 pb-16 pt-8 md:pb-20 md:pt-12 lg:min-h-[calc(100svh-5rem)] lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-x-12 lg:pb-24 lg:pt-4">
            {/* `relative z-10`: on a laptop the video's opening zoom swings
                wider than its column for under a second, and it passes BEHIND
                the headline rather than over it. */}
            <div className="relative z-10 text-center lg:text-left">
              {/* ⚠️ Four lines of copy, laid out as Adrian dictated them: the
                  first reads as a line ABOVE the title. He is settling the
                  order himself in his copy pass. */}
              <p className="mx-auto max-w-[24rem] text-[0.92rem] leading-snug text-text-secondary lg:mx-0 lg:max-w-[26rem] lg:text-base">
                Take your protocol out of your notes app and into something actually built for it.
              </p>
              <h1 id="hero-title" className={cn(LANDING_DISPLAY, "mt-5 text-balance lg:mt-6")}>
                Track the whole <em className={FLOW_EMPHASIS}>protocol</em>.
              </h1>
              <p className="mx-auto mt-5 max-w-[26rem] text-pretty text-[1.08rem] leading-relaxed text-foreground lg:mx-0 lg:mt-6 lg:max-w-[30rem] lg:text-[1.2rem]">
                Every compound, dose, and injection site in one place.
              </p>
              <p className="mt-2 text-sm text-text-secondary lg:text-[0.95rem]">
                Built by people who run real protocols.
              </p>
              <PrimaryCta withLogin align="start" className="mt-10 hidden lg:flex" />
            </div>

            <HeroDevice />

            <PrimaryCta withLogin className="lg:hidden" />
          </div>

          {/* The divider Adrian drew after the button. */}
          <div className="lp-wide">
            <div className="h-px bg-gradient-to-r from-transparent via-border-strong to-transparent" />
          </div>
        </section>

        {/* ------------------------------------------ Join the movement */}
        {reviews ? (
          <section id="movement" tabIndex={-1} aria-labelledby="movement-title" className="lp-sec outline-none">
            <div className="lp-col text-center">
              <h2 id="movement-title" className={LANDING_TITLE}>
                Join the <HandUnderline>movement</HandUnderline>
              </h2>
              <p className={cn(LANDING_SUB, "mx-auto mt-5 max-w-[30rem] text-pretty")}>
                Become one of the many people who use {PRODUCT_NAME} to stay on top of their protocol.
              </p>
            </div>
            <div className="mt-10 md:mt-14">
              <Testimonials />
            </div>
          </section>
        ) : null}

        {/* ---------------------------------------------------- Features */}
        <section
          id="features"
          tabIndex={-1}
          aria-labelledby="features-title"
          className={cn("lp-sec outline-none", !reviews && "pt-16")}
        >
          <div className="lp-col text-center">
            <p className={CARD_EYEBROW}>Features</p>
            <h2 id="features-title" className={cn(LANDING_TITLE, "mt-4 text-balance")}>
              Seven things your notes app can&apos;t do.
            </h2>
            <p className={cn(LANDING_SUB, "mx-auto mt-5 max-w-[30rem]")}>
              Open one to see it in the app.
            </p>
          </div>
          <div className="lp-wide mt-10 md:mt-14">
            <FeatureWidget counts={library.counts} total={library.total} />
          </div>
        </section>

        {/* ---------------------------------- What are you waiting for? */}
        {/* `data-cta` on the whole section: the dock steps aside while any of
            it is on screen, rather than parking over Kyle before his own
            button has arrived. */}
        <section data-cta aria-labelledby="waiting-title" className="lp-sec overflow-x-clip">
          <div className="lp-col text-center">
            <h2 id="waiting-title" className={cn(LANDING_TITLE, "text-balance")}>
              What are you waiting for?
            </h2>
          </div>
          <div className="lp-wide mt-6 md:mt-8">
            <KyleCloser />
          </div>
          <div className="lp-col mt-6 text-center md:mt-8">
            <p className={cn(LANDING_SUB, "mx-auto max-w-[28rem] text-pretty")}>
              Seven days free, with everything in. Set it up once, and it takes
              seconds a day after that.
            </p>
            <PrimaryCta label="Let's get started" className="mt-8" />
          </div>
        </section>

        {/* ---------------------------------------------------- Compare */}
        <section id="compare" tabIndex={-1} aria-labelledby="compare-title" className="lp-sec outline-none">
          <div className="lp-col text-center">
            <h2 id="compare-title" className={LANDING_TITLE}>
              Compare us
            </h2>
            <p className={cn(LANDING_SUB, "mx-auto mt-5 max-w-[30rem]")}>
              What you get here that you will not get elsewhere.
            </p>
          </div>
          <div className="mx-auto mt-10 w-full max-w-[52rem] px-5 md:mt-14 md:px-8">
            <CompareTable />
          </div>
        </section>

        {/* ------------------------------------------- Founders' note */}
        <section
          id="founders"
          tabIndex={-1}
          aria-labelledby="founders-title"
          className="lp-sec lp-lift outline-none"
        >
          <div className="lp-col">
            <div className="lp-panel rounded-[2rem] px-6 py-10 md:px-12 md:py-14">
              {/* TODO(3-03): Adrian is writing a better letter. This is the
                  3-02 one, kept until his lands. */}
              <p id="founders-title" className={CARD_EYEBROW}>
                A note from the founders
              </p>
              <div className="mt-6 space-y-5 text-[1.08rem] font-light leading-relaxed text-foreground md:text-[1.2rem]">
                <p>
                  We are two people who run protocols, and for years we ran them badly: a
                  note on one phone, a spreadsheet neither of us opened, and a calculator
                  app we used at the kitchen bench on a Sunday.
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
              <p className="mt-8 text-sm text-text-secondary">Angus and Adrian, founders</p>
            </div>
          </div>
        </section>

        {/* ---------------------------------------- Still have questions */}
        <section id="questions" tabIndex={-1} aria-labelledby="questions-title" className="lp-sec outline-none">
          <div className="lp-col">
            <h2 id="questions-title" className={cn(LANDING_TITLE, "text-center")}>
              Still have questions?
            </h2>
            <div className="mt-10 md:mt-12">
              <FaqList items={FAQS} />
            </div>
          </div>
        </section>

        {/* ----------------------------------------- The closing call */}
        <section data-cta aria-labelledby="close-title" className="lp-sec lp-glow">
          <div className="lp-col text-center">
            <h2 id="close-title" className={cn(LANDING_TITLE, "mx-auto max-w-[34rem] text-balance")}>
              Get your protocol out of the notes app and into something that works.
            </h2>
            <div className="mt-10 flex flex-col items-center gap-4">
              <StartButton className="w-full max-w-[20rem]" />
              <p className="text-xs text-text-secondary">{TRIAL_LINE}</p>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter legal={LEGAL_LINKS} />
      <Dock />
    </>
  );
}

/**
 * The hero phone: Adrian's recording (`HeroVideo`), with the rings he drew
 * behind it and a pool of light. The rings are centred on the phone, which the
 * video's crop keeps in the middle of its box.
 */
function HeroDevice() {
  return (
    <div className="relative flex justify-center py-4 lg:py-0">
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-0 w-0">
        <span className="lp-ring h-[26rem] w-[26rem] md:h-[32rem] md:w-[32rem]" style={{ animationDelay: "100ms" }} />
        <span className="lp-ring h-[36rem] w-[36rem] opacity-70 md:h-[44rem] md:w-[44rem]" style={{ animationDelay: "250ms" }} />
        <span className="lp-ring h-[47rem] w-[47rem] opacity-40 md:h-[57rem] md:w-[57rem]" style={{ animationDelay: "400ms" }} />
        <span
          className="absolute left-1/2 top-1/2 h-[24rem] w-[24rem] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            background:
              "radial-gradient(circle, color-mix(in srgb, var(--accent-amber) 22%, transparent) 0%, transparent 66%)",
          }}
        />
      </div>
      <HeroVideo label="A recording of the Trackd app on an iPhone: a dose being tracked, the dashboard, the injection site map and a new stack being built." />
    </div>
  );
}
