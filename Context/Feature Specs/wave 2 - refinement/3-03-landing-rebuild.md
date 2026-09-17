# Spec 3-03: the landing page, rebuilt from Adrian's sketch

**Status:** briefed 2026-09-17; **built 2026-09-17** on `feat/landing-3-02`
(PR #66, unmerged, awaiting Adrian). Decisions taken during the build are in
§9; what he still owes is §8. This SUPERSEDES the page built under
spec 3-02 on branch `feat/landing-3-02` (PR #66, unmerged). Adrian's verdict on
that build: *"you can just tell that this is AI-generated."* He then sketched the
page he wants on paper and dictated it top to bottom. This file is that brief.

**This is a rerun, not an edit.** Do not try to evolve the 3-02 page into this.
Read what exists, keep what is listed under "What to carry over", and rebuild the
page.

---

## 0. How to start

Work on branch `feat/landing-3-02` in the worktree
`/Users/adrianschimizzi/Documents/GitHub/trackd-landing-wt` (it is clean and
pushed). Everything 3-02 built is there, along with the traps below.

Read, in this order: `Context/ui-context.md`, `Context/architecture.md`,
`Context/code-standards.md`, `Context/ai-workflow-rules.md`, then
`Context/Feature Specs/wave 2 - refinement/3-02-landing.md` (the original spec,
for the compliance requirements that still stand), then this file.

**Ask Adrian for the photo of his sketch** if he has not attached it. Section 2
transcribes it, but the photo is the source.

---

## 1. The two references

- **Pep AI's website** is the feel he wants: premium, considered, not plain.
  Look at it. In particular, their testimonial carousel and the way their
  pages breathe. **They show no pricing, and neither do we** (see §3.8).
- **His sketch** (four panels on A4, photographed on his desk).

**The site does NOT have to look like the Trackd app.** His words: *"It doesn't
need to be exactly Trackd UI, the same way that Pep AI's website isn't the same
as the UI of their app."* This is a real loosening of the 3-02 constraint. The
palette and type still come from `ui-context.md`; the LAYOUT vocabulary does not
have to be the app's.

**Dark theme.** Same as now.

**Build the laptop version as a first-class design, not a widened phone.** He
reads the site on a laptop and called the 3-02 page out for being a phone page
stretched wide. Two real layouts.

---

## 2. The sketch, transcribed

**Panel 1 (hero).** "trackdco" small at top left. Big title "TRACK THE WHOLE
PROTOCOL". Small copy beneath it. A device/preview graphic with a circular glow
drawn behind it. A wide highlighted BUTTON. Five stars beneath the button
(**he has since cut the stars** - do not build them).

**Panel 2 (social proof, then a feature).** "JOIN THE MOVEMENT", with
*movement* underlined. Subtitle beneath. A testimonial card: avatar circle,
handle (`@glowithyas`), a rating, a quote. Then "Title" / "Site Rotation" with a
phone screenshot showing an injection-site body map, and floating callouts
pointing into it ("fades in 30-50", "logs each day"). Two small bullets
underneath ("+ title", "o title").

**Panel 3 (closer, then FAQ).** "WHAT ARE YOU WAITING FOR?" with Kyle the vial
mascot centred, flexing, drawn large. Feature chips floating around him
("o feature" x2, "FEEDBACK", "RECONSTITUTION Calculator"). A highlighted button
reading "Begin Tracked" (**he has since changed this** - see §3.5). Below that,
"Still have questions." over a stack of ruled lines (the FAQ), with two small
vial icons at the bottom corners.

**Panel 4 (held in his hand).** "COMPARE US" - a table: `Feature | Other Apps |
Trackd`, with crosses down the Other Apps column and ticks down the Trackd
column. A line at the bottom: "note from the founders".

---

## 3. The page, top to bottom

### 3.1 Header

- Trackd wordmark **top left** (`public/trackd-wordmark.png`, renders "trackd co").
- **Three-line menu button top right.** It opens a **drop-down**, not a side
  drawer. Items drop and fade in with a stagger.
- **Phone:** the background dims behind the open menu.
- **Laptop:** it drops down on the right-hand side, no dim.
- ✅ **Decided (Adrian, 2026-09-17):** "Log in" is an item INSIDE the
  drop-down, and the hero also carries "Already a current user? Log in" under
  its button, with Log in underlined and linking to `/login`.
- **The header is part of the hero** (Adrian, 2026-09-17): no band, no divider
  of colour.
- **Menu items:** links that jump to each section, the free reconstitution
  calculator (§3.12), and Log in. More (a compound library) come later.

### 3.2 Hero

Copy, in his words:

- Top line: **"Take your protocol out of your notes app and into something
  actually built for it."**
- Title: **"Track the whole protocol."**
- Subtitle: **"Every compound, dose, and injection site in one place."**
- Supporting line: **"Built by people who run real protocols."**

⚠️ **That is four lines of copy and he dictated them in an order that implies
the first is an eyebrow ABOVE the title.** Lay it out that way, but flag it: he
is doing a full copy pass and will settle it himself.

- A device preview with a **glow behind it** (his sketch draws concentric rings).
- **Button: "Start tracking."** He wants it **outlined and gradient-filled**, and
  *"a little bit smoother"*. The current flat amber button is what he means by
  plain.
- **Beneath the button, as separate text: "7-day free trial. Cancel anytime."**
  (Adrian, 2026-09-17; it was "Cancel in one tap".) ⚠️ It must NOT be inside
  the button.
- **Beneath that: "Already a current user? Log in"**, Log in underlined.
- **No stars.** The sketch has them; he cut them.

### 3.3 "Join the movement"

- A **divider** after the hero button, then the section.
- Title **"Join the movement"**, with **movement underlined**.
- ⚠️ **The underline DRAWS on scroll, like a hand drawing it.** Not a smooth
  wipe or a width transition - it should read as a stroke being made. An SVG
  path with `stroke-dasharray` animated on an IntersectionObserver is the
  obvious approach; make it look hand-made, not mechanical.
- Subtitle: **"Become one of the many people who use Trackd to stay on top of
  their protocol."**
- **Testimonial carousel.** Each card: profile picture, name, verified tick,
  five stars, the quote. Three or four cards, swipeable/scrollable, with **dots
  at the bottom right** that track the active card, the way Pep AI does it.
- ⚠️ **Testimonials are PLACEHOLDERS and must be marked `TODO(3-03)`.**
  Fabricated testimonials must never reach production. This was a review finding
  on the last build. The preview is SSO-gated and the branch does not merge, so
  placeholders are fine to build with - they are not fine to ship.

### 3.4 The features section

**One unified widget, not a list of separate cards.** You choose the section
title. Inside it, every feature as a row with **a small custom icon**, its name,
and a one-line description:

- Stock
- Injection sites
- Progress
- Training blocks
- Stacks and cycles
- The compound library
- The reconstitution calculator (**last**)

**Tapping a row expands it in place** to show **an iPhone view of that screen's
real UI**, with **floating callout widgets** pointing at parts of the screen and
explaining them.

His worked example: injection sites expands to a **sub-Q body map** showing one
site used recently and one just done, with a callout explaining that each
injection is logged and the shading fades as the site rests.

Useful raw material that already exists:
- `components/sites/**` - the real body maps (IM and sub-Q, male and female).
- `public/onboarding/app-*.png` - four real app screenshots (dashboard,
  protocol, calculator, progress). ⚠️ They bake in the old serif wordmark, carry
  a "Sign out" control, and name real compounds. Fine as reference, risky as
  page content - see §5.
- `components/onboarding/app-carousel.tsx` - an existing floating-callout
  treatment over a phone, with drift animation. Closest prior art in the repo.
- `components/landing/*` from 3-02 - device frame, drawn glyphs, today panel.

### 3.5 "What are you waiting for?"

- Title **"What are you waiting for?"**
- **Kyle centred, flexing, smiling** (`public/onboarding/kyle-flex.png`).
  ⚠️ **Kyle is a VIAL, never a jar. Do not raise or re-litigate his shape.**
- Feature chips floating around him.
- Subtitle: **you write it.**
- **Button: "Let's get started"** (or similar). ⚠️ Explicitly NOT "Begin
  tracking", even though the sketch says that, and NOT the "Start tracking"
  label used elsewhere.

### 3.6 Comparison table

- Heading along the lines of **"Compare us"**.
- Columns: `Feature | Other apps | Trackd`.
- Most rows: other apps ✗, Trackd ✓.
- ⚠️ **The last row inverts deliberately:** other apps ✓, Trackd ✗, where the
  feature is a BAD one. His example: "AI slop". Make the inversion read as a
  point being made, not as a mistake.
- Keep it non-evaluative about health data (see §5).

### 3.7 A note from the founders

Keep the 3-02 letter for now. He is writing a better one himself.

### 3.8 "Still have questions"

Sits **after** the founders' note.

- The FAQ from 3-02 is a reasonable starting set.
- ⚠️ **The vial animation is the point of this section.** A **small, simple
  vial** beside each question - simpler than the SVGs currently in
  `components/landing/glyphs.tsx`. Opening a question slides the answer down,
  **and the vial drains to empty as it opens**, as though the curiosity is being
  emptied. Closing presumably refills it. Make it feel mechanical and satisfying.

### 3.9 Final call to action

**"Get your protocol out of the notes app and into something that works."**
Button: **"Start tracking."**

### 3.10 Footer

The current footer is *"a bit crap"*. Rebuild as a divided band:

- **Left:** the legal entity line (`Trackd Co Pty Ltd`, ACN `698 405 462`) -
  roughly what is there now, moved left.
- **Centre, at the very bottom:** **TikTok and Instagram** icons linking to
  Trackd Co's accounts. ⚠️ **Ask Adrian for the two URLs** - he has them.
- **Right:** a quick-links area. Leave it empty for now, or put a small Kyle
  there; it fills in as things get built.
- ⚠️ **The four legal links must survive somewhere in the footer.** See §5.

### 3.11 Sticky CTA

**Keep it.** He likes the button that slides up and parks at the bottom. It
appears once the hero leaves, is `inert` while hidden, and respects reduced
motion.

**Revised (Adrian, 2026-09-17):** make it "its own kind of separate widget", and
carry the same "Already a current user? Log in" line. Built as
`components/landing/dock.tsx`: a floating card clear of the screen's edges
rather than a bar.

### 3.12 The free reconstitution calculator (added 2026-09-17)

Adrian: marketing will run on Reddit and similar, and when someone says "I
don't know how to do this" he wants to link them to a calculator. So:

- **A public page, `/reconstitution-calculator`**, with the calculator and
  nothing else from the app. No account, no trip into the app.
- **A duplicate, so it does not load the app**, and it may look nicer than the
  in-app one. It must look good on a laptop and on an iPhone.
- **Linked from the header menu** as a small sub-link, and from the footer's
  quick links.
- ⚠️ **It must give the same answers as the app.** It shares the arithmetic,
  the syringe scale, the drawing, the input sheet and the legal disclaimer with
  the in-app calculator; only the layout is its own.
- The compound library is a later page of the same kind. Not now.

This supersedes 3-02's "standalone SEO calculator page: separate spec".

---

## 4. What to carry over from 3-02

Working, verified, and worth keeping unless it fights the new design:

- **`lib/brand.ts`** - product name, business name, legal entity, ACN, support
  address, the three plan amounts, the derived weekly anchor. Every visible
  instance of the name resolves from here.
- **`--text-secondary`** in `globals.css` - the AA-safe muted. `--text-muted`
  measures 4.38:1 on `--bg-base` and 3.95:1 on `--bg-surface`, both under the
  4.5:1 floor. Use `--text-secondary` (6.45:1) for secondary prose.
- **Ink on amber is `--bg-base`** (6.19:1). White on amber is 2.65:1 and fails.
- **`.lp-col` / `.lp-sec`** - the content column and section rhythm.
- **The proxy redirect** in `lib/supabase/middleware.ts` - a signed-in visitor at
  `/` goes to `/dashboard`, so the page can stay static.
- **`export const dynamic = "force-static"`** on `app/page.tsx` - a tripwire, not
  an optimisation: it fails the build if someone adds a session read.
- **The `/onboarding` -> `/start` move** and its 308. Do not touch it.
- **`test/live/brandPrices.live.test.ts`** - guards `brand.ts` against live
  Stripe. Pricing is not shown on the page, and the header explains why the
  guard stays.

---

## 5. Rules that will fail the build or the law if broken

- ⚠️ **Four legal links, with the Consumer Health Data Privacy Policy under its
  FULL name.** `lib/legal/verbatimQuotes.test.ts` reads `app/page.tsx` and
  asserts `/terms`, `/privacy`, `/medical-disclaimer`, `/consumer-health-data`
  plus the exact string "Consumer Health Data Privacy Policy". Washington's
  MHMDA requires it published under that name, reachable without a login. A
  tidy-up to "Health data" reads better and breaks the statute and the test.
- ⚠️ **No em dashes, no emoji, no exclamation marks** in any user-facing string.
  Sentence case. (Code comments are exempt.)
- ⚠️ **"Trackd.co" must never appear.** The entity is `Trackd Co Pty Ltd`, the
  business name is `Trackd Co`, the domain is `trackdco.app`.
- ⚠️ **Generic compound labels on the public page.** "Injectable A", not a real
  compound name. His call, for a page an Apple reviewer reads.
- ⚠️ **Health data is categorical, never evaluative.** No red/green to say a
  reading is good or bad. Injection-site recency shading is a sanctioned
  exception and carries its own day-count labels.
- ⚠️ **Amber is rare.** It means "this is live / this needs you now". The CTA,
  and at most two other beats.
- ⚠️ **Every animation collapses under `prefers-reduced-motion`.** An inline
  `animation` shorthand outranks the reduced-motion block and cannot be switched
  off from the stylesheet - use a class, or inline `animationDelay` longhand only.
- ⚠️ **No hardcoded hex outside `globals.css`.**
- **Apple context:** the page exists partly to satisfy organisation enrolment
  9TNKRWYDUU (case 102962931889): real content, publicly available, entity
  visibly associated with the domain. Keep the entity line and the legal links.

---

## 6. Traps in this repo that cost hours last time

1. **A `globals.css` change can sit UNSERVED by `next dev` while the file on
   disk is correct.** Confirmed twice. Fix: `rm -rf .next` and restart.
   ⚠️ **But probe correctly before concluding that:** Tailwind escapes selectors
   and spaces declarations, so grepping the served CSS for `16/10` misses a rule
   emitted as `aspect-ratio: 16 / 10`. I called "stale CSS" once when the CSS was
   fine. **Prefer rendering and looking over grepping.**
2. **Start the dev server so its command line does NOT contain "next dev".**
   Other sessions in this repo run `pkill -f "next dev"`. Use
   `node -e "const next=require('next'); ..."` from inside the worktree, on port
   3217. Kill only PIDs you started.
3. **A script in the session scratchpad resolves imports from the scratchpad.**
   `require("playwright")` or `import next` will fail. Use
   `createRequire(worktree + "/package.json")`, or run `node -e` with the cwd in
   the worktree. And never default an output path to `"."` - a screenshot script
   once dropped six PNGs into the shared checkout.
4. **Turbopack needs `TRACKD_TURBOPACK_ROOT=/Users/adrianschimizzi/Documents/GitHub`**
   because `node_modules` is a symlink and the repo is on iCloud. Never
   `npm install` inside the worktree.
5. **`next build` and `next dev` share `.next`.** Stop the dev server first.
6. **CodeRabbit does not auto-review this repo** (under ten stars). The green
   "CodeRabbit: success" check is that SKIP, not a review. Trigger it with an
   `@coderabbitai review` comment - and **do not push anything straight after**,
   or it aborts with "Head commit changed" and does not retry.
7. **Vercel previews are SSO-gated.** An anonymous `curl` gets Vercel's login
   page with a 200. Do not read that as the page being broken.
8. **Adrian runs several Claude sessions on one checkout.** Never switch branches
   in `/Users/adrianschimizzi/Documents/GitHub/trackd-co-app`, never `pkill` by
   tool name. That checkout is on `deletion/steps-1-2` with his uncommitted work.
   Use the worktree.

---

## 7. How to know it is right

- **Render it and look at it.** Both defects that reached him last time -
  a sticky bar sitting across the hero, and a phone clipping the headline -
  were invisible in the markup and obvious in a screenshot. He should not be
  the one who finds them.
- Measure at **375x548** (iPhone SE in Safari), **402x700** (his handset with
  Safari's bars up) and **1280** (laptop). No sideways scroll at any width.
- Keyboard through the whole page: every interactive element reachable, focus
  visible, the FAQ operable, the menu closable with Escape.
- Gates: `npx tsc --noEmit`, `npx eslint .`, `npx vitest run` (106 files / 2099
  tests as of this writing), `next build` with `/` prerendered to static HTML.
- ⚠️ **Nothing merges to `main` without his explicit approval.** Branch, preview,
  PR. That is a standing instruction.

---

## 8. What Adrian still owes

- ~~The two social URLs~~ ✅ TikTok `https://www.tiktok.com/@trackdcoapp`,
  Instagram `https://www.instagram.com/trackdcoapp/` (in `lib/brand.ts`).
- **A copy pass over the whole page.** He asked to be reminded, and he is
  rewriting the founders' note himself. The four hero lines are laid out with
  the first as a line above the title, for him to settle.
- ~~A ruling on "Cancel in one tap."~~ ✅ "7-day free trial. Cancel anytime."
- **The privacy FAQ answer**, still a placeholder.
- **Real testimonials**, to replace the four invented ones (see §9).
- **The comparison rows.** Each cross under "Other apps" is a claim about
  competitors; he confirms each is true before this ships.
- **The public calculator has no first-run modal** (the in-app one does); the
  permanent disclaimer stands on the page instead. Confirm.
- **Real device checks** on an iPhone and an Android.
- ~~Where "Log in" lives~~ ✅ inside the drop-down, and under the hero button.
- ~~After this merges: delete the first onboarding step~~ ✅ replaced by the
  introduction screen on 2026-09-17 (§9).

## 9. Decisions taken during the build (2026-09-17)

- **The features widget draws the app rather than photographing it.** Each
  screen is rendered from the app's own presentational components (containers,
  body artwork, syringe, the calculator's input sheet, category icons) at the
  app's real 390x844 and scaled. Screenshots were considered and rejected: the
  preview fixtures name real compounds and greet a named user, and a captured
  PNG cannot play the screen's moment when the row opens.
- **Section title for the widget:** "Seven things your notes app can't do."
- **Kyle's subtitle:** "Seven days free, with everything in. Set it up once, and
  it takes seconds a day after that."
- **The inverted comparison row** is "AI slop", with the Trackd column lit all
  the way down and "The last row is on purpose." under the table.
- **Placeholder testimonials cannot reach production by accident.**
  `showTestimonials()` hides the section (and its menu item) on Vercel's
  production environment while `PLACEHOLDER_TESTIMONIALS` is true, and a test
  pins it. The worst case is a missing section, never a fake review.
- **The 3-02 footer email field is gone.** The rebuilt footer's brief does not
  include it. `joinWaitlist` and the `waitlist` table are untouched.
- **The hero phone is Adrian's video**: `trackd-phone-landing-mockup-final.mov`
  (supplied 2026-09-17; it replaced a first cut that opened dark). 4K 60fps
  HEVC, 69s, already transparent round the phone. Cropped to a box centred on
  the phone, 1518x1280 at 30fps, shipped as HEVC-with-alpha (9.1 MB) and
  VP9-with-alpha (2.3 MB). It plays once, with no fade-in, and holds its last
  frame.
- **Its opening is cut off, so it fades.** The recording opens zoomed in, with
  the phone off the bottom of the frame until ~2.4s. Adrian asked for a fade at
  the bottom; the top and bottom of the box fade deeply while it opens and ease
  away as it settles, driven from the video's own clock.
- **The recording's names are fine** (Adrian, 2026-09-17: "it's a preview,
  it's fake data"), so §5's generic-label rule is waived for the hero video.
- **Second review round (Adrian, 2026-09-17), applied:**
  - The hero is the DRAWN phone again, with real compound names ("make it
    actually say what it says"); his recording moved to the onboarding
    free-week screen, replacing the four-phone carousel.
  - Hero copy: the line above the title is gone; the title is bigger; the
    subtitle is now "Take your protocol out of your notes app and into
    something actually built for it."; "Built by people who run real
    protocols." stays.
  - The button: the app's blocky shape, amber, a faint gradient, a faint top
    edge, a glow, no outline ring, a barely-there sheen. The onboarding
    button got the same kind of glow.
  - "Start tracking" now opens an INTRODUCTION screen that says what the next
    two minutes hold, then "What's your name?". It renders for the old
    `hook` step id; the notes-app hook screen and its cards are deleted. (This
    closes §8's "delete the first onboarding step".)
  - Reviews centred, dots centred. Compare: ticks always filled white, crosses
    always muted, "The last row is on purpose." cut. Closing line: "actually
    works" in italics. Footer: "Our socials". Kyle's chips are app-card
    previews (a stock card that runs down and refills at the top).
  - Features widget on a phone: switching rows no longer moves the page; the
    injection-site map is drawn larger.
  - Animations softened: the row expand, Kyle's flex, the reveals.
- **Removed 3-02 components:** `device`, `laptop`, `today-panel`, `glyphs`,
  `sticky-cta`, `updates-form`.
