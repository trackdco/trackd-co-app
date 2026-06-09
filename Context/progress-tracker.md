# Progress Tracker

Records the **state** of the build: what's done, what's in progress, and the
decisions made along the way. This file is the rear-view mirror.

Forward-looking, actionable steps do **not** live here — they live in
`Context/next-tasks.md`. Update this file after every meaningful change.

Last updated: 2026-06-09

## Current Phase

- **Auth + app shell LIVE on https://trackdco.app — verified in production
  (2026-06-08).** The full signup flow is deployed and working end-to-end:
  Continue-with-Google → `/auth/callback` code exchange → 18+/ToS gate at
  `/welcome` (DOB via Day/Month/Year dropdowns; server-side age check;
  all-three-docs consent) → guarded `(app)` shell + empty `/dashboard`, with
  sign-out and the root redirect. Proven with a real Google account
  (`admin@trackdco.app`): sign-in fired the `handle_new_user()` trigger, the gate
  wrote `date_of_birth`/`is_18_plus`/`tos_accepted_at`/`tos_version=0.2`, and
  sign-out + returning-user (skips the gate) both work. Prod checks pass: legal
  docs render from the DB, the PWA manifest serves, route guards redirect. The
  Data API works via the `api_role_grants` migration. **Remaining to fully close
  the 11 Jun checkpoint:** on-phone test on both founders' phones (+ Add-to-Home-
  Screen install), the two-account RLS isolation check, and publishing the Google
  OAuth app (currently in "Testing", so only listed Test users can sign in).
  Backend, data model, seed catalogues, domain, and the public landing remain live.

## Completed

