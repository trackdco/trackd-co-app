# Session handover prompt

Paste everything below the line into a fresh Claude Code session with this repo
open. It puts a new session exactly where the last one ended.

Keep this file updated at the end of any long session.

---

I'm Adrian, founder of Trackd Co. You're picking up mid-project. Read this
whole message before doing anything.

## Read these first, in order

`Context/project-overview.md`, `Context/architecture.md`,
`Context/ui-context.md`, `Context/code-standards.md`,
`Context/ai-workflow-rules.md`, `Context/progress-tracker.md`,
`Context/next-tasks.md`, then `Context/HANDOVER-onboarding.md` (everything
still open on the current piece of work).

**This is Next.js 16, not 14.** Breaking changes from your training data:
`middleware` is now `proxy.ts`. Read `node_modules/next/dist/docs/` before
using any Next API you're unsure of.

## Where things stand

**`main` deploys STRAIGHT to Vercel production. Merge only on my explicit
word.** Production is currently at the wave3 review fixes plus a calculator
fix, and is green.

Two branches exist:

- **`wave3/onboarding-flow`** — a new anonymous onboarding flow at
  `/onboarding`, 14 steps. Pushed, **NOT merged**, previewable on Vercel. This
  is the active work.
- **`wave3/fixes`** — already merged into `main`. Nothing to do.

The onboarding flow has been through three build passes with me reviewing
screen by screen, and one full cold review (three agents: correctness,
UI/copy, and a browser execution pass). All CRITICAL and HIGH findings are
fixed and verified by execution. Gates: `npx tsc --noEmit`, `npx eslint .`,
`npx vitest run` (491 tests), `npm run build` — all clean.

## Decisions already made. Do not re-litigate these.

- **`ui-context.md` overrides everything**, including any spec file. The
  onboarding spec's §11 token table (`#060607`, `#F3A63C`, Playfair, Caveat,
  Lucide) was written by a different Claude session, contradicts `ui-context`,
  and is to be ignored.
- The demo is **ONE step with four stages**, never four routes. Pinned by a test.
- Housekeeping captures **name + photo** (overrides the spec's D-2), and Welcome
  greets with them.
- The **cost screen carries no price**. What a customer is charged depends on
  their region and only the billing provider knows it. The paywall's prices
  ($69.99/yr, $11.99/mo) are scaffolding until RevenueCat is wired.
- **Auth and payment are stubbed.** There is no RevenueCat integration on this
  project. `startTrial()` in `screens/paywall.tsx` is the single seam.
- **Kyle's background is deliberately not cut out** — his singlet is black and
  within a few points of the backdrop, so any automatic matte punches holes in
  his shirt. The image edge is feathered with a radial mask instead.
- Amber on a selected onboarding chip, and exactly two exclamation marks, are
  now sanctioned in `ui-context.md`. Both were my calls.
- The onboarding surface treatment (`.flow-canvas`, `.flow-card`) is scoped to
  `/onboarding`. The app-wide restyle is a separate spec — the prompt for it is
  `Context/PROMPT-app-surface-restyle.md`.

## How the work has to be done

- **Verify by EXECUTING, not by reading.** Every worthwhile finding on this
  project has come from measurement. Drive the real app in Chrome.
- Dev server: `npx next dev -H 0.0.0.0 -p <port>`. It points at **PRODUCTION
  Supabase**, so a signed-in session is real data. **Test on a throwaway
  account, never mine** — `mkuser.mjs` / `rmuser.mjs` patterns are in the
  scratchpad; delete the account and verify the cascade at 0 rows afterwards.
  Note `weight_logs` is keyed by `profile_id`, not `user_id`.
- Playwright: `chromium.launch({ channel: "chrome" })`, measure at **360, 390
  and 430**, capture `page.on('console')` and `page.on('pageerror')` every step.
- Work in a **git worktree** in the scratchpad, not the main checkout, so
  parallel agents don't collide. `node_modules` must be **hard-linked**
  (`cp -al`) — a symlink fails Turbopack with "points out of the filesystem
  root".
- Ranked findings: CRITICAL / HIGH / MEDIUM / LOW, each with `file:line`, what
  actually breaks, the exact reproduction, and **MEASURED** or **INFERRED**
  stated explicitly.

## TRAPS — every one of these has cost real time

- **Kill dev servers by PORT, not by name.** `pkill -f "next dev"` does NOT
  match: the process renames itself to `next-server`. Use
  `lsof -ti:<port> | xargs kill -9`.
- **A stale `.next` wedges `next dev`** — it accepts connections, serves the
  manifest, then hangs forever on "Compiling". `rm -rf .next` once before
  starting, then never again. **Never run `next build` while dev is up.**
- **"Compiling" is NOT broken. Wait longer.** First compile can take 30s+.
- **JSX drops whitespace between an expression and text across a line break.**
  This has produced "5days", "$0today" and "day 5unless" in this codebase. Use
  an explicit `{" "}`. **Check rendered DOM text, not a screenshot** — a
  screenshot will not tell you.
- **Tailwind cannot see an interpolated class name.** `` ease-[${VAR}] `` in a
  template literal is never generated. Write the literal out.
- **ESLint here bans `setState` in an effect body and reading a ref during
  render.** Use lazy `useState` initialisers, `useSyncExternalStore`, or
  callbacks.
- **Match controls on ROLE AND POSITION, never on a caption.** Captions are
  dynamic, and the sign-in form contains both "Sign in" and "Create an
  account" — picking the last button silently signs UP.
- **`git add -A` is not safe in this repo.** Stage deliberately.
- `git merge` has no `-F -`; write the message to a file.
- **Scratch files go in a temp directory, NEVER in the repo.**
- The **Supabase MCP needs OAuth and is not authorised**. Say so rather than
  guessing about live data; use the SQL Editor or the service key in
  `.env.local`. I apply migrations by hand.

## House rules

- Health data is **categorical, never evaluative**. No red/green on a reading,
  no "on track"/"behind", no targets on a biomarker.
- **No em dashes in any user-facing string.** Code comments are fine.
- Australian English.
- Styling from the documented presets/tokens in `ui-context.md`, never
  approximated. No hardcoded hex outside `app/globals.css`.
- Derived values are never stored. Nothing hard-deletes a compound.
- TGA: market the tracking tool, never an outcome. No dosing guidance, no
  "safe/safely", no fabricated statistics.
- Update `Context/progress-tracker.md` and `Context/next-tasks.md` after
  meaningful changes.

## What I want from you

Ask me questions when a decision is genuinely mine — I'd rather answer than
have you guess. If I'm away, make the call, do the work, and flag it clearly.
Tell me plainly what you could not verify and why.

Three things are open right now and are mine to decide, not yours:

1. **The hook screen names real compounds before the age gate** ("test e 250",
   "Testosterone Enanthate"). Spec §3.2 says substance-adjacent content comes
   after the gate. Fixing it means either genericising the best screen in the
   flow or moving it after housekeeping.
2. **The founder letter** — I said it could be better but haven't said what's
   wrong with it.
3. **Two tricep regions on the body map can't be tapped at their visual
   centre** (crescent geometry, bbox centre falls outside the fill). It comes
   from the shared artwork, so it may already affect the real site picker.

I still owe you: signature SVGs, a gym-floor photo for the hook, and better app
screenshots for the paywall carousel. All have wired slots — see
`Context/HANDOVER-onboarding.md`.
