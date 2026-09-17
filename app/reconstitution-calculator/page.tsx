import type { Metadata } from "next";

import { StartButton, TRIAL_LINE } from "@/components/landing/cta";
import { PublicCalculator } from "@/components/landing/public-calculator";
import { SiteFooter, type LegalLink } from "@/components/landing/site-footer";
import { SiteHeader } from "@/components/landing/site-header";
import { BUSINESS_NAME, PRODUCT_NAME } from "@/lib/brand";
import { showTestimonials } from "@/lib/landing/testimonials";
import { CARD_EYEBROW, LANDING_DISPLAY, LANDING_SUB, LANDING_TITLE } from "@/lib/ui-presets";
import { cn } from "@/lib/utils";

/**
 * `/reconstitution-calculator`, THE FREE PUBLIC CALCULATOR (Adrian,
 * 2026-09-17; added to spec 3-03 as §3.12).
 *
 * A page he can link from Reddit when someone is stuck on reconstitution
 * maths: the calculator and nothing else from the app, with no account and no
 * trip into the app. The tool itself is `PublicCalculator`, which shares every
 * figure-producing part with the in-app calculator.
 *
 * Outside `app/(app)`, so the auth guard never sees it, and the proxy only
 * refreshes a session here; it redirects nothing but `/`.
 *
 * Static for the same reason `/` is, and `force-static` is the same tripwire.
 * The explainer below is real content rather than filler: it is what a search
 * engine reads, and it says only what the arithmetic does. No dose, no
 * compound, no advice.
 */
export const dynamic = "force-static";

const TITLE = "Reconstitution calculator";

export const metadata: Metadata = {
  title: `${TITLE} · ${PRODUCT_NAME}`,
  description:
    "A free reconstitution calculator. Enter the powder, the bacteriostatic water and your dose, and see the units to draw on a U-100 insulin syringe. No account needed.",
  alternates: { canonical: "https://trackdco.app/reconstitution-calculator" },
  openGraph: {
    title: `Free ${TITLE.toLowerCase()} · ${PRODUCT_NAME}`,
    description: "Powder, water and dose in. Units on the syringe out. No account needed.",
    type: "website",
    url: "https://trackdco.app/reconstitution-calculator",
    siteName: BUSINESS_NAME,
  },
};

const LEGAL_LINKS: readonly LegalLink[] = [
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/medical-disclaimer", label: "Medical disclaimer" },
  { href: "/consumer-health-data", label: "Consumer Health Data Privacy Policy" },
];

const STEPS = [
  {
    n: "1",
    title: "Concentration",
    body: "The powder in the vial divided by the water you add. 10 mg in 2 mL is 5 mg in every millilitre.",
  },
  {
    n: "2",
    title: "Volume",
    body: "Your dose divided by that concentration. 1 mg at 5 mg/mL is 0.2 mL.",
  },
  {
    n: "3",
    title: "Units",
    body: "An insulin syringe is marked in units, and on a U-100 syringe 1 mL is 100 units. 0.2 mL is 20 units.",
  },
];

export default function ReconstitutionCalculatorPage() {
  return (
    <>
      <main className="lp-site min-h-dvh overflow-x-clip bg-bg-base">
        <section id="hero" aria-labelledby="calc-title" className="lp-hero">
          {/* The menu's "Reviews" jumps to `/#movement`, which is not on the
              home page while the reviews are hidden, so it goes too. Decided
              here, on the server: `VERCEL_ENV` never reaches the browser. */}
          <SiteHeader onHome={false} hide={showTestimonials() ? [] : ["movement"]} />
          <div className="lp-col pb-10 pt-8 text-center md:pb-14 md:pt-12">
            <p className={CARD_EYEBROW}>Free tool · No account needed</p>
            <h1 id="calc-title" className={cn(LANDING_DISPLAY, "mt-4 text-balance")}>
              {TITLE}
            </h1>
            <p className={cn(LANDING_SUB, "mx-auto mt-5 max-w-[28rem] text-pretty")}>
              Powder, water and dose in. Units on the syringe out, drawn to scale on the
              syringe you use.
            </p>
          </div>
        </section>

        <section aria-label="Calculator" className="lp-wide max-w-[64rem] pb-16 md:pb-24">
          <PublicCalculator />
        </section>

        <section aria-labelledby="how-title" className="lp-sec lp-lift">
          <div className="lp-col">
            <h2 id="how-title" className={cn(LANDING_TITLE, "text-center")}>
              How the maths works
            </h2>
            <p className={cn(LANDING_SUB, "mx-auto mt-5 max-w-[30rem] text-center text-pretty")}>
              Three steps of arithmetic, the same three the calculator shows you. It
              works on the numbers you give it and nothing else.
            </p>
            <ol className="mt-10 space-y-3">
              {STEPS.map((s) => (
                <li key={s.n} className="lp-panel flex gap-4 rounded-3xl p-5 md:p-6">
                  <span className="font-mono text-sm tabular-nums text-text-secondary">{s.n}</span>
                  <span>
                    <span className="block text-[1.02rem] text-foreground">{s.title}</span>
                    <span className="mt-1 block text-sm leading-relaxed text-text-secondary">{s.body}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section data-cta aria-labelledby="calc-cta-title" className="lp-sec lp-glow">
          <div className="lp-col text-center">
            <h2 id="calc-cta-title" className={cn(LANDING_TITLE, "mx-auto max-w-[32rem] text-balance")}>
              Track the whole protocol, not just the maths.
            </h2>
            <p className={cn(LANDING_SUB, "mx-auto mt-5 max-w-[28rem] text-pretty")}>
              {PRODUCT_NAME} keeps every compound, dose and injection site in one place,
              and counts your stock down as you go.
            </p>
            <div className="mt-10 flex flex-col items-center gap-4">
              <StartButton className="w-full max-w-[20rem]" />
              <p className="text-xs text-text-secondary">{TRIAL_LINE}</p>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter legal={LEGAL_LINKS} />
    </>
  );
}