- **Sydney region + honest PWA install + local toolchain (2026-06-09).** Moved the
  Vercel functions to **`syd1`** (new root `vercel.json` `{"regions":["syd1"]}`) to
  co-locate with the Sydney Supabase + the AU audience — warm app TTFB dropped from a
  steady **~330–480ms → ~210ms** (diagnosed by measurement: Supabase was always ~40ms
  = already Sydney; the lag was Vercel's `iad1`/US default). Resolves the "check
  region" backlog item. Recoloured the wordmark **"co" to amber** across all 7 spots.
  Rebuilt the **PWA install prompt** around what iOS actually allows — after two
  adversarially-verified research workflows (~60 sources) confirmed iOS has **no**
  programmatic Add-to-Home-Screen, `navigator.share()`'s sheet lacks the action
  (confirmed on Angus's phone), `app.link`/Branch is native-app deep-linking (not a
  PWA tool, not a push provider), and `.mobileconfig` profiles are worse + trust-toxic:
  removed the misleading share button, added **in-app-webview / non-Safari detection →
  "Open in Safari"** (rescues social-link traffic), iOS-26 "•••"-menu copy, and the
  "View More" step. Installed **`gh` + Vercel CLI** user-level (`~/.local/bin`);
  confirmed **`~/dev/trackd-co-app`** as the healthy off-iCloud canonical repo (all
  today's pushes ran from it, zero mmap errors). Detail in Session Notes 2026-06-09.
- **Add-to-Stack row controls + Radix import-bug fix (`feat/app-ui`, in the open PR
  to `main`, 2026-06-08).** Each **custom** compound's row now shows three
  right-aligned controls — a primary add-to-stack **+** (matches the catalogue rows;
  visual until the cycle feature lands), a smaller **edit** (opens the unchanged edit
  menu), and **delete** (same inline red confirm + per-user `localStorage` persistence
  as the edit menu); custom rows in search results get them too. Before that, fixed a
  **crash that took down the whole Add-to-Stack menu**: the earlier "code rabbit"
  commit (`42e08fb`) swapped the unified `radix-ui` dependency for the individual
  `@radix-ui/react-*` packages but left the `Dialog.Root` / `Slot.Root` namespace
  usage intact, so those resolved to `undefined` and every
  `sheet`/`dialog`/`tabs`/`scroll-area`/`button` threw "Element type is invalid" —
  fixed by switching the four wrappers to `import * as X` and `Button` to use `Slot`
  directly. `tsc` + `lint` + production build all clean. **Local dev unblocked:**
  restored the git-ignored `.env.local` (`NEXT_PUBLIC_SUPABASE_URL` +
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) — without it every Supabase-backed route
  500s locally (only `/preview`, which is outside the `(app)` auth shell, survives).
  Landing via a **PR** (CodeRabbit review) per the new flow, not a direct push.
- **Bottom nav + Add-to-Stack search (Adrian's lane, `feat/app-ui`, 2026-06-08).**
  Built the persistent **bottom navigation** (Home · Protocol · white **Plus** ·
  Progress · My Profile; route-driven amber/gray active state with a gray→amber
  fade; keyboard-aware hide; safe-area insets) and **integrated it into the merged
  auth shell** — rendered from `app/(app)/layout.tsx` with `userId` threaded in;
  Protocol/Progress/Profile placeholder pages added under `app/(app)/`; the Home tab
  points at Angus's real `/dashboard`. (Originally built under a parallel
  `app/(main)/` group on a pre-auth base; **reconciled onto current `main`** —
  dropped the duplicate `(main)` shell + placeholder dashboard to resolve the
  `/dashboard` collision with the auth lane.) The centre plus slides up the
  **Add to Stack** sheet (near-full-height card, drag-to-dismiss handle, Cancel +
  centred sans title). **Search is now wired to real data:** it filters the bundled
  **149-compound catalogue by name *and* aliases** (e.g. "deca"→Nandrolone
  Decanoate, "aromasin"→Exemestane, "npp"→Nandrolone Phenylpropionate); empty query
  shows a curated "Popular in comp prep" list + the user's saved compounds; no match
  shows "'[query]' not found". A **"Make your own"** option sits at the bottom of the
  list always → a form that saves a custom compound to **`localStorage` keyed per
  user** (`trackd.customCompounds.<uid>`), persisting on that device for that user.
  Custom compounds are **editable + deletable** (tap your compound → edit; delete is
  behind a confirm warning); **duplicate names are blocked** (vs catalogue + your
  own), name is capped at 80 chars, and a failed localStorage write surfaces a
  non-fatal notice. Form pickers are **on-brand dark "pill" selectors** (not native
  `<select>`, which can't be forced dark on mobile). The per-row "+" is visual for
  now (real "add to stack" needs the cycle feature).
- **Round-2 hardening of the Add-to-Stack sheet (2026-06-08, post-audit).** A
  6-dimension multi-agent audit (36 raw → 28 verified findings) drove: **8 distinct
  category dot hues** (`--cat-*` tokens in `globals.css`, documented in
  `ui-context.md`); **search icon = magnifier** (was a grid glyph); **generator now
  validates** category/unit/route/inventory and a **`prebuild` npm hook** regenerates
  `lib/compounds-catalogue.ts` on every build (CSV can't ship stale); `crypto.randomUUID`
  **fallback** (it throws over a plain-http LAN IP — i.e. on-phone QA — so "Make your
  own" would have broken); a **render guard** so a corrupt/unknown category can't crash
  the sheet; keyboard-hide now **gated on a focused editable element** (pinch-zoom can't
  hide the nav); **focus moves into the form** on open; bigger (~44px) drag target.
  `npm run build` + `npm run lint` clean; a dev-only **`/preview`** route (404s in prod)
  renders the nav + sheet without auth for review. **Not pushed/deployed.** NB: local
  run of the *real* signed-in app needs a `.env.local` (see below) — without it every
  Supabase-backed page 500s; `/preview` works without it.
- **Compounds catalogue bundled into the app (2026-06-08).** `lib/compounds-catalogue.ts`
  (generated, 149 compounds) is produced from `supabase/seed/compounds.csv` by
  `supabase/seed/build-compounds-data.mjs` — the CSV stays the single source of truth
  (same file that seeds the DB). Taxonomy/labels/option-lists live in the
  hand-authored `lib/compound-categories.ts`. The app reads this static module so the
  Add-to-Stack search works offline (PWA) with no auth/network dependency; swap to a
  live Supabase read later if the catalogue needs to update without a redeploy.
- Next.js 16 (App Router) + React 19 + Tailwind v4 starter scaffolded.
- Canonical schema authored: `supabase/trackd_schema_v0_4_2.sql` (16 tables,
  2 views) + `supabase/trackd_storage_policies.sql`.
- **Data model APPLIED + VERIFIED on the live project (2026-06-06).** Two tracked
  migrations via the Supabase MCP: `20260606042525_schema_v0_4_2` then
  `20260606042547_storage_policies_v0_4_2`. Post-apply verification passed:
  16 tables + 2 views (both `security_invoker=true`); RLS enabled on every table
  with policies present (profiles 3, rest `FOR ALL`); 16 enums; 7 functions;
  11 public triggers + the `on_auth_user_created` trigger on `auth.users`; the
  private `bloodwork` storage bucket (public=false, 10MB, PDF/image mimes) + its
  4 owner-scoped `storage.objects` policies. No errors.
- **Seed catalogues loaded + VERIFIED on the live project (2026-06-06).** Two
  tracked migrations via the MCP: `catalogue_enums_and_reference_ranges` then
  `seed_catalogues`. From Adrian's CSVs (now in `supabase/seed/`): **149 compounds,
  41 biomarkers, 4 IGF-1 reference ranges**. Adrian-approved schema deltas:
  `compound_category` extended with `sarm`/`thyroid`/`stimulant`, `dose_unit`
  extended with `g`, and a new **`reference_ranges`** table (age/sex-banded; NULL
  sex = any) for IGF-1's age-dependent ranges — stored only, not wired into
  interpretation. Biomarker unit mojibake (`Âµg/dL` → `µg/dL`, `10â¹/L` → `10⁹/L`,
  etc.) repaired on the way in. Seed is reproducible: edit the CSV → run
  `node supabase/seed/build-seed-sql.mjs` → idempotent `ON CONFLICT` inserts.
  Post-seed verification passed: counts exact, 0 rows with bad encoding, 0 null
  categories, all 4 ranges FK-linked to IGF-1, `reference_ranges` RLS on with a
  single read-only-to-authed policy. Live DB now **17 tables**.
- **Markers seed catalogue loaded + VERIFIED on the live project (2026-06-08).**
  Adrian's Markers CSV (`supabase/seed/markers.csv`, 36 markers) seeded the
  pre-existing `markers` table via a third tracked migration, `seed_markers` —
  built the same reproducible way as the other catalogues (CSV → extended
  `build-seed-sql.mjs` → idempotent `ON CONFLICT (name) DO UPDATE`; the generated
  `002_seed_catalogues.sql` now carries all three catalogues + ranges). **No
  schema change needed:** `marker_polarity` already = `{positive,negative,neutral}`,
  unlike compounds (which needed enum extensions). `tier_labels` are stored
  pipe-split into `text[]`. Post-seed verification passed: 36 rows
  (12 positive / 21 negative / 3 neutral; 14 default / 22 optional), 0 null/empty
  tier arrays, 0 empty names, 0 mojibake; RLS on with the **same single
  read-only-to-authed SELECT policy and no write policy** as `compounds` /
  `biomarkers` (confirmed by a side-by-side `pg_policies` check). Table count
  unchanged — `markers` was always one of the 18 tables; only its contents are new.
- **Legal documents stored in the DB (2026-06-06).** New `legal_documents` table
  (18th table) + `legal_doc_type` enum, added via two tracked migrations
  (`legal_documents_table`, `seed_legal_documents`; SQL in `supabase/legal/`).
  Holds the **Terms of Service (v0.2)**, **Privacy Policy (v0.1)**, and **Medical
  Disclaimer (v0.2)** text — stored verbatim, encoding mojibake repaired, Privacy
  Policy's inline "⚠ NOTE" drafting blocks retained (Adrian's instruction). All
  `is_beta = true`, `is_current = true`, `effective_date = NULL` ("set on launch").
  RLS on; **public read** (`anon` + `authenticated`, since signup shows them
  pre-auth), service-role-only writes. Verified: 3 rows, one current per type, no
  mojibake. **Store-only — NOT wired into signup.** Versioning/dating rule + the
  launch-day bump-to-1.0 procedure recorded in `architecture.md` → "Legal
  Documents"; launch checklist in `next-tasks.md`.
  **Reviewed + approved by both co-founders (2026-06-06)** — text signed off as-is;
  versions stay 0.2 / 0.1 / 0.2 (beta), with the bump to 1.0 + effective date still
  to happen at launch.
- **Supabase client layer wired (2026-06-06).** `@supabase/ssr` +
  `@supabase/supabase-js` installed; `lib/supabase/client.ts` (browser),
  `lib/supabase/server.ts` (server, async `cookies()` + try/catch write guard),
  `lib/supabase/middleware.ts` (`updateSession` — refresh-only, `getClaims()`),
  and root `proxy.ts` (Next 16's renamed-from-middleware hook) created.
  `.env.local` (git-ignored) holds the real URL + publishable key; `.env.example`
  committed. `npm run build` passes and shows `ƒ Proxy (Middleware)` with no
  deprecation warning. Pattern research-verified against installed versions +
  Supabase docs and adversarially checked for the auth-session footguns.
- **Deployed to Vercel + live on the custom domain (2026-06-06).** App imported to
  Vercel (project `trackd-co-app`), Production env vars set
  (`NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
  non-sensitive) and serving. Custom domain **https://trackdco.app** live and
  verified externally (DNS A `216.198.79.1`, HTTPS 200, valid SSL). First deploy
  500'd on missing build-time env vars — fixed by setting them and redeploying
  with build cache OFF (`NEXT_PUBLIC_` vars inline at build time).
- **Public landing shipped + live (2026-06-06).** App-style **First Run** onboarding
  merged `feat/landing` → `main` and verified live on https://trackdco.app (HTTP 200).
  Mobile-first swipeable carousel (hero → stack → site rotation → inventory) with
  product mini-mocks (placeholders for the real app UI), restrained gold accents, a
  2s auto-advance tour (snap-toggle for iOS), scroll-coupled parallax, and a
  "Continue with Google" CTA → `/login`. Desktop = "open on your phone" gate
  (mobile-only by intent). On-brand `/login` + `/terms` + `/privacy` placeholders.
  Built from a multi-lens design critique; CodeRabbit review applied (metadata/OG,
  a11y, no-404s). `app/layout.tsx` gained native wiring (`themeColor`, `colorScheme`
  dark, `viewport-fit: cover`); `updateSession` now **fails open** when Supabase env
  is unset (a missing/mis-scoped var can't 500 the whole site).
- **Brand icons wired into the app (2026-06-07).** Adrian's logo (1563×1563 PNG,
  master at `app/logo-source.png`) set as the site's icons via Next.js 16's `app/`
  file conventions: **`favicon.ico`** (48×48, replaces the old default Next.js favicon
  — browser tab), **`icon.png`** (512×512 — modern favicon + Android/PWA),
  **`apple-icon.png`** (180×180 — the iOS home-screen Apple Touch icon). All resized
  from the source with macOS `sips` (no ImageMagick/Pillow on the machine;
  `sips -s format ico` makes a valid single-size `.ico`). Verification each time: local
  dev server shows the rendered `<head>` carrying all three tags (`rel="icon"` ×2 +
  `rel="apple-touch-icon"`) with correct `sizes`/`type`, each icon URL returns HTTP
  200, and the served `apple-icon.png` is a byte-for-byte (SHA-256) match to disk.
  **Logo revised same day:** v1 was the "TrackdCo" wordmark (committed, pushed, and
  confirmed live on trackdco.app — prod URLs 200 + SHA-match); Adrian then swapped in
  the shorter **"Trackd"** wordmark (gold "d"), icons regenerated from the new master
  and re-verified locally. The "Trackd" mark fills the frame more, so it reads better
  at 16px tab size than the wordmark did. Pushing `main` is what deploys icons to
  trackdco.app; favicons cache hard, so seeing a change needs a private window (tab)
  or delete-and-re-add to Home Screen (Apple Touch icon).
- **Auth + app shell built — code complete, locally verified (2026-06-08).**
  Method = Google OAuth (`@supabase/ssr`, PKCE — verified against current Supabase
  docs). Shipped: `components/auth/google-sign-in-button.tsx` (`signInWithOAuth`),
  `app/auth/callback/route.ts` (`exchangeCodeForSession` + open-redirect guard on
  `next`), a real `/login` screen (replaced the placeholder), the one-time
  **18+/ToS gate** at `/welcome` (`gate-form.tsx` + `actions.ts` — server-side age
  validation ≥18, single acceptance covering all three docs, writes
  `date_of_birth`/`is_18_plus`/`tos_accepted_at`/`tos_version` to the user's own
  profile, ToS version read live from `legal_documents`), the guarded `(app)`
  route group (`layout.tsx` runs `getUser()` + the gate check) with an empty
  `/dashboard` and sign-out, the root redirect for logged-in users, and a PWA
  install prompt (`components/pwa/install-prompt.tsx`) + web manifest
  (`app/manifest.ts`) + Apple web-app meta. `lib/auth.ts` (`getSessionContext`) is
  the single source of truth for "passed the gate". The landing CTA now triggers
  real sign-in. Verified: `npm run build` + `npm run lint` clean; `/dashboard` and
  `/welcome` 307 → `/login` with no session; the three legal pages render verbatim
  from the DB. Live OAuth + RLS test still pending Google provider config (see In
  Progress).
- **Legal docs wired into signup + rendered from the DB (2026-06-08).** `/terms`,
  `/privacy`, `/medical-disclaimer` now render the current version verbatim from
  `legal_documents` via one shared `components/legal/legal-document.tsx`
  (replacing the "coming soon" placeholders); the gate links + records acceptance
  of all three. Reverses the prior "stored only — not wired into signup" note in
  `architecture.md` (updated).
- **API role grants applied — Data API now works (2026-06-08).** Discovered during
  verification that **no** `public` table was reachable by the API roles: `anon`
  and `authenticated` held only `REFERENCES/TRIGGER/TRUNCATE` (no SELECT/INSERT/
  UPDATE/DELETE), so every Data API call returned `42501 permission denied` —
  including the gate's `profiles` UPDATE and the legal-doc reads. Root cause: the
  schema/seed/legal migrations enabled RLS + policies but never granted table
  privileges to the PostgREST roles, and this project's Supabase defaults don't
  auto-grant. Fixed with the tracked `api_role_grants` migration (SQL in
  `supabase/grants/001_api_role_grants.sql`): `legal_documents` SELECT → anon +
  authenticated; catalogues SELECT → authenticated; user tables full DML →
  authenticated; `profiles` SELECT/INSERT/UPDATE; views SELECT → authenticated.
  RLS is unchanged and still the only row-level gate. Verified post-apply: anon
  reads `legal_documents` (200), anon is correctly denied the authed-only
  catalogues (42501), pages render.
- Context system written: `project-overview.md`, `architecture.md`,
  `code-standards.md`, `ai-workflow-rules.md`, `ui-context.md`.
- `ui-context.md` signed off by Adrian (co-founder) (2026-06-05): theme, colour tokens,
  typography, radius, layout, component library, and icons all locked.
- Design-system foundation wired (`npm run build` passes): all colour tokens in
  `app/globals.css` (`:root` + `@theme inline`); Geist + Geist Mono + Playfair
  Display (serif) via `next/font` in `app/layout.tsx`; shadcn/ui installed
  (`components.json`, `lib/utils.ts`, first `button` component) with its semantic
  tokens mapped onto the Trackd palette; Lucide installed. Deps added:
  class-variance-authority, clsx, tailwind-merge, lucide-react, tw-animate-css,
  radix-ui.
- **Supabase project provisioned** (project ref `boqqracwdpuisgvwbqlc`).
- **Supabase MCP connected + authenticated** (2026-06-06): `.mcp.json` points at
  the hosted Supabase MCP (database + docs features); OAuth completed; the
  database/docs tools are live. Confirmed working against the live project
  (`list_tables` → empty public schema, as expected before the schema is applied).
- **Supabase agent skills installed + committed** (commit `47bb76b`, 2026-06-06):
  `supabase` and `supabase-postgres-best-practices` installed via skills.sh into
  `.agents/skills/`, symlinked into `.claude/skills/` for Claude Code discovery,
  and pinned in `skills-lock.json`.

- **Auth — deployed + verified; Week-1 checkpoint essentially met (2026-06-08).**
  Built, Google OAuth set up, merged to `main`, live on trackdco.app, and
  **sign-in confirmed on both founders' phones** (Angus `admin@trackdco.app`,
  Adrian `adrianschimizzi1@gmail.com`). **RLS isolation VERIFIED with the two real
  accounts** (success criterion #3): simulating each user's `authenticated` JWT
  context, each saw only their own `profiles` + `cycles` row and never the other's;
  cross-user INSERT was blocked by the `WITH CHECK` policy (`42501`); all test data
  rolled back (0 rows persisted). Both ownership patterns proven (`id = auth.uid()`
  and `user_id = auth.uid()`); the two views are `security_invoker` so they inherit
  the same filtering (storage-bucket isolation to be checked once bloodwork uploads
  exist, wk3). Recorded in Completed.

## In Progress

- **App UI — two parallel lanes (PR-based, CodeRabbit-reviewed).** Adrian → the
  **core loop** (cycles → compounds → inventory → dose logging) on `feat/app-ui`.
  Angus + Claude → **Profile & Settings** (`/settings`) on `feat/settings` — v1
  built (read-only account block + editable sex/height/goal/units, server-validated
  + RLS-scoped to the user's own row), **PR #2 open — CodeRabbit review came back
  clean (no actionable comments); ready to merge** (build + lint + guard verified).
  NB the nav link to `/settings` is a deferred shared-layout (`app/(app)/layout.tsx`)
  change to coordinate with Adrian.
- **Auth — effectively done; one tester-gating task left:** **publish the Google
  OAuth app** (Audience → Publish App) before any non-Test-user can sign in. Sign-in,
  the 18+/ToS gate, RLS isolation, and the branded PWA launch splash are all live +
  verified on both founders' phones.

## Tooling

- **Vercel plugin for coding agents installed (2026-06-06).** `vercel-plugin@vercel`
  v0.43.0 installed at **user scope** via `npx plugins add vercel/vercel-plugin
  --target claude-code` (Bun installed to `~/.bun` as its prerequisite — global
  `npm i -g` was blocked by `/usr/local` perms, so used the official `bun.sh`
  installer). Provides 26 Vercel skills, 3 specialist agents (`deployment-expert`,
  `performance-optimizer`, `ai-architect`), `/vercel-plugin:*` slash commands, an
  MCP server, and session-start hooks. Registered in `~/.claude/plugins/`. Loads
  on the next Claude Code session restart; the bundled MCP/CLI needs Vercel auth
  on first use of the deploy commands. NB: the no-`plugins`-tool conclusion from
  an earlier check was wrong — this is an official June-2026 Vercel release
  (docs: vercel.com/docs/agent-resources/vercel-plugin).

### Feature Specs

- **`Context/Feature Specs/01-design-system.md` — ✅ Complete (verified
  2026-06-06).** Implementation audited against the spec and `ui-context.md`:
  tokens in `app/globals.css` (`:root` + `@theme inline`) match `ui-context.md`
  exactly; fonts wired in `app/layout.tsx`; `components.json` config +
  `lib/utils.ts` `cn()` correct; shadcn semantic token map present and on-theme;
  deps and Lucide installed; `button` is the only primitive (further added
  incrementally per spec). All "Check When Done" items pass — no hardcoded hex
  outside `globals.css`, and `npm run build` passes.

## Open Questions

- DB-enforced cycle limits: left as an app-layer decision; tester behaviour
  decides post-beta. (Single-active-cycle index stays commented in the schema.)
- **Legal copy — parked edits inside the Privacy Policy (stored verbatim, not yet
  actioned per "store only").** Three items Adrian flagged in the source need a
  decision before launch: (1) §7 Data retention — Adrian asked Claude to state, in
  the section body, the two confirmed facts (deletion is requested via an in-app
  button; deletion completes within 30 days); the **backup retention window is
  still unconfirmed** and must be nailed down. (2) §9 Your rights — Adrian wants a
  clause that we comply with whatever data-protection law applies in the user's
  region (needs legal sign-off that this is sound). (3) §5/§10 — Supabase + Vercel
  **regions** must be named to complete the storage + international-transfers
  sections. These are intentionally untouched until Adrian directs the edits.

## Architecture Decisions

- **Vercel functions pinned to Sydney `syd1` (2026-06-09).** Root `vercel.json`
  `{"regions":["syd1"]}` sets the default function region; they were defaulting to
  `iad1` (US East) while Supabase + users are AU, so every SSR page paid a US
  round-trip plus US↔Sydney hops per auth/data call. Single region = Hobby-OK.
  Note: `preferredRegion` in code is NOT the lever (it only applies with
  `runtime='edge'`; the app is Node for `@supabase/ssr`). Revisit multi-region on Pro.
- **iOS PWA install is manual-only — no shortcut exists (2026-06-09).** Settled by
  two adversarially-verified research workflows: iOS has no programmatic
  Add-to-Home-Screen, `navigator.share()`'s sheet doesn't contain the action,
  `app.link`/Branch is native-app deep-linking (irrelevant to a PWA, and NOT a push
  provider), and `.mobileconfig` web-clip profiles are more friction + trust-toxic.
  So the install prompt's job is completion/clarity, never automation. **Push
  notifications (when built) = standard Web Push** (VAPID + service worker via
  `web-push`, or OneSignal/FCM); **iOS push needs the PWA installed to the home screen
  first**. Full reference in memory `pwa-install-and-push-reality`.
- **PostgREST role grants are explicit, RLS stays the only row gate (2026-06-08).**
  The Data API needs a table-level `GRANT` to `anon`/`authenticated` before RLS
  even runs; this project's Supabase defaults don't auto-grant, so grants are
  declared in `supabase/grants/001_api_role_grants.sql` (migration
  `api_role_grants`). Grants follow the documented access model (public-read legal
  docs, authed-read catalogues, authed full DML on user tables, no profile
  self-delete, view reads). They open the table; RLS still gates the rows.
  Consequence: **every new `public` table must ship its own grants** (or we set
  `ALTER DEFAULT PRIVILEGES`), else it 42501s on the API.
- **18+/ToS gate accepts all three legal docs in one consent (2026-06-08).**
  Angus's call: the single acceptance at `/welcome` covers Terms + Privacy +
  Medical Disclaimer (each linked), recorded as `tos_accepted_at` + `tos_version`
  (the ToS version, read live from `legal_documents`). Strongest coverage for a
  peptide/AAS tracker — the medical disclaimer is acknowledged up front. The gate
  is the authoritative app entry: `(app)` layout redirects to `/welcome` until
  `is_18_plus AND tos_accepted_at`.
- **`legal_documents` is a new (18th) table for versioned legal text (2026-06-06).**
  ToS / Privacy / Medical Disclaimer text now lives in the DB, one row per
  `(doc_type, version)` with `is_current` (partial unique index = one current per
  type). Same service-role-write model as the seed catalogues, but **read is public
  (`anon` + `authenticated`)** — a deliberate deviation from the authed-only
  catalogues, because signup must show the documents before an account exists
  (Adrian-approved). Stored only; not wired into signup. Versioning rule (whole
  numbers; bump all to 1.0 + freeze the date at launch; bump+re-date per change)
  lives in `architecture.md` → "Legal Documents".
- **Catalogue taxonomy extended to fit the seed, not the reverse (2026-06-06).**
  Adrian's compounds seed used 3 categories (`sarm`, `thyroid`, `stimulant`) and a
  unit (`g`) beyond the original v0.4.2 enums. Decision (Adrian): extend the enums
  via `ALTER TYPE ... ADD VALUE` rather than remap the data, preserving the seed's
  intended granularity. `g` is a catalogue *default_unit* pre-fill only and does
  not affect the inventory unit-family trigger (which still governs mg↔mcg vs iu on
  real inventory items; `v_inventory_math` does not convert grams).
- **`reference_ranges` is a new (17th) table for age-banded ranges (2026-06-06).**
  IGF-1 falls with age, which the flat male/female columns on `biomarkers` can't
  express. New service-role-write-only catalogue, same RLS as `biomarkers`. `sex`
  is nullable (NULL = any) rather than extending `sex_type`. Unique constraint uses
  `NULLS NOT DISTINCT` (PG15+) so NULL-sex rows still de-dupe on re-seed. Stored for
  reference only — **not** wired into interpretation (invariants 3 & 4); the IGF-1
  source data is explicitly flagged indicative/assay-dependent.
- **App is served at the root `trackdco.app`, not a subdomain (2026-06-06).**
  Angus's call — the app *is* the domain for now (no separate marketing site at
  the root). Reverses the earlier `app.trackdco.app` assumption. Apex domains
  can't use a CNAME, so DNS at Porkbun uses an A record (Vercel's IP) or an ALIAS
  → `cname.vercel-dns.com`; the Vercel "redirect apex to www" option is left OFF
  so the bare root serves the app directly.
- **Landing is a mobile-only, app-style onboarding (2026-06-06).** The public entry
  at trackdco.app is a swipeable "First Run" carousel built to feel like a native
  app, not a marketing page (founder direction). Desktop gets an "open on your
  phone" gate. Two `ui-context` nuances were relaxed *for the onboarding surface
  only*: (a) amber is used as a restrained recurring accent (progress fill,
  eyebrows, the "due" elements) rather than strictly once-per-screen — the in-app
  **health-data categorical / never-evaluative** invariant is untouched; (b) the
  feature cards are honest **placeholder mocks**, to be swapped for the real app
  screens once built. Also: `updateSession` now **fails open** when the Supabase
  env is unset, so a missing/mis-scoped var can't 500 the whole site (the real auth
  gate is `getUser()` in protected pages, so this is safe).
- **Stack is Next.js 16, not 14** — repo has `next@16.2.7`. APIs differ from
  older training data; read `node_modules/next/dist/docs/` before using a Next
  API you're unsure about (per `AGENTS.md`).
- **Next 16 renamed `middleware` → `proxy` (2026-06-06).** The root request hook
  is `proxy.ts` exporting `export async function proxy(request)`; a legacy
  `middleware.ts` still works but emits a build deprecation warning. The
  `runtime` option is not allowed in proxy files (proxy defaults to Node, fine
  for `@supabase/ssr`). Verified in the installed Next docs + build output.
- **Publishable key is the client key (2026-06-06).** App uses the new
  `sb_publishable_…` key via `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, not the
  legacy `anon` JWT / `NEXT_PUBLIC_SUPABASE_ANON_KEY` (deprecates end-2026). The
  server secret key (successor to `service_role`) will be `SUPABASE_SECRET_KEY`
  (server-only, no `NEXT_PUBLIC_`) — not yet provisioned. RLS gates all access,
  so the publishable key is browser-safe.
- **Auth-session refresh uses `getClaims()`, refresh-only for now.** `proxy.ts`
  delegates to `updateSession()`; no redirect guard until auth screens exist.
  Open item: confirm the project uses asymmetric JWT signing keys so
  `getClaims()` can verify locally — else fall back to `getUser()`.
- **Cycles are archived, never hard-deleted.** Confirmed 2026-06-05. The
  delete cascade (cycle → protocol compounds → inventory → dose logs) is kept
  for account deletion only; the app must archive via `is_active = false` and
  never expose a hard "Delete cycle". Now an invariant in `architecture.md`.
- **Schema reviewed before deploy (2026-06-05).** `trackd_schema_v0_4_2.sql`
  given a full read-through; verdict = sound. Pre-deploy refinements bumped it
  v0.4.1 → v0.4.2 (never deployed, so amended in place): UNIQUE on seed-catalogue
  names (compounds/biomarkers/markers); `handle_new_user()` profile insert made
  idempotent with `ON CONFLICT (id) DO NOTHING` so a trigger hiccup can't break
  signup; cycle archive-not-delete documented in-schema. Injection-site rotation
  confirmed fully covered by `injection_site` + `dose_logs` (visual is derived,
  nothing to store).
- Locked decisions and invariants live in `architecture.md` and
  `project-overview.md` (never store derived values; RLS on every table with
  `(SELECT auth.uid())`; categorical-not-evaluative health data; entitlement
  gates read `profiles.tier` only). Not repeated here — see those files.

## Session Notes

- 2026-06-09: **Perf (Sydney region), branding, toolchain, PWA-install honesty.**
  (1) **Amber wordmark** — "co" recoloured from muted grey to `--accent-amber` across
  all 7 wordmark spots (app shell, login, welcome, first-run, preview, legal, landing).
  (2) **Big perf win — Vercel functions moved `iad1`→`syd1`** via root `vercel.json`.
  Angus reported the app felt slow (sign-out, reload); measured it: warm app TTFB was a
  steady ~330–480ms from AU, but Supabase was ~40ms (already Sydney) — so the lag was
  Vercel running in US East. Pinned `syd1`; re-measured ~210ms warm + confirmed
  `x-vercel-id: sin1::syd1`. (3) **Toolchain** — installed `gh` 2.93 + Vercel CLI 54.10
  user-level (no Homebrew/sudo: npm global prefix → `~/.local`, PATH in `~/.zshrc`);
  **`~/dev/trackd-co-app` confirmed as the healthy canonical repo** (all pushes ran from
  it, no mmap errors). CLI auth still pending (Angus: `gh auth login` / `vercel login`).
  (4) **PWA install — researched then made honest.** Angus wanted a one-tap "Add to Home
  Screen" / asked about `app.link` (from a video). Two multi-agent research workflows
  (~60 sources, 3 fact-checkers each) confirmed: iOS gives a website **no** way to
  trigger/shortcut Add-to-Home-Screen; `navigator.share()` opens a sheet that lacks the
  action (verified on his phone — actions were Copy/Reading List/Amazon…);
  **`app.link` = Branch deep-linking for NATIVE apps**, not PWAs, and **not** a push
  provider; `.mobileconfig` profiles are worse + trust-toxic. Rebuilt the card to
  maximise completion: dropped the misleading share button; **detect in-app webviews
  (Instagram/TikTok/Facebook) + non-Safari iOS browsers → "Open in Safari"**; iOS-26
  "•••"-menu wording; added the "View More" step (per his screenshots). Android keeps
  real one-tap. All shipped + live. (5) **Push path banked** for later (memory
  `pwa-install-and-push-reality`): Web Push (VAPID + SW via `web-push`, or OneSignal);
  iOS push requires home-screen install first. Everything pushed direct to `main` (gh
  not yet authed for the PR flow); region/install changes are low-risk + user-requested.
- 2026-06-08 (cont.): **RLS verified, PWA splash, repo move, PR flow, parallel
  lanes started.** Sign-in confirmed on both founders' phones; **two-account RLS
  isolation VERIFIED** (each user sees only their own profiles/cycles rows;
  cross-user INSERT blocked by `WITH CHECK`; all test data rolled back) — success
  criterion #3 met. Shipped a branded **PWA launch splash**: 8 iOS
  apple-touch-startup-image PNGs (Trackd mark on #111110) + the legacy
  `apple-mobile-web-app-capable` meta Next 16 omits (the actual fix — iOS was
  ignoring the launch images without it), `start_url=/dashboard`, and an Android
  maskable icon — confirmed working on iOS. **Moved the repo out of iCloud** to
  `~/dev/trackd-co-app` (the `mmap`/stale-NFS git errors are gone; old `~/Documents`
  copy to be deleted). **Adopted a PR-based flow** so CodeRabbit reviews code before
  `main` (it only reviews PRs; the auth+splash work had bypassed it — PR #1's old
  findings were already addressed). Started the **parallel app-UI lanes**: Adrian on
  the core loop (`feat/app-ui`), Angus + Claude on **Profile & Settings**
  (`feat/settings`, **PR #2** — first PR in the new flow, in CodeRabbit review).
- 2026-06-08: **Auth deployed live + DOB picker improved.** Angus completed the
  Google OAuth dashboard setup; tested the full flow locally with a real account
  and it worked end-to-end (sign-in → `handle_new_user` trigger → gate → dashboard,
  all values written). Reworked the gate's date-of-birth field from a native
  calendar (paged month-by-month — brutal for a birthday) to Day/Month/Year
  dropdowns + hardened server date validation. Merged `feat/auth` → `main` and
  deployed to trackdco.app; verified in prod (manifest 200, route guards redirect,
  legal docs render from the DB, login button present). **The merge had to be run
  in a `/tmp` clone** — the local repo's git kept failing with `mmap`/stale-NFS
  errors (iCloud-synced `~/Documents`; permanent fix is to move the repo out of
  `~/Documents`). Remaining for the checkpoint: on-phone test, two-account RLS
  isolation, publish the Google app.
- 2026-06-08: **Markers catalogue seeded.** Adrian supplied the Markers CSV (36
  subjective-tracking markers — energy/libido/sleep/pumps… plus side-effects as
  negative-polarity markers). Added it as `supabase/seed/markers.csv`, extended
  `build-seed-sql.mjs` to emit a markers `INSERT` (pipe-split `tier_labels` →
  `text[]`, `TRUE`/`FALSE` → boolean), regenerated `002_seed_catalogues.sql`, and
  applied it to the live DB as the `seed_markers` tracked migration. No schema/enum
  change required (the `marker_polarity` enum already covered all values). Verified
  it's accessible exactly like the compounds + biomarkers catalogues: 36 rows, RLS
  on, single read-only-to-authed SELECT policy, no write policy (service-role-only).
  This closes the last open seed-catalogue item.
- 2026-06-08: **Auth + app shell built.** Verified the `@supabase/ssr` PKCE
  patterns against current Supabase docs (skill-driven), then built the whole
  flow: Google sign-in, `/auth/callback` exchange, the `/welcome` 18+/ToS gate
  (server-side age check; all-three-docs consent per Angus), the guarded `(app)`
  shell + empty `/dashboard` + sign-out, the root redirect, a PWA install prompt +
  manifest, and real legal-doc pages rendered from the DB. **Caught a live
  blocker during verification:** the Data API returned 42501 on every table — the
  API roles had no SELECT/DML grants (RLS + policies existed but the migrations
  never granted table privileges, and this project doesn't auto-grant). Applied
  the `api_role_grants` migration to fix it (RLS unchanged). `npm run build` +
  `lint` clean; guards + legal rendering verified. Remaining before the 11 Jun
  checkpoint: Angus's one-time Google OAuth dashboard setup, then the hard
  fresh-account test + two-account RLS isolation check.
- 2026-06-07: **Brand icons set, then logo swapped.** Adrian first supplied the
  "TrackdCo" logo; saved it as `app/logo-source.png` (master) and generated the three
  Next.js `app/` icons with `sips` (`favicon.ico` 48×48, `icon.png` 512×512,
  `apple-icon.png` 180×180). Committed → Adrian pushed → verified **live on
  trackdco.app** (prod head tags present, all icon URLs 200, served `apple-icon.png`
  SHA-256-matches disk). The "not showing" question afterward was just favicon caching,
  not a deploy fault. Adrian then **replaced the logo with the shorter "Trackd"
  wordmark (gold "d")**, overwriting `logo-source.png`; regenerated all three icons and
  re-verified locally the same way (new asset hashes, URLs 200, SHA-match). Committed to
  `main`; left unpushed pending Adrian's go-ahead (push = Vercel prod deploy).
- 2026-06-06: **Legal documents stored.** Adrian supplied the Terms of Service
  (v0.2), Privacy Policy (v0.1), and Medical Disclaimer (v0.2). Confirmed the
  approach with him first (public read; create + apply now), then added the
  `legal_documents` table + enum and seeded the three docs as two tracked
  migrations (SQL in `supabase/legal/`). Text stored verbatim with encoding
  mojibake repaired; Privacy Policy's inline "⚠ NOTE" blocks kept per his
  instruction. Store-only — not wired into signup. Recorded the versioning/dating
  rule (bump all to 1.0 + freeze date at launch; whole-number bumps + re-date per
  change; drop "beta" from filenames at release) in `architecture.md` and the
  launch checklist in `next-tasks.md`. Three Privacy-Policy edits Adrian flagged in
  the copy are parked as open questions until he directs them.
  Later same day: both co-founders reviewed the full text and **approved it as-is**
  — signed off at v0.2 / v0.1 / v0.2 (beta), pending the launch-day bump to 1.0.
- 2026-06-06: **Seed catalogues loaded.** Adrian supplied the Compounds,
  Biomarkers, and IGF-1 reference-range CSVs. Committed them (corrected) under
  `supabase/seed/` with a CSV→SQL generator, then applied two tracked migrations:
  enum extensions + the new `reference_ranges` table, then the seed data (149
  compounds / 41 biomarkers / 4 ranges). Confirmed before acting with Adrian and
  got explicit sign-off on the two schema deltas (extend enums; create
  `reference_ranges`). Fixed biomarker-unit mojibake in flight. Verified counts,
  encoding, RLS, and FK links. `markers` catalogue still to be built — spec handed
  to Adrian and parked in `next-tasks.md`.
- 2026-06-06: **App live on the custom domain.** Pointed `trackdco.app` (root) at
  the Vercel deploy — added an A record at Porkbun (host blank → `216.198.79.1`),
  deleted Porkbun's two parking records, left the Google Workspace MX + TXT
  intact. Verified externally: DNS resolves, HTTPS 200, valid SSL, page renders.
  Decision locked: app served on the bare root (not a subdomain). 7 Jun checkpoint
  hit a day early — Supabase live, schema applied, deploy proven, domain live.
- 2026-06-06: **Deployed to Vercel + installed the Vercel plugin.** Angus created
  the Vercel account (GitHub signup; both founders are abroad on travel data
  eSIMs, so SMS phone verification needed a workaround) and deployed — app is live
  on `*.vercel.app`. Then installed the official Vercel coding-agents plugin
  (`vercel-plugin@vercel` v0.43.0, user scope) after verifying `npx plugins add
  vercel/vercel-plugin` against Vercel's own docs — it's a real June-2026 release;
  an earlier in-session check had wrongly called the command fake. Bun installed
  as a prerequisite. Plugin loads on the next session restart. Next: confirm the
  deploy renders + point `app.trackdco.app`.
- 2026-06-06: **Supabase client layer wired.** Installed `@supabase/ssr` +
  `@supabase/supabase-js`; created browser/server/proxy clients + `updateSession`
  helper, `.env.local` (publishable key) + committed `.env.example`. Used a
  research → synthesise → adversarial-verify workflow because Next 16 broke the
  middleware API — it caught the `middleware` → `proxy` rename and confirmed the
  `getClaims()`/response-object pattern against installed types. `npm run build`
  passes (`ƒ Proxy (Middleware)`, no deprecation warning). Next: Vercel deploy.
- 2026-06-06: **Data model built.** Applied `trackd_schema_v0_4_2.sql` then
  `trackd_storage_policies.sql` to the live project as two tracked migrations via
  the MCP (`apply_migration`); full verification checklist passed (16 tables, 2
  views, RLS everywhere, private `bloodwork` bucket + 4 policies). The back end is
  now standing — next is wiring the app (clients + env + Vercel deploy).
- 2026-06-06: Supabase MCP wired up and authenticated; Supabase agent skills
  installed and pushed (commit `47bb76b`). Confirmed the live DB is still empty —
  the data model has not been applied yet. Split the tracking system: this file
  now records **state only**; all forward-looking steps moved to the new
  `Context/next-tasks.md`.
- 2026-06-05: `ui-context.md` completed and signed off — theme, tokens,
  typography, layout, shadcn/ui + Lucide locked and wired. Design system ready
  for the Week 1 auth screens.
- Timeline: Week 1 exit target 11 Jun; beta to 10–15 testers by 28 Jun.
