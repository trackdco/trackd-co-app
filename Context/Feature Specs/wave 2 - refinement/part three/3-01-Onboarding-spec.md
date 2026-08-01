# Onboarding & Trial Activation — Central Spec

**Version:** 2.0 (merged central)
**Date:** 29 July 2026
**Owner:** Angus (product/brand) · Adrian (build)
**Status:** Ready for build
**Applies to:** trackdco.app — PWA, mobile-first, add-to-home-screen install

> This is the single source of truth for onboarding. It is both the build contract (Goal, Out of Scope, Design Decisions, Implementation, Check When Done) and the full reference (constraints, auth/payment model, screen-by-screen copy, tokens). No companion doc required. Sibling specs referenced by filename (`ui-context.md`, `architecture.md`, `code-standards.md`, `Dose & Schedule Integrity`) are separate.

---

## 1. Goal

Build the complete first-run: from a cold link-tap to a set-up account sitting on the today-dashboard with a live protocol clock. This is a greenfield build that sits in front of the app and hands off to it.

The one job of this flow is to make the user *feel* the product before they pay for it. The aha moment — logging a dose and watching inventory reflow, the "not a spreadsheet" moment — must be delivered on an anonymous demo before any account or payment. Everything else in the flow exists to protect that moment or to convert off the back of it.

Monetisation is a **5-day free trial, card-up-front, auto-converting**. Authentication and payment happen together, at the paywall, and nowhere earlier.

This flow hands the user into real cycle creation, so it assumes the `Dose & Schedule Integrity` data model is merged.

---

## 2. Out of Scope

- Do NOT build or restyle the core app — dashboard, real cycle creation, inventory, calculators. Onboarding hands off to them; it does not rebuild them.
- Do NOT write outcome copy or dosing-adjacent copy. No "cycle safely", no "when to pin", no "how much to draw", no invented statistics. Hard TGA line (§3, §14).
- Do NOT change RevenueCat entitlement logic or Stripe config beyond triggering trial start. If wiring the trial needs entitlement changes, flag it first.
- Do NOT collect any data the flow does not need. DOB, sex, consent, and the two intent questions are the only pre-auth data. Everything else comes from Google or is optional.
- Do NOT create new shared/reusable components without flagging and asking first.
- Do NOT introduce colours, fonts, or styles outside what `ui-context.md` defines.
- Do NOT redesign the demo screens as production screens. The demo is a rehearsal, not the app (§7 demo screens, §10).

---

## 3. Non-negotiable constraints

### 3.1 TGA / regulatory (every string is checked against these)
- **Market the tracking tool only.** Never promise or imply outcomes (weight, gains, results, "cycle safely").
- **No dosing guidance.** Never tell the user when, how much, or how to inject. The app records what the *user* decides.
- **No "safe/safely" framing** anywhere in onboarding copy.
- **No fabricated statistics** — no percentile claims, no invented success rates.
- **Injection-site content is a record, not instruction** — "keep track of your last site", never "how to inject safely".
- **Colour is categorical, never a risk signal.** Amber marks category/brand. No red warnings, no green "good/safe".

### 3.2 Legal / age
- **Age gate precedes all substance-adjacent content and all payment.** DOB + consent captured before the demo and before the paywall. A user must never be able to pay and then fail the 18+ check.
- Single consent covering **Terms of Service + Medical Disclaimer + Privacy Policy**.

### 3.3 Brand
- **Australian English** throughout.
- Voice: **tool-not-coach, information-not-judgement, categorical-not-evaluative.** Bloomberg-terminal density. No AI buzzwords, no slop, no borrowed stats.
- Mascot (Kyle the Vial or equivalent) may appear at celebration/empty-state moments, within TGA bounds.

---

## 4. Design Decisions

**Value before friction. The user feels the product before an account exists, and proves eligibility before either. Value, then eligibility, then payment — and the order never bends.**

This is the core principle and every decision below follows from it.

**Order of operations.**
- Fixed sequence: hook → age gate → intent questions → demo (the aha) → payoff → paywall (auth + payment) → post-paywall setup → hand-off.
- No account wall, sign-in prompt, or payment step may appear before the demo. A user watches the whole demo anonymously.
- The ordered screen list is §6. Do not reorder it.

