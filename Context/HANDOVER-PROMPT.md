# Session handover prompt

Paste everything below the line into a fresh Claude Code session with this repo
open. It puts a new session exactly where the last one ended.

Keep this file updated at the end of any long session.

---

I'm Adrian, founder of Trackd Co. You're picking up mid-project. Read this whole
message before doing anything.

Read these first, in order: `Context/project-overview.md`,
`Context/architecture.md`, `Context/ui-context.md`, `Context/code-standards.md`,
`Context/ai-workflow-rules.md`, `Context/progress-tracker.md`,
`Context/next-tasks.md`, then `Context/HANDOVER-onboarding.md`.

This is Next.js 16, not 14. `middleware` is now `proxy.ts`. Read
`node_modules/next/dist/docs/` before using any Next API you're unsure of.

## Where things stand

`main` deploys STRAIGHT to Vercel production. Merge only on my explicit word.
Prod is green.

**`wave3/onboarding-flow`** is the active work: an anonymous 14-step onboarding
flow at `/onboarding`. Pushed, NOT merged.

It has had several build passes with me reviewing screen by screen, plus three
cold-review agents (correctness, browser execution, copy/UI/TGA) whose findings
are all fixed. Gates on the branch: `tsc`, `eslint`, **503 tests**, `next build`
all clean.

**It is good on a computer and still has problems on my phone.** I am writing a
spec file for those. Do not start guessing at them: wait for the spec.

## The one rule that matters most here

**Verify by EXECUTING, not by reading.** Every worthwhile finding on this project
came from measurement. In the last session alone, reading the code would have
missed all of these, and each was found only by driving the real page:

- The progress bar drew straight THROUGH every headline on a notched iPhone
  (desktop reports a 0 safe-area inset, so it is invisible anywhere else).
- The Next button on the demo was 221px below the fold with nothing to scroll it
  into view.
- Nobody could get past the age gate on an iPhone at all, because iOS renders
  `<input type="date">` as a wheel that fires `change` with empty values
  mid-pick, wiping a date the user had already committed.
- The paywall could be paid for without the price ever being on screen.
- A CSS rule sat unserved while the file on disk was correct.

## Traps — every one cost real time

- **A stale `.next` serves stale CSS.** A rule can be correct on disk and absent
  from `document.styleSheets`. Confirm a new rule is actually served before
  concluding anything about it. `rm -rf .next` once, then never.
- **Check which server you are measuring.** There is a preview worktree pinned to
  a commit and a working worktree. I lost a run of measurements to testing the
  wrong one. Assert something you just wrote is present in the served output.
- **Next 16 refuses a second dev server on the same directory.** Use a separate
  worktree, not just a separate port.
- Kill dev servers **by PORT**. `pkill -f "next dev"` does NOT match; the process
  renames itself to `next-server`.
- **"Compiling" is NOT broken.** Wait longer.
- Never `next build` while a dev server is up.
- JSX drops whitespace between an expression and text across a line break. Use
  `{" "}`. Check rendered DOM text, not a screenshot.
- Tailwind cannot see an interpolated class name. Write literals out.
- **`next/image` cannot inherit `currentColor`.** It renders an `<img>`, so an
  SVG loaded through it resolves the fill against its own default and can never
  take a token colour. Anything that has to be themed must be INLINE.
- **Two classes that both set `animation` fight, and one silently wins.**
  Measured: a nudge never played because `animate-flow-in` sat on the same
  element. Give each its own node.
- **Overlapping Tailwind arbitrary variants are ordered by the generated
  stylesheet**, not by you. Two `@media (max-height: …)` utilities on one element
  resolved the wrong way round. Put ordered rules in `globals.css`.
- ESLint bans setState in effect bodies and ref reads during render.
- Match controls on ROLE AND POSITION, never a caption. On the paywall,
  "Continue with Google" is a button matching `/continue/` that is NOT the CTA.
- `git add -A` is not safe here. Scratch files never in the repo.
- Supabase MCP is not authorised — say so rather than guessing; I apply
  migrations by hand.

## The layout model, and why it is written down

The flow is a **fixed-height shell**: pinned header, pinned footer, each screen
scrolls its own body. I asked for one scrolling page instead, then reversed it
the same day, so both have been built.

**The two models need opposite things from the same flag.** Pinned needs
`min-h-0` on every flex ancestor so the column can shrink and the footer stays
put. One page needs none of them, because a flex item's default
`min-height: auto` is the only thing stopping it being squashed. Each model's
rule is the other's bug, and both bugs have now shipped once. Do not half-mix
them. `ui-context.md` → "a full-screen flow is PINNED" has the detail.

