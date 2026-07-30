# Next Tasks

The **windscreen** — the concrete next steps. This file says *what to do next*;
`progress-tracker.md` records what's already done. When a task finishes: log it in
`progress-tracker.md`, delete it here, add the next steps. Full history is in git.

Last updated: 2026-07-30 (overnight session)

---

## 🎯 Current focus

# WAVE 2 PART TWO IS COMPLETE ON A BRANCH. NOT MERGED, NOT PUSHED.

**Branch: `wave2/containers-cycles-calendar`. `main` is untouched.** Everything
below is committed there. A new session picks up by reading this file and
`git log d26034a..HEAD`.

### What is built

All eleven part-two specs, plus Blocks (new scope), plus the em-dash pass of
part one's global sweep. Every spec has been through an independent review agent
and its findings are fixed. The eight bugs the three breakage agents found are
all closed, and most of the medium list with them.

| Spec | State |
| --- | --- |
| 01 Containers, 02 Homepage, 03 Calendar, 04 Protocol, 05 Stacks, 06 Cycles | Done, reviewed |
| 07 Calculator | Done, reviewed 3x |
| 08 Progress | Done, reviewed, fixed, re-reviewed |
| 09 Profile | Done, reviewed, fixed |
| 10 Add compound | Done, reviewed, fixed |
| 11 Log a dose | Done, reviewed, fixed |
| Blocks | Done, reviewed twice, fixed |
| part one 07 Global sweep | Em-dash pass done. Wordiness + portrait fallback need Adrian |

### ⚠️ WHAT NEEDS DOING NEXT

1. **Re-review specs 09, 10 and 11.** All three had their findings fixed in this
   session and NONE has been re-reviewed since. That is not a formality here:
   the Blocks round proved twice over that fixes introduce their own defects.
   Spec 11's fixes in particular were substantial (the sheet header moved, the
   vial blocks were rebuilt, the site hint moved).
2. **Apply `supabase/protocol/010_inventory_days_to_empty.sql`** (Adrian, via the
   SQL Editor). Nothing breaks without it.
3. **The parked decisions below**, which are Adrian's, not yours.

### A trap that cost this session hours

**A stale `.next` from a production build wedges `next dev`.** The server
accepts TCP, answers `/manifest.webmanifest`, and then hangs forever on
`○ Compiling /preview/home`. It looks like a slow compile and it never finishes.
Three review agents lost most of their run to it and reported preview pages as
un-hydratable, which was false.

The fix is `pkill -f "next dev" && rm -rf .next` and restart. After that every
`/preview/*` route serves in about five seconds and hydrates properly (verified
with Playwright: tapping Edit on `/preview/profile` really does swap in three
selects). **Never run `next build` and `next dev` against the same `.next`.**

---

## PARKED — Adrian's calls

### 0. "Saved to this device for you only" is FALSE, and it is on three screens

The log sheet now says "Saved to your account. Only you can see it.", which is
what is actually true: dose logs sync to Postgres and RLS scopes every read to
the signed-in user. The old sentence is a privacy claim, on a health app, on the
screen where health data is entered.

**The same sentence is still on `AddCompoundSheet` and `add-to-stack-menu`.**
Left alone deliberately: it is privacy copy and it should be worded once, by
you, not patched per file.

### 1. Spec 11 asks for a note row that cannot be built

Spec 11's "Card three: the note" says to open "the existing note input". There is
no note on a dose anywhere: not on `DoseLog`, not on `dose_logs`, not in the
mirror. The same spec's Out of Scope forbids adding anything not already on the
sheet, so building it would need a schema change AND would contradict the spec's
own boundary.

Left out. Building it means a migration (a `note` column on `dose_logs`), a
`DoseLog.note` field, and a decision about whether it syncs. Say the word.

### 2. A new shared component was created

`components/compounds/CompoundHeader.tsx`. Spec 11 says to REUSE the add form's
header rather than rebuild it, which is only literally possible if it is shared,
and the specs say to flag any new shared component. It is the container, the
name, and one detail line. Nothing else uses it.

### 3. The read-state dim on Profile is now 85%, not 60%

Spec 09 asks for "slightly dimmed". At 60% the row labels the spec introduced
measured **2.2:1** against the card, well under the 4.5:1 AA floor for 14px
text. 85% is genuinely slight and lifts them to 3.2:1.

