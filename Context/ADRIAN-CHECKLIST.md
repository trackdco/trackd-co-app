# Adrian's checklist

**Everything I need FROM you, and everything you asked me to hold onto.** Made
so you don't have to ask for it again — open this file instead.

Last updated: 2026-08-05

---

## 1. The Notes app screenshot

Open iOS Notes, type this **exactly**, screenshot it, send it over.

```
PROTOCOL
mon + thurs?? or tues
  - last one 23rd i think
second one eod
  - ran out? check the vial

2ml water -> 5mg vial
  = ??? per unit

bloods 10/07 - still not booked
left delt last time. or right
```

- The two indented lines start with **two spaces**.
- **No compound is named anywhere, on purpose.** The hook runs BEFORE the age
  gate and is a public marketing surface. If you retype it, keep it that way.
- Screenshot the note itself, full screen, dark mode.

**Heads up:** the left-hand panel of that comparison is currently *drawn in CSS*,
not an image. Swapping it for a real screenshot is its own change — the wipe
clips a live element — so send it and I'll wire it.

---

## 2. App screenshots for the paywall

Four files → `public/onboarding/`, same names, no code change needed:

| File | Screen |
|---|---|
| `app-home.png` | Home / dashboard |
| `app-protocol.png` | Protocol |
| `app-calculator.png` | Reconstitution calculator |
| `app-progress.png` | Progress |

**Size: 1170 × 2280 px exactly.** The container is `aspect-[390/760]` — any
other ratio crops.

- **Crop out iOS's own chrome.** No status bar, no home indicator. The flow
  draws its own bezel and a real one doubles up.
- **They render 124px wide.** They are thumbnails. Pick states with big legible
  shapes and strong contrast — a home screen with a few filled cards beats a
  dense list, and the calculator wants the syringe prominent.
- **No personal data.** These go in front of strangers. Invented compounds only.
- Dark theme, normal states — not empty, not error.

### Making the throwaway account

Do it on **production**, not the LAN dev server — signup needs an emailed
confirmation link and a LAN IP won't be on Supabase's redirect allow-list.

1. `trackdco.app` → sign up with a throwaway email (a `+alias` works)
2. Confirm via the email
3. Build the fake protocol
4. Screenshot on your phone

Use **email/password**, not Google, so it isn't tied to a real identity. It
creates one real row in prod and will show up in your own admin numbers.

---

## 3. ~~Progress photo samples~~ ✅ DONE 2026-08-05

Three supplied and blurred to `public/onboarding/progress-{1,2,3}.jpg`
(1086 × 1448, Gaussian sigma 40).

Sigma 40 was arrived at by looking, not guessing: at 22 the physique read well
but the face was still legible, which is not what "enough to see a slight
figure" means when the result goes in front of strangers. At 40 the pose, build
and framing all survive and nothing identifying does. **The originals are NOT in
the repo** — only the blurred derivatives, so there is no un-blurred copy to
leak later.

Nothing renders them yet. They are ready for whichever Progress surface wants a
sample.

---

## 4. Gym-floor backdrop — PARKED

`public/onboarding/hook-backdrop.jpg`, then set `HOOK_BACKDROP` in
`components/onboarding/screens/hook.tsx`. The settle animation is already wired.
You said "backdrop is fine for now", so this is not blocking anything.

---

## 5a. SETTLED 2026-08-05 — do not re-litigate

- **Pricing is $69.99/year, $11.99/month, $4.99/week.** Weekly stays in and
  ships with the final paywall. Nobody said $70 is high. Angus gets consulted
  after it is built, not before.
- **Plans render as three STACKED ROWS**, not side-by-side cards. Three columns
  at 390px is cramped and kills the saving badge and the per-week line.
- **A yearly price always shows its monthly equivalent in brackets.** Derived
  from the one figure, never typed twice.
- **The account is created at the PAYWALL. The flow stays anonymous until
  then.** The onboarding consent tick is a PRODUCT gate; the legal record is
  written to `consent_records` at account creation, which is how `/welcome`
  already works. No second tick is shown at signup.
- **Housekeeping splits into four pages:** name + photo → date of birth +
  the 18+/ToS/Medical/Privacy tick → gender → welcome. Consent sits ON the
  date-of-birth page, not its own.
- **The welcome screen hands into the goals questions.** Its closing line sets
  up "What are you running?", so the flow reads as one conversation. "Let's see
  if Trackd is for you" is rejected — better line owed.
- **Trial reminders are NOTIFICATION ONLY. Email is scrapped.** Built after the
  paywall rebuild, because a reminder needs a real trial end date from
  RevenueCat to fire against.
