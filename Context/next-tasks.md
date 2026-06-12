# Next Tasks

The **windscreen** — detailed, actionable steps for what to do next. This is the
*only* file that says "what to do next"; `progress-tracker.md` records what's
already done.

**How we use this file:** when a task is finished, (1) log it in
`progress-tracker.md`, (2) tick or delete it here, and (3) add the next concrete
steps. Keep it focused on the current + immediately-upcoming work — the full
long-range roadmap doesn't belong here.

Last updated: 2026-06-12

---

## 🎯 Current focus

**Latest — 2026-06-12 (Adrian + Claude): Spec 07 (Weight Scale/Trend + last-paragraph asks)
— audited & closed, `tsc`+`lint` clean.** The spec's main body (Scale/Trend **opacity
crossfade**, `xxx.xx` entry cap, 1W–All date-windowed range selector) was **already
implemented** in the Spec-08 Weight view — verified each "Check When Done", no code change
needed (crossfade is animated `duration-300 ease-out`, matches the nav fade). Adrian's
decisions on the dictated last paragraph: **weight stays 30–300 kg**; **+ menu "Track your
weight" sheet stays as-is**; **height limit tightened 100/110–250 → 120–230 cm** (settings
form `min`/`max`, server action + error copy, and new DB migration
`supabase/profile/002_height_range_120_230.sql` — live CHECK now 120–230, pre-checked safe).
**▶ Next for this work:** Adrian sign-off → fold into a branch/PR with the other pending
weight work (the doc edits + the two settings files + the migration file aren't committed yet).

---

**Earlier — 2026-06-11 (Adrian + Claude): weight quick-log popup + home fixes — built on
`feat/weight-popup-and-home-fixes`, `tsc`+`lint`+prod `build` clean, ▶ pending Adrian's
on-device QA → PR → CodeRabbit → merge.** Four units, all on Adrian's direction:
1. **Weight quick-log popup** — the + menu's **Weight tile** now opens a new
   **`AddWeightSheet`** (one unit-aware field → logs *today* via the existing
   `weight_logs` UPSERT) instead of routing to `/weight`. Viewing / back-dating / the
   graph stay in `/weight`, reached by tapping the home Weight card (home layout
   deliberately unchanged). `logWeight`/`deleteWeight` now revalidate `/dashboard` too.
2. **Today's Log → tick-off category checklist** — after the dropdowns were rejected, a
   design-panel workflow led to a **checklist grouped by category** (Adrian's pick: a
   blend of "Dense Ledger" + "Daily Checklist"): every dose is one always-visible row —
   **name (title) on top**, `dose · time · site` (amber) beneath; the **tick is a pure
   toggle** (tap empty → log via sheet, tap filled → untick/remove); **all edits live on
   a "⋯" + the name** (→ compound detail). No collapsing, no inner scroll; compact rows
   keep the Weight section visible. Also relabelled the **Home → Dashboard** nav tab
   (four-squares `LayoutGrid` icon).
3. **Injection-site conflict drop-up** — fixed the **no-scroll** bug (`LogDoseSheet` was
   unbounded + `overflow-hidden`; now `max-h-[92dvh]` + a scrollable body) and collapsed
   the free-spot alternates to **4 + "See more"**.
4. **Local-midnight rollover** — "today" now derives from the **device clock** (was
   server UTC, hence "woke up on yesterday"), refreshing on foreground + a 1-min tick;
   the server `isFuture` guard loosened **+1 day** so a user ahead of UTC can log today.

**▶ Next for this work:** Adrian QAs on-device (verify each of the four), then open the PR.

---

**Earlier — 2026-06-10 (Adrian + Claude): Spec 08 home/profile/weight fixes ✅ DONE & pushed
to `main`.** Stood up the Weight (`weight_logs`) + Avatar backend, built the `/weight`
view, made the home Weight card display-only (taps to `/weight`), reworked the + menu
(primary "Log a dose" + 6-tile grid), added the shared **`PageScrollTitle`** scroll-header
preset to every bottom-nav tab root, fixed the log-dose sheet + the live-ticking time
(log + add-compound), built the avatar upload, moved Archive to `/archive`, added a
sign-out confirm (deep-red token), and **removed the "Starting weight" concept** (Profile
"Weight" now = latest logged reading). Specs `Feature Specs/08`. **▶ Next for this lane:**
build out Protocol / Progress (the preset header is already wired), then wire the
device-local stack/dose logs to real Postgres `protocol_compounds` / `v_inventory_math`.

---


**Latest — 2026-06-10 (Adrian + Claude, shipped to `main`/prod): the home screen + the
compound-tracking loop are ✅ LIVE.** Home dashboard (week strip · Today's Log · weight
trend · consistency · recon entry · blank "get started" state); **add-to-log** (method +
unit locked from the catalogue, with a mg/mcg/g dropdown where it applies; dose; schedule
with a future-only start date; drag-ordered **injection-site rotation** on a researched,
method-appropriate site catalogue); **persisted dose logging** with same-day site clashes
**observed, not auto-changed** (free-alternate suggestions + non-advice disclaimer + a
"last used here" rest hint); and a **tap-to-detail** edit / **archive** (keeps history) /
two-step delete flow + a **Profile → Archive** menu. All **device-local** (interim
`localStorage`); the next step is wiring it to real Postgres. Specs `Feature Specs/04`–`07`;
dev harnesses `/preview/home` + `/preview/profile`. Details in the Build track below.

**Latest — 2026-06-10 (Angus + Claude, all shipped to `main`/prod): the Profile & Settings
lane is ✅ DONE.**
- **Profile tab** (`/profile`) — identity/account hub: initials avatar, serif name, email,
  amber "Beta · Pro" pill, Account card, **unit-aware** read-only Physical glance, App card
  (Settings + 3 legal docs), sign-out. Built via a design-panel workflow + a 5-dimension
  adversarial review (6 fixes applied).
- **Settings** (`/settings`) — read-only account block + editable Sex/Units/Height/Weight/
  Goal (server-validated, RLS-scoped). The **Units toggle live-relabels + converts**
  Height/Weight (cm/kg ↔ in/lbs, stored metric); **Save redirects to the dashboard**. A
  subtle **fade-up** entrance on both pages.
- Landed **direct to `main`** (gh not authed) over commits `1e990ac` → `2a6207c`, each
  deployed READY. **PR #2 CLOSED** (not merged — settings was landed straight on `main`; the
  branch was stale). The `feat/settings` branch can still be deleted.