**The rest of that shortfall is a global token decision, not a screen one.**
`--text-muted` (#7a7a74) on `--bg-surface` is **3.95:1** at full opacity, so
every muted label in the app is below AA. Changing it is a palette change and
yours to make. `ui-context.md` is the place.

### 4. Two amber elements the calculator shows at once

Unchanged from the last session. Spec 07 and `ui-context.md`'s "one or two amber
beats per screen" are in genuine tension in the misuse state.

### 5. Legal copy has em dashes in it

`/terms`, `/privacy` and `/medical-disclaimer` contain em dashes. The global
sweep spec says explicitly not to touch legal, medical or safety copy without
flagging, so they are untouched. Six instances, all mid-sentence clause joins.

### 6. The wordiness pass has NOT been applied

Spec 07 requires the current-versus-proposed table to be reviewed before
anything changes. The rendered copy is already tight; these are the candidates:

| Where | Now | Proposed |
| --- | --- | --- |
| `BlocksScreen` empty state | "A block is a named stretch of training. While one runs, everything you already log stays exactly the same; when it ends you get the whole period back in one place." | "Name a stretch of training. When it ends, you get the whole period back in one place." |
| `BlockCreateSheet` subtitle | "Name a stretch of training, set when it starts, and optionally when it ends." | Drop it. The three fields below say this. |
| `InjectionSitesSheet` | "Your injection rotation on a body map. Hover a muscle to see when you last used it." | "Tap a muscle to see when you last used it." ("Hover" is wrong on a phone regardless.) |
| `AddCompoundSheet` subtitle | "Set this compound's dose and schedule. Choose a method or unit when there is more than one." | "Set the dose and schedule." |
| `NotificationsToggle` | "Notifications are blocked. To turn them on, allow notifications for Trackd in your browser or phone settings. We can't ask again from here." | "Notifications are blocked. Allow them for Trackd in your browser or phone settings." |

### 7. Portrait lock: the manifest is already set, the fallback is not

`app/manifest.ts` already declares `orientation: "portrait"`, which covers the
installed PWA. Spec 07 wants a fallback for in-browser iOS Safari, which ignores
it, and says to **propose the approach before implementing**. So:

**Proposal.** A CSS-only `@media (orientation: landscape) and (max-height: 500px)`
rule that swaps the app shell for a short "Turn your phone upright" panel. CSS
rather than the Screen Orientation API, which iOS Safari does not implement
outside fullscreen. Height-capped so it can only ever fire on a phone, never on
an iPad or a desktop window.

**The accessibility catch, which is why this needs your call.** Someone who has
locked their phone to landscape for accessibility reasons would meet a wall.
There is no way to tell that case apart from a casual rotation. My recommendation
is to ship it with a "show anyway" link that dismisses for the session, so it is
a nudge rather than a lock. Not implemented either way.

### 8. Two spec 08 items still need your eye

Unchanged: the Progress widgets are ~228px against the dashboard's 183px and are
not the square the spec asked for (forcing it clips content), and the journal
widget shows more than the spec describes because you asked for it after seeing
it read thin. The spec file still says the opposite.

### 9. Spec files that no longer match what shipped

Specs 07, 08 and 11 have "Check When Done" lines that read as unmet because YOU
changed the design after the spec was written (the calculator's card layout, the
journal widget, the pre-filling time field). Say the word and I will amend the
spec files so a future session does not "fix" them back.

### 10. The timezone drift on logged doses

Still open, and it needs a schema decision rather than a patch. `dose_logs`
stores only `taken_at`, an absolute instant, and hydration re-buckets it into a
day using the CURRENT device timezone. Fly Sydney to Los Angeles and yesterday's
doses can land on the day before, and because the jsonb mirror keeps the original
local key, the merge can end up showing the same dose twice on adjacent days.

The real fix is a `logged_for` date column on `dose_logs`, written from the
device's own local date, and hydration keying off that. A client-side heuristic
that guesses which of two adjacent days is right would risk duplicating or losing
doses, which is worse than the drift. Your call, since it is a migration.

### 11. The Today ring's denominator: reviewed, left alone

The old medium said it "counts logged-but-not-due doses so it can contradict
Next Dose". Traced it: a compound that is logged but no longer due adds one to
BOTH the numerator and the denominator, so the ring stays internally consistent
and reads as complete. Changing it would churn a shipped, reviewed screen to
chase a contradiction I could not reproduce. Flagging rather than fixing.

### 12. Settled earlier, still true

Blocks: called a BLOCK, one live at a time, real dates, slim banner on Progress,
targets cover weight and consistency but NEVER bloodwork. The mg/mcg pill inside
the calculator's field. A non-daily compound still counts as "running" under a
photo (`lib/progress/running.ts` if you disagree). Spec 07's syringe size
persists.

---

## Migrations

**Applied:** `supabase/protocol/006`, `007`, `008`, `009`,
`supabase/sites/011`, `supabase/blocks/001`.

**Pending, needs Adrian:** `supabase/protocol/010_inventory_days_to_empty.sql`.
Additive, re-runnable, touches no table and migrates no data — it re-creates
`v_inventory_math` with one extra column. The app already asks for that column
and retries without it, so applying it is safe at any time and nothing breaks
until it is.

---

## KNOWN GAPS, carried deliberately

**Cycle end condition 3, "ends when the vial runs out", is WITHHELD** behind
`VIAL_END_SUPPORTED = false`. Nothing derives the day a vial actually ran dry.

**Injection sites are not captured when a stack is logged in one tap.**

**No component tests.** Vitest covers `lib/**` only (pure by house rule), so
every finding on a component this session came from executing the real screen in
Chrome, not from the suite. 332 tests pass and would not have caught any of the
criticals.

---

## Decisions Adrian has SETTLED - do not re-litigate

- Week strip: soft raised block for the selected day, status dot INSIDE it.
- "Nothing scheduled / No doses planned for this day."
- Today card dot cap: 9, then "+N".
- Runs-dry: amber on the BAR at 7 days or fewer, never on the text.
- Cycle countdown-versus-date crossover: 14 days.
- Schedule: rows of dots, NOT a table.
- New stack / new cycle: hairline outline card, ghost preview, ONE line of copy.
- Unnamed stacks auto-name "Stack N".
- Tabs and caps DO show stock. Powders genuinely have none and say so.
- Compound detail sheet leads with the CONTAINER; specs 10 and 11 reuse it.
- **NO EM DASHES in any user-facing string.**
- Health data is categorical, never evaluative.

---

## Merging, when Adrian says so

`main` deploys straight to Vercel prod, so merge ONLY on his word. Before it:
tsc, lint, `npm test` and `next build` all clean; decide whether the `/preview/*`
demo pages ship; do not rewrite the migration files.