- **The billing PROVIDER is OPEN. RevenueCat is not chosen** (Adrian,
  2026-08-05 — he is working the pricing and billing question with another
  agent). What IS settled is that the user must not be dropped onto a bare
  Stripe checkout page; it reads as dodgy.
  **This does not block the paywall.** `startTrial()` in `screens/paywall.tsx`
  is the single seam and always was: whichever provider wins drops in there and
  nothing else moves. Build the paywall UI provider-agnostic.
  One thing holds either way: an entitlement has to attach to a user, so the
  account is created BEFORE the purchase. The "account at the paywall" decision
  above survives any provider choice.

## 5b. Decisions waiting on you

- **Cost screen** — eight options at `/onboarding/cost`. You like **G**; it now
  has the masked `$X,XXX` amounts and the white "cheap part". Confirm and the
  other seven get deleted.
- ~~Payoff screen~~ **B SHIPS**, reworked so it no longer restates the demo.
- **Welcome effect** — four at `/onboarding/welcome-effects`. Pick one; it
  becomes the `EFFECT` constant in `screens/greeting.tsx`.
- **The greeting's closing line** currently reads "Let's learn a bit more, so
  Trackd can be built around what you actually run." Yours to approve.
- **Pricing is still placeholder** — `$69.99/yr`, `$11.99/mo`, `$4.99/wk`,
  **7-day** trial, in `lib/onboarding/pricing.ts`. Everything else derives.
- **Does anything route to `/onboarding` yet?** Right now nothing does, and
  `trackdco.app/onboarding` 404s in production. This is the one that decides
  whether any of this is reachable by a real user.
- **The trial reminder is PROMISED but not built.** The paywall timeline says
  "we'll notify you". Nothing sends it yet. Do not put this in front of paying
  users until it exists, or the paywall makes a promise the product breaks.

---

## 5c. ⚠️ BUILD BEFORE ANYONE PAYS — the trial reminder

**The paywall promises a notification and nothing sends it.** The timeline beat
reads "Day 5 · Reminder — We'll notify you that your trial is ending, before
anything changes." That is a commitment printed on a payment screen, and right
now the product does not keep it.

Adrian's call (2026-08-05): **notification only, email scrapped entirely.**

What it needs:

- A trial end date to fire against, which only the billing provider knows. This
  is why it is sequenced AFTER billing, not before.
- The push transport already exists — `lib/notifications/` and the
  `reminder-runner` cron (`*/15`) that sends dose reminders. This is a new
  reason to send, not a new pipe.
- The same cycle-awareness lesson applies: `reminder-runner` is a SERVER-SIDE
  mirror of app state, and it has already shipped one defect from being out of
  step with the client (off-cycle days were announced). A trial reminder must
  read the real entitlement, not a second copy of the trial maths.
- iOS needs the PWA installed before push works at all, which is why the install
  screen precedes notifications in the flow and must keep doing so.

**Until this exists, do not put the paywall in front of paying users.**

---

## 5d. PARKED — local currency on the cost screen

Adrian asked (2026-08-05) whether the cost screen's Trackd figure could show
the user's own currency instead of always `$69.99`.

**Parked, and the reason is not technical.** Detecting a locale is trivial
(`Intl.NumberFormat`, or the `Accept-Language` header). Converting is not, and
converting would be WRONG:

- What a customer is actually charged is set by the **billing provider's**
  regional pricing, not by an FX rate. App Store and Play Store tiers are not
  conversions — a $69.99 USD tier is not £55 or €64, it is whatever that
  store's tier table says.
- So a converted figure on this screen would be a number **nobody is ever
  charged**, printed next to a promise about what they will pay. That is worse
  than one honest figure in one currency.
- This is the same reasoning that already keeps a price off the cost screen
  entirely in the other variants.

**The real fix arrives with billing:** whichever provider is chosen returns the
localised display price for the user's storefront, and we render THAT string.
No conversion, no guessing. Do it then, not before.

---

## 5e. Progress photos — the AI prompt, and the female set

Current three are `public/onboarding/progress-{1,2,3}.jpg`, processed with
`gblur=sigma=56,eq=saturation=0.55:brightness=-0.10` (darker, flatter, blurrier
than the first pass, per Adrian 2026-08-05).

**A female set is wanted too**, so the demo can match the sex chosen on the
gender screen. Naming when they arrive: `progress-f-{1,2,3}.jpg`.

**Prompt to generate replacements** (run three times, changing only the pose):

> A photorealistic smartphone mirror selfie in a modern minimalist bathroom
> with warm neutral lighting, large mirror, matte black fixtures, light stone
> tiles. A fit adult [man / woman] in plain black shorts [and a plain black
> sports top], athletic build, standing squarely facing the mirror, holding a
> phone at chest height that obscures part of the face. Shot on a phone camera,
> natural indoor light, slight warmth, shallow depth of field. Vertical 3:4
> framing, full body from mid-thigh up. Neutral expression, no text, no
> watermarks, no logos, no jewellery.