Sizing is `svh`, never `dvh`. `dvh` tracks the current browser-chrome state, so
it moves the layout as Safari's bar comes and goes; that was my original report.

## What I owe you

- ~~Signature SVGs~~ **DROPPED.** They were built, wired and animated, and I
  looked at them and did not want them. All of it is deleted: the art module,
  the animation, the slot. **Do not offer to put them back** — the letter's
  sign-off is a rule, a "Best," and the two names now, and it fits a phone
  without scrolling. My original exports are still in
  `public/images/signature svg/` if I change my mind, but that is my call to
  make, not a loose end for you to tidy.
- **A gym-floor photo** → `public/onboarding/hook-backdrop.jpg`, then set
  `HOOK_BACKDROP` in `screens/hook.tsx`. The settle animation is already wired.
- **Better app screenshots** →
  `public/onboarding/app-{home,protocol,calculator,progress}.png`. The current
  ones are captures of `/preview/*` and go stale when a screen changes.
- **The phone-issues spec.** Coming.

## What I still have to run

**`supabase/onboarding/001_signup_attribution.sql` is APPLIED** (2026-08-01).
Nothing writes it yet — attribution lives on the anonymous device session and
there is no account to attach a row to until auth is wired at the paywall. How
it gets read back is still my open decision, spelled out at the foot of the file
(service-role aggregate vs a founder-only SELECT policy). Nothing else is
pending; every other migration is live.

## The UI style discussion — carry this forward

The onboarding flow is where the treatment I want got worked out, and it is the
reference the app-wide restyle should point at rather than a moving target:

- **`.flow-canvas`** — a radial lift at the top of the page falling to
  `--bg-base`. A full-screen dark surface with no gradient reads as a void; a few
  percent of light at the top reads as lit.
- **`.flow-card`** — an inset hairline of 5% white along a card's top edge plus a
  soft drop shadow. Depth, not decoration.
- Both mixed from tokens with `color-mix`, so no hex escapes `globals.css` and a
  palette retune carries them.
- **Restraint is the point.** One hairline and one shadow, not a glass-morphism
  kit: the moment surfaces start glowing it reads as generated rather than
  designed.
- Applies to `/onboarding` ONLY for now. Rolling it through the app is its own
  deliberate pass, not something to sprinkle screen by screen.
- **Contrast matters for that pass**: `--text-muted` on `--bg-surface` is 3.95:1,
  under the AA floor, and lighting the canvas changes that ratio on every screen.

`Context/PROMPT-app-surface-restyle.md` is the prompt for getting that SPEC
written. It is not the spec and not the work.

## Previewing on my phone

`npm run dev -- -p 3100 -H 0.0.0.0` in a worktree, then open
`http://<mac-lan-ip>:3100/onboarding` on a phone on the same wifi
(`ipconfig getifaddr en0`). No Vercel SSO, no deployment-protection toggle, and
it hot-reloads. `next.config.ts` already allows the RFC 1918 ranges as dev
origins, and `devIndicators: false` keeps Next's own badge off the screen (it was
sitting on top of the consent tick and the CTA).

## House rules

Health data categorical, never evaluative. No em dashes in user-facing strings.
Australian English. Documented presets only, no hex outside `globals.css`. No
stored derived values. TGA: market the tool, never an outcome; no dosing
guidance, no "safe", no invented stats. `ui-context.md` OVERRIDES every spec
file, including the onboarding spec's own §11 token table, which contradicts it
and is ignored. Update `progress-tracker.md` and `next-tasks.md` after
meaningful changes.

## Settled — do not re-litigate

- The demo is ONE step with four stages, never four routes. Pinned by a test.
- The hook names NO compound. It sits before the age gate and is a public
  marketing surface, and an age gate is not what makes naming a
  prescription-only substance in promotional copy acceptable. (The same
  reasoning reaches our website, which still does. My call, still open.)
- Auth and payment are stubbed. `startTrial()` in `screens/paywall.tsx` is the
  single seam. Prices are scaffolding until RevenueCat.
- The cost screen carries no price: what a customer is charged depends on their
  region and only the billing provider knows it.
- Kyle is a VIAL, never a jar. His background is deliberately not cut out — his
  singlet is black and within a few points of the backdrop, so any automatic
  matte punches holes in it. The edge is feathered with a radial mask.
- At least one answer is required on both intent screens.
- "And plenty more." appears only when "Something else" is picked.
- The injection-site stage does NOT auto-advance. The Next button nudges instead.
- Amber on a selected chip, and exactly two exclamation marks, are sanctioned in
  `ui-context.md`.