**▶ Angus is now on the MARKETING PLAN (from 2026-06-10) — NOT building.** Re-warming the
audience ahead of beta: the Trackd socials have been quiet for a while (cold audience), so
he's restarting **consistent, Trackd-optimised posting** + building the marketing plan. This
will take a while; he'll come back when it's in motion and we'll pick the next build task
from where he + Adrian are. See **"NOW (Angus) — audience warm-up"** below.

**The other lanes meanwhile:**
- **Adrian + Claude — home + compound tracking: ✅ BUILT & merged to `main` (2026-06-10).**
  The home dashboard + the device-local tracking loop are live (add-to-log, per-compound
  injection-site rotation, persisted logging, same-day clash flagging, detail/edit/archive/
  delete, Profile → Archive). **▶ Next:** wire the device-local stack + dose logs to real
  **Postgres cycles / `protocol_compounds` / inventory** (data model already applied), with
  inventory maths read from `v_inventory_math` (never stored); then the reconstitution
  calculator + the dose-edit-and-reflow checkpoint. (Also still pending: an on-device check
  of the iOS cold-launch nav-strip fix after a clean reinstall.)
- **Auth — one quick task still open (Angus, when he's back):** publish the Google OAuth app
  (Audience → Publish) before any non-Test-user tester can sign in.
- **Deferred offers (when the build resumes; both shared-file — coordinate with Adrian):**
  roll the page **fade** out to the other tabs (Home/Protocol/Progress) via a per-route
  wrapper in `(app)/layout.tsx`; optional top-level nav link to `/settings`.

---

## 🔀 Working in parallel (two builders, one repo)

Conflicts come from editing the **same files**, not from working at the same time:
- **One branch per person** — `feat/auth` (Angus), `feat/app-ui` (Adrian). Never
  commit straight to `main`.
- **Code lands via PR, not direct push (decided 2026-06-08).** Branch → push →
  **open a PR to `main`** → **CodeRabbit auto-reviews** → address findings →
  merge. CodeRabbit only reviews PRs, so anything pushed straight to `main` gets
  no review. Merging a PR to `main` = a Vercel **prod** deploy. (Trivial
  `Context/*.md` doc-only edits may still go direct for speed.)
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

### ✅ DONE — Auth + app shell built & deployed (2026-06-08)

Built on `feat/auth`, merged to `main`, **live on https://trackdco.app** (verified
in prod). Shipped: ✅ Continue-with-Google (`signInWithOAuth`, PKCE), ✅
`/auth/callback` code exchange, ✅ real `/login`, ✅ the 18+/ToS gate at `/welcome`
(DOB via Day/Month/Year dropdowns; server-side age ≥18; one consent covering all
three docs; writes `date_of_birth`/`is_18_plus`/`tos_accepted_at`/`tos_version`),
✅ guarded `(app)` shell + empty `/dashboard` + sign-out, ✅ root redirect, ✅ PWA
install prompt + manifest, ✅ legal docs rendered from the DB at
`/terms`·`/privacy`·`/medical-disclaimer`, ✅ the `api_role_grants` migration (the
Data API had no table grants). Google OAuth dashboard set up (Angus). Proven
end-to-end with a real account: sign-in → `handle_new_user` trigger → gate writes →
dashboard; sign-out + returning-user (skips gate) both confirmed. Full record in
`progress-tracker.md`.