**The demo is anonymous and throwaway.**
- The demo runs on a canned sample cycle held in local/session state. It never writes to an account, a real cycle, or the schedule/log tables.
- Nothing the user taps in the demo persists.
- If delivering the demo appears to require creating a real record, stop and flag it — that is the wrong approach.

**The age gate is load-bearing.**
- DOB, sex, and consent are captured on housekeeping, before the demo and before any substance-adjacent content.
- Progression is blocked until consent is ticked and DOB resolves to 18+. Under-18 is a hard stop with no onward path.
- No payment path may bypass the gate.
- Google OAuth does not reliably return birthdate, so DOB is captured manually and cannot be deferred to auth. If the data model cannot hold DOB on the anonymous session without a migration, flag it before writing one.

**Auth and payment are the trial button.**
- Authentication is triggered by the "Start 5-day free trial" tap, not by an earlier gate.
- On tap: Google OAuth (or email fallback) → RevenueCat trial-start → Apple Pay / Google Pay / card sheet ($0 authorisation) → trial begins.
- Google returns name, email, and profile photo in one tap. Because auth precedes the welcome screen, the welcome greets the user by their Google name.
- Anonymous-session data (DOB, sex, intent selections) merges onto the real account immediately after auth. If this merge needs a schema change, present the plan before running it.
- The trial is the risk-reversal. The old 7-day money-back guarantee is retired and must not run alongside it.

**Affiliate and creator codes.**
- A code does two jobs: it attributes the signup to a creator for commission, and it may apply a discount or perk to the user. Support both.
- Capture the code from the creator's deep link on first load (URL param, e.g. `?code=`), store it on the anonymous session, and auto-apply it at the paywall so most users never type anything. Always provide a manual "Have a code?" entry as fallback.
- Validate before applying. An invalid or expired code fails quietly to the standard price — it never blocks the trial.
- Codes may be tied to the annual plan (per the creator-code model). If so, applying a code selects/deepens the annual offer (D-6).
- A present code is the strongest form of attribution — if one is applied, the "Where did you hear about us?" screen (§9 Screen 15) may be pre-filled or skipped.
- Commission payout tracking is a separate layer from RevenueCat (D-5). Do not build payout logic into onboarding; onboarding only captures, validates, and applies.

**Copy markets the tool, never the outcome.**
- Every string describes what the app *tracks* or *records*, never a result, never a dose, never a safety claim.
- Intent questions describe the user, not a goal. Struggles name *tracking* pains, never dosing pains.
- Injection-site content is a record, never instruction.
- Colour is categorical. Amber = brand/category. No red warnings, no green "safe".
- The full do-not-ship list is §14 and is binding.

**The aha screen is the priority.**
- The stock-reflow screen (demo 2) is the highest-leverage surface in the app. Every logged demo dose must visibly reflow the vial fill, remaining mL, doses left, and projected-empty date, animated, with no maths shown.
- Build this to feel good before polishing anything else.
- Any decorative overlay (e.g. the log-button glow ring) must be `pointer-events:none` so it cannot intercept the tap. This has already bitten the prototype once.

**Post-paywall setup order.**
- Install-to-home-screen precedes the notification request. On iOS a PWA cannot request or receive web push until installed to the Home Screen, so requesting first fails silently.
- Skip options on setup screens are de-emphasised — small, low-contrast text, never an equal-weight button.

**Hand-off starts the habit.**
- The flow ends by dropping the user on the today-dashboard and prompting them to create their real first cycle and log or schedule a first dose in the same session.
- A 5-day trial can only demonstrate the daily loop, not the longitudinal moat, so the dashboard must have something live to show the next morning. Do not end the flow on an empty dashboard.

---

## 5. Architecture & Tech

| Layer | Choice | Notes |
|---|---|---|
| Shell | PWA, mobile-first | Not in App/Play Store (margin). Add-to-home-screen install. |
| UI | shadcn/ui + Lucide icons | Per `ui-context.md`. |
| Fonts | Geist (UI), Geist Mono (data/numeric), Playfair Display (founder letter), Caveat/handwritten asset (signatures) | |
| Auth | Google OAuth (primary) + email (fallback) | OAuth app **must be published out of testing mode** before launch. |
| Payments | RevenueCat Web Billing on top of Stripe | Apple Pay / Google Pay auto-enabled → one-tap biometric, no card typing on mobile. No store fees. |
| Backend | Existing Supabase (`handle_new_user` provisions profile) | Anonymous session upgraded to authed on sign-in. |

