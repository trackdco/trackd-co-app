# Next Tasks

The **windscreen** — detailed, actionable steps for what to do next. This is the
*only* file that says "what to do next"; `progress-tracker.md` records what's
already done.

**How we use this file:** when a task is finished, (1) log it in
`progress-tracker.md`, (2) tick or delete it here, and (3) add the next concrete
steps. Keep it focused on the current + immediately-upcoming work — the full
long-range roadmap doesn't belong here.

Last updated: 2026-07-02

---

## 🎯 Current focus

**2026-07-02 (Adrian + Claude): AUTH — email + password added alongside Google —
BUILT on branch `email-auth`, MERGED to `main` + pushed (deploys to Vercel prod),
`tsc`+`lint`+`build` clean.** Login now offers "Continue with Google" *and* an
email + password form (sign-in / create-account toggle), plus a full
password-reset flow. Email confirmation is ON via `app/auth/confirm` (accepts both
token-hash and default `code` links). No schema change. Full detail in
`progress-tracker.md`.

**✅ Email auth delivery is now WIRED (2026-07-02):** Resend custom SMTP is set up
(dedicated sending subdomain `send.trackdco.app` verified — DKIM/SPF/DMARC at
Porkbun, separate from the root Google Workspace MX), the *Confirm signup* +
*Reset password* templates are on the token-hash form, and Site URL / redirect
allow-list are set. Verified end-to-end on prod: a `+alias` signup delivered the
email and the link confirmed + logged in cleanly (fixing the earlier post-click
`exchangeCodeForSession` error for links opened outside the signup browser).