### ▶ NOW — Finish the auth checkpoint (Angus)

Two of the three are **✅ done (confirmed by both founders 2026-06-10)** — only the
Google publish remains:

1. ✅ **On-phone test** — done on both founders' phones: signed in, passed the 18+/ToS
   gate, landed on the dashboard, **Added to Home Screen**, and the PWA installs with
   the Trackd icon + opens full-screen.
2. ✅ **Two-account RLS isolation** — both founders signed in; each account saw only its
   own data, no leakage. (Re-verify the **views + storage bucket** once real cycle/dose
   + bloodwork data exists — baseline is clean.)
3. ▶ **Publish the Google OAuth app** — Google Cloud Console → **APIs & Services →
   OAuth consent screen** (a.k.a. the **Audience** tab) → **Publish App** → confirm.
   Moves it out of "Testing" (where only listed Test users can sign in). Sign-in uses
   only non-sensitive scopes (email/profile/openid), so it flips to "In production"
   immediately — **no Google verification review**. Add Adrian's Google account as a
   Test user meanwhile. **Manual console step — Claude can't reach your Google account
   to click it.**
   - ✅ Checkpoint (target 11 Jun): full flow works on both founders' phones — **met**
     once the app is published.

### ✅ DONE — Healthy canonical repo off iCloud (2026-06-09)

