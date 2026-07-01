# Next Tasks


The **windscreen** — only the immediate + upcoming work. History lives in
`progress-tracker.md`; the long-range roadmap doesn't belong here. When a task
ships: log it in `progress-tracker.md`, then delete it here.

Last updated: 2026-06-26

---

## ▶ Stripe subscriptions — finish & test (`stripe` branch, NOT merged)

Code is BUILT: webhook, checkout + portal actions, `subscriptions` table (applied
live), gated `/billing` + Free/Monthly/Yearly pricing UI, and a dev sample
checkout. To finish:

1. **Test the lifecycle** (Stripe sandbox, card `4242 4242 4242 4242`): sign in →
   `/billing` → start the **annual** 5-day trial → confirm `profiles.tier` flips
   to `'paid'` and a `subscriptions` row appears (`status='trialing'`). Try
   monthly (charges immediately). Then Manage → cancel in the Customer Portal →
   confirm tier returns to `'free'`.
   - Needs locally: `SUPABASE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` (from
     `stripe listen --forward-to localhost:3000/api/stripe/webhook`). Both set.
2. **Two-account RLS check** — a second account must NOT see the first's row.
3. **Replace the placeholder Free tier** once the free/paid split is decided.
4. **MERGE GATE (do NOT skip)** before `main` / public launch:
   (a) flip `profiles.tier` default `'paid'` → `'free'`;
   (b) set LIVE Stripe keys + `STRIPE_WEBHOOK_SECRET` in Vercel + create the prod
   webhook at `https://trackdco.app/api/stripe/webhook`;
   (c) confirm `SUPABASE_SECRET_KEY` is set in Vercel.

---

## ▶ Open follow-ups (small, not blocking)

- **Legal copy (Privacy Policy), pending Adrian's direction:** confirm §7
  backup-retention window; add §9 region-law clause; name Supabase + Vercel
  regions in §5/§10.

---

## ⏭ At launch — legal docs → v1.0

Rule in `architecture.md`. On launch day: set each doc `version='1.0'`,
`is_beta=false`, and `effective_date` + in-body date to the real launch date (then
frozen); rename `supabase/legal/` files to `…-v1.0`. Thereafter bump whole
versions per change. Wire the signup acceptance UI when separately directed.

---

## 🗂️ Backlog (pull up when the above clears)

- **Brand the OAuth domain** (after Supabase Pro): a Supabase Custom Domain
  (`auth.trackdco.app`) so the Google sign-in screen reads as Trackd, not
  `…supabase.co`. Needs Pro ($25/mo) + Custom Domain ($10/mo). Region check done
  (Supabase + Vercel both Sydney). See memory `launch-custom-domain-and-region`.
- **Android richer install card:** add `screenshots` to `app/manifest.ts` for an
  app-store-style install dialog (once there are real screens to shoot).
- **Founding-member tier** (billing) — deferred; design when ready.

---

## How we work

- **One branch per person; land via PR to `main`** — CodeRabbit auto-reviews PRs
  only, and merging a PR to `main` = a Vercel **prod** deploy. (Trivial
  `Context/*.md` edits may go direct.)
- `git pull` before starting and before pushing. Shared files (`app/globals.css`,
  `app/(app)/layout.tsx`, `components/ui/**`, the Context docs) change by agreement.
- Build against the locked design system (`ui-context.md`).
- **Don't run `npm run build` while `next dev` is up** — they share `.next` and
  the build 500s.
