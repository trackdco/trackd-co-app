# Code Standards

## General

- Keep modules small and single-purpose. One screen, one concern, one file.
- Fix root causes; do not layer workarounds. If the schema or an invariant is
  fighting you, fix the spec (see `ai-workflow-rules.md`), not the symptom.
- Never re-implement in TypeScript what the database already enforces (RLS,
  CHECK constraints, the inventory discriminated union, inventory maths). Read
  from the views; trust the constraints. See `architecture.md` Invariants.
- Never store or cache a derived value. Compute on read, every time.

## TypeScript

- Strict mode is on (`tsconfig.json`) — keep it on.
- Avoid `any`. Type Supabase rows from generated types where possible; use
  explicit, narrowly-scoped interfaces otherwise.
- Validate untrusted external input (form data, file uploads, query params) at
  the boundary before any logic runs. Inside the trust boundary, rely on types.
- Use the `@/*` path alias for internal imports (configured in `tsconfig.json`).

## Next.js (App Router, v16)

- **This is Next.js 16, not 14.** APIs and conventions differ from older
  training data. Read the relevant guide in `node_modules/next/dist/docs/`
  before using a Next API you are unsure about. Heed deprecation notices.
- Default to Server Components. Add `"use client"` only when an interaction
  genuinely needs the browser (state, effects, event handlers).
- Mutations go through Server Actions or route handlers — never trust the client
  to enforce ownership; RLS is the backstop, not the only gate.
- Keep data fetching close to where it renders; do not thread data through deep
  prop chains when a Server Component can fetch it directly.

## Styling

- Tailwind CSS v4. Use the CSS-variable design tokens from `ui-context.md` —
  **no hardcoded hex values** outside `app/globals.css`.
- Follow the border-radius and spacing scale defined in `ui-context.md`.
- **Health data is categorical and neutral — never evaluative (architecture
  invariant).** Never apply `--state-error` / `--state-success` /
  `--state-warning`, `--accent-green`, or any red/green/amber colour to a
  biomarker, lab result, or side-effect value to imply it is "bad," "good," or a
  "warning." Present results categorically — below / within / above — using
  neutral surface/text tokens and the neutral-blue chart tokens
  (`--chart-line` / `--chart-fill`). State colours and `--accent-green` are for
  UI/system feedback only (e.g. a failed login, a successful save), never for
  health-data semantics.

## Data Access (Supabase)

### ⚠️ Every hand-applied SQL file opens with a `▶ HOW TO RUN THIS` block

Adrian applies these by pasting into the SQL Editor, and the files are long
enough that "which part do I paste?" is a real question with an expensive wrong
answer — pasting only a section can run nothing at all while still reporting
success. So every file under `supabase/` that a human runs by hand starts with a
block saying, in this order:

1. **"Paste the WHOLE file."** Never a section. Everything that is not a
   statement is a `--` comment and Postgres ignores it, so there is no way to
   paste too much and no decision to make. `supabase/notifications/005` is the
   worked example.
2. **"Success. No rows returned" is the success message.** DDL returns no rows.
   Say so explicitly, because that message is also exactly what running nothing
   looks like.
3. **A CHECK that returns something.** A `select` he can paste afterwards which
   comes back with a row when it worked — the positive signal DDL cannot give
   him — or the name of a script in `scratchpad/` that proves it end to end.
4. **Whether it is idempotent**, so "I'm not sure if I ran it" has the obvious
   answer: run it again.

Write the file idempotent (`create or replace`, `drop … if exists`,
`if not exists`) unless there is a reason not to, and say which in the block.

An `APPLIED` line in a header is a CLAIM, never a record — a hand-applied
migration never appears in `list_migrations`. `grants/004` said "NOT YET
APPLIED" for four days after it was applied and two sessions carried the work as
outstanding. Verify by executing something, then write down what you executed.

### The rest

- All data access goes through the Supabase client. Reads of computed data go
  through the **views** (`v_inventory_math`, `v_biomarker_position`), never by
  recomputing in app code.
- Enforce nothing security-critical in app code alone — RLS is the source of
  truth for access. App-layer checks are UX, not security.
- `compounds` and `biomarkers` are read-only to users. Never write to them from
  the app; seeding is a service-role job.
- **`profiles.tier` is service-role-write-only (Spec 16 — the tier-column lock).**
  The Stripe webhook (service role) is the only **post-signup** writer of
  `profiles.tier` (the `handle_new_user` SECURITY DEFINER trigger still *initializes*
  it — to the enum default — at account creation; a `REVOKE`/grant change must not
  break that path). To make that an enforced fact (not a convention), `authenticated`
  holds **column-level**
  UPDATE + INSERT grants on `profiles` that ENUMERATE every column **except `tier`**
  (`supabase/grants/003_profiles_tier_lock.sql`, Approach A — column privilege,
  chosen over a trigger because nothing in the app writes tier as `authenticated`),
  so a user cannot set their own tier via the Data API (PATCH or upsert). **⚠️ When
  you add ANY new `profiles` column, add it to BOTH grant lists in a new
  `supabase/grants/00N_*` migration, or the Data API will 42501 on writes to that
  column. Leave any new service-only column OUT (same treatment as `tier`).** Gates
  still read `profiles.tier` only (Invariant 7); this changes only WHO may write it.
- Validate and parse input before any mutation. Return consistent, predictable
  shapes from any server action or handler.

## Data and Storage

- Structured data and all relationships live in Postgres.
- Bloodwork files live in Supabase Storage (private `bloodwork` bucket), keyed
  by the `<auth.uid()>/<panel_id>/<file>` path convention. Store the reference
  in Postgres; never the bytes.
- Derived values (remaining, concentration, doses-remaining, projected-empty,
  biomarker position) are never persisted — they live in views.

## File Organization

- `app/` — routes, layouts, server/client components, server actions. The
  logged-in app lives in the `app/(app)/` route group, whose `layout.tsx` is the
  auth + 18+/ToS guard every feature screen sits behind. `app/auth/callback/` is
  the OAuth code-exchange route and `app/auth/confirm/` is the email-OTP verify
  route (signup confirmation + password recovery); `app/welcome/` is the gate;
  `app/login/` is the sign-in screen (Google + email/password, with
  `login/actions.ts` for the email path); `app/forgot-password/` and
  `app/reset-password/` are the password-reset flow.
- `app/globals.css` — global styles and the design tokens. The only place hex
  values may appear.
- `components/` — shared, reusable UI components (`components/ui/**` from
  shadcn — **protected**; plus `components/auth/`, `components/legal/`,
  `components/pwa/`).
- `lib/supabase/` — Supabase client setup (browser + server + the proxy
  `updateSession`).
- `lib/auth.ts` — `getCurrentUser()` (the authoritative, request-`cache()`d
  `getUser()` — one verified auth round-trip per request, shared by every guard and
  the desktop gate) and `getSessionContext()` (wraps it with the 18+/ToS gate check).
- `lib/` — pure helpers and shared types (no React, no side effects).
- `supabase/` — canonical SQL: schema + storage policies + `grants/` (API role
  grants) + `seed/` + `legal/`. **Protected** — see `ai-workflow-rules.md`.
- `Context/` — the spec. Update deliberately, in the same change as the code.