**▶ Remaining founder steps:**
1. **Merge PR `fix/email-auth-onboarding`** (clearer "already registered" message +
   non-Safari-iOS install guidance), then do one device test: open a confirmation
   email so it lands in **Chrome on iPhone** → the install popup should now show the
   **"Open in Safari"** card with a copy-link button, not the dead-end Share steps.
   (Test on the PR's Vercel **preview URL** first, then again on prod after merge.)
2. **Recommended hardening** → Supabase → Authentication → Providers → Email: turn on
   **leaked-password protection** (HaveIBeenPwned) + **min length ≥ 8** (the app
   enforces 8 too).
3. **Reset-password pass on prod:** "Forgot your password?" → reset link →
   `/reset-password` → sign in with the new password.

**2026-06-24 (Adrian + Claude): amounts on CUSTOM vials + Protocol "more" menu +
splash box softened — BUILT, `tsc`+`lint` clean; `custom_protocol_compounds`
migration APPLIED LIVE + verified; NOT committed/deployed.** Custom "Make your own"
compounds can now carry vials + stock runway (pulled into beta scope), the Protocol
compound rows got the dashboard's edit/archive/delete sheet, and the splash clip's
hard "box" edge is feathered into the black. Full detail in `progress-tracker.md`.

**▶ How to test (then PR → CodeRabbit → merge):**
1. **Custom vial — inline:** Add a custom compound via "Make your own" → on the Add
   sheet use "Got a vial? Log how much you have left" → save. Open Protocol → Stock →
   the custom appears by its REAL name (not "Compound") with a fullness bar + runway.
2. **Custom vial — Stock tab:** For a custom already in your stack, Protocol → Stock →
   Add stock → pick the custom in the Compound dropdown → save (no "not available yet"
   error any more). Log a dose against it on Home → the vial's "stock left" decrements
   (runway from `v_inventory_math`). Refill/edit/archive the vial all work like catalogue.
3. **No duplicates:** the custom should show ONCE on Home/Plan (the Postgres pull skips
   custom rows; device-local renders it). Reinstall/relaunch → still one, vial intact.
4. **Protocol "more" menu:** Protocol → Compounds → tap a row or its "⋯" → the detail
   sheet opens with **Edit dose & schedule** + **More → Stop logging / Delete all**.
   Archive one → it leaves the Plan AND the Home dashboard (same stores).
5. **Splash:** cold-launch → Kyle floats with a soft circular fade, no visible square box.

**▶ Earlier — 2026-06-24 follow-ups (Adrian + Claude): splash animation + install-popup-once —
BUILT on `fix/splash-anim-and-install-once`, `tsc`+`lint` clean; `pwa_install_state`
migration applied LIVE.** After PR #34 merged, Adrian reported the splash showed only
a static image (no animation) and the popup should show once-per-account / only when
not already installed. Fixes (full detail in `progress-tracker.md`): splash now lets
the clip ANIMATE (fade on play-through/`ended`, not a 1.4s cut) + SW serves the video
network-first; the install popup is server-backed (`profiles.pwa_installed_at` /
`install_prompt_dismissed_at`, recorded by `PwaInstallTracker` on a standalone launch)
so it shows once per account and never once installed; popup copy is now Share → View
more → Add to Home Screen. **Dup fix verified** (constraint rejects a duplicate insert;
live data clean).

**▶ How to test (then PR → CodeRabbit → merge):**
1. **Splash animation:** open the app ONLINE once so the new `sw.js` activates, then
   cold-launch → Kyle should visibly ANIMATE (~2.8s) then crossfade in. If it still
   shows only the static image, the clip isn't autoplaying — tell me. Airplane-mode
   relaunch → still plays (precached).
2. **Install popup once:** new iPhone-in-Safari account → popup shows once; dismiss →
   never again (even after logout/login, different device). Add to Home Screen + open
   it from there once → the popup is suppressed for good (we record the standalone
   launch). Profile → "Add to Home Screen" still re-opens the visuals any time.
3. Prod `build` is deferred locally (dev server running) — Vercel will build on the PR.

**▶ Earlier — PR #34 (MERGED to prod, 2026-06-24):** the first cut of all three —
the duplicate-compound DB guards + read/merge de-dupe, the initial splash speed-up +
SW precache, and the first install popup + Profile row. This follow-up branch supersedes
the splash + popup bits with the fixes above; the duplicate-compound work shipped in #34
and is unchanged here.

**▶ Earlier focus (still open):**

**Stock — part-used vials ("How much is in it?") — BUILT + migration APPLIED LIVE;
`tsc`+`lint`+prod `build` clean. Shipping via PR.** Lets a vial start part-used
instead of assuming full (Option A, Adrian's pick), on BOTH add-stock paths (Stock
tab + inline "Got a vial?"). Files: `supabase/protocol/002_inventory_partial_fill.sql`
(applied as `inventory_partial_fill`, verified), `lib/protocol/vialFill.ts` (shared
`resolveFill`), `lib/db/inventory.ts`, `components/protocol/AddStockSheet.tsx`,
`components/home/AddCompoundSheet.tsx`, preview mock, docs. Full detail in
`progress-tracker.md`. **Remaining:**
1. **Smoke-test once deployed:** add a half vial on both paths → fullness bar shows
   ~50%, doses-remaining / runway halve; log a dose → decrements from the part level.
2. Merge the PR to deploy the UI (the DB change is already live + backward-compatible).

**Latest — 2026-06-23 (Adrian + Claude): Spec 14 — Push Notifications, Phase 2
(reminder scheduler), founders-first — BUILT, `tsc`+`lint`+prod `build` clean;
`reminder_scheduling_prefs` migration applied LIVE; shipping in a PR.** Three
reminder jobs (dose reminders / missed-dose nudge / low-stock), once-daily at a
user-set time, with quiet hours, founders-first. Engine in `lib/notifications/`
(pure `reminders.ts` + `runner.ts`), Settings prefs UI
(`components/settings/ReminderSettings.tsx`), and a secured cron route
(`/api/notifications/run`). The Settings **"Send a test notification"** button now
force-sends your REAL reminders (the test harness Adrian asked for). Full detail in
`progress-tracker.md`.

**▶ How to test it (works as soon as this PR deploys — no new secrets needed):**
1. Add some compounds with doses due today on Home (if you haven't), so there's
   something to remind about. Then Settings → Notifications on → **Send a test
   notification** → you should get "Doses due today: …" (or "nothing's due right
   now" if nothing is). Low-stock shows if a vial's runway is within 7 days.
2. Settings → **Reminders** card: toggle the 3 types, set your daily time + quiet
   hours → Save. (These drive the automatic scheduler once it's on.)

**✅ AUTOMATIC scheduler is LIVE + verified end-to-end (2026-06-23).** Adrian set
`SUPABASE_SECRET_KEY` + `CRON_SECRET` in Vercel; I enabled pg_cron/pg_net, granted
`service_role` (it had never been granted — the scheduler 42501'd until
`supabase/grants/002`), and created the `reminder-runner` cron. Confirmed: real run
`sent:1`, cron `succeeded`, route `200`, reminder delivered to Adrian's phone.

**▶ Small follow-ups — all ✅ DONE (verified live 2026-06-26):**
1. ✅ **Cron cadence relaxed** to `*/15 * * * *` (the `reminder-runner` job is `*/15`
   + active — confirmed live via MCP).
2. ✅ **Per-user timezone stored** — captured from the browser (`Intl`) on
   notification opt-in and written to `profiles.timezone` (`lib/push/pushService.ts`
   + `pushActions.ts`); Sydney is only the fallback when none is stored.
3. ✅ **Rollout opened beyond founders** — `FOUNDERS_ONLY = false` in
   `app/api/notifications/run/route.ts` (pages all opted-in users).

**Out of scope still:** per-compound dose TIMES (we store which days a dose is due,
not a time per dose) + the journal/weekly-recap reminders.

---

**Earlier — 2026-06-23 (Adrian + Claude): Spec 14 — Push Notifications, Phase 1
(transport) — BUILT, `tsc`+`lint`+prod `build` clean (34 routes); `notifications_enabled`
migration applied LIVE; NOT committed; ▶ founder deploy + on-device proof PENDING.**
Built `Context/14-push-notifications.md` (full detail in `progress-tracker.md`),
adapting its Vite assumptions to Next.js 16. Most of the schema already existed in the
base schema (`push_subscriptions` + `notification_preferences`); the only new DB is the
master intent flag `profiles.notifications_enabled`. New: the app's first service worker
(`public/sw.js`, push-only, no fetch handler), `lib/push/*` (service + actions),
`components/push/*` (hook + onboarding prime + add-to-home prompt),
`components/settings/NotificationsToggle.tsx` (+ test-send), and the `send-push` Edge
Function (`supabase/functions/send-push/`). VAPID keypair generated (public in `.env.local`,
private in gitignored `.env.vapid`).

**The test now ships with the app** — `sendTestNotification` sends in-app via `web-push`
(Node server action, RLS-scoped to your own devices), so testing rides your normal
`git push → Vercel` flow. **No Supabase function deploy is needed for Phase-1 testing**
(the `send-push` Edge Function is in the repo only for the Phase-2 scheduler).

**▶ To test once we push it (founder steps — Claude can't reach Vercel or a phone):**
1. **Set 4 env vars in Vercel** (Production + Preview), values in **`.env.vapid`** (repo
   root, gitignored):
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY` = the public key (browser; inlined at build)
   - `VAPID_PUBLIC_KEY` = the public key (server)
   - `VAPID_PRIVATE_KEY` = the private key (server — secret, never NEXT_PUBLIC)
   - `VAPID_SUBJECT` = `mailto:notifications@trackdco.app`
2. **Push → Vercel prod deploy** (redeploy **without build cache** so the NEXT_PUBLIC key
   inlines). Note: the same VAPID vars are already in local `.env.local` so it works on
   `npm run dev` too.
3. **On-device test (the spec's proof):** install the PWA, Settings → turn Notifications on
   → **Send a test notification** → confirm it arrives on a physical **Android** device AND
   an **installed iPhone** PWA; tapping it opens/focuses the app. Then toggle off and
   confirm the subscription row is gone (an expired endpoint is pruned on send).
4. **Phase 2 only (later):** to let the reminder scheduler push to arbitrary users, deploy
   `supabase/functions/send-push` and set the same VAPID values as Supabase secrets. Not
   needed now.
5. Once proven: commit → PR → CodeRabbit → merge. After it's all live, `.env.vapid` can be
   deleted.
   **NOTE: I stopped your `next dev` server to run the prod build — restart it (`npm run dev`).**

---

**Latest — 2026-06-22 (Adrian + Claude): Spec 13 — extra final touches (5 perf + 5
protection) — BUILT, `tsc`+`lint`+prod `build` clean (34 routes); ▶ on-device QA PENDING;
NOT committed.** Worked `Context/Feature Specs/13-extra-final-touches.md` one prompt at a time
(full detail in `progress-tracker.md`). Real code changes: P1 compression made explicit
(already br/gzip live), P2 the device→Postgres **migration backfill now batches** into one
round-trip (`pushProtocolBatch` + chunked multi-row upserts), P3 a **timeout + circuit
breaker** (`lib/resilience/circuitBreaker.ts`) guards the awaited Supabase hydration pulls,
P4 the **weight log is now optimistic** (`useOptimistic` add/edit/delete + rollback), P5 the
**legal pages are ISR** (cookieless cached read), S5 **baseline security headers** in
`next.config.ts`. The other three security audits — **S1 ORM injection, S2 over-exposed
fields, S3 SSRF, S4 stored XSS** — came back **clean with evidence** (no change; the
RLS/Server-Component/parameterized-PostgREST/React-escaping architecture already closes them).

**▶ Next for this lane:**
1. **Prod `build` — DONE this session** (`tsc`+`lint`+`build` clean, 34 routes; dev server
   stopped first). Build surfaced that the legal pages are `ƒ` (dynamic), not static ISR —
   the root layout's session-cookie read taints the whole tree dynamic; the legal **content
   read** is still cached via `unstable_cache` (the real P5 win). Fixed: segment `revalidate`
   must be a literal, not an imported const. **NOTE: I stopped your `next dev` server to build
   — restart it (`npm run dev`) when you resume.**
2. **Adrian on-device QA:** weight log feels instant (add/edit/delete), and a forced failure
   rolls back + shows an error; legal pages render; Home still hydrates from Postgres; nothing
   regressed on the dose/compound loop.
3. Then commit → PR → CodeRabbit → merge (prod deploy). No migration/DB change in this batch.

**Earlier — 2026-06-18 (Adrian + Claude): quick-track popup + blend-overlap note — ✅ MERGED to
`main` (prod) as PR #16 (squash); `tsc`+`lint`+prod `build` clean; CodeRabbit's 6 findings
triaged (3 valid fixed, 3 skipped — see `progress-tracker.md`).**
Two home/logging changes (details in `progress-tracker.md`):
- **Plus-menu "Log a dose" → in-place quick popup** ([QuickTrackSheet]) instead of routing
  to `/dashboard`: "What would you like to track?". **Reworked 2026-06-18** (after Adrian's
  feedback) to mirror the dashboard Today's Log exactly — tap a dose → the same `LogDoseSheet`
  (confirm/edit amount·time·site → Track); tap a filled tick to un-log; doses grouped by
  category. (Superseded the original batch "tick several → one Confirm" model.)
- **Blends (Glow/KLOW/Wolverine) = single combined items** + a non-blocking amber **overlap
  heads-up** in the Add-to-log sheet ([lib/compound-blends.ts] + [AddCompoundSheet]).

**▶ Next for this lane:**
1. **Adrian QAs on prod** (already live): plus → **Log a dose** → popup lists today's doses;
   tick a few → Confirm → "Tracked"; back on `/dashboard` those rows read as logged + rotation
   advanced; already-logged doses show "Logged". Then add **BPC-157** while you track **Glow**
   (or vice versa) → the amber overlap note shows; add still works.
2. Optional polish (parked): pre-tick all unlogged due in the popup for one-tap confirm; a
   subtle inline overlap hint on the Add-to-Stack browse rows (not just the Add sheet).

   NOTE: the `feat(protocol)` Stock form-picker tweak rode in on PR #16 too (it was sitting
   uncommitted in the working tree) — so it's now on prod as well.

**Latest — 2026-06-17 (Adrian + Claude): PROTOCOL CUTOVER — STEPS 1–5 ✅ BUILT.**
`tsc`+`lint`+prod `build` clean (33 routes); live-schema round-trips MCP-verified (rolled
back, 0 rows); **NOT committed; ▶ Adrian's on-device QA pending.** All 5 steps of
`Context/Feature Specs/11-protocol-page.md` cut Home over to the canonical
`cycles → protocol_compounds → dose_logs` Postgres model, built the Protocol screen, and
built the Stock view including the dose→inventory link.
Adrian approved the design calls (spec-vs-schema/scope conflicts): **(Q1) add rotation
columns**; **(Q2) catalogue-only migration, customs stay device-local + Home merges them**;
**(Step 4) consolidate Cycles + My Protocol into one tab** (the spec's "confirm with Angus"
— Adrian gave the go-ahead as co-founder).
- **Step 1 — data + sync layer:** `lib/db/{cycles,protocolCompounds,doseLogs,compounds,types}.ts`
  (`"use server"`, RLS-scoped, never the service role), `lib/sync/{cache,syncEngine}.ts`
  (offline cache + outbox; Step-1 scaffolding), dev harness `/preview/db-sync` (404 in prod;
  **throwaway — delete before the cutover settles**).
- **Step 2 — migration** (`lib/migration/migrateDeviceState.ts`): one-time, **idempotent**,
  marker-guarded backfill (local ∪ jsonb mirror → Postgres). Catalogue only; customs →
  `skippedCustom`, left device-local. Schema delta `protocol_compound_rotation` (applied live):
  `protocol_compounds.rotation_sites text[]` + `rotation_index`.
- **Step 3 — Home flip (no component changes):** the device stores became a **cache over
  Postgres**. `lib/home/protocolSync.ts` (`"use server"`) is the single adapter (catalogue
  name⇄id, stable `protocol_compounds.id`, pull-with-join + writes); `stack.ts`/`doseLog.ts`
  mutators **dual-write** Postgres; `useCloudHydration.ts` migrates-once then **hydrates from
  Postgres**, merging device-local customs. `HomeScreen`/`TodaysCycleCard`/`AddCompoundSheet`
  untouched. `architecture.md` storage model updated (Postgres now canonical).
- **Step 4 — Protocol screen + Plan view:** `app/(app)/protocol/page.tsx` →
  `components/protocol/{ProtocolScreen,PlanView,CycleHeader,CycleEditSheet}.tsx` +
  `lib/protocol/cycle.ts`. ONE tab, in-page **Plan / Stock** toggle (Stock = the Step 5
  view). Plan = active-cycle header ("Week X of N") + compound list (reusing the Home row
  treatment, non-logging) + add (existing Add-to-Stack flow) + edit (`AddCompoundSheet`) + a
  cycle-edit sheet (`updateCycle`). Labels "Plan"/"Cycle", never "protocol". Amber restraint.
  **Look without signing in: `/preview/protocol`** (mock data).
- **Cycle goals — prototyped then REMOVED** (Adrian's call): goals belong in **Progress**
  (track against them there), not Protocol. Fully deleted (migration reverted, no trace);
  revisit in a later version.
- **Step 5 — Stock view + "stock left":** `lib/db/inventory.ts` +
  `components/protocol/{StockView,StockItemCard,AddStockSheet}.tsx`, wired into the Stock
  toggle. Lists `inventory_items` with remaining / ~doses / runs-dry **read only from
  `v_inventory_math`** (neutral, no good/bad colour); add-stock branches the 3-way type
  union; refill = new row; archive ≠ delete. Mock runway shows in `/preview/protocol`.

**▶ Next for this lane:**
1. **Adrian QAs Steps 1–5** (nothing pushed yet — test first). Sign in locally:
   - **Cutover (1–3):** open **`/preview/protocol-test`** (cache vs Postgres side by side) —
     Add → both sides; Log → `dose_logs` row + rotation advances; **Clear local → Hydrate**
     restores from Postgres; a **Custom** stays local-only. Then `/dashboard` looks/behaves
     identically.
   - **Protocol screen (4):** look at **`/preview/protocol`** (mock data, no sign-in), or the
     real **`/protocol`** — Plan/Stock toggle; set up a cycle (name + start + length →
     "Week X of N"); Add a compound (appears on Home too); tap a row → edit. One bottom tab.
   - **Stock (5):** the Stock tab lists inventory with **"X left · ~N doses · runs dry …"**
     from `v_inventory_math`; Add stock (try all 3 types — reconstituted powder is in mg/iu),
     refill, archive. Mock runway shows in `/preview/protocol`; the real `/protocol` is empty
     until you add stock. Then **log a dose on Home** and pick the **"From vial"** option →
     that vial's "stock left" drops (and recovers if you un-log).
   Once happy: fold into the working-tree branch, commit, push. (Throwaway harnesses
   `/preview/protocol-test` + `/preview/db-sync` are dev-only/404 in prod — delete before the
   cutover settles.)
- **Dose→inventory link — DONE** ("connect my vials to the doses"): `LogDoseSheet` has a
  **"From vial"** picker (this compound's compatible vials, default = most recent);
  `pushProtocolDoseLog` sets `dose_logs.inventory_item_id`, so logging decrements that vial's
  runway via `v_inventory_math` (MCP-verified 20→19 doses; unlog restores). **The full
  Protocol Cutover (Steps 1–5) is built — pending Adrian's QA + commit/push.**

**Latest — 2026-06-17 (Angus + Claude): public waitlist + founder dashboard ✅ LIVE on prod.**
`/waitlist` is a public pre-launch email capture (Angus promoting it). Responsive (mobile +
desktop; exempt from the phone-only gate), `?ref=` source tracking, dedupe + honeypot, a dynamic
OG card, and a "Sign in" link for testers. Emails land in an **INSERT-only `waitlist` table —
nobody can read the list via the API**. A founder-only **`/admin`** dashboard (total signups +
by-channel leaderboard + recent) reads it via a founder-scoped SELECT policy (only
`admin@trackdco.app` + `adrianschimizzi1@gmail.com`); `/admin` is self-contained on desktop (its
own Google sign-in, gate-exempt). Both SQL migrations (`supabase/waitlist/001` + `002`) are
**applied + verified live** (anon denied; founder reads). Channel numbers: share
`/waitlist?ref=<channel>` → read the `/admin` leaderboard. Decision: home page unchanged.
**Tidy-up left for Angus:** delete the verification test row — `delete from waitlist where source = 'claude-verify';`

**Latest — 2026-06-13 (Adrian + Claude): Calendar/Home photo follow-ups — COMMITTED
+ MERGED + PUSHED to `main` (prod).** Three founder-requested tweaks after the
Calendar landed: (1) the Calendar **Photos row now shows the day's progress photos**
(thumbnails → deep-link to the gallery; was a reserved stub) — the calendar page
fetches + signs `progress_photos`, a photo-day reads as "logged" with a camera icon;
(2) the **Home progress-photo card is smaller** (`compact` flag caps it at `h-56`;
Progress keeps the big size); (3) the **plus-menu "Calendar" tile routes to
`/calendar`** (was a placeholder). `tsc`+`lint`+prod `build` clean. ▶ Adrian's
on-device QA still to come.

---

**Earlier — 2026-06-13 (Adrian + Claude): CALENDAR screen built + Milligram redesign
(Spec 10) — `tsc`+`lint`+prod `build` clean (27 routes); COMMITTED + MERGED + PUSHED
to `main` (prod) per Adrian (branch `feat/calendar-screen`; direct-merge, no PR —
`gh` unavailable). ▶ Adrian's on-device QA still to come.** The `/calendar` placeholder is
now the real date-first "look back". Built first to spec (month grid + muted dots +
day sheet), then **redesigned to the Milligram format at Adrian's direction** (he
supplied the reference + "switch between things at the top right"). Verified
headlessly at 390 px via the new dev harness **`/preview/calendar`** (404 in prod):
month grid, month/year picker, agenda, legend all render.
- **Entry point (DECISION):** kept the **existing Dashboard-header calendar icon**
  only (Adrian's call); the Progress header was left untouched. No sixth nav tab.
- **Top-right corner:** a Month ⇄ Agenda switcher (+ agenda list) was built then
  **removed at Adrian's direction** ("doesn't do much") — the corner is clean now,
  just the month grid + the "June 2026 ⌄" picker. A per-compound **filter** was
  prototyped + parked (re-addable in one step). The per-compound "Protocol"/
  concentration-curve view from the Milligram flow stays deferred to its own spec.
- **Month grid = adherence RINGS** (`MonthGrid.tsx`, the Milligram "Calendar key"):
  filled white disc = **logged** (dose/journal/weight + tiny type icon), dotted ring
  = **scheduled-unlogged** (past missed + upcoming), regular stroke = **no dose that
  day**, faint stroke = **nothing scheduled** (future / pre-protocol). Selected day
  amber (the only amber); Mon-first; out-of-month dimmed; scheduled-or-not from the
  device stack's cadence (`isDueOn`); health-data-neutral (white/stroke, never
  green/red). A **"June 2026 ⌄" month/year picker** (`MonthYearPicker.tsx`, year
  stepper + month grid) replaces chevrons; footer has **Today** + an **ⓘ** → the
  **Calendar key** legend sheet (`LegendSheet.tsx`).
- **Day detail sheet** (`DayDetailSheet.tsx`, reuses the app bottom-sheet primitive
  + `useSheetDrag`): rows in order **Running → Weight → Markers → Journal → Photos**.
  Weight deep-links to `/weight`; Journal deep-links to **that day's entry editor**
  on `/progress` (small additive extension to `progressAction` — new `journal-open`
  action carrying the date). Photos row is a **reserved/empty stub**. Read-only —
  the Calendar creates/edits nothing.
- **Data (real, user-scoped, read-only):** the page (`app/(app)/calendar/page.tsx`)
  server-fetches weight (`weight_logs`) + journal/markers (`journal_entries` →
  `marker_readings` → `user_markers` → `markers`, same stitch as Progress) keyed by
  day; `CalendarScreen` adds the device-local **dose-log + stack** read
  (`lib/home/doseLog` + `stack`) for "Running" + the ring states, after mount (SSR
  stays deterministic).
- **FLAGS reconciled (per Spec 10's "FLAG, don't guess"):** (1) the spec proposed a
  Progress-header entry point but one already existed on the Dashboard header →
  kept Dashboard (Adrian). (2) There is **no cycle/protocol date-range model** yet
  (only the device stack's per-compound start date + cadence, no end date) → the
  **"Running" row shows only what was actually logged that day** (Adrian's call); a
  day reads as "logged" if a dose/journal/weight is present, and "scheduled" from
  cadence. When the normalised cycles/`protocol_compounds` model lands, revisit to
  use true date-ranges (and it unlocks the deferred per-compound Protocol view).

**Next:** Adrian QAs on device — `/preview/calendar` for the visual, and the real
`/calendar` signed-in (page months via the picker, tap days, rings match real data,
Weight + Journal deep-links land, Photos stays a stub) → then fold into the pending
working-tree branch with the other uncommitted work → commit/PR. (Ideas parked: a
per-compound **filter** in the corner; the per-compound **Protocol view** —
adherence ring + concentration curve from the Milligram flow — as its own spec.)

---

**Earlier — 2026-06-13 (Adrian + Claude): Weight graph load-in + weight-log by
month, Profile load-in, Home photos unified, mobile padding pass — BUILT, `tsc`
clean, on the working tree (NOT committed; awaiting Adrian's on-device QA).**
- Weight `/weight` graph now loads in + re-animates on a range change like
  Consistency; the entry log is restacked into scrolled **month sections** (no
  dropdown — "just the months, scroll to see more").
- Profile page now uses staggered per-section `animate-home-up` (was a single
  whole-page fade), matching Home + Progress.
- Home progress-photos now render the **same `ProgressPhotoSection`** as the
  Progress tab inline — tapping opens the gallery directly, no route-then-hunt.
- Mobile padding/overflow pass: added `min-w-0`/`flex-1`/`truncate`/`shrink-0` on
  value-next-to-control rows app-wide (Weight graph header, photo captions, marker
  rows, recon-calc input, Home Weight header, Journal month rows, Profile link).

**Next:** Adrian QAs on device → if good, run `lint` + prod `build`, then commit +
merge + push to `main` (same flow as the prior polish run). Optional tidy: delete
the now-unused `components/home/ProgressPhotosGlanceCard.tsx`.

**Previously — 2026-06-13 (Adrian + Claude): UI-consistency pass + Home photo peek +
journal-by-month + unified graphs + wired `+`-menu Journal/Blood work — BUILT,
`tsc`+`lint`+prod `build` clean (27 routes), COMMITTED + MERGED + PUSHED to `main`
(prod) per Adrian.** A run of founder-directed polish:
- **One card system (Home + Progress).** Every section/glance-card **title** now
  uses the display serif in white via a new shared **`CARD_TITLE`** preset
  (`lib/ui-presets.ts`), matching "Today's Log" / the greeting; every card **icon**
  is the amber **`CARD_ICON_BADGE`** (the Reconstitution Calculator's white circle
  → amber; Consistency **gained** an amber `Activity` icon). Documented in
  `ui-context.md` (title rule + icon rule + a new **Charts** section).
- **Home progress-photos peek.** New `ProgressPhotosGlanceCard` — a small,
  non-expandable thumbnail strip of the latest session under the Weight card that
  taps through to `/progress` (kept SEPARATE from Weight, not merged — Adrian's
  call). Dashboard page now fetches + signs the latest 12 photos. Empty = a gentle
  "add your first photo" prompt. Weight card unchanged everywhere.
- **Weight in the Add-photos flow.** The "Add photos" session sheet
  (`AddProgressPhotoSheet`) gained an optional **Weight** field that logs to
  `weight_logs` for the session's date — the mirror of the weight quick-log's
  attach-photos. (`unit` threaded through `ProgressPhotoSection`.)
- **Journal feed by month.** `JournalFeedSheet` now groups entries under **month
  headings** ("June 2026") with an on-brand **month dropdown** to filter to one
  month (`groupJournalByMonth` + `formatMonthLabel` in `lib/progress/journal.ts`).
- **Unified graphs.** Consistency is now a **line + downward gradient** (was a bar
  chart); rest days **hold flat at the previous day's value** (carry-forward, not a
  slope), scrubber still says "Rest day". The Weight graph's trend fill switched to
  the same thick→thin gradient, so both graphs match. (`ui-context.md` → Charts.)
- **`+`-menu Journal + Blood work wired.** Tapping **Journal** in the plus menu now
  goes to Progress and opens the journal compose (Write / Markers → saves to the
  journal); **Blood work** opens the bloodwork gallery (view recent + add). Via a
  tiny client signal (`lib/progress/progressAction.ts` + `useProgressAction`); only
  **Calendar** is still a placeholder (building it next).

**▶ Next:** Adrian QAs on-device (Home peek with real photos → taps to Progress;
add-photos-with-weight; journal month dropdown; both graphs; the plus-menu Journal +
Blood work). Then: build the **Calendar** section.

---

**Earlier — 2026-06-13 (Adrian + Claude): the PROGRESS TAB is built end-to-end —
committed, PR'd to `main`, merging.** Full Spec-09 screen + founder-directed
evolutions: Title → Weight (summary hero → `/weight`) → **Progress photos**
(MacroFactor month/day gallery, swipeable card, before/after compare, searchable
pose catalogue + custom, weight linked by date, capture also embedded in the
weight quick-log) → **Bloodwork** (a dated photo store over `lab_panels` + the
`bloodwork` bucket, with a note) → **Journal** (one entry/day, Write/Markers, the
marker dialer reading the real catalogue, read/edit/delete) → **Consistency** (a
scrubbable adherence bar graph from the device-local dose data). New DB:
`progress_photos` table + private `progress-photos` bucket (live; tracked in
`supabase/progress/`) → **23 tables**. `tsc`+`lint`+prod `build` clean (27 routes);
write paths MCP-verified. **▶ Next:** address CodeRabbit's PR findings; then
Adrian's on-device QA of the real signed-in flow (upload a photo from the weight
log → see it under the right pose with the day's weight). Still deferred: the
per-cycle consistency breakdown (waits on the cycles/`dose_logs` model).

---

**Latest — 2026-06-12 (Adrian + Claude): Desktop interstitial — phone-only gate, committed +
PR'd.** Replaced the plain desktop "mobile only" notice with a polished `DesktopInterstitial`
(`components/pwa/desktop-interstitial.tsx`): at ≥1024px the whole app shell is hidden and the
user gets a "go to your phone" page with a **real scannable QR** to `trackdco.app`
(`qrcode.react`). **Global** — even signed-in users are gated (a separate basic "Welcome back"
variant). Decorative cards mirror real Trackd UI (Weight / Inventory "runs dry" / Today's log).
CSS-width gate via a small client `DesktopGate` that exempts dev-only `/preview/*`; variant from
the verified session via a new request-cached `getCurrentUser`. Dev previews:
`/preview/desktop` + `/preview/desktop-returning`. `tsc`+`lint`+prod `build` clean (26 routes).
**▶ Next:** Adrian **scans the live QR on his phone** + on-device QA → merge the PR.

---

**Earlier — 2026-06-12 (Adrian + Claude): Home greeting + today's-completion line — built,
`tsc`+`lint` clean, ▶ pending Adrian's QA/sign-off.** Added a time-of-day greeting
("Good morning/afternoon/evening, {firstName}") + a slim "N of M logged today" progress
bar to the Dashboard, placed **under the week strip**, above Today's Log (Adrian's
placement + "slim bar + text" pick). New `components/home/HomeGreeting.tsx` (device-clock
part-of-day, mounted-gated + 1-min/focus refresh); completion is **always TODAY** (active
stack due today vs logged today), computed in `HomeScreen`; `firstName` from Google auth
metadata via the dashboard page (`preview/home` → "Adrian"). Serif greeting + amber bar,
on `ui-context` tokens. Also added a **calendar shortcut** — a `CalendarDays` icon inline
right of the "Dashboard" heading (via a new optional `action` slot on `PageScrollTitle`) →
new `/calendar` route, currently an honest **"Coming soon"** placeholder until the real month
view is built. **▶ Next:** Adrian QAs on-device → fold into the pending home/weight branch/PR
(not committed yet); **build the real Calendar** (dose history + schedule month grid) later.

---

**Earlier — 2026-06-12 (Adrian + Claude): Spec 07 (Weight Scale/Trend + last-paragraph asks)
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
  delete, Profile → Archive). **✅ Compounds now survive reinstall (2026-06-12)** — the
  stack / dose-log / custom-compound stores are **cloud-backed to Supabase** (interim
  `device_state_sync` tables; `localStorage` stays the offline read path). `tsc`+`lint`+
  `build` clean, RLS MCP-verified. **▶ Pending:** Adrian's on-device QA (add a compound →
  delete + reinstall → confirm restored) + commit/PR. **▶ Next (still):** the *eventual*
  normalised migration to **Postgres cycles / `protocol_compounds` / inventory** (data
  model already applied), with inventory maths read from `v_inventory_math` (never stored)
  — the cloud-backup is an interim stepping stone, not that end-state; then the
  reconstitution calculator + the dose-edit-and-reflow checkpoint. (Also still pending: an
  on-device check of the iOS cold-launch nav-strip fix after a clean reinstall.)
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
