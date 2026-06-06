# Next Tasks

The **windscreen** — detailed, actionable steps for what to do next. This is the
*only* file that says "what to do next"; `progress-tracker.md` records what's
already done.

**How we use this file:** when a task is finished, (1) log it in
`progress-tracker.md`, (2) tick or delete it here, and (3) add the next concrete
steps. Keep it focused on the current + immediately-upcoming work — the full
long-range roadmap doesn't belong here.

Last updated: 2026-06-06

---

## 🎯 Current focus

Backend, deploy, domain **and the public landing are all live** on
**https://trackdco.app** (app-style First Run onboarding). Next build-track job is
**auth** — wire the real **Google sign-in** behind the landing's CTA, the 18+/ToS
gate, and an empty dashboard. Adrian works the **parallel track** below in the
meantime — no dependency on the build.

---

## 🛠️ Build track — Angus + Claude

### ✅ DONE — Apply the schema (build the data model)

Applied 2026-06-06 as two tracked migrations via the Supabase MCP:
`20260606042525_schema_v0_4_2` then `20260606042547_storage_policies_v0_4_2`.
Verified: 16 tables + 2 views (`security_invoker`), RLS on every table, private
`bloodwork` bucket + 4 owner-scoped storage policies, 16 enums, 7 functions,
signup/prefs/updated_at/unit-family triggers all present. No errors. Full record
in `progress-tracker.md`.

### ✅ DONE — Supabase client layer (2026-06-06)

Keys captured, deps installed (`@supabase/ssr` + `@supabase/supabase-js`),
`.env.local` (git-ignored) created with the real URL + **publishable key**, and
`.env.example` committed. Client files written and `npm run build` verified:
- `lib/supabase/client.ts` — browser client
- `lib/supabase/server.ts` — server client (async `cookies()` + write guard)
- `lib/supabase/middleware.ts` — `updateSession` (refresh-only, `getClaims()`)
- `proxy.ts` — Next 16's renamed-from-middleware root hook (build shows
  `ƒ Proxy (Middleware)`, no deprecation warning)

Env var names locked: `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and (later, server-only)
`SUPABASE_SECRET_KEY`. The `sb_secret_` key isn't provisioned yet — only needed
for admin/seeding work, added when we get there.

### ✅ DONE — Deployed to Vercel (2026-06-06)

Committed + pushed to `main`; Vercel account created (GitHub signup — both
founders on travel data eSIMs, so phone SMS verification needed a workaround);
project imported with `NEXT_PUBLIC_SUPABASE_URL` +
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` set; deploy succeeded on the
`*.vercel.app` URL (per Angus).

### ✅ DONE — Deploy confirmed serving (2026-06-06)

Live and verified at **https://trackd-co-app.vercel.app/** (HTTP 200, renders the
"Trackd co" page; proxy session-refresh runs clean). First deploy 500'd because
the `NEXT_PUBLIC_SUPABASE_*` env vars weren't set at build time; fixed by adding
both to the **Production** env var scope (non-sensitive) **and redeploying with
"Use existing Build Cache" UN-ticked** — a plain redeploy reused stale compiled
output where the vars were still undefined.

> ⚠️ **Gotcha banked:** `NEXT_PUBLIC_` vars are inlined at **build time**.
> Changing one means redeploy **without build cache**, or it won't take.

### ✅ DONE — Domain live (2026-06-06)

**App is live at https://trackdco.app** — verified from outside Vercel: DNS
resolves (`trackdco.app` → A `216.198.79.1`), HTTPS returns 200 with valid SSL,
and the page renders. Vercel shows "Valid Configuration".

Decision: the app is served on the **bare root `trackdco.app`**, not a subdomain
(Angus's call — the app *is* the domain; no separate marketing site for now). In
the Vercel Add-Domain dialog the "Redirect apex domains to www" option was left
OFF. Apex can't use a CNAME, so DNS at **Porkbun** is an **A record** (host blank
→ `216.198.79.1`, the IP Vercel displayed). Porkbun's two parking records (ALIAS +
wildcard CNAME → `pixie.porkbun.com`) were deleted; the Google Workspace **MX +
TXT** records were left untouched. End state: 3 records (A + MX + TXT).
- ✅ Checkpoint HIT (target 7 Jun, done 6 Jun): Supabase live, schema applied,
  deploy proven, custom domain live with SSL.

### ✅ DONE — Public landing live (2026-06-06)

