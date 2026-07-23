this is a read me file that you should always look back to as you go through each spec file. it conains essential information to know.

## Instructions for Claude Code

Work on exactly ONE spec file per session, the one named in the
prompt. Do not read, reference, or act on any other file in this
folder unless explicitly told to.

also you can read and refer to @ai-workflow-rules.md, @architecture.md, @code-standards.md, @next-tasks.md, @progress-tracker.md, @project-overview.md, @ui-context.md. as well as the agent and read me files.

If you notice something in the current spec that relates to
another spec, say so and stop. Do not implement it.

Do not start the next spec after finishing one. Each spec ends
at its Vercel preview link. The next one begins in a new session.

Several specs stop and require approval before implementation
continues. Those stops are not optional. Do not proceed past one.

# TRACKD Overhaul Specs

Index of the post-redesign overhaul. Work top to bottom. Each spec is one PR, reviewed by CodeRabbit and merged to main before the next one starts.

## How to use this folder

- Hand Claude Code **one spec file at a time**. Do not paste the original review document in. Context bloat is the main failure mode: it starts half-doing item nine while you are on item two.
- Every spec references `ui-context.md`, `architecture.md`, and `code-standards.md` rather than restating their values. Make sure those are in the project context.
- Several specs ask for something to be **shared and approved before implementing** (an audit, a copy table, a list of unit assignments). Those are deliberate stop points. If Claude Code skips one and starts building, pull it back.
- Update the Status column as you go, so any future session can pick up mid-stream without you re-explaining.

## Part one: fixes and small specs

| # | File | Status | Depends on |
|---|------|--------|-----------|
| 01 | `01-dose-integrity.md` | Not started | Nothing. Must merge before anything else |
| 02 | `02-compound-lifecycle.md` | Not started | 01 |
| 03 | `03-add-compound.md` | Not started | 01, 02 |
| 04 | `04-markers-by-sex.md` | Not started | 01 |
| 05 | `05-photo-adjust.md` | Not started | Nothing |
| 06 | `06-admin.md` | Not started | Nothing |
| 07 | `07-global-sweep.md` | Not started | 01 through 06 all merged |

### What each one does

**01 · Dose & Schedule Integrity**
Fixes the data layer. Altering a dose applies from the selected day forward with no retroactive rewriting and no compensating back-fill. Logging from a past day on the week strip writes to that day rather than today. Finds the root cause of the deleted compound reappearing in logs after signing out and back in. Stops the time field pre-filling to the current clock time. Fixes Next Dose showing a dash while doses are due. Everything else in the overhaul sits on top of this, which is why it goes first and alone.

**02 · Compound Lifecycle**
Collapses active, archived, and erased down to active and deleted. Delete stops future doses and keeps history. Bringing a compound back becomes the same action as adding any other compound: find it in the picker, press the plus. Removes the reactivate arrow and the dimmed treatment, deletes the Archive page from Profile, and restyles the delete warning from amber to the red outline treatment that Sign out already uses. No permanent erase.

**03 · Add Compound Flow**
Renames the picker from "Add to stack" to "Add compound", freeing the word for the Stacks feature. Rebuilds the picker as search, a Recently used row, then browse by category, replacing the flat "Popular in comp prep" list. Gates the vial storage section to injectables so Creatine and Berberine stop being asked about vials. Gives each compound its own default dose unit so peptides open on mcg and anabolics on mg, with the pill toggle kept for overrides.

**04 · Sex-Specific Markers**
Applies the same profile-sex logic the injection site body map already uses to the markers picker. Erection Quality and Gyno Symptoms become male only. Clitoral Enlargement, Voice Deepening, and Cycle Changes become female only. The other 31 stay shared. "Cycle Changes" gets renamed because it collides with the Cycles feature. Critically, filtering only affects what can be logged going forward, it never hides or deletes anything already logged.

