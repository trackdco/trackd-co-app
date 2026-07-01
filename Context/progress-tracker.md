# Progress Tracker

The **state** of the build — what's done, the key decisions, and open questions.
Forward-looking steps live in `next-tasks.md`.

> Condensed 2026-06-26 for readability. The prior blow-by-blow build log + session
> notes (~2,400 lines) remain in git history if a specific detail is ever needed.

Last updated: 2026-06-26

---

## Current state — beta run-up (target 28 June 2026, 10–15 testers)

**Live on https://trackdco.app** — installable PWA, phone-only by intent, on
Vercel (`syd1`) + Supabase (Sydney). The beta app is essentially feature-complete:

- **Auth + app shell:** Continue-with-Google → `/auth/callback` → 18+/ToS gate
  (`/welcome`; one consent covering all three legal docs) → guarded `(app)` shell.
  Two-account RLS isolation verified; branded PWA launch splash. Google OAuth app
  **published** to production (verified 2026-06-27 via a fresh non-test-user sign-in).
- **Core loop (Postgres canonical):** cycles → `protocol_compounds` → dose logs;
  three inventory types + reconstitution calculator; inventory maths from
  `v_inventory_math` (never stored); injection-site rotation; edit/undo/skip
  reflow; custom "make your own" compounds (incl. vials + stock runway).
  Device-local stores act as an offline cache mirrored to Supabase (survives PWA
  reinstall).
- **Daily-use:** today-dashboard (protocol clock), Protocol screen (Plan/Stock),
  calendar month view, journal + side-effect markers, weight tracking + graph,
  progress photos, bloodwork upload (categorical below/within/above).
- **Push notifications (Spec 14) — LIVE + verified:** Web Push/VAPID + a
  `send-push` Edge Function; reminder scheduler (dose / missed-dose / low-stock)
  via `pg_cron` + `pg_net` (live cadence `*/15`), with quiet hours, once-daily.
  Rolled out to **all opted-in users** (`FOUNDERS_ONLY = false`, commit `d25398b`);
  device timezone captured on opt-in.
- **Perf/security (Spec 13):** Sydney region, batched writes, circuit breaker,
  optimistic weight UI, cached legal reads, security headers; audits clean.
- **Public + ops:** app-style onboarding landing; `/waitlist` capture + founder
  `/admin` dashboard; Profile & Settings; legal docs stored in `legal_documents`
  and rendered from the DB.

**Data model:** `trackd_schema_v0_4_2.sql` + per-feature tracked migrations (~23
tables, RLS on every table, two `security_invoker` views). Seed catalogues: 205
compounds, 41 biomarkers, 36 markers, IGF-1 reference ranges.

---

## Stripe subscriptions — BUILT on the `stripe` branch (NOT merged)

Recurring billing built end-to-end (finish/test steps + the merge gate are in
`next-tasks.md`):

- Monthly + annual via Stripe-hosted Checkout + Customer Portal; **5-day trial on
  annual only**. The webhook (`/api/stripe/webhook`) is the **sole writer** of
  `profiles.tier`.
- New `subscriptions` table (RLS: user SELECT-only, service-role writes) — applied
  live (additive; beta data untouched). `stripe@22`, API `2026-06-24.dahlia`
  (period end read from the subscription item).
- Gated `/billing` + a Free/Monthly/Yearly pricing UI (the **Free tier is
  placeholder** pending the free/paid decision). Founding-member deferred.
- Committed on `stripe` (`d5f258f`); not on `main` — gated behind the
  `profiles.tier` default flip + live keys before launch.

---

## Key decisions & invariants

> Canonical invariants live in `architecture.md` / `project-overview.md`: never
> store derived values; RLS on every table with `(SELECT auth.uid())`; health data
> categorical, never evaluative; entitlement reads `profiles.tier` only; archive,
> never hard-delete.

- **Entitlement = `profiles.tier` only.** Beta defaults everyone `'paid'`; the
  Stripe webhook becomes the sole writer post-trip; default flips to `'free'` at
  launch. Gating logic never changes.
- **PostgREST grants are explicit** — every new `public` table ships its own
  `GRANT` (RLS still gates the rows), else it 42501s on the Data API.
  `service_role` granted via `supabase/grants/002`.
- **Next.js 16** (not 14): `middleware` → `proxy.ts`; read `node_modules/next/
  dist/docs/` before unfamiliar APIs. Client key is `sb_publishable_…`
  (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`); `SUPABASE_SECRET_KEY` is server-only.
- **Served at the bare root `trackdco.app`** (no subdomain); Vercel pinned `syd1`.
- **iOS PWA install is manual-only** (no programmatic Add-to-Home-Screen); iOS Web
  Push requires the PWA installed first. (memory `pwa-install-and-push-reality`)
- **Legal:** one consent at `/welcome` covers all three docs; text lives in
  `legal_documents` (public read, versioned); bump all to v1.0 + freeze the date
  at launch.

---

## Open questions

- **DB-enforced cycle limits** — left as an app-layer decision; tester behaviour
  decides post-beta (single-active-cycle index stays commented in the schema).
- **Privacy Policy edits** (parked until Adrian directs): §7 backup-retention
  window; §9 region-law clause; §5/§10 name the Supabase + Vercel regions.
- **Free-tier contents** — undecided (brainstorm in flight); the Stripe Free card
  is placeholder until then.
