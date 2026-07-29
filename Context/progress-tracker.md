# Progress Tracker

Records the **state** of the build: what's done + the decisions behind it — the
rear-view mirror. Forward steps live in `Context/next-tasks.md`. The full
blow-by-blow history of every spec is in git; this file keeps only what a future
session needs at hand.

Last updated: 2026-07-29

## Current state (2026-07-23)

The app is **fully built and live on prod** (`trackdco.app`), in beta. Stack:
Next.js 16 + Supabase (Postgres / RLS / Auth / Storage) on Vercel (`syd1`). Live:
the data model, auth (Google + email/password), the core dose-logging loop,
Protocol (Plan + Stock), Progress (weight / bloodwork / journal / consistency /
photos), Calendar, Weight, injection-site maps, the reconstitution calculator,
push notifications, a billing scaffold, legal/consent, and the PWA install flow.

**Premium-minimal UI restyle — SHIPPED** (PR #59 squash `d501fff`; polish PR #60
`9a8c7aa`). Every in-app screen + sheet and every external surface moved to the
revised `ui-context.md`: borderless cards, small tracked-uppercase eyebrow titles,
light mono metric values, hairline dividers, compound type-icons (`<CategoryIcon>`),
disciplined amber (due/live beats only), and the retired display serif (Playfair +
`--font-display` gone repo-wide; `lucide-react` dropped). Palette unchanged (warm
near-black + gold amber — a cooler sample was trialled and rejected). Non-urgent
follow-ups (amber judgment calls, etc.) are in `next-tasks.md`.

## Shipped feature ledger

One line each; full detail in git + `Context/Feature Specs/`.

- **Foundation** — schema v0.4.2 (16 tables / 2 views, RLS everywhere), seed
  catalogues (compounds / biomarkers / markers / ranges), 18+/ToS gate, PWA shell +
  splash, legal docs in-DB, custom domain, Vercel `syd1`.
- **Auth** — Google OAuth + email/password + password reset; Resend custom SMTP.
- **Core loop** — home dashboard, add-to-stack, dose logging, per-compound
  injection-site rotation, back-dating (log/start on a past day).
- **Protocol** — `cycles → protocol_compounds → dose_logs` (Postgres canonical),
  Plan + Stock views, inventory maths from `v_inventory_math`, part-used vials,
  custom "make your own" compounds with vials.
- **Progress** — weight (hero + `/weight`), bloodwork photo store, journal + custom
  markers/scales, consistency graph, progress photos.
- **Spec 19** — injection-site rework: anatomical IM + Sub-Q region maps,
  mirror-front convention, sex-aware bodies (male + female), amber recency ramp.
- **Spec 20** — quick-actions FAB + Calculator nav slot.
- **Spec 21** — per-dose draw on the today's-log row (`50u (0.5 mL)`).
- **Spec 22** — per-dose hint, custom markers, compound soft-delete, journal photo
  attachments (migrations applied by hand + verified live on prod).
- **Specs 15 / 16 / 17** — cycle-id stamping (the moat), `profiles.tier` lock,
  Supabase advisor hardening.
- **Spec 14** — push notifications (transport + reminder scheduler, opened beyond
  founders; per-user timezone; `reminder-runner` cron `*/15`).
- **Spec 13** — perf + security hardening pass.
- **Other** — waitlist + founder dashboard, desktop interstitial (phone-only gate),
  beta feedback, archive/reactivation, splash animation, install prompts.

### Wave 2 (in progress — branch only, NOT merged, NOT deployed)

- **Spec 01 · Dose & Schedule Integrity — all 8 steps built; migration unapplied.**
  Ghost compound root-caused and fixed (Postgres id ⇄ client id divergence made
  archive/delete silently no-op, and a zero-row PostgREST write reports success —
  see `architecture.md` → Dose & Schedule Integrity); hydration now waits for
  in-flight deletes; the quick-actions FAB writes to the selected day instead of
  today; the dose time no longer pre-fills from the clock and is now REQUIRED at
  both entry points (Adrian's call — an unset time stays displayable as "Not set"
  for legacy rows, stored as `dose_times = ARRAY[NULL]`); Next Dose reads the real
  stack instead of the empty `seedStack` fixture; logged doses keep their own unit
  and time so an alteration can't restate history. **Vitest added** (`npm test`,
  37 tests, `lib/home/doseIntegrity.test.ts`) — the repo had no test framework at
  all before this.