---

## 6. Session, Auth & Payment Model

1. **Anonymous session** starts on first load. Persists through hook → housekeeping → questions → demo. No account, no wall.
2. **Age data (DOB, sex, consent)** captured on housekeeping into the anonymous session — required before the demo renders.
3. **Auth trigger = the trial button.** Tapping "Start 5-day free trial" opens Google OAuth (or email). Google returns name, email, profile photo in one tap.
4. **Payment** chains immediately after auth: RevenueCat trial-start → Apple Pay / Google Pay / card sheet → $0 authorisation → trial begins.
5. **Post-auth**, anonymous-session data merges onto the real account.
6. **Trial lifecycle:**
   - In-app trial status visible (days remaining), terminal-style, non-nagging.
   - Reminder ~day 3–4 ("2 days left") via push + email.
   - Auto-convert at day 5 → selected plan (founding price locks).
   - Cancellation flow offers a **3-day extension, not a discount**.
7. The 7-day money-back guarantee is retired.

**Affiliate / creator codes:** captured from the deep link (URL param) on first load onto the anonymous session and auto-applied at the paywall, with a manual entry fallback. The code both records creator attribution (for commission) and may apply a discount / annual offer. Validation is non-blocking — a bad code falls back to standard price. Payout infrastructure is out of scope for onboarding (D-5).

**Name/photo:** because auth (name from Google) happens at the paywall, before the welcome screen, there is **no manual name field** in housekeeping. Photo is pre-filled from Google and editable post-paywall. (See Open Decision D-2 if manual name capture pre-demo is wanted for demo personalisation.)

---

## 7. Flow Map

**Phase A — Pre-paywall (anonymous):**
| # | Screen | Aha / intent |
|---|---|---|
| 0 | Hook | Value prop, Notes↔Trackd contrast |
| 1 | Quick housekeeping | Age gate: DOB + sex + consent |
| 2 | What are you running? | Intent-building (multi-select) |
| 3 | What's the hard part? | Intent-building (multi-select) |
| 4 | Celebrate | Mascot + confetti → into demo |
| 5 | Demo 1 — Log a dose | Auto-advances on log |
| 6 | Demo 2 — Stock reflow | **The aha** |
| 7 | Demo 3 — Site (body map) | Rotation record |
| 8 | Demo 4 — History | Photos, streak, journal |
| 9 | Payoff | Bar-graph comparison + price anchor |
| 10 | Paywall | Auth + payment + trial start |

**Phase B — Post-paywall (authed, in trial):**
| # | Screen | Intent |
|---|---|---|
| 11 | Welcome | Greet by name + confetti |
| 12 | Profile photo | Optional (pre-filled from Google) |
| 13 | Add to Home Screen | **Install — must precede notifications** |
| 14 | Notifications | Push opt-in |
| 15 | Where did you hear? | Attribution (optional) |
| 16 | Founder letter | Warm closer |
| 17 | Enter → Today-dashboard | Hand-off; protocol clock live |

---

## 8. Data Captured

| Field | Where | Required | Source |
|---|---|---|---|
| DOB (18+ check) | Housekeeping | Yes | Manual (Google unreliable for birthdate) |
| Sex | Housekeeping | Yes | Manual |
| Consent (ToS/Medical/Privacy) | Housekeeping | Yes | Manual checkbox |
| "What are you running" (multi) | Running | No | Manual chips |
| "Hard part" (multi) | Struggle | No | Manual chips |
| Name | Paywall (auth) | Yes | Google OAuth / email |
| Email | Paywall (auth) | Yes | Google OAuth / email |
| Profile photo | Paywall (auth), editable post | No | Google OAuth / optional upload |
| Plan (yearly/monthly) | Paywall | Yes | Manual selection |
| Platform (iOS/Android) | Install | Inferred/toggle | UA + manual toggle |
| Attribution | Attribution | No | Manual chips |
| Affiliate / creator code | Deep link (auto) or Paywall (manual) | No | URL param or manual entry |

---

## 9. Screen Specs

> Copy strings are final and TGA-checked. Use verbatim unless flagged.

