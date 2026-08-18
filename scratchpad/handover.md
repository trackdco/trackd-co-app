# Handover — billing launch fix batch

**Branch** `wave3/billing-cancel`. **Freeze head** `a929d98`, unfrozen by this batch.
**Current head** — see `git log -1`; updated at every commit below.

## Decision numbers taken

**NONE YET.** The ledger's own next-free list (`billing-00-decision-ledger.md:31`)
reads **D91** and **Q106**; highest issued are D90 and Q105, verified by grep. The ten
decisions in the brief will take **D91 to D100 in the brief's listed order**. They are
NOT taken until Group 2 lands and this file names each one against its subject.

## Groups done

- **Group 0 — COMPLETE. Reported, awaiting acknowledgment.**
  - `55c35a1` 0.1 — revoked cohort reseeded to the writers' expression; unit test split
    into a copy pin and a derived reachability test.
  - `e24d058` 0.2 — leak detector: every number in the verdict, exit 0/1/2, both Stripe
    reads paged, nothing classified away.
  - `50d47df` 0.3 — `Ledger.teardown` fails loudly and keeps what it could not delete.
- Groups 1-5: not started.

## Baseline

| | at freeze | now |
|---|---|---|
| tsc + ESLint | clean | clean |
| gate audit | 32 / 2 / 69 | 32 / 2 / 69 (unmoved) |
| `npm run check` tests | 1523 | 1524 (+1: the 1.4 reachability test) |
| `qa-05-readonly.mjs` | 23/23 | 23/23 |
| accounts | 90 / 0 / 90 / 0 / 0 | unchanged, `qa-audit.mjs` exits 0 |
| migration 003 | applied | probed, one row, timestamptz, nullable |
| flags | absent from `.env.local` | absent, unchanged |

## Things I decided myself

1. **The 12 live Stripe subscriptions are recorded, not deleted.** Widening the audit
   surfaced them. All test-mode on an `sk_test_` key, created 25 Jun to 7 Aug, none on
   `@trackd-qa.invalid`, five are Stripe sample data, none maps to a DB row. Recorded
   BY SUBSCRIPTION ID in `qa-audit.mjs` so a new one on the same customer still fires.
2. **`qa-audit-controls.mjs` is tracked**, with a `.gitignore` negation. A detector
   whose control is on one machine is the claim-not-evidence failure D89 exists for.
3. **The 0.1 row-selection assertion was replaced, not patched** — it is unanswerable
   once the two dates are equal, and that question is already asked in P1/P2.
4. **`manageSummary.test.ts` characterises the defect** rather than asserting the
   intent. 1.4 flips it. Green today for a true reason.

## Corrections to the brief, both measured

- **Orphans cannot exist.** All three billing tables are `ON DELETE CASCADE` to
  `auth.users`. Driven both ways. The check stays; it has no live control and says so.
- **The harness does not exit 0 by default** (item 5.8's premise). It exits 1: 15
  failed / 7 passed across banner, notice, readonly, rule0. Confirmed pre-existing by
  running them with and without the 0.3 change.

## Open / needs a ruling

- Group 0 acknowledgment before Groups 1-5.
- `scratchpad/harness/{coldgate,moneygateon,moneyreconcile,moneyrevokedskip,
  moneysuspended}.scenario.ts` are still untracked cold-review reproductions.

## Running things

    ./scratchpad/dev-gate-on.sh     # export-and-exec; `npx` LOSES the flag
    ./scratchpad/dev-gate-off.sh    # the state the tree is left in
    node scratchpad/coldgate/gate-7-flag-absent.mjs   # reads the gate off a NAMED artefact

Drive on `http://localhost:3100`, never `127.0.0.1`. Count out of process after every
run including failed ones.
