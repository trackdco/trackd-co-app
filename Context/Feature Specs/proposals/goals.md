# PROPOSAL — Goals

**Status: proposed, not approved. Nothing built.** Adrian asked for an idea and
questions, 2026-07-30. The open questions at the bottom need answers before any
code.

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
  target_weight_kg  numeric NULL
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

1. **One active goal at a time, or several at once?** I lean one, matching
   "one compound, one stack". It keeps "Week 7 of 16" unambiguous on the Progress
   card. Several would need the card to pick one anyway.
2. **Can a goal have no end date?** An open-ended bulk has no deadline, but then
   there is no "week 7 of 16" — only "week 7". Happy either way, but it changes
   the card.
3. **What happens on the end date?** Auto-complete it, or leave it live and prompt
   them to close it? I lean prompt, because the retrospective wants their
   reflection and an auto-close gets none.
4. **Optional target weight in v1, or time only?** Time only is simpler and
   honest; a target adds a second real number for the people who have one.
5. **Where does it sit on Progress?** Above the photo card as its own card, a
   fifth tile in the grid, or a row inside the grid? I lean above the photo card:
   while a goal is live it is the frame for everything under it.
6. **What do you want it called?** "Goal" reads like a target. "Prep", "Block",
   "Phase" and "Run" all read like a period of time, which is closer to what it
   is. This changes every string in the feature, so it is worth deciding first.
7. **Sequencing.** Does this go before or after the remaining wave 2 specs
   (profile, add-compound, log-a-dose, global sweep)?
