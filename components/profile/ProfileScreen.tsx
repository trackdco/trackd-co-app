import Link from "next/link";

import { cn } from "@/lib/utils";
import {
  Bell,
  CaretRight,
  CreditCard,
  FileText,
  ShieldCheck,
  Stethoscope,
  type Icon,
} from "@/components/icons";

import { AvatarUploader } from "@/components/profile/AvatarUploader";
import { InstallAppRow } from "@/components/profile/InstallAppRow";
import { PhysicalCard, type PhysicalInitial } from "@/components/profile/PhysicalCard";
import { ProfileFeedbackRow } from "@/components/profile/ProfileFeedbackRow";
import { SignOutConfirm } from "@/components/auth/sign-out-confirm";
import { DeleteAccountRequest } from "@/components/auth/delete-account-request";

import { PageScrollTitle } from "@/components/layout/PageScrollTitle";
import { CARD_EYEBROW, PAGE_TITLE } from "@/lib/ui-presets";

/**
 * Profile — everything about your account, on one page (spec 09 · part two).
 *
 * **Settings is gone.** Its route, its page and its form were deleted, and what
 * they held moved here: physical details are edited IN PLACE behind an Edit
 * toggle, and notifications became a row in the App card pointing at its own
 * `/notifications` route. Sending someone to a second screen to change their
 * height was the thing this spec set out to stop.
 *
 * Order: title, avatar, Physical, App, danger zone, version. One row treatment
 * throughout, so the notifications entry is no longer a visually heavier card
 * than the legal links beside it.
 *
 * Presentational only — the page above it does the reading, so `/preview/profile`
 * can render the whole screen without a session.
 */