**`~/dev/trackd-co-app` is the canonical working copy** (off iCloud, on APFS) — git is
clean there (fsck/status/deep-log all pass, zero mmap errors; every 2026-06-09 push ran
from it). The old `~/Documents/GitHub/trackd-co-app` is the iCloud copy that throws
`mmap` errors and is now stale. **Action for Angus: open the IDE on `~/dev/trackd-co-app`
and delete the Documents copy** once confirmed. Also installed `gh` + Vercel CLI
user-level (`~/.local/bin`) — **run `gh auth login` + `vercel login`** to unlock the
proper branch→PR→CodeRabbit flow (today's perf/install fixes went direct to `main` only
because `gh` wasn't authed yet).

### ✅ DONE (Angus + Claude) — Profile & Settings (2026-06-10, on `main`/prod)

Both screens built, deployed READY, and signed off by Angus ("very happy with it"):
- **Profile tab** (`app/(app)/profile/page.tsx`) — identity/account hub: initials avatar,
  serif name, email, amber "Beta · Pro" pill, Account card, **unit-aware** read-only Physical
  glance, App card (Settings + 3 legal docs), sign-out. Design-panel workflow + 5-dimension
  adversarial review (6 fixes).
- **Settings** (`app/(app)/settings/{page,actions}.tsx` + `components/settings/settings-form.tsx`)
  — read-only account block + editable Sex/Units/Height/Weight/Goal (server-validated,
  RLS-scoped). **Units toggle live-relabels + converts** Height/Weight (cm/kg ↔ in/lbs,
  stored metric); **Save → dashboard**.
- **Fade-up** entrance on both page roots (reduced-motion safe). Landed direct to `main`
  (gh not authed), `1e990ac` → `2a6207c`. **PR #2 CLOSED** (not merged) via the GitHub API,
  with an explanatory comment.

**Deferred (pick up when the build resumes — items 1–2 shared-file, coordinate with Adrian):**
1. Roll the **fade** out to the other tabs (Home/Protocol/Progress) via a small per-route
   wrapper in `(app)/layout.tsx`.
2. Optional top-level **nav link to `/settings`** (already reachable from the Profile tab).
3. Optionally delete the stale `feat/settings` branch.

**Design-system note (Angus + Adrian — not actioned; shared-token call):** the review
flagged `--text-muted` (#7A7A74) at ~4:1 on the surfaces, just under WCAG AA 4.5:1 for
small text. It's used app-wide (dashboard/layout/nav), so the Profile tab follows the
convention rather than diverging on one screen. Making muted text AA-clean is a one-token
nudge in `globals.css` that lifts every screen — Adrian's call (it's the locked palette).

### ▶ NOW (Angus) — audience warm-up + marketing plan (from 2026-06-10)

**Angus's active focus** (not building). The Trackd socials have been quiet for a while, so
the audience is cold — before the beta push he's **restarting consistent, Trackd-optimised
posting** to re-warm them and building out the marketing plan. Expected to take a while; he'll
come back when it's in motion and we'll choose the next build task from where he + Adrian are.

When outreach proper begins, the base is ~**100k social following + a 700-member peptide
Discord**, prioritising **influencers** for reach + credibility, aimed at the run-up to the
**28 Jun** beta. (The warm-up now is the groundwork for that.)

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

### ✅ DONE — Plus-button "Shortcuts" menu (2026-06-09, PR `feat/shortcuts-menu` → CodeRabbit)

The centre plus opens a styled **Shortcuts** bottom sheet (per
`Context/Feature Specs/03-shortcuts-control-creation.md`), iterated with Adrian into a
**two-tier** layout (MacroFactor-inspired, kept within `ui-context.md`):
- **Top — fixed circle quick-actions:** Log (Today's dose) · Calculator · Journal · Calendar.
- **Bottom — reorderable cards:** Weight · Blood work · **Add a compound** (defaults bottom).

**Only "Add a compound" is wired** → the existing Add-to-Stack flow, **completely
unchanged** (reached by navigation). Everything else → one shared, non-functional
`PlaceholderActionSheet` (visual-only field, saves nothing; the reconstitution one carries
the medical-disclaimer warning). **Reorder (bottom cards):** grey pencil **"Edit"** button
top-right → edit mode; drag to rearrange; **tap any shortcut / "Done" / dismiss commits**;
order persists per-device in `localStorage` (`trackd.shortcutOrder.<uid>`, card ids only).
Pointer-drag + plain-CSS keyframes — **no new dependency**. Full eased **motion**
(staggered entrance, tap "light-up" ripple, eased edit-mode height/fade, Edit⇄Done
cross-fade). New files under `components/shortcuts/` + `lib/shortcutOrder.ts`;
`bottom-nav.tsx` → `ShortcutsMenu`; motion keyframes added to `app/globals.css`. `tsc` +
`lint` clean; reviewed live on `/preview`.

**Gotcha banked:** don't run `npm run build` while `next dev` is running — they share
`.next` and the build 500s ("Cannot find module page.js"). Build with the dev server
stopped.

**Next:** address any CodeRabbit findings on the PR, manual on-device QA of the drag +
ripple, then merge.

### ✅ DONE — Bottom nav + Add-to-Stack (2026-06-08, `feat/app-ui` → open PR to `main`)

Persistent **bottom navigation** built and **integrated into the merged auth shell**
(rendered from `app/(app)/layout.tsx`; Protocol/Progress/Profile placeholders added
under `app/(app)/`; Home → Angus's `/dashboard`). The branch was **reconciled onto
current `main`** — the earlier parallel `app/(main)/` shell (built pre-auth) was
dropped to resolve the `/dashboard` collision. The centre plus slides up the
**Add to Stack** sheet (near-full-height, drag-to-dismiss). **Search wired to real
data:** filters the bundled 149-compound catalogue by **name + aliases**; empty →
"Popular in comp prep" + the user's saved compounds; no match → "'[query]' not
found". A **"Make your own"** form (name/category/unit/route/inventory type) saves
custom compounds to **per-user `localStorage`** (persists on-device). Customs are
**editable + deletable** (delete behind a confirm), **duplicates blocked**, name
capped at 80. Form pickers are **dark pill selectors**; **8 distinct category dot
hues** (`--cat-*` tokens). Catalogue is bundled from `compounds.csv` via
`build-compounds-data.mjs` → `lib/compounds-catalogue.ts` (validated + auto-regen via
a **`prebuild`** hook; taxonomy in `lib/compound-categories.ts`). A post-build audit
(28 verified findings) was applied (crypto-id fallback for on-phone http, render
guard for bad categories, keyboard-hide focus gate, focus-into-form, magnifier icon,
bigger drag target). Dev-only **`/preview`** route (404s in prod) shows it all without
auth. `npm run build` + `npm run lint` clean. Full record in `progress-tracker.md`.

**Round-3 (in this PR):** each **custom** compound's row now carries three
right-aligned controls — a primary add-to-stack **+** (matches the catalogue rows;
visual until the cycle feature lands), a smaller **edit** (opens the unchanged edit
menu), and **delete** (same inline red confirm + persistence as the edit menu). Also
fixed a **Radix import regression** the earlier CodeRabbit commit introduced: it had
swapped the unified `radix-ui` package for the individual `@radix-ui/react-*` packages
but left the `Dialog.Root` / `Slot.Root` namespace usage, so `sheet` / `dialog` /
`tabs` / `scroll-area` / `button` all crashed with "Element type is invalid" — fixed
by switching the four wrappers to `import * as` and Button to use `Slot` directly.
tsc + lint + build clean.

### ▶ NEXT (Adrian) — after this PR merges, build the core loop

The bottom-nav + Add-to-Stack PR is open (CodeRabbit reviewing). Once it merges to
`main` (= a Vercel **prod** deploy), build the **core loop** — the week-2 spine:
1. **Cycles** — the create / active-cycle model + UI (archive-not-delete invariant).
2. **Add compound → stack** — wire the now-visual **+** (on both catalogue and custom
   rows) to actually add a compound to the active cycle. This is the first real use of
   the **+**; until cycles exist it is intentionally inert on every row.
3. **Inventory → dose logging → the daily-use loop** (order in `ai-workflow-rules.md`).

Testing notes (banked this session): the dev-only `/preview` route is the no-auth
harness for building these screens (keep it — 404s in prod). The *real* signed-in app
needs `.env.local` locally (`NEXT_PUBLIC_SUPABASE_URL` +
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`). To test the full app **on a phone**, use the
PR's Vercel **preview** URL and add it to **Supabase → Auth → URL Configuration →
Redirect URLs** (+ make sure the `NEXT_PUBLIC_*` vars are enabled for the **Preview**
env in Vercel) — a LAN-IP localhost won't pass Google's redirect allowlist.

### ✅ DONE — Seed catalogues compiled + loaded (2026-06-06)

Adrian built the Compounds, Biomarkers, and IGF-1 reference-range CSVs; Claude
applied them to the live DB (149 compounds, 41 biomarkers, 4 IGF-1 ranges) as two
tracked migrations, with Adrian-approved schema deltas (enum extensions for
`sarm`/`thyroid`/`stimulant`/`g`; new `reference_ranges` table). CSVs + generator
live in `supabase/seed/`. Full record in `progress-tracker.md`.

### ✅ DONE — Markers seed catalogue loaded (2026-06-08)

The **third** catalogue (`markers` — subjective daily tracking: energy, libido,
sleep, pumps, mood… plus side-effects as negative-polarity markers) is now
**built and loaded**. Adrian supplied the CSV; Claude added it as
`supabase/seed/markers.csv` (36 markers), extended `build-seed-sql.mjs`
(pipe-split `tier_labels` → `text[]`, `TRUE`/`FALSE` → boolean), regenerated
`002_seed_catalogues.sql`, and applied the `seed_markers` tracked migration. No
schema/enum change needed (`marker_polarity` already covered the values). Verified
accessible exactly like compounds/biomarkers: 36 rows, RLS on, single
read-only-to-authed SELECT policy, no write policy. Full record in
`progress-tracker.md`. The catalogue is ready for the journal + markers UI to read.

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

- **Week 2+ build:** add-compound + inventory → dose logging → the daily-use loop
  (core-loop order in `ai-workflow-rules.md`) — Adrian's `feat/app-ui` lane once
  the shell's up.
- **Pre-public-beta — brand the OAuth domain (after Airwallex/Pro).**
  The Google sign-in screen shows the raw `…supabase.co` host — fix with a Supabase
  **Custom Domain** (e.g. `auth.trackdco.app`) so it reads as Trackd. Needs Supabase
  **Pro ($25/mo) + Custom Domain add-on ($10/mo)**. Angus does the subscription after
  setting up the Airwallex business account, then Claude drives the domain setup
  (CNAME + TXT verify, add the new callback to Google, activate via CLI). Details in
  memory `launch-custom-domain-and-region`.
  - ✅ **Region check done (2026-06-09):** Supabase is already Sydney; Vercel moved
    `iad1`→`syd1` — co-located + fast. No relocation needed.
- **Push notifications (when there's something worth notifying about).** Standard
  **Web Push** for the PWA: service worker + manifest + **VAPID** keys, sent server-side
  via the `web-push` npm lib (or OneSignal/FCM to skip boilerplate). The opt-in must be
  a real user tap. **iOS caveat:** Web Push only works once the user has **added Trackd
  to their home screen** (iOS 16.4+); Android/desktop work from the browser. Branch/
  `app.link` is NOT a push provider — ignore it. Reference: memory
  `pwa-install-and-push-reality`.
- **Android "richer install" card (low effort, later).** Add `screenshots` (+ keep
  `description`) to `app/manifest.ts` so Android's install dialog becomes an app-store-
  style card (conversion lift). Deferred until there's real app UI to screenshot (the
  dashboard is still a placeholder).
