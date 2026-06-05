# Progress Tracker

Update this file after every meaningful implementation change.

## Current Phase

- Project setup — building the context system. Pre-implementation.

## Current Goal

- Stand up the `Context/` spec so AI-assisted builds have a source of truth.
  Supabase is not wired up yet.

## Completed

- Next.js 16 (App Router) + React 19 + Tailwind v4 starter scaffolded.
- Canonical schema authored: `supabase/trackd_schema_v0_4_2.sql` (16 tables,
  2 views) + `supabase/trackd_storage_policies.sql`. Not yet applied to a
  live Supabase project.
- Context system written: `project-overview.md`, `architecture.md`,
  `code-standards.md`, `ai-workflow-rules.md`.
- `ui-context.md` complete — signed off by co-founder (2026-06-05).
  Theme, colour tokens, typography, radius, layout, component
  library, and icons all locked.
- Design-system foundation wired (`npm run build` passes): all
  colour tokens defined in `app/globals.css` (`:root` + `@theme
  inline`); Geist + Geist Mono + Playfair Display (serif) wired via
  `next/font` in `app/layout.tsx`; shadcn/ui installed
  (`components.json`, `lib/utils.ts`, first `button` component) with
  its semantic tokens mapped onto the Trackd palette; Lucide
  installed. Deps added: class-variance-authority, clsx,
  tailwind-merge, lucide-react, tw-animate-css, radix-ui.

## In Progress

- Nothing actively in progress. Next workstream is the Supabase
  setup (Phases A–C below) — back-end/deploy, no UI needed.

### Feature Specs

- **`Context/Feature Specs/01-design-system.md` — ✅ Complete (verified
  2026-06-06).** Implementation audited against the spec and
  `ui-context.md`: tokens in `app/globals.css` (`:root` + `@theme
  inline`) match `ui-context.md` exactly; fonts wired in
  `app/layout.tsx`; `components.json` config + `lib/utils.ts` `cn()`
  correct; shadcn semantic token map present and on-theme; deps and
  Lucide installed; `button` is the only primitive (further added
  incrementally per spec). All "Check When Done" items pass — no
  hardcoded hex outside `globals.css`, and `npm run build` passes.

## Next Up

1. Stand up the Supabase project; apply `trackd_schema_v0_4_2.sql` and
   `trackd_storage_policies.sql` in the same migration session.
2. Add `@supabase/supabase-js` + `@supabase/ssr`; create the server/browser
   clients under `lib/supabase/`.
3. Prove the deploy pipeline to Vercel (`app.trackdco.app`).
4. Begin Week 1 exit: signup → 18+ gate → login → empty dashboard on the live URL.

## Supabase Setup — Step by Step

> The order matters. Phases A–C are pure backend/deploy and need NO UI, so
> they can run in PARALLEL with ui-context. Only Phase E (auth screens) needs
> the visual language locked. Target: Phases A–C done by ~7 Jun, Week 1 exit
> (Phase E) by 11 Jun. Tick each box as you go.

### Phase A — Create the Supabase project
- [ ] Sign up / log in at supabase.com, create a new **project**.
- [ ] Pick the region closest to your users — **Sydney (ap-southeast-2)** for AU.
- [ ] Set a strong database password and **save it in your password manager**
      (you cannot recover it later, only reset it).
- [ ] Wait for the project to finish provisioning (~2 min).

### Phase B — Apply the schema (one-way step — get it right)
- [ ] Open the project's **SQL Editor**.
- [ ] Paste the FULL contents of `supabase/trackd_schema_v0_4_2.sql` and Run.
      It should complete with no errors.
- [ ] In the SAME session, paste `supabase/trackd_storage_policies.sql` and Run.
      (Order: schema first, storage policies second.)
- [ ] Verify in the **Table Editor**: 16 tables exist (profiles, compounds,
      cycles, protocol_compounds, inventory_items, dose_logs, biomarkers,
      lab_panels, biomarker_results, body_metrics, markers, user_markers,
      journal_entries, marker_readings, notification_preferences,
      push_subscriptions) and 2 views (v_inventory_math, v_biomarker_position).
- [ ] Verify **Authentication → Policies** shows RLS enabled on every table.
- [ ] Verify **Storage** shows a `bloodwork` bucket that is **Private**
      (never flip it public).
