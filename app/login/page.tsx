import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Log in — Trackd Co",
};

/**
 * Placeholder. Replaced by the real Google sign-in + 18+/ToS gate in the auth
 * unit. Exists so the landing CTAs don't 404 on the preview.
 */
export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <Link href="/" className="font-display text-3xl tracking-tight text-foreground">
        trackd co
      </Link>
      <h1 className="mt-10 font-display text-2xl text-foreground">Sign-in is coming soon</h1>
      <p className="mt-3 max-w-sm text-sm leading-relaxed text-text-muted">
        We&apos;re putting the finishing touches on accounts. Check back shortly.
      </p>
      <Button asChild variant="outline" className="mt-8">
        <Link href="/">Back to home</Link>
      </Button>
    </div>
  );
}
