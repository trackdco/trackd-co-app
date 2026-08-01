# Onboarding: everything still open

Written 2026-08-01, after the overnight build. Branch `wave3/onboarding-flow`,
pushed, **not merged**. `main` carries only the wave3 review fixes and the
calculator unpin.

This is the list of every thread this conversation opened and did not close. It
exists so nothing gets lost between sessions.

---

## 1. Assets Adrian owes

Each has a wired slot. Dropping the file in is the whole change.

| What | Where it goes | Notes |
|---|---|---|
| **Signature SVGs** (Angus + Adrian) | Drop the files at `public/onboarding/signature-angus.svg` and `public/onboarding/signature-adrian.svg`, then point the two `SIGNATURES` entries in `components/onboarding/screens/letter.tsx` at them | Vertical space is already reserved so the block will not jump. Export with `fill="currentColor"` and NO hardcoded colour, so the amber comes from the token and a palette retune carries it. Trim the artboard tight to the ink: the slot sizes by height, so whitespace baked into the file renders as a smaller signature. |
| **Gym-floor backdrop** | `HOOK_BACKDROP` in `screens/hook.tsx` | Currently null. The one-shot settle animation is already wired; set the constant and it plays. |
| **Real app screenshots** | `public/onboarding/app-{home,protocol,calculator,progress}.png` | Currently captures of `/preview/*`. Adrian said he would send better ones. **They also go stale whenever a screen changes** — recapture with the harness script. |
| **Progress photos to blur** | `MirrorPhoto` in `screens/demo.tsx` | Optional. Currently a drawn stand-in, deliberately unreadable. |

Kyle is DONE (`kyle-thumbs.png` on celebrate, `kyle-flex.png` on welcome).
`kyle_default.png` is installed but unused — no screen calls for it yet.

**Why Kyle's background is not cut out:** his singlet is black and sits within a
few points of luminance of the backdrop, so any automatic matte takes the shirt
with it. The image edge is feathered with a radial mask instead, which dissolves
into our near-black canvas and cannot touch the singlet. If a true transparent
PNG ever arrives the mask is harmless on it.

---

## 2. Decisions waiting on Adrian

- **"Blast & cruise"** — he questioned whether it belongs on the first intent
  screen. Kept, because it is a phase the audience names itself and dropping it
  leaves someone cruising with nothing to pick. Easy to remove.
- **The struggle options.** Three were added on his prompting (units to draw,
  too many things to stay on top of, Something else) and "spreadsheet" became
  "notes app". He asked to review the list.
- **The founder letter.** He said it "could be better" but did not say what was
  wrong. The copy is his, verbatim. Needs a specific note before it changes.
- **Vercel Deployment Protection.** The preview link only opens for someone
  signed into his Vercel account. To share it with a friend: project →
  Settings → Deployment Protection → Vercel Authentication off. His toggle;
  there is no token here to do it with.
- **Where onboarding lives when it ships.** It is additive at `/onboarding` and
  `/login` is untouched. Pointing new visitors at it is a separate decision.

---

## 3. Not built, and why

- **Auth and payment.** There is NO RevenueCat integration on this project.
  `startTrial()` in `screens/paywall.tsx` is the single seam: OAuth is already
  real (`GoogleSignInButton` threaded back to `?step=welcome`), and steps 2 and
  3 of the chain resolve immediately. Adrian is wiring RevenueCat/Stripe
  himself.
- **The "REAL SIGN-IN" card on the paywall is scaffolding**, not shippable
  chrome. It exists so a stubbed trial can never be mistaken for a real one. It
  goes when auth is wired.
- **The anonymous session never merges onto an account.** Nothing to merge onto
  until auth exists. `lib/onboarding/session.ts` holds everything in one object
  precisely so the merge is one pass.
- **Analytics has no destination.** Every event the spec asks for fires through
  `track()` into a `window` buffer. PostHog is listed as deferred in
  `architecture.md`. Pointing `track()` somewhere is a contained change.
- **The affiliate code registry is a placeholder list** in
  `lib/onboarding/affiliate.ts` (`TRACKD`, `ANGUS`). `validateCode` is already
  async so the real lookup drops in without callers changing.
- **Prices are scaffolding** ($69.99/yr, $11.99/mo). The saving badge and the
  weekly figure DERIVE from them, so nothing can contradict anything else.
- **The cost screen deliberately carries no price.** The amount a customer is
  actually charged depends on their region and only the billing provider knows
  it. $70 on that screen and AU$110 at the payment sheet is a broken promise at
  the worst possible moment. When billing is wired, render the paywall price
  from what will really be charged rather than from config.

---

## 4. Auto-install: answered AND built

**Android: yes, and it now works.** Chrome and Samsung Internet fire
`beforeinstallprompt`; the repo already captured it in
`components/pwa/usePwaInstall.ts`, and the onboarding install screen now uses
it — a real "Add to home screen" button that opens the OS install dialog, no
instructions, and the flow advances only when the install is actually accepted.

**Already installed: detected.** `display-mode: standalone` (plus iOS Safari's
own `navigator.standalone`) means someone who relaunches from their home screen
sees "You're already set up" instead of being asked to do it again. That turns
a self-reported step into a verified one.

**iOS: no, and there is no workaround.** Apple has never shipped an install
API, so that path keeps the Share-sheet instructions and the "I've added it"
button — which now exists ONLY in the case where we genuinely cannot know.

### The original answer, for the record

**Android: yes.** Chrome and Samsung Internet fire `beforeinstallprompt`, and
the repo ALREADY captures it — `components/pwa/usePwaInstall.ts` exposes
`canInstall` and a one-tap `promptInstall()` that opens the real OS install
dialog. The onboarding install screen should use it: a real button on Android,
instructions only on iOS.

**iOS: no, and there is no workaround.** Apple has never shipped an install
API. Add-to-Home-Screen is manual through the Share sheet, which is why that
screen's job is clarity rather than automation. This matches what Angus told
him and what `progress-tracker.md` already records.

Worth knowing: a PWA can detect it is ALREADY installed
(`display-mode: standalone`), so the install step can be skipped for someone
who relaunches from their home screen, which turns a self-reported step into a
verified one.

---

## 5. Carried from the app side (not onboarding)

- **The per-user supplement form override.** Approved by Adrian, NOT built: it
  needs a migration only he can apply. Plan is in `next-tasks.md`. The default
  fix shipped and needs no migration, so vitamin C and D3 read correctly.
- **`/progress` signs every photo with no `limit`.** Measured: 34 signed URLs
  and a 119KB document at 32 photos. The client only fetches one image, so the
  cost is server-side and grows forever.
- **The Running list's 145px pop-in.** Reserving the height was tried and backed
  out: it removes the jump for a user who IS running something and creates an
  upward collapse for one who is not.
- **The block retrospective's sparkline** still draws a straight polyline while
  the glance sparkline moved to a filled monotone curve. Wants its own visual
  pass.
- **Contrast below AA in three places**, all pre-existing token decisions.
  `--text-muted` on `--bg-surface` is 3.95:1. **This matters for the app-wide
  restyle**, because lighting the canvas changes that ratio on every screen.

---

## 6. The app-wide restyle

`Context/PROMPT-app-surface-restyle.md` is the prompt to paste into a fresh
session to get the SPEC written. It is not the spec and not the work. Adrian
called starting it now "a distraction" and he was right: the onboarding is where
the treatment is being worked out, so the restyle should point at a finished
reference rather than a moving one.
