# Prompt: ask Claude to write the app-wide surface restyle spec

**This file is not a spec. It is the PROMPT you paste to get one written.**

Adrian, you liked the surface treatment on `/onboarding` and want it through
the whole app plus the external surfaces. That is a big, cross-cutting change
and it deserves a spec before a single component is touched, or it turns into
forty screens each nudged slightly differently.

Paste everything below the line into a fresh Claude session with this repo
open. Do not paste it into a session that is mid-way through other work.

Two things to change before you send it:
- fill in the **PRIORITY** line with which surfaces matter most to you
- delete the **Open questions for Adrian** section if you would rather answer
  them in the conversation than have them written into the spec

---

Read these first, in order: `Context/project-overview.md`,
`Context/architecture.md`, `Context/ui-context.md`, `Context/code-standards.md`,
`Context/ai-workflow-rules.md`, `Context/progress-tracker.md`,
`Context/next-tasks.md`. This is Next.js 16, not 14, and the conventions differ
from your training data.

**Write a spec file, do not write any code.** Put it at
`Context/Feature Specs/wave 3/surface-restyle.md` and follow the shape of the
existing spec files: Goal, Out of Scope, Design Decisions, Implementation
(step-by-step, verifiable one step at a time), Open Decisions, Check When Done.

## What the spec is for

The onboarding flow at `/onboarding` (branch `wave3/onboarding-flow`) shipped a
surface treatment that Adrian much prefers to how the app currently looks. Two
CSS classes in `app/globals.css` carry almost all of it:

- **`.flow-canvas`** — a radial lift at the top of the page falling to
  `--bg-base`, so a dark screen reads as lit rather than as a void
- **`.flow-card`** — an inset hairline of 5% white along a card's top edge plus
  a soft drop shadow, so cards sit ON the canvas instead of being holes cut out
  of it

Both are mixed FROM the existing tokens with `color-mix`, so no hex escapes
`globals.css` and a palette retune carries them. They are documented in
`ui-context.md` under "Surface treatment: the canvas is lit and cards have
depth", which currently scopes them to `/onboarding` only.

The spec's job is to define how that treatment rolls through the rest of the
product **without** the app ending up with four slightly different cards.

## What it must cover

1. **An inventory.** Every surface that would change, grouped: the five tab
   screens, every bottom sheet, the modals and confirms, the empty and loading
   states, and the external surfaces (`/login`, `/welcome`, `/waitlist`, the
   legal pages, the desktop interstitial, the PWA splash).
2. **The rules, written down.** Which elements get `.flow-card` and which
   deliberately do not. In particular: does a nested surface
   (`--bg-surface-raised` inside `--bg-surface`) get depth too, or would that
   read as boxes-in-boxes, which `ui-context.md` already bans?
3. **The restraint.** This is one hairline and one shadow. The spec must say so
   plainly and say what "too much" looks like, because the failure mode here is
   an app that reads as generated rather than designed, which is the exact thing
   Adrian is trying to get away from.
4. **Contrast.** `next-tasks.md` records that `--text-muted` on `--bg-surface`
   is already **3.95:1**, under the 4.5:1 floor. A lighter canvas at the top of
   the page changes that ratio on every screen. The spec must state whether the
   treatment makes it worse and what the answer is.
5. **Order of work**, so it can land in reviewable pieces rather than one
   unreviewable diff, and so a half-finished state never looks broken.
6. **How it gets verified.** This project has learned to trust measurement over
   reading: the spec should say what gets driven in a browser and at which
   widths (360 / 390 / 430 is the house set).

## Constraints that are not negotiable

- **`ui-context.md` overrides everything**, including this prompt and including
  anything a previous spec said (Adrian, 2026-08-01). If the restyle needs the
  doc changed, the spec says so and the doc changes first.
- No hardcoded hex outside `app/globals.css`.
- `components/ui/**` is protected; theme through the token map, never by
  restyling generated files.
- Health data stays categorical, never evaluative. No red/green on a reading.
- No em dashes in user-facing strings.
- Australian English.
- Do not restyle by hand, screen by screen. If a treatment is worth having it
  belongs in a shared class or preset, per "never invent a one-off per screen".

## Out of scope for this spec

- The onboarding flow itself, which is where the treatment came from and is
  already done
- Any change to the palette, the type scale, or the spacing scale
- Any behaviour change at all: this is surfaces only

## PRIORITY

_(Adrian: fill this in. Which surfaces matter most? My guess at the order would
be the five tab screens first, then sheets, then the external pages, but it is
your call and it should be written down.)_

## Open questions for Adrian, to raise before writing

- Does the lit canvas apply to every screen, or only to full-screen moments?
  A gradient behind a dense data screen may fight the data.
- The bottom nav is translucent with a backdrop blur. Does it stay as-is over a
  lit canvas, or does it need retuning?
- The desktop interstitial and the legal pages are seen by people who are not
  users yet. Do they get the full treatment or a quieter version?
