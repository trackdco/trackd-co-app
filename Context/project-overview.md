# Trackd Co

## Overview
Trackd Co is a PWA for tracking peptide, anabolic steroid, supplement, and hormone-optimisation protocols in one unified system. It is built for serious bodybuilders running real protocols (especially competition prep), with adjacent users in TRT patients, peptide users, biohackers, and coaches. Every competitor tracks one silo; Trackd unifies the full stack — anabolics, peptides, supplements, ancillaries — and adds decision-support intelligence: the right information at the right moment, not a dumb log. It is an information and tracking SaaS for informed adults. It is NOT a medical device, telehealth provider, or pharmacy.

## Goals
1. Beta MVP live at trackdco.app, installed as a PWA on Android and iOS, in the hands of 10–15 seed testers by 28 June 2026.
2. The core loop works end-to-end with zero stored derived values: create cycle → add compounds (all three inventory types) → log doses → edit/undo/skip a dose and watch inventory, calendar, and dashboard reflow automatically.
3. Zero cross-user data exposure: RLS verified with two real accounts before any tester touches the app.

## Core User Flow
1. User signs up, passes the 18+ gate, and logs in (Supabase Auth).
2. Lands on the today-dashboard (protocol clock) — the home screen.
3. Creates a cycle.
4. Adds compounds to the cycle, selecting one of three inventory types: reconstituted (powder + BAC water, with reconstitution calculator), preconcentrated (oil at stated mg/mL), or oral_solid (tabs/caps at stated mg/unit).
5. Logs doses, recording injection site where applicable; the injection-site rotation visual updates.
6. Edits, undoes, or skips a dose — remaining inventory, doses-remaining, and projected-empty reflow automatically (all computed, never stored).
7. Journals daily, including side-effect markers (negative-polarity ordinal markers).
8. Reviews the calendar month view (computed from schedules + logs).
9. Uploads bloodwork files (storage only in beta; manual entry depends on the biomarkers seed catalogue).

## Features

### Protocol & Cycle Management
- Create and manage cycles; unlimited cycles in beta (no DB-level cap; single-active-cycle index stays commented).
- Add compounds from the read-only `compounds` catalogue, branching by inventory type at entry.
- Reconstitution calculator for peptides.

### Dose Logging & Inventory
- Log doses with injection site; injection-site rotation visual.
- Inventory maths (remaining, concentration, mL/units per dose, doses-remaining, projected-empty) computed in `v_inventory_math` — never stored, never trigger-mutated.
- Dose edits, undos, and skips reflow everything automatically.

### Daily Use
- Today-dashboard (protocol clock) as home screen.
- Calendar month view, computed from schedules + logs.
- Journal with side-effect markers; two-tier markers behave as checklist items (exact v1 representation per UI Context).

### Bloodwork (beta scope)
- File upload to Supabase Storage only.
- Manual entry (week 3) against the biomarkers catalogue; results expressed categorically via `v_biomarker_position` (below/within/above — never high/bad).

### Entitlements
- Feature gates read `profiles.tier` and nothing else. Beta defaults everyone to `'paid'`. Stripe (post-trip) becomes the column's only writer; gating logic never changes. Default flips to `'free'` before public launch.

## Scope

### In Scope (beta build, ends 28 June 2026)
- Auth: signup, 18+ gate, login, empty dashboard on live URL (week 1 exit).
- Core loop: cycles, all three inventory types, reconstitution calculator, dose logging with injection site, edit-and-reflow (week 2 exit).
- Daily-use loop: today-dashboard, injection-site rotation visual, journal + side-effect markers, calendar month view, bloodwork upload (week 3 exit).
- Seed data: `compounds` and `biomarkers` catalogues (service-role writes only; work items, not schema).
- RLS on every table, `(SELECT auth.uid())` house pattern; verified with two real accounts.
- PWA install tested on Android and iOS.

### Out of Scope (do not build during the sprint)
- Stripe, payments, founding-member tier (post-trip; tier column already models it).
- Marketing site and waitlist (post-trip).
- Push notification delivery (post-trip; `push_subscriptions` table already exists in schema — storage only).
- Bloodwork AI analyser (v1.5; Claude Sonnet).
- AI chat (cut permanently — legal liability; the tracker is the product).
- Nutrition (cut from v1), dose titration (v1.5). (Custom "Make your own"
  compounds — including **vials + stock runway** on them — were pulled INTO beta
  scope 2026-06-24; see Architecture → Protocol Cutover.)
- Native apps / App Store (PWA via Vercel only; native revisited in v2 if metrics justify).
- DB-enforced cycle limits (open app-layer decision; tester behaviour decides).

## Success Criteria
1. 11 June: fresh signup → 18+ gate → login → empty dashboard, on the live URL, on both founders' phones.
2. 18 June: a user can create a cycle, add compounds of all three inventory types, use the reconstitution calculator, log doses with injection site, and edit a dose with inventory reflowing correctly.
3. 25 June: full daily-use loop — today-dashboard, rotation visual, journal + side-effect markers, calendar month view, bloodwork upload — works end-to-end.
4. 28 June: RLS verified with two real accounts (no cross-user reads), PWA install confirmed on Android and iOS, beta live with 10–15 seed testers and a private feedback channel.

## Reference Documents
- Canonical data model: `supabase/trackd_schema_v0_4_2.sql` (security/integrity-hardened; supersedes v0.3). Apply in the same migration session as its companion `supabase/trackd_storage_policies.sql` (private bloodwork bucket + owner-scoped storage policies; Supabase-only).
- Schema invariants and house patterns: Architecture + Code Standards files.
- Screen specs: UI Context (designs generated just-in-time, evening before build).
- Session rules: AI Workflow Rules / AGENTS.md.