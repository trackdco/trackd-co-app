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
**https://trackdco.app**. Now **two parallel lanes**:
- **Angus + Claude — auth + app shell:** real Google sign-in → 18+/ToS gate →
  dashboard + the logged-in layout. Angus also owns **beta outreach**.
- **Adrian — app UI:** after the legal copy, design then build the real feature
  screens (the landing's feature cards are placeholders waiting on these).

---

## 🔀 Working in parallel (two builders, one repo)

Conflicts come from editing the **same files**, not from working at the same time:
- **One branch per person** — `feat/auth` (Angus), `feat/app-ui` (Adrian). Never
  commit straight to `main`.
- **`git pull` before you start and before you push;** merge one lane at a time,
  the other pulls right after.
- **Stay in your folders.** Shared foundations (`app/globals.css`, `app/layout.tsx`,
  `components/ui/**`, the Context docs) change only by agreement — route them
  through one person.
- **Auth + the app shell land first** — they build the logged-in layout every
  feature screen sits in, so Adrian's screens branch off cleanly once it exists.
- Build everything against the **locked design system** (`ui-context.md`).

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

### ▶ NOW — Auth + app shell  (Angus · branch `feat/auth`)

**Code is built + locally verified (2026-06-08).** Done: ✅ Continue-with-Google
(`signInWithOAuth`), ✅ `/auth/callback` code exchange, ✅ real `/login`, ✅ the
18+/ToS gate at `/welcome` (server-side age ≥18; one consent covering all three
docs; writes `date_of_birth`/`is_18_plus`/`tos_accepted_at`/`tos_version`), ✅ the
guarded `(app)` shell + empty `/dashboard` + sign-out, ✅ root redirect, ✅ PWA
install prompt + manifest, ✅ legal docs rendered from the DB at
`/terms`·`/privacy`·`/medical-disclaimer`. Also fixed a discovered blocker: ✅ the
`api_role_grants` migration (the Data API had no table grants — see
`progress-tracker.md`).

**Remaining to hit the 11 Jun checkpoint:**

1. **Google OAuth dashboard setup (Angus, one-time — THE blocker).** Until this is
   done, "Continue with Google" errors. Steps:
   - Supabase → Authentication → Providers → **Google** → enable, and **copy the
     callback URL** it shows:
     `https://boqqracwdpuisgvwbqlc.supabase.co/auth/v1/callback`.
   - Google Cloud Console → APIs & Services → **OAuth consent screen** (External;
     app name "Trackd Co"; support email; add the Privacy Policy + Terms links
     `https://trackdco.app/privacy` and `/terms`).
   - → **Credentials** → Create OAuth client ID → **Web application**.
     - Authorized JavaScript origins: `https://trackdco.app`,
       `http://localhost:3000`.
     - Authorized redirect URI: the Supabase callback URL copied above.
   - Paste the **Client ID + Client Secret** back into Supabase's Google provider,
     save.
   - Supabase → Authentication → **URL Configuration**: Site URL
     `https://trackdco.app`; Redirect URLs add `https://trackdco.app/**` and
     `http://localhost:3000/**`.
2. **Hard test** with a brand-new Google account, end-to-end: sign in → gate →
   dashboard → sign out → sign back in (skips the gate). The `handle_new_user()`
   trigger is the one place a failure silently blocks *all* signups — watch the
   first fresh signup closely.
3. **RLS isolation** with two real accounts: account B sees none of account A's
   data (query the **views + storage bucket**, not just base tables).
   - ✅ Checkpoint (target 11 Jun): full flow works on both founders' phones.

### Also (Angus) — beta outreach (alongside the build)

Angus owns tester recruitment — his audience (100k social following + a 700-member
peptide Discord), prioritising **influencers** for reach + credibility. Targeted at
the **last few days** before 28 Jun; full strategy in a dedicated session.

### Tooling — Vercel plugin installed (2026-06-06)

Official Vercel plugin for coding agents installed at user scope
(`npx plugins add vercel/vercel-plugin --target claude-code`; Bun installed to
`~/.bun` as its prerequisite). `vercel-plugin@vercel` v0.43.0 — 26 skills, 3
specialist agents (incl. `deployment-expert`), `/vercel-plugin:*` commands, an
MCP server, and hooks. **Loads on next Claude Code session restart.** The
bundled MCP/CLI will need Vercel auth when we first use the deploy commands
(`/vercel-plugin:bootstrap` handles linking + auth).

---

## 🎨 Adrian's lane — legal, then app UI (design → build)

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

### ✅ DONE — Legal / disclaimer copy drafted + stored (2026-06-06)

Terms of Service (v0.2), Privacy Policy (v0.1), and Medical Disclaimer (v0.2)
drafted and **stored in the DB** in the new `legal_documents` table (SQL in
`supabase/legal/`; verbatim, encoding cleaned, Privacy Policy NOTE blocks kept).
Store-only — NOT wired into signup. Full record in `progress-tracker.md`; the
versioning/dating rule is in `architecture.md` → "Legal Documents".

**Still open (parked until Adrian directs — see `progress-tracker.md` Open
Questions):** (1) §7 backup-retention window to confirm + the two retention facts
to state in-body; (2) §9 "comply with the user's regional law" clause; (3) §5/§10
name the Supabase + Vercel regions.

### ⏭ AT LAUNCH — Legal docs: bump to v1.0 + freeze the effective date

Do this **on launch day**, before/with going live (rule in `architecture.md`):
1. Set each document's `version` to **`1.0`** and `is_beta = false`.
2. Set `effective_date` **and** the in-body header line to the **actual launch
   date** (replace "DD Month 2026 — set on launch"). This date is then frozen.
3. Rename the source files in `supabase/legal/` to `…-v1.0` and drop "beta".
4. Thereafter: any change to a doc → bump a **whole** version (2.0, 3.0…),
   re-date it, flip the old row `is_current = false`, delete the superseded
   source file. Wire the signup acceptance UI only when separately directed.

---

## 🗂️ Backlog (not yet scheduled — pull up here when the above is done)

- **Apply the `markers` seed** once Adrian commits the sheet (see his lane above).
- **Week 2+ build:** add-compound + inventory → dose logging → the daily-use loop
  (core-loop order in `ai-workflow-rules.md`) — Adrian's `feat/app-ui` lane once
  the shell's up.