### Screen 0 — Hook
- **Purpose:** State the value prop; make the Notes-vs-Trackd contrast the first thing they touch.
- **Copy:** H1 "Stop running your protocol out of a Notes app." · Sub "Slide to see the difference." · CTA "Continue"
- **Elements:** Headline; comparison panel with a 2-position slider (Notes ⇄ Trackd). Notes = messy freeform text; Trackd = clean data rows (compound, mL left, doses left, last site).
- **Interaction:** Slider swaps panel content live.
- **Transition:** Continue → Housekeeping.

### Screen 1 — Quick housekeeping (AGE GATE)
- **Purpose:** Capture the only legally-required data before any substance content.
- **Copy:** H1 "Quick housekeeping" · Sub "Trackd is for adults 18+. Required before we go further." · Consent line "I'm 18 or older and accept the Terms of Service, Medical Disclaimer, and Privacy Policy." · CTA "Continue"
- **Elements:** DOB (date input) · Sex (segmented: Male / Female) · Consent (tappable checkbox row).
- **Logic:** Continue enabled only when consent ticked **and** DOB ≥ 18. If DOB < 18, block with a plain message and do not proceed.
- **Data:** DOB, sex, consent → anonymous session.
- **Note:** No name field (name comes from Google at paywall).
- **Transition:** Continue → Running.

### Screen 2 — What are you running?
- **Copy:** H1 "What are you running?" · Sub "Pick any that fit. Shapes what you see first."
- **Options (multi, icons):** Comp prep · TRT / hormone optimisation · Peptides · First cycle · Blast & cruise · Recomp
- **TGA:** Categories describe the *user*, never a goal/outcome. No "lose weight", "cycle safely".
- **Transition:** Continue → Struggle.

### Screen 3 — What's the hard part?
- **Copy:** H1 "What's the hard part right now?" · Sub "The stuff a tracker actually kills."
- **Options (multi):** Losing track of what's left · Reconstitution maths by hand · Can't remember my last site · Spreadsheet's a mess · No history when I get bloods
- **TGA:** All *tracking* pains. No "not knowing when to pin" / "how much to draw".
- **Transition:** Continue → Celebrate.

### Screen 4 — Celebrate
- **Copy:** H1 "Trackd's built for exactly this." · Sub "Have a look at how it works — no account needed yet." · CTA "Try it now"
- **Elements:** Mascot (flex) + amber confetti burst.
- **Transition:** Try it now → Demo 1.

### Screen 5 — Demo 1: Log a dose
- **Copy:** Eyebrow "DEMO · 1 / 4" · H1 "Log a dose in two taps." · Sub "Here's a sample compound. Tap to log it — you'll jump straight to your stock." · Footer hint "Tap the circle to log"
- **Elements:** Sample compound card ("Custom compound · 200 mg/mL · 0.5 mL dose") + large circular log button.
- **Interaction:** Tap → tick animation (pop + expanding ring) → **auto-advance** to Demo 2 (~640ms). No manual Next.
- **Note:** Any overlay (ring) must be `pointer-events:none`.

### Screen 6 — Demo 2: Stock reflow (THE AHA)
- **Copy:** Eyebrow "DEMO · 2 / 4" · H1 "Always know your stock." · Sub "Every dose reflows your inventory. No maths, ever." · Button "Log another 0.5 mL"
- **Elements:** Animated vial (fill level) + stat rows: Remaining (mL), Doses left, Projected empty (date).
- **Interaction:** Each tap drops the fill, decrements remaining + doses, shifts projected-empty date — animated. Numbers in Geist Mono.
- **Priority:** Highest-leverage screen in the app. Build it to feel *good*.
- **Transition:** Continue → Demo 3.

### Screen 7 — Demo 3: Site (SVG body map)
- **Copy:** Eyebrow "DEMO · 3 / 4" · H1 "Never lose your last site." · Sub "Tap where you pinned. Trackd keeps the record — you set the rotation." · Log line "Last 3: R glute · L delt · R delt"
- **Elements:** SVG body silhouette with tappable site markers (delts, glutes, quads, L/R).
- **Interaction:** Tap a marker → highlight + pulse → log line updates to "Logged: [site] · rotation updated".
- **TGA:** Record only. No where/how guidance.
- **Open decision D-1:** front/back toggle so posterior sites sit on a back view.
- **Transition:** Continue → Demo 4.