App-style **First Run** onboarding shipped to https://trackdco.app (merged
`feat/landing` → `main`; verified HTTP 200 on the live domain). Mobile-first
swipeable carousel (hero → stack → site rotation → inventory) with product
mini-mocks, gold accents, a 2s auto-advance tour (snap-toggle so it works on iOS),
scroll parallax, and a "Continue with Google" CTA. Desktop shows an "open on your
phone" gate (mobile-only by intent). On-brand `/login` + `/terms` + `/privacy`
placeholders so nothing 404s. Decisions: amber used as a restrained accent across
the onboarding surface (founder call — the in-app health-data categorical/
never-evaluative invariant still stands); the proxy now **fails open** if Supabase
env is unset (a missing var can't 500 the whole site). **Feature mini-mocks are
placeholders** — swap to the real screens once the app UI is designed.

### ▶ NOW — Auth: real Google sign-in + 18+/ToS gate

Wire the landing's CTA to a working account flow:
1. **Google OAuth setup (Angus, one-time):** Supabase → Auth → Providers → Google
   (enable, copy callback URL) → Google Cloud OAuth client (consent screen + web
   client using the Supabase callback) → paste client id/secret back → set Site URL
   + redirect URLs (`https://trackdco.app/**`, `http://localhost:3000/**`).
2. Build **Continue with Google** (`signInWithOAuth`) + the OAuth callback route
   (code exchange); replace the `/login` placeholder.
3. **18+ / ToS gate** as a one-time post-sign-in interstitial (Google gives name +
   email, not DOB/consent): collect `date_of_birth` (reject <18 → set `is_18_plus`),
   accept ToS → set `tos_accepted_at` + `tos_version`, via an authed `profiles`
   UPDATE. Gate app access on `is_18_plus AND tos_accepted_at`.
4. **Empty dashboard** + route guard (`getUser()`); root redirects a logged-in user
   to `/dashboard`. Sessions persist (cookie + proxy refresh) so they stay logged in.
5. **Post-signup "Add to Home Screen" prompt** (PWA install) — Angus's flow ask.
6. Test signup **HARD** with a brand-new Google account — the `handle_new_user()`
   trigger is the one place a failure silently blocks *all* signups. Confirm RLS:
   a second account sees none of the first's data.
   - ✅ Checkpoint (target 11 Jun): full flow works on both founders' phones.

### Tooling — Vercel plugin installed (2026-06-06)

Official Vercel plugin for coding agents installed at user scope
(`npx plugins add vercel/vercel-plugin --target claude-code`; Bun installed to
`~/.bun` as its prerequisite). `vercel-plugin@vercel` v0.43.0 — 26 skills, 3
specialist agents (incl. `deployment-expert`), `/vercel-plugin:*` commands, an
MCP server, and hooks. **Loads on next Claude Code session restart.** The
bundled MCP/CLI will need Vercel auth when we first use the deploy commands
(`/vercel-plugin:bootstrap` handles linking + auth).

---

## 📋 Parallel track — Adrian (no code, no dependency on the build)

### ✅ DONE — Seed catalogues compiled + loaded (2026-06-06)

Adrian built the Compounds, Biomarkers, and IGF-1 reference-range CSVs; Claude
applied them to the live DB (149 compounds, 41 biomarkers, 4 IGF-1 ranges) as two
tracked migrations, with Adrian-approved schema deltas (enum extensions for
`sarm`/`thyroid`/`stimulant`/`g`; new `reference_ranges` table). CSVs + generator
live in `supabase/seed/`. Full record in `progress-tracker.md`.

### ⏭ Markers seed sheet — non-priority, but needed before journal/markers UI

The **third** catalogue (`markers` — subjective daily tracking: energy, libido,
sleep, pumps, mood… plus side-effects as negative-polarity markers) is **not yet
built**. Not urgent — the seed pass above shipped without it, and it's only needed
when the journal + markers UI lands. When ready, build it the same way (CSV →
`supabase/seed/` → re-run the generator). Exact columns (read from the schema):

| column | values / notes |
|--------|----------------|
| name | e.g. "Energy", "Libido", "Sleep Quality", "Pumps" |
| polarity | one of `positive` (up = good thing), `negative` (up = bad thing, e.g. acne/soreness), `neutral`. **Axis orientation only — never a judgement colour.** |
| tier_labels | ordered low→high words, **pipe-separated** (commas break the CSV), e.g. `Drained\|Flat\|Coasting\|Charged\|Wired`. Store the index, show the word. A 2-tier `None\|Present` makes a side-effect behave as a daily checkbox. |
| is_default | TRUE = shown to everyone by default; FALSE = optional catalogue item |

### ⏭ Or — Legal / disclaimer copy

The schema stores `tos_version` + `tos_accepted_at` but the actual text doesn't
exist yet. Draft the **Terms of Service, privacy policy, and medical
disclaimer** — important for a harm-reduction app, and fully non-technical.

---

## 🗂️ Backlog (not yet scheduled — pull up here when the above is done)

- **Seed the `markers` catalogue into the DB** — Compounds + Biomarkers + IGF-1
  ranges are already seeded (2026-06-06). Only `markers` remains: once the sheet
  exists, drop the CSV into `supabase/seed/`, re-run `build-seed-sql.mjs`, and apply
  (service-role-write-only by design). Spec is in the parallel track above.
- **Beta prep:** line up 10–15 testers (target 28 Jun).
