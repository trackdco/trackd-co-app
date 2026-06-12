import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CalendarDays } from "lucide-react";

export const metadata: Metadata = { title: "Calendar — Trackd Co" };

/**
 * Calendar — placeholder. Reached from the calendar shortcut on the Dashboard
 * heading. The full dose calendar isn't built yet, so this is an honest "coming
 * soon" stop that keeps the shortcut on-theme rather than dead. The (app) layout
 * has already enforced auth + the 18+/ToS gate. Swap the empty state for the real
 * month view when the calendar feature lands.
 */
export default function CalendarPage() {
  return (
    <div className="mx-auto w-full max-w-md px-6 py-10 animate-in fade-in-0 slide-in-from-bottom-2 duration-500 ease-out motion-reduce:animate-none">
      <Link
        href="/dashboard"
        className="-ml-1 inline-flex items-center gap-1.5 text-sm text-text-muted outline-none transition-colors hover:text-foreground focus-visible:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Dashboard
      </Link>

      <header className="mt-6 px-1">
        <h1 className="font-display text-3xl font-medium tracking-[-0.01em] text-foreground">
          Calendar
        </h1>
        <p className="mt-0.5 text-sm text-text-muted">
          Your dose history and schedule, month by month.
        </p>
      </header>

      <section className="mt-6 flex flex-col items-center rounded-2xl border border-border-default bg-bg-surface px-6 py-14 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-bg-surface-raised text-text-muted">
          <CalendarDays className="h-7 w-7" aria-hidden />
        </span>
        <p className="mt-5 font-display text-xl font-medium text-foreground">
          Coming soon
        </p>
        <p className="mt-1.5 max-w-xs text-sm text-text-muted">
          A full calendar of your logged doses and upcoming schedule will live
          here. For now, track today from the home screen.
        </p>
      </section>
    </div>
  );
}
