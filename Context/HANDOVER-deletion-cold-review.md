# HANDOVER — spec 16 account deletion, ready for cold review

Written 2026-09-05 by the session that built Steps 1 to 7. Everything below is
measured from the repo or from production, not remembered. Where something is
unverified it says so.

---

## YOU ARE THE BUILDER ON TRACKD CO

Trackd Co went free-to-paid on 27 Aug 2026 and is LIVE with ~99 real accounts on a
production Supabase project. The work is on the App Store / Google Play track.
`Context/Feature Specs/Billing Specs/billing-16-account-deletion.md` is the spec.
Read it, plus the seven context files `CLAUDE.md` lists, before touching anything.

### STANDING LAWS — they have not changed

- One session at a time on the branch. **Report if another session is editing the tree.**
- **MIGRATIONS AND PRODUCTION SQL ARE FOUNDER-HAND-APPLIED ONLY.** You write it, Adrian runs it.
- Nobody is charged after being told they would not be, and nobody loses access they were promised.
- **Signed copy is character-for-character sacred. No em dashes in user-facing strings.**
- **Absent is not unknown.** Any read that cannot distinguish "not there" from "I could
  not check" must return the third state rather than defaulting to the permissive answer.
- Cite where a claim lives (`file:line`), never who you think said it.
- **If fixes generate defects twice running, stop rather than fixing forward.**
- Push back with a citation when Adrian is wrong. The default when you push back is that you are correct.
- **DO NOT PUSH TO MAIN. DO NOT MERGE TO MAIN.** Main deploys straight to Vercel production.

---

## THE ONE JOB LEFT

`billing-16-account-deletion.md` §5, final box:

> **⚠️ THE PROJECT IS NOT DONE UNTIL COLD AGENTS COME BACK CLEAN.** Once everything is
> built, run independent cold-agent reviews — one on money and races, one on the gate and
> entitlements, one on the UI at 390x844 — and keep fixing and re-running until no
> CRITICAL and no HIGH findings remain. Low and medium findings unrelated to payments may
> be accepted deliberately and written down. Payments are the strict bar.

Steps 1 to 7 are BUILT, COMMITTED and GREEN. Adrian approved the flow on 2026-09-05 after
reviewing an artifact of it. He has authorised you to continue with the cold reviews.

**Do not rebuild anything. Do not start spec 17. Run the reviews, fix what they find, re-run.**

---

## WHERE THE WORK IS

Branch **`deletion/steps-1-2`**, 12 commits ahead of `origin/main`, **nothing pushed**.

```
af053ee Step 7: drive the deletion, and a defect the drive found
3f4c611 Steps 5 and 6: the deletion screen, with the signed copy
d8ff867 Step 4: the deletion action, in order, failing closed
801d8aa Step 3: the cancel is idempotent, and not for the reason it claimed
128649a Two hardening migrations, written and NOT run
b530684 A bucket that is not there is not a bucket that is empty
a23f449 The fourth call site: the avatar URL joins the shared constant
42d49e6 D114: one deletion flow for everyone, and the trap it accepts
bd14633 Re-sign an image whose URL expired while the tab sat open
b870036 Drive the sweep against real Storage, in its own config
e1dbb7c The storage sweep, and the proof that it can fail
15f7676 One signed-URL lifetime, five minutes, in one place
```

### The files that ARE this feature