### Screen 8 — Demo 4: History
- **Copy:** Eyebrow "DEMO · 4 / 4" · H1 "Your history compounds." · Sub "Photos, journal, and markers — mapped to the exact protocol." · Journal sample "'Sleep off this week, appetite up.' — day 12"
- **Elements:** 3 progress-photo tiles (week-labelled) · consistency heatmap (28-day grid) · journal snippet.
- **Transition:** Continue → Payoff.

### Screen 9 — Payoff
- **Copy:** H1 "The longer you track, the more you see." · Sub "A tracker captures what guesswork drops." · Anchor "Under $1.40 a week to keep all of it." · CTA "See plans"
- **Elements:** Animated bar-graph comparison — Notes (low) / Spreadsheet (mid) / Trackd (full), bars grow on entry. Trackd bar amber.
- **TGA:** Comparison is about *tracking completeness*, not health results. No percentages/invented stats — relative bars only.
- **Transition:** See plans → Paywall.

### Screen 10 — Paywall (AUTH + PAYMENT)
- **Copy:** H1 "Unlock the full Trackd." · Value stack (ticks): "Unlimited cycles + inventory" · "Reconstitution calculator" · "Full journal + bloodwork history" · CTA "Start 5-day free trial" · Reassurance "We'll remind you before it ends · $0 today"
- **Elements:** Floating iPhone hero at top showing a fake today-dashboard (protocol clock). Value stack. Two plan cards: **Yearly (hero, pre-selected, "Save 42%" badge, $70/yr, $1.35/wk)** and **Monthly ($9.99/mo)**. *(Prices are placeholders — D-4.)* A **"Have a code?" affiliate-code field** — collapsed by default, or shown pre-filled and applied when a code arrived via deep link (`?code=`). Applied state reads "Code [X] applied".
- **Interaction:** Plan cards toggle (yearly default). If a code is present it is validated and applied (discount / annual offer + creator attribution recorded) before the payment sheet; an invalid code falls back to standard price without blocking. CTA → (1) Google OAuth / email → (2) RevenueCat trial-start → payment sheet ($0) → (3) merge anonymous data + code attribution → (4) Welcome.
- **Transition:** on success → Welcome.

### Screen 11 — Welcome
- **Copy:** H1 "Welcome, [name]." (fallback "You're in. Welcome to Trackd.") · Sub "Five days on the house. Let's get you set up — takes a minute." · CTA "Let's set things up"
- **Elements:** Mascot (happy) + confetti.
- **Transition:** → Profile photo.

### Screen 12 — Profile photo (optional)
- **Copy:** H1 "Add a profile photo" · Sub "Totally optional — it just lives on your device." · CTA "Continue" · Skip (dim, small) "Skip for now"
- **Open decision D-3:** consider folding into Welcome to drop a step.
- **Transition:** → Install.

### Screen 13 — Add to Home Screen (INSTALL FIRST)
- **Purpose:** Install the PWA. **Must precede notifications** — iOS PWAs cannot request/receive web push until installed.
- **Copy:** H1 "Add Trackd to your home screen" · Sub "It runs like a normal app once it's there — and this comes first so notifications work." · CTA "I've added it" · Skip (dim, small) "Skip for now"
- **Elements:** iPhone/Android segmented toggle → device-specific 3-step instructions (themed).
  - iOS: Share in Safari → Add to Home Screen → Add
  - Android: Chrome menu → Add to Home screen → Add
- **Interaction:** "I've added it" advances (auto-redirect on relaunch if detectable).
- **Transition:** → Notifications.

### Screen 14 — Notifications
- **Copy:** H1 "Stay on schedule" · Sub "A nudge on dose days — nothing else. You control what fires." · CTA "Allow notifications" · Skip (dim, small) "Not now"
- **Elements:** Sample notification card ("Trackd · Due today: Test E · 0.5 mL").
- **Interaction:** CTA → OS permission prompt.
- **Skip styling:** small, low-contrast grey.
- **Transition:** → Attribution.

### Screen 15 — Where did you hear about us?
- **Copy:** H1 "One quick thing" · Sub "Where'd you hear about us? Optional — helps us a lot."
- **Options:** Instagram · TikTok · A mate · A community / group · Somewhere else
- **Transition:** → Founder letter.

### Screen 16 — Founder letter
- **Copy (Playfair italic):** "We built Trackd because we were sick of running our own protocols out of a spreadsheet and a bad memory. It's a tool, not a coach — the decisions are yours. We just make sure nothing gets lost. / Thanks for backing us this early. It means the world." · Signature (handwritten/Caveat): "Angus & Adrian" · "Founders, Trackd Co" · CTA "Enter Trackd"
- **Transition:** Enter Trackd → Today-dashboard.

