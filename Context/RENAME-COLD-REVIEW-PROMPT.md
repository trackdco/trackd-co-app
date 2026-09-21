# Cold review prompt — the Trakabl rename

Paste everything below the line into a **new chat**, in this repo, on branch `rename`.

---

You are doing a **cold review** of a product rename. Assume nothing from any previous conversation; the people who did this work are not available and their reasoning is not in front of you except where it is written in the code.

The product was called **Trackd Co** and is now called **Trakabl** (T-R-A-K-A-B-L — seven letters, no "c", no trailing "e"; the wordmark reads "Trakabl." with an amber full stop). The rename landed across ~150 files on branch `rename`. Your job is to find **everything it missed**, and separately, **everything it broke**.

Work in `/Users/adrianschimizzi/Documents/GitHub/trackd-rename-wt` (a worktree on branch `rename`), not the main checkout.

## What you are looking for

Three classes of defect, in priority order:

1. **A user can still see the old name.** Rendered copy, page titles, alt text, `aria-label`, notification titles, PWA manifest fields, email bodies, OG images, legal text a user reads, anything drawn into an image or video.
2. **The rename broke something.** A sweep of 812 occurrences across 151 files touched a lot of prose. Look for sentences that now read wrongly — a contrast collapsed into repetition ("Thank you for choosing Trakabl! We built Trakabl…"), a comment that now asserts something false, a doc-comment whose example no longer matches the code, a test name that no longer describes its test.
3. **The rename touched something it should not have.** See the allowlist below. An edit to any of those is a defect, and some of them are serious.

## ⚠️ The allowlist — these keep the old name ON PURPOSE

**Do not report these as misses.** If you find one that was *changed*, that is a defect — report it loudly.

**The company was not renamed.** Trakabl is a registered business name; the legal entity is still **Trackd Co Pty Ltd** (ACN 698 405 462, ABN 35 698 405 462). Anywhere the *entity* is the subject — legal document preambles, merchant-of-record lines, the landing footer, `LEGAL_ENTITY` in `lib/brand.ts` — it must still say Trackd Co Pty Ltd. A sweep that renamed the entity would make the legal documents name a company that does not exist.

**The consent record.** `HEALTH_CONSENT` in `lib/legal/consentCopy.ts` still reads "I explicitly consent to **Trackd** processing my health-related data…". 81 accounts granted Article 9 health-data consent against those exact words. The string is the *record of what they agreed to*, not a label. The file says in terms that changing it is "a re-signing, not an edit".

**One signed sentence, deliberately.** `lib/billing/signed/grace-ending.txt` and the matching `thanks` in `lib/billing/noticeCopy.ts` still read "Thank you for helping make **Trackd Co** what it has become today." Past tense, addressed to the beta cohort, about the thing they helped build — which *was* called Trackd Co. The other four signed sentences *were* re-signed. If you think this is wrong, argue it; do not assume it was an oversight, the reasoning is in `noticeCopy.ts`.

**Every storage key, cookie name and metadata key.** `trackd.*`, `trackd:*`, `trackd-*`, `trackd_*` — localStorage namespaces, cookie names (`trackd_beta_notice_seen`, `trackd_grace_notice_seen`), Stripe subscription metadata (`trackd_grace_until`, `trackd_courtesy_until`, `trackd_save_offer_shown_at`, `trackd_save_offer_claimed_at`, `trackd_card_update_retry_pm`, `trackd_trial_notice_dismissed`), service-worker cache names, notification `tag` values. **Renaming any of these does not migrate it — it orphans it.** A renamed cookie re-shows a dismissed notice to everyone; renamed Stripe metadata breaks reconciliation and grace for every live subscriber; renamed localStorage keys reset every device preference.
- One exception exists and is correct: the *new* cookie `trakabl_rebrand_notice_seen` uses the new name because nothing holds it yet. Mixed prefixes across the three notice cookies is the intended outcome.

**`sw.js`'s `SPLASH_CACHE_PREFIXES` must keep `"trackd-splash-"`** alongside the new prefix. Devices installed before the rename still hold a `trackd-splash-*` cache; if that prefix stops matching, the cache is never pruned and the old splash leaks permanently.

**The domain.** `trackdco.app` and every `@trackdco.app` address are still live and correct — the new domain has not been bought. `PRODUCTION_ORIGIN` / `PRODUCTION_HOST` in `lib/brand.ts` are the single swap point. Report it if the domain is hardcoded *anywhere new* instead of imported from there.