| File | What it is |
|---|---|
| `lib/storage/signedUrl.ts` | The one signed-URL TTL, 5 minutes. Step 1. |
| `lib/storage/sweep.ts` + `.test.ts` | The storage sweep. Step 2. Prefix primary, rows secondary, verified by listing. |
| `lib/billing/cancel.ts` | **PRE-EXISTING. Only its doc comment was corrected.** Do not modify `cancelNowForUser`. |
| `lib/billing/cancelNowForUser.test.ts` | Step 3's idempotence proof, against fakes. |
| `lib/account/deleteAccount.ts` + `.test.ts` | Step 4. The four-step orchestrator, `server-only`, steps injectable so each can be broken. |
| `app/(app)/profile/delete-account-action.ts` | Step 4's public action. **ONE export. NO user id.** |
| `lib/auth/adminClient.ts` | Service-role client for auth.admin + cross-schema reads. Answers Q99. |
| `lib/account/deleteCopy.ts` + `signed/delete-account.txt` + `deleteCopyPin.test.ts` | Step 5's eight signed strings, pinned byte for byte. |
| `components/profile/DeleteAccountDialog.tsx` | Step 5's screen. Replaces the deleted `components/auth/delete-account-request.tsx`. |
| `lib/account/openRefundRequest.ts` | Step 6's branch. |
| `test/live/sweep.live.test.ts`, `test/live/deleteAccount.live.test.ts`, `vitest.live.config.ts` | Step 7 and Step 2's live drives. **These write to PRODUCTION.** |
| `lib/media/resignOnExpiry.ts` + `.test.ts`, `components/media/SignedImageRecovery.tsx` | Not part of spec 16. Fixes a regression the 5-minute TTL introduced. |
| `supabase/hardening/002_*.sql`, `003_*.sql` | **WRITTEN, NEVER RUN.** Founder-applied. |

---

## GATES — all green as of 2026-09-05

```
npx tsc --noEmit -p tsconfig.json      # clean
npx eslint <your files>                # clean
npx vitest run                         # 95 files, 1992 tests, all passing
npm run gate:check                     # clean. 32 gated, 2 conditional, 70 ungated
rm -rf .next && npx next build         # exit 0
```

⚠️ **`npx eslint .` repo-wide reports 2 errors. THEY ARE NOT YOURS** — both in
`components/dev/AmberSwitcher.tsx`, another session's untracked file. Do not fix them.

⚠️ **`npm run check` does NOT catch broken CSS.** A malformed `globals.css` once passed
tsc, eslint, gate-audit and the whole suite; only `next build` on a cleared `.next` caught
it. **If you touch styles at all, build before claiming it works.**

⚠️ `tsc` and `eslint` take several minutes on this tree. Run them in the background.

---

## ⚠️ ANOTHER SESSION IS EDITING THIS TREE

These were uncommitted and NOT mine when I handed over. **Do not commit, stash, revert or
fix them. Report only.** If your branch cannot be made safe without touching their files,
STOP and tell Adrian rather than working around it.

```
 M app/globals.css
 M app/layout.tsx                              (imports components/dev/AmberSwitcher)
 M components/onboarding/flow.tsx
 M components/onboarding/screens/housekeeping.tsx
 M package.json
?? components/dev/                             (AmberSwitcher.tsx — an amber A/B preview)
```

**This has already cost work once.** A rebase-adjacent operation on a dirty tree destroyed
an earlier session's uncommitted edits — untracked files survived, tracked edits did not,
so the loss was partial and silent. **COMMIT BEFORE ANY GIT OPERATION THAT MOVES HEAD.**

---

## HOW TO RUN THE LIVE DRIVES

⚠️ **These create and delete accounts on the PRODUCTION Supabase project.** They are
self-cleaning and census-guarded, but do not run them casually.

```
npx vitest run --config vitest.live.config.ts                        # both drives
npx vitest run --config vitest.live.config.ts test/live/sweep.live.test.ts
npx vitest run --config vitest.live.config.ts test/live/deleteAccount.live.test.ts
```

They are deliberately OUT of `vitest.config.ts`'s include, so `npm test` stays offline.

Rules the drives already follow and that you must not weaken:
- Every account is `@trackd-qa.invalid`, created by the drive, torn down **BY ID**.
- **Never delete by email, domain, or any matcher.** A previous cleanup matched a whole
  domain and destroyed sixteen real fixtures.
