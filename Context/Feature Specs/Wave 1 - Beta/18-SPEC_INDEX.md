# Trackd — Spec Index & Build Order
*The map. Each row is one spec = one Claude Code chat. Build top-to-bottom; respect dependencies.*
*Grounded in the 2 July audit. NOTE: your 8 June context doc is stale on the numbers — live DB is **27 tables + 3 views / 205 compounds**, not 18+2 / 149. The doc-reconcile spec fixes that.*

---

## Legend
- **ESSENTIAL** — non-negotiable, blocks money or leaks data. Just build it.
- **BUILD** — greenlit, real work, sequence by dependency.
- **DECISION** — a choice, not a spec. Answer it; don't write a doc for it.
- **PRACTICE** — how you work, never a ticket.

---

## Build order

| # | Spec | Type | Depends on | Status |
|---|------|------|-----------|--------|
| 02 | **cycle-id-stamping** | ESSENTIAL | — | ☐ spec ready |
| 03 | **tier-column-lock** | ESSENTIAL | — | ☐ spec ready |
| 04 | **entitlement-gating** | BUILD | 03 | ☐ to generate |
| 05 | **first-signin-tutorial** | BUILD | — | ☐ to generate |
| 06 | **offline-app-shell** | BUILD | — | ☐ to generate |
| 07 | **rls-isolation-test** | BUILD | — | ☐ to generate |
| 08 | **repo-housekeeping** | BUILD | — | ☐ to generate |
| — | Pricing: monthly → $19.99? | DECISION | — | ☐ *no change yet (your call)* |
| — | Founding: annual-only $79? | DECISION | — | ☐ *confirm at Stripe build* |
| — | Stripe + trial-extension save | BUILD (July) | 03, 04 | ☐ July, post-beta signal |

---

## What each one does

**02 · cycle-id-stamping — ESSENTIAL, do first.**
The moat is leaking right now. Only doses/inventory are cycle-tied; journal, bloodwork, markers and weight write with no cycle link (every live row is NULL). Every beta day adds unstamped, permanently-unattributable data. Fix the insert paths. Principle #6.

**03 · tier-column-lock — ESSENTIAL, do before any paywall.**
Any logged-in user can currently set their own `tier = 'paid'` via the Data API. Harmless today, catastrophic the moment the default flips to `free` and gating goes live. Lock the column so the Stripe webhook is genuinely the only writer.

**04 · entitlement-gating — BUILD, after 03.**
The actual first monetisation task. Gate reads `profiles.tier` only (locked pattern), beta-defaults `paid`. Free = 1 active cycle, 14-day journal history, manual bloodwork, basics. Paid = everything else (extra cycles, full history, runway projections, trends, multi-cycle comparison; v1.5 AI bloodwork later). Trial handled later by Stripe status → tier, so the gate stays simple. Flipping the default to `free` is a separate one-line launch-day migration.

**05 · first-signin-tutorial — BUILD.**
Your Week-1 exit is an empty dashboard — the opposite of an aha. A guided walkthrough on **first sign-in only** (add first compound → reconstitution calc → log a dose → watch inventory reflow), dismissible, never shown again. Not a demo/sample cycle — a tutorial over the real empty state, as you asked.

**06 · offline-app-shell — BUILD, confirmed bug.**
You tested it on the plane in aeroplane mode and it failed. The service worker currently caches only the splash video, not the app shell, so a cold offline launch renders nothing. Precache the shell so the installed app boots offline and shows last-cached session data. (Will NOT cache authenticated API responses in the SW — that's a data-leak risk; the localStorage mirror handles offline data.)

**07 · rls-isolation-test — BUILD.**
Turns your one-off manual two-account check into a repeatable script: two test users, every cross-user read attempted (tables + views + storage), build fails if any leak. Repo has zero test infra today, so this also stands up the test runner.

**08 · repo-housekeeping — BUILD.**
Three chores: (a) reconcile the stale docs to 27+3 / 205; (b) fold `waitlist` + its view into a tracked migration (they were applied out-of-band and a clean rebuild wouldn't recreate them); (c) remove the legacy `service_role` key-name fallback. **iCloud repo move is NOT in here — you do that manually (a `git clone` to a non-iCloud path).**

---

## Decisions parked (answer, don't spec)
- **Monthly price → $19.99** (annual stays $119 as a "50% off" anchor)? *You said no change yet.*
- **Founding window annual-only at $79** vs the doc's current "$9.99/mo or $79/yr"? *Confirm when writing Stripe.*
- Re-run the **~400-user breakeven** against whichever mix you lock, before Stripe.

## Practices (never specs — just do them)
- Solution content, not toy content, on your channels.
- Ask beta testers verbatim: *"How would you describe Trackd?"* → bank for launch copy.
- One-line wedge: *"Your whole stack in one place — everyone else makes you use three apps."*
- Position against the enemy: fragmentation + apps that treat you like a patient.
- Resist the "and" — do one thing well.