**05 · Photo Adjust Step**
Adds a zoom and reposition step between choosing a photo and saving it, within a fixed aspect ratio, with faint guide lines for lining successive shots up. No free cropping, no rotation, no filters. Applies to every photo entry point in the app: progress photos, bloodwork attachments, and the profile picture.

**06 · Admin Page**
Turns the waitlist view into an operational one. Verifies the founder-only restriction is enforced server-side rather than just hidden in the UI, which is the first thing it checks. Drops the waitlist framing, keeps the email list, and adds active users daily and weekly, signups over time with the existing channel breakdown underneath, total compounds and doses logged, users with an active compound, and a feedback queue with a toggleable open and resolved state.

**07 · Global Sweep**
Three app-wide passes with almost no logic in them. Removes em-dashes from user-facing copy, judged case by case rather than mechanically swapped for commas. Cuts unnecessary wordiness, with a current-versus-proposed table reviewed before anything is applied. Locks the app to portrait on every device. Runs last because every spec above it writes copy, and sweeping first means sweeping twice.

## Part two: page layouts

Not yet written. These need design decisions that are still open: the week strip and calendar designs, the calendar cycle display, the protocol schedule grid and its missed-dose treatment, the progress widget layout, and the calculator rebuild. Writing them before those calls are made would mean inventing the design rather than specifying it.

Planned files, once decisions are locked:

| # | File | Covers |
|---|------|--------|
| 08 | `08-homepage.md` | Greeting removal, collapsible week strip, Next Dose copy, progress bar, journal quick action, header icon row |
| 09 | `09-calendar.md` | Cycle display and colour coding on the month view |
| 10 | `10-protocol-page.md` | Unified page, vials card, schedule grid with key |
| 11 | `11-stacks.md` | Stacks as saved templates. Feature, not layout |
| 12 | `12-cycles.md` | On and off cycles, end conditions, colour selection. Feature, not layout |
| 13 | `13-calculator.md` | Needle graphic, three result cards, input sheet, collapsible calculations, first-run disclaimer |
| 14 | `14-progress.md` | Photo card, widget grid, weight, journal, bloods, consistency |
| 15 | `15-profile.md` | Bigger avatar, inline physical editing, danger zone, billing, Settings dissolved |
| 16 | `16-log-a-dose.md` | Simplified log sheet matching the new add-compound style |

Stacks and Cycles are features rather than layout changes, which is why they get their own files instead of sitting as bullets under the Protocol page.

## Locked decisions

Recorded here so they do not have to be re-litigated inside individual specs.

- **Stacks are saved templates**, not containers. Tapping one opens the normal add flow prefilled and each compound stays an independent log entry. Revisitable if it does not work in practice.
- **Weight and progress photos come off the dashboard** and live in Progress. A journal quick-input card goes on the dashboard so the page still has a reason to scroll.
- **The global mg/mcg default does not change.** Units are set per compound in the library instead.
- **The picker is renamed to "Add compound".** "Stack" is reserved for the Stacks feature.
- **Delete is the only verb.** Archive is removed. History is kept forever, with no permanent-erase option.
- **Marker split:** male only is Erection Quality and Gyno Symptoms. Female only is Clitoral Enlargement, Voice Deepening, and Cycle Changes (pending rename). Everything else is shared. Changing profile sex filters the picker and never touches logged history.
- **Destructive confirmations use red**, matching the existing Sign out treatment. Amber stays the accent colour everywhere else.
- **Settings is removed entirely.** Physical moves into Profile behind an edit toggle. Billing and Notifications become rows in the App card.
- **Compound category colour coding is unchanged**, everywhere it appears.

just in case that i havent said it yet, i want to make sure you come to me with previews of applicable things before pushing also, dont merge to main until i give permission at the very end after the 16 spec files are all done and approved. i want you to run through code rabbit but it should all standby. also the claude that was given the instructions to make these spec files doesnt know much about our apps current infrastructure so if needed ask me to confirm or give you more info on potential errors etc etc. 