- A before/after census of `storage.objects` fails the run on any mismatch.

### ⚠️ EVIDENCE THAT MUST NOT BE DELETED

Six objects on production have no row pointing at them. **They are evidence. Leave them.**

- 5 harness fixtures, `COLD*.png`, 70 bytes each, under two dead prefixes
  (`c637fee7-…643b`, `749dfc3b-…819d`).
- **1 real file**: `journal/e120f593-b0e7-4784-bd15-5fde963093bf/a28a3034-…/photo.jpg`,
  **845,660 bytes**, under `adrianschimizzi1@gmail.com` — a live account.

If a census mismatches, **STOP and report before any cleanup. Do not restore the baseline
yourself.**

---

## FACTS ESTABLISHED THIS SESSION — do not re-derive these

**Storage layout (Q98).** All four buckets key objects under `<user_id>/`, enforced by RLS
`WITH CHECK ((storage.foldername(name))[1] = auth.uid()::text)`. All four are PRIVATE.
Paths are recorded in `lab_panels.source_file_path`, `progress_photos.storage_path`,
`journal_attachments.storage_path`, `profiles.avatar_path`.

**Auth user deletion (Q99).** No reusable auth-admin client existed; the shape was inline
three times, all for `listUsers`. `lib/auth/adminClient.ts` is now that client.

**`list()` semantics, measured against real Storage:**
```
unreadable bucket   data = null   error = StorageApiError 403     <- distinguishable
empty prefix        data = []     error = null
MISSING bucket      data = []     error = null                    <- NOT distinguishable
anon key listBuckets data = []    error = null                    <- shown an empty world
```
This is why `sweep.ts` checks that all four buckets are **present** rather than checking
for an error. Do not "simplify" that to an error check — it would fail open.

**`cancelNowForUser` idempotence.** Comes from `BILLABLE_STATUSES` filtering `canceled`
out, NOT from Stripe tolerating a repeat cancel. A retry never calls Stripe. If someone
widens `BILLABLE_STATUSES` to a terminal status, every retry re-issues a cancel.

**FORCE ROW LEVEL SECURITY breaks nothing** — `service_role` and `postgres` both hold
`rolbypassrls = true`, and `postgres` owns all 44 public objects. It also therefore
*prevents* nothing today. `003_*.sql` says so honestly.

**TRUNCATE is granted to `anon` and `authenticated` on all 41 tables.** RLS does not
restrict TRUNCATE. Not reachable via PostgREST, so latent. Origin is Supabase's platform
default, documented at `supabase/grants/001_api_role_grants.sql:11-12`. Nothing in the
repo issues a SQL TRUNCATE.

**Uploads write the OBJECT before the ROW** at
`components/progress/JournalEntrySheet.tsx:241`, `AttachBloodworkSheet.tsx:140`,
`AddProgressPhotoSheet.tsx:231`, `components/home/AddWeightSheet.tsx:243`. Any
interruption strands a file the rows cannot see. Recorded as a defect at
`Context/progress-tracker.md` — **it is NOT fixed by the sweep**, which only stops it
costing us at deletion time.

**Decision numbers.** `D114` was taken this session (one deletion flow for everyone).
**`D112` is free and was DELIBERATELY NOT TAKEN** — Adrian ruled its status is the ledger
holder's question. So the lowest free and the next free are NOT the same. Next free is
`D115`; next free question is `Q108`. The ledger is
`Context/Feature Specs/Billing Specs/billing-00-decision-ledger.md`.

⚠️ **Every spec file has a gitignored `* 2.md` twin on disk, including the decision
ledger, and the ledger's twin DIFFERS from the real one.** Do not read or edit the twins.
`git ls-files` is the authority.

---

## OPEN ITEMS THE COLD REVIEW SHOULD KNOW ABOUT

These are already known. A review re-finding them is fine; a review missing them is a
signal the review was shallow.