export function ProfileScreen({
  userId,
  initials,
  avatarUrl,
  displayName,
  hasName,
  email,
  planLabel,
  physical,
}: {
  userId: string;
  initials: string;
  avatarUrl: string | null;
  displayName: string;
  hasName: boolean;
  email: string;
  planLabel: string;
  physical: PhysicalInitial;
}) {
  return (
    <div className="mx-auto w-full max-w-md space-y-5 px-5 pt-4 pb-5">
      {/* Each block fades + rises in on load, staggered — the same
          `animate-home-up` idiom as Home and Progress (per-section, not a single
          whole-page fade), so every tab page loads in the same way. */}
      <div className="animate-home-up" style={{ animationDelay: "0ms" }}>
        {/* Shared scroll-title preset (large heading → fade-in compact bar). */}
        <PageScrollTitle title="Profile" />
      </div>

      {/* ── Identity ──────────────────────────────────────────────── */}
      <section
        className="animate-home-up flex flex-col items-center text-center"
        style={{ animationDelay: "55ms" }}
      >
        <AvatarUploader initials={initials} signedUrl={avatarUrl} userId={userId} />

        {/* An H2, not a second H1. `PageScrollTitle` already renders the page's
            one H1 ("Profile"); two made the document claim two top-level
            headings, and a screen reader's heading list read "Profile" then the
            user's own name at the same level. The type is unchanged. */}
        <h2
          className={
            hasName
              ? `mt-5 text-balance leading-[1.15] ${PAGE_TITLE}`
              : `mt-5 break-all leading-[1.2] ${PAGE_TITLE}`
          }
        >
          {displayName}
        </h2>
        {hasName ? (
          <p className="mt-1 max-w-full truncate text-sm text-text-muted">{email}</p>
        ) : null}

        {/* Plan status pill — quiet and muted (amber retired on this screen). */}
        <span className="mt-4 inline-flex items-center rounded-full border border-border-default bg-bg-surface-raised px-3 py-1 text-xs font-medium text-text-muted">
          {planLabel}
        </span>
      </section>

      {/* ── Physical (edited in place) ────────────────────────────── */}
      <div className="animate-home-up" style={{ animationDelay: "85ms" }}>
        <PhysicalCard initial={physical} />
      </div>

      {/* ── App ───────────────────────────────────────────────────── */}
      <div className="animate-home-up" style={{ animationDelay: "115ms" }}>
        <p className={`mb-3 ${CARD_EYEBROW}`}>App</p>
        <div className="overflow-hidden rounded-2xl bg-bg-surface">
          {/* Billing HAS a destination now (2026-08-12): `/billing` states the
              plan, the dates, and carries the cancel control. It was an
              `InfoRow` going nowhere for as long as there was nothing to
              manage; three surfaces promise "cancel any time before then" and a
              promise you cannot reach is not kept. The plan still rides on the
              row, so nothing about it reads differently at a glance. */}
          <LinkRow href="/billing" icon={CreditCard} value={planLabel}>
            Billing
          </LinkRow>
          <Divider />
          <LinkRow href="/notifications" icon={Bell}>
            Notifications
          </LinkRow>
          <Divider />
          <LinkRow href="/terms" icon={FileText}>
            Terms of Service
          </LinkRow>
          <Divider />
          <LinkRow href="/privacy" icon={ShieldCheck}>
            Privacy Policy
          </LinkRow>
          <Divider />
          <LinkRow href="/medical-disclaimer" icon={Stethoscope}>
            Medical Disclaimer
          </LinkRow>
          <Divider />
          {/**
            * ⚠️ THE FOURTH DOCUMENT (v2.0, 2026-08-25), BESIDE THE THREE THAT
            * WERE ALREADY HERE.
            *
            * Terms, Privacy and the Medical Disclaimer have always been rows on
            * this screen. The Consumer Health Data Privacy Policy is new, and
            * without this it was reachable only from logged-OUT surfaces — so
            * every existing account had no route to it at all.
            *
            * ⚠️ THE HOMEPAGE LINK IS SEPARATE AND STAYS. Washington's My Health
            * My Data Act asks for a link on the public homepage, which is `/`.
            * This is the ordinary problem of a signed-in user wanting to read
            * what they agreed to. Both are true; neither replaces the other.
            *
            * ⚠️ ITS FULL NAME, not an abbreviation — the statute is about a
            * policy published under that name. `verbatimQuotes.test.ts` pins it.
            */}
          <LinkRow href="/consumer-health-data" icon={ShieldCheck}>
            Consumer Health Data Privacy Policy
          </LinkRow>
          <Divider />
          <ProfileFeedbackRow userId={userId} />
          {/* InstallAppRow renders its own leading divider and self-hides when
              the app is already on the Home Screen, so no stray divider is
              left. It sits last because it is the only row that can vanish. */}
          <InstallAppRow />
        </div>
      </div>

      {/* ── Danger zone ───────────────────────────────────────────── */}
      {/* OUTLINED rather than filled, so it reads as a place you enter
          deliberately rather than an alarm sitting on the page. */}
      <div className="animate-home-up" style={{ animationDelay: "145ms" }}>
        {/* `cn`, not a template string: CARD_EYEBROW already carries
            `text-text-muted`, so concatenating shipped both utilities and the
            muted one won. The label had never been red. */}
        <p className={cn("mb-3", CARD_EYEBROW, "text-accent-destructive")}>
          Danger zone
        </p>
        {/* Two rows, both in the open (Adrian, 2026-07-30 — a More/Fewer
            disclosure was tried here and rejected as fussy). "Clear all
            compounds & stock" was REMOVED entirely at the same time: deleting a
            compound already keeps its history, and a single button that empties
            the whole protocol does not belong next to a sign-out. Each row keeps
            its own confirmation, which is what actually guards them. */}
        <div className="overflow-hidden rounded-2xl border border-accent-destructive/40">
          <SignOutConfirm variant="row" />
          <DangerDivider />
          <DeleteAccountRequest email={email} variant="row" />
        </div>
      </div>

      <p
        className="animate-home-up text-center text-xs text-text-subtle"
        style={{ animationDelay: "175ms" }}
      >
        Trackd Co · v0.4 (Beta)
      </p>
    </div>
  );
}

/* ── Co-located, server-safe presentational pieces ───────────────── */

function Divider() {
  return <div className="mx-4 hairline-t" aria-hidden />;
}

/** The danger zone's own divider, tinted to the section rather than the page. */
function DangerDivider() {
  return <div className="mx-4 border-t border-accent-destructive/25" aria-hidden />;
}

/* `InfoRow` lived here: a row that stated a fact and went nowhere, which is what
   Billing was until it gained `/billing` (2026-08-12). It was the only user, so
   it is gone rather than left as an unused shape for somebody to reach for. */

/**
 * `value` is optional and only Billing uses it: the row states the plan AND goes
 * somewhere, which is the one case in this card where a fact and a destination
 * belong on the same line. Without it the plan would either move off the row or
 * need a second row to sit on.
 */
function LinkRow({
  href,
  icon: RowIcon,
  value,
  children,
}: {
  href: string;
  icon: Icon;
  value?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-4 py-3.5 outline-none transition-colors hover:bg-bg-surface-raised active:bg-bg-surface-raised focus-visible:bg-bg-surface-raised focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
    >
      <RowIcon className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-sm text-foreground">{children}</span>
      {value ? (
        // `max-w-[55%]` + truncate: a long label used to win the flex fight and
        // push the caret off the row (measured at 35 characters). No current
        // label does, but `NO_ENTITLEMENT_LABEL` is documented as something the
        // next person must change.
        <span className="max-w-[55%] shrink truncate text-sm text-text-muted">{value}</span>
      ) : null}
      <CaretRight className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
    </Link>
  );
}
