# PROPOSAL — Blocks

**Status: partly settled, nothing built.** Adrian answered the naming and shape
questions on 2026-07-30; three questions are still open at the bottom.

## SETTLED (Adrian, 2026-07-30)

- **It is called a BLOCK** (a training block), not a goal. This was the right
  call and it changes the feature: a goal is a target you hit or miss, a block is
  a period of time you ran. The retrospective is the natural centre of a block
  and only a bolt-on to a goal.
- **One block live at a time.** Past blocks archive into the look-back list.
- **Targets are in, and are not limited to weight.** "There are variables that we
  track, so they could be targets." Weight is the obvious first one; the shape
  should not assume it is the only one.
- **Dates, not just weeks.** A block has real start and end DATES. Weeks are a
  derived reading of them, not the model. It should be functional, not simplistic.

New scope: this is NOT one of the eighteen wave 2 specs. Sequencing is a question.

---

## Is it a good idea?

Yes, and I think it is the strongest thing you could add next. One reason, and it
is not the obvious one.

**Trackd already stores everything a retrospective needs.** Dose logs, progress
photos, weight, bloodwork, journal entries, markers, cycles, injection sites —
every one of them is already dated and already yours. A goal is not new data. It
is a **date range with a name**, and everything else is a query over the range
you already have.

That has three consequences:

1. **It is cheap.** One small table, one screen, no new capture flow. Nothing new
   to ask the user to do.
2. **It cannot be copied.** A competitor can ship a goal ring in an afternoon.
   They cannot ship "here is the 16 weeks of your first prep, the eleven
   compounds you ran, your first and last photo side by side, and the bloods you
   took in the middle" without having held that data for 16 weeks.
3. **It changes what the app is for.** Nobody re-opens a tracker. People re-open
   a record of themselves. The look-back is the feature; the progress ring is
   table stakes.

So my strong view: **build the retrospective first and the ring second.** You
described them in that order too, and I think that was instinct worth trusting.

## The one hard problem: what does "percent" mean?

MacroFactor can show a percentage because its goals are numeric — current weight
against target weight is a real fraction. **"Prepping for a comp" has no number.**
There is nothing to divide.

There are only two honest measures:

- **Time elapsed.** Always computable, never wrong, never a judgement. "Week 7 of
  16." This works for every goal there will ever be.
- **Distance to a numeric target.** Only exists when the goal has one (a
  bodyweight). Real, but only sometimes available.

**My proposal: time is the primary measure and the default.** A numeric target is
optional and, when set, shows as a clearly separate second figure. They are never
merged into one number, because a blended "68% complete" would be inventing a
fact.

### The line this must not cross

`architecture.md`'s invariant is that health data is presented **categorically and
never evaluatively**. A goal is the user's own plan, not a health reading, so a
progress figure is fine. What is NOT fine:

- "Behind schedule", "on track", "ahead" — evaluative.
- Red for slipping, green for winning — evaluative, and reserved colours.
- Any projection of whether they will "make it".

The rule for every string in this feature: **state the fact, never the verdict.**
"Week 7 of 16. 9 weeks left." Not "you're on pace."

## Shape

### Data

One table, `goals`. Per the no-stored-derived-values invariant, everything below
the line is computed on read — weeks elapsed, percent, what was run, all of it.

```
goals
  id            uuid
  user_id       uuid  (RLS: owner only, composite FK per 008/009)
  name          text  ("First bodybuilding prep")
  started_on    date
  ends_on       date  NULL = open ended
  -- Targets are a LIST, not a column, because Adrian wants any tracked
  -- variable to be targetable and one nullable column per variable does not
  -- scale. `block_targets(block_id, variable, target_value, direction)`.
  status        active | completed | abandoned
  closed_on     date  NULL
  reflection    text  NULL   -- written when they close it
```

Nothing else. No cached totals, no snapshot of what was running: the dose log
already knows, and a snapshot would drift from it.

### While a goal is live

A card at the top of Progress:

```
GOAL
First bodybuilding prep
Week 7 of 16                    ●●●●●●●○○○○○○○○○
9 weeks left · ends 24 Sep
```

Tapping it opens the goal screen: the same header, plus the live versions of the
things the retrospective will summarise (weight over the window, photos taken in
it, what you are running now).

### When it ends — the actual feature

The retrospective. Everything below is a query over `started_on … closed_on`:

- **Duration.** "16 weeks, 2 days. 4 Jun to 24 Sep."
- **Weight.** Start, end, delta, and the graph clipped to the window.
- **Photos.** First and last session side by side — `ComparePhotosSheet` already
  does exactly this — plus how many sessions.
- **What you ran.** One row per compound, with total doses logged in the window.
  This is the thing you described wanting to look back on.
- **Bloods.** Panels taken during the window.
- **Consistency.** Adherence across the window, using the existing calculation.
- **Journal.** Entry count, and the markers dialed most often.
- **Your note.** The reflection written at close.

### Adding and browsing

A "Goals" list: the live one at the top, past ones beneath, newest first. Each
past one opens its retrospective. New goal is a sheet: name, start, optional end,
optional target weight.

## Deliberately NOT in v1

- Templates ("cut", "bulk", "prep") — they invite prescription.
- Any recommendation, projection or coaching.
- Sharing or export.
- Goals attached to a specific compound or cycle. Cycles already do that job.

## Open questions — need answers before building

1. **Which tracked variables can be targets, beyond weight?** Weight is
   unambiguous (one number, one direction, already graphed). The other candidates
   are consistency percent, bodyweight change rather than absolute, and a
   bloodwork marker. My worry is the last one: a target on a biomarker turns a
   reading into a pass/fail, which is exactly what
   `architecture.md`'s categorical-never-evaluative invariant forbids. My
   recommendation is weight and consistency in v1, and NO biomarker targets ever.
   Needs your call.
2. **Can a block have no end date?** An open-ended off-season has no deadline,
   and then there is no "week 7 of 16", only "week 7". Everything still works;
   the card just reads differently.
3. **What happens on the end date?** Auto-complete it, or leave it live and
   prompt them to close it? I lean prompt, because the retrospective wants their
   reflection and an auto-close gets none.
4. **Sequencing.** Before or after the remaining wave 2 specs (profile,
   add-compound, log-a-dose, global sweep)?
