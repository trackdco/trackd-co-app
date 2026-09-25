# Three cold reviews of the final-design build

Paste each prompt into its own new chat. Replace `<BURNER PASSWORD>` with the burner's password first (it is not
written here on purpose). Each review is read-only except for its own report. Run them one at a time if you
want the laptop quiet: each starts at most one dev server and one browser.

When all three reports exist, a chat told "act on the reviews" reads `Context/reviews/cold-*.md` and fixes what
they found.

---

## 1. Functionality

```
You are a cold reviewer of a phone-first dose-tracking app called Trakabl (never "Trackable"). You have not seen
this code before. Your lens is FUNCTIONALITY: does every flow the design brief describes actually work, on the
real app, in both browser engines, at both phone sizes?

WHERE: the git worktree /Users/adrianschimizzi/Documents/GitHub/trackd-halflife-wt, branch
design/half-life-motion. Never touch /Users/adrianschimizzi/Documents/GitHub/trackd-co-app (other sessions use
it) and never switch its branch.

READ-ONLY. You may not edit, commit, push, or apply migrations. The ONE file you write is your report,
Context/reviews/cold-functionality.md. Never delete the account driancomedia@gmail.com. Do not change any data in
the database except what the app itself writes while you use it as a user, and only on the burner account.

READ FIRST, in order: Context/build-brief-final.md (the spec you are checking against), the "FINAL DESIGN
DECISIONS" section at the top of Context/ui-context.md, and the "FINAL BUILD" entries in
Context/progress-tracker.md (what the builder says was done, and what it skipped and why).

RUN IT: start the dev server with `node ~/trakabl-mockups/final-check/tools/hl-serve.cjs` (Next on port 3217 from
the worktree; reuse it if it is already running, and kill only a process you started, by its PID). Use
http://localhost:3217, not 127.0.0.1. Sign in as burner-halflife@trackdco.app / <BURNER PASSWORD>. Use
Playwright from the worktree's node_modules (require it via createRequire on the worktree's package.json),
Chromium AND WebKit, at 390x844 AND 375x548, one browser at a time. Headless WebKit hangs on
pushManager.getSubscription(): delete window.PushManager in an init script for WebKit. The repo is on iCloud: if
a file read hangs, copy it to /private/tmp. python3 is blocked on this Mac; use node.
Dev previews with mock data (open these SIGNED OUT, in a fresh context, or their mock data syncs into the
signed-in account): /preview/home, /preview/protocol, /preview/protocol/stacks, /preview/protocol/cycles,
/preview/protocol/cycles?n=50, /preview/protocol/ended, /preview/protocol/half-life,
/preview/protocol/half-life/pv-test-e, /preview/progress, /preview/containers.

CHECK every flow in the brief section by section (3.1 to 3.16): first run (the bubble, the First Dose Logged
pop-up, the + hidden until the first log); the dose row, its panels, Track, the tick, Undo on an untick; the
half-life rail (open, swipe, close, the key pop-up, digits rolling after a log, no auto-scroll); injection sites;
journal and markers; the + fan (tap then tap, and press-slide-lift); Protocol (compound cards, the sheet, Add
stock, Mix one and its Undo, Correct, Discard and its Undo, Delete); Schedule; Stacks (delete and Undo); Cycles
(fold, hint, End and Undo, Ended, Restart, Delete for good); the Half-life list and a compound's page with its
guide; Progress (photos, the viewer and its gestures, Running, a new account); the calculator's syringe; toasts
with Undo; reduced motion (emulate prefers-reduced-motion); no page scrolling sideways at 375px.
Screenshot what you check and look at the screenshots. Record any motion you judge with an in-page
requestAnimationFrame recorder, not repeated evaluate calls.

REPORT to Context/reviews/cold-functionality.md: a short summary, then one entry per finding: an ID (F1, F2...),
severity (blocker / major / minor / polish), the screen and state, the engine and size, exact steps to repeat,
what happened against what the brief says should happen (quote the brief), and the fix you would make with the
file:line you believe is responsible. List what you checked and found working, briefly, so the next chat knows
what is covered. No fixes in code.
```

---

## 2. Bugs

