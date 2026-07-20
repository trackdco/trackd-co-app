import type { ComponentType, ReactNode } from "react";
import {
  CalendarDots,
  Camera,
  Check,
  Flask,
  Flame,
  Lock,
  DeviceMobile,
  TrendUp,
  Lightning,
} from "@/components/icons";
import { QRCodeSVG } from "qrcode.react";

import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Desktop interstitial — Trackd is a phone-only PWA. At ≥1024px (lg) the app
   shell is hidden and this stands in its place (see app/layout.tsx). Built as
   a Server Component: no state, no hooks → zero client JS and no hydration
   flash. Visibility is the CALLER's job (it passes `hidden lg:flex`); this
   file only knows how to look like Trackd.

   Two variants, chosen by the caller from the verified session:
     • default      → a first-time visitor ("Grab your phone to use Trackd")
     • returning    → a signed-in user ("Welcome back / open it on your phone")

   ── DERIVED VALUES, FLAGGED FOR REVIEW ──────────────────────────────────────
   Every colour below resolves to an EXISTING design token — there are no new
   hex literals. The amber washes/borders use `--accent-amber` at low opacity
   (Tailwind `/NN` utilities); the three effects the token system has no name
   for (the action-card glow, the warm page glow, the top hairline) are
   centralised here as `color-mix` over `--accent-amber`, and the deep drop
   shadow reuses the `--overlay-backdrop` token. If we want these to be first-
   class, promote them into app/globals.css as real tokens.
   --------------------------------------------------------------------------- */

/** The exact URL the QR encodes — the only place this string lives. */
const APP_URL = "https://trackdco.app";

// Action-card glow: amber halo (~12%) over a deep drop shadow (overlay token).
const HERO_SHADOW =
  "0 0 80px color-mix(in srgb, var(--accent-amber) 12%, transparent), 0 40px 80px -28px var(--overlay-backdrop)";
// Warm radial glow, top-right corner of the page (amber ~7%).
const PAGE_GLOW =
  "radial-gradient(58% 48% at 90% 2%, color-mix(in srgb, var(--accent-amber) 7%, transparent), transparent 72%)";
// Faint ridge/landscape silhouette along the bottom edge (surface over base).
const RIDGE_BG = "linear-gradient(to top, var(--bg-surface), transparent 82%)";
const RIDGE_CLIP =
  "polygon(0 64%, 11% 54%, 23% 60%, 35% 47%, 47% 55%, 59% 43%, 71% 52%, 83% 41%, 100% 50%, 100% 100%, 0 100%)";
// Top inner hairline on the action card: transparent → amber → transparent.
const HERO_HAIRLINE =
  "linear-gradient(to right, transparent, color-mix(in srgb, var(--accent-amber) 60%, transparent), transparent)";

type Feature = {
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  body: string;
};

// Value reminders — read as a sell to a new visitor and as "here's what you're
// coming back to" for a returning one, so both variants share them.
const FEATURES: Feature[] = [
  {
    icon: Lightning,
    title: "See what's working",
    body: "Track weight, biomarkers and outcomes over time.",
  },
  {
    icon: Flask,
    title: "Stay consistent",
    body: "Log your protocol and build streaks.",
  },
  {
    icon: TrendUp,
    title: "Get real insights",
    body: "Outcomes over time, not just data.",
  },
];

export interface DesktopInterstitialProps {
  /** Our existing logo, passed in by the caller (don't rebuild it here). */
  logo?: ReactNode;
  /** True when a signed-in user hit desktop — shows the "welcome back" copy. */
  returning?: boolean;
  /** Visibility is the caller's job (e.g. `hidden lg:flex`). */
  className?: string;
}