- [ ] If anything errors: it's not deployed yet, so fix the SQL and re-run.
      We bump the version (→ v0.4.3) if we change the canonical file.

### Phase C — Wire the app to Supabase + prove the deploy
- [ ] Grab keys from **Project Settings → API**: the Project URL, the
      anon/publishable key, and the service_role/secret key (label names may
      vary — take whatever the dashboard shows under those three roles).
- [ ] Install the client libs: `npm install @supabase/supabase-js @supabase/ssr`.
- [ ] Create `.env.local` (already git-ignored) with:
      `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (safe to
      expose), and `SUPABASE_SERVICE_ROLE_KEY` (server-only — NEVER prefix this
      one with NEXT_PUBLIC, and never use it in client/browser code).
- [ ] Create the Supabase clients under `lib/supabase/` (a server client, a
      browser client, and the session-refresh middleware).
      ⚠️ This is Next.js 16 — the cookies/middleware API differs from older
      examples. READ `node_modules/next/dist/docs/` for the current pattern
      before writing this (per AGENTS.md). Don't copy a Next 13/14 tutorial.
- [ ] Push the repo to GitHub, import it into **Vercel**, and add the same
      env vars in Vercel's project settings.
- [ ] Deploy and confirm the bare app loads on the Vercel URL.
- [ ] Point the `app.trackdco.app` domain at the Vercel deployment.
- [ ] ✅ Checkpoint (target 7 Jun): Supabase live, schema applied, deploy proven.

### Phase D — Seed the read-only catalogues (service role)
- [ ] Seed `compounds`, `biomarkers`, and `markers` via the SQL Editor or a
      service-role script (these tables are service-role-write-only by design).
      Needed before add-compound (Week 2) and bloodwork manual entry (Week 3).

### Phase E — Week 1 exit (needs ui-context locked)
- [ ] Build signup → 18+ gate → login → empty dashboard, on the live URL.
- [ ] Test signup HARD with a brand-new account — the auto-profile trigger is
      the one place a failure would block all signups (now hardened with
      ON CONFLICT, but confirm it works end to end).
- [ ] ✅ Checkpoint (target 11 Jun): the full flow works on both founders' phones.

## Open Questions

- DB-enforced cycle limits: left as an app-layer decision; tester behaviour
  decides post-beta. (Single-active-cycle index stays commented in the schema.)

## Architecture Decisions

- **Stack is Next.js 16, not 14** — repo has `next@16.2.7`. APIs differ from
  older training data; read `node_modules/next/dist/docs/` before using a Next
  API you're unsure about (per `AGENTS.md`).
- **Cycles are archived, never hard-deleted.** Confirmed 2026-06-05. The
  delete cascade (cycle → protocol compounds → inventory → dose logs) is kept
  for account deletion only; the app must archive via `is_active = false` and
  never expose a hard "Delete cycle". Now an invariant in `architecture.md`.
- **Schema reviewed before deploy (2026-06-05).** `trackd_schema_v0_4_2.sql`
  given a full read-through; verdict = sound. Pre-deploy refinements bumped it
  v0.4.1 → v0.4.2 (never deployed, so amended in place): UNIQUE on seed-catalogue names
  (compounds/biomarkers/markers); `handle_new_user()` profile insert made
  idempotent with `ON CONFLICT (id) DO NOTHING` so a trigger hiccup can't break
  signup; cycle archive-not-delete documented in-schema. Injection-site
  rotation confirmed fully covered by `injection_site` + `dose_logs` (visual is
  derived, nothing to store).
- Locked decisions and invariants live in `architecture.md` and
  `project-overview.md` (never store derived values; RLS on every table with
  `(SELECT auth.uid())`; categorical-not-evaluative health data; entitlement
  gates read `profiles.tier` only). Not repeated here — see those files.

## Session Notes

- Today: 2026-06-05. Week 1 exit target: 11 Jun. Beta to 10–15 testers by
  28 Jun.
- Context system is the active workstream. Beyond the starter scaffold,
  the only application code so far is the design-system wiring (fonts,
  tokens, shadcn). Supabase intentionally not set up.
- `ui-context.md` complete and signed off (2026-06-05): theme,
  tokens, typography, layout, shadcn/ui + Lucide all locked and
  wired. Design system ready for the Week 1 (Phase E) auth screens.