### Screen 17 — Hand-off
- Drop onto the today-dashboard, protocol clock live. **First-run priority:** prompt to create the real first cycle and log/schedule a first dose *in this session*, so the dashboard has something live to show tomorrow.

---

## 10. Interactive Demo Mechanics (build detail)

The demo runs on a **canned sample cycle** that never touches the user's account (anonymous, throwaway state).

- **Reflow (Screen 6):** local state `{ml, dosesLeft, projectedEmpty}`. Each log: `ml -= 0.5`, `dosesLeft -= 1`, recompute projected-empty date, animate fill height and count. Clamp at 0.
- **Body map (Screen 7):** SVG with tappable `<circle>` markers carrying `data-site`. Tap → highlight/pulse + update log line. No persistence.
- **Auto-advance (Screen 5):** guard with a `logged` flag so a double-tap can't double-fire; advance on a timeout after the tick animation.
- All overlays decorative-only → `pointer-events:none`.

---

## 11. Design System / Tokens

| Token | Value |
|---|---|
| Background / surface | `#060607` / `#111113` |
| Border | `#26262A` |
| Text primary / secondary / muted | `#F2F2F0` / `#9A9A98` / `#6A6A68` |
| Accent (amber) | `#F3A63C`; tints `#1C1608` (fill), `#F7E4C4` (text-on-amber) |
| Radius | cards 16px · inputs/chips 12–13px · buttons 14px |
| Numeric/data | Geist Mono |
| **No red. No green "safe" signalling. Amber = category/brand only.** | |

Components: segmented control, multi-select chip, consent row, plan card (+badge), stat row, vial fill, SVG body map, bar chart, mascot, confetti, device-frame chrome (status bar / Dynamic Island / home indicator). Anything not already in `ui-context.md` must be flagged before creation.

---

## 12. Notifications & Install — platform rules

- **iOS PWA:** web push only works **after** Add-to-Home-Screen install. Install (Screen 13) must precede notifications (Screen 14). Verify against current iOS behaviour at build time.
- Provide device-specific install instructions (UA-detected default, manual toggle).
- Notification copy stays tool-framed, never dosing instruction.

---

## 13. Analytics Events (funnel)

Fire at minimum: `onboarding_start`, `age_gate_passed`, `running_selected`, `struggle_selected`, `demo_dose_logged`, `demo_completed`, `payoff_viewed`, `paywall_viewed`, `plan_selected`, `affiliate_code_applied`, `affiliate_code_invalid`, `auth_started`, `auth_completed`, `trial_started`, `install_confirmed`, `notifications_granted`, `attribution_selected`, `onboarding_completed`. Route through RevenueCat where it owns the event (trial/entitlement).

---

## 14. Copy Do-Not-Ship List

Never ship, anywhere in onboarding:
- Outcome claims: "cycle safely", "lose weight", "get bigger", "better results", "optimise your gains".
- Dosing-adjacent: "when to pin", "how much to draw", "how to inject", "recommended dose".
- Safety framing: "safe", "safely", "safer".
- Fabricated stats: "ahead of X% of people", any invented percentile/success rate.
- Red/green risk colour, warning iconography tied to substances.

---

## 15. Implementation

Follow the project structure and conventions in `architecture.md` and `code-standards.md`.

**Work through this ONE STEP AT A TIME.** Implement a step, confirm it builds with no TypeScript or lint errors, then move to the next. Do not build everything at once.