export function DesktopInterstitial({
  logo,
  returning = false,
  className,
}: DesktopInterstitialProps) {
  const copy = returning
    ? {
        eyebrow: "Welcome back",
        subcopy:
          "Trackd is phone-only — open it on your phone to pick your tracking back up.",
        heroHeading: (
          <>
            Open Trackd
            <br />
            on your phone
          </>
        ),
        heroSub: "You're signed in — just open Trackd on your phone to keep tracking.",
      }
    : {
        eyebrow: "Trackd runs on your phone",
        subcopy:
          "Track supplements, peptides, biomarkers and outcomes in one place.",
        heroHeading: (
          <>
            Grab your phone
            <br />
            to use Trackd
          </>
        ),
        heroSub: "Trackd is built for mobile — it doesn't run on desktop.",
      };

  return (
    <section
      aria-label="Trackd is available on mobile"
      className={cn(
        "relative isolate min-h-dvh w-full flex-col overflow-x-clip bg-bg-base text-foreground",
        className,
      )}
    >
      {/* Background texture — pure CSS, decorative. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: PAGE_GLOW }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[36vh]"
        style={{ background: RIDGE_BG, clipPath: RIDGE_CLIP }}
      />

      <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-[88rem] flex-1 flex-col px-12 py-10">
        {/* Logo slot — page top-left (start of the primary column). */}
        {logo ? <div className="shrink-0">{logo}</div> : null}

        <div
          className={cn(
            "grid flex-1 items-center py-10",
            returning
              ? "gap-16 grid-cols-[1.15fr_0.85fr]"
              : "gap-10 grid-cols-[1.1fr_0.9fr] xl:grid-cols-[1.5fr_0.62fr_0.92fr] xl:gap-12",
          )}
        >
          {/* ── Primary column ───────────────────────────────────────────── */}
          <div className="flex flex-col justify-center">
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-accent-amber/25 bg-accent-amber/10 px-3.5 py-1.5 text-xs font-medium uppercase tracking-[0.18em] text-accent-amber">
              <DeviceMobile className="h-3.5 w-3.5" aria-hidden />
              {copy.eyebrow}
            </span>

            <h1 className="mt-6 font-display text-[clamp(2.5rem,4vw,3.75rem)] font-medium leading-[1.04] tracking-[-0.02em]">
              {returning ? (
                <>
                  <span className="block text-foreground">Welcome back.</span>
                  <span className="block text-foreground">
                    Continue <span className="text-accent-amber">on your phone.</span>
                  </span>
                </>
              ) : (
                <>
                  <span className="block text-foreground">Track your protocol.</span>
                  <span className="block text-foreground">
                    <span className="text-accent-amber">Not</span> your spreadsheets.
                  </span>
                </>
              )}
            </h1>

            <p className="mt-6 max-w-md text-base leading-relaxed text-text-muted">
              {copy.subcopy}
            </p>

            {/* Feature rows — only the first-visit variant sells; the returning
                "welcome back" view stays deliberately basic. */}
            {!returning && (
              <div className="mt-9 max-w-md divide-y divide-border-default border-y border-border-default">
                {FEATURES.map(({ icon: Icon, title, body }) => (
                  <div key={title} className="flex items-start gap-4 py-4">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-accent-amber/30 bg-accent-amber/10 text-accent-amber">
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{title}</p>
                      <p className="mt-0.5 text-sm text-text-muted">{body}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Decorative stat cards (quiet, secondary) — first-visit only ── */}
          {!returning && (
            <div aria-hidden className="hidden items-center justify-center xl:flex">
              <FloatingCards />
            </div>
          )}

          {/* ── Action card — THE HERO ───────────────────────────────────── */}
          <div className="flex items-center justify-center">
            <div
              className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-accent-amber/30 bg-bg-surface px-8 py-10 text-center"
              style={{ boxShadow: HERO_SHADOW }}
            >
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 h-px"
                style={{ background: HERO_HAIRLINE }}
              />

              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-accent-amber/30 bg-accent-amber/10 text-accent-amber">
                <DeviceMobile className="h-7 w-7" aria-hidden />
              </span>

              <h2 className="mt-6 font-display text-3xl font-medium leading-[1.12] text-foreground">
                {copy.heroHeading}
              </h2>

              <p className="mt-3 text-sm leading-relaxed text-text-muted">
                {copy.heroSub}
              </p>

              {/* Real, scannable QR. Dark modules on white, generous quiet zone
                  from the white padding. currentColor keeps the fill on-token
                  (text-bg-base) while staying reliable for scanning. */}
              <div className="mt-7 flex justify-center">
                <div
                  role="img"
                  aria-label="QR code linking to trackdco.app"
                  className="rounded-2xl bg-accent-primary p-5 text-bg-base"
                >
                  <QRCodeSVG
                    value={APP_URL}
                    size={232}
                    level="M"
                    marginSize={4}
                    bgColor="transparent"
                    fgColor="currentColor"
                    className="block"
                    aria-hidden
                  />
                </div>
              </div>

              <p className="mt-6 flex items-center justify-center gap-2 text-sm font-medium text-accent-amber">
                <Camera className="h-4 w-4" aria-hidden />
                Point your phone&apos;s camera at the code
              </p>
              <p className="mt-2 text-sm text-text-muted">
                or open <span className="text-foreground">trackdco.app</span> in your
                phone&apos;s browser
              </p>

              <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-text-subtle">
                <Lock className="h-3.5 w-3.5" aria-hidden />
                Your data is private and secure.
              </p>
            </div>
          </div>
        </div>

        {/* Bottom-left footer note. */}
        <div className="flex shrink-0 items-start gap-2.5 text-text-muted">
          <DeviceMobile
            className="mt-0.5 h-4 w-4 shrink-0 text-text-subtle"
            aria-hidden
          />
          <p className="text-xs leading-relaxed">
            Trackd is designed for mobile-first health tracking.
            <br />
            Open <span className="text-accent-amber">trackdco.app</span> on your phone.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ===========================================================================
   Decorative stat cards — fake-but-plausible, styled to read as real Trackd
   screenshots (mirrors the WeightGlanceCard card pattern). Wholly
   decorative: the parent marks this subtree aria-hidden.
   =========================================================================== */

function FloatingCards() {
  return (
    <div className="relative w-full max-w-xs">
      <GlassCard className="rotate-[-4deg] -translate-x-1">
        <WeightCardBody />
      </GlassCard>
      <GlassCard className="mt-5 rotate-[3deg] translate-x-3">
        <InventoryCardBody />
      </GlassCard>
      <GlassCard className="mt-5 rotate-[-2deg] -translate-x-1">
        <LogCardBody />
      </GlassCard>
    </div>
  );
}

function GlassCard({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border-default bg-bg-surface/80 p-5 backdrop-blur-sm",
        "shadow-[0_24px_55px_-28px_var(--overlay-backdrop)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

const CardLabel = ({ children }: { children: ReactNode }) => (
  <p className="text-xs font-medium uppercase tracking-[0.18em] text-text-muted">
    {children}
  </p>
);

// Weight — mirrors WeightGlanceCard: white mono value, muted delta, neutral
// trend sparkline. No good/bad colour (architecture: health data is neutral).
function WeightCardBody() {
  // Noisy, gently-falling trend — not a clean line.
  const points =
    "2,13 11,10 20,15 29,12 38,17 47,14 56,20 65,17 74,22 83,19 92,25 101,22 110,27 119,24 130,29";
  return (
    <>
      <CardLabel>Weight</CardLabel>
      <div className="mt-1.5 flex items-end justify-between gap-3">
        <div>
          <div className="flex items-baseline gap-1.5">
            <span className="font-mono text-3xl font-semibold text-foreground">84.2</span>
            <span className="text-sm text-text-muted">kg</span>
          </div>
          <p className="mt-1 font-mono text-sm text-text-muted">
            −1.4 kg <span className="font-sans">this month</span>
          </p>
        </div>
        <svg
          viewBox="0 0 132 40"
          className="h-10 w-[7.5rem] shrink-0"
          preserveAspectRatio="none"
          aria-hidden
        >
          <polyline
            points={points}
            fill="none"
            stroke="var(--chart-trend)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>
    </>
  );
}

// Inventory — mirrors the real inventory glance: remaining mL, a depletion bar
// and the projected run-dry date (the inventory-math feature). Neutral fill;
// only the date's calendar icon carries a small amber touch. Decorative.
function InventoryCardBody() {
  return (
    <>
      <CardLabel>Inventory</CardLabel>
      <p className="mt-1 text-[11px] text-text-muted">Testosterone E · 10 mL vial</p>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span className="font-mono text-3xl font-semibold text-foreground">6.4</span>
        <span className="text-sm text-text-muted">mL left</span>
      </div>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-bg-input">
        <div className="h-full rounded-full bg-text-muted" style={{ width: "64%" }} />
      </div>
      <div className="mt-3 flex items-center gap-1.5 text-xs text-text-muted">
        <CalendarDots className="h-3.5 w-3.5 text-accent-amber" aria-hidden />
        Runs dry ~ 18 Jul
      </div>
    </>
  );
}

// Today's log — protocol checklist with amber check circles + a streak line.
function LogCardBody() {
  const items = [
    { name: "Testosterone E", sub: "250mg", done: true },
    { name: "Retatrutide", sub: "4mg", done: true },
    { name: "Vitamin D3", sub: "5000 IU", done: false },
  ];
  return (
    <>
      <CardLabel>Today&apos;s log</CardLabel>
      <div className="mt-3 space-y-2.5">
        {items.map((item) => (
          <div key={item.name} className="flex items-center gap-3">
            <span
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                item.done
                  ? "border-accent-amber bg-accent-amber/15 text-accent-amber"
                  : "border-border-strong",
              )}
            >
              {item.done ? <Check className="h-3 w-3" aria-hidden /> : null}
            </span>
            <span className="text-sm text-foreground">{item.name}</span>
            <span className="ml-auto font-mono text-xs text-text-muted">{item.sub}</span>
          </div>
        ))}
      </div>
      <div className="mt-3.5 flex items-center gap-1.5 text-xs text-text-muted">
        <Flame className="h-3.5 w-3.5 text-accent-amber" aria-hidden />
        18 day streak
      </div>
    </>
  );
}