1. **The screen has never been in a browser.** Focus trap, Tab cycling, Escape, and the
   44px targets are built to the `CancelSubscription` pattern and verified by reading the
   code. **§5 requires driving at 390×844 on `http://localhost` — that box is NOT ticked.**
   `npm run dev` serves on `http://localhost:3100`. Bind is loopback; open `localhost`,
   never `127.0.0.1`.
2. **The live Stripe cancel branch is unexercised.** It is a no-op on QA accounts, which is
   the real shape of all 87 comp accounts (measured: zero hold a `billing_customers` row).
   ⚠️ `STRIPE_SECRET_KEY` is `sk_test_…` while `NEXT_PUBLIC_SUPABASE_URL` is **production**,
   so creating a subscription would write a test-mode customer id into the production
   billing tables. Adrian held that deliberately. **Do not do it without his word.**
3. **Four unsigned strings I authored.** The busy label `Deleting…` in
   `DeleteAccountDialog.tsx`, and three error sentences in `delete-account-action.ts`.
   Adrian has not signed them. Flag, do not invent replacements.
4. **`BILLING_GATE_ENABLED` cannot be read from here.** It is a Vercel env var. Report
   CANNOT CHECK rather than inferring it from the code being correct.

---

## SUGGESTED SHAPE FOR THE REVIEWS

Three independent cold agents, each given the diff `git diff origin/main..HEAD` and the
spec, each told to assume nothing about the other two:

- **Money and races** — `cancel.ts`, the orchestrator's ordering, idempotence, the
  `"use server"` endpoint surface, concurrent deletions, partial-failure states.
- **Gate and entitlements** — that no part of the flow consults write access, that a
  lapsed account completes it, RLS and the service-role paths, the `adminClient`.
- **UI at 390×844** — the dialog's focus/Tab/Escape, tap targets, reduced motion, nothing
  under the fixed nav or FAB, the signed copy rendering exactly.

Then verify each finding adversarially before acting on it — a plausible-but-wrong finding
that gets "fixed" is worse than no review. Rank CRITICAL / HIGH / MEDIUM / LOW. **Payments
are the strict bar: no CRITICAL and no HIGH may remain.** Low and medium unrelated to
payments may be accepted deliberately — write them down in `Context/progress-tracker.md`
rather than leaving them implicit.

---

## SEPARATELY, AND IT IS TIME-CRITICAL

**82 accounts have a free period ending 2026-09-10 04:00:11 UTC.** As of 2026-09-04:

- The seven-day grace notice exists and its copy is signed
  (`lib/billing/noticeCopy.ts:106`, rendered on `/(app)/dashboard`).
- **It renders only if `BILLING_GATE_ENABLED` is true, which cannot be verified from here.**
- **Nobody has dismissed it** — zero `consent_records` rows anywhere in the table since it
  shipped, and only 3 of the 82 hold a v2.0 row, so a dismissal would insert one.
- **The cohort is dormant: 0 active in 24h, 2 in 7 days, 8 in 30 days.** A dashboard modal
  cannot reach people who do not open the app. Push reaches 17 of 94 (D111).

This is Adrian's call, not the builder's. **Do not build a delivery mechanism.** But if the
date passes with those people uninformed, that is the thing this project cares about most.

---

## FIRST THINGS TO DO IN THE NEW SESSION

1. `git status --porcelain` and `git branch --show-current`. Confirm you are on
   `deletion/steps-1-2` and report anything uncommitted that is not yours.
2. `git log --oneline origin/main..HEAD` — expect the 12 commits above.
3. Run the offline gates and confirm 95 files / 1992 tests before changing anything, so a
   later failure is attributable to you.
4. Read the spec's §5 checklist in full and say which boxes you can tick **by observation**
   and which you cannot.
5. Then run the reviews.

**Note:** `python3` is broken on this machine (unaccepted Xcode licence). Use `node`, `sed`
or the editor tools instead.
