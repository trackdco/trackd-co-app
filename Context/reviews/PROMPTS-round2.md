# Round two: cold reviews of the walkthrough build

Two prompts, each for its own new chat. Replace `<BURNER PASSWORD>` first (it is not written here on purpose). If you
only have room for one, run the first: it covers what you asked for. Each review is read-only except for its own report.
Run them one at a time so the laptop stays quiet.

When the reports exist, tell the build chat "act on round two": it reads `Context/reviews/cold2-*.md` and fixes what they
found.

---

## 1. Your walkthrough, checked on the real app

```
You are a cold reviewer of a phone-first dose-tracking app called Trakabl (never "Trackable"). You have not seen this
code before. Your lens: did the build do what the founder, Adrian, asked for in his walkthrough, and does every flow it
touched still work, on the real app, in both browser engines, at both phone sizes? Judge the look too: calm, few words,
one obvious action per screen.

WHERE: the git worktree /Users/adrianschimizzi/Documents/GitHub/trackd-halflife-wt, branch design/half-life-motion.
Never touch /Users/adrianschimizzi/Documents/GitHub/trackd-co-app (other sessions use it) and never switch its branch.

READ-ONLY. You may not edit, commit, push, or apply migrations. The ONE file you write is your report,
Context/reviews/cold2-walkthrough.md. Never delete the account driancomedia@gmail.com. Do not change data in the
database except what the app itself writes while you use it as a user, and only on the burner account.

READ FIRST: Context/next-tasks.md, the sections "Adrian's rulings on the review questions" and "Adrian's walk of the
preview" (W1 to W52: his words, reworded, each marked Done / Partly done / Not done by the builder, plus "For Adrian to
look at" and "Choices I made"). Then the top section of Context/progress-tracker.md, the FINAL DESIGN DECISIONS section
at the top of Context/ui-context.md, and Context/markers-spec.md (how the markers must look). The approved mockups are
in ~/trakabl-mockups/final-check/r6/ (markers8.js, cycles8.js, proto8.js, stock8.js, prog8.js, home8.js, extra8.css).

RUN IT: start the dev server with `node ~/trakabl-mockups/final-check/tools/hl-serve.cjs` (Next on port 3217 from the
worktree; reuse it if it is already running; kill only a process you started, by its PID). Use http://localhost:3217,
not 127.0.0.1. If pages 404 or show old CSS, stop the server, move .next/dev/cache/turbopack aside (never delete .next)
and start it again. Sign in as burner-halflife@trackdco.app / <BURNER PASSWORD>. Use Playwright from the worktree's
node_modules (require it via createRequire on the worktree's package.json), Chromium AND WebKit, at 390x844 AND
375x548, one browser at a time. Headless WebKit hangs on pushManager.getSubscription(): delete window.PushManager in an
init script for WebKit. The repo is on iCloud: if a file read hangs, copy it to /private/tmp. python3 is blocked; use
node. Mock-data previews (open them SIGNED OUT in a fresh context, or their data syncs into the account):
/preview/home, /preview/protocol, /preview/protocol?n=12, /preview/protocol/stacks, /preview/protocol/cycles,
/preview/protocol/ended, /preview/protocol/half-life, /preview/progress.

CHECK every ruling and every W item against Adrian's words, one by one: is it built, does it work, does it look right,
does its motion feel calm (and turn into a fade under prefers-reduced-motion)? Then the flows around them: Protocol
(cards, the stacked tiles, the compound sheet's stock, Add stock, Mix, Correct, Discard), Schedule, Stacks (new, the
same name twice, no colour, adding a compound from inside the editor, Cancel), Cycles (add a Continuous cycle and save
it, edit, End and Undo, Ended, Restart, the Timeline's scrub and press and hold), Half-life (the compound page, a blend,
the Home card), Home's journal (opens upwards, markers, photos, save without a jump), the full-page journal writer, the
+ (press, slide, lift; Add stock's compound picker; Weight; Journal), Progress photos and poses, bloods, blocks, the
calculator's syringe, every date field (none wider than the screen). No page may scroll sideways at 375. No control
may show for something not built yet, and no Save may sit disabled without saying why. Screenshot what you check and
look at the screenshots. Record motion with an in-page requestAnimationFrame recorder, not repeated evaluate calls.

REPORT to Context/reviews/cold2-walkthrough.md: a short summary, then one entry per finding: an ID (R1, R2...), the
W-id or ruling it concerns, severity (blocker / major / minor / polish), the screen and state, the engine and size,
exact steps, what happened against what Adrian asked for (quote him), and the fix you would make with the file:line you
believe is responsible. Then a table of every ruling and W-id: works / partly / not built / broken. No fixes in code.
```

---

## 2. Bugs in what changed

```
You are a cold reviewer of a phone-first dose-tracking app called Trakabl (never "Trackable"). You have not seen this
code before. Your lens is BUGS: code-level correctness, edge cases, regressions, data integrity, sync, types and tests,
in what changed today.

WHERE: the git worktree /Users/adrianschimizzi/Documents/GitHub/trackd-halflife-wt, branch design/half-life-motion.
Never touch /Users/adrianschimizzi/Documents/GitHub/trackd-co-app and never switch its branch.

READ-ONLY. You may not edit, commit, push, or apply migrations (never, for any reason). The ONE file you write is
Context/reviews/cold2-bugs.md. Never delete the account driancomedia@gmail.com. Do not write to the database.

READ FIRST: Context/architecture.md (the Storage Model: device-first stores synced to Postgres), Context/code-standards.md,
the top section of Context/progress-tracker.md, and in Context/next-tasks.md the sections "Adrian's rulings on the
review questions" and "Adrian's walk of the preview". Then the diff: `git log --oneline 6eb5062..HEAD` and
`git diff 6eb5062..HEAD --stat` (everything after the first round of reviews). Read the changed files in full where
they hold logic; follow callers of anything whose behaviour changed.

LOOK FOR: logic that is wrong at the edges (midnight, clock changes, time zones, empty and huge data, a compound with
no stock, blends, IU against mg, paused and ended cycles, a stack with a duplicate name), races between device stores,
hydration and pushes, state that survives when it should not (remounts, reopening quickly, double taps), anything that
writes to the database outside the read-only gate, anything that needs migrations 025 or 026 (not applied) without a
working fallback, controls that do nothing, and accessibility faults (focus, names, 44-point targets). Prove what you
can: write throwaway tests under /private/tmp/cold2bugs (not in the repo) and run them with the worktree's vitest.
`npm run check` must pass; say if it does not. The repo is on iCloud: if a read hangs, copy to /private/tmp. python3
is blocked; use node.

REPORT to Context/reviews/cold2-bugs.md: a short summary, then one entry per finding: an ID (C1, C2...), severity
(blocker / major / minor), file:line, what goes wrong and when, the proof (test path and result, or exact steps), and
the fix you would make. Then what you checked and found sound. No fixes in code.
```
