import type { Metadata } from "next";

import { CompareTable } from "@/components/landing/compare";
import { PrimaryCta, StartButton, TRIAL_LINE } from "@/components/landing/cta";
import { Dock } from "@/components/landing/dock";
import { FaqList, type Faq } from "@/components/landing/faq";
import { FeatureWidget } from "@/components/landing/features/feature-widget";
import { HandUnderline } from "@/components/landing/hand-underline";
import { KyleCloser } from "@/components/landing/kyle-closer";
import { Phone } from "@/components/landing/phone";
import { TodayScreen } from "@/components/landing/screens/today";
import { SiteFooter, type LegalLink } from "@/components/landing/site-footer";
import { SiteHeader } from "@/components/landing/site-header";
import { Testimonials } from "@/components/landing/testimonials";
import { BUSINESS_NAME, PRODUCT_NAME, SUPPORT_EMAIL } from "@/lib/brand";
import type { CompoundCategory } from "@/lib/compound-categories";
import { COMPOUNDS } from "@/lib/compounds-catalogue";
import { showTestimonials } from "@/lib/landing/testimonials";
import {
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
 * ## Adrian's copy pass, 2026-09-18
 *
 * He reviewed every string on the page and rewrote most of them. Three rulings
 * from that pass govern the copy here and are not to be undone quietly:
 *
 * - **Sentence case, and the house style holds** for page copy: no em dashes,
 *   no emoji, no exclamation marks. The four reviews are the one exception,
 *   printed exactly as their authors wrote them, punctuation included.
 * - **"Trackd" is the app, "Trackd Co" is the company.** Prose says
 *   `PRODUCT_NAME`; `BUSINESS_NAME` appears only where the legal entity is
 *   genuinely the subject, which is the footer and the link preview's site name.
 * - **The founders' note became a letter**, so the heading and the menu item
 *   both say letter now.
 *
 * ## ⚠️ TODO(3-03) BEFORE THIS SHIPS
 *
 * - The reviews are gated off production and must stay gated: three are real
 *   people who have not yet approved the words written on their behalf, and the
 *   fourth is invented. See `lib/landing/testimonials.ts`.
 * - The comparison rows are claims about other apps; Adrian confirms each.
 * - Two FAQ answers make claims wider than the ones they replaced (never
 *   selling data, and deleting all of it). Both are marked below.
 */
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: `${PRODUCT_NAME} · Track the whole protocol`,
  description:
    "Every compound, dose and site in one place. Built by people who run real protocols.",
  alternates: { canonical: "https://trackdco.app" },
  openGraph: {
    title: `${PRODUCT_NAME} · Track the whole protocol`,
    description: "Your whole protocol in one place.",
    type: "website",
    url: "https://trackdco.app",
    siteName: BUSINESS_NAME,
  },
};

const FAQS: readonly Faq[] = [
  {
    q: "Will this app tell me what to take?",
    a: [
      `No. ${PRODUCT_NAME} is strictly a tracking tool for people above the age of 18.`,
      "It records what you yourself choose to run and displays your progress back to you. We do not diagnose, prescribe, or replace a doctor.",
    ],
  },
  {
    q: "Who can see my data?",
    a: "Only you can see your data. Everything you log is tied directly to your account. We never sell your data, and you are able to delete all of it from the app if you wish.",
  },
  {
    q: "How does my free trial work?",
    a: "When you sign up for the free trial, you'll receive 7 days of our Pro plan for free. Nothing is charged until day 7, and we remind you before it ends so it never sneaks up on you.",
  },
  {
    q: "What happens if I stop paying?",
    a: [
      "If you choose to cancel your subscription or your payment method fails, your account becomes read only.",
      "Every dose, photo and reading stays where it is and nothing is deleted. Start a plan again and you can get back into it straight away.",
    ],
  },
  {
    // ⚠️ The question asks HOW, so the answer cannot open with "No" any more.
    q: "How do I download the app?",
    a: `${PRODUCT_NAME} is a progressive web app, so you add it from your browser rather than a store. Once you're signed in, tap share, then Add to Home Screen, and it opens like any other app. It works on a laptop too.`,
  },
  {
    q: "Are there any other features (e.g. calorie tracking)?",
    a: `Not yet. ${PRODUCT_NAME} does one job properly rather than five badly. We are always working to make it better for our users though, so if there is something you want to see, email us at ${SUPPORT_EMAIL} (we read every email).`,
  },
  {
    q: "Can I delete my account?",
    a: "Yes, you delete your account from your profile. Your subscription gets cancelled and all of your data is removed right away.",
  },
];

