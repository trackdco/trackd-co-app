# Progress Tracker

Records the **state** of the build: what's done + the decisions behind it — the
rear-view mirror. Forward steps live in `Context/next-tasks.md`. The full
blow-by-blow history of every spec is in git; this file keeps only what a future
session needs at hand.

Last updated: 2026-07-30

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

**Wave 2 part two — IN PROGRESS on branch `wave2/containers-cycles-calendar`**
(started 2026-07-29, **not merged, not deployed**). Seven specs done, in the
readme's dependency order (build order, not numeric order): containers, cycles,
calendar, stacks, homepage, protocol, calculator. Remaining: progress, profile,
add-compound, log-a-dose, then part one's global sweep.

- **01 · Containers** — drawn `Vial` / `Bottle` / `Tub` SVGs + the `Container`
  resolver (`components/containers/`), form and colour resolvers
  (`lib/containers/`). Form-driven, never category-driven, except the
  bottle-vs-tub split among orals, which has no data to key on (Adrian's call:
  the catalogue's `supplement` form picks the tub). Four structural greys had no
  token and were snapped to the nearest existing ones (Adrian's call).
- **06 · Cycles** — an on/off rule ABOVE the schedule, riding on
  `ScheduleVersion` so a mid-cycle edit is the existing "effective from today
  forward" write. Five end conditions; one gate in `isDueOnFor`, which every
  retrospective caller already routes through. Named `CycleRule` in code because
  the `cycles` TABLE is a different concept (the protocol run / "Week 3 of 12").
- **03 · Calendar** — soft cycle fills as continuous bands behind on-days, the
  key below the grid, the cycle in the day sheet. Only repeating on/off cycles
  render; indefinite ones stop at a twelve-month horizon.

- **05 · Stacks** — a display grouping over compounds that stay fully
  independent (see `architecture.md` → Stacks). Protocol → Stacks creates and
  edits; the dashboard renders one expandable row that logs every unlogged member
  in a tap. The dashboard uses a PARTITION so a member can never appear both in
  its stack row and its category section.

- **02 · Homepage** — the dashboard stripped back to what people open it for.
  Week strip with a soft raised block for the selected day (Adrian's call, not
  the spec's amber underline) and the status dot inside the block.

- **04 · Protocol** — one scrolling page, no tabs: Plan, Cycles, Stacks, Stock.
  Leads with the container, hairline affordance cards, auto-named stacks.

- **07 · Calculator** — a presentation rebuild around a **proportional syringe**.
  The arithmetic moved verbatim to `lib/calculator/recon.ts` and is PINNED by
  `recon.test.ts` to 21 input cases captured from the pre-rebuild component, so
  no later refactor can quietly move a figure. Barrel scale and fill are in
  `lib/calculator/syringe.ts`; the same dose fills a fifth of a 0.5 mL barrel and
  a tenth of a 1 mL one, which is the whole point. Gradations labelled every 5 U
  on 0.3 and 0.5 mL, every 10 U on 1 mL (Adrian, 2026-07-30). Still stateless: no
  presets, no history, no compound data. `COLUMN_EYEBROW` and `COLUMN_VALUE` were
  added to `ui-presets` + `ui-context.md` because "CONCENTRATION" at the 10px
  eyebrow's tracking overruns a third of a phone's width.

**All migrations APPLIED:** `supabase/protocol/006` (compound cycles + the
runs-dry fix), `007` (stacks), and `008` (stack_members ownership hardening —
007 shipped an RLS hole where the one-stack index was global across users; 008
makes ownership structural via composite FKs) on 2026-07-29; `009`
(ownership hardening on three sibling constraints) and
`supabase/sites/011_injection_site_enum.sql` (26 new enum values so all 36
catalogue sites survive a Postgres round-trip) on 2026-07-30. Nothing pending.

The containers review page (`app/preview/containers/`) was reviewed and then
**deleted**, per spec 01's checklist.

**Deferred: cycle end condition 3, "ends when the vial runs out."** The rule is
implemented and tested, but nothing derives the day a vial actually ran dry from
dose logs, so it is withheld behind `VIAL_END_SUPPORTED = false` rather than
shipped as a control that does nothing. Wiring it means threading a Postgres read
into `isDueOnFor`, which is pure and synchronous and called by the week strip,
calendar, consistency and Next Dose — its own pass. Spec 06 asks for five
conditions; four are live.

**An independent review agent (never the author) has been run on every spec in
this wave, and has found real defects on every single one** — including a live
security hole, stacks being write-only to Postgres, custom compounds silently
dropped from stacks on every hydration, one-tap logging stamping the scheduled
time rather than the actual one, and on spec 07 a `prefers-reduced-motion`
opt-out that could never fire because an inline `transition` outranked the
utility class meant to disable it. All fixed. The recurring lesson is that the
author's own claim that something works is not evidence: the reviews that caught
the most were the ones that measured the running page instead of reading it.

**Two bugs found and fixed in already-merged code**, both the same class — a
field silently dropped in a round-trip, causing a deliberate break to read back
as missed doses: `normalizeHistory` was discarding spec 02's `stopped` flag on
every localStorage read, and `scheduleVersionToRow`/`pullScheduleVersions` never
carried a version's cycle to or from Postgres.

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

### Wave 2 · part one — SPECS 01–07 BUILT AND MERGED TO MAIN (2026-07-29)

Merged straight to `main` (Adrian's call) rather than held behind the PR: the app
is in beta with few users, everything verified green (`tsc`, lint, 68 tests,
production build, a structured self-review and a security pass), and merging was
the only way to device-test — the Vercel preview link wasn't reachable for him.

**Still outstanding after the merge:**
- **Device testing.** Nothing on this branch has been used on a real phone. The
  riskiest is pinch-zoom in the photo adjust step (Spec 05 step 9) and rotation
  (Spec 07 step 7).
- ~~Two migrations remain unapplied~~ — **ALL THREE APPLIED by Adrian, 2026-07-29**:
  `supabase/legal/011` (support@ address), `supabase/markers/001` (marker rename),
  and `supabase/protocol/005` (schedule versions + the `stopped` column). Wave 2
  part one has no outstanding schema work.
- ~~The re-add consistency decision~~ — **RESOLVED and shipped 2026-07-29**: the
  delete gap is now recorded rather than inferred (see the entry below).
- **Spec 06's blocked paths** were verified by reading code and RLS policies, not
  by executing them as a non-founder.

- **Spec 01 · Dose & Schedule Integrity — all 8 steps built; migration applied.**
  Ghost compound root-caused and fixed (Postgres id ⇄ client id divergence made
  archive/delete silently no-op, and a zero-row PostgREST write reports success —
  see `architecture.md` → Dose & Schedule Integrity); hydration now waits for
  in-flight deletes; the quick-actions FAB writes to the selected day instead of
  today; ~~the dose time no longer pre-fills and is REQUIRED at both entry
  points~~ — **SUPERSEDED 2026-07-29, see the pre-fill entry below; the current
  contract is: pre-filled, optional**; an unset time is still displayable as "Not
  set" and stored as `dose_times = ARRAY[NULL]`. Next Dose reads the real stack
  instead of the empty `seedStack` fixture; logged doses keep their own unit and
  time so an alteration can't restate history. **Vitest added** (`npm test`,
  `lib/home/doseIntegrity.test.ts`) — the repo had no test framework at all
  before this.
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
- **Spec 05 · Photo Adjust — built across all five photo surfaces.** One shared
  `PhotoAdjustSheet` + pure `lib/media/framing.ts` (22 tests): pinch/drag inside a
  fixed frame, zoom clamped so letterboxing is unreachable, faint rule-of-thirds
  guides, adjusted-only storage with the original kept in memory for in-session
  re-framing. See `architecture.md` → Photo Adjust.
  - **Adrian's calls (2026-07-29):** apply it to bloodwork and journal photos too
    (I flagged that a fixed frame can crop information off a lab report); faint
    rule-of-thirds grid; adjusted-only storage; shared component approved.
  - **Not yet done:** step 9, device testing on iOS Safari + Android Chrome. Pinch
    inside an installed PWA is the likeliest place this breaks and it cannot be
    verified from here.
- **Spec 06 · Admin Page — all 9 steps built.** `/admin` is now an operational
  dashboard (Users → Signups over time + by-channel → Usage → Feedback → Emails),
  renamed from "Waitlist". **The access audit came back clean:** the founder gate
  was already enforced server-side in a Server Component before any query runs,
  with RLS as an independent second layer on both `waitlist` and `beta_feedback` —
  no fix was needed. Cross-user aggregates run as the service role in
  `lib/db/adminMetrics.ts`, which is aggregate-only by construction and re-checks
  the caller. See `architecture.md` → Admin Dashboard.
  - **Adrian's calls (2026-07-29):** active = "wrote something" (dose/weight/
    journal/photo/compound), stated on the page; signups range 30D/90D/All.
  - **Flagged:** the distinct-user counts de-duplicate in TS (PostgREST can't do
    `count(distinct)`) — fine at beta size, wants a SQL view past ~10k writes/week.
    The founder email list is duplicated in `lib/admin.ts` and both SQL policies.
- **Contact email — `legal@trackdco.app` → `support@trackdco.app`** (Adrian,
  2026-07-29; the legal@ mailbox is gone). The account-deletion request in
  `components/auth/delete-account-request.tsx` is updated. The LIVE legal documents
  are text rows in Postgres, so they need
  `supabase/legal/011_support_email.sql` — a targeted `replace()` on the current
  rows only, no version bump (the substance is unchanged; bumping would make every
  existing `consent_records` row read as consent to a superseded version).
  Superseded v1.0/v0.x rows keep the old address as the historical record; they are
  never rendered.
- **Dose-time pre-fill RESTORED (Adrian, 2026-07-29) — reverses Spec 01 step 6.**
  The log form live-tracks the clock on today and falls back to the compound's
  scheduled time when back-dating; the add form live-tracks the clock; a time is no
  longer required to save. An unset time is still a valid, displayable state
  ("Not set"), so only the pre-fill and the required-field guard came back. Spec
  01's checklist items "time field does not pre-fill" are therefore deliberately
  no longer true.

## Open Questions

- ~~**Schedule versioning — migration awaiting Adrian.**~~ **RESOLVED 2026-07-29.**
  `supabase/protocol/005` is applied, so schedule versions (and the Spec 02 delete
  `stopped` markers) now persist server-side instead of living only on the device
  that made them.
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