1. **Anonymous session + shell.** Stand up the flow shell and an anonymous session that persists across all pre-paywall screens. Confirm no auth is required to reach or complete the demo.
2. **Age gate.** Build housekeeping (DOB, sex, consent) writing to the anonymous session. Enforce the 18+ block and consent requirement. Confirm no onward path exists for under-18. If DOB can't sit on the anonymous session without a migration, flag it.
3. **Intent screens.** Build the two multi-select screens (running, struggle) against `ui-context.md` components. Data optional; store on the session.
4. **Demo — throwaway state.** Build the four demo screens on local sample state. Verify nothing written touches real cycle/schedule/log tables. Get the reflow (Screen 6) feeling right; confirm the log button (Screen 5) auto-advances exactly once with no overlay intercepting the tap.
5. **Payoff + paywall UI.** Build the payoff comparison and the paywall (value stack, plan cards, trial CTA). Prices from config, not hardcoded (D-4).
6. **Auth + payment chain.** Wire the CTA: Google OAuth (+ email fallback) → RevenueCat trial-start → payment sheet. Then merge anonymous-session data onto the account. If the merge needs a migration, present it before running.
7. **Post-paywall setup.** Build welcome (greet by Google name + confetti), optional photo, install, notifications, attribution, founder letter. Enforce install-before-notifications.
8. **Hand-off.** Route "Enter Trackd" to the today-dashboard and trigger the first-cycle / first-dose prompt.
9. **Regression tests.** Cover each reproduction in the checklist below so they cannot silently return.

**Deployment / preview:**
- Deploy to a Vercel preview subdomain so we can view and test it from the subdomain URL. Confirm the preview deployment is live and share the link.

---

## 16. Open Decisions

- **D-1 — Body map front/back toggle.** Current schematic places glute markers on the front for tap-ability. Add a back view before ship. *(Default: add toggle.)*
- **D-2 — Manual name pre-demo.** Name currently comes from Google at the paywall. If demo personalisation is wanted, add a name field to housekeeping. *(Default: no — keep housekeeping lean.)*
- **D-3 — Fold profile photo into Welcome.** Removes a near-empty step. *(Default: fold.)*
- **D-4 — Pricing.** $70/yr, $9.99/mo, 42% badge are placeholders pending final pricing lock.
- **D-5 — Affiliate payout infrastructure.** Onboarding captures, validates, and applies codes; commission tracking/payout is a separate layer (e.g. Rewardful or Tolt on Stripe, RevenueCat offer codes, or manual). Pick the tool before creator payouts go live. *(Default: Rewardful/Tolt on Stripe for web.)*
- **D-6 — Codes tied to annual.** Decide whether a creator code applies to any plan or unlocks/deepens the annual offer only (per the Pep AI model). *(Default: code deepens the annual offer.)*

---

## 17. Check When Done

- [ ] Anonymous session persists across every pre-paywall screen; no auth wall reachable before the demo
- [ ] Demo runs entirely on throwaway state; nothing written to real cycle, schedule, or log tables
- [ ] Log button on demo 1 auto-advances once, never double-fires, and no overlay intercepts the tap
- [ ] Reflow screen animates fill, remaining, doses left, and projected-empty on every logged dose
- [ ] Age gate blocks under-18 and blocks progression without consent
- [ ] No payment path bypasses the age gate
- [ ] DOB captured on the anonymous session (not deferred to auth)
- [ ] Trial CTA triggers Google OAuth → RevenueCat trial-start → payment sheet, in that order
- [ ] Anonymous-session data (DOB, sex, selections) merges onto the account after auth
- [ ] Welcome greets by Google name and falls back cleanly when no name is present
- [ ] Install-to-home-screen precedes the notification request; push only requested post-install
- [ ] Skip options are small and low-contrast, not equal-weight buttons
- [ ] Hand-off lands on the today-dashboard and prompts real first-cycle + first-dose creation
- [ ] No copy violates the TGA do-not-ship list (§14)
- [ ] Australian English throughout
- [ ] 7-day money-back guarantee not present alongside the trial
- [ ] Google OAuth app published out of testing mode
- [ ] Trial reminder (push + email) scheduled; cancellation offers a 3-day extension, not a discount
- [ ] Prices rendered from config, not hardcoded as final
- [ ] Affiliate code auto-captured from the deep link (URL param) onto the anonymous session
- [ ] Manual "Have a code?" entry available at the paywall
- [ ] Applied code shows an applied state and adjusts price/plan per its rules
- [ ] Invalid/expired code fails quietly to standard price, never blocks the trial
- [ ] Creator attribution recorded on the account for commission
- [ ] Regression tests exist for each reproduction above
- [ ] No core-app screen restyled or rebuilt by this spec
- [ ] No colours, fonts, or styles introduced outside `ui-context.md`
- [ ] No new shared components created without flagging
- [ ] No TypeScript errors
- [ ] No lint errors
- [ ] Deployed to a Vercel preview subdomain and viewable
- [ ] Built step by step, each step verified before the next (per `code-standards.md`)

---

*End of spec.*