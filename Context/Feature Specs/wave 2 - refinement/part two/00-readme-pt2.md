# TRACKD Overhaul Specs

Eighteen specs, one PR each, reviewed by CodeRabbit and merged to main before the next one starts.

## Instructions for Claude Code

Work on exactly ONE spec file per session, the one named in the
prompt. Do not read, reference, or act on any other file in this
folder unless explicitly told to.

If you notice something in the current spec that relates to
another spec, say so and stop. Do not implement it.

Do not start the next spec after finishing one. Each spec ends
at its Vercel preview link. The next one begins in a new session.

Several specs stop and require approval before implementation
continues. Those stops are not optional. Do not proceed past one.

## Session prompt

Start a new session per spec. Paste this, swapping the filename.

```
Implement specs/[FILENAME] and nothing else.

Rules for this session:
- That file is the only spec you work on. Do not open, read, or act
  on any other file in specs/. If you notice something that belongs
  to another spec, tell me and stop.
- Read ui-context.md, architecture.md, and code-standards.md first.
  Pull all styling, colours, fonts, and spacing from ui-context.md.
  Do not hardcode values.
- Work through the Implementation steps ONE AT A TIME. After each
  step, confirm it builds with no TypeScript or lint errors, then
  tell me what you did before moving on. Do not batch steps.
- Where the spec says to share, propose, audit, or get approval
  before implementing, stop and wait for my answer. Do not proceed
  past those points.
- Do not create new shared or reusable components without asking
  first.
- Do not change anything listed under Out of Scope, even if it looks
  like an easy win while you are in the file.
- When every Check When Done item passes, deploy to a Vercel preview
  subdomain and give me the link. Stop there. Do not commit, push,
  or open a PR until I have reviewed the preview.

Start with step 1 and wait for me before step 2.
```

If it drifts mid-session: "Stop. You are only working on [FILENAME],
step [N]. Show me what you changed and wait."

## Order

| # | File | Status | Depends on |
|---|------|--------|-----------|
| 01 | `01-dose-integrity.md` | Not started | Nothing. Must merge before anything else |
| 05 | `05-photo-adjust.md` | Not started | Nothing |
| 06 | `06-admin.md` | Not started | Nothing |
| 04 | `04-markers-by-sex.md` | Not started | 01 |
| 02 | `02-compound-lifecycle.md` | Not started | 01 |
| 03 | `03-add-compound.md` | Not started | 01, 02 |
| 08 | `08-containers.md` | Not started | Nothing. First of part two |
| 13 | `13-cycles.md` | Not started | 01, 08 |
| 12 | `12-stacks.md` | Not started | 01, 03, 08 |
| 09 | `09-homepage.md` | Not started | 01, 08 |
| 10 | `10-calendar.md` | Not started | 08, 13 |
| 11 | `11-protocol-page.md` | Not started | 08, 12, 13 |
| 14 | `14-calculator.md` | Not started | Nothing |
| 15 | `15-progress.md` | Not started | 05, 08, 09 |
| 16 | `16-profile.md` | Not started | 02 |
| 17 | `17-add-compound-form.md` | Not started | 01, 03, 08, 13 |
| 18 | `18-log-a-dose.md` | Not started | 01, 08, 17 |
| 07 | `07-global-sweep.md` | Not started | Everything else merged |

The table is in build order, not numeric order. Three things drive it:
01 unblocks nearly everything and goes first. 08 unblocks all of part
two. 07 goes last because every spec above it writes copy, and
sweeping before them means sweeping twice.

Update the Status column as you go, so any future session can pick up
mid-stream without re-explaining.

## Part one: fixes and small specs

**01 · Dose & Schedule Integrity**
Fixes the data layer. Altering a dose applies from the selected day forward with no retroactive rewriting and no compensating back-fill. Logging from a past day writes to that day. Finds the root cause of the deleted compound reappearing after signing out. Stops the time field pre-filling. Fixes Next Dose showing a dash while doses are due.

