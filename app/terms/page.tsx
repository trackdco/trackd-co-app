import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service — Trackd Co",
};

/**
 * Placeholder. The real terms copy (drafted by the founders) drops in here
 * before public launch. Exists so the footer link doesn't 404.
 */
export default function TermsPage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-6 py-16">
      <Link href="/" className="font-display text-2xl tracking-tight text-foreground">
        trackd co
      </Link>
      <h1 className="mt-12 font-display text-3xl text-foreground">Terms of Service</h1>
      <p className="mt-4 text-sm leading-relaxed text-text-muted">
        Our full terms are being finalised and will appear here before launch.
      </p>
      <Link
        href="/"
        className="mt-8 text-sm text-text-muted transition-colors hover:text-foreground"
      >
        ← Back to home
      </Link>
    </div>
  );
}