const LEGAL_LINKS: readonly LegalLink[] = [
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy policy" },
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
      <main className="lp-site min-h-dvh overflow-x-clip bg-bg-base">
        {/* ------------------------------------------------ Header and hero */}
        <section id="hero" aria-labelledby="hero-title" className="lp-hero relative">
          <SiteHeader hide={reviews ? [] : ["movement"]} />

          <div className="lp-wide grid items-center gap-y-12 pb-16 pt-6 md:pb-20 md:pt-10 lg:min-h-[calc(100svh-5rem)] lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-x-10 lg:pb-24 lg:pt-4">
            {/* Three lines, not four (Adrian, 2026-09-17: "too much text in the
                hero"): the title, bigger; the notes-app line as the subtitle,
                where the compound line used to be; and the founders' line. */}
            <div className="relative z-10 text-center lg:text-left">
              <h1 id="hero-title" className={cn(LANDING_DISPLAY, "text-balance")}>
                Track the whole <em className={FLOW_EMPHASIS}>protocol</em>.
              </h1>
              <p className="mx-auto mt-5 max-w-[24rem] text-pretty text-[1.08rem] leading-relaxed text-foreground lg:mx-0 lg:mt-7 lg:max-w-[30rem] lg:text-[1.2rem]">
                Take your protocol out of your notes app and into something actually built for it.
              </p>
              <p className="mt-2 text-sm text-text-secondary lg:text-[0.95rem]">
                Built by people who actually run protocols.
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
            <div className="lp-enter lp-col text-center">
              <h2 id="movement-title" className={LANDING_TITLE}>
                Join the <HandUnderline variant="single">movement</HandUnderline>
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
          data-dock-hide
          tabIndex={-1}
          aria-labelledby="features-title"
          className={cn("lp-sec outline-none", !reviews && "pt-16")}
        >
          <div className="lp-enter lp-col text-center">
            <h2 id="features-title" className={cn(LANDING_TITLE, "text-balance")}>
              Seven things your notes app can&apos;t do.
            </h2>
            <p className={cn(LANDING_SUB, "mx-auto mt-5 max-w-[34rem] text-pretty")}>
              Take a look at all the ways {PRODUCT_NAME} is built to make running a protocol
              seamless.
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
          {/* Title, then the line, THEN Kyle, then the button (Adrian,
              2026-09-18). The line used to sit under Kyle, which put two
              paragraphs of reading between him and the thing to press. */}
          <div className="lp-enter lp-col text-center">
            <h2 id="waiting-title" className={cn(LANDING_TITLE, "text-balance")}>
              Don&apos;t take our word for it...
            </h2>
            {/* ⚠️ `{" "}` IS LOAD-BEARING. Written as "{PRODUCT_NAME} today." with
                the sentence wrapping to the next source line, the compiler drops
                the leading space of the text that follows and the page renders
                "Trackdtoday" (Adrian spotted it live, 2026-09-18). */}
            <p className={cn(LANDING_SUB, "mx-auto mt-5 max-w-[30rem] text-pretty")}>
              Experience how easy it is to run your protocol with {PRODUCT_NAME}{" "}
              today. We&apos;ll even give you 7 days free because we know you won&apos;t
              look back.
            </p>
          </div>
          <div className="lp-wide mt-10 md:mt-12">
            <KyleCloser />
          </div>
          <div className="lp-col mt-8 text-center md:mt-10">
            <PrimaryCta label="Let's get started" />
          </div>
        </section>

        {/* ---------------------------------------------------- Compare */}
        {/* Compare, the note and the questions sit closer together than the
            rest (`lp-sec-tight`), with a thin rule between each, and the note
            and the questions share one faint band: Adrian found the moves
            between these three "pretty crap" when each was a panel floating
            in ~220px of black. See `globals.css` -> "Between sections". */}
        <section id="compare" tabIndex={-1} aria-labelledby="compare-title" className="lp-sec lp-sec-tight outline-none">
          <div className="lp-enter lp-col text-center">
            <h2 id="compare-title" className={cn(LANDING_TITLE, "text-balance")}>
              Us vs a notes app
            </h2>
            <p className={cn(LANDING_SUB, "mx-auto mt-5 max-w-[30rem]")}>
              What you get here that a notes app never will.
            </p>
          </div>
          <div className="lp-enter mx-auto mt-10 w-full max-w-[52rem] px-4 md:mt-14 md:px-8">
            <CompareTable />
          </div>
        </section>

        <SectionRule />

        <div className="lp-band">
        {/* ------------------------------------------- Founders' note */}
        <section
          id="founders"
          tabIndex={-1}
          aria-labelledby="founders-title"
          className="lp-sec lp-sec-tight outline-none"
        >
          <div className="lp-col">
            <div className="lp-enter text-center">
              <h2 id="founders-title" className={LANDING_TITLE}>
                A letter from the founders
              </h2>
            </div>
            <div className="lp-enter lp-panel mt-10 rounded-[2rem] px-6 py-9 md:mt-12 md:px-12 md:py-12">
              {/* Adrian's letter, written in the 2026-09-18 copy pass. It replaced
                  the 3-02 one wholesale, so it is a letter now rather than a note:
                  the salutation is its own line and the section heading follows. */}
              <div className="space-y-5 text-[1.08rem] font-light leading-relaxed text-foreground md:text-[1.2rem]">
                <p>To potential {PRODUCT_NAME} customer,</p>
                <p>
                  We want to thank you, first of all, for (hopefully) choosing to use our
                  app. We don&apos;t take that lightly, and we won&apos;t stop until this app
                  is the one every serious person runs their protocol on.
                </p>
                <p>
                  Since we both run compounds, we know what it&apos;s like to use a notes
                  app, or to waste your money on other vibe coded apps that only ever get
                  half of it right. Which is the exact reason we built {PRODUCT_NAME}.
                </p>
                <p>
                  So if you do choose to run your protocol with us, a huge thank you! And
                  get excited, because it&apos;s only going to get better from here...
                </p>
              </div>
              <p className="mt-8 text-sm leading-relaxed text-text-secondary">
                Sincerely,
                <br />
                Angus and Adrian
              </p>
            </div>
          </div>
        </section>

        <SectionRule />

        {/* ---------------------------------------- Still have questions */}
        <section id="questions" tabIndex={-1} aria-labelledby="questions-title" className="lp-sec lp-sec-tight outline-none">
          <div className="lp-col">
            <div className="lp-enter text-center">
              <h2 id="questions-title" className={LANDING_TITLE}>
                Still have questions?
              </h2>
              <p className={cn(LANDING_SUB, "mx-auto mt-5 max-w-[30rem]")}>
                Below are some of our frequently asked questions.
              </p>
            </div>
            <div className="lp-enter mt-10 md:mt-12">
              <FaqList items={FAQS} />
            </div>
          </div>
        </section>
        </div>

        {/* ----------------------------------------- The closing call */}
        <section data-cta aria-labelledby="close-title" className="lp-sec lp-glow">
          <div className="lp-enter lp-col text-center">
            <h2 id="close-title" className={cn(LANDING_TITLE, "mx-auto max-w-[34rem] text-balance")}>
              Get your protocol out of the notes app and into something that{" "}
              <HandUnderline>
                <em className={FLOW_EMPHASIS}>actually works</em>
              </HandUnderline>
              .
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

/** A thin centred rule between two sections: the hero's divider, shorter. */
function SectionRule() {
  return (
    <div aria-hidden className="lp-col">
      <div className="mx-auto h-px w-40 bg-gradient-to-r from-transparent via-border-strong to-transparent md:w-56" />
    </div>
  );
}

/**
 * The hero phone: the app's dashboard, drawn (Adrian preferred this to his own
 * recording, which moved to the onboarding flow on 2026-09-17), with the rings
 * he drew behind it and a pool of light.
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
      <Phone
        hero
        tab="dashboard"
        label="The Trackd dashboard: today's log with four compounds, the due one being ticked off, and weight and next-dose cards below."
        className="lp-rise"
      >
        <TodayScreen />
      </Phone>
    </div>
  );
}