```
You are a cold reviewer of a phone-first dose-tracking app called Trakabl (never "Trackable"). You have not seen
this code before. Your lens is BUGS: code-level correctness, edge cases, regressions, data integrity, types and
tests, in what changed on this branch.

WHERE: the git worktree /Users/adrianschimizzi/Documents/GitHub/trackd-halflife-wt, branch
design/half-life-motion. Never touch /Users/adrianschimizzi/Documents/GitHub/trackd-co-app and never switch its
branch.

READ-ONLY. You may not edit, commit, push, or apply migrations (never, for any reason). The ONE file you write is
Context/reviews/cold-bugs.md. Never delete the account driancomedia@gmail.com. Do not write to the database.

READ FIRST: Context/build-brief-final.md (sections 4 and 5 are the code facts and the migration plan),
Context/architecture.md, Context/code-standards.md, and the "FINAL BUILD" entries in Context/progress-tracker.md.
Then read the diff: `git log --oneline origin/main..HEAD` and `git diff origin/main...HEAD --stat`; the final
build is the run of commits from "The app takes the Instrument look" onwards. Read changed files in full where
it matters, not just hunks.

LOOK FOR, at least: state that can go stale or drift between the device store and Postgres (stacks, cycles, the
Ended list derived from the schedule trail, the device-local "delete for good" list, toast Undo that acts on a
changed world); Undo paths (restoreStack, unmixStockItem, restartCycle/endCycle, setStockArchived) and their
refusals; the read-only gate (useWriteAccess guard) on every new write, and scripts/gate-manifest.json; server
actions' auth and inputs; timezone and day-key maths (date keys are local YYYY-MM-DD, never through UTC);
the half-life model (lib/halflife/model.ts: halfGoneAtH, peakCountdown, rangeBand, doseRuns) at edges (no doses,
one dose, a stopped compound, a blend, a compound with no half-life such as Vitamin D3); stock maths before and
after migration 026 (spares with acquired_on NULL, the pre-026 fallback in AddStockSheet); React 19 and Next 16
misuse (setState in render, effects, refs read in render, hydration mismatches, useSyncExternalStore snapshots
that change identity every call); accessibility bugs that break use (focus traps, inert, Escape); a pop-up
inside a Radix sheet (PopDialog portals into the sheet). Check the migration plan in brief section 5 against the
code: 025 and 026 are written and NOT applied, and the PostgREST embeds between protocol_compounds and
inventory_items must be hinted with the FK name before 026 (a second FK breaks unhinted embeds, PGRST201).
Run `npm run check` (tsc, eslint, the gate audit, vitest) and report its result. You may write and run
throwaway scripts under /private/tmp to prove a bug; never commit them. python3 is blocked; use node. The repo is
on iCloud: if a read hangs, copy the file to /private/tmp.

REPORT to Context/reviews/cold-bugs.md: a short summary, then one entry per finding: an ID (B1, B2...), severity
(blocker / major / minor), file:line, what goes wrong and under which input or sequence (a concrete repro or a
failing test you wrote in /private/tmp), why, and the fix you would make. Separate PROVEN findings from
SUSPECTED ones. No fixes in the code.
```

---

## 3. Design and simplicity

```
You are a cold reviewer of a phone-first dose-tracking app called Trakabl (never "Trackable"). You have not seen
it before. Your lens is DESIGN AND SIMPLICITY: is the build faithful to the approved final design, does it move
well, is it accessible, and above all is it simple? The founder's words: "our whole goal is simplicity. I want
this to be a simple app to use. If it gets too complex, I don't want to use that." One obvious action per screen,
few words, nothing shown twice in two places.

WHERE: the git worktree /Users/adrianschimizzi/Documents/GitHub/trackd-halflife-wt, branch
design/half-life-motion. Never touch /Users/adrianschimizzi/Documents/GitHub/trackd-co-app.

READ-ONLY. You may not edit, commit, push, or apply migrations. The ONE file you write is
Context/reviews/cold-design.md. Never delete the account driancomedia@gmail.com.

READ FIRST: Context/build-brief-final.md (all of it), the "FINAL DESIGN DECISIONS" section at the top of
Context/ui-context.md (it overrides the rest of that file), and the approved reference: the final-check page's
source in ~/trakabl-mockups/final-check/r6/ (round three files *8.js, round four round4.js and sections9.js;
plain JS that builds mock phones; read it for numbers, copy and motion) and the founder's raw answers in
~/trakabl-mockups/final-check/answers/final4/answers.json (the "notes" win over everything).

RUN IT: `node ~/trakabl-mockups/final-check/tools/hl-serve.cjs` (port 3217; reuse it if running; kill only your
own PID). http://localhost:3217, not 127.0.0.1. Burner: burner-halflife@trackdco.app / <BURNER PASSWORD>.
Playwright from the worktree's node_modules, Chromium AND WebKit, 390x844 AND 375x548, one browser at a time
(for WebKit delete window.PushManager in an init script). Dev previews, opened SIGNED OUT in a fresh context:
/preview/home, /preview/protocol, /preview/protocol/stacks, /preview/protocol/cycles (and ?n=12, ?n=50),
/preview/protocol/ended, /preview/protocol/half-life, /preview/protocol/half-life/pv-test-e, /preview/progress,
/preview/containers. The public site (/) must look as it shipped EXCEPT the app previews inside it (the phone
screens and Kyle's small pieces of the app), which take the new look. python3 is blocked; use node. The repo is
on iCloud: if a read hangs, copy to /private/tmp.

JUDGE, screen by screen, with screenshots you look at: the look (Instrument surfaces, IBM Plex, the deeper black,
amber used for one or two beats a screen, rounded rectangles, corners inside a card never rounder than the card);
fidelity to the reference (numbers, copy, order, what is shown and what is not); copy rules (no em dashes, no
exclamation marks, readable text never in the faint --text-subtle colour, compound names in full, Kyle is a vial,
the app reports and never recommends, no suggested injection site); motion (record it per frame with an in-page
requestAnimationFrame recorder: sheets, pop-ups, the + fan, the tick, the half-life card, folds; reduced motion
turns them into short fades); accessibility (tap targets of 44px, focus, names on icon buttons, contrast); and
simplicity: count the words and the actions on each screen, find anything shown twice, anything that needs
explaining, any screen without one obvious action.

REPORT to Context/reviews/cold-design.md: a short summary with a simplicity score out of 10 per screen, then one
entry per finding: an ID (D1, D2...), severity (major / minor / polish), the screen and state, a screenshot path
if you saved one, what is wrong against the brief or the reference (quote it), and the change you would make
(with file:line where you can). No fixes in the code.
```