Poses across the three: **1** front relaxed, **2** back to the mirror,
**3** front with one arm flexed.

Then process each with:

```sh
ffmpeg -i in.png -vf "gblur=sigma=56,eq=saturation=0.55:brightness=-0.10" -q:v 4 out.jpg
```

**Why generated is better here than real photos:** these render 100px wide
behind a heavy blur, so no detail survives anyway — and a generated figure
raises no question about whose body is being shown to strangers.

---

## 6. Things only you can run

- **`supabase/protocol/013_stack_dating.sql`** — release gate, not a follow-up.
  Run it in the SQL Editor, then open the app once.
- Supabase MCP is **not authorised** in my sessions. I write the SQL, you apply
  it by hand.

---

## 7. Preview links

**⚠️ THE LAN IP MOVES.** It changed from `10.1.4.185` to `192.168.0.117`
mid-session on 2026-08-05 (DHCP), which silently killed the previous link.
If a link stops loading, that is the first thing to check, not the server:
`ipconfig getifaddr en0`.

Current base: **`http://192.168.0.117:3100`**

- **The flow:** `/onboarding`
- **Cost screens (8):** `/onboarding/cost`
- **Payoff screens (4):** `/onboarding/payoff`
- **Welcome effects (4):** `/onboarding/welcome-effects`

Phone on the same wifi. Start the server from the repo with:
`npm run dev -- -p 3100 -H 0.0.0.0`

If the server isn't running, ask me and I'll start it.

---

## 8. When the changes are done

You run **cold review agents** over the diff. They come back categorised
**critical / high / medium / low**; you take the highs, I fix the rest. **Not
yet** — your call, and you've said there's more to fix first.


## The paragraph: what would make him buy more

> It looks genuinely good — dark, restrained, tight typography, no stock photos,
> and the demo is the best onboarding demo I've used because logging a dose
> *moves the thing next to it* instead of navigating somewhere; the body map
> with real artwork and rested-site shading, and the fact that it says "Logged:
> L delt" rather than telling me where to pin, is the single strongest trust
> signal in the whole flow — **lead harder on that, not on the mascot.** Fix
> these, in order. **One: say something about privacy before you ask my name.**
> You take my first name, my DOB and my sex on screens two, three and four and
> never once tell me where any of it goes; a single line — "Stored encrypted,
> never sold, and you can delete everything in one tap" — plus an app lock (Face
> ID) would be worth more to your conversion than the entire cost screen,
> because the guy you're selling to is more scared of his phone being read than
> of $69.99. **Two: nothing happens when I press the trial button** — no payment
> sheet, no account, no email, just a spinner and confetti — so I finished
> onboarding not knowing whether I was on a trial, and a paywall that promises
> "you'll be charged on 12 Aug unless you cancel" while charging nothing reads
> as broken, not generous; wire it or say "no card required" out loud. **Three:
> your Day 5 reminder is a promise you currently don't keep** — if that
> notification doesn't fire, you've broken the one commitment that made me press
> the button, and I'll cancel out of spite. **Four: the trial is the wrong
> shape.** Seven days is right, but nothing in onboarding asks me to set up *my*
> protocol — I finished with an empty app and a demo vial of someone else's
> testosterone; a trial where I have to do the data entry myself is a trial I
> abandon on day two. **Five: cut or merge the payoff screen** — "Know what you
> ran, and when" restates the demo I just watched. **Six, on keeping me past the
> trial:** give me one thing the notes app can never do — bloods charted against
> the protocol that was running at the time, with a shareable summary I can hand
> my doctor. That's the feature I'd resent losing on day eight, and right now
> you mention it once as a tick on a celebration screen and never show it.

## What has been ACTED ON from this

- ✅ **Privacy line** — "Nothing leaves your phone until you make an account."
  on the date-of-birth screen. True today; **it stops being true the moment
  anything pre-paywall posts to Postgres.**
- ✅ **"No card required"** said out loud, on the new free screen and the
  paywall. **Re-check when billing lands** — if the provider takes a $0 card
  authorisation this becomes false.
- ✅ **Payoff reworked** — no longer restates the demo; it now asks a question
  the reader cannot answer.
- ✅ **Seven-day trial.**
- ⏳ **Set up MY protocol before the flow ends** — not built. This is the
  day-six churn and it is the biggest remaining item.
- ⏳ **The Day 5 reminder** — see §5c. A promise nothing keeps yet.
- ⏳ **Bloods charted against the protocol** — the retention feature. Exists in
  the app; never shown in onboarding.
