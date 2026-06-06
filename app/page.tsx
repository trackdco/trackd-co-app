import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Trackd Co — Track the whole protocol",
  description:
    "Log your whole stack in one place: anabolics, peptides, supplements and ancillaries. A private, founder-led app built by people who run real protocols.",
  openGraph: {
    title: "Trackd Co — Track the whole protocol",
    description:
      "Log your whole stack in one place: anabolics, peptides, supplements and ancillaries.",
    type: "website",
    url: "https://trackdco.app",
    siteName: "Trackd Co",
  },
};

/**
 * Public landing / home page — served at the root (trackdco.app), the bio-link
 * first impression.
 *
 * NOTE (auth unit, later): once auth + dashboard exist, this root should check
 * the session server-side and redirect a logged-in user straight to /dashboard,
 * so returning / installed-PWA users land on the app, not this marketing page.
 *
 * Health-data framing stays categorical (below/within/above), never evaluative.
 */
export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-foreground focus:px-4 focus:py-2 focus:text-background"
      >
        Skip to content
      </a>

      {/* Header */}
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6">
        <span className="font-display text-3xl tracking-tight text-foreground">trackd co</span>
        <Link
          href="/login"
          className="text-sm text-text-muted transition-colors hover:text-foreground"
        >
          Log in
        </Link>
      </header>

      {/* Hero */}
      <main
        id="main"
        className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center px-6 pt-14 pb-24 text-center sm:pt-24"
      >
        <p className="mb-5 text-xs font-medium uppercase tracking-[0.2em] text-accent-amber">
          Now in private beta
        </p>
        <h1 className="font-display text-4xl leading-[1.1] text-foreground sm:text-6xl">
          Track the whole protocol
        </h1>
        <p className="mt-6 max-w-xl text-base leading-relaxed text-text-muted sm:text-lg">
          Log your whole stack in one place: anabolics, peptides, supplements and ancillaries.
        </p>

        <div className="mt-9 flex flex-col items-center gap-3">
          <Button asChild size="lg" className="px-8">
            <Link href="/login">Get started</Link>
          </Button>
          <span className="text-xs text-text-subtle">Free during the beta · 18+ only</span>
        </div>

        {/* Features */}
        <section className="mt-20 w-full space-y-4 text-left sm:mt-28">
          {/* Signature feature — given prominence with the amber accent */}
          <div className="rounded-2xl border border-accent-amber/40 bg-card p-6">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-accent-amber">
              Signature feature
            </p>
            <h2 className="mt-2 font-display text-xl text-foreground">
              Injection-site rotation tracker
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-text-muted">
              See where your last shots went and which sites are due, so you rotate properly and give
              each one time to recover.
            </p>
          </div>

          {/* Supporting features */}
          <div className="grid gap-4 sm:grid-cols-3">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="rounded-2xl border border-border bg-card p-6">
                <h2 className="text-sm font-semibold text-foreground">{feature.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-text-muted">{feature.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Beta line */}
        <p className="mt-16 max-w-lg text-sm leading-relaxed text-text-muted">
          A private, founder-led app, built by people who run real protocols.
        </p>

        <div className="mt-8">
          <Button asChild size="lg" variant="outline" className="px-8">
            <Link href="/login">Get started</Link>
          </Button>
        </div>
      </main>

      {/* Footer */}
      <footer className="mx-auto w-full max-w-3xl border-t border-border px-6 py-10 text-center">
        <p className="text-xs leading-relaxed text-text-subtle">
          18+ only. Trackd is a tracking and information tool for informed adults. It does not
          prescribe, recommend, supply or endorse any compound, dose or protocol, and is not a
          medical device, telehealth provider or pharmacy. Nothing here is medical advice. Health
          data is shown categorically (below, within or above a range), never as good or bad. Know
          your local laws and work with a qualified medical professional.
        </p>
        <p className="mt-6 text-xs text-text-subtle">
          <Link href="/terms" className="transition-colors hover:text-text-muted">
            Terms
          </Link>
          {" · "}
          <Link href="/privacy" className="transition-colors hover:text-text-muted">
            Privacy
          </Link>
          {" · "}
          <a
            href="mailto:hello@trackdco.app"
            className="transition-colors hover:text-text-muted"
          >
            hello@trackdco.app
          </a>
        </p>
        <p className="mt-4 text-xs text-text-subtle">© 2026 Trackd Co</p>
      </footer>
    </div>
  );
}

const FEATURES = [
  {
    title: "One unified stack",
    body: "Most apps only track one thing. Trackd brings gear, peptides, supps and ancillaries together.",
  },
  {
    title: "Live inventory maths",
    body: "Log, edit or skip a dose and your amounts left, doses remaining and run-out date update on their own.",
  },
  {
    title: "Decision support",
    body: "Reconstitution calculator and dose maths worked out for you, so you're not doing it in your head.",
  },
];
