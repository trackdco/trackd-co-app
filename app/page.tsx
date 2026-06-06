import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * Public landing / home page — served at the root (trackdco.app), the bio-link
 * first impression. Tight branded hero that flows into the auth flow.
 *
 * NOTE (auth unit, later): once auth + dashboard exist, this root should check
 * the session server-side and redirect a logged-in user straight to /dashboard,
 * so returning / installed-PWA users land on the app, not this marketing page.
 *
 * Copy below is a first draft — refine the voice with the founders. Health-data
 * framing is deliberately categorical (below/within/above), never evaluative.
 */
export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6">
        <span className="font-display text-2xl tracking-tight text-foreground">trackd</span>
        <Link
          href="/login"
          className="text-sm text-text-muted transition-colors hover:text-foreground"
        >
          Log in
        </Link>
      </header>

      {/* Hero */}
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center px-6 pt-14 pb-24 text-center sm:pt-24">
        <p className="mb-5 text-xs font-medium uppercase tracking-[0.2em] text-accent-amber">
          Now in private beta
        </p>
        <h1 className="font-display text-4xl leading-[1.1] text-foreground sm:text-6xl">
          Track the whole protocol.
          <br className="hidden sm:block" /> Not just one silo.
        </h1>
        <p className="mt-6 max-w-xl text-base leading-relaxed text-text-muted sm:text-lg">
          The unified tracker for serious protocols — anabolics, peptides, supplements and
          ancillaries in one system, with the right information at the right moment.
        </p>

        <div className="mt-9 flex flex-col items-center gap-3">
          <Button asChild size="lg" className="px-8">
            <Link href="/login">Get started</Link>
          </Button>
          <span className="text-xs text-text-subtle">Free during the beta · 18+ only</span>
        </div>

        {/* Value strip */}
        <section className="mt-20 grid w-full gap-4 text-left sm:mt-28 sm:grid-cols-2">
          {VALUES.map((value) => (
            <div
              key={value.title}
              className="rounded-2xl border border-border bg-card p-6"
            >
              <h2 className="text-sm font-semibold text-foreground">{value.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">{value.body}</p>
            </div>
          ))}
        </section>

        {/* Beta context */}
        <p className="mt-16 max-w-lg text-sm leading-relaxed text-text-muted">
          A private, founder-led beta for a small group of serious operators — built by people who
          run real protocols, not a generic health app.
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
          data is shown categorically — below, within or above a range — never as good or bad. Know
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

const VALUES = [
  {
    title: "One unified stack",
    body: "Anabolics, peptides, supplements and ancillaries tracked together — every other tool tracks a single silo.",
  },
  {
    title: "Live inventory maths",
    body: "Remaining amounts, doses left and projected run-out reflow automatically every time you log, edit, undo or skip a dose.",
  },
  {
    title: "Decision support, not a dumb log",
    body: "Reconstitution calculator, injection-site rotation, and the right context surfaced at the moment you need it.",
  },
  {
    title: "Private by design",
    body: "Your data is yours — isolated to your account, never shared or sold.",
  },
];
