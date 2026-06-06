import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * "Locked Shell" entry: open straight onto a glimpse of the real app — today's
 * stack, the due dose, compliance, the injection-site map — blurred and locked
 * behind a bottom sign-in sheet. Shows the product instead of describing it, so
 * the curiosity ("that's the actual app, I want in") does the persuading.
 *
 * The preview is faux, on-brand and visibly locked (blurred + scrim + gate), and
 * health framing stays categorical/neutral. Amber is spent on exactly one thing:
 * the "Due now" label. Pure Server Component — no interactivity needed.
 */
export function LockedShell() {
  return (
    <div className="relative h-dvh overflow-hidden bg-background">
      {/* Locked preview of the real app (decorative) */}
      <div aria-hidden className="pointer-events-none select-none px-5 pt-6 blur-[1.5px]">
        <div className="flex items-center justify-between">
          <span className="font-display text-xl tracking-tight text-foreground">trackd co</span>
          <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wider text-text-muted">
            beta
          </span>
        </div>

        <p className="mt-6 text-sm text-text-muted">Good evening</p>
        <p className="text-xs text-text-subtle">Friday 6 June · Week 3, day 21</p>

        {/* Due now — the single amber element */}
        <div className="mt-4 rounded-2xl border border-accent-amber/40 bg-card p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-accent-amber">Due now</span>
            <span className="text-xs text-text-muted">10:00 pm</span>
          </div>
          <p className="mt-2 text-foreground">Testosterone Enanthate</p>
          <p className="text-sm text-text-muted">0.5 ml · IM · right delt</p>
        </div>

        {/* Metric row */}
        <div className="mt-4 grid grid-cols-2 gap-4">
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs uppercase tracking-wider text-text-muted">Compliance</p>
            <p className="mt-1 font-display text-3xl text-foreground">94%</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs uppercase tracking-wider text-text-muted">Next dose</p>
            <p className="mt-1 font-display text-3xl text-foreground">2h</p>
          </div>
        </div>

        {/* Injection-site rotation — the signature feature */}
        <div className="mt-4 rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-wider text-text-muted">Site rotation</p>
            <p className="text-xs text-text-subtle">left delt · 9 days ago</p>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <span
                key={i}
                className={`h-6 rounded-md border ${
                  i === 2 ? "border-foreground bg-foreground/15" : "border-border-strong"
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Scrim + sign-in sheet pinned to the bottom */}
      <div className="absolute inset-x-0 bottom-0">
        <div className="h-28 bg-gradient-to-t from-background to-transparent" />
        <div
          className="rounded-t-3xl border-t border-border bg-bg-surface-raised px-6 pt-7 text-center"
          style={{ paddingBottom: "max(1.75rem, calc(1rem + env(safe-area-inset-bottom)))" }}
        >
          <h1 className="font-display text-2xl text-foreground">Track the whole protocol</h1>
          <p className="mt-2 text-sm leading-relaxed text-text-muted">
            That&apos;s the app. Sign in to set up yours — takes a minute.
          </p>
          <Button asChild size="lg" className="mt-6 w-full">
            <Link href="/login">
              <GoogleMark />
              Continue with Google
            </Link>
          </Button>
          <p className="mt-3 text-xs text-text-subtle">
            Free while it&apos;s in beta · 18+ ·{" "}
            <Link href="/terms" className="transition-colors hover:text-text-muted">
              Terms
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Official Google "G" mark — four brand colours mandated by Google, the one
 * allowed exception to the no-hardcoded-colour rule (third-party logo).
 */
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}
