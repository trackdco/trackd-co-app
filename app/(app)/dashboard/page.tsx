import type { Metadata } from "next";

import { InstallPrompt } from "@/components/pwa/install-prompt";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Dashboard — Trackd Co",
};

/**
 * Empty dashboard — the home screen and the shell every feature lands in. The
 * protocol clock, cycles, dosing, and the rest build out from here (Adrian's
 * app-UI lane). For now it confirms a working signed-in session and offers the
 * install-to-home-screen prompt.
 *
 * The (app) layout has already enforced auth + the 18+/ToS gate; here we only
 * read the user for a display-only greeting (user_metadata is never used for
 * access decisions).
 */
export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const fullName =
    (user?.user_metadata?.full_name as string | undefined) ??
    (user?.user_metadata?.name as string | undefined) ??
    null;
  const firstName = fullName?.trim().split(/\s+/)[0] ?? null;

  return (
    <div className="mx-auto w-full max-w-md px-6 py-10">
      <p className="text-xs uppercase tracking-[0.18em] text-text-muted">
        Today
      </p>
      <h1 className="mt-2 text-balance font-display text-[2rem] font-medium leading-[1.1] tracking-[-0.02em] text-foreground">
        {firstName ? `Welcome, ${firstName}` : "Welcome to Trackd"}
      </h1>
      <p className="mt-3 text-[0.95rem] leading-relaxed text-text-muted">
        You&apos;re all set. Your protocol clock, cycles, and dosing will live
        here — building now.
      </p>

      <InstallPrompt />
    </div>
  );
}
