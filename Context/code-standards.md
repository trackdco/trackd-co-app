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

- All data access goes through the Supabase client. Reads of computed data go
  through the **views** (`v_inventory_math`, `v_biomarker_position`), never by
  recomputing in app code.
- Enforce nothing security-critical in app code alone — RLS is the source of
  truth for access. App-layer checks are UX, not security.
- `compounds` and `biomarkers` are read-only to users. Never write to them from
  the app; seeding is a service-role job.
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
