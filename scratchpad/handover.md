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
- **Group 1 — COMPLETE.** `688af98` 1.1 widen once (EntitlementRead's shape) ·
  `7d05e1f` 1.2 comp guard refuses on unreadable · `74daafc` 1.3 predicate split ·
  `979e38d` 1.4 suspended keys on the revocation flag · `0db6d9b` 1.5 screens carry
  accessLive · `994b357` 1.6 subscriptions read says whether it worked ·
  `cd6d2b2` 1.7 dashboard banner + the false comment.
- Groups 2-5: not started.

## ⚠️ THE 15 HARNESS FAILURES — CLASSIFIED, NOT FIXED

**All 15 are category 2: they need a flag. ZERO regressions.** Proven by running,
not by reading the headers.

| file | fails | category | proof |
|---|---|---|---|
| `notice.scenario.ts` | 9 | needs `BILLING_GATE_ENABLED` (browser) | green with the gate on |
| `banner.scenario.ts` | 3 | needs `BILLING_GATE_ENABLED` (browser) | green with the gate on |
| `readonly.scenario.ts` | 1 | needs `BILLING_GATE_ENABLED` (browser) | green with the gate on |
| `rule0.scenario.ts` | 2 | needs the flag IN-PROCESS | green with the flag |

banner + notice + readonly: **20/20** against a gate-on dev server, gate proven from
the named artefact first. rule0: **2/2** with `BILLING_GATE_ENABLED=true` on the vitest
command line — and its own first test IS the named-artefact control that the flag
reached the process.

Every failure is an ARRIVAL assertion failing safe ("the notice did not open",
"not exactly one banner"), never a vacuous pass. None is a genuine regression, and
none was touched.

## Baseline

| | at freeze | now |
|---|---|---|
| tsc + ESLint | clean | clean |
| gate audit | 32 / 2 / 69 | 32 / 2 / 69 (unmoved) |
| `npm run check` tests | 1523 | 1540 (+17, all new controls) |
| `qa-05-readonly.mjs` | 23/23 | 23/23 |
| accounts | 90 / 0 / 90 / 0 / 0 | **91** / 0 / 90 / 0 / 0 — a real Google sign-up landed 05:30Z 18 Aug, mid-session. Baseline raised, nobody deleted. |
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
   intent. 1.4 flipped it.
5. **1.1 widened at `EntitlementRead`'s shape**, not `compEntitlement`'s — it already
   exists, `proAccessState` already proves it on the same table, and
   `compEntitlement`'s union is comp-specific. The two collapsing readers were
   DELETED rather than left beside it.
6. **1.4 produced one new defect and it was caught by driving** — P2 (the
   `invoice.paid` lag) fell through to a renewal claim naming a PAST date. Resolved by
   returning to the founder's own recorded ruling for that cohort (withhold), which the
   driver already carried four lines above the assertion that had overwritten it.
   Nothing was invented. **That is one occurrence; the stop rule is two running.**
7. **1.5's declined card WITHHOLDS** rather than rewording. Group 3.1 signs the
   replacement.

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
