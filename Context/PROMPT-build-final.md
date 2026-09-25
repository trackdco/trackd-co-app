Trakabl: build the final design, overnight, then hand me reviews to run.

You're the builder. The design is finished: four rounds on https://claude.ai/artifact/2Mnj2qS3FKxiSNsNPjxiv1 and
a round of questions. Everything you build is in one brief. I'm asleep while you work, so don't wait for me.

Your working directory is probably the main checkout, which another session uses. Use absolute paths everywhere.
- Worktree: /Users/adrianschimizzi/Documents/GitHub/trackd-halflife-wt, branch design/half-life-motion.
- The brief: /Users/adrianschimizzi/Documents/GitHub/trackd-halflife-wt/Context/build-brief-final.md
- The visual reference: the page above. Its source is ~/trakabl-mockups/final-check/r6/ (round three *8.js,
  round four round4.js and sections9.js). My raw answers are in ~/trakabl-mockups/final-check/answers/.
  History and verified code facts: ~/trakabl-mockups/final-check/handover/reference.md.

Read, in this order, before any code:
1. CLAUDE.md and AGENTS.md in the worktree. This is Next 16: read the relevant guides in
   node_modules/next/dist/docs before writing code, and heed deprecations.
2. The worktree's Context files in order: project-overview, architecture, ui-context (its new top section,
   "FINAL DESIGN DECISIONS", overrides the rest), code-standards, ai-workflow-rules, progress-tracker, next-tasks.
3. Context/build-brief-final.md. It is the one document you build from; it wins over older notes.

Skills: load impeccable, apple-design, ux-heuristics and frontend-design (installed in ~/.claude/skills). Also
read the two "least AI" taste skills from GitHub, since they aren't installed:
`gh api repos/Leonxlnx/taste-skill/contents/skills/taste-skill/SKILL.md --jq .content | base64 -d` and
`gh api repos/Nutlope/hallmark/contents/skills/hallmark/SKILL.md --jq .content | base64 -d`.

Rules (my words, binding):
- "All work so far is on branch design/half-life-motion in the worktree
  /Users/adrianschimizzi/Documents/GitHub/trackd-halflife-wt (pushed, NOT merged). Work only there. Never touch
  the main checkout /Users/adrianschimizzi/Documents/GitHub/trackd-co-app or switch its branch; other sessions
  use it."
- "Commit on the branch in the repo's style." (Plain-English sentence subjects; end each message with the
  Co-Authored-By trailer your session gives you.)
- "Push this branch only when I ask. Never push or merge to main." Do not push at the end either.
- "Never apply a migration without my yes." 025/026 stay held until the merge (plan in the brief, §5).
- "Never delete driancomedia@gmail.com."
- "Don't touch admin or landing." One exception from me: the app previews inside landing's sections must show
  the new look. Nothing else on landing.
- "The app must feel simple and not overwhelming: few words, one obvious action per screen." My whole goal is
  simplicity; if something gets complex, simplify it.
- "Keep the laptop light: one dev server and one browser at a time." Kill only your own processes, by PID.
- Copy: no em dashes and no exclamation marks in UI copy; never readable text in --text-subtle; Kyle is a vial,
  never a jar; the name is Trakabl, never "Trackable"; compound names in full; never a suggested site, and no
  advice (Apple 1.4.2).
- Out of scope (a separate spec): dose, protocol, cycle and vial event actions (the Cycles-page Pause/Resume
  button, anything that STOPS a compound), cycle ramps and complex patterns, logging a dose on another day.
- The calculator needle, the nav icons and the containers are IN this build now: rebuild them in the new look
  as the brief says.
- Don't check in between steps except for a decisions page, a migration, or a spec that contradicts the code.
  I'm asleep, so when you hit one of those, write it down, skip that piece, and carry on with the rest.
- Use node for scripts (python3 is blocked by the Xcode licence). zsh `node -e` breaks on apostrophes, so write
  scripts to files. The repo is on iCloud: if a tool hangs on a file, copy it to /private/tmp rather than wait.

How to build: follow the brief's §7 phases in order. After each phase:
- Check every change at 390x844 AND 375x548, in Chromium AND WebKit, and look at the screenshots yourself.
  Record motion per frame with an in-page requestAnimationFrame recorder, not evaluate round-trips.
- Run `npm run check` until it's green.
- Update Context/progress-tracker.md (state) and Context/next-tasks.md (steps), and commit.
- Write a few plain lines on what you did.
Run `next build` at the end.

Test setup:
- Dev server: `node ~/trakabl-mockups/final-check/tools/hl-serve.cjs` (Next on 0.0.0.0:3217 from the worktree;
  reuse it if it's already running). Use http://localhost:3217, not 127.0.0.1 (the cookies are for localhost).
- Burner account: burner-halflife@trackdco.app / <burner password: in the pasted prompt>. Log in with
  `BURNER_PW=... node ~/trakabl-mockups/final-check/drive.cjs chromium 390x844 ~/trakabl-mockups/final-check/tools/s-login.cjs`
  (drive.cjs loads Playwright from the worktree's node_modules; Chromium uses channel "chromium").
- Dev preview pages: /preview/home and /preview/protocol/*.
- One server, one browser, at a time.

When every phase is done (brief §9):
1. Run a sample user: walk the real app on the burner as a first-time user who runs TRT and two peptides, and
   write their honest thoughts per feature to Context/reviews/sample-user.md, with screenshots.
2. You can't open new chats, so write three cold-review prompts (functionality; bugs; design and simplicity),
   each standalone and read-only except for writing its report to Context/reviews/cold-<lens>.md. Save them
   to Context/reviews/PROMPTS.md.
3. Don't push.
4. Your last message is my good-morning message. Open it with a motivational quote you make up yourself (not a
   famous one), then a short summary of the build per phase, anything waiting on me (a migration, a spec
   clash), the sample user's main points, and the three review prompts, ready to paste into three new chats.
