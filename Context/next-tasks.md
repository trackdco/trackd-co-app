# Next Tasks

The **windscreen** — the concrete next steps. This file says *what to do next*;
`progress-tracker.md` records what's already done. When a task finishes: log it in
`progress-tracker.md`, delete it here, add the next steps. Full history is in git.

Last updated: 2026-07-29

---

## 🎯 Current focus

# WAVE 2 PART TWO IS IN PROGRESS ON A BRANCH. READ THIS BEFORE ANYTHING ELSE.

**Branch: `wave2/containers-cycles-calendar`. NOT merged, NOT pushed. `main` is
untouched.** Everything below is committed on that branch, so nothing is at risk;
a new session picks up by reading this file and `git log d26034a..HEAD`.

Last updated: 2026-07-30

### Sequencing

The readme's table is BUILD order, not numeric order. Part two runs:
containers -> cycles -> stacks -> homepage -> calendar -> protocol -> calculator
-> progress -> profile -> add-compound -> log-a-dose. The calendar was pulled
forward out of order (Adrian's call) because cycles are invisible without it.

### DONE and reviewed

| Spec | File | State |
| --- | --- | --- |
| 01 Containers | `01-containers.md` | Done, reviewed. Demo page at `/preview/containers`. |
| 06 Cycles | `06-cycles.md` | Done, reviewed twice. FOUR of five end conditions live. |
| 03 Calendar | `03-calendar.md` | Done, reviewed. |
| 05 Stacks | `05-stacks.md` | Done, reviewed twice. |
| 02 Homepage | `02-homepage.md` | Done, reviewed. |
| 04 Protocol | `04-protocol.md` | Done. Review was IN FLIGHT when this was written; check for unaddressed findings. |

### NEXT UP

`07-calculator.md`, then `08-progress.md`, `09-profile.md`,
`10-add-compound-item.md`, `11-log-a-dose.md`. Then part one's
`07-global-sweep.md`, which runs last.

### The working loop Adrian asked for

Per spec: implement -> verify (tsc, lint, `npm test`, `next build`) -> commit ->
run an INDEPENDENT review agent -> fix findings -> commit -> update these context
files. Do not merge, do not push. Adrian merges everything at the end, in one go.

**Review agents have found real defects on every spec so far, including one
critical regression the author missed.** This is not ceremony. Keep doing it, with
a FRESH agent rather than self-review.

### Migrations: ALL THREE APPLIED by Adrian

`supabase/protocol/006_compound_cycles.sql` (cycle columns + runs-dry fix),
`007_stacks.sql` (stack tables), `008_stack_members_ownership.sql` (closes an RLS
hole 007 shipped; ownership is now structural via composite FKs). Nothing pending.

### KNOWN GAPS, carried deliberately

**Cycle end condition 3, "ends when the vial runs out", is WITHHELD.** The rule is
implemented and tested; nothing derives the day a vial actually ran dry, so it is
gated behind `VIAL_END_SUPPORTED = false` in `lib/protocol/cycleRule.ts` rather
than shipped as a control that silently does nothing. Wiring it means threading a
Postgres read into `isDueOnFor`, which is pure and synchronous and called by the
week strip, calendar, consistency and Next Dose. Its own pass.

**Injection sites are not captured when a stack is logged in one tap.** A stack
tick has no body map, and inventing a site would corrupt the recency view.

### Decisions Adrian has SETTLED - do not re-litigate

- Week strip: soft raised block for the selected day, NOT the amber underline the
  spec specified. Status dot sits INSIDE the block.
- "Nothing scheduled / No doses planned for this day." for a day with no doses.
- Today card dot cap: 9, then "+N".
- Runs-dry: amber on the BAR at 7 days or fewer, never on the text. The date takes
  `--text-muted` to match the other figures; the "runs dry" label is lowercase and
  dimmer. Recorded as a scoped exception in `architecture.md`.
- Cycle countdown-versus-date crossover: 14 days.
- Schedule: rows of dots, NOT a table. Icon-led headings, white labels.
- New stack / new cycle: hairline outline card, ghost preview, ONE line of copy
  when empty.
- Unnamed stacks auto-name "Stack N", lowest free number. Relaxes Spec 05's
  "name required".
- Tabs and caps DO show stock (it already existed and was merely hidden). Powders
  genuinely have none and say so.
- Compound detail sheet leads with the CONTAINER. Specs 10 and 11 reuse that header.
- **NO EM DASHES in any user-facing string.** Hard rule, `ui-context.md` under
  Voice and Microcopy.

### Merging, when Adrian says so

`main` deploys straight to Vercel prod, so merge ONLY on his word. Before it:
tsc, lint, `npm test` and `next build` all clean; decide whether the `/preview/*`
demo pages ship; do not rewrite the migration files.

---

