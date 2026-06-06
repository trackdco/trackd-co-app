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

Data model is **built and verified** on the live Supabase project ✅. Now wire
the Next.js app to Supabase (clients, env, Vercel deploy). Adrian works the
**parallel track** below in the meantime — no dependency on the build.

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

### ▶ NOW — Point the domain

Point **`app.trackdco.app`** at the deploy: Vercel project → Settings → Domains →
add `app.trackdco.app`, then add the CNAME it gives you at the `trackdco.app` DNS
host. Wait for SSL to provision.
- ✅ Checkpoint (target 7 Jun): Supabase live, schema applied, deploy proven.

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

### ▶ Compile the seed catalogues

The schema creates empty reference tables; we have to supply their contents.
Build these as Google Sheets now so they drop straight into seeding later. This
is on the critical path — add-compound (Week 2) and bloodwork (Week 3) need them.

**Sheet 1 — Compounds** (every substance in the v1 library). Columns:

| column | values / notes |
|--------|----------------|
| name | e.g. "Testosterone Enanthate" |
| category | one of: `anabolic`, `oral`, `peptide`, `ancillary`, `supplement` |
| default_unit | one of: `mg`, `mcg`, `iu`, `ml`, `tab`, `capsule` |
| default_route | one of: `po`, `subq`, `im`, `nasal`, `topical` |
| default_inventory_type | one of: `preconcentrated` (oils), `oral_solid` (tabs/caps), `reconstituted` (powders) |
| aliases | comma-separated, e.g. "Test E, TestE" |
| half_life_hours | number (optional; leave blank if unknown) |

**Sheet 2 — Biomarkers** (blood markers a user can log). Columns:

| column | values / notes |
|--------|----------------|
| name | e.g. "Total Testosterone" |
| category | one of: `hormones`, `lipids`, `liver`, `kidney`, `blood_count`, `metabolic`, `thyroid`, `other` |
| canonical_unit | SI unit, e.g. "nmol/L" |
| alt_unit | e.g. "ng/dL" (optional) |
| alt_unit_factor | number: canonical × factor = alt (optional) |
| ref_low_male / ref_high_male | standard male reference range |
| ref_low_female / ref_high_female | standard female reference range |
| aliases | comma-separated, e.g. "Test, TT" |

*(The third catalogue, `markers` — subjective progress tracking: mood, libido,
sleep, pumps, etc. — will get its own sheet spec once Claude has read that
section of the schema, so the columns are exact rather than guessed.)*

### ⏭ Or — Legal / disclaimer copy

The schema stores `tos_version` + `tos_accepted_at` but the actual text doesn't
exist yet. Draft the **Terms of Service, privacy policy, and medical
disclaimer** — important for a harm-reduction app, and fully non-technical.

---

## 🗂️ Backlog (not yet scheduled — pull up here when the above is done)

- **Seed the catalogues into the DB** — load the finished Compounds/Biomarkers/
  Markers sheets via the SQL Editor or a service-role script (these tables are
  service-role-write-only by design). Needs the sheets done + schema applied.
- **Week 1 exit — auth screens:** build signup → 18+ gate → login → empty
  dashboard on the live URL. Test signup HARD with a brand-new account (the
  auto-profile trigger is the one place a failure blocks all signups).
  ✅ Checkpoint (target 11 Jun): full flow works on both founders' phones.
- **Beta prep:** line up 10–15 testers (target 28 Jun).