**File and directory paths.** `public/trackd-wordmark.png` (its *bytes* are the new logo; only the filename is old), `scripts/brand/trackd-wordmark.src.png`, `supabase/trackd_schema_v0_4_2.sql`, `supabase/trackd_storage_policies.sql`, the repo folder `trackd-co-app`, `package.json`'s name. Renaming these breaks 24+ references and buys nothing a user sees.

**`public/legacy-wordmark.png` is *supposed* to be the old logo.** It is the pre-rename mark, kept so the rebrand notice can show the thing that is leaving. Do not report its contents.

**`trackd-qa.invalid`** — the test-fixture email domain, wired to seeded Supabase accounts. Renaming means re-seeding.

**Applied SQL migrations in `supabase/`.** These already ran against production. Their text is history. Only flag one if it *seeds content a user reads today* and that content still says Trackd — the legal document seeds are worth checking against what is actually live in the DB.

**Historical references in comments and `Context/` docs** that describe past decisions ("Trackd.co was retired", "this is what the beta cohort saw") are correct as history. Only flag a comment if it now describes *current* behaviour wrongly.

## Already known — confirm, don't rediscover

These were found and are **not fixed**. Verify they are still true and assess severity; do not spend your budget re-finding them:

1. **23 install-walkthrough frames are baked screenshots of the old app** — `public/onboarding/install/` (ios-safari, ios-chrome, android-chrome, android-samsung, android-firefox). The share sheet reads "Trackd / trackdco.app", the home-screen label reads "Trackd", the page behind renders the retired serif wordmark. The captions above them now say Trakabl. `lib/onboarding/platform.ts` says "Check the name, then tap Add" over a frame whose name field reads Trackd. No generator exists in the repo; they need re-rendering at exactly 750×1625 (hardcoded in `install-walkthrough.tsx`). `/preview/install/walkthrough` steps through all five flows.
2. **The onboarding hero video shows the old wordmark** — `public/onboarding/app-preview.mov`, `.webm`, and `app-preview-end.webp`, mounted on the free-trial screen (`free.tsx`). Baked in; needs recapture. **Also check `components/onboarding/app-carousel.tsx`**, which ships `/preview` captures under the same risk and was flagged but never verified.
3. **Stripe's statement descriptor still says the old name** — dashboard config, not in this repo. Out of scope for you; it is on the owner's list.

## ⚠️ Two environment traps that will waste your time

**This repo is on iCloud Drive, and files are evicted to dataless placeholders.** `ls` and `wc -c` report the real size (they seek), but `readFileSync`/`cat` return **zero bytes**. This made six tests fail spuriously with `expected '' to contain …`. If a test fails because a source document is empty, or `git` reports "pack … is far too short to be a packfile", the fix is `brctl download <file>` **per file** — it does not work on a directory, and plain `cat` does not trigger it. Materialise before concluding anything is broken.

**`npm run dev` fails in this worktree** (Turbopack rejects the `node_modules` symlink). Use `npx next dev --webpack -H 127.0.0.1 -p 3100`. The machine is slow — run one server at a time and stop it when done.

## How to review

Be adversarial and concrete. For every finding give: the file and line, what a user would actually see or what would actually break, and how sure you are. **Verify before reporting** — read the surrounding code, and where a claim is about rendered output or a test result, run it rather than reasoning about it. Distinguish "a user sees this" from "a developer sees this in a comment"; both are worth reporting but they are not the same severity.

Search widely, not just for the literal word: the old name appears as `Trackd`, `trackd`, `TRACKD`, `Trackd Co`, `trackd co`, `trackd-`, `trackd_`, `trackd.`, `trackdco`, and inside identifiers like `TrackdIcon`, `TrackdApp`, `withoutTrackd`. Check `.tsx`, `.ts`, `.css`, `.sql`, `.json`, `.txt`, `.md`, `.mjs`, `.mov`/`.webm`/`.png`/`.jpg` (contents, not just names), and the PWA manifest and service worker.

Also check the **new** code this rename added, on its own merits:
- `lib/rebrand/rebrandNotice.ts` and `components/rebrand/RebrandNotice.tsx` — the once-ever notice shown only to pre-rename accounts. Is the gate right? Can it show twice, show to a new signup, or stack with a billing modal? Is `RENAME_SHIPPED_AT` still a placeholder that needs setting to the real deploy time?
- `components/landing/ArrivalNotice.tsx` — the header capsule for visitors redirected from the old domain. Does it cause layout shift? Does it survive private mode? Does it leak into the canonical URL?
- The `prefers-reduced-motion` handling in `app/globals.css` for `.animate-rebrand-*` — an animation that ends at a clipped state must be pinned to its end state, not merely have `animation: none`, or it strands the wrong wordmark visible.

Report findings most-severe first. If you find nothing in a category, say so plainly rather than padding.