- **Spec 01 · step 5 — schedule versioning BUILT (uncommitted, migration pending).**
  A schedule is now a series of effective-from versions rather than one mutable
  row, so "what was due on 12 June" resolves against the rule in force *then*.
  `resolveScheduleOn` / `isDueOnFor` (`lib/home/stack.ts`) replace every past-date
  `isDueOn` call — week strip, calendar, consistency, Next Dose. Editing a compound
  seeds a baseline version from the OUTGOING values, so days before the edit keep
  the old rule and nothing is back-filled. `supabase/protocol/005_protocol_compound_schedules.sql`
  is written but NOT applied; every sync call tolerates `42P01` and degrades to the
  device store, so the branch runs correctly either way. Forward-looking UI
  (`upcomingDoseDates`) still reads the current rule, which is correct.
- **Calendar can log a past day.** `DayDetailSheet` lists compounds due-but-unlogged
  on the selected day and opens the dashboard's `LogDoseSheet` against that date —
  the last unbuilt half of step 4. The calendar also publishes its selected day via
  `selectedDay.ts`, so the FAB writes there too.
- **Spec 02 · Compound Lifecycle — all 7 steps built.** Three states collapsed to
  two: active or deleted, one verb (Delete), no Archive page and no permanent erase
  anywhere. A deleted compound now shows the standard plus at full opacity in the
  picker and re-adds through the normal add flow, writing back to the SAME record id
  (`reuseId`) so its logged history stays attached; the re-add versions the schedule
  from its new start date so the pre-deletion run keeps the rule it was run under.
  The delete confirm moved from amber to the `--accent-destructive` Sign-out
  treatment, with Adrian's approved copy. Deleted outright (not just unwired):
  `/archive` + `ArchiveManager`, the Profile row, every Reactivate control, the
  `reactivate` mode, `removeFromStack` / `removeCompoundLogs` /
  `deleteProtocolCompound{,ForStack}` / `deleteStackCompound` / `deleteCompoundLogs`,
  and the `/preview/archive-weight` + `/preview/profile` harnesses. Storage unchanged
  — "deleted" is the existing `archived` / `is_active=false` flag, so no migration
  and no user data touched. See `architecture.md` → Compound Lifecycle.
  - **Adrian's calls (2026-07-29):** the deleted-period gap is left open rather than
    recorded as a "stopped" schedule version (no change to what deletion writes);
    confirm copy = "It stops being dosed from here on, every logged dose is kept, and
    you can add it back from search any time."
- **Spec 03 · Add Compound Flow — all 7 steps built.** Picker is now "Add compound"
  (form still "Add to log"); structure is search → Recently used (cap 5) → Your
  compounds → Browse by category (all 8 existing categories, collapsible) → Make
  your own, with "Popular in comp prep" gone. Stock on the add form is gated to
  VIALS by inventory form (`reconstituted`/`preconcentrated`), never by category —
  tabs/caps stock is untouched in Protocol → Stock. Two new device-local stores:
  `lib/home/recentCompounds.ts` and `lib/home/unitPrefs.ts` (per-compound unit
  override memory). See `architecture.md` → Add Compound Flow.
  - **Adrian's calls (2026-07-29):** rename user-facing "stack" strings only (4 of
    them), leave every internal identifier and the `user_stack_compounds` table;
    Recently used = 5; browse by all 8 existing categories, not the spec's 4;
    **make no catalogue unit changes yet** (the per-compound `default_unit` data is
    already differentiated — forcing every peptide to mcg would render Tirzepatide
    as 2400 mcg), so only the override memory shipped.
