import type { Metadata } from "next";

import { PRODUCT_NAME } from "@/lib/brand";

/**
 * `/` — the public landing page (Spec 3-02).
 *
 * ## This route used to be a redirect, and the redirect is gone
 *
 * It sent every visitor to the onboarding flow, on the reasoning that the flow
 * WAS the landing page. That made the first thing a stranger met a quiz. This
 * page is now the top of the funnel: landing, then "Start tracking", then the
 * quiz at `/start`, then an account, then the paywall.
 *
 * ## ⚠️ THE SITE'S PUBLIC IDENTITY LIVES HERE AGAIN
 *
 * While `/` only redirected, the `openGraph` block sat on the flow's page,
 * because that is where a crawler following trackdco.app actually ended up. It
 * has come back, and `/start` has given it up in the same change, so exactly
 * one route claims to be the site.
 *
 * ## ⚠️ STATIC, AND `force-static` IS A TRIPWIRE RATHER THAN AN OPTIMISATION
 *
 * The spec requires this page to render statically with no client-side data
 * fetching above the fold. Nothing here reads cookies, headers or a search
 * param, so Next would render it statically anyway. Declaring it means the
 * build FAILS if someone later adds a session read or a Supabase call, instead
 * of the page quietly going dynamic and every visitor paying for a render.
 *
 * A signed-in visitor is redirected to `/dashboard` by `proxy.ts` before this
 * page is reached, which is the only way to keep both promises at once: a
 * static front door for a stranger, and the app for somebody who already has
 * an account. See `lib/supabase/middleware.ts`.
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

/**
 * THE SECTION SCAFFOLD (spec §Implementation 3).
 *
 * Eleven sections, in the order the spec fixes and in no other: nav, hero,
 * proof strip, how it works, features, social proof, pricing, FAQ, second CTA,
 * founder note, footer.
 *
 * ## Why the column is a shared class rather than a prop on each section
 *
 * The spec sets the content column at 560px to tablet and 680px on desktop.
 * Written per section that is eleven chances to drift by a pixel, which is
 * precisely how a page stops reading as one piece. `lp-col` carries it once,
 * and a section that needs to bleed past it opts out deliberately.
 *
 * ## Hairlines, not cards
 *
 * Sections are separated by a 0.5px rule and nothing else. `ui-context.md`
 * reserves the surface-and-shadow card treatment for data surfaces inside the
 * app, and a marketing page built out of stacked cards reads as a template.
 */
export default function LandingPage() {
  return (
    <main className="lp min-h-dvh bg-bg-base">
      <nav aria-label="Main" className="lp-col" />
      <section id="hero" aria-labelledby="hero-title" className="lp-col" />
      <section aria-label="Proof" className="lp-col" />
      <section id="how" aria-labelledby="how-title" className="lp-col" />
      <section id="features" aria-labelledby="features-title" className="lp-col" />
      <section id="voices" aria-labelledby="voices-title" className="lp-col" />
      <section id="pricing" aria-labelledby="pricing-title" className="lp-col" />
      <section id="questions" aria-labelledby="questions-title" className="lp-col" />
      <section id="start" aria-labelledby="start-title" className="lp-col" />
      <section id="founders" aria-labelledby="founders-title" className="lp-col" />
      <footer className="lp-col" />
    </main>
  );
}