**02 · Compound Lifecycle**
Collapses active, archived and erased down to active and deleted. Delete stops future doses and keeps history. Bringing a compound back becomes the same action as adding any other. Removes the reactivate arrow, deletes the Archive page, restyles the delete warning from amber to red.

**03 · Add Compound Flow**
Renames the picker to "Add compound", freeing the word for Stacks. Rebuilds it as search, Recently used, then browse by category. Gates vial storage to injectables. Gives each compound its own default dose unit so peptides open on mcg and anabolics on mg.

**04 · Sex-Specific Markers**
Applies profile sex to the markers picker the way the body map already does. Filtering affects what can be logged going forward and never hides or deletes logged history.

**05 · Photo Adjust Step**
Zoom and reposition before saving, within a fixed aspect ratio, with faint guide lines. Applies to progress photos, bloodwork and the profile picture.

**06 · Admin Page**
Verifies the founder-only restriction is server-side, then turns the waitlist view into an operational one: active users, signups over time, usage totals, and a feedback queue.

**07 · Global Sweep**
Em-dashes out, wordiness cut, portrait lock. Runs last.

## Part two: components, features and layouts

**08 · Container Components**
The vial, bottle and tub as drawn SVG components, each taking a colour and a fill. Chosen by the compound's form. Everything else in part two renders these, so it goes first.

**09 · Homepage**
Weight and photos off. Underline week strip, collapsible. Greeting moves inside the Today's Log card. Next Dose gains a container image and resolves properly. Today card gains category dots. Journal quick action added. Injection sites untouched.

**10 · Calendar**
Cycles render as soft coloured fills behind on-days, with a key below the grid. Everything else about the calendar stays.

**11 · Protocol Page**
Plan and Stock merge into one page: a horizontal compound row ordered by category volume, stacks, the week schedule grid with its four cell states, and cycles.

**12 · Stacks**
A display grouping over compounds that stay fully independent. One row on the dashboard, expandable, logged in one tap. One compound, one stack.

**13 · Cycles**
On and off patterns with five end conditions. Off-cycle compounds disappear from the log entirely. Created from Protocol or from add-compound.

**14 · Reconstitution Calculator**
Presentation rebuild around a proportional syringe graphic. Three result cards, one input sheet, collapsible working, first-run disclaimer. No calculation changes.

**15 · Progress**
Photo card with a Running list beneath it, then a two-by-two grid of weight, journal, bloods and consistency. Default poses become Front, Side, Back.

**16 · Profile**
Settings dissolved in. Physical editable in place behind an edit toggle. Billing and Notifications as App rows. Destructive actions grouped into a bounded danger zone.

**17 · Add Compound Form**
The form restructure deferred from 03. Compound header with container, then rows in cards. Cycle option collapsed to one row.

**18 · Log A Dose**
Mirrors 17. Same header, same rows, less text. Body map unchanged.

## Locked decisions

Recorded here so they do not get re-litigated inside individual specs.

- **Stacks are a display grouping**, not containers. Members keep their own schedule, log and history. One compound belongs to at most one stack.
- **Cycles are not named.** Stacks are, using the codebase's existing character limits.
- **Off-cycle compounds disappear from Today's Log** entirely rather than being greyed.
- **Logging happens on the dashboard only.** Protocol views and edits.
- **Containers are drawn SVG**, never photography, chosen by form and coloured by category or stack.
- **Delete is the only verb.** Archive is removed. History is kept forever.
- **Missed doses are a hollow cell with a thin border**, not a diagonal slash.
- **Destructive confirmations use red.** Amber stays the accent everywhere else.
- **The global mg/mcg default does not change.** Units are set per compound.
- **Settings is removed entirely.**
- **Injection sites stays on the dashboard**, unchanged.
- **Compound category colour coding is unchanged** everywhere it appears.