- **Spec 04 · Sex-Specific Markers — all 6 steps built.** The picker offers shared
  markers + the profile's own sex; five sex-specific markers are silently absent for
  the other sex (Adrian: no labelling of which markers belong to whom). Sex is read
  raw from `profiles.sex` — no sex set ⇒ shared only, never a male guess. Filtering
  is done with `addable: false` rather than omission, because the dialer resolves an
  entry's existing readings from the same list it offers from; dropping the option
  would blank a logged reading after a sex change. History is filtered nowhere.
  "Cycle Changes" → **"Menstrual Changes"** (Adrian's pick) needs no data migration —
  readings reference markers by id. 9 new tests. See `architecture.md` →
  Sex-Specific Markers.
  - **Needs Adrian to run:** `supabase/markers/001_rename_cycle_changes.sql` (one
    UPDATE, idempotent). Until then the marker still reads "Cycle Changes" in the
    app; the applicability map covers both names so filtering is right either way.
- **Dose-time pre-fill RESTORED (Adrian, 2026-07-29) — reverses Spec 01 step 6.**
  The log form live-tracks the clock on today and falls back to the compound's
  scheduled time when back-dating; the add form live-tracks the clock; a time is no
  longer required to save. An unset time is still a valid, displayable state
  ("Not set"), so only the pre-fill and the required-field guard came back. Spec
  01's checklist items "time field does not pre-fill" are therefore deliberately
  no longer true.

## Open Questions

- **Schedule versioning (Spec 01 · step 5) — migration awaiting Adrian.**
  The code is built and the SQL is written
  (`supabase/protocol/005_protocol_compound_schedules.sql`): strictly additive, no
  backfill, cascades from `protocol_compounds`, its own RLS + grants. Not run — the
  spec says present the plan first. Until it is applied, versions live only in the
  device store (sync calls swallow `42P01`), so a user who alters a schedule and
  then switches device loses the trail, not the logs.
- **"Not set"** is the current wording for a dose time on LEGACY records (worded
  once, in `formatTimeLabel`). A time is now required at every entry point, so this
  can no longer be produced fresh. Spec 01 requires Adrian to confirm the wording.
- **Testing scope** — Vitest covers `lib/**` only (pure by house rule). The
  `seedStack` wiring bug that caused the Next Dose dash was a *wiring* error, which
  a logic-only suite cannot catch; component coverage is not set up.
- **Legal copy — parked Privacy Policy edits (stored verbatim, awaiting Adrian).**
  (1) §7 data retention — the backup-retention window is still unconfirmed;
  (2) §9 your rights — a "comply with the user's regional data-protection law"
  clause needs legal sign-off; (3) §5/§10 — Supabase + Vercel regions must be named.
  Untouched until Adrian directs the edits.
- DB-enforced cycle limits — left as an app-layer decision (the single-active-cycle
  index stays commented in the schema); tester behaviour decides post-beta.

## Architecture Decisions (durable — the ones a future session needs)

- **Vercel functions pinned to Sydney `syd1`** (`vercel.json`) — Supabase + users
  are AU; the US-East default added round-trips. `preferredRegion` is NOT the lever
  (edge-only; the app is Node for `@supabase/ssr`).
- **Every new `public` table must ship its own grants** — the Data API needs a
  table-level GRANT to `anon`/`authenticated` before RLS runs; this project doesn't
  auto-grant. Grants live in `supabase/grants/`; RLS still gates the rows.
- **`profiles.tier` is webhook-only** (column-level privilege, Spec 16) — any new
  `profiles` column must be added to the UPDATE **and** INSERT grant lists in a new
  `supabase/grants/00N_*` migration; new service-only columns stay out.
- **iOS PWA install is manual-only** — no programmatic Add-to-Home-Screen exists;
  the prompt's job is clarity, not automation. iOS push needs the PWA installed
  first. Web Push = VAPID + service worker (`web-push`). Memory:
  `pwa-install-and-push-reality`.
- **Next.js 16, not 14** — `middleware` → `proxy` (`proxy.ts`, Node runtime); read
  `node_modules/next/dist/docs/` before using an unfamiliar Next API. Client key is
  the `sb_publishable_…` key; server secret is `SUPABASE_SECRET_KEY` (no `NEXT_PUBLIC_`).
- **Cycles are archived, never hard-deleted** (`is_active=false`); the delete cascade
  is for account deletion only. Compound "Delete" is also soft (Spec 22).
- **Migrations applied by hand (SQL Editor) don't appear in `list_migrations`** —
  verify schema state by querying `information_schema` / the schema directly, not the
  tracked-migrations list (e.g. Spec 22 is live but unlisted).
- **Don't run `npm run build` while `next dev` is up** — they share `.next`; a
  concurrent build 500s the dev server. Build with dev stopped.
- **Health data is categorical, never evaluative**; state colours (red/green/amber)
  are UI feedback only. Locked invariants live in `architecture.md` +
  `project-overview.md` (never store derived values; RLS `(SELECT auth.uid())` on
  every table; entitlement gates read `profiles.tier` only).

## Environment

- Supabase project ref `boqqracwdpuisgvwbqlc`; hosted MCP in `.mcp.json` (OAuth
  browser login can't run in the VS Code extension — hand-apply DDL via the SQL
  Editor when the MCP won't authenticate).
- Founder accounts: Angus `admin@trackdco.app`, Adrian `adrianschimizzi1@gmail.com`.
- `main` deploys straight to Vercel prod. UI/docs changes only need `next build` +
  `tsc` + `lint`; schema changes go through `supabase/` migrations or the SQL Editor.
