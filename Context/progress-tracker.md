# Progress Tracker

Records the **state** of the build: what's done, what's in progress, and the
decisions made along the way. This file is the rear-view mirror.

Forward-looking, actionable steps do **not** live here — they live in
`Context/next-tasks.md`. Update this file after every meaningful change.

Last updated: 2026-07-17

## Spec 20 — Quick-actions FAB + Calculator nav slot (2026-07-17, Adrian + Claude)

The bottom-nav centre slot is now **Calculator**, and quick-add moved out of the nav
into a **floating action button** bottom-right. **SHIPPED to prod** via PR #56 (squash
`f9e8816`), on Adrian's explicit go-ahead. No schema surface: this spec touches no data.

**CodeRabbit (Pro Plus) raised 3 findings, all valid, all fixed in `f0a9717`:**
- **The `aria-modal` was a lie, and it hid the close button.** The menu declared
  `aria-modal="true"` but never contained focus, so Tab wandered into the nav behind the
  scrim — and worse, `aria-modal` tells a screen reader to ignore everything outside the
  dialog, while the FAB (the only close control) sat outside it. The attribute hid the X
  from exactly the users it exists to serve. Fixed by making **one fixed `inset-0`
  layer own both the card and the FAB** and carry the dialog role only while open, so
  the boundary contains its own close control; a Tab handler cycles focus over
  `[card buttons…, FAB]`. The layer is `pointer-events-none`, so the scrim underneath
  still takes a tap and — the regression this restructure risked — the *closed* layer
  can't swallow taps meant for the page. Verified: nav tabs, mid-page controls and page
  scroll all still work through it.
- **The card could clip its own actions off-screen.** No max-height while opening locks
  body scroll ⇒ in landscape the top row of tiles went off the top with no way to reach
  them. Capped at `calc(100dvh - CARD_BOTTOM - 1rem)` + `overflow-y-auto`; the geometry
  (`FAB_BOTTOM`/`CARD_BOTTOM`/`CARD_MAX_H`) is now expressed **once** so the height
  derives from the FAB's offset instead of re-deriving the same calc and drifting.
- Stale `/preview` copy still naming the old plus → Add-to-Stack flow.

**Five independent adversarial lenses failed to refute either fix** (accessibility spec,
React/DOM correctness, CSS validity, iOS interaction, layout equivalence) — including
confirming the nested `calc(…env()…)` resolves in-engine and that the card's rect is
unchanged by the restructure.

**The extraction is PROVEN identical (closed 2026-07-17).** The post-merge diff of
`git show 6bd0ca8:components/home/ReconCalculatorSheet.tsx` vs
`components/home/ReconCalculator.tsx` shows **all eight logic units byte-identical**
(`sanitize()`, `toMg()`, `trim()`, the `useState` block, the `useMemo` arithmetic,
`NumberField`, `ResultRow`, `DISCLAIMER`), identical labels/placeholders/result strings,
and a body JSX differing only by `<p>{DISCLAIMER}</p>` collapsing from three lines to
one. Nothing was lost in the move; nothing needed re-adding. Worth having done properly
rather than inferred — this is the one bit of the app that touches dosing arithmetic.

**Device pass DONE (2026-07-17, Adrian, iPhone 17 on prod).** The FAB sits correctly,
clears the home indicator, and every action in the menu is tappable. This was the one
acceptance criterion a headless browser could not answer — it reports a *synthetic*
`env(safe-area-inset-bottom)`, so the offset maths could only ever be confirmed on real
glass. Spec 20 is now fully verified end-to-end.

(Android + an *installed* PWA weren't separately checked. Low risk by construction: a
standalone launch only *increases* `safe-area-inset-bottom`, and both the nav's padding
and `FAB_BOTTOM` read the same inset, so the FAB rises with the bar rather than being
overlapped by it. Flagged, not chased.)

- **The nav is five equal tabs now.** Dashboard / Protocol / **Calculator** / Progress /
  Profile, every one on the same active-amber logic. The raised white plus that held the
  centre slot is gone — with it the `-translate-y-2` lift and the exemption from the
  active/gray rule. `BottomNav` takes **no props** at all any more; `userId`/`unit`/
  `bodySex` went to the FAB, which is what needs them.
- **Why the calculator got the slot:** it's one of the four core differentiators, and it
  was buried behind a plus-menu tile. Adrian confirmed the standalone page matters
  beyond this spec — **the calculator itself is getting reworked later**, and it needs a
  page to be reworked *on*.
- **`/calculator` is a real route** (`app/(app)/calculator/page.tsx`), a standalone
  screen on the serif `PAGE_TITLE` scaffold, behind the `(app)` auth + gate like every
  other feature screen.
- **The calculator was extracted, not rewritten** (Spec 20 → D5). It only ever existed
  as a bottom sheet — its fields and maths lived *inside* `Sheet`/`useSheetDrag` chrome,
  so there was nothing mountable on a page. `components/home/ReconCalculator.tsx` is now
  the calculator itself (state + arithmetic + fields + result + working + disclaimer),
  moved **verbatim**; `ReconCalculatorSheet` is reduced to frame-only and renders it, so
  the **Home glance card behaves exactly as before**. Two frames, one calculator.
  Verified by driving it: 5 mg / 2 mL / 250 mcg → 2.5 mg/mL, 0.1 mL, 10 U — unchanged.
  D5's stop condition (coupling to *add-compound state*) did **not** apply: the
  calculator takes no props and fetches nothing. Flagged to Adrian before touching it;
  he approved the extraction.
- **The nav tab is the calculator's ONLY entry point** (Adrian's call, on seeing it
  built). It first shipped with two — the tab plus the Home `ReconCalcCard` glance card,
  since changing Home was out of Spec 20's scope — and he cut the Home one: "it doesn't
  need to be on the dashboard screen anymore." So `ReconCalcCard.tsx` and
  `ReconCalculatorSheet.tsx` are both **deleted**, and with them the last caller of the
  sheet frame. That leaves the extraction doing exactly one job: `ReconCalculator` on a
  page. (The card was the bottom-most card in the Home scroll, so it lifted out without
  reflowing anything above it.) `/preview/recon` was repointed at `ReconCalculator` on
  the real page scaffold — it's the only way to see the calculator without logging in.
- **The FAB** (`components/shortcuts/QuickActionsFab.tsx`) is rendered once by the
  `(app)` shell, so it appears on exactly the screens that show the nav. Tap → the plus
  rotates 45° into an X, a scrim dims the full viewport (**the nav included**), and a
  raised card rises above the button. Tap the X, the scrim, or Escape → the whole thing
  plays in reverse.
- **Hand-rolled, not a Radix dialog** — and that's forced, not preference: the FAB must
  stay live while the menu is open (it *is* the close button), and a modal dialog makes
  everything outside its own content inert. So plain `useState` per D8, with Escape,
  body-scroll lock, focus-into-menu-on-open and focus-back-to-FAB-on-close done by hand.
  An **action** closes without restoring focus (the flow it opens takes over); a
  **dismissal** restores it.
- **The action set is the old menu's, minus the calculator** (D6 — reported to Adrian
  and on the record: the nav slot is now its entry point, so a tile would only duplicate
  it). **The old primary "Log a dose" amber row folded in as an equal tile** (Adrian's
  call) — inside a pop-up that size, that hierarchy read as clutter, not emphasis. It
  needed a `shortLabel` it never had ("Log a dose"). Six tiles, 3×2, exactly full: Log a
  dose, Add compound, Journal, Weight, Blood work, Calendar.
- **"Beta notes & feedback" is a full-width WHITE row under the grid** — `QUICK_ACTIONS`
  (six) + a separate `FEEDBACK_ACTION`. It was *also* folded in as a seventh tile at
  first; seeing it built, Adrian cut that: a 7th tile left a ragged one-item last row,
  and the white row both fills that space and reads better. White is the primary accent
  (`ui-context.md`), so the row carries weight without amber — and the shape sets the
  temporary beta tool apart from the six core actions rather than hiding it among them.
  This lands close to where the pre-Spec-20 menu had it (a distinct row below the grid),
  which is some evidence the original split was right about *this* item, if not about
  "Log a dose".
- **The old dropdown is deleted.** `components/shortcuts/ShortcutsMenu.tsx` is gone;
  `shortcutItems.ts` is rewritten around `QUICK_ACTIONS` (six) + `FEEDBACK_ACTION` (the
  old `PRIMARY_ITEM`/`GRID_ITEMS`/`FEEDBACK_ITEM` split and the `"calculator"` action
  are retired). Grep confirms no orphan references. The six dev-only `/preview/*`
  harnesses were updated to the new shell shape so they stay representative.
- **Two missing tokens were flagged, not invented** (the spec's own rule), and Adrian
  chose to document them first:
  - **A motion scale** — `--motion-fast` 180ms / `--motion-base` 240ms / `--motion-slow`
    320ms / `--motion-ease` `cubic-bezier(0.16, 1, 0.3, 1)`, read off the as-built
    screens rather than invented, exposed as the `ease-motion` utility. Durations have
    no Tailwind theme namespace, hence `duration-[var(--motion-fast)]`.
  - **A z-index scale** — the de-facto ladder written down: nav `z-40`, quick-actions
    scrim `z-[45]`, FAB + card `z-[46]`, sheets `z-50`, confirm modals `z-[60]`, notice
    `z-[70]`. The FAB sits above the nav and below the sheets on purpose: it must clear
    the bar it floats over, but any flow it opens must cover it. Tailwind has no z-index
    theme namespace, so these are documented values, not CSS vars.
  - Plus a new **`QUICK_ACTION_BADGE`** preset (the `CARD_ICON_BADGE` amber idiom made
    circular) — added to `ui-presets.ts` + `ui-context.md` **before** use, per the
    doc-first rule. It's the only round badge in the app.
- **Verified by driving it, not just building it:** FAB 56×56 (≥44px) sitting clear of
  the nav's top edge and fixed across a 400px scroll; `aria-expanded` false→true;
  `aria-label` "Open quick actions"→"Close quick actions"; the rotate resolving to
  `45deg` over `0.18s` with the house easing (Tailwind v4 sets the `rotate` property,
  not `transform`); scrim `rgba(0,0,0,0.7)` = `--overlay-backdrop`; card
  `rgb(36,36,34)` = `--bg-surface-raised`; six tiles + the white feedback row
  (`rgb(255,255,255)`), **no calculator**; focus landing on
  "Log a dose" and returning to the FAB on Escape; body scroll locked then restored; the
  Calendar tile landing on `/calendar`; and under `prefers-reduced-motion` the menu
  showing and hiding instantly with `animation-name: none`. The calculator's arithmetic
  was re-driven after the extraction (5 mg / 2 mL / 250 mcg → 2.5 mg/mL, 0.1 mL, 10 U)
  and again on the page itself (10 mg / 2 mL / 1 mg → 5 mg/mL, 0.2 mL, 20 U).
- **One fix came out of looking at it:** the card was first built on `--bg-surface` and
  read flat against the dimmed page — swapped to the documented elevated surface
  (`--bg-surface-raised`), and the tile hover moved up a layer to `--bg-input` to stay
  visible on it.

## Back-dating — log a dose (and start a compound) on a past day (2026-07-17, Adrian + Claude)

Adrian's ask: "what if I logged something the day before, but then I track it the day
after?" You take a shot Tuesday night and open the app Wednesday. **The day the week
strip is parked on is now the day you write to.** BUILT + verified locally; `tsc` +
`eslint` + prod `build` clean. **Shipped via PR #55** (two CodeRabbit rounds folded in
— see below), merged to `main` → Vercel prod on Adrian's go-ahead.

**Half of it already worked, silently — that was the real problem.** The per-compound
tick already wrote to `selectedKey` ([HomeScreen.tsx:413]) and the DB never had a
temporal constraint (`taken_at` has a `now()` *default*, no CHECK; RLS has no date
predicate). So back-dating was already possible with **no indication**, stamped with
**today's wall-clock time**, and **drawing down today's vial**. The work was making it
honest, not making it possible.

- **The log sheet is day-aware.** `LogDoseSheet` now takes `dateKey` + `todayKey`
  (from `HomeScreen`'s `selectedKey`; `QuickTrackSheet` passes today for both — the
  + menu is a "log it now" shortcut with no day context).
- **Time defaults per day.** Today → the live-ticking clock, evaluated at submit
  (unchanged). Any other day → **the compound's `schedule.timeOfDay`** (Adrian's pick).
  Stamping "now" onto yesterday's dose was the thing making late-logged data wrong.
- **Past start dates unblocked.** `AddCompoundSheet` dropped both "Start date can't be
  in the past" and "the time must be later than now". You add a compound *after* you've
  started running it, and `isDueOn` gates on the start date — so without this, a
  back-dated dose has nothing to attach to. The year dropdown now reaches back 5 years
  (`PAST_START_YEARS`), which also lets an existing compound's start be **moved
  backwards** (edit was always exempt from the check; the year list just never offered
  the years).
- **Quiet notices, not warnings** (Adrian: "make it something small… not super
  noticeable"). Muted `bg-bg-surface-raised` + `text-text-muted`, date in mono,
  deliberately **not amber** — amber is active/interactive state, and back-dating is
  supported, not an alarm. Same pattern in both sheets.
- **The log-sheet note states the date and nothing else** — "Logging to Wed 15 Jul".
  Adrian reviewed the first cut and cut both qualifiers: ", not today" and "— a future
  day" are gone, so **past and future read identically**. Naming the day is the whole
  job; qualifying it editorialises about a choice the user just made, and a future dose
  is simply "tracked on the date" like any other. (The add sheet's past-start note is
  untouched — it explains *why* the option exists, which is a different job.)
- **Unlimited, deliberately** (Adrian's call). No clamp on how far back; the year
  dropdown bound is a picker affordance, not a rule.

**Vial link now resolves by the dose's DATE (Adrian's call).** The auto-link took the
compound's *newest active* vial regardless of when the dose happened — the code's own
comment called this out ("a historical dose never retro-links to a vial bought long
after it was taken") while the live path did it anyway. It now takes the newest vial
with `acquired_on <= dateKey`, **active or since-archived** (one vial is in use per
compound at a time — `addStockItem` archives the priors — so "newest acquired by then"
*is* the one that was in use). No vial that far back ⇒ **no link**, not a wrong one.
- **`acquired_on` (a date), not `created_at` (an instant)** — it's the column that
  means "when this item started being used", and comparing by DAY avoids a bug the
  instant-compare introduced: a dose logged for 08:00 today from a vial added at 14:00
  today would have lost its link. Checked live first: 22 vials, **0 null `acquired_on`,
  0 rows where it differs from `created_at::date`** → behaviour-identical on real data.
- **Verified against live data** across 5 dose dates on the one compound that has two
  vials (24 Jun archived → 11 Jul active): today and 11 Jul pick the active vial under
  **both** old and new rules (**no regression to live logging**); 1 Jul now picks the
  archived 24 Jun vial (old rule wrongly picked 11 Jul); 1 Jun now links **nothing**
  (old rule wrongly deducted from the 11 Jul vial).
- A back-dated log can't pick from `listStock` (it only knows what's active *now*), so
  the sheet **resolves the day's vial itself** via `resolveVialForDate` and adopts that
  id — a fresh back-dated log therefore commits an **explicit id**, and the sheet shows
  "Counts against the vial you were using on {date}" with the same opt-out. It stays
  **undecided** (`undefined`, no key) only when there's nothing to adopt: the compound
  had no vial back then, or the dose was tracked before the read returned — and the
  server's `vialOnDate` fallback covers that second case with the same rule. (This
  paragraph originally described the pre-review design, where *every* back-dated log
  stayed undecided; the round-1 fix below changed it.)

**Verified by driving the real UI** (headless Chrome over CDP against `/preview/home`
— zero new dependencies; Chrome + Node 24's global `WebSocket`):
- Back-dated (−2d): notice "Logging to Wed 15 Jul", time **08:30** = the compound's
  scheduled time, hint "Using this compound's scheduled time."
- **Today (0d): no notice, time 00:56, "Logging at 00:56:31 — live now."** — the
  regression check that matters; today's flow is untouched.
- Future (+2d): "Logging to Sun 19 Jul" — identical wording to the past.
- Add-compound: year list `2021…2028`; notice "Starting on Fri 17 Apr, in the past —
  so you can log the doses you've already taken."; **Add saved
  `startDate: "2026-04-17"`** (3 months back) — previously rejected outright.

**Future logging — SETTLED (Adrian, 2026-07-17): leave it, and don't call it out.** You
can log a dose to a future day, and could before this change (the strip scrolls forward
unbounded and the tick has always worked). Adrian's call is that a future dose is just
"tracked on the date" like any other — so it is **not blocked** and the notice names the
day without qualifying it. No further action.

**Deferred — CONFIRMED (Adrian, 2026-07-17):** a logging path on the **Calendar** ("the
calendar for now is read-only, yes") — its day sheet stays read-only.

### PR #55 — CodeRabbit round 1: 5 findings, 3 fixed / 2 skipped

**FIXED — the vial link was silently unlinked when editing a back-dated dose (Major, real).**
CodeRabbit flagged `useState(existing ? (existing.inventoryItemId ?? null) : undefined)`, but
the **root cause was one layer down**: `loadDoseLogs` normalised the absent key to `null`.
`DoseLog.inventoryItemId` has THREE meaningful states — string / `null` ("Not tracked") /
absent ("undecided → server resolves it") — and the normaliser destroyed the third, so
re-opening a back-dated dose read as *Not tracked* and **dropped its vial link on Update**
(stock silently returned). `JSON.stringify` drops undefined values, so the key's ABSENCE is the
carrier; `loadDoseLogs` now preserves it, and the sheet no longer `?? null`s it.
- **Proven both ways in the browser:** post-fix, a back-dated log stores
  `{"amount":"125","siteId":null,"time24":"08:30"}` (no key) and still has no key after
  reload → edit → Update. Stashing the fix back to the committed PR state reproduced the bug
  exactly — `"inventoryItemId":null` after the edit. The bug was real, not a phantom.
  (The harness is unauthenticated, so `resolveVialForDate` finds nothing and the log stays
  keyless — which is precisely the state that used to rot into an explicit `null`. With a real
  vial the sheet adopts its id instead, and the round-trip carries that string through.)

**FIXED — the opt-out was hidden when no vial is active today (Major, real).** `vials` is
active-now stock, so `vials.length === 0` can coexist with an **archived** vial the server
will link ⇒ silent stock decrement with no way to decline. CodeRabbit's suggested
`!loadingVials` would have shown the block for compounds that never had a vial (claiming one
that doesn't exist), so instead the sheet now **resolves the day's vial** via the new
`resolveVialForDate` server action and shows the block **exactly when a vial will be linked**.
That also makes the committed link an explicit id, so an edit round-trips the real vial.
- Required dropping `.eq("is_active", true)` from the explicit-pick validation — a back-dated
  dose legitimately draws from a vial archived by now, and that filter would have silently
  dropped exactly the link just resolved. Ownership + unit family remain checked; RLS + the
  `dose_logs` unit-family trigger stay the backstop.

**FIXED — unit family now filtered IN the query (Minor, real but pre-existing).** The old code
took `limit 1` then checked `unitFamilyOk`, so an incompatible newest vial lost the link
instead of falling through to an older compatible one. The rule is now one helper
(`vialOnDate`) shared by the write path and the sheet's read, with `base_unit` filtered in the
query. Re-verified on live data: identical picks (today → active 11 Jul vial; 1 Jul → archived
24 Jun vial; 1 Jun → null), and `dose_unit mg → required base mg`.

**SKIPPED ×2 — "documentation is future-dated (should be 2026-07-16)".** Not a defect:
CodeRabbit is reading **UTC**. This project is Sydney-based (`profiles.timezone`, Sydney the
documented fallback) and the machine reads `Fri Jul 17 01:34 AEST` = `Thu Jul 16 15:34 UTC`.
The commit itself is stamped `2026-07-17 +1000`, the app's own device clock rendered
"FRIDAY, 17 JULY" in the verification screenshots, and the repo's dates are local throughout.
**2026-07-17 is correct.**

### Adversarial review of the fix — 15 claims, 0 survived

A 4-lens review (three-state semantics / the resolve effect / the server rule / regressions to
today) raised 15 claims; every one was refuted on inspection, almost all because the scenario
is **identical at HEAD** (the diff must make something *worse* to count). Two were worth acting
on anyway, since this change now owns that exact code:

- **`.eq("protocol_compound_id", pcId)` added to the explicit-pick validation.** Dropping
  `is_active` (needed — see above) had widened the accepted set from "this compound's active
  vials" to "every vial the user owns", and that check had never verified compound membership.
  Without it, a stale or hand-edited cache could point compound A's dose at compound B's vial
  and draw down the wrong stock. The DB constrains the unit family but **not** the compound, so
  nothing else caught it. Verified against live data: **51 linked dose logs, 0 cross-compound**
  → the check rejects nothing real. (The same query found **5 existing links to archived
  vials** — independent proof that the `is_active` relaxation was necessary: under the old rule
  those 5 doses would have lost their link on any re-save.)
- **`vialOnDate` now logs its Supabase `error`** instead of discarding it. A failed read and
  "no vial that far back" both correctly yield no link (never guess a vial), but they're very
  different problems and a broken query used to read as empty stock. Flagged independently by
  three reviewers.

### PR #55 — CodeRabbit round 2: 4 findings, 3 fixed / 1 part-skipped

**FIXED — the acquisition-date rule now applies to EXPLICIT vial ids too**, not just the
auto-resolve. Otherwise the date rule is bypassable by anything sending an explicit id, and a
link made under the OLD rule (newest *active* vial, whenever the dose happened) would survive
every re-save instead of healing. Legit picks satisfy it by construction. Verified on live
data: **51 linked doses, 0 with a vial acquired after the dose's day** → rejects nothing real.

**FIXED (and it exposed a bug neither review caught) — the `acquired_on` compare needed a
+1-day local-vs-UTC tolerance.** `inventory_items.acquired_on` defaults to `current_date`,
evaluated by the DB in **UTC**, while `dateKey` is the **device's local** date. A user BEHIND
UTC adding a vial in the evening gets it stamped with tomorrow's UTC date, so a strict
`<= dateKey` would have refused to link the dose they'd just taken from it. Now
`<= dateKey + 1`, matching the identical tolerance already used by `weight/actions.ts`
`isFuture` ("a user ahead of UTC legitimately logs a date up to a day ahead of the server's
UTC date"; max real offset is one calendar day either way). Back-dating stays honest — a vial
acquired a week after the dose still can't link; this only forgives the boundary. Invisible in
our own data (all AU, max diff 0 days), which is exactly why it needed reasoning rather than a
query.

**FIXED — a cycle starting EARLIER TODAY now gets the same confirmation.** `startsInPast` only
compared dates, and removing the "time must be later than now" rule had made an earlier-today
start reachable and unconfirmed — its first dose has already been and gone, so it's a past
start. The notice adapts ("Starting today at 8:30 AM, already passed…") since "in the past"
reads wrong for today. Can't fire on its own as the clock ticks: while the time is
live-tracking, `timeOfDay` IS `hhmm(clock)`.

**PART-SKIPPED — "disable Track while the historical vial is still resolving".** Took the
disclosure half, refused the blocking half. Gating the primary action on a Supabase round-trip
would contradict a documented invariant (`architecture.md`: "A network blip never blocks the
UI — the synchronous local write already succeeded"), and offline it would be worse than the
problem. It isn't a data bug either: tracking early links the **same** vial, because the server
fallback runs the same `vialOnDate` rule — it's a disclosure gap, and the opt-out is one tap
away on re-open. So the back-dated vial section now has its **own pending hint** ("Checking
which vial you were using…") instead of rendering nothing and reading as "no vial" before it
knows. Track stays enabled.

## Injection-site route now defaults to the stack's majority route (2026-07-17, Adrian + Claude)

Both injection-site views (the Home glance card and the full map sheet) hardcoded
`useState<InjectionSiteRoute>("im")`, so a mostly-Sub-Q user landed on an empty IM
body and had to re-toggle on every app open. The default is now **derived from the
protocol**: `majorityInjectionRoute(activeStack)` (`lib/home/stack.ts`) counts the
injectable compounds and returns the route with more of them.

- **Counted per compound, not per dose** — Adrian's call. One daily Sub-Q peptide
  does not outvote two weekly IM compounds. Orals/nasal don't vote; archived
  compounds don't vote (no longer dosed).
- **IM wins a tie**, an all-oral stack, and an empty stack — the pre-protocol default
  is unchanged, so a new user's first impression is what it always was.
- **Soft default, session-scoped.** The toggle still switches freely; the pick is
  deliberately *not* persisted, so closing and reopening the app re-derives from the
  protocol. Implemented as `picked ?? defaultRoute` (`picked: InjectionSiteRoute |
  null`) rather than seeding `useState`, because the stack hydrates from localStorage
  *after* first render — a seeded `useState` would freeze the pre-hydration guess of
  `im` and reintroduce the bug for everyone.
- Verified against the real helper across 8 stack shapes (majority both ways, tie,
  empty, all-oral, archived-only-IM); typecheck + build clean.
- **Known, pre-existing:** the card and sheet hold independent route state, so
  toggling the card then opening the sheet doesn't carry the pick over (both now open
  on the correct default, so the friction is much smaller). Not fixed this pass.

## Spec 19 (female bodies) — SHIPPED to prod as PR #54 (squash `afb9dec`) (2026-07-16, Adrian + Claude)

The injection-site body map is now **sex-aware**: male users get the existing figure,
female users get Angus's female artwork. **Merged to `main` → deployed to Vercel prod**
as **PR #54** (squash `afb9dec`); typecheck + lint + build clean, CodeRabbit review folded
in (a single preview-only nitpick: a picked site's label blanked when switching route).
**▶ Remaining: Adrian's on-device QA.**

- **Angus's 4 female SVGs integrated** (`Context/Feature Specs/body-svg/female/`, male
  art moved to `body-svg/male/`) → generated `bodyArtworkFemale{IM,SubQ}.ts`. They were
  authored in the **same 1491×2109 canvas** as the male set, so all four modules share
  one identical transform — switching sex or route never resizes or shifts the body.
  Angus's ids differ in spelling from the male set (`outer_quad_l` vs `quad_outer_l`,
  `delth_l` typo, `outer_quad_l_2` Figma dedupe suffix), so the generator maps each id
  explicitly to its catalogue site id and **fails loudly** on an unmapped/duplicate/
  missing one rather than silently dropping a region.
- **Verified by rendering, not just typecheck:** all 8 bodies (2 sexes × 2 routes ×
  front/back) were rendered headless from the *generated* data using the app's own
  transform + 0–100 viewBox. Regions land on the right anatomy; the mirror convention
  (screen-left = your left) holds on every view, including the backs — checked against
  Angus's labels, which were all correct.
- **Decisions (Adrian's calls, 2026-07-16):**
  - **Female has no pecs.** Angus's female IM art omits them, so `im-pec-*` is filtered
    out for female users (`sitesForSex`). Female IM = 20 sites, Sub-Q = full 14.
    Existing history is untouched — a logged pec still renders its label.
  - **No "prefer not to say".** Removed from Settings; the **welcome gate now asks for
    sex** (required, server-validated) alongside DOB. It's male or female.
  - **Null sex → male body.** Only legacy rows (pre-gate-question) can be null; Settings
    shows those a "Select…" placeholder and requires a pick, so a save can't silently
    write a sex the user never chose.
  - **Changing sex in Settings pops a confirm** naming the body-map switch; selections
    and history are explicitly kept (site ids are shared across both bodies).
- No migration needed — `sex` was already `sex_type` on `profiles` and already in the
  column-level UPDATE grant (`grants/003`).

## Spec 19 — SHIPPED: merged to prod as PR #53 (squash `cabc184`); Home consistency strip removed; demo login cleaned up (2026-07-15, Adrian + Claude)

The full Spec 19 injection-site body map (IM + Sub-Q region maps, mirror-front,
Home glance card + sheet, recency shading, working-set flow removed) is **MERGED to
`main` → deployed to Vercel prod** as **PR #53** (squash `cabc184`). Two CodeRabbit
review rounds were folded in (round 1 on the feature, round 2 on the fixes below); its
findings addressed. **▶ Remaining: Adrian's on-device QA.**

- **Route locked (Adrian's call):** the log flow shows only the compound's own route
  (an IM compound logs IM sites, Sub-Q only Sub-Q — no cross-route logging); the
  IM/Sub-Q toggle in `LogDoseSheet` was removed and `buildLog` drops any off-route/stale
  `siteId` on submit.
- **"Last logged" grouped by muscle (Adrian's ask):** the card + sheet now list each
  muscle with the compound(s) put there ("Left Delt — Test E, Deca · today"), so two
  compounds in one area read together; the rest hint now counts the current day's other
  doses so a second dose to a same-day site reads "used today".
- **Recency decay verified end-to-end** (`tsx` over the real `siteHeat`/`siteDaysSince`):
  a logged muscle is full amber on day 0 and fades a step each day to empty at the window
  (IM 7d / Sub-Q 5d), then returns to the neutral body.
- **Card opacity floor removed** (matches the sheet); EmptyLogCard/AddCompoundSheet copy +
  BodyMap `<title>` fixes; `architecture.md` rewritten to as-built.
- **Orphaned `user_injection_sites` working-set table dropped** (`supabase/sites/010`,
  applied live — 85 dead rows, no code read it; dose history untouched).

- **Home consistency strip removed** (Adrian's call — "get rid of the consistency of
  the days on the home section"): deleted `components/home/ConsistencyStrip.tsx` and
  its render/props/computation in `HomeScreen`/`TodaysCycleCard`. Progress-tab
  consistency (`components/progress/ConsistencyGraph.tsx` / `ConsistencySection.tsx`)
  is untouched.
- **3-track adversarial code review** (rendering/mirror · integration/dead-code · SQL
  migrations). Verdict: the "tap-my-left → logs-left" mirror convention is correct
  across all 36 regions; the log-a-dose "pick any site" flow works end-to-end;
  migrations 002→009 are replay-safe. **One HIGH found + fixed:** the Home card + sheet
  recency shading was fed `siteLastUsedDays` (selected-day-relative, excludes the day),
  so a site injected *today* never lit amber — rewired to the purpose-built
  `siteDaysSince(logs, todayKey)` (`2baf547`). Remaining notes are LOW and deferred
  (dead rotation helpers in `stack.ts`; stale "working set" comments; a cross-route edit
  opens the map on the compound's route; SQL doc-comment staleness; orphaned
  `user_injection_sites` table from the dropped working-set feature).
- **Demo login removed:** the throwaway `demo@trackd.app` account (seeded in PROD auth
  for local testing) was deleted via MCP — cascades only its own data; no beta user
  touched.

## Spec 19 — Sub-Q body art + mirror-front convention — BUILT + migration 009 APPLIED LIVE (2026-07-15, Adrian + Claude)

Follows the IM work below. **Sub-Q is now integrated exactly like IM** (region map, not
dots) and the **front view was mirrored** so screen-left = the user's own left.

- **Sub-Q artwork:** `components/sites/bodyArtworkSubQ.ts` (generated from
  `Subq_front.svg` + `subq_back.svg`) — base + 14 region paths mapped to the Sub-Q
  sites (abdomen side/lower, outer thigh upper/lower front; love-handle, glute,
  back-of-arm back). Shares IM's transform (same canvas).
- **Region maps for BOTH routes:** new `components/sites/bodyArtwork.ts` route selector
  (`routeTransform/routeBasePaths/routeRegions`). `BodySilhouette` renders the base;
  `BodyMap` overlays interactive regions for IM **and** Sub-Q. The Sub-Q dot `Marker`
  and the placeholder silhouette are **removed**; `IM_MUSCLES_*`/`ImMuscle` renamed to
  `*_REGIONS_*`/`BodyRegion`. Card `SitePreview` renders regions for both routes too.
- **Mirror-front convention (Adrian's call, to fix "tap my left → logs right"):**
  image-left region → the `-l` site on BOTH views (no per-view flip). Migration
  **`009_mirror_front_and_subq_coords.sql`** swapped IM anterior L/R coords + set Sub-Q
  coords to region centroids (idempotent, APPLIED LIVE via MCP). Rendering is region-
  path driven now, so `injection_sites.x/y` is display metadata only.
- Verified by render (IM front mirrored, Sub-Q front/back regions land right) →
  `Context/Feature Specs/body-svg/_verify/`. `tsc` + `lint` clean; dashboard 200. NOT
  committed / pushed to Vercel (migration 009 is live in the DB per the standing pattern).

## Spec 19 — Body SVG integration (IM) + Front/Back pill toggle — BUILT + migration APPLIED LIVE (2026-07-15, Angus + Claude)

Angus's hand-authored anatomical body SVGs (`Context/Feature Specs/body-svg/im_front.svg`
+ `im_back.svg`, native `0 0 1491 2109` viewBox) now drive the **IM** injection-site
body map, replacing the hand-coded placeholder silhouette.

- **`components/sites/bodyArtworkIM.ts`** (new, generated) — the sanitised path data:
  stray Figma-frame `<rect>` dropped, baked `#2A2A28` fill stripped (fill is driven by
  the `--bg-input` token in the component), plus `IM_ART_TRANSFORM`
  (`translate(12.0465 -4.3425) scale(0.05074)`) mapping the native artwork onto the
  shared 0–100 marker grid. Front + back share ONE frame (both authored at the same
  scale — content bbox y0=125, h=1892 for each).
- **`BodySilhouette.tsx`** now takes an optional `route`: `im` → Angus's anatomy,
  anything else keeps the placeholder (Sub-Q until its art lands). `BodyMap` derives
  route from its (single-route) `sites`, so no consumer/public-API change for that.
- **Markers re-tuned to the new anatomy:** all 22 IM `x/y` remapped to the muscle-group
  centroids Angus labelled in the SVG (delt/pec/bicep/quad_front/quad_outer/ventroglute
  on front; trap/lat/tricep/glute/calf on back), computed by rendering each muscle path
  with `sharp` + trim. Delts nudged up/out onto the shoulder cap, lats out onto the
  lateral back. **Ventroglute moved to the anterior (front) view** where Angus drew it
  (was posterior; dose-log enum unaffected). Verified by PNG render of silhouette + all
  markers → `Context/Feature Specs/body-svg/_verify/`.
- **`supabase/sites/injection_sites.csv`** re-tuned; `002` seed regenerated; migrations
  **`007_retune_im_coords_body_svg.sql`** (centroid coords) + **`008_respace_crowded_im_markers.sql`**
  both APPLIED LIVE via Supabase MCP. Sub-Q rows untouched.
- **Tap-target fix (008):** an adversarial multi-agent review of a standalone sample
  caught that 007's centroids put Outer-Quad/Front-Quad (~4.3 apart) and Tricep/Lat
  (~6.4) inside each other's r=7 hit disc — the later-painted marker stole the tap, so
  Outer-Quad was unreachable. This also affected the real app (`Marker` uses the same
  r=7 hit circle). 008 nudges those 8 markers apart (still on-muscle) to the catalogue's
  usual ≥~8-unit spacing. Verified by render.
- **Shareable sample:** a self-contained claude.ai Artifact reproduces the IM map
  (Front/Back pill toggle + tappable markers) from the exact same path data + coords +
  inlined Geist/Playfair fonts, for eyeballing the look/toggle on a link.
- **Front/Back pill toggle (new UX):** `BodyMap` now shows ONE view at a time with a
  Front/Back segmented control (same style as the SitesScreen toggles) and a sliding
  `translateX` transition — both panels stay mounted, only the visible one is
  interactive / in the a11y tree, `motion-reduce` guarded. Replaces the side-by-side
  layout across all three modes (setup / log / rotation). SitesScreen setup copy updated.
- **Scope:** IM only. Sub-Q silhouette stays the placeholder pending its artwork.
  `tsc` + `lint` + `build` clean. NOT committed/deployed to Vercel (migration 007 is live
  in the DB per the standing Spec 19 pattern; the git push is Angus's call).

## Splash double "come-up" fixed — removed the in-app overlay (2026-07-15, Adrian + Claude)

Adrian reported Kyle "came up" twice on an installed-PWA launch: the native iOS
launch image (Kyle) → the app briefly paints → then a full-screen React overlay
covered it with Kyle **again** before fading. Two separate splash mechanisms were
both showing Kyle. Fix: **deleted the in-app overlay** so the native launch image is
the single come-up.

- Removed `app/_components/splash-screen.tsx` (deleted) and its mount/import in
  `app/layout.tsx`. The `apple-touch-startup-image` PNGs (`AppleSplashLinks`) are now
  the only splash — iOS holds Kyle from cold launch until the app paints, then hands
  off to the near-black (#111110) canvas. `tsc` clean.
- Left untouched: the launch-image PNGs, and the SW poster precache
  (`SPLASH_ASSETS`/`trackd-kyle-vial-splash-poster.jpg` in `public/sw.js`) — now
  orphaned/harmless (the poster is no longer rendered by any UI). Can be pruned later
  if we want to trim the SW to Web Push only. NOT committed/deployed.

## Spec 19 — Catalogue expanded to 36 sites (Traps + Ventroglute) — APPLIED LIVE (2026-07-15, Angus + Claude)

Angus's call after reviewing the list: **add Traps** (a common IM spot-injection site
that was missing) and **restore Ventroglute** (the medically-safest IM site, dropped
in Step 1). Now **36 sites (22 IM + 14 SubQ)**. `tsc` + lint clean.

- `injection_sites.csv` + regenerated `002` seed; migration
  `supabase/sites/005_add_traps_ventroglute.sql` (applied live, idempotent) inserts
  `im-vglute-r/l` (posterior, upper-outer hip, x 64/36 y 51) + `im-trap-r/l`
  (posterior, upper back, x 57/43 y 19).
- `006_rebackfill_working_set.sql` (applied live) re-ran the Step-3 backfill; now that
  ventroglute is back in the catalogue it matched the 4 users who had it configured →
  **8 ventroglute memberships** seeded. Traps → enum `other` on dose_logs (like the
  other spot sites); ventroglute maps to the existing `ventroglute_*` enum.
- `lib/home/siteCatalog.ts` gained the Trap labels so the log-sheet "Logging to …"
  confirmation resolves them (Ventroglute was already there).
- The phone **preview artifact** was updated to the 36 sites + a third **Rotation**
  mode (amber recency ramp), re-published to the same URL.

## Spec 19 — Injection Site Rework, Step 4 (rotation view) — BUILT + verified; FEATURE COMPLETE (all 4 steps) (2026-07-15, Angus + Claude)

The last step: a view of the working set on the body map, amber-shaded by recency,
so the user can see what's fresh and rotate off it themselves. **It reports, it does
not recommend** — no next-site, ranking, risk score, or warning. `tsc` + `eslint` +
`next build` all clean; the recency heat-ramp PNG-verified. NOT committed/deployed.

- **Two-mode screen, no new nav tab.** `/settings/sites` now renders
  `components/sites/SitesScreen.tsx` with a top **Set up / Rotation** toggle over the
  SAME shared `BodyMap` + route toggle (replaced the single-purpose
  `SiteSetupScreen.tsx`, deleted). Set up = the Step 2 picker; Rotation = the new
  recency view.
- **Recency, derived + never stored** (`lib/home/siteRecency.ts`, pure helpers):
  `siteDaysSince(logs, todayKey)` (most-recent use INCLUDING today = 0),
  `siteHeat(daysSince, route)` = `clamp(1 − d/W, 0, 1)`, and the decay windows
  **`IM_DECAY_DAYS = 7` / `SUBQ_DECAY_DAYS = 5`** (the ONE place; tuned on feel).
  The `BodyMap` `recency` mode shades amber by heat (opacity on `--accent-amber`),
  full on the day of injection → one shade lighter per day → **unfilled** at the
  window's end; every site shows its factual day-count ("today"/"2d"), a
  never-used/rested site reads as **unfilled + its count** (never "safe"/"ready").
- **Source = the device dose log's granular `siteId`** (not the coarse
  `dose_logs.injection_site` enum, which collapses bicep/tricep/lat/pec/calf/thigh/
  arm to `other`) — the same source Step 3's day-counts use, so the numbers match.
  `SitesScreen` reads it via `useSyncExternalStore` (device-local; graceful empty
  state before hydration). Nothing recency/freshness is stored (Invariant 1).
- **The sanctioned amber exception is documented** in `ui-context.md` (a new
  "Injection-site recency ramp" subsection): it's behavioural recency, not a health
  reading; the day-count text keeps it factual; the ramp is opacity on
  `--accent-amber` (no discrete ramp token, no hardcoded hex).
- **Checklist:** amber shading by days-since across 7d/5d ✓; every site shows a
  day-count ✓; route toggle + front/back both visible ✓; no warning language/icon/
  risk score/ranking/suggested-next-site ✓; no recency value stored ✓; tokens only,
  no hex ✓; no new nav tab / TS / lint errors ✓.
- **Heads-up (memory):** Angus is making an anatomical **body SVG** to drop into
  `BodySilhouette.tsx` — the placeholder is intentionally not over-polished; the
  shared `BodyMap` + 0–100 coordinate grid stay unchanged when it lands.
- **Docs:** `ui-context.md` (amber ramp), `architecture.md` (Step 4 built + Spec 19
  complete).

## Spec 19 — Injection Site Rework, Step 3 (log-flow cutover + removal of per-compound sites) — BUILT + migration APPLIED LIVE + verified (2026-07-11, Angus + Claude)

The dose-log flow now picks the injection site on the shared body map (drawn from
the user's working set), and **per-compound injection-site configuration is removed
across the whole app**. `tsc` + `eslint` + `next build` all clean; the body-map
pick surface PNG-verified; the backfill migration applied live + idempotency
confirmed. NOT committed/deployed. **On-device QA of the live log flow is the
founder's final check** (can't drive the authed client + localStorage here).

- **Part A — backfill migration** (`supabase/sites/004_backfill_working_set.sql`,
  applied live): seeded each user's `user_injection_sites` from the union of every
  site configured across their compounds (`protocol_compounds.rotation_sites`),
  filtered to catalogue matches. **66 rows across 16 users; re-run adds 0**
  (idempotent). The ONLY unmatched values were the retired `im-vglute-l/-r` (4
  users) — reported, not guessed; those users add other sites in the setup menu.
- **Part B — log-flow cutover** (`LogDoseSheet.tsx`): the "Injection site" section
  is the shared `BodyMap` in `pick` mode. It **lazy-loads** the catalogue + working
  set inside the sheet (same idiom as the vial list) so the change barely rippled
  through the hosts. Route toggle defaults to the compound's route (IM/Sub-Q,
  switchable); each shown site carries its factual day-count ("2d") from the
  existing device-derived `siteLastUsedDays`; one tap sets the site. **Oral → no
  map. Empty working set → the full catalogue for that route + a "Set up your sites"
  nudge, and the dose still logs** (never a gate). The chosen `siteId` rides the
  UNCHANGED device→Postgres path (`pushProtocolDoseLog` → `localSiteToInjectionSite`
  → `dose_logs.injection_site`), so persistence/read-back is preserved.
- **Part C — surgical removal** (Angus's call: remove BOTH the Today's-Log inline
  next-site and the same-site clash warning). Dropped: the add-compound rotation
  picker (`RotationPicker.tsx` **deleted**) + its "select a site" validation; the
  compound detail sheet's rotation list; the Today's-Log `nextSiteLabel` + clash
  notice (`TodaysCycleCard` `DueDose`/`hasClash` slimmed); the quick-track row's
  site; the Protocol **Plan** row's next-site; and the `advanceRotation` calls in
  both log hosts. New/edited compounds store `rotationSites: []`. `StackCompound`'s
  rotation fields + the `nextSiteId`/`advanceRotation`/`resolvedDaySite`/
  `hasRotation` helpers are left **vestigial** (uncalled) to avoid a stack.ts
  refactor + a destructive migration — the legacy `rotation_sites` data is inert,
  displayed nowhere, and cleared on a compound's next save. Copy updated
  (`EmptyLogCard`, sheet descriptions).
- **Files touched:** `LogDoseSheet`, `HomeScreen`, `QuickTrackSheet`,
  `TodaysCycleCard`, `AddCompoundSheet`, `CompoundDetailSheet`, `PlanView`,
  `EmptyLogCard` (+ `RotationPicker.tsx` deleted); `supabase/sites/004`.
- **Checklist:** no compound asks for/shows a site anywhere ✓; injectable log shows
  the working-set map opened on the compound's route ✓; oral shows none ✓; empty
  set → full catalogue + nudge, still logs ✓; site persists to `dose_logs` + reads
  back (unchanged path) ✓; existing sites migrated, re-run no dup ✓; no logged
  history/catalogue lost ✓; no draw amount / stored derived value ✓; no new TS/lint
  errors ✓.
- **Known limitation flagged for Step 4:** the coarse `dose_logs.injection_site`
  enum collapses many sites to `other`; granular recency will come from the device
  `siteId`, not the enum.
- **Docs:** `architecture.md` Injection Sites section updated (Step 3 built + the
  Step-4 recency-source note).

## Spec 19 — Injection Site Rework, Step 2 (site setup menu + shared body map) — BUILT + verified (2026-07-11, Angus + Claude)

The standalone setup screen where a user builds their working set on a body map,
per route. **No log flow / per-compound config touched** (that's Step 3). `tsc` +
`eslint` + `next build` all clean. NOT committed/deployed.

- **Shared body-map component (built once, reused by Steps 3–4).**
  `components/sites/BodyMap.tsx` — presentational + interactive, a `mode` prop
  (`select` / `pick` / `recency`); renders **front AND back silhouettes together**
  and plots each catalogue site at its (x, y). The parent supplies active ids /
  sub-labels / heat; the map computes no business logic. Marker states: `select` →
  amber-filled (in set) vs hollow outline; `pick` → filled + white ring + a
  day-count sub-label; `recency` → amber opacity = `heat` (0–1) + sub-label. Full
  keyboard support (each marker a button, Enter/Space, focus ring, generous touch
  target).
- **The silhouette** (`components/sites/BodySilhouette.tsx`) — a hand-authored
  anatomical SVG: filled masses (head, deltoid caps, tapered torso, wide hips,
  tapered thighs, calves, feet) + round-capped arm strokes, all ONE flat token
  fill (`--bg-input`) so they union seamlessly, plus muscle-group **contour lines**
  (`--border-strong`) that swap per aspect (front: linea alba, pec fold, ab lines,
  quad sweeps; back: spine, lats, glute crease, hamstrings, calves). Drawn to the
  0–100 catalogue grid so markers sit on the anatomy. **Visually verified** by
  rendering the exact geometry + all 32 markers to a PNG (via `sharp`): reads as a
  clean anatomy chart (not a stick figure), every marker on its correct region.
  Token-only (no hex).
- **Setup screen** (`components/sites/SiteSetupScreen.tsx`, `"use client"`): route
  segmented control (Intramuscular / Subcutaneous, the house idiom), the map, a
  live "N sites selected" count + last-action notice. Optimistic toggle → persists
  via `setWorkingSetSite` (RLS-scoped server action), reverts on failure. Copy notes
  deselecting never changes logged doses. Reached from a new **Settings row**
  (`app/(app)/settings/page.tsx`, Syringe icon → `/settings/sites`); page is
  `force-dynamic` (per-user authed data — avoids a false static-prerender log).
- **Live round-trip verified** (rolled-back txn, real `authenticated` role): add
  two sites + re-add one → dedupes to the set (idempotent, no duplicate); remove
  one → gone; the join read derives route from the catalogue. Plus the Step-1 RLS
  isolation still holds.
- **Checklist:** front+back shown together ✓; working set persists + reloads per
  route ✓; deselect leaves dose logs untouched ✓; body map is a reusable
  mode-prop component, not a one-off ✓; tokens/presets, no hex, no new nav tab ✓;
  log flow + per-compound config unchanged ✓; no new TS/lint errors ✓.
- **Follow-up:** on-device eyeball of the silhouette/marker feel is Angus's to
  confirm; coordinates stay tunable (edit `injection_sites.csv` → re-seed).
- **Docs:** `architecture.md` Injection Sites section updated (Step 2 built).

## Spec 19 — Injection Site Rework, Step 1 (site catalogue + working set) — BUILT + migrations APPLIED LIVE + verified (2026-07-11, Angus + Claude)

Data foundation for the injection-site rework: the app's site list is promoted from
free-standing TS to a read-only, coordinate-bearing **catalogue table**, plus a
per-user **working-set** table and its data-access layer. **No screens changed**
(spec Step 1 scope). `tsc` + `eslint` + `next build` all clean. Migrations recorded
in `supabase/sites/`. NOT committed/deployed yet.

- **Preflight (bound to the live schema, per spec).** Confirmed the site "list" is
  the 34-entry TS catalogue in `lib/home/siteCatalog.ts` (feeds the per-compound
  rotation picker + `protocol_compounds.rotation_sites text[]`), distinct from the
  coarser 13-value `dose_logs.injection_site` **enum** (the untouched tracking
  layer; 34→13 map already in `lib/db/types.ts`). **Compound route already
  resolves** — `compounds.default_route` is populated for all 205 compounds +
  `protocol_compounds.route` per row, so no new route column was needed (oral =
  no map). All live `rotation_sites` values fall within the catalogue (no stale
  ids); all logged enum values map cleanly.
- **Angus's calls on the ambiguities I surfaced (didn't guess, per spec):**
  (1) glute kept as TWO rows — `im-glute-*` + `sq-glute-*`, one per route (nothing
  renamed/merged); (2) **ventrogluteal removed** from the new catalogue ("we already
  have glutes") — the one deliberate deviation from "nothing dropped", historical
  data untouched so nothing is lost; (3) love-handle → back (posterior), delt →
  front (anterior). Net **32 sites** (18 IM + 14 SubQ; 18 anterior + 14 posterior).
- **Catalogue** (`injection_sites`, `supabase/sites/001` + seeded by `002`): `id`
  (stable code, e.g. `im-glute-r`), `label`, `route` (`admin_route`, CHECK im/subq),
  `side`, `aspect`, `x`/`y` (0–100 normalized per silhouette, centreline x=50,
  viewer-facing — Step 2's SVG is drawn to this grid), `sort_order`. Read-only under
  RLS (authenticated SELECT via `USING(true)`, no write policy, explicit grant) —
  same posture as compounds/biomarkers/markers. Seeded from `injection_sites.csv`
  via new `build-sites-seed.mjs` (same CSV → idempotent `ON CONFLICT (id)` pipeline).
- **Working set** (`user_injection_sites`, `supabase/sites/003`): row-per-membership
  join (`user_id` → `site_id`), UNIQUE `(user_id, site_id)`, RLS
  `(SELECT auth.uid()) = user_id` + explicit `authenticated` DML grant + index.
  Route is DERIVED from the catalogue join, never stored (a site id is 1:1 with a
  route). Data access: new `lib/db/injectionSites.ts` (`"use server"`, RLS-scoped,
  session identity; catalogue read + working-set read/add/remove/toggle). Types in
  `lib/db/types.ts`.
- **Live verification (rolled-back transactions, real `authenticated` role + JWT
  claims, zero prod residue):** catalogue = 32 rows, 0 ventroglute, x∈26–74 /
  y∈21–86 (in range). RLS isolation — account A added a site (sees 1); **account B
  saw 0 total and 0 of A's** (cannot read A's set). Write defenses — a user INSERT
  into `injection_sites` is **denied** (read-only), and B inserting a row owned by A
  is **denied** by WITH CHECK.
- **Untouched (spec Step 1 scope):** `dose_logs.injection_site`, the per-compound
  site config + `siteCatalog.ts` picker, and every screen/component/route/nav entry.
- **Docs:** `architecture.md` gained a **Injection Sites (Spec 19)** section +
  System-Boundaries `supabase/sites/` entry + the read-only-catalogue / working-set
  access notes.

## Enable-notifications prompt — persistent banner, top of Home (2026-07-11, Adrian + Claude)

Reworked the dashboard push prime from a **one-time, skippable card at the bottom**
into a **slim, persistent banner above Today's Log**. Notifications are core to the
app (dose reminders), so the prompt now stays until the user actually turns them on.

- `components/push/EnableNotificationsStep.tsx` — dropped the "Not now" button + the
  `trackd:push-onboard-dismissed` localStorage dismissal; now a compact single-row
  banner (badge + "Enable notifications" + a compact "Enable" action, `p-4` — smaller
  than the `p-5` glance cards). Still gated on `status === "off"` (only when push CAN
  be enabled), so it self-hides when already on / denied / iOS-not-installed / probing.
- `components/home/HomeScreen.tsx` — new optional `notificationsBanner?: ReactNode`
  prop, rendered directly above Today's Log. The banner brings its own
  `animate-home-up` wrapper and returns null when inactive, so `space-y-5` never opens
  a gap.
- `app/(app)/dashboard/page.tsx` — passes the banner via the prop (server reads
  `profiles.notifications_enabled`); removed the old bottom render block.
- Docs: `architecture.md` Client-layer paragraph updated (Invariant 9). `tsc` + `lint`
  clean.

## Spec 17 — supabase-advisor-hardening — migration APPLIED LIVE + verified (2026-07-03, Adrian + Claude)

Cleared the schema-level Supabase Advisor warnings via ONE tracked migration, with
no integrity trigger or signup flow broken. DB-only (no app code, no build).

- **Part A — pinned `search_path = ''` on the 5 mutable-search_path functions**
  (`set_updated_at`, `unit_family_compatible`, `check_inventory_unit_family`,
  `check_protocol_unit_family`, `check_dose_log_unit_family`). §0 read every body:
  each is already safe under an empty path (only pg_catalog builtins, or FULLY
  `public.`-qualified objects), so **`= ''` is the gold standard for all five — no
  body rewrite, no `pg_catalog, public` fallback**. The linter's "empty-path breaks
  an unqualified ref" trap did not apply.
- **Part B — revoked direct EXECUTE on the 2 SECURITY DEFINER signup functions**
  (`handle_new_user`, `handle_new_profile_prefs`) from public/anon/authenticated.
  Their `search_path` was ALREADY `''` (so Part A didn't touch them). Triggers invoke
  them as the definer, so signup is unaffected.
- **Part C — pg_net: NO ACTION (it's IN USE).** Installed (v0.20.3, `public` schema)
  and called by the live `reminder-runner` pg_cron job (`net.http_post` →
  `/api/notifications/run`). Moving it to an `extensions` schema is deferred to when
  Edge Functions land (noted in `next-tasks.md`).
- **Sweep confirmed** these 7 are the ONLY public functions — no other
  mutable-search_path or SECURITY DEFINER function lurks, so one migration clears the
  whole schema-level set.
- **Live verification (all rolled back):** (A/B/C) an incompatible inventory insert,
  dose log, and protocol dose-unit change each still RAISE `23514` from the correct
  `check_*` function — the unit-family triggers still fire under `search_path=''`;
  (D) a compatible inventory insert still succeeds; (E) a direct
  `SELECT handle_new_user()` as `authenticated` is denied (`42501`); (F) inserting an
  `auth.users` row still creates BOTH the profile and the notification_preferences row
  (signup chain intact). Introspection confirms all 7 functions now have a pinned
  `search_path` and the 2 signup functions retain only `postgres` EXECUTE.
- **Migration:** `supabase/hardening/001_advisor_search_path_and_execute.sql`.
  **Out of scope (per spec, handled elsewhere):** leaked-password protection (Auth
  dashboard toggle — Angus) and the waitlist "RLS Policy Always True" (spec 08).
- **Docs:** `architecture.md` Invariant 2 updated (all functions pin `search_path`).

## Spec 16 — tier-column-lock — migration APPLIED LIVE + verified (2026-07-03, Adrian + Claude)

`profiles.tier` can now only be written by the service role (the Stripe webhook). A
normal authenticated user can no longer set their own `tier = 'paid'` via the Data
API, while keeping the ability to edit their other profile fields. This closes the
hole BEFORE the tier default is ever flipped to `'free'` and gating (Spec 04) ships.
DB-only change (grant migration + docs) — no app code, so no build needed.

- **The hole (verified live).** `authenticated` held a **table-level** UPDATE grant
  on `profiles` (`api_role_grants` line 67) and the owner UPDATE policy is whole-row
  (`WITH CHECK (auth.uid() = id)`), so any user could `PATCH /profiles?id=eq.<self>`
  with `{ "tier": "paid" }`. Harmless today (default already `'paid'`), catastrophic
  once the default flips to `'free'`.
- **Approach A — column-level privilege (the spec's preferred; no finding ruled it
  out).** Migration `supabase/grants/003_profiles_tier_lock.sql` (applied live):
  `REVOKE UPDATE, INSERT ON profiles FROM authenticated`, then re-`GRANT` UPDATE +
  INSERT on **every column except `tier`** (22 of 23). Chosen over a trigger
  (Approach B) because it's declarative and **nothing in the app writes `tier` as
  `authenticated`** (every `profiles` `.update()` is avatar / tos-gate / prefs /
  migration-flag / settings·sex·goal·units·height; there's no client-side profiles
  INSERT — all verified), so the lock breaks no legitimate path. Also locked INSERT
  (not just UPDATE) as defense-in-depth so `tier` can't ride in on an upsert either.
- **`tier` is the only service-only column on `profiles`.** Billing state lives in
  the separate `subscriptions` table (`billing_001`, on the `stripe` branch); no
  Stripe columns on `profiles`. So `tier` is the sole exclusion.
- **Webhook path unaffected.** The `stripe` branch's `lib/stripe/sync.ts` writes
  `.update({ tier: tierForStatus(status) })` via `createServiceRoleClient()`.
  `service_role` keeps `GRANT ALL` + BYPASSRLS (`grants/002`), and `handle_new_user`
  (SECURITY DEFINER) still sets the default — both bypass the `authenticated` column
  grants.
- **Live verification (all rolled back, zero prod change):** (1) authenticated
  `UPDATE … SET tier='paid'` on own row → **rejected 42501**; (2) authenticated
  `UPDATE … SET timezone=…` on own row → **succeeds**; (3) `service_role`
  `UPDATE … SET tier` → **succeeds**; (4) authenticated upsert
  `ON CONFLICT DO UPDATE SET tier` → **rejected 42501**. Completeness check confirmed
  exactly the 22 non-tier columns are updatable/insertable and `tier` is neither.
- **Docs:** Approach A + the **"new `profiles` columns must join the grant lists"**
  maintenance note recorded in `code-standards.md`; `architecture.md` Auth/Access
  Model updated.

## Spec 15 — cycle-id-stamping (the moat) — BUILT + migration APPLIED LIVE + verified (2026-07-03, Adrian + Claude)

Every per-cycle user entry is now stamped with the user's current cycle at INSERT
time, so any cycle can later return its full cross-type history (principle #6).
Before this, only `dose_logs`/`inventory_items` were cycle-tied; journal, bloodwork,
markers and weight wrote with `cycle_id = NULL` — silent, unbackfillable moat loss.
`tsc`+`eslint` clean; migration `cycle_id_stamping` applied live + verified; a
rolled-back live insert test proved all resolution paths. **MERGED as PR #50 (squash)
+ deployed to prod (2026-07-03); Vercel + CodeRabbit green; Adrian on-device tested
"everything worked."** (Specs 15–17 + the CodeRabbit atomic-`log_weight`-RPC fix all
shipped together in #50.)

- **§0 finding that reshaped the spec — the "current cycle context" premise was
  STALE.** The spec assumed the single-active-cycle index was "commented out for
  beta, so multiple cycles can be active" and warned *"do not assume the one active
  cycle."* But the Protocol Cutover (Spec 11, `supabase/protocol/003`) already
  applied `one_active_cycle_per_user` — a live `UNIQUE (user_id) WHERE is_active`
  index. Verified: all 8 live users have exactly ONE active cycle. So the current
  cycle context is now a DB-enforced fact: the user's single `is_active = true`
  cycle, already exposed as `getActiveCycle()` in `lib/db/cycles.ts`. No new
  selector mechanism was needed.
- **Migration** `supabase/cycles/001_cycle_id_stamping.sql` (applied live):
  `journal_entries` + `lab_panels` already had nullable `cycle_id` + FK→cycles
  (SET NULL) — only the cycle-scoped INDEX was missing (added, partial). Added
  nullable `cycle_id` + FK (SET NULL) + partial index to `weight_logs` +
  `body_metrics`. Deleting a cycle detaches the stamp (SET NULL), never destroys
  history (Invariant 8). Grants are table-level so the new column needs none; owner
  RLS is column-agnostic. `body_metrics` is dormant (superseded by `weight_logs`,
  zero app write paths) but stamped per spec for shape consistency.
- **`marker_readings` / `biomarker_results` — transitive, no own column.**
  `marker_readings.entry_id` and `biomarker_results.panel_id` are both NOT NULL, so
  each inherits the cycle via its parent (`entry_id → journal_entries.cycle_id`,
  `panel_id → lab_panels.cycle_id`). Confirmed live.
- **Code — stamp at insert time via `getActiveCycle()`** (`cycle?.id ?? null`):
  `app/(app)/progress/actions.ts` (the `lab_panels` insert in `addBloodworkPhoto` +
  the `journal_entries` INSERT branch in `saveJournalEntry`) and
  `app/(app)/weight/actions.ts` (`logWeight`). The stamp is **stable** — journal
  stamps only on the INSERT that creates the day's row, and the weight write goes
  through an **atomic `log_weight` RPC** (`supabase/weight/002_log_weight_rpc.sql`,
  SECURITY INVOKER, `search_path=''`) that stamps the active cycle only on the day's
  first insert and, on re-log, updates the weight while leaving `cycle_id` untouched
  (`INSERT … ON CONFLICT DO UPDATE SET weight` — no read-modify-write race). Two
  layers of review shaped this: a 9-agent adversarial workflow caught that the first
  cut re-stamped on every re-log (which could overwrite/null a past day's attribution
  after a cycle change); the fix landed as a read-then-write preserve, then CodeRabbit
  (PR #50) flagged that read-then-write still isn't atomic under a concurrent new-day
  double-submit, so it became the single-statement RPC above.
- **Optional backfill** `supabase/cycles/002_cycle_id_backfill.optional.sql` —
  written, fully commented-out, NOT run. Assigns a cycle only where exactly one
  cycle's date range contains the row's date; leaves NULL on zero/multiple matches.
  Adrian decides whether to run it (low value — few beta rows).
- **Live verification (rolled back, zero prod pollution):** a single
  `BEGIN…ROLLBACK` inserted a stamped journal/panel/weight + a transitive
  marker_reading + biomarker_result for `admin@trackdco.app`, then one query
  returned the cycle for all six paths (direct + transitive → the active cycle;
  off-cycle weight → NULL). Confirmed nothing persisted.
- **Docs:** `architecture.md` Storage Model gained a "Cycle-ID stamping" entry.

## Email auth delivery wired (Resend) + onboarding fixes (2026-07-02, Angus + Claude)

Followed up the email/password work: got confirmation emails actually delivering,
and fixed two onboarding barriers found while testing on device.

- **Email delivery live via Resend SMTP.** Founder created a Resend account,
  verified a dedicated sending subdomain `send.trackdco.app` (DKIM TXT + SPF MX/TXT
  + DMARC added at Porkbun, kept separate from the root Google Workspace MX), and
  wired Resend's SMTP creds into Supabase (Authentication → Emails → SMTP). The
  *Confirm signup* + *Reset password* templates were switched to the token-hash form
  (`{{ .SiteURL }}/auth/confirm?token_hash=…`), so `/auth/confirm` verifies
  statelessly and links work across browsers/devices. Verified end-to-end: a fresh
  `+alias` signup delivered the email and the link confirmed + logged in cleanly —
  fixing the earlier post-click `exchangeCodeForSession` error that hit anyone
  opening the link outside the browser they signed up in (root cause: the default
  PKCE `code` template needs the signup browser's verifier cookie).
- **"Already registered" no longer mis-shows "check your inbox."** `signUp()` now
  detects Supabase's empty-`identities` obfuscation and nudges the user to sign in /
  use Google. This was the root cause of the founder's own test "not sending an
  email": `barbrake24@gmail.com` is a Google-only account (no password), so email
  sign-up silently no-ops.
- **Non-Safari iOS users are guided to Safari to install.** The install prompt keyed
  off `isIOS`, so Chrome / in-app browsers on iPhone got Safari Share-sheet steps
  they can't complete (only Safari installs a PWA on iOS). Added `isIOSSafari`
  detection (real Safari keeps the `Version/` UA token) + a new `OpenInSafariPrompt`
  (steps + copy-link), wired into both the post-sign-in popup and the Profile install
  row. Closes the gap where a confirmation email opens in Chrome → user can't add to
  Home Screen. Safari + Android paths unchanged.
- Shipped on branch `fix/email-auth-onboarding` (PR open, awaiting CodeRabbit +
  merge). `tsc` + `lint` + `next build` clean; UA detection unit-verified against
  real Safari/Chrome/Firefox/Edge/WKWebView/iPad strings.

## Auth — email + password sign-in/sign-up added alongside Google (2026-07-02, Adrian + Claude)

Sign-in was Google-only; added **email + password** as a second Supabase Auth
method (Adrian's ask), on its own `email-auth` branch, merged to `main`.
`tsc` + `lint` + `next build` clean.

- **No new service, no schema change.** Supabase Auth already does email/password;
  it owns the `auth.users` row and bcrypt-hashes the password. The existing
  `handle_new_user` trigger (`AFTER INSERT ON auth.users`, `ON CONFLICT (id) DO
  NOTHING`) creates the `profiles` row for every new user regardless of method, so
  RLS, the 18+/ToS gate, and every downstream feature are auth-method-agnostic.
- **Email confirmation is ON** (Adrian's call). `app/auth/confirm/route.ts` handles
  the confirmation + recovery links and accepts BOTH shapes — the recommended
  token-hash form (`verifyOtp`, cross-device) and the default `code` form
  (`exchangeCodeForSession`) — so it works whether or not the email templates have
  been switched. It's the OTP sibling of the OAuth `app/auth/callback`; both
  validate `?next=` to internal single-slash paths.
- **New files:** `app/login/actions.ts` (one `authenticate` server action branching
  on an `intent` field → `signInWithPassword` / `signUp`),
  `components/auth/email-password-form.tsx` (sign-in/create-account toggle under the
  Google button, "or" divider on the login page), `app/auth/confirm/route.ts`,
  `app/forgot-password/*` (`resetPasswordForEmail`), `app/reset-password/*`
  (`updateUser({ password })`, guarded — expired link → request-a-new-one). Styled
  with ui-context tokens verbatim (h-12/rounded-xl inputs, `bg-accent-primary`
  primary button, amber "check your inbox" cards).
- **Security posture:** all email auth goes through server actions (RLS the
  backstop); sign-in and reset copy is generic so it never reveals whether an email
  exists; sign-up shows "check your inbox" even for an already-registered address.
  Email sign-in/confirm sets the same `trackd-install-hint` cookie as OAuth so the
  Add-to-Home-Screen popup behaves identically.
- **Live once email delivery is wired (founder dashboard step, see `next-tasks.md`):**
  set up **custom SMTP via Resend** (built-in sender is throttled/non-prod), switch
  the *Confirm signup* + *Reset password* templates to the token-hash form, add the
  redirect-URL allow-list entries, and turn on leaked-password protection + min
  length. Until SMTP is set, email/password *sign-in* works but new-signup
  confirmation + reset emails won't send. (Fastest alternative if email isn't ready:
  toggle "Confirm email" OFF in the dashboard — signups then log in instantly, no
  email needed; reset still needs SMTP.)

## Cloud-write error logging + cron/doc verification (2026-06-26)

Beta-readiness session (last of the trip). **Decided AGAINST adding Sentry** — it
would breach the published Privacy Policy (which states no error-monitoring
services + only Supabase/Vercel as sub-processors; the seed notes even say add
Sentry "after beta … don't switch them on silently"). Error visibility for the
beta rides **Vercel + Supabase logs** instead (Sentry deferred to post-beta with a
v1.4 sub-processor/consent bump). To make those logs actually catch write failures,
the **13 best-effort Supabase writes that returned `{ ok: !error }` silently** now
`console.error("…: cloud write failed", error)` on the `error` field (the
thrown-exception catches already logged, so this closes the gap — a systematic
mirror-write failure is now visible in Vercel logs instead of invisible). Files:
`lib/home/syncActions.ts` (7), `lib/db/{inventory,protocolCompounds,doseLogs,
migrationFlag}.ts`, `lib/notifications/prefsActions.ts`. `tsc`+`lint` clean.
Also **verified live + corrected stale docs**: the `reminder-runner` cron is
already `*/15` (not every-minute), per-user timezone IS captured on opt-in, and the
scheduler rollout is open to all opted-in users (`FOUNDERS_ONLY = false`).

## Archive reactivation (re-tune on resume) + weight default (2026-06-26)

Two Home-stack UX refinements (device-local model, Postgres mirror via
`pushProtocolCompound`):
- **Reactivating an archived compound opens the pre-filled config sheet
  (`AddCompoundSheet`) in a "reactivate" mode** so the dose, schedule and
  injection-site rotation can be re-tuned before it resumes. It re-anchors the start
  to TODAY by default — the days it sat archived aren't back-filled as missed, and
  past logged doses are kept — and saving clears the `archived` flag → active
  (Postgres `is_active=true` + `first_dose_on` in one upsert). The mode is detected
  from `editCompound.archived`, so every reactivation entry point just opens the
  sheet: the Add-to-Stack **search** (archived rows render dimmed + an amber ↺), the
  **Archive Manager** (Profile), and the shared **CompoundDetailSheet** (Home/Plan,
  via `onEdit`).
- **Archived compounds in the Add-to-Stack search** render dimmed ("dark opacity")
  with the ↺ reactivate control instead of the blocked "already in your log" check.
- **Weight view defaults to the raw SCALE reading, not the trend** (`WeightView`
  initial mode `"scale"`); the smoothed trend is opt-in, never auto-selected.
- Dev-only `/preview/archive-weight` exercises both (seeds an archived compound).
- `tsc --noEmit` + `eslint` clean.

## Current Phase

- **Auth + app shell LIVE on https://trackdco.app — verified in production
  (2026-06-08).** The full signup flow is deployed and working end-to-end:
  Continue-with-Google → `/auth/callback` code exchange → 18+/ToS gate at
  `/welcome` (DOB via Day/Month/Year dropdowns; server-side age check;
  all-three-docs consent) → guarded `(app)` shell + empty `/dashboard`, with
  sign-out and the root redirect. Proven with a real Google account
  (`admin@trackdco.app`): sign-in fired the `handle_new_user()` trigger, the gate
  wrote `date_of_birth`/`is_18_plus`/`tos_accepted_at`/`tos_version=0.2`, and
  sign-out + returning-user (skips the gate) both work. Prod checks pass: legal
  docs render from the DB, the PWA manifest serves, route guards redirect. The
  Data API works via the `api_role_grants` migration. **Remaining to fully close
  the 11 Jun checkpoint:** only publishing the Google OAuth app (currently in
  "Testing", so only listed Test users can sign in). The on-phone test (+ Add-to-
  Home-Screen install) and the two-account RLS isolation check are both **confirmed
  by both founders (2026-06-10)** — the PWA installs with the Trackd icon and opens
  full-screen, and each account saw only its own data. Backend, data model, seed
  catalogues, domain, and the public landing remain live.

## Completed

- **Amounts on vials of CUSTOM compounds + Protocol "more" menu (2026-06-24,
  Adrian + Claude) — `tsc`+`lint` clean; `custom_protocol_compounds` migration
  APPLIED LIVE + verified; NOT committed/deployed; ▶ on-device QA pending.** Two
  Adrian asks in one pass.
  - **Custom-compound amounts — pulled INTO beta scope (was v1.5), recommended
    approach.** Custom "Make your own" compounds couldn't hold vials/stock because the
    whole inventory chain (`protocol_compounds → inventory_items → v_inventory_math`)
    was anchored to the read-only `compounds` catalogue (`protocol_compounds.compound_id
    NOT NULL REFERENCES compounds`). Fix: migration
    `supabase/protocol/004_custom_protocol_compounds.sql` (applied live) makes
    `compound_id` nullable + adds `custom_name`/`custom_category` (identity CHECK:
    catalogue id XOR custom name; `(cycle_id, custom_name)` partial unique index). Now a
    custom gets a `protocol_compounds` row (compound_id NULL) so it rides the UNCHANGED
    `inventory_items`/`v_inventory_math` chain — stock, runway, part-used fill, dose↔vial
    decrement and low-stock all light up for customs, with **no parallel TS maths** and
    the `compounds` catalogue left fully read-only (Invariant 6 stands).
    - **Code:** `pushProtocolCompound` (`lib/home/protocolSync.ts`) now CREATES a custom
      row instead of returning `skipped` (id = `resolvePcId(client id)` = the local id,
      since `newId()` is always a uuid → Postgres + local stay joined, dose logs hit the
      right vial); `lib/db/types.ts` (`compound_id` nullable + `custom_name`/`custom_category`
      on the row/insert + `stackCompoundToProtocolInsert` writes them); `listStock`
      (`lib/db/inventory.ts`) coalesces `custom_name`/`custom_category` so Stock shows the
      real name, not "Compound". The UI was ALREADY built for this — both the inline "Got a
      vial?" step (`AddCompoundSheet`) and the Stock tab (`AddStockSheet`, which lists customs
      + falls back to `formsForMethod`) just needed the backend to stop skipping; removed the
      now-stale "not available for custom compounds yet" error. The Postgres stack PULL still
      skips compound_id-NULL rows, so customs render once (device-local), never doubled.
  - **Protocol "more" menu.** The Protocol → Compounds list rows had a decorative "⋯"
    only; tapping a row just opened edit, with no archive/delete. Wired the dashboard's
    `CompoundDetailSheet` into `PlanView` via a new `context="plan"` mode (primary action
    "Edit dose & schedule"; More → Stop logging / Delete all). Tapping the row or the "⋯"
    opens it; archive/delete use the same device-local + Postgres stores as Home, so both
    screens stay in sync.
  - **Also (same session): splash "box" softened.** `app/_components/splash-screen.tsx`
    now masks the Kyle clip + poster with a radial vignette (`SPLASH_MASK`,
    `circle closest-side`) so the clip's baked dark square dissolves into the black
    overlay instead of showing a hard rectangular edge.

- **Profile "Add to Home Screen" row — platform-aware + self-hides when installed
  (2026-06-24, Adrian + Claude) — `tsc`+`lint` clean.** Finished the Android follow-up
  on the Profile row (`InstallAppRow`): on iPhone Safari it opens the manual steps; on
  Android it fires the native install dialog (`usePwaInstall`, shown only when
  `canInstall`); and when the app is **already on the Home Screen (running standalone)
  the row is removed entirely** (Adrian's preference over an "already installed"
  message — `display-mode: standalone` is the reliable signal). The row renders its own
  leading divider and the Profile page dropped the divider that preceded it, so the
  App list closes up cleanly when the row hides. (On Android the row also hides when no
  install is on offer — i.e. already installed but viewed in-browser.)

- **Android/Samsung native install prompt (2026-06-24, Adrian + Claude) —
  `tsc`+`lint` clean.** The install popup was iPhone-only (manual Share-sheet steps);
  Samsung/Android users saw nothing. Added an Android path: new
  `components/pwa/usePwaInstall.ts` captures Chrome/Samsung Internet's
  `beforeinstallprompt` (module-level capture so an early event isn't missed +
  `useSyncExternalStore`, no setState-in-effect) and exposes a one-tap
  `promptInstall()` that fires the OS's native install dialog. `InstallHomeScreenPopup`
  now branches by platform: iPhone keeps the manual steps; Android (when `canInstall`)
  shows a single "Add to Home Screen" button → native dialog. Same `freshSignIn`
  trigger + dismiss-clears-cookie for both. Also trimmed the iOS opener to "Get the
  full app, not a Safari tab — here's how:" (Adrian, prior commit). **Follow-up noted:**
  the Profile → "Add to Home Screen" row still shows iOS steps to Android users (it
  reuses `AddToHomeScreenPrompt`) — lower priority; revisit if needed.

- **Install popup copy — drop the reminders framing (2026-06-24, Adrian + Claude)
  — `tsc`+`lint` clean.** Adrian: the popup shouldn't mention reminders; it should
  sell the install. `AddToHomeScreenPrompt` opener is now "Get the most out of
  Trackd — add it to your Home Screen so it opens full-screen, one tap away, instead
  of a Safari tab. It takes a second:" and step 3 drops "and turn reminders on here."
  Steps (Share → View more → Add to Home Screen, with the older/newer-iPhone note)
  unchanged. Copy-only; the shared component is also used by the notifications
  settings + Profile row.

- **Install popup: not showing on sign-in, then auto-dropping — two fixes
  (2026-06-24, Adrian + Claude) — `tsc`+`lint` clean; on branch
  `fix/install-popup-show-on-signin`.** Two bugs found on-device:
  - **Not showing at all** on `adrianschimizzi1@gmail.com`: the `!installed` gate I'd
    added — that account had `pwa_installed_at` stamped from earlier installed-PWA
    testing, so the popup was permanently suppressed (and it conflicted with "every
    sign-in" anyway). Fix: dropped the installed-suppression entirely. Removed the
    now-dead `PwaInstallTracker` (deleted) + its `(app)`-layout mount + `markPwaInstalled`.
  - **Showed then auto-dropped** on a fresh account: the popup cleared the
    `trackd-install-hint` cookie on SHOW via a Server Action — a Server Action (or any
    post-load RSC refresh) re-renders the dashboard, which then read `freshSignIn=false`
    and unmounted the popup. Fix: consume the cookie only on **dismiss**, via a plain
    route handler `POST /api/install-hint` (not a Server Action, so no RSC refresh).
    `lib/pwa/installActions.ts` deleted.
  - **Net:** the popup is now gated ONLY to iPhone + Safari (not standalone) + a fresh
    sign-in cookie; it stays until dismissed, then returns next sign-in. The
    `pwa_installed_at` / `install_prompt_dismissed_at` columns are left unused (no drop
    migration).

- **Install popup → every sign-in, + copy spacing/grammar fix (2026-06-24,
  Adrian + Claude) — `tsc`+`lint` clean; on branch
  `fix/install-popup-per-signin-and-copy`.** Adrian wanted the "Add to Home Screen"
  popup on EVERY physical sign-in / sign-up, not once per account. The auth callback
  (`app/auth/callback/route.ts`) now sets a short-lived `trackd-install-hint` cookie
  on a successful sign-in; the dashboard reads it and the popup clears it on show
  (`clearInstallHint`, replacing `dismissInstallPrompt`) — so it shows once per login
  and returns next sign-in, while a live-session reopen (no callback) doesn't nag.
  Still suppressed once installed (`pwa_installed_at`) / in standalone. Also fixed a
  **formatting bug** in `AddToHomeScreenPrompt`: a line wrap collapsed the space after
  the bold words ("Sharebutton", "View moreif") — added explicit `{" "}` after each
  bold span and tidied the copy (trailing periods, em-dash opener).

- **Splash autoplay made reliable across launches + install copy reverted
  (2026-06-24, Adrian + Claude) — `tsc`+`lint` clean; on branch
  `fix/splash-autoplay-and-install-copy`.** After #35 deployed, Adrian found the
  splash animated on the FIRST PWA launch but was static on most launches after.
  Root cause: on a fast cached relaunch, iOS fires the muted `autoplay` BEFORE
  React attaches its `onPlaying` listener, so the event is missed and the video is
  never revealed (only the static poster shows). Fix: `splash-screen.tsx` no longer
  relies on the `onPlaying` event — it POLLS `video.currentTime` (reveal the moment
  frames are actually advancing) and retries `play()`, with `playing`/`timeupdate`/
  `ended` listeners as additional triggers; NO_START_MS still covers a genuine
  autoplay block. Also **tuned the install-popup copy** (Adrian): keep the 3-step
  flow (Share → View more → Add to Home Screen) BUT keep the older-vs-newer-iPhone
  explanation he likes on the Share step ("on newer iPhones it's inside the •••
  menu").

- **Follow-ups: splash actually animates, install popup shows once-per-account,
  dup fix verified (2026-06-24, Adrian + Claude) — `tsc`+`lint` clean;
  `pwa_install_state` migration APPLIED LIVE; on branch `fix/splash-anim-and-install-once`;
  ▶ on-device QA pending.** Founder feedback after the first PR (#34) merged:
  - **Splash showed black → static poster, no animation.** Cause: the previous pass
    faded after a fixed 1.4s, which cut the clip off before it visibly played; and
    the SW intercepted the video and could alter playback. Fix: `splash-screen.tsx`
    now lets the clip ANIMATE — reveals it on `onPlaying`, fades a short tunable
    `PLAY_MS` (2.8s) after it starts or on its own `ended`, with a `NO_START_MS`
    (2.2s) fade so it never strands on the static poster and a `MAX_MS` (7s)
    backstop. `public/sw.js` now serves the **video network-first** (online playback
    is the server's own untouched response; only offline falls back to the precached
    copy with Range slicing), poster stays cache-first — so the SW can't break
    online playback.
  - **Install popup should show ONCE per account, and not if it's already on the
    Home Screen.** Migration `supabase/profile/006_pwa_install_state.sql` (applied
    live) adds `profiles.pwa_installed_at` + `install_prompt_dismissed_at`. New
    `PwaInstallTracker` (mounted in the `(app)` shell) stamps `pwa_installed_at` the
    first time the app runs standalone — `display-mode: standalone` is the only
    reliable "is it installed?" signal iOS gives — so once added the popup never
    shows again, on any device. `InstallHomeScreenPopup` now takes server-backed
    `installed`/`dismissed` props (from the dashboard profile read) + dismisses via
    `dismissInstallPrompt()` (`lib/pwa/installActions.ts`); shows only on iOS + in
    Safari (not standalone) + both flags null. localStorage stays as an offline
    backup for the dismissal.
  - **Popup copy → 3 steps (Adrian's pick):** Share → View more → Add to Home Screen
    (`AddToHomeScreenPrompt`, the shared visual used by the popup + Profile row).
  - **Duplicate-compound fix VERIFIED:** a constraint test inserted a duplicate
    `(cycle, compound)` row and the DB rejected it (rolled back, nothing persisted);
    live data shows 0 duplicate groups + 0 multi-active-cycle users even after the
    founder's live add-compound testing. Resolved at the DB level.

- **Three fixes: duplicate compounds + faster/offline splash + iOS install popup
  (2026-06-24, Adrian + Claude) — `tsc`+`lint` clean; `protocol_compound_uniqueness`
  migration APPLIED LIVE + verified; prod `build` deferred (a `next dev` server was
  running — the shared-`.next` gotcha); NOT committed/deployed; ▶ Adrian's on-device
  QA pending.** Three founder-reported issues in one pass:
  - **#2 Duplicate compounds — root-caused + durably fixed.** The DB allowed it
    (`protocol_compounds` had only a PK on `id`; `one_active_cycle_per_user` was
    commented out) and the read-merge only de-duped the LOCAL extras, never the
    Postgres pull itself — so two same-name rows both rendered. Two rows could be
    created because the "already in your log" guard checks ONLY local localStorage
    (a re-add on a drifted cache mints a fresh id → a twin row), and the inline
    "Got a vial?" path fires `pushProtocolCompound` twice at once → on a cycle-less
    post-reset state the `ensureActiveCycle` race spawned two "Current" cycles.
    **Fix (full root-cause, Adrian's pick):** migration
    `supabase/protocol/003_protocol_compound_uniqueness.sql` de-dupes any leftovers
    then adds `UNIQUE (cycle_id, compound_id)` + `one_active_cycle_per_user`
    (verified zero offending rows before applying; both guards confirmed live);
    `ensureActiveCycle` is now race-safe (re-reads on `23505`); `pushProtocolCompound`
    REUSES an existing `(cycle, compound)` row's id so a re-add updates the canonical
    row instead of twinning; and both the Postgres pull + the hydrate merge de-dupe
    by compound on read. Files: `lib/db/cycles.ts`, `lib/home/protocolSync.ts`,
    `lib/home/hydrateProtocol.ts`. (Live DB was clean post-reset, so the migration's
    cleanup was a verified no-op; the guards prevent recurrence.)
  - **#3 Splash — fast + offline-proof.** It waited on `window.load` (which blocks
    on the 1.1MB clip), so Kyle lingered ~5s; and the SW was cache-free, so the clip
    never loaded offline. Now `app/_components/splash-screen.tsx` fades after a short
    `HOLD_MS` (1.4s, cap 2.6s) instead of `window.load`, and `public/sw.js` precaches
    the clip + poster and serves ONLY those two paths (cache-first, with Range slicing
    so iOS `<video>` gets a `206`) — every other request is still passthrough (no
    shell caching). Architecture's "no fetch handler" note updated.
  - **#1 Add-to-Home-Screen popup + Profile entry.** New
    `components/pwa/InstallHomeScreenPopup.tsx` — a one-time, dismiss-remembered
    bottom sheet auto-shown to a new iPhone user in Safari (iOS && !standalone),
    reusing the shared `AddToHomeScreenPrompt` visuals; wired into the dashboard.
    New `components/profile/InstallAppRow.tsx` ("Add to Home Screen") opens the same
    visuals from Profile → App, permanently. To avoid double install prompts,
    `EnableNotificationsStep` no longer renders its own ios-needs-install variant
    (install is now the popup's job; the push prime stays purely about notifications).

- **Hide scrollbars app-wide — native-app feel (2026-06-23, Adrian + Claude) —
  MERGED to `main` (prod) as PR #33 (squash); CodeRabbit + Vercel checks passed.**
  The default browser scrollbar rendered as a bright white strip on the dark canvas
  whenever a page overflowed. Added two declarations to `app/globals.css` (after the
  `@theme inline` block) — `*::-webkit-scrollbar { display: none }` (Chrome/Safari/
  Edge) + `* { scrollbar-width: none }` (Firefox) — applied universally so the
  document scroll and inner scroll rows are both covered. Scroll behaviour
  (trackpad/wheel/touch) is untouched; only the visual bar is removed. Trade-off
  accepted (Adrian's call "fully hidden"): no scroll-position thumb / "more below"
  affordance — standard for a phone PWA, and iOS already auto-hides scrollbars.

- **Stock — part-used vials ("How much is in it?") (2026-06-23, Adrian + Claude)
  — `tsc`+`lint`+prod `build` clean; migration `inventory_partial_fill` APPLIED LIVE
  + verified.** A vial no longer has to start full. BOTH add-stock paths — the Stock
  tab's `AddStockSheet` and the inline "Got a vial?" step in `AddCompoundSheet` — gained
  a "How much is in it?" control (Full/¾/½/¼ presets or an exact amount-left in the
  vial's own measure — mL or tab/cap count) with a live "≈ N% full" readout. The shared
  maths live in `lib/protocol/vialFill.ts` (`resolveFill`). The estimate is stored as a
  single raw INPUT, `inventory_items.prior_used_base` (base-unit amount already gone;
  NULL = full), and `v_inventory_math` folds it into remaining
  (`remaining = total − prior_used − consumed`, clamped ≥ 0). `total_base` stays the
  TRUE full capacity, so the fullness bar and runway read honestly (a half-full vial
  shows ~50%). Migration `supabase/protocol/002_inventory_partial_fill.sql` (additive
  nullable column + CHECK ≥ 0 + `CREATE OR REPLACE VIEW`, output columns unchanged so the
  `authenticated` SELECT grant + `security_invoker` survive — all verified post-apply).
  AddStockSheet's edit path pre-fills the starting amount-left; default Full = zero
  behaviour change. Approach chosen by Adrian over "enter what's left as the total" and a
  synthetic opening-balance dose. **Discoverability follow-up (2026-06-23, Adrian's call
  "make it more visible"):** in the add-to-log "Got a vial?" step the "How much is in it?"
  section now shows the moment the panel opens (with a hint until the vial size is typed)
  rather than only after the amounts, plus a neutral fullness bar and a clearer collapsed
  CTA ("…how much you have left"). The compound EDIT path still defers fill adjustment to
  Protocol → Stock (Adrian opted not to add it on edit for now).

- **Splash video — Kyle the vial (2026-06-23, Adrian + Claude) — `tsc`+`lint`
  clean; dev smoke test passed.** Replaced the perceived "trackd logo splash"
  with a full-screen muted-autoplay video of Kyle the vial
  (`public/trackd-kyle-vial-splashback.mp4`, 1080×1920, ~5s, ~1.1MB H.264). New
  client overlay `app/_components/splash-screen.tsx`, mounted once in the root
  layout, mobile only (`lg:hidden`). Plays on load (`object-cover`), then fades
  into the app with the existing 500ms fade **the instant the page is ready**
  (window `load`) — not the full ~5s clip; caps at 5.5s and fades on video
  `ended` as fallbacks. Respects `prefers-reduced-motion` (skips the clip).
  **No trackd-logo screen on cold launch anymore:** the 8 iOS launch PNGs in
  `public/splash/` were regenerated from **frame 0** of the clip (Kyle is fully
  visible from frame 0 — no black fade-in/logo intro), cover-cropped per device
  with ffmpeg so they match the video's `object-cover`. Frame 0 is also the
  `<video poster>` (`public/trackd-kyle-vial-splash-poster.jpg`), so native
  launch image → poster → first played frame are identical = seamless handoff.
  Originals recoverable via git. (ffmpeg installed via brew for the frame
  extraction; macOS swift/ffprobe toolchain was broken.)
  - **Follow-up (2026-06-23): Kyle made smaller (two passes).** First switched
    `object-cover` → `object-contain` on a pure-black overlay — but the clip is
    9:16 vs the 9:19.5 screen, so contain fit by width and Kyle only shrank ~18%
    ("looked the same"). Second pass: size the clip explicitly by height via the
    `VIDEO_HEIGHT` const in `splash-screen.tsx` (now `58%` of the viewport,
    centered on black) so Kyle is clearly smaller. The clip background is pure
    #000 so the field around the scaled-down video is invisible. The 8 launch
    PNGs are regenerated at the SAME fraction (ffmpeg `scale=-2:0.58*H` + black
    pad) so the cold-launch handoff stays seamless. To re-tune size: change
    `VIDEO_HEIGHT` AND re-run the launch-PNG generation at the same %. `lint`
    clean; pushed to prod — on-device re-check pending (needs PWA re-add for the
    cold-launch frame; the playing clip updates without re-adding).
  - **Follow-up (2026-06-23): fixed "black screen for a few seconds" on the
    installed PWA.** On iOS standalone (worse on slow eSIM) a `<video>` renders
    as a black box while buffering and WebKit ignores the `poster` attr, so the
    1.1MB clip showed black before Kyle. Fix in `splash-screen.tsx`: render the
    poster still (frame 0) as an `<img fetchPriority="high">` UNDER the video,
    and keep the video at `opacity-0` until its `onPlaying` fires, then reveal it
    (frame 0 == poster == launch image, so the reveal is invisible). If autoplay
    is blocked the still just stays — never black. Dropped the redundant
    `<video poster>` (the img is the bridge). `lint` clean; pushed to prod.
  - **Follow-up (2026-06-23): black-then-Kyle on iPhone Air — missing launch
    image.** iOS exact-matches `apple-touch-startup-image` on device dims with no
    fallback, so the new iPhone Air (420×912 @3x = 1260×2736 — a brand-new form
    factor) had NO matching image and iOS painted the `#111110` background (reads
    as black) until JS mounted the poster. The 17/17 Pro (402×874) and 17 Pro Max
    (440×956) already matched existing entries; only the Air was a gap. Added the
    `1260-2736` entry to `apple-splash-links.tsx` and generated
    `public/splash/apple-splash-1260-2736.png` from frame 0 with the SAME recipe
    (verified: it reproduces all 8 existing PNGs byte-for-byte — frame0 scaled to
    `floor(0.58·H)` rounded down to even, centered on black). `tsc`+`lint` clean.
    NOTE: an already-installed PWA caches the startup links — Adrian must remove
    and re-add the home-screen app to pick up the new image.
- **Spec 14 — Push Notifications, Phase 2 (reminder scheduler), founders-first
  (2026-06-23, Adrian + Claude) — `tsc`+`lint`+prod `build` clean;
  `reminder_scheduling_prefs` migration applied LIVE; shipping in a PR; ▶ cron
  activation pending.** After Phase 1 landed + on-device tested, Adrian scoped
  Phase 2 via a 4-question pass: notify about **dose reminders + missed-dose + low
  stock** (not journal/recap); **once-daily at a user-set time** (we store which
  DAYS a dose is due, not per-dose times); **quiet hours** default 10pm–8am;
  **founders first**.
  - **Migration** (`supabase/notifications/002_reminder_scheduling.sql`): extends
    the existing `notification_preferences` (per-type on/off booleans + signup
    trigger already there) with `reminder_time`/`missed_cutoff_time`/`quiet_start`/
    `quiet_end`/`low_stock_days` + dedupe stamps (`last_dose_reminder_on`/
    `last_missed_nudge_on`/`last_low_stock_on`). Times are user-local
    (`profiles.timezone`).
  - **Engine** (`lib/notifications/`): `reminders.ts` is PURE — `isDueToday` reads
    the Postgres schedule columns (mirrors the client `isDueOn`) + the dose/missed/
    low-stock message builders. `runner.ts` `runForUser` collects a user's data in
    their tz, computes due-and-unlogged + low-stock (low-stock from
    `v_inventory_math.est_empty_date`), sends via `web-push`, prunes 404/410.
  - **Test harness (what Adrian asked for):** `actions.ts` `sendMyRemindersNow`
    (force=true, RLS-scoped to self) is wired to the Settings **"Send a test
    notification"** button — it now force-sends the user's REAL reminders (or a
    friendly "nothing due" if none), so the whole logic is testable on demand
    without waiting for the cron/time.
  - **Settings UI:** `components/settings/ReminderSettings.tsx` — 3 per-type
    toggles + daily reminder time + quiet-hours window, saved via `prefsActions.ts`
    (RLS-scoped). Rendered in the Settings Notifications section.
  - **Scheduler:** `app/api/notifications/run/route.ts` — Bearer `CRON_SECRET`,
    service-role client, founders-only (`isFounder`), runs each founder through
    `runForUser` (force=false → respects time/quiet/dedupe). **To go live:** a
    Supabase `pg_cron` job calling it every ~15 min + `SUPABASE_SECRET_KEY` +
    `CRON_SECRET` in Vercel (CRON_SECRET generated → `.env.local`/`.env.vapid`).
  - **ACTIVATED + verified end-to-end (2026-06-23):** Adrian set `SUPABASE_SECRET_KEY`
    + `CRON_SECRET` in Vercel; I enabled pg_cron/pg_net + created the `reminder-runner`
    cron (every minute, testing cadence — relax to `*/15`) that POSTs the route via
    pg_net. **Debug found a real gap:** the service-role read `42501`'d ("permission
    denied for table profiles") — the project had only ever granted anon/authenticated,
    never `service_role` (the scheduler is its first server-side user). Fixed with
    `supabase/grants/002_service_role_grants.sql` (service_role already has BYPASSRLS,
    so the grant is the standard Supabase posture). After the grant: real run returned
    `sent:1` to Adrian's account; cron run `succeeded`, route `200`, reminder delivered.
    Recorded sanitized in `supabase/notifications/003_reminder_cron.sql`.
  - **Caveats/follow-ups:** cron is on `* * * * *` (relax to `*/15` for steady state);
    `profiles.timezone` isn't captured yet so times default to Australia/Sydney (fine
    for AU founders — a follow-up should store the browser tz on subscribe). The
    `?debug=1` diagnostic was removed after confirming.

- **Spec 14 — Push Notifications, Phase 1 (transport) (2026-06-23, Adrian +
  Claude) — `tsc`+`lint`+prod `build` clean (34 routes; dev server stopped first per
  the shared-`.next` gotcha); `notifications_enabled` migration applied + verified
  LIVE; NOT committed/deployed; ▶ founder deploy steps + on-device proof PENDING.**
  Built `Context/14-push-notifications.md` end to end, adapting its Vite-isms
  (`src/sw.ts`, `VITE_*`, `injectManifest`/`generateSW`) to this **Next.js 16** app.
  - **Key discovery — most of the schema already existed.** `push_subscriptions`
    (decomposed endpoint/p256dh/auth, FK→`profiles`, UNIQUE `(user_id, endpoint)`,
    `last_seen_at`, RLS `own … - all`, index) + the per-type `notification_preferences`
    table both shipped in the **base schema** (`trackd_schema_v0_4_2.sql`, "ADD 3" —
    the "deferred Web Push storage" the architecture flagged), already granted in
    `api_role_grants`. So the **only** new schema is the master intent flag
    `profiles.notifications_enabled` (`supabase/notifications/001_push_subscriptions.sql`).
    A first migration pass redundantly re-declared the table + added split
    select/insert/delete policies on top of the base `- all`; caught it via MCP
    verification and **dropped the redundant policies** (corrective migration), so the
    live RLS is back to the single base `- all` policy. Still **24 tables**.
  - **Service worker (FIRST in the app):** hand-written `public/sw.js`, push-only
    (`push` + `notificationclick`), **no `fetch` handler** so it can't touch the
    localStorage-based offline-first or cache a stale shell. Registered from the
    `(app)` shell via `components/pwa/service-worker-registrar.tsx`; `sw.js` excluded
    from the `proxy.ts` session-refresh matcher.
  - **VAPID:** a matching P-256 keypair generated (Node crypto, web-push format).
    Public key wired into `.env.local` + documented in `.env.example`
    (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, inlined at build). The **private** key lives only
    in gitignored `.env.vapid` (handoff) — never committed, never in the bundle.
  - **Client + server:** `lib/push/pushService.ts` (capability detection, subscribe/
    unsubscribe, server sync, `urlBase64ToUint8Array`), `components/push/
    usePushNotifications.ts` (the single hook backing both entry points, reconciling
    `Notification.permission` + subscription presence + the stored flag), and
    best-effort `lib/push/pushActions.ts` (upsert/delete subscription + flip the flag;
    identity from the verified session, RLS the backstop — mirrors `syncActions.ts`).
  - **UI (3 components, per spec):** `components/settings/NotificationsToggle.tsx`
    (Settings entry, hand-built switch — no new dep — + "Send a test notification"),
    `components/push/EnableNotificationsStep.tsx` (one-time, skippable **dashboard**
    prime — there is no onboarding flow, so it stands alone like the install prompt;
    `useMounted`-gated, remembered in localStorage), and
    `components/push/AddToHomeScreenPrompt.tsx` (shown by both when iOS-not-installed).
    Wired into `app/(app)/settings/page.tsx` + `app/(app)/dashboard/page.tsx` (each
    now reads `notifications_enabled` and seeds the UI).
  - **Send — two paths (Adrian asked: "make it testable once we push it").** The
    **Phase-1 test send ships with the app**, not the Edge Function: `sendTestNotification`
    sends in-app via **`web-push` (Node server action)**, reading the user's OWN subs under
    RLS and pruning 404/410 — so it rides the normal `git push → Vercel` flow (no Supabase
    CLI / function deploy needed; the CLI isn't even installed here). `web-push` is the one
    new dependency (server-side, spec-blessed). The **Edge Function**
    `supabase/functions/send-push/index.ts` (Deno; service role; same logic + the
    `notifications_enabled` gate; restricts non-service callers to self) stays in the repo
    as the **Phase-2 scheduler** primitive for arbitrary users — built now, deployed later.
    Both share one VAPID keypair. Server VAPID vars are now also in `.env.local` +
    documented in `.env.example` (set them in Vercel to test).
  - **Honest caveats:** RLS scoping is structurally guaranteed by the base
    `(SELECT auth.uid()) = user_id` policy (not re-proven with two live sessions this
    pass). The **proof** (a real push on a physical Android + an installed iPhone PWA) is a
    founder step (Claude can't reach a device). To test once pushed, the founder sets the 4
    VAPID env vars in Vercel (values in gitignored `.env.vapid`) + redeploys without build
    cache — then the test button works (no function deploy for Phase 1).
    `sendTestNotification` returns `{ ok:false }` (surfaced cleanly) until VAPID is set /
    there's a live subscription. **Out of scope (Phase 2):** the reminder scheduler
    (`pg_cron`/`pg_net` → the Edge Function) + per-type `notification_preferences`.

- **Spec 13 — extra final touches: perf + protection pass (2026-06-22, Adrian +
  Claude) — `tsc`+`lint`+prod `build` clean (34 routes; dev server stopped first per
  the shared-`.next` gotcha); ▶ Adrian's on-device QA; NOT committed/deployed.** Worked
  `Context/Feature Specs/13-extra-final-touches.md` end to end — 5 performance + 5
  protection prompts, one at a time. Three of the security audits came back **clean
  with evidence** (the RLS-first / Server-Component / parameterized-PostgREST
  architecture already closes them) — reported, not patched, per "don't invent /
  don't layer workarounds."
  - **P1 Compress responses — already on, verified live.** `curl` against prod:
    HTML/RSC + JS chunks serve `content-encoding: br` (`/` 62.8 KB → 11.8 KB, ~81%;
    biggest chunk 241 KB → 64 KB), Supabase Data API serves gzip JSON, tiny/already-
    compressed payloads correctly skipped. Made it explicit (`next.config.ts`
    `compress: true`) so the self-hosted `next start` path is covered too.
  - **P2 Batch writes — fixed the one N+1 write loop.** The one-time device→Postgres
    migration backfill (`migrateDeviceState`) called a `"use server"` action PER
    compound + PER dose log — each a browser→server round-trip + re-verified
    `getUser()` + 1–3 queries. New `pushProtocolBatch` (`lib/home/protocolSync.ts`)
    does the whole backfill in ONE round-trip: 1 auth check, 1 catalogue `.in()`
    lookup, 1 `ensureActiveCycle`, then chunked (200/stmt) multi-row upserts
    (`upsertProtocolCompounds`/`upsertDoseLogs` in `lib/db/`). Same deterministic
    ids → still idempotent; `taken_at` still computed client-side (device tz). For
    N+M items: (N+M) round-trips → 1. (Markers + progress-photos writes were already
    batched multi-row inserts.)
  - **P3 Circuit breaker — added.** Only external dep is Supabase; a hung call had no
    timeout (blocks the function to the platform limit → pile-up). New
    `lib/resilience/circuitBreaker.ts` (`guard()` = timeout + named breaker → fast-
    fail to a safe fallback; opens after N failures, half-opens after a cooldown).
    Wired into the awaited hydration **pull** paths (`pullStackAndLogs`,
    `pullCustoms`, `pullProtocolStackAndLogs`) → a degraded Supabase fast-fails to
    the local cache (the read path; an empty pull never wipes it). Behaviour verified
    with a standalone harness (timeout fast-fail @ ~timeout; open = instant + work not
    called; clean recovery after cooldown; unrelated dep isolated). Serverless caveat
    (per-warm-instance state; timeout is the always-on guard) documented in-file.
  - **P4 Optimistic UI — core loop already optimistic; converted the weight log.** The
    dose/compound/stack loop is optimistic by design (localStorage-first, best-effort
    cloud dual-write). The `revalidatePath`-style server-form screens still waited on
    the round-trip; converted the **weight log** (`WeightView`) to React 19
    `useOptimistic` — add/edit/delete show INSTANTLY, `router.refresh()` (in a
    transition) commits, and a failure auto-rolls-back the entry + shows an error.
  - **P5 Cache rendered pages — legal-doc DB read now cached.** `/terms`, `/privacy`,
    `/medical-disclaimer` are identical across users + change only on a rare version
    bump, but were re-queried via the cookie-bound client every request. New
    `lib/legal/getLegalDocument.ts` reads them through a **cookieless anon client**
    (public read) wrapped in `unstable_cache` (tag `legal-documents`, 1h revalidate),
    so Supabase is hit ~once/hour instead of per request. `docType` is the only cache
    key (no locale). **Caveat found at build:** the page shells still render `ƒ`
    (dynamic) — the root `app/layout.tsx` reads the session cookie for the desktop
    gate, which taints the whole route tree dynamic, so `export const revalidate`
    can't make them static here (kept as documented intent). The content-read cache
    is the real win. Signup gate still reads versions LIVE (uncached) — unchanged.
  - **S1 ORM injection — CLEAN.** Zero raw-fragment APIs (`.or`/`.filter`/`.textSearch`/
    `.like`/`.ilike`/`.match`/`.rpc`); every `.order()`/`.eq()`/`.in()` uses a literal
    column with parameterised values; search is client-side over the bundled static
    catalogue; `protocolSync` already uses exact `.eq("name")` over `.ilike` to dodge
    `%`/`_` abuse. RLS is the backstop.
  - **S2 Over-exposed fields — CLEAN (no client leak).** The auth `User` is never
    serialised whole (pages pass only `user.id`/`firstName`/`Boolean(user)`); reads are
    own-data, RLS-scoped, column-specific; action returns are mapped shapes
    (`StackCompound`/`DoseRow`) or `{ ok }`, never raw rows; cross-user data lives only
    on `/admin`, gated at the page (no fetch until `isFounder`) AND by founder RLS, with
    a `head:true` count. `lib/db/*` `select("*")` returns the user's OWN rows server-side
    and is mapped before any serialisation.
  - **S3 SSRF — CLEAN.** Zero outbound request primitives (no `fetch`/`axios`/`http`/…);
    the server never fetches a user URL. User images load in the BROWSER via `<img>` on
    Supabase signed URLs minted from the user's own `<uid>/…` paths; `next/image` remote
    optimisation isn't configured; the welcome-video embed is a hardcoded founder config.
    Guardrail noted for any FUTURE server-side fetch feature (link previews/importers).
  - **S4 Stored XSS — CLEAN.** Zero `dangerouslySetInnerHTML`/`innerHTML`/`eval`/
    `new Function`/`document.write`, no HTML-emitting markdown lib. All stored user
    content (custom names, journal, cycle notes, **feedback + emails shown to founders
    in `/admin`**, display names) renders as auto-escaped React text; the legal renderer
    is service-role content and also escapes. Input already length/format-validated;
    output encoding is consistent.
  - **S5 CORS — safe by default + headers added.** No `Access-Control-*` anywhere (no
    wildcard, no `Origin` reflection, no credentialed cross-origin); the credentialed
    Server-Action surface is SAME-ORIGIN-only via Next's built-in CSRF check
    (`allowedOrigins` left unset = same-origin; adding one would only loosen it). Added
    baseline protective response headers in `next.config.ts` `headers()` for all routes:
    `X-Frame-Options: SAMEORIGIN` (clickjacking), `X-Content-Type-Options: nosniff`,
    `Referrer-Policy: strict-origin-when-cross-origin`, `Strict-Transport-Security`
    (1y, no includeSubDomains — a future `auth.*` subdomain shouldn't be pre-committed).
  - **Files:** `next.config.ts`, `lib/resilience/circuitBreaker.ts`,
    `lib/legal/getLegalDocument.ts`, `lib/home/protocolSync.ts`,
    `lib/home/syncActions.ts`, `lib/db/{protocolCompounds,doseLogs,types}.ts`,
    `lib/migration/migrateDeviceState.ts`, `components/weight/WeightView.tsx`,
    `components/legal/legal-document.tsx`, `app/{terms,privacy,medical-disclaimer}/page.tsx`.
  - **Shipped as PR #18** (`feat/spec-13-final-touches`). **CodeRabbit round 1 — all 6
    findings fixed (commit `6f0a8e3`).** Common root: Supabase returns query errors in an
    `error` field (doesn't throw), so error-ignoring reads looked like successful empties.
    (1+2 critical) `pushProtocolBatch` + `pullStackAndLogs`/`pullCustoms`/
    `pullProtocolStackAndLogs` now THROW on Supabase `error` so the breaker counts failures
    and the batch reports `ok:false`; (critical) the migration reads via a new **unguarded
    strict** `pullStackAndLogsForMigration` so a transient outage throws (caught → not marked
    complete) instead of a silent empty that durably marks "nothing to migrate"; the
    **circuit breaker** persists state before awaiting + serialises half-open to one probe
    (verified: 3 concurrent → 1 runs); **getLegalDocument** throws on error so
    `unstable_cache` can't cache a transient null (1h 404); **WeightView** wraps the
    optimistic save/delete in try/finally so the busy state always clears even if the action
    promise rejects. `tsc`+`lint`+prod `build` clean.
  - **▶ Next:** Adrian on-device QA (weight optimistic add/edit/delete + rollback; legal
    pages; Home still hydrates) → address any CodeRabbit round-2 → merge PR #18.

- **Home ⇄ Protocol/Stock sync + reinstall-proof delete (2026-06-20, Adrian + Claude)
  — `tsc`+`lint`+prod `build` clean (31 routes); `profile_protocol_migrated_at`
  migration applied LIVE; NOT committed/deployed; ▶ clean-slate wipe of the
  adrianschimizzi account PENDING (sequenced after deploy + the user's app
  delete/reinstall).** Founder-reported: after deleting compounds then deleting +
  reinstalling the PWA, deleted compounds (incl. customs) reappeared on Home, and the
  Protocol/Stock list showed compounds (e.g. Trenbolone Acetate) that Home didn't.
  Root-caused against live data — three stores had drifted (localStorage cache ↔ the
  `user_stack_compounds` jsonb mirror ↔ canonical Postgres `protocol_compounds`).
  Four root causes + fixes:
  - **Reinstall resurrection.** The migration's "already ran" marker lived only in
    localStorage, which a PWA reinstall WIPES → the migration re-ran and re-seeded the
    stack from the stale jsonb mirror. Fix: durable cloud marker
    `profiles.protocol_migrated_at` (`lib/db/migrationFlag.ts`, gated in
    `migrateDeviceState`) — once migrated, never re-runs, even after reinstall.
  - **Mirror resurrected catalogue compounds.** The `user_stack_compounds` mirror
    outlives the localStorage wipe and the hydrator merged its entries back. Fix: the
    mirror is now a **customs-only** backup (`lib/compound-lookup.ts` `isCatalogueName`
    gates the writes in `stack.ts` + `hydrateProtocol.ts`); the hydrator REFUSES to
    resurrect a catalogue compound the mirror holds but Postgres doesn't (deleted/stale).
    Customs still survive reinstall (the mirror is their only durable store).
  - **Stock showed non-Home compounds.** `listStock` returned any active vial
    regardless of its compound's state. Fix: inner-join `protocol_compounds` + filter
    `is_active = true`, so Stock is a strict subset of active Home compounds — archiving
    a compound now drops its vial from Stock too.
  - **Delete semantics confirmed (Adrian):** Archive = keep history; Remove (the
    two-step "Delete all") = permanent + reinstall-proof. Both already exist on the Home
    compound sheet; the fixes above make Remove actually stick.
  - **"Start fresh" reset (follow-up, same day).** A cloud-only wipe never sticks: a
    test wipe of the founder account came BACK because the device's localStorage is a
    write-back cache that re-pushes the stack on the next focus/online (the giveaway:
    only 1 mirror row returned — the new customs-only gate — so the re-push was the new
    code reading old localStorage; a PWA "reinstall" on iOS updates the SW code but
    keeps stored data). Fix: **Archive screen → "Clear all compounds & stock"**
    (`components/home/StartFreshSection.tsx` + `lib/db/resetProtocol.ts` `wipeMyProtocol`,
    wired in `app/(app)/archive/page.tsx`) clears BOTH halves at once — deletes
    `protocol_compounds` (cascades stock + dose logs) + the 3 mirror tables + stamps the
    migrated flag, AND removes the stack / dose-log / customs / migrate-marker
    localStorage keys, then hard-reloads to an empty Home. Two-step confirm; leaves
    weight / progress / bloodwork untouched. No reinstall needed.
  - Files: `supabase/profile/004_protocol_migrated.sql`, `lib/db/migrationFlag.ts`,
    `lib/compound-lookup.ts`, `lib/migration/migrateDeviceState.ts`,
    `lib/db/inventory.ts`, `lib/home/hydrateProtocol.ts`, `lib/home/stack.ts`,
    `lib/db/resetProtocol.ts`, `components/home/StartFreshSection.tsx`,
    `app/(app)/archive/page.tsx`.

- **Edit stock — correct a vial's amounts in place (2026-06-20, Adrian + Claude) —
  `tsc`+`lint`+prod `build` clean; deployed.** Each Stock card now has a pencil
  (Edit) alongside Refill/Delete. Edit reuses `AddStockSheet` in a new edit mode:
  compound locked, amounts pre-filled from the vial's stored raw inputs, save →
  `updateStockItem` (new in `lib/db/inventory.ts`) which UPDATEs the SAME row.
  Distinct from refill (a new row): a typo fix keeps the row id, so doses already
  logged against the vial stay linked and `v_inventory_math` just recomputes from
  the corrected total. The update sets all type-discriminator columns (nulling the
  unused ones) so even a type change can't violate the `inv_type_fields` CHECK
  (verified against the live constraint). `protocol_compound_id` is not editable
  (would orphan doses). `listStock` now also returns the raw inputs (total_amount,
  bac_water_ml, concentration_mg_per_ml, strength_per_unit_mg, total_amount_unit)
  for pre-fill. Files: `lib/db/inventory.ts`, `components/protocol/{AddStockSheet,
  StockItemCard,StockView}.tsx`, `app/preview/protocol/preview.tsx`.
- **Founder welcome popup — REMOVED (2026-06-23, Adrian + Claude) —
  `tsc`+`lint` clean.** Decision: the founder video is sent individually to each
  tester instead of living in the app, so the one-time popup was dropped. Deleted
  `lib/welcomeVideo.ts`, `lib/db/welcome.ts`, `components/welcome/` (whole dir),
  and unwired it from `app/(app)/dashboard/page.tsx` (the only render site;
  dropped the `welcome_seen_at` select + `showWelcome` gate). The feature never
  actually showed in prod — it shipped DORMANT (`WELCOME_VIDEO_EMBED_URL = null`),
  so `profiles.welcome_seen_at` was never populated. Also dropped that column
  LIVE via `005_remove_welcome_seen.sql` (MCP `apply_migration`; verified gone, 0
  rows lost, nothing depended on it). `003_welcome_seen.sql` is kept as
  applied-migration history; the 005 drop reverses it.
- **Permanent feedback in Profile + sheet keyboard fix (2026-06-20, Adrian +
  Claude) — `tsc`+`lint`+prod `build` clean; deployed.**
  - **Profile → App → "Send feedback"** row (`components/profile/ProfileFeedbackRow.tsx`,
    wired into `app/(app)/profile/page.tsx`) — the PERMANENT feedback path that
    stays after the beta-only + menu entry is removed. Reuses `FeedbackSheet`
    (now copy-configurable via title/description/placeholder/submitLabel props) →
    same `beta_feedback` table, founder-read in `/admin`. True auto-email is a
    follow-up (Edge Function + Resend secret); schema already carries email/path.
  - **Sheet keyboard fix:** `components/ui/sheet.tsx` `SheetContent` now defaults
    `onOpenAutoFocus` to `preventDefault()`, so NO sheet (current or future) pops
    the mobile keyboard on open unless it explicitly opts in. Fixed the feedback
    sheet doing this.
  - **Sync notice rate-limited** to once / 60s so it can't nag (`syncStatus.ts`).
  - **Auth confirmed:** sign-in is Supabase + Google-only (login page has one
    button; all real users via google). Adrian's decision: PUBLISH the Google
    OAuth app (basic scopes → no Google verification review needed) rather than
    per-tester test users. Console task for Adrian/Angus; no code change.
- **Beta-readiness hardening — sync notice, consent audit, id fix, log loading
  (2026-06-20, Adrian + Claude) — `tsc`+`lint`+prod `build` clean; consent unique
  index applied LIVE; deployed.** Follow-ups from the beta-readiness pass (RLS
  confirmed on all 26 tables; auth/legal gate verified; OAuth "Testing" publish is
  Adrian's to do in the Google console).
  - **#2 Silent-sync notice:** canonical Postgres pushes (`stack.ts`/`doseLog.ts`)
    are now wrapped in `lib/home/syncStatus.ts` `trackSync()`, which fires a
    `trackd:sync-failed` event when a write fails *while online* (offline is
    expected — the reconnect re-sync handles it). `SyncStatusNotice` (mounted in
    the app shell) shows one amber "saved on your device — still syncing" banner.
  - **#3 Reliable consent audit (`app/welcome/actions.ts`):** the gate now writes
    `consent_records` FIRST (idempotent upsert; unique index
    `consent_records_user_doc_version_uidx`, `supabase/consent/002_consent_unique.sql`,
    applied LIVE) and only sets the profile access gate once it lands — so no
    account can have access without a complete, non-duplicated consent record.
    Also errors out if the current legal versions can't be resolved.
  - **#4 Insecure-context ids (`lib/home/id.ts`):** one shared `newId()` that
    always returns a valid uuid *shape* even when `crypto.randomUUID` is missing
    (LAN/dev), replacing the divergent `c_…`/`s_…` fallbacks that duplicated
    compounds + broke stock/dose joins after hydration. Used by AddCompoundSheet +
    add-to-stack-menu.
  - **#5 Log-sheet loading:** `LogDoseSheet` shows a brief "Checking your stock…"
    while the vial list loads. (The other half — a "custom compounds are
    device-local" note — was a non-issue: customs already back up via `pushCustom`.)
- **Beta notes & feedback — in-app feedback capture (2026-06-20, Adrian + Claude)
  — `tsc`+`lint`+prod `build` clean; `beta_feedback` migration applied LIVE +
  shape-verified (insert/delete round-trip, 0 rows left); deployed.** A distinct
  white-faced row below the + (Shortcuts) menu grid opens a `FeedbackSheet` (free-
  text note → `submitBetaFeedback`), writing one `beta_feedback` row per
  submission. No transactional-email service is wired up, so the store is Supabase
  and founders read submissions in `/admin` (a new "Beta feedback" section).
  - **Table `beta_feedback`** (`supabase/feedback/001_beta_feedback.sql`):
    user_id FK→profiles ON DELETE CASCADE, server-captured email, message
    (1–4000 CHECK), path + user_agent context, created_at. Append-only for
    clients (INSERT+SELECT only); RLS = insert-own + **select own-or-founder**
    (founder email list kept in sync with `lib/admin.ts` / waitlist policy).
  - **Files:** `lib/db/feedback.ts` (server action; identity from session, never
    the client), `components/feedback/FeedbackSheet.tsx`,
    `components/shortcuts/{shortcutItems,ShortcutsMenu}.tsx` (new `feedback`
    action + `FEEDBACK_ITEM` row), `app/admin/page.tsx` (founder feedback list).
  - **Follow-up (optional):** email-forward each submission (Edge Function +
    Resend secret) — schema already carries email/path so no migration needed.
- **Stock runway bugfix — dose↔inventory link (2026-06-20, Adrian + Claude) —
  `tsc`+`lint` clean; root-caused against LIVE data; NOT committed/deployed.**
  Beta tester reported the Stock view "didn't change storage" when logging a
  dose. Confirmed in prod: the test account had 5 dose logs, **0** with
  `inventory_item_id` set, so `v_inventory_math` never decremented (vial existed 2h
  before the doses; runway stayed 100%). Root cause: the "From vial" link in
  `LogDoseSheet` was only set after an async `listStock()` round-trip — the user
  taps Track first, so the dose saved with a NULL link. **Fix:** resolve the link
  **server-side** in `pushProtocolDoseLog` — `DoseLog.inventoryItemId` is now
  tri-state (vial id = explicit pick · `null` = "Not tracked" · `undefined` =
  undecided → server links the compound's newest active compatible vial). `logDose`
  passes `autoLinkActiveVial=true`; the migration leaves it `false` so historical
  doses never retro-link. Read-only sim proved the vial then drops 250→50 base
  (2→0 doses). Also hardened **Add stock**: it now `await`s `pushProtocolCompound`
  before inserting (a just-tracked compound's row may be in flight) and **surfaces
  the failure** instead of silently keeping the sheet open (custom compounds →
  "not available yet") — the likely cause of the "didn't load a compound" report.
  Files: `lib/home/{protocolSync,doseLog,mockHomeData}.ts`,
  `components/home/LogDoseSheet.tsx`, `components/protocol/AddStockSheet.tsx`.
  ▶ Adrian to deploy, then re-test by logging a Test Cyp dose.
- **Legal Compliance Cutover — Spec 12 (consent capture + calculator
  transparency) (2026-06-20, Adrian + Claude) — `tsc`+`lint`+prod `build` clean;
  `consent_records` migration applied + round-trip-verified LIVE (rolled back, 0
  rows); NOT committed; ▶ Adrian to sample the preview routes then approve
  deploy.** Built per `Context/Feature Specs/12-Legal-Direction-Spec` with
  Adrian-approved calls. Steps 1–4 done; **Step 5 (bloodwork neutrality) is a
  no-op** — the biomarker below/within/above indicator was removed earlier, so
  bloodwork is a photo store and already non-clinical.
  - **Step 2 — `consent_records` table (applied LIVE).** Append-only, per-user,
    per-version legal-consent audit (`supabase/consent/001_consent_records.sql`).
    Enum `consent_document` (tos/privacy/disclaimer/health_data_consent), FK
    `profiles(id) ON DELETE CASCADE`, `(SELECT auth.uid())` insert+select-own RLS,
    **no update/delete policy or grant** (audit trail), index `(user_id, document)`,
    grants SELECT/INSERT to `authenticated`. Live DB now **24 tables**.
  - **Step 1 — three separate signup consents.** `app/welcome/gate-form.tsx`
    replaced the single combined tickbox with **three un-ticked** controls
    (Terms+Privacy / Medical Disclaimer / explicit health-data processing);
    "Enter Trackd" stays disabled until all three + a DOB (server still enforces
    18+). `app/welcome/actions.ts` validates all three, keeps the `profiles` gate
    write (`tos_accepted_at`+`tos_version`, the access gate), and appends 4
    `consent_records` rows with each document's version **read live** from
    `legal_documents` (+ timestamp + user-agent); health_data_consent carries the
    Privacy version. Best-effort (a consent-insert blip never blocks signup).
    Minor calls (Adrian): doc links keep opening in a new tab; button stays
    "Enter Trackd".
  - **Steps 3–4 — reconstitution calculator** (`components/home/ReconCalculatorSheet.tsx`).
    Warning copy swapped to the spec's exact wording (still the always-on amber
    card, no gate). Added a compact **"Working"** card: `concentration = powder ÷
    BAC water` and `volume to draw = dose ÷ concentration` with the actual mg
    values plugged in (mono) so it can be re-checked by hand. Maths unchanged
    (still matches `v_inventory_math`).
  - **Versioning decision (Adrian, 2026-06-20):** legal docs may now use **point
    versions** (e.g. 1.3) for moderate refinements — relaxes the whole-versions-only
    rule. Versions are read live everywhere, so consent records stay correct across
    bumps. (Live docs are still 1.0 until the new 1.3 set is swapped in.)
  - **Sample surfaces (dev-only, 404 in prod):** `/preview/legal-consent` (the
    3-consent gate) and `/preview/recon` (calculator warning + working).
  - **v1.3 legal docs swapped in + LAUNCHED (2026-06-20).** Adrian's finalised
    Terms / Privacy / Medical **v1.3** replaced v1.0 live (`legal_documents_v1_3`
    + `legal_documents_v1_3_effective_date`; `effective_date = 2026-06-20`,
    is_beta=false; verified clean plain text; recorded in `supabase/legal/009`).
    The renderer now formats the date ("20 June 2026"). The v1.3 text aligns with
    the built features (three consents, request-based deletion, calculator shows
    its working, 7-day backups, no analytics, Supabase+Vercel only) + adds the
    AU entity details and GDPR/US-state/consumer-health sections. The whole batch
    (Spec 12 consent flow + calculator + v1.3 docs + date) was committed + deployed
    to `main`.

- **Pre-beta hardening pass — legal v1.0 (LIVE), error boundaries, offline
  archive-revert fix, dead-code cleanup (2026-06-18, Adrian + Claude) —
  `tsc`+`lint`+prod `build` clean; legal migration applied + verified LIVE; NOT
  committed.** A founder-directed pre-beta review, then a fix-pass on the agreed items:
  - **Legal documents finalised to v1.0 (applied LIVE).** ToS / Privacy Policy /
    Medical Disclaimer replaced with Adrian's finalised v1.0 text via the
    `legal_documents_v1_0` migration (`supabase/legal/003_legal_documents_v1_0.sql`;
    verified live: exactly one `is_current` row per type, `is_beta = false`, zero
    ⚠/`claude`/`Â·` cruft; the 0.x rows kept as history with `is_current = false`).
    The earlier drafts had rendered internal "⚠ NOTE … claude" blocks **verbatim on
    the public /privacy page** — now gone. **Date deliberately NOT set** (Adrian):
    `effective_date` stays NULL and the in-body header still reads "DD Month 2026 —
    set on launch"; the ONLY remaining launch-day legal step is setting the date.
    The renderer (`components/legal/legal-document.tsx`) gained a small Markdown
    subset (`##`/`###` headings, `-` bullets, `**bold**`) so the richer v1.0 text
    formats faithfully; the 18+/ToS gate now records `tos_version` "1.0"; the /login
    footnote lists all three docs. **Open content gaps (Adrian/lawyer's call):**
    Privacy §5 "[retention window to be confirmed]" placeholder; Privacy describes
    PostHog/Sentry and ToS describes paid plans, none wired in beta (forward-looking).
  - **Error/404 boundaries added** — `app/{error,not-found,global-error}.tsx`,
    branded to match login/legal. Previously any unhandled error dropped to Next's
    raw default error screen with no recovery path.
  - **Offline archive-revert bug FIXED** (Adrian reproduced on-device: archiving
    compounds OFFLINE, then reconnecting, resurrected them as active). Root cause:
    `hydrateProtocol.ts` `mergeAndSave` rebuilt the stack from the Postgres pull,
    discarding the local `archived` flag for any compound Postgres knew about — and
    the offline archive never reached Postgres. Fix: the local `archived` flag now
    wins over a stale pull, and the divergence is pushed up to converge (idempotent;
    no-op for customs). **Single-device assumption**; offline dose-UN-logging +
    multi-device archive conflicts still need a proper offline outbox (post-beta).
  - **Dose→vial link preserved across re-sync** — `pullProtocolStackAndLogs` now
    selects `inventory_item_id` and threads it through `DoseRow` →
    `doseRowsToDayLogs` → the local `DoseLog` (runway maths were always correct; this
    fixes the displayed "From vial" forgetting its vial after a focus/reconnect).
  - **Dead scaffolding removed** — `lib/sync/{cache,syncEngine}.ts`,
    `app/preview/{db-sync,protocol-test}`, and the orphaned
    `components/home/ProgressPhotosGlanceCard.tsx` + `components/ui/scroll-area.tsx`.
    `components/pwa/install-prompt.tsx` (`InstallPrompt`) left in place — it is
    unwired (rendered nowhere); **needs Adrian's call** on whether to mount it.
  - **Sign-out modal fix** — the confirm dialog ([components/auth/sign-out-confirm.tsx])
    is now rendered through a **portal to `document.body`**. It had been trapped inside
    the Profile page's `animate-home-up` transform wrapper: `position: fixed` is
    contained by a transformed ancestor and its `z-index` is scoped to that ancestor's
    stacking context, so the modal rendered at the page bottom and sat BEHIND the
    `z-40` bottom nav — its buttons weren't tappable (Adrian hit this on device).
  - **Legal content refinement (Privacy Policy, still v1.0; applied LIVE; Adrian's
    decisions).** Migrations `legal_documents_privacy_v1_0_content` (006) +
    `legal_documents_privacy_v1_0_backups_safe` (007): **PostHog + Sentry removed**
    (not in use); **sub-processors trimmed to Supabase + Vercel** (Stripe/Resend/
    ConvertKit dropped — none active in beta; a forward-looking sentence covers adding
    any later); **backup wording made true regardless of plan** (no longer asserts
    encrypted backups / a fixed window). **OPEN:** confirm the Supabase plan's backup
    policy (dashboard → Settings → Database → Backups) and finalise the §5/§7 wording
    with the real retention (or drop the backup claim). ToS pay-plan language kept as
    forward-looking (Adrian: "we'll get to that"). Medical Disclaimer §7 left as-is —
    it states the user's duty to independently verify the reconstitution result and
    that "Trackd does not check your inputs"; it does NOT claim an in-app confirmation
    popup, so it already matches the amber-warning reality.
  - **On-device QA (Adrian):** PWA delete + reinstall confirmed all account data
    (weight, progress photos, compounds + their tracked doses) re-hydrates from
    Postgres across 3 cycles — **account-linked, not phone-linked**, as intended.
    **Two-account isolation PASS** — signed in as a second account, saw none of the
    first account's data (RLS holding in the real app). Sign-out deliberately does NOT
    wipe localStorage (data is account-scoped and re-hydrates on re-login; clearing it
    would only matter on a shared device).

- **Quick-track popup reworked to mirror the dashboard Log flow (2026-06-18, Adrian + Claude)
  — `tsc`+`lint`+prod `build` clean.** Per Adrian, the "What would you like to track?" popup
  ([QuickTrackSheet]) now behaves **exactly like the home screen's Today's Log** instead of the
  earlier batch "tick several → one Confirm" model: tapping a dose (empty tick or its name)
  opens the **same `LogDoseSheet`** as the dashboard (confirm/edit amount · time · site →
  Track), and tapping a filled tick **un-logs** it (the tick goes blank) — a pure toggle. Doses
  are **grouped by category** with the same slim dividers as the dashboard (dot · label ·
  "N due"/"Logged"). The popup computes the same Log-sheet context (resolved site, clashes,
  last-used rest hint) and advances rotation identically. This also dissolves the two earlier
  CodeRabbit edge-cases (fast-tap vial skip; double-log) since logging now flows through the
  real Log sheet, which picks the vial and commits once. The batch Confirm/success overlay is
  gone; a single **Done** closes the popup.

- **Quick-track popup + blend-overlap heads-up (2026-06-18, Adrian + Claude) —
  `tsc`+`lint`+prod `build` clean; ✅ MERGED to `main` (prod) as PR #16 (squash). CodeRabbit's
  6 findings triaged — **3 valid fixed** (exclude archived compounds from overlap detection;
  gate Confirm until `listStock()` resolves so a fast tap keeps the vial link; one-shot
  `confirm()` guard vs double-log) and **3 skipped** (intentional tap-only autofocus; a minor
  a11y nit + the pre-existing best-effort one-active-vial invariant, both out of scope).**
  Two founder-requested changes, both on the home/logging surface:
  - **"What would you like to track?" quick-log popup.** The plus-menu **"Log a
    dose"** primary action no longer routes to `/dashboard` — it opens a new
    [QuickTrackSheet] in place. It lists the day's due compounds with a tick each;
    the user ticks what they took and taps **Confirm**, and each is logged with its
    own defaults (preset dose, current time, next rotation site, most-recent
    compatible vial) → a green **"Tracked"** confirmation, then auto-closes.
    Already-logged doses show as "Logged" and aren't re-logged; rotation advances
    per compound exactly like the dashboard Log flow. Granular edits (different
    dose/time/site) still live in the dashboard's Log sheet. Wired via a new
    `quick-track` shortcut action (`shortcutItems.ts` → `ShortcutsMenu`).
  - **Blends = single combined items, with an overlap note.** Glow / KLOW /
    **Wolverine** already exist as single catalogue entries (so they log as ONE
    unit — their constituents are never separately loggable). New
    [lib/compound-blends.ts] maps each blend → its constituents (BPC-157 / TB-500 /
    GHK-Cu / KPV) and detects overlap both ways. The **Add-to-log** sheet
    ([AddCompoundSheet]) now shows a non-blocking amber heads-up when you add a
    compound a blend you track already contains (or a blend covering something you
    already track): "… add it on its own only if you want an extra dose on top."
    **Decisions (Adrian):** one combined item (not expanded constituents); allow +
    heads-up (never block); fixed catalogue blends only (no user-composable stacks
    yet). No catalogue/CSV/DB changes — all three blends were already seeded.

- **Stock form picker now follows the compound (2026-06-18, Adrian + Claude) —
  `tsc`+`lint`+prod `build` clean (33 routes); NOT committed.** Fixes "every compound
  offers all three forms even when only one makes sense" (e.g. Retatrutide showing
  Pre-mixed / Oral). The Add/Refill **Stock** sheet ([AddStockSheet]) now derives a
  compound's real form(s) from the catalogue's per-route data (`routesOf` →
  `catalogueForms`; custom compounds fall back to `formsForMethod` off the route):
  **187 of 205 compounds have exactly one form**, so the picker DISAPPEARS — just a
  label ("Reconstituted — powder + BAC water"). Compounds with several forms (18, e.g.
  BPC-157 = recon/oral) show pills for ONLY those. A quiet, collapsed escape hatch
  ("Track it a different way?" / "Other form?") still reveals all three for an
  off-catalogue setup — so changes are possible without making anyone think. The
  `picker` state has three modes: `hidden` (one form / refill keeps its form) ·
  `compound` (only this compound's forms) · `all` (escape hatch). This matches the
  create flow ([AddCompoundSheet]), which already drove the vial form off the route.
- **One active vial per compound — add/refill REPLACES the current vial (2026-06-18,
  Adrian + Claude) — `tsc`+`lint` clean; archive SQL MCP-verified (rolled back); NOT
  committed.** Fixes the duplicate-card flaw: refilling — or using the refill "Change
  form" affordance — used to insert a NEW `inventory_items` row each time, so repeated
  refills / form changes left multiple active vials → multiple Stock cards + a split
  runway for one compound. Now `addStockItem` (the single path for both first-add and
  refill, in `lib/db/inventory.ts`) inserts the new vial FIRST, then archives the
  compound's OTHER active vials (`is_active=false`, `id <> new`). Insert-first ordering
  means a failed archive never leaves a compound with zero active stock (worst case = a
  transient duplicate the next add/refill cleans up). Result: exactly **one active vial
  (one card) per compound**, always; history preserved (old vials archived, not deleted;
  their logged doses survive); the live runway is unambiguous. Trade-off accepted: no two
  simultaneous active vials of one compound (a backup) — rare; add an explicit path later
  if wanted. No migration / no data cleanup (existing dupes were already inactive).
- **Protocol Cutover STEP 5 — Stock view + "stock left" runway (2026-06-17, Adrian +
  Claude) — `tsc`+`lint`+prod `build` clean (33 routes); all 3 inventory types
  MCP-verified against `v_inventory_math` (rolled back); ▶ Adrian's on-device QA
  pending; NOT committed.** The last cutover step — the **Stock** side of the Protocol
  toggle is now real (was a placeholder). Adrian asked to "make sure we're able to do
  stock left," so the runway is the centrepiece.
  - **Data (`lib/db/inventory.ts`, `"use server"`):** `listStock` joins
    `inventory_items` → its compound name and **`v_inventory_math`** (stitched by id),
    so remaining / doses-remaining / projected-empty are **read-only from the view,
    never recomputed in TS** (invariant 1). `addStockItem` (add + refill — refill is a
    NEW row, never mutate), `setStockArchived` (`is_active=false`, no hard delete).
  - **UI (`components/protocol/{StockView,StockItemCard,AddStockSheet}.tsx`):** lists
    each item with **"X mL / units left"**, **"~N doses"**, and **"runs dry <date>"** —
    all **neutral** (no red/green/amber good-bad; health-data colour rule). Add-stock
    **branches the 3-way `inventory_type` union** (reconstituted = powder mg/iu + BAC
    water; preconcentrated = mL + mg/mL; oral = count + mg/unit) and stores raw inputs
    only. Refill pre-selects the compound; archive surfaces nothing destructive.
    Wired into `ProtocolScreen` (replaced the placeholder); a `/preview/protocol`
    Stock tab shows mock runway.
  - **Verified:** `tsc`+`lint`+prod `build` clean. MCP round-trips (rolled back) for all
    three types confirmed the inserts satisfy the schema CHECKs + the unit-family trigger
    (key lesson: reconstituted `base_unit` is the powder's **mg/iu**, not the dose's mcg —
    mcg doses are mg-family) and that `v_inventory_math` returns the right remaining /
    doses / empty-date / mL-per-dose.
  - **Dose→inventory link (WIRED — founder-requested "connect my vials to the doses"):**
    the Home **`LogDoseSheet`** now shows a **"From vial"** picker of THIS compound's
    compatible inventory items (mg-tracked vial ↔ mg/mcg dose; iu ↔ iu — filtered
    client-side, re-checked server-side), defaulting to the most-recent vial on a fresh log.
    The choice rides on `DoseLog.inventoryItemId` (persisted device-local) and
    `pushProtocolDoseLog` sets `dose_logs.inventory_item_id` (dropping an incompatible link
    rather than failing the log). **MCP-verified the full loop (rolled back):** a 250 mcg
    dose linked to a 5 mg vial dropped `v_inventory_math` from 20→19 doses (2.0→1.9 mL).
    Unlogging restores it. So "stock left" now tracks ACTUAL logged consumption.
  - **Test:** `/preview/protocol` (Stock tab, mock runway) or the real `/protocol` signed in
    (add stock → log a dose from that vial on Home → watch the runway drop → refill/archive).
  - **Founder-requested polish (2026-06-17):** (1) **Fullness bar** on each Stock card —
    `remaining_base / total_base` from `v_inventory_math`, a NEUTRAL fill (white on a surface
    track, no red/green/amber per the stock-level rule) that starts full and shrinks as doses
    log. (2) **Log your vial when adding a compound** — `AddCompoundSheet` (create only) has an
    optional **"Got a vial? Log how much you have"** section showing just that compound's
    inventory-type fields (from the catalogue route); on save it ensures the `protocol_compound`
    exists then inserts the vial (`addStockItem`). (3) **Cycle description** — an optional
    free-text field in the cycle editor (stored in the existing `cycles.notes`, no schema
    change), shown under the Plan header. (4) **Smart inventory type** — **refill locks** to
    the existing vial's form (the type picker is hidden; "same form as your current vial"), and
    a **fresh add pre-selects** the form from the compound's catalogue `defaultInventoryType`
    (still changeable). So you almost never touch the type picker, but it remains as an
    override. All `tsc`+`lint`+`build` clean; the fill-bar data (`remaining_base`/`total_base`)
    verified from the view.

- **Protocol Cutover STEP 4 — Protocol screen shell + Plan view (cycle builder)
  (2026-06-17, Adrian + Claude) — `tsc`+`lint`+prod `build` clean; cycle write-path
  MCP-verified (rolled back); ▶ Adrian's on-device QA pending; NOT committed.**
  **Adrian approved the consolidation** (the spec's "confirm with Angus" — Adrian, as
  co-founder, gave the go-ahead): Angus's "Cycles" + "My Protocol" (Spec 11) become
  **ONE Protocol tab** with an in-page **Plan / Stock** toggle (shadcn `tabs`), NOT a
  second bottom-nav tab.
  - **Screen** (`app/(app)/protocol/page.tsx` → `components/protocol/ProtocolScreen.tsx`):
    replaces the "lives here soon" placeholder. Mirrors the Home composition
    (`PageScrollTitle` + staggered `animate-home-up`). Plan/Stock toggle; **Stock is a
    placeholder** until Step 5 (neutral copy). Mounts `useCloudHydration` so the stack is
    Postgres-sourced here too; refreshes the active cycle after mount/focus (the
    migration may create it just after the server render).
  - **Plan view** (`PlanView.tsx` + `CycleHeader.tsx`): the active-cycle header (name +
    **"Week X of N"** you-are-here, derived from `started_on`/`ended_on` in
    `lib/protocol/cycle.ts` — a date derivation, not inventory maths) over the compound
    list, which **reuses the Home `TodaysCycleCard` row treatment in a non-logging mode**
    (category groups; name + dose · cadence · next site; tap → edit). **Add** reuses the
    existing `AddToStackMenu` flow; **edit** reuses `AddCompoundSheet`; both write
    `protocol_compounds` via the store's dual-write, so they also appear on Home.
  - **Cycle builder** (`CycleEditSheet.tsx`): name + start date + length (weeks) → derives
    `ended_on`, writes via `ensureActiveCycle`/`updateCycle`. Bottom sheet, Save/Cancel;
    the form is keyed + mounted-on-open so it seeds via `useState` initializers (no
    setState-in-effect). Verified the cycle update (name/started_on/ended_on, 12wk → 84d)
    against the live schema, rolled back.
  - **Cycle goals — prototyped then REMOVED (2026-06-17, Adrian's call).** A goals
    feature (focus / target weight / body-fat % / notes on the cycle, with a Plan Goals
    card + the `cycle_goals` migration) was built, then **fully deleted** — Adrian decided
    goals belong in the **Progress** section (where you see how close you are to them), not
    Protocol. The migration was reverted (goal columns dropped, the `cycle_goals` record
    removed — DB clean), `lib/protocol/goals.ts` + all goal UI/types removed, no trace left.
    Revisit goals in Progress in a later version.
  - **Guardrails honoured:** one bottom tab (no new nav entry); the dose-plan is labelled
    **"Plan"/"Cycle"**, never "protocol"; Obsidian tokens + `CARD_TITLE`/`CARD_ICON_BADGE`,
    no hardcoded hex; amber only for active/interactive (the week marker, the Add pill); no
    inventory/runway maths in TS. **Test surfaces:** **`/preview/protocol`** (mock data, no
    sign-in — open and look) + the real `/protocol` signed in (+ `/preview/protocol-test` to
    drive the underlying data). **Next: Step 5 — Stock view + "stock left" runway.**

- **Protocol Cutover STEPS 2 + 3 — migration + Home flip onto Postgres (2026-06-17,
  Adrian + Claude) — `tsc`+`lint`+prod `build` clean (31 routes); live-schema
  round-trips MCP-verified (rolled back, 0 rows); ▶ Adrian's on-device QA pending;
  NOT committed.** Continues `Context/Feature Specs/11-protocol-page.md`. Adrian
  approved two design calls up front (the spec vs. schema/scope conflicts): **(Q1)
  add rotation columns** to `protocol_compounds`; **(Q2) catalogue-only migration**,
  customs stay device-local and Home merges them.
  - **Schema delta (applied live):** `protocol_compound_rotation` migration adds
    `protocol_compounds.rotation_sites text[]` + `rotation_index smallint`
    (`supabase/protocol/001_*.sql`) — the base schema had nowhere for the rotation
    plan. Additive; verified it accepts the granular local site ids. Still 23 tables.
  - **STEP 2 — migration (`lib/migration/migrateDeviceState.ts`):** one-time,
    **idempotent**, marker-guarded backfill of the device stack + dose logs (local ∪
    the jsonb mirror) into `cycles → protocol_compounds → dose_logs`. Catalogue
    compounds only; a name that doesn't resolve in the read-only `compounds`
    catalogue is a custom compound → counted `skippedCustom`, left device-local
    (v1.5). Writes through the same `protocolSync` actions the flip uses, so ids +
    catalogue resolution live in ONE place.
  - **STEP 3 — Home flip (no component changes — identical UX by construction):**
    the device stores became a **cache over Postgres**. `lib/home/protocolSync.ts`
    (`"use server"`) is the single adapter — resolves catalogue name⇄`compounds.id`,
    derives the stable `protocol_compounds.id` (the client uuid when valid, else a
    deterministic SHA-256 hash — handles the insecure-context `s_…`/`c_…` fallback
    ids), and provides pull (joined to the catalogue for name/category) + the
    push/archive/delete/dose-log writes. `lib/home/stack.ts` + `doseLog.ts` mutators
    now **dual-write** Postgres alongside the existing jsonb mirror;
    `components/home/useCloudHydration.ts` runs the migration once then **hydrates
    from Postgres**, merging device-local customs so nothing disappears. Rotation
    advances persist to `rotation_index`; per-dose site → the coarse
    `injection_site` enum (granular plan kept in `rotation_sites`).
    `HomeScreen`/`TodaysCycleCard`/`AddCompoundSheet` are **untouched** (they still
    call `upsertStack`/`logDose`/… — only the stores' backing changed).
  - **Offline-first preserved:** reads from the cache; writes optimistic + dual-written;
    a reconnect/focus re-sync re-pushes anything written offline (idempotent); a
    failed/empty pull never wipes the cache. `inventory_item_id` stays null (Step 5).
  - **Verified:** `tsc`+`lint`+prod `build` clean. MCP round-trips (rolled back, 0
    rows persisted) confirmed: the rotation columns accept granular site ids; the
    **pull join** returns name/category + schedule + `rotation_sites`/`rotation_index`
    + the dose-log site in exactly the shape the mappers expect; all three cadence
    mappings + the schedule CHECKs hold. Model tables are still **empty (0 real
    rows)**. The `/preview/db-sync` harness gained a **"Run migration"** button.
  - **Test surface (Adrian asked for one before pushing):** new dev page
    **`/preview/protocol-test`** (404 in prod; throwaway) shows the device-local cache
    vs. Postgres SIDE BY SIDE and drives the real store mutators — Add / Log / Archive /
    Delete / Run migration / **Clear local → Hydrate** (proves Postgres is canonical) /
    add a Custom (stays local-only). The hydrate logic was extracted to
    `lib/home/hydrateProtocol.ts` (shared by `useCloudHydration` + the test page).
  - **Pending Adrian's on-device QA** (the one thing MCP can't prove — browser
    behaviour): via `/preview/protocol-test` + the real `/dashboard` — Home looks/behaves
    identically, reads come from Postgres, add/log/archive write
    `protocol_compounds`/`dose_logs`, rotation persists, customs still show, works
    offline + syncs on reconnect. **Nothing pushed yet** (Adrian: test first).
    `architecture.md` storage model updated (Postgres now canonical). **Next: Step 4
    needs Angus's OK (consolidating Cycles + My Protocol into one tab — a deliberate
    change from Spec 11).**

- **Protocol Cutover STEP 1 — Postgres data-access + offline sync layer (2026-06-17,
  Adrian + Claude) — `tsc`+`lint`+prod `build` clean (31 routes); live-schema
  round-trip MCP-verified (rolled back); ▶ Adrian's on-device QA pending; NOT yet
  committed.** First step of `Context/Feature Specs/11-protocol-page.md` (the 5-step
  cutover from the interim device-local stores to the canonical
  `cycles → protocol_compounds → dose_logs` Postgres model). Step 1 is **pure backend —
  no screen, component, route, or nav entry changed**; the live `localStorage` stores
  (`lib/home/stack.ts` / `doseLog.ts`) and the jsonb mirror tables
  (`supabase/home/*`) are **untouched** and remain the source of truth until the Home
  flip (Step 3). New files only:
  - **Data access (`lib/db/`)** — `cycles.ts` (`ensureActiveCycle()` → returns the
    active cycle or creates a `"Current"` one; `getActiveCycle` / `updateCycle`),
    `protocolCompounds.ts` (list / upsert / archive-via-`is_active` / hard-delete),
    `doseLogs.ts` (list / upsert / delete). All are `"use server"` actions on the
    **cookie-bound server client** (publishable key, RLS the only gate, **never** the
    service role) — identity ALWAYS from the verified session, mirroring
    `lib/home/syncActions.ts`. Writes **upsert on the client-generated `id`** so an
    offline re-flush is idempotent. `inventory_item_id` left null (Step 5).
  - **Types + mapping (`lib/db/types.ts`)** — `Cycle` / `ProtocolCompound` / `DoseLog`
    rows + insert payloads mirroring `trackd_schema_v0_4_2.sql` exactly, plus the
    local→Postgres mapping **defined here, applied in Step 2**: `cadenceToSchedule`
    (`daily`→`every_day`; `everyOtherDay`→`every_n_days` interval 2; `everyNDays(n)`→
    interval n; `daysOfWeek`→`specific_days`), and `localDowToIso` (0=Sun → ISO Mon=1…
    Sun=7) with its inverse. Catalogue `compound_id` resolution + the local site-id →
    `injection_site` enum map are flagged as Step 2 work (the migration resolves them).
  - **Offline-first cache (`lib/sync/cache.ts`)** — a SEPARATE `useSyncExternalStore`
    store under new keys (`trackd.dbcache.v1.<uid>`), holding the Postgres-model
    snapshot + an **outbox** of pending writes. Optimistic mutators apply to the cache
    instantly and queue an op; `applyServerSnapshot` reconciles a pull then re-applies
    any un-flushed ops on top (last-write-wins, local edits ahead of the server win
    until they flush). Split out of `syncEngine.ts` per "one concern, one file".
  - **Sync engine (`lib/sync/syncEngine.ts`)** — `flush` (drain the outbox to
    Postgres, drop confirmed ops, leave failures queued), `pull` (read active cycle +
    compounds + dose logs, reconcile; a null/empty read NEVER wipes the cache),
    `reconcile` (flush+pull), and `startSync` (initial reconcile + re-sync on `online`
    / `focus` / `visibilitychange`). Wired to nothing yet — the Home flip (Step 3)
    mounts it.
  - **Verification:** `tsc`+`lint`+prod `build` all clean. A **transactional MCP
    round-trip (rolled back, 0 rows persisted)** confirmed every column name, enum
    value, and CHECK against the live schema — the `"Current"` cycle, all three cadence
    mappings (`every_day` / `specific_days` with ISO `days_of_week {1,3,5}` /
    `every_n_days` interval 2), and a `dose_log` (`taken`, `injection_site`, null
    `inventory_item_id`). The model tables are currently **empty (0 rows)** — no real
    user data exists in them yet. A **dev-only `/preview/db-sync` harness**
    (404 in prod, throwaway — **remove before the Step 3 flip**) lets Adrian run the
    live round-trip + an offline→online sync while signed in locally.
  - **Honest caveats:** RLS scoping is structurally guaranteed by the existing
    `(SELECT auth.uid()) = user_id` policies (verified previously with two accounts) +
    the no-service-role server client; the MCP round-trip runs as the service role so
    it proves schema correctness, not RLS. The live **offline→online browser sync**
    (airplane-mode toggle) is pending Adrian's on-device QA via the harness.
    `architecture.md`'s storage model still describes localStorage as canonical (true
    until Step 3) — it gets updated at the flip.

- **Founder waitlist dashboard `/admin` + founder-read policy — LIVE (2026-06-17, Angus + Claude).**
  Private **`/admin`** (founder-only) shows total signups, a **by-channel leaderboard**, and recent
  signups. **Double-gated:** the page only renders data for a founder, and a founder-scoped SELECT
  RLS policy + a `security_invoker` `v_waitlist_by_source` view
  (`supabase/waitlist/002_founder_read.sql`, **applied + verified live**) return rows ONLY to
  `admin@trackdco.app` + `adrianschimizzi1@gmail.com` (anon still denied — confirmed via a live
  401/42501 check). Founder list in `lib/admin.ts` (keep in sync with the SQL). `/admin` is
  **self-contained on desktop** — exempt from the phone-only gate, and when logged-out it renders
  its OWN Google sign-in returning to `/admin` (instead of bouncing to the phone-only `/login`, which
  was the desktop bug); `GoogleSignInButton` gained an optional `next` prop (→ `/auth/callback?next=`).
  The waitlist `001` table was also applied + verified (a live anon insert returned 201). Channel
  tracking = share `/waitlist?ref=<channel>` then read the `/admin` leaderboard (or
  `select source, count(*) … group by source`). Deployed `daf6495` → `8f947cb`.

- **Public waitlist shipped — `/waitlist` LIVE on prod (2026-06-17, Angus + Claude).**
  Public pre-launch email capture (Angus is promoting it hard). New `app/waitlist/` page —
  responsive (works on mobile AND desktop; **exempt from the phone-only desktop gate**, since
  promoted social traffic is heavily desktop) — plus a `waitlist` table
  (`supabase/waitlist/001_waitlist.sql`). **Anon INSERT-only by RLS + GRANT; no SELECT for
  anyone**, so the email list can't be read or enumerated via the Data API (admin reads it in
  the Supabase dashboard; no service key exists). Case-insensitive dedupe (re-signup =
  idempotent success), honeypot + email validation, **`?ref=` source tracking**, and a dynamic
  **OG image** (`opengraph-image.tsx`) so shared links unfurl. Built via a 4-dimension
  adversarial review (8 raw → 5 verified; 3 fixed: array-safe `searchParams`, `role=status`
  success announcement, the OG card). The 2 contrast findings are the app-wide muted/subtle
  token issue (a one-token `globals.css` nudge — Adrian's call), not changed here. Rebased
  onto Adrian's `main`; deployed READY (`8e7c857`). **⚠ Manual step: apply the table SQL in
  the Supabase SQL editor before promoting** (the DB-migration MCP was down this session) —
  until then submissions error. **Decision (Angus): home page unchanged; waitlist at `/waitlist`.**

- **Dead/vestigial-UI cleanup (2026-06-17) — `tsc`+`lint` clean; ▶ Adrian's
  on-device QA pending; NOT yet committed.** Founder-requested audit of UI that
  exists "for the sake of it." Three findings actioned per Adrian's calls:
  (1) **Permanent compound delete moved to Archive-only.** Removed "Delete
  permanently" + its two-step confirm from the everyday `CompoundDetailSheet`
  (the Home compound sheet now only edits / "Stop logging" — reversible). The
  hard-delete now lives solely on the Archive screen (`ArchiveManager`): each
  *archived* row gets a trash affordance behind the same two-step "Continue →
  Delete forever" confirm; so a compound must be archived before it can be erased.
  Dropped the now-unused `onDelete` prop + `removeFromStack`/`removeCompoundLogs`
  imports from `HomeScreen`; updated the Archive page copy ("No hard-delete here"
  was stale). (2) **Deleted orphaned `PlaceholderActionSheet`** (a "Coming soon"
  stub no tile triggered) + its `placeholder` action type, `setPlaceholder`
  state, and the dead `RECONSTITUTION_WARNING`/`warning` field in
  `shortcutItems.ts` (the real `ReconCalculatorSheet` carries its own disclaimer).
  (3) **Protocol tab kept as-is** — it's a deliberate WIP stub ("lives here soon"),
  build pending (see `Context/Feature Specs/11-protocol-page.md`).
- **Catalogue expansion — 56 common compounds added (2026-06-17) — `tsc`+`lint`
  clean; ▶ Adrian's on-device QA pending; NOT yet committed.** Founder-requested
  fill of common gaps (Adrian: "add all that"). Catalogue **149 → 205**.
  - **Peptides (20):** GHK-Cu, KPV, Thymosin Alpha-1, MOTS-c, NAD+ (+IM), Selank
    (+nasal), Semax (+nasal), DSIP, IGF-1 DES, MGF, PEG-MGF, SS-31 (Elamipretide),
    LL-37, Kisspeptin, Cerebrolysin (IM), Melanotan I, Cagrilintide, Liraglutide
    (aka Saxenda), Survodutide, Mazdutide. (NAD+/Cerebrolysin filed under `peptide`
    per the existing research-compound convention, e.g. 5-Amino-1MQ.)
  - **Ancillaries (7):** Tadalafil (aka Cialis), Sildenafil (aka Viagra),
    Telmisartan, Isotretinoin (aka Accutane), hMG (+IM), Bromocriptine, Metformin.
  - **Thyroid (1):** Natural Desiccated Thyroid (aka Armour Thyroid).
  - **Stimulants (4):** Modafinil, Armodafinil, Phentermine, Synephrine.
  - **SARMs (4):** RAD-150, LGD-3303, ACP-105, GW-0742.
  - **Supplements (20):** Turkesterone, Ecdysterone, DHEA, Pregnenolone, D-Aspartic
    Acid, Shilajit, NMN, NR, Spermidine, Fisetin, Apigenin, Red Yeast Rice, Hawthorn
    Berry, 5-HTP, GABA, Lion's Mane, Cordyceps, L-Arginine, Agmatine, HMB.
  - All carry aliases for search; brand-dominant ones got `commonName` "aka" chips
    (Cialis/Viagra/Accutane/Saxenda/Armour Thyroid). Regenerated both catalogues.
    More to come — Adrian flagged he may add further compounds.

- **Swipeable Home week strip — 3-panel carousel (2026-06-17) — `tsc`+`lint`
  clean; ▶ Adrian's on-device QA pending; NOT yet committed.** Founder-requested:
  swipe the Home dashboard's day-of-week strip across weeks, smoothly.
  - `components/home/WeekStrip.tsx` is now a **3-panel carousel** ([prev · current ·
    next], track `translateX`-centred at -100%). Dragging follows the finger; past a
    threshold (max(40px, 20% of width)) the track **slides** to the neighbour
    (280ms ease), and on `transitionend` it commits the week + re-centres with no
    transition — seamless, since the panel slid into view IS the new centre. Replaces
    the earlier instant "cut". Props: `weekOffset`, `daysForOffset`, `onSwipeWeek`.
    A swipe suppresses the trailing click (capture-phase) so a drag never selects a
    day; `touch-action: pan-y` keeps vertical scroll; side panels are `aria-hidden` +
    `tabIndex=-1`.
  - **Unlimited weeks in BOTH directions** (Adrian: like MacroFactor) — only the
    three neighbours ever render, so back/forward are unbounded; no future-cap.
    `components/home/HomeScreen.tsx` exposes `daysForOffset(offset)` (useCallback) and
    commits via `handleWeekChange(absoluteOffset)`. Adherence dots recompute for any
    week from `statusOf` (stack + dose logs) — no stored week data. Selection is
    unchanged on swipe (a peek).
  - **"Jump to this week" now slides too** (no more cut). The caption (week range +
    button) moved INTO `WeekStrip`; the button animates a one-panel slide toward week
    0 with **this week rendered in the incoming neighbour** (`overrideLeft/Right` on
    the `Slide` state), so even a multi-week jump lands in one clean slide, then
    re-centres + reselects today. Commit callback is now absolute (`onWeekChange`).
  - **The caption itself fades + slides in** when you leave the current week, and its
    **animated row height pushes the content below smoothly down** (kept mounted; a
    `grid-template-rows` 0fr↔1fr transition + inner opacity/translate-y, 300ms ease).
    Collapses the same way on return.

- **"Also known as" in compound search + alias audit (2026-06-16) — `tsc`+`lint`
  clean; ▶ Adrian's on-device QA pending; NOT yet committed.** Founder-requested:
  surface a compound's nicknames so someone who searches a nickname (e.g. "Anavar")
  can confirm they found the right entry (Oxandrolone).
  - **Display (Adrian's chosen style: amber "aka" chip):** search-result rows in the
    Add-to-Stack menu show a small **amber pill beside the compound name reading
    "aka &lt;commonName&gt;"** (e.g. Oxandrolone → `aka Anavar`), via a `query` prop
    threaded through `CompoundList`→`RowMain` in
    `components/navigation/add-to-stack-menu.tsx`. **The chip shows ONLY for the
    curated `commonName` subset** — compounds whose listed scientific name isn't the
    name people use (~25 of them: Anavar, EQ, Primobolan, Masteron, Nolvadex,
    Arimidex, Ozempic, Mounjaro, Deca, NPP, …). Compounds whose listed name is already
    the known one (Test E, BPC-157, Creatine, T3/T4, SARMs, the blends) show no chip.
    `commonName` is a new curated CSV column → `Compound.commonName?`. Amber is a UI
    accent (not health-data semantics); chip only in search, not the browse lists.
    (Evolution: dim line → chip-on-every-alias → curated "aka" chip, per Adrian.)
  - **Alias audit (two passes):** the aliases were already comprehensive (every
    anabolic/SARM/peptide/AI/SERM better known by a brand/street name already carried
    it — Anavar, EQ, Primo, Nolvadex, Ozempic, …); the original complaint was a
    **display** gap, not missing data. Filled the genuine gaps found:
    Salbutamol→+Ventolin, Nandrolone Decanoate→+"Deca Durabolin", Yohimbine→+Yohimbe,
    and a second pass adding Testoviron (Test E), Depo-Testosterone (Test C),
    Durabolin (NPP), Anapolon (Anadrol), Endurobol (Cardarine),
    Genotropin/Norditropin/Jintropin (HGH), Vyleesi (PT-141), Tiromel (T3), Eltroxin
    (T4), Cyanocobalamin (B12). Regenerated both catalogues.

- **Pre-blended peptide stacks added to the catalogue (2026-06-16) — `tsc`+`lint`
  clean; ▶ Adrian's on-device QA pending; NOT yet committed.** Added the four
  genuinely-sold, single-vial pre-blended peptide stacks as **single combined
  catalogue entries** (Adrian's chosen representation — one entry, tracked like any
  other peptide; no dose/half-life suggested, since the product ships pre-blended):
  **CJC-1295 + Ipamorelin**, **Wolverine (BPC-157 + TB-500)**, **Glow (BPC-157 +
  TB-500 + GHK-Cu)**, **KLOW (BPC-157 + TB-500 + GHK-Cu + KPV)** — all `peptide ·
  mcg · subq · reconstituted`, with aliases for search (e.g. "Glow", "Wolverine",
  "KLOW", "CJC/Ipa"). Note: **"Glow" is the peptide blend (BPC/TB-500/GHK-Cu)**, NOT
  the GAC vitamin shot. GHK-Cu / KPV are NOT added as standalone compounds (a single
  entry doesn't decompose) — left for a possible Task-5 addition. Deliberately
  excluded invented "protocols" (classic bulk, lean gains, PCT, etc.) and
  user-mixed combos with no commercial pre-blend evidence. Catalogue **145 → 149**.
  Regenerated `lib/compounds-catalogue.ts` + `supabase/seed/002_seed_catalogues.sql`.

- **Multi-route compounds + route picker + Glutathione subQ + SubQ glute sites
  (2026-06-16) — `tsc`+`lint` clean; ▶ Adrian's on-device QA pending; NOT yet
  committed.** Founder-requested catalogue/Add-flow work:
  - **Glutathione is now subQ-injectable** (default **SubQ / reconstituted**, with
    **Oral / tabs** as the alternate) — was oral-only.
  - **SubQ injection list gained Glute – Right / Left** (`sq-glute-r/l` in
    `lib/home/siteCatalog.ts`) — plenty of subcutaneous fat on the glutes.
  - **Multi-route model + route picker.** New `RouteForm` + optional `routes[]` on
    `Compound` (`lib/compound-categories.ts` + `routesOf` helper); the CSV gained an
    optional `alt_routes` column (`route:inventory_type`, `|`-separated) parsed by
    `build-compounds-data.mjs`. `AddCompoundSheet` shows a **Route** picker when a
    compound has >1 route; switching route resets the site rotation. Single-route
    compounds are unchanged (locked). **Route is no longer always fixed** — updates
    the old "user does NOT choose route" note in `lib/home/stack.ts`.
  - **Catalogue rollout (Adrian: "A + small B"):** consolidated the 4 clean split
    entries into single multi-route compounds — **BPC-157** (subQ/oral),
    **Semaglutide** (subQ/oral), **Melanotan II** (subQ/nasal), **PT-141**
    (subQ/nasal); **kept Stanozolol and Testosterone Undecanoate split** (oral vs
    injectable half-lives genuinely differ, which the per-route model doesn't carry).
    Added routes: **Test esters (Enan/Cyp/Prop/PhenylProp) + Sustanon → SubQ**,
    **HCG → IM**, **Vitamin B12 → IM/SubQ**, **Vitamin C & L-Carnitine → SubQ**
    (last two for the Glow stack). Catalogue now **145 compounds** (was 149).
    Regenerated `lib/compounds-catalogue.ts` + `supabase/seed/002_seed_catalogues.sql`;
    re-seeding the live DB is a separate manual step (the `routes[]` data lives only
    in the bundled app catalogue, not the DB `compounds` table).

- **Calendar photos + Home photo size + plus-menu Calendar (2026-06-13 follow-up)
  — `tsc`+`lint`+prod `build` clean; COMMITTED + MERGED + PUSHED to `main` (prod)
  per Adrian.** Three founder-requested tweaks after the Calendar landed:
  - **Calendar Photos row now shows the day's progress photos.** Was a reserved/
    empty stub; the calendar page now fetches + signs `progress_photos` (grouped by
    day, same pattern as Progress/Home) and `DayDetailSheet` renders that day's
    thumbnails as a deep-link to the photo gallery on `/progress` (new
    `photos-gallery` progress-action, handled by `ProgressPhotoSection`). A day
    with a photo now also counts as "logged" with a camera icon under it.
  - **Home progress-photo card made smaller.** `ProgressPhotoCard` /
    `ProgressPhotoSection` gained a `compact` flag (Home passes it) that caps the
    photo at `h-56` instead of the full `aspect-[3/4]`; Progress keeps the big size.
  - **Plus-menu "Calendar" tile now routes to `/calendar`** (was the placeholder)
    — `shortcutItems` Calendar → `action: "route"`, `href: "/calendar"`. (The Home
    header calendar icon already went there.) Placeholder machinery retained, unused.
  - Preview harnesses (`/preview/calendar`, `/preview/home`) given mock photos so
    both are reviewable. Verified headlessly at 390 px.

- **Calendar screen built + Milligram redesign — Spec 10 (2026-06-13) —
  `tsc`+`lint`+prod `build` clean (27 routes); COMMITTED + MERGED + PUSHED to
  `main` (prod) per Adrian (branch `feat/calendar-screen`; no PR — `gh` unavailable,
  direct-merge fallback). ▶ Adrian's on-device QA still to come.** The `/calendar`
  route went from the "Coming
  soon" placeholder to the real **date-first "look back"**. Built first to spec
  (month grid + muted dots + day sheet), then **redesigned to the Milligram format
  at Adrian's direction** (he supplied the reference + "switch between things at
  the top right"). New files under `components/calendar/` (`CalendarScreen` ·
  `MonthGrid` · `MonthYearPicker` · `AgendaList` · `DayDetailSheet` · `LegendSheet`)
  + `lib/calendar/calendar.ts` (pure date helpers + the ring-status model); server
  data fetch in `app/(app)/calendar/page.tsx`; dev harness `/preview/calendar`
  (404 in prod) verified headlessly at 390 px (month grid, picker, agenda, legend).
  - **Entry point:** kept the **existing Dashboard-header calendar icon** (no
    change to the Progress header, no sixth nav tab) — Adrian's call over the
    spec's proposed Progress-header icon.
  - **Top-right corner:** a Month ⇄ Agenda switcher (and an agenda list) was built
    then **removed at Adrian's direction** ("doesn't do much") — the corner is now
    clean, just the month grid. A per-compound **filter** was prototyped + parked
    (re-addable in one step). The per-compound "Protocol"/concentration view from
    the Milligram flow stays deferred to its own spec. (`AgendaList.tsx` +
    `CompoundFilter.tsx` deleted.)
  - **Month grid = adherence RINGS** (the Milligram "Calendar key"): filled white
    disc = **logged** (a dose / journal / weight + a tiny type icon — syringe /
    pen / scale), dotted ring = **scheduled-unlogged** (past missed + upcoming),
    regular stroke = **no dose that day** (past/rest), faint stroke = **nothing
    scheduled** (future / pre-protocol). Selected day amber (the ONLY amber);
    Mon-first; out-of-month dimmed. Scheduled-or-not derives from the device
    stack's cadence (`isDueOn`); stays health-data-neutral (white/stroke, never
    green/red). A **"June 2026 ⌄" month/year picker** (year stepper + month grid)
    replaces chevrons; footer has **Today** + an **ⓘ** → the **Calendar key**
    legend sheet.
  - **Day detail sheet:** reuses the app bottom-sheet primitive (`Sheet` +
    `useSheetDrag` + drag handle); rows in order **Running → Weight → Markers →
    Journal → Photos**. **Read-only** — Weight deep-links to `/weight`, Journal
    deep-links to **that day's entry editor** on `/progress`; the Calendar itself
    creates/edits nothing. **Photos** is a reserved/empty stub (no photo content,
    source, upload, or storage wired — pending the storage decision).
  - **Deep-link wiring:** a small **additive** extension to the existing
    `lib/progress/progressAction` signal — a new `journal-open` action that carries
    the day, handled by `JournalSection` to open that date's entry (mirrors tapping
    it in the feed). `useProgressAction`'s callback now receives the signal so
    handlers can read `signal.date`; existing `journal-compose` / `bloodwork-gallery`
    callers are unaffected.
  - **Data — real, user-scoped, read-only, no schema/mock:** the server page reads
    weight (`weight_logs`) + journal/markers (`journal_entries` → `marker_readings`
    → `user_markers` → `markers`, the same stitch the Progress page uses) keyed by
    day (RLS scopes to the user); `CalendarScreen` adds the **device-local** dose-log
    read (`lib/home/doseLog` + `stack`) for "Running" + the active band, gated on
    mount so SSR stays deterministic. No tables created or altered.
  - **Two spec FLAGS reconciled (Spec 10 says "FLAG, don't guess"):** (1) the spec
    proposed a Progress-header entry point, but one already existed on the Dashboard
    header → kept the Dashboard one (Adrian). (2) The spec's "Running" row wants
    cycle/compound **date-ranges**, but the cycles/`protocol_compounds` model isn't
    wired — the only schedule data is the device stack's per-compound start date +
    cadence (**no end date**) → per Adrian's call, "Running" shows **only what was
    actually logged that day**, and a day is "active" iff a dose was logged on it.
    Revisit to use true date-ranges once the normalised cycles model lands.

- **Weight graph load-in + weight-log by month, Profile load-in, Home photos
  unified, mobile padding pass (2026-06-13) — `tsc` clean; on the working tree,
  NOT yet committed (awaiting Adrian's on-device review).** A founder-directed
  follow-up to the 2026-06-13 polish run:
  - **Weight graph loads in.** The `/weight` Trend/Scale chart now uses the same
    entrance animation as Consistency (`isAnimationActive`, 450 ms ease-out) and
    re-animates on a range change (`key={rangeId}`); the Trend↔Scale opacity
    crossfade is preserved (`components/weight/WeightView.tsx`).
  - **Weight entry log by month.** The flat log is now stacked **month sections**
    ("June 2026" headers, newest first), scrolled — the journal idiom *without* a
    dropdown (per Adrian: "just the months… scroll down to see more").
  - **Profile loads in like the others.** `app/(app)/profile/page.tsx` swapped its
    single whole-page fade for per-section staggered `animate-home-up`, matching
    Home + Progress.
  - **Home progress-photos = the real menu.** Home now renders the SAME
    `ProgressPhotoSection` as the Progress tab (card → gallery → add / edit / view /
    compare) inline, replacing the peek-card that routed to `/progress` — removes
    the navigate-then-hunt friction. `ProgressPhotosGlanceCard` is now unused.
  - **Mobile padding/overflow pass.** Background audit across `app/` + `components/`;
    fixed real right-edge spill where dynamic text sat beside a control by adding
    `min-w-0`/`flex-1`/`truncate`/`shrink-0`: Weight graph header (value vs
    Trend/Scale toggle), Progress-photo caption (long custom poses), marker rows,
    recon-calc input vs unit toggle, Home Weight glance header, Journal month rows,
    Profile "Edit in Settings" link. LogDoseSheet + the photo viewer were already
    guarded (no change).
- **UI-consistency pass + Home photo peek + journal-by-month + unified graphs +
  wired `+`-menu Journal/Blood work (2026-06-13) — `tsc`+`lint`+prod `build` clean
  (27 routes); committed + merged + pushed to `main` (prod). ▶ Adrian QAs on-device.**
  A founder-directed polish run across Home + Progress:
  - **One card system.** New shared presets in `lib/ui-presets.ts` — `CARD_TITLE`
    (display **serif**, white, matching Today's Log + the greeting) and
    `CARD_ICON_BADGE` (the **amber** icon badge). Every section/glance-card title
    (Today's Log, Weight, Progress photos, Bloodwork, Journal, Consistency,
    Reconstitution Calculator) now uses `CARD_TITLE`; every card icon uses the amber
    badge — the Reconstitution Calculator's white circle → amber, and Consistency
    **gained** an amber `Activity` icon. `ui-context.md` updated (title rule + icon
    rule + a new **Charts** section). Profile deliberately left as-is (Adrian's call).
  - **Home progress-photos peek.** New `ProgressPhotosGlanceCard` — a small,
    non-expandable thumbnail strip of the latest session, under the Weight card,
    tapping through to `/progress`. **Kept separate from Weight (not merged)** per
    Adrian. The dashboard page now fetches + signs the latest 12 photos and threads
    them in; empty state is a gentle "add your first photo" prompt. The Weight card
    is unchanged everywhere (incl. Progress).
  - **Weight in the Add-photos flow.** `AddProgressPhotoSheet` gained an optional
    **Weight** field that logs to `weight_logs` for the session's date (mirrors the
    weight quick-log's attach-photos). `unit` threaded via `ProgressPhotoSection`.
  - **Journal feed by month.** `JournalFeedSheet` groups entries under **month
    headings** with an on-brand **month dropdown** filter (`groupJournalByMonth` +
    `formatMonthLabel` added to `lib/progress/journal.ts`).
  - **Unified graphs.** Consistency converted from a **bar chart → a line + downward
    gradient fill** (thick→thin); on a **rest day the line holds flat at the previous
    day's value** (carry-forward, not an interpolated slope) while the scrubber still
    reads "Rest day". The Weight trend fill switched to the same gradient so both
    graphs match. Convention recorded in `ui-context.md` → Charts.
  - **`+`-menu Journal + Blood work wired to the real flows.** They were placeholders;
    now tapping **Journal** goes to Progress and opens the journal compose (Write /
    Markers branch expanded → saves to the journal), and **Blood work** opens the
    bloodwork gallery (view recent + add). Done via a tiny client signal
    (`lib/progress/progressAction.ts` + `useProgressAction`) so the global nav reuses
    the Progress screen's own data/flows instead of duplicating fetches; only
    **Calendar** still uses the placeholder. No schema/token/dependency changes.

- **Weight glance card — on-card Trend/Scale toggle + crossfade (2026-06-13).**
  The shared `WeightGlanceCard` (used on both Home and Progress) gained a **Trend /
  Scale** toggle right on the card that opacity-**crossfades** the value, delta, and
  sparkline between the smoothed trend and the raw scale (matching the full
  `/weight` view). Restructured to a header (label + toggle) over a tappable
  content row so the toggle doesn't fire the navigate-to-`/weight`. `tsc` + `lint`
  + prod `build` clean.

- **Progress tab built end-to-end (Spec 09 + founder-directed evolutions)
  (2026-06-13).** The whole Progress screen — a single vertical scroll on the
  Obsidian canvas, wired to real per-user Supabase data — built section by section
  with Adrian over many rounds. Order top → bottom: **Title → Weight (hero) →
  Progress photos → Bloodwork → Journal → Consistency** (photos sit under Weight
  by Adrian's call). All in `components/progress/` + `lib/progress/*`, fetched in
  `app/(app)/progress/page.tsx`, with server actions in
  `app/(app)/progress/actions.ts`; a dev-only `/preview/progress` (sample data,
  404 in prod) was the build harness throughout.
  - **Weight (hero):** reuses the existing `WeightGlanceCard` (current + trend +
    sparkline) as a summary that taps into the one canonical `/weight` view — no
    second weight view (Adrian's pick over embedding the full graph). Gained an
    amber **Scale badge** to match the other cards (also shows on Home — approved).
  - **Bloodwork → a dated PHOTO store (pivoted from a structured catalogue/charts
    build).** Attach a screenshot + optional **note** + date → uploads to the
    private `bloodwork` bucket, recorded as a `lab_panels` row (`source_file_path`
    + `notes` + `drawn_on`). Card → gallery → full view + delete. No schema change
    (reused `lab_panels`). The earlier structured version (catalogue search,
    `biomarker_results`, per-metric charts, reference bands, compare) was built
    then **removed** at Adrian's direction.
  - **Journal:** `JournalCard` → feed (one row per day) → "+" branches **Write** /
    **Markers**; the **marker dialer** reads the real `markers` catalogue
    (single-select WORD per marker via a sliding **amber** indicator; presets +
    a searchable "add marker"), stored as the ordinal `tier_value` into
    auto-created `user_markers`; one entry/day (both paths merge, no clobber); read
    /edit/delete in place. No `title` column → dropped. Health-data neutral (amber
    = selection only).
  - **Consistency:** a scrubbable **adherence bar graph** (per-day %, 100% top,
    teal fill matching Weight, 30/90/All range that animates open) computed
    client-side from the device-local stack + dose log (same source Home uses).
    Per-cycle breakdown deferred (no cycles model yet).
  - **Progress photos (NEW feature + NEW DB).** MacroFactor-style: month → day
    rows with circular pose-thumbnails + edit; the card is a swipeable carousel of
    the latest session (Front relaxed first); before/after **compare**; each photo
    shows the **weight logged that day** (linked by date). Poses = 3 defaults
    (Front/Side/Back relaxed) + a **searchable catalogue** of the standard
    bodybuilding poses (each with a hand-drawn silhouette) + custom fallback
    (shared `PosePicker`). **Capture is also embedded in the weight quick-log**
    (+ menu → Weight): attach photos per pose right there, saved dated-today +
    auto-categorised. **DB:** `progress_photos` migration (table + private
    `progress-photos` bucket + RLS + grants), applied live + tracked in
    `supabase/progress/001_progress_photos.sql` → live DB now **23 tables**.
    Adding photos is a **multi-pose session** (Front/Side/Back + more on one page,
    submit together via a batch insert) with an optional **note** about the physique
    (`002_progress_photo_note.sql` adds `progress_photos.note`, shown in the viewer +
    day editor).
  - **Verified:** `tsc` + `eslint` + prod `build` clean (27 routes); every write
    path (bloodwork panel + note, journal entry + markers + word mapping, progress
    photo + custom pose) exercised against the live DB via MCP and rolled back;
    RLS/owner-scoped paths confirmed. **Local dev fix:** the iCloud copy corrupts
    Turbopack's `.next` writes, so `.next` is symlinked to an off-iCloud
    `.next.nosync` (gitignored; eslint-ignored) — and that recurring iCloud
    re-sync resurrected 3 deleted files mid-build (re-deleted).

- **Desktop interstitial — phone-only gate, replaces the plain "mobile only" notice
  (2026-06-12).** At ≥1024px the whole app shell is hidden and a polished
  `DesktopInterstitial` (`components/pwa/desktop-interstitial.tsx`) stands in its place —
  "go to your phone" with a **real, scannable QR** to `https://trackdco.app`
  (`qrcode.react`, the one new dep; SSR-rendered, near-black-on-white, 4-module quiet zone,
  encoded value verified exact). **Global by Adrian's call:** even a signed-in user is sent
  to their phone — they get a separate **"Welcome back"** variant (basic two-column: message
  + QR card, no side cards/feature rows), vs the first-visit variant (eyebrow pill → "Track
  your protocol. / Not your spreadsheets." → 3 feature rows → 3 quiet decorative glass cards
  → glowing amber hero QR card). Decorative cards mirror real Trackd UI: **Weight** (white
  mono value + neutral `--chart-trend` sparkline + muted delta — non-evaluative health-data
  rule, not amber as the brief asked), **Inventory** (Testosterone E vial, "runs dry" date),
  **Today's log** (Testosterone E + amber check circles + streak). Every colour is an
  existing token (amber washes via `/NN` opacity; glow/page-glow/hairline as `color-mix`
  over `--accent-amber`; deep shadow via `--overlay-backdrop`) — flagged at the top of the
  component since no `--accent-amber-soft`/glow/shadow tokens exist yet.
  - **Wiring:** gate is CSS-only (no UA sniffing, no hydration flash). Root layout wraps the
    app in `lg:hidden` and renders the interstitial `hidden lg:flex` via a tiny client
    `DesktopGate` (`components/pwa/desktop-gate.tsx`) that exempts dev-only `/preview/*` (so
    the existing preview harness still renders at desktop). Variant picked from the verified
    session: added a request-`cache()`d **`getCurrentUser`** in `lib/auth.ts` (now the single
    `getUser()` per request — `getSessionContext` reuses it, so no extra auth round-trip;
    mobile cost neutral). Landing page (`app/page.tsx`) lost its old `md` desktop block (the
    global `lg` gate replaces it; tablets 768–1023 now get the app).
  - **Dev preview surfaces:** `/preview/desktop` (first-visit) + `/preview/desktop-returning`
    (welcome-back), 404 in prod. `tsc` + `lint` + prod `build` clean (now 26 routes).
    Verified both variants + the untouched mobile app via headless-Chrome screenshots.
    **▶ Pending: Adrian's phone-scan of the live QR + on-device QA.**

- **Compounds survive reinstall — home stores cloud-backed (2026-06-12).** Fixed
  Adrian's data-loss report (deleting + reinstalling the PWA wiped every compound):
  the three home stores — protocol **stack** (`lib/home/stack.ts`), **dose log**
  (`lib/home/doseLog.ts`), and **custom compounds** (`add-to-stack-menu.tsx`) — were
  **localStorage-only**, which iOS erases with the installed app. Chose the **"quick
  durable save"** approach (Adrian's pick over a full normalised migration): keep
  `localStorage` as the synchronous, offline read path the UI uses unchanged, and
  **mirror every change to Supabase** keyed to the account.
  - **DB (applied live via MCP + committed):** `device_state_sync` migration
    (`supabase/home/001_device_state_sync.sql`) — three user-owned tables
    (`user_stack_compounds`, `user_dose_logs`, `user_custom_compounds`), row-per-entity
    with the verbatim client object in a `jsonb` `data` payload. House pattern: RLS
    `(SELECT auth.uid()) = profile_id`, explicit `authenticated` grants,
    `set_updated_at` trigger, `compound_id text` (client-generated, may be non-UUID).
    Live DB now **22 tables**.
  - **Writes:** best-effort **server actions** in `lib/home/syncActions.ts` (identity
    from the verified session, RLS the backstop — mirrors `weight/actions.ts`), fired
    fire-and-forget from inside the existing store mutators (the single choke-point, so
    no UI call site changes) and alongside each custom-compound save.
  - **Reads / hydration:** `components/home/useCloudHydration.ts` (stack + logs,
    mounted in `HomeScreen`) and the Add-to-Stack menu's open effect (customs) pull the
    cloud copy on load and **union** it with local (cloud wins on conflict; local-only
    entries migrate up so existing users' data lands in the cloud the first time it
    runs), writing the merge back through the stores' `save*` + `notify*` path.
  - **Interim, not the end-state:** this is a faithful lift of the current client shapes
    to durable storage — NOT the normalised `cycles → protocol_compounds → inventory →
    dose_logs` model, which remains the eventual migration (unlocks inventory maths).
  - **Honest caveat:** already-lost compounds are unrecoverable (they only ever lived in
    the wiped `localStorage`); this protects everything from here on.
  - `tsc` + `lint` + prod `build` clean (24 routes). **RLS verified via MCP** with the
    two real accounts: A sees its own row, B sees 0 of A's, cross-tenant insert → 42501;
    test rows rolled back. **▶ Pending Adrian's on-device QA** (add a compound → delete +
    reinstall the PWA → confirm it's restored) and the commit/PR.

- **Dashboard → Calendar shortcut + placeholder route (2026-06-12).** Added a
  calendar icon (Lucide `CalendarDays`) inline to the right of the "Dashboard"
  heading, linking to a new `/calendar` route. `PageScrollTitle` gained an optional
  `action` slot (renders inline-right of the large heading, scrolls away with it;
  compact bar stays a clean centred title) — backward-compatible, only Home passes
  it. `/calendar` (`app/(app)/calendar/page.tsx`) is an honest **"Coming soon"**
  placeholder (serif header + empty-state card + "← Dashboard" back link, on-theme,
  behind the (app) auth gate) until the real month view is built. `tsc` + `eslint`
  clean. **▶ Pending Adrian's QA/sign-off; build the real calendar later.**

- **Home greeting + today's-completion line (2026-06-12).** Added a time-of-day
  greeting ("Good morning/afternoon/evening, {firstName}") with a slim
  today's-completion bar ("N of M logged today") on the Dashboard, sitting **under
  the week strip**, above the Today's Log card (Adrian's placement + "slim bar +
  text" pick). New `components/home/HomeGreeting.tsx`: the part-of-day word reads
  the **device clock** (mounted-gated + focus/visibility/1-min tick, so SSR/UTC
  can't drift and a long session rolls morning→afternoon on its own). Completion
  is **always TODAY** (not the selected day): active stack due today vs how many
  already have a log today, computed in `HomeScreen` and passed down. `firstName`
  comes from Google auth metadata (display-only) in the dashboard server page;
  `preview/home` passes "Adrian". Greeting uses `font-display` serif; the progress
  bar uses `--accent-amber` (active-state accent — a logging-progress read, not
  health data, so on-spec). The bar **slide-fills** on load and re-animates as
  doses are ticked, but is **held while the log sheet is up** (`paused`) so the
  slide isn't wasted behind the green "Tracked" confirmation — it advances ~300ms
  after the sheet drops away, landing as the home screen reappears. `tsc` +
  `eslint` clean. **▶ Pending Adrian's QA/sign-off.**

- **Spec 07 (Weight: Scale/Trend crossfade + last-paragraph asks) — audited & closed
  (2026-06-12).** Read `Context/Feature Specs/07-scale-trend-weight-fix.md` against the
  live code: the spec's **main body was already implemented** (it shipped inside the Spec-08
  Weight view — the file header literally reads "08 → C, + 07"). Verified each "Check When
  Done": the **Scale/Trend opacity crossfade** is animated, not snapped — both `<Area>`
  series + the legend labels carry `transition-opacity duration-300 ease-out`, active =
  `opacity-100`, inactive = `opacity-[0.3]` ([WeightView.tsx:399-436](../components/weight/WeightView.tsx)),
  matching the nav selection fade exactly (`bottom-nav.tsx:50` → `duration-300 ease-out`),
  with no first-paint flash (default `mode="trend"`); the **`xxx.xx` cap** (3 digits + 2
  decimals) is enforced by `sanitizeWeightInput` (`lib/weight.ts`); and the **1W–All
  range selector** already windows by date (clicking 1W after a 3-months-ago log drops the
  old point and shows only the last 7 days). **No code change needed for the crossfade.**
  Resolved the spec's voice-dictated last paragraph with Adrian (2026-06-12 decisions):
  - **Weight limits → keep 30–300 kg** (66–661 lbs; already generous-but-realistic). No change.
  - **+ menu "Track your weight" sheet → leave as-is** (the quick `AddWeightSheet` log;
    graph + range selector stay in the full `/weight` view). No change.
  - **Height limits → tightened 100/110–250 cm → 120–230 cm** (≈ 47–91 in; realistic-but-
    inclusive — keeps little-people adults in range, drops the unrealistic sub-120 floor,
    clears all but extreme-outlier tall). Applied in **three places**: the Settings form
    HTML `min`/`max` (`settings-form.tsx`), the server action validation + error copy
    (`settings/actions.ts`), and a new tracked **DB migration**
    `supabase/profile/002_height_range_120_230.sql` (live `profiles.height_sane` CHECK now
    `120 ≤ height_cm ≤ 230`; pre-checked safe — the 2 live profiles are 188/191 cm, 0
    violations). Settings is the **only** height entry point. `tsc` + `lint` clean. Doc-only
    deltas to the two trackers; not yet committed/PR'd.

- **Weight quick-log popup + home fixes (2026-06-11, branch
  `feat/weight-popup-and-home-fixes`, **PR #5** — committed + pushed; `tsc`+`lint`
  clean (Vercel builds the PR); CodeRabbit's first review addressed. ▶ pending
  Adrian's on-device QA → merge).** Several units on Adrian's direction:
  - **Weight quick-log popup.** The + menu's **Weight tile** now opens a new
    **`AddWeightSheet`** bottom sheet (one unit-aware field → `logWeight()` for
    *today*, the shared `weight_logs` UPSERT) instead of routing to `/weight`.
    Viewing / back-dating / the graph still live in the full `/weight` view, reached
    by tapping the home Weight card (**unchanged** — Adrian: don't change how the home
    looks). The user's `unit` is threaded `(app)/layout.tsx` → `BottomNav` →
    `ShortcutsMenu` → the sheet (one `profiles.units_preference` read in the layout).
    `logWeight`/`deleteWeight` now also `revalidatePath("/dashboard")` so the home
    glance card refreshes after a quick log. The Weight `ShortcutItem` action changed
    `route`→ new `weight`.
  - **Today's Log → a tick-off category checklist.** After iterating (scroll-in-card →
    collapsible category dropdowns, both rejected — Adrian: "I don't like it, I don't
    know why"), a **6-direction design-panel workflow + judge** surfaced the diagnosis:
    the dropdowns *hid* the real doses behind taps and read as empty headers. Final
    design (Adrian picked a **blend of "Dense Ledger" + "Daily Checklist"**): the day is
    a flat **checklist grouped by category** — every dose is one always-visible row, with
    the **name (title) on its own line on top** and `dose · time · next site` (site in
    amber; a dot flags a same-day clash) muted beneath, so the name is never squeezed.
    **The tick is a pure toggle** (Adrian's call): empty ring → tap opens the Log sheet
    to record the dose; filled amber tick → tap **unticks it (removes the log)** — it no
    longer hides an "edit dose". **All edits live in one place**: a **"⋯"** on each row
    (and tapping the name) opens the compound detail (change dose/time/site, archive,
    delete); editing a logged dose's exact recorded value = untick + re-log (no separate
    per-entry edit form). Categories are slim dividers (dot + label + hairline rule +
    amber "N due" / muted "Logged"), not collapsible containers. **Nothing collapses,
    nothing scrolls inside the card** — rows ~half the old height so the protocol stays
    visible and the Weight section keeps its place. `DoseRow` rewritten; `TodaysCycleCard`
    `onEdit` → `onUnlog` (wired to the existing dose-log removal), `onLog`/`onOpenDetail`
    reused; no token/data changes.
  - **Dose-edit split + drag-to-dismiss on the "⋯" sheet.** The row's **"⋯"** (and
    tapping the name) opens `CompoundDetailSheet`, now reframed around Adrian's "edit
    today's dose vs change it going forward" distinction: the **white primary button is
    "Edit today's dose"** → opens the Log sheet for today's entry (edit if logged, fresh
    if not, via a new `onEditTodaysDose` prop), while **"Edit dose & schedule" (going
    forward)** moved into the **More** menu (with Stop logging / Delete; for an archived
    compound the white button is Reactivate instead). Extracted the copy-pasted
    drag-to-dismiss gesture into a shared **`useSheetDrag`** hook and added it to the
    sheets that had a *static* handle — `CompoundDetailSheet`, `ReconCalculatorSheet`,
    `PlaceholderActionSheet`. The full-screen `AddCompoundSheet` stays button-only
    (Cancel/Save) — drag-to-dismiss there would risk losing a half-filled form.
  - **Dose-edit refinements.** Renamed the going-forward menu item **"Edit dose &
    schedule" → "Alter dose & schedule"** (Adrian dislikes "Edit dose"), and added a
    non-alarming **dose-change warning** in the edit form — when the amount or unit
    differs from the original it shows "You're changing your dose to X — applies to
    upcoming doses, already-logged stays as-was" + the standing not-medical-advice
    disclaimer. The home row now shows the **actually-logged amount** once logged (it
    was always the scheduled dose — the "it still says the original dose" bug). (A
    unit-switch on "Edit today's dose" was tried then **removed at Adrian's request** —
    the dose unit there is fixed to the compound's; switching mg↔mcg happens only in
    "Alter dose & schedule".)
  - **Bottom-nav "Home" → "Dashboard" + grid icon.** The first tab is relabelled
    **Dashboard** (matches the screen's `PageScrollTitle` heading) and its icon swapped
    from the house (`Home`) to a four-squares grid (`LayoutGrid`). Route/active logic
    unchanged (still `/dashboard`).
  - **Injection-site conflict drop-up.** Fixed the **no-scroll** bug — `LogDoseSheet`'s
    card was unbounded + `overflow-hidden`, so when the clash notice made the sheet
    taller than the viewport its top scrolled off-screen unreachably; now
    `max-h-[92dvh]` on the content + card with a `flex-1 overflow-y-auto` scroll body
    (same pattern as `ShortcutsMenu`). Also collapsed the free-spot alternates to
    **4 + "See more"** (`FREE_PREVIEW`) so the notice stays short.
  - **Local-midnight rollover.** The dashboard computed "today" **server-side in UTC**
    (`toDateKey(new Date())`), so a user ahead of UTC (AU) saw *yesterday* first thing
    in the morning until a re-render — exactly Adrian's report. `HomeScreen` now seeds
    from the server value (so SSR + first client render match — no hydration drift)
    then re-derives "today" from the **device's local clock**, refreshing on mount, on
    tab focus / visibility (a reopened PWA), and on a 1-min tick (rolls over at local
    midnight while open; only follows the rollover if the user is parked on "today",
    else leaves their selected day). The server `isFuture` weight guard was loosened to
    allow **+1 day** so a user ahead of UTC can log their real "today" (max real offset
    is UTC+14 = one calendar day ahead).
  - **CodeRabbit (PR #5) first-pass fixes.** Numeric dose comparison in the change
    warning (so `100.0` vs `100` doesn't false-fire); the detail sheet's primary button
    reads "Edit today's dose" only when viewing today (else "Edit this dose" — it edits
    the viewed day either way); `useSheetDrag` no longer snaps the card back before
    close (the exit animates from the dragged position; offset resets on open instead,
    so persistent-body sheets don't carry a drag over); and the layout's
    `units_preference` fetch logs on error instead of swallowing it.

- **Home / Profile / Weight fixes + Weight & Avatar backend (Spec 08, 2026-06-10).**
  Implemented `Context/Feature Specs/08` end-to-end, then iterated on Adrian's
  feedback. **Backend (applied live via MCP, additive):** `weight_logs` table
  (`weight_logs_table`; RLS on `profile_id`, grants, one-per-day), private
  `avatars` bucket + owner-scoped policies + `profiles.avatar_path`
  (`avatar_storage`), and `profiles.weight_kg` widened to `numeric(5,2)`
  (`starting_weight_precision`). SQL committed under `supabase/{weight,avatar,profile}/`.
  **Weight (C):** full `/weight` view (log + back-date, Trend/Scale crossfade,
  1W–All range chips, entry log, `xxx.xx`); the home Weight card is now a
  **display-only** glance (latest + sparkline) that taps through to `/weight` —
  logging happens only in the view / the + menu. **Home:** removed all sticky;
  shared **`PageScrollTitle`** preset (large heading → fade-in compact bar,
  portalled so transforms don't trap it) wired into **every bottom-nav tab root**
  (Home/Protocol/Progress/Profile), not sub-pages; log-dose sheet preset-value +
  keypad-on-tap, no overflow, logged-row opacity + flat amber tick; **live-ticking
  time** in both the log-dose AND add-compound flows (evaluated at submit, manual
  edit overrides, clearing resumes); group Today's Log by category; consistency =
  rolling 30-day adherence (past ≠ "Upcoming"). Real **reconstitution calculator**
  (A8, `v_inventory_math` maths) shared by the home card + the + menu. **+ menu
  reworked** to a primary "Log a dose" over a consistent 6-tile grid (Weight tile →
  `/weight`); the old reorder + `lib/shortcutOrder.ts` removed. **Profile:** avatar
  upload (client crop/resize → bucket → signed-URL display), Archive moved to its
  own `/archive` page, sign-out **confirm** on both entry points (deep-red
  `--accent-destructive` token), and the **"Starting weight" concept removed** —
  the Settings weight field is gone; Profile shows **"Weight"** = the latest logged
  reading (syncs with the Weight view). Dead components pruned (WeightCard,
  LogWeightSheet, ArchivedCompounds, ShortcutItem, dashboard/actions). Added
  `.vscode/settings.json` (`mssql.intelliSense.enableErrorChecking:false`) — the
  21 "Problems" were the MS SQL Server extension mis-parsing Postgres, not real
  errors. `tsc` + `lint` + prod `build` clean (23 routes).

- **Home dashboard + per-compound dose tracking, scheduling & site rotation
  (2026-06-10, `feat/home-dashboard` → merged to `main`).** Built the logged-in
  **home screen** and the **core compound-tracking loop** on top of it, all
  device-local (a blank template; migrates to Postgres `protocol_compounds` with
  the cycles feature). Shipped:
  - **Home:** pinned week strip → greeting → **Today's Log** → weight trend card
    (real `body_metrics`, with an empty state) → 30-day consistency →
    reconstitution-calc entry, and a **"get started"** empty state with
    how-it-works until the first compound is added.
  - **Add to log** (opened from the catalogue "+", a new sheet; the protected
    Add-to-Stack browse/search/custom flow stays untouched): method + unit
    **locked to the compound's database values** (a mg/mcg/g dropdown where the
    measurement family allows it, e.g. Tirzepatide); **dose** (capped digits +
    decimals); **schedule** (daily / every other day / every X days / specific
    days with a Done-lock, plus a **start date** that is future-only, a DOB-style
    Day/Month/Year picker, and a time that can't be earlier than now for "today");
    and the **injection-site rotation** (full method catalogue, tap to pick,
    **drag to order**).
  - **Injection-site catalogue** rebuilt from research to medically-appropriate
    sites: **IM** muscle sites (ventroglute/glute/delt/quads + common spot sites)
    and **SubQ** fat sites (lower/side abdomen ≥2in from the navel, flanks, outer
    thigh, back of arm; **no upper stomach**). Oral/nasal have none
    (`lib/home/siteCatalog.ts`).
  - **Logging** persists on-device; each compound's rotation advances
    independently, and the success tick commits on tap (dismissing it can't
    cancel the log). **Same-day site clashes are OBSERVED, not auto-changed**
    (Adrian + Angus's "tracking, not coaching" call): an amber flag + free-
    alternate suggestions for that day + a non-advice disclaimer, plus a
    **"last used here"** rest hint.
  - **Tap a compound → detail sheet** (spread-from-touch glow) with **Edit**
    (reopens the add sheet pre-filled), **Archive** (stops dosing but keeps
    history, reversible — managed from a new **Profile → Archive** menu), and
    **Delete permanently** (two-step confirm). Archive/reactivate carry a
    fade-in confirm.
  - Reusable **amber pop-down notification** (`components/notifications/`); fade +
    spread-from-touch motion throughout; em dashes scrubbed from user-facing copy.
  - **Stores:** `lib/home/stack.ts` (`trackd.stack.v2.<uid>`) and
    `lib/home/doseLog.ts` (`trackd.doselog.v1.<uid>`), both device-local
    `useSyncExternalStore` stores. Dev-only **`/preview/home`** + **`/preview/profile`**
    harnesses (404 in prod). `npm run build` clean (21 routes). Specs:
    `Context/Feature Specs/04`–`07`.

- **Profile glance unit-aware + PR #2 closed (2026-06-10).** The Profile tab's Physical
  glance now shows **Height/Weight in the user's preferred units** (cm/kg or in/lbs),
  mirroring the settings form — storage stays metric, converted for display only
  (`formatMeasure` in `app/(app)/profile/page.tsx`, reading `profiles.units_preference`).
  **PR #2 was CLOSED — not merged** (via the GitHub API using the osxkeychain git
  credential, since `gh` isn't authed), with a comment explaining the settings feature was
  landed directly on `main`. The stale `feat/settings` branch can still be deleted.

- **Settings landed on `main` + Profile/Settings page fade + prod deploy (2026-06-10).**
  Lifted the 3 self-contained **Settings** files (`app/(app)/settings/{page,actions}.tsx`,
  `components/settings/settings-form.tsx`) directly onto `main` from the **stale
  `feat/settings`** branch — that branch had fallen far behind `main` (it predated the new
  Profile page, Adrian's gradient wordmark, the brand scripts, and the PWA cold-launch
  fixes), so merging the whole branch would have **reverted** that work. Only the feature
  files were cherry-picked (every import already resolves on `main`). `/settings` (read-only
  account block + server-validated, RLS-scoped editable sex/height/goal/units) is now live,
  so the Profile tab's Settings links resolve instead of 404ing. Added a **subtle fade-up
  entrance** (`animate-in fade-in-0 slide-in-from-bottom-2 duration-500 ease-out` +
  `motion-reduce:animate-none`) to both the Profile and Settings page roots via the
  already-imported `tw-animate-css` — no shared-file change. Pushed to `main` → deployed to
  prod (trackdco.app); `tsc` + `lint` + prod `build` clean; route table shows `/profile` +
  `/settings`. **Follow-up (2026-06-10):** Settings gained a **Weight (kg)** field
  (validated 30–300 to match the schema CHECK; placeholder until the dedicated weight-
  tracking surface exists), and **Save now redirects to `/dashboard`** on success (via
  `redirect()` in the action; the inline "Saved." message was dropped). Height/Weight now
  display + accept the user's chosen **units** (cm/kg ↔ in/lbs) — imperial converts to metric
  on save (storage stays metric; the schema CHECKs validate the converted value; round-trip
  verified). **PR #2 is now
  superseded — CLOSE it (do NOT merge; the branch is behind `main` and would clobber it).**

- **Profile tab built — code complete, locally verified (2026-06-10).**
  `app/(app)/profile/page.tsx` (was a blank placeholder) is now the bottom-nav Profile
  destination: an identity/account **hub, NOT an editor** (edits route to `/settings`).
  Sections: identity hero (**code-point-safe initials avatar** — no external photo, since
  `next/image` has no `remotePatterns` — serif name, email, and a single amber **"Beta ·
  Pro" plan pill** = the one sanctioned amber accent); an **Account** card (member-since /
  plan / email); a **read-only Physical glance** (sex/age/height/weight/goal/units, "—"
  where unset, "Edit in Settings" hint); an **App** card linking Settings + the three legal
  docs (`/terms`·`/privacy`·`/medical-disclaimer`); and a bottom **sign-out**
  (`<form action={signOut}>`, alongside the header's). Server component; reads ONLY the
  user's own `profiles` row (RLS-scoped, `maybeSingle`, null-safe — defaults to Beta·Pro
  and renders "—" if the row is missing). **No schema / dependency / token / shared-file
  change.** Built via a **design-panel workflow** (3 diverse on-brand designs → synthesis)
  then a **5-dimension adversarial review** (correctness · RLS/security · a11y ·
  design-system · Next-16/React; 9 raw → 6 verified-real, all fixed): low-contrast
  `text-subtle` on the interactive Edit link + nav chevron → `text-muted`; a **negative-age
  guard** for a future/bad DOB (→ "—"); a proper **tap target** on the Edit link;
  **focus-visible amber rings** on every hand-rolled control (inset on the card rows to
  clear `overflow-hidden`); **code-point-safe initials**. Dismissed 3 (unreachable
  `fmtNum("")` under the `numeric(5,1)`+CHECK schema; the deliberate plan/email IA
  duplication). `tsc` + `npm run lint` + prod `npm run build` all clean; `/profile` builds
  as a server-rendered route. **Not yet PR'd** — visual QA + PR pending; `/settings` links
  404 until PR #2 merges (merge settings first). Open design-system note: `--text-muted`
  sits ~4:1 (just under AA 4.5:1) app-wide — a one-token call for Adrian, not changed here.

- **Brand wordmark → gradient logo images + launch-splash cleanup (2026-06-09).**
  Replaced the text wordmark ("trackd co", `co` in `--accent-amber`) with the real
  **transparent gradient PNG** (`public/trackd-wordmark.png`) everywhere it appeared
  at the small `text-lg` treatment — the `(app)` header, onboarding (`first-run`),
  `/welcome`, `/login`, `/preview`, and the legal-doc header — rendered via
  `next/image` at `h-5 w-auto`. The large `text-3xl` hero on the root landing
  (`app/page.tsx`) was deliberately **left as text** (distinct treatment). **iOS
  launch images regenerated** (`public/splash/apple-splash-*.png`) to show the short
  "Trackd" mark centred on the #111110 canvas with **no box** — fixes the faint dark
  square under the mark on launch. Source masters + a reproducible generator live in
  `scripts/brand/` (`node scripts/brand/generate.mjs`, uses `sharp`).

- **Bottom-of-screen "black bar" — reproduced + fix shipped (pending on-device check).**
  On cold launch the `fixed bottom-0` nav floats above the home indicator (a black
  strip below it) until the first swipe snaps it down — the iOS dynamic-viewport bug,
  reported in BOTH the installed PWA and Safari. Shipped a **visual-viewport pin** in
  `components/navigation/bottom-nav.tsx`: measure the gap between the visual-viewport
  bottom and the layout bottom and nudge the nav down by it on launch (re-measured via
  rAF + a 400ms settle + vv `resize`/`orientationchange`/`pageshow`; vv `scroll`
  deliberately skipped so overscroll can't jiggle it), **clamped to >= 0** so it can
  only move DOWN to the bottom, never up over content — worst case a no-op, so it can't
  regress. Keyboard-hide preserved (shares the single `transform`). `viewport-fit=cover`
  is confirmed served. **Unverified on-device:** Adrian can't test yet (Angus mid-auth),
  and the installed PWA serves stale cache (old splash persists) — needs a clean
  reinstall to even pick up the fix.

- **Plus-button "Shortcuts" menu built (Adrian's lane, 2026-06-09, PR `feat/shortcuts-menu`).**
  The bottom-nav centre plus now opens a styled **Shortcuts** bottom sheet instead of
  going straight to Add-to-Stack. Built from the spec
  (`Context/Feature Specs/03-shortcuts-control-creation.md`), then iterated with Adrian
  into a **two-tier layout** (his direction, drawing on a MacroFactor reference but kept
  entirely within `ui-context.md` tokens):
  - **Top tier — fixed circle quick-actions:** Log (Today's dose, `ListChecks` icon) ·
    Calculator (Reconstitution) · Journal · Calendar. Not reorderable.
  - **Bottom tier — full-width cards:** Weight (`Scale`) · Blood work · **Add a compound**
    (`Pill`). Add-a-compound defaults to the bottom but is reorderable like the others.
  - Centred sans (Geist) title; amber icon-strokes in tiles + circles (the sanctioned
    sparing amber use), warming on hover; the protected Add-to-Stack category dots are
    untouched and intact.

  **Only "Add a compound" is wired** — it presents the existing **Add-to-Stack flow
  completely unchanged** (reached by navigation, not rebuilt — the spec's "navigate to
  it" option, chosen so the protected flow stays untouched). Every other item opens one
  shared, non-functional `PlaceholderActionSheet` (passed title + a visual-only field
  that **saves nothing** + close; the **reconstitution calculator** also shows the
  medical-disclaimer warning).

  **Reorder (bottom cards only):** a small grey **pencil "Edit"** control top-right
  enters edit mode (replaced the original long-press trigger at Adrian's request); cards
  show a grip and drag up/down; **tap any shortcut, "Done", or dismiss commits** (tap-to-
  finish). Pointer-based, **no new dependency** (reuses the existing drag idiom; deliberate
  given the touch-PWA + flaky-npm note). Order persists per-device in `localStorage`
  (`trackd.shortcutOrder.<uid>`, **card ids only** — the single carve-out to the
  placeholders' no-persistence rule) and restores on open; the sheet's drag-to-dismiss is
  disabled during edit so the gestures can't fight.

  **Motion (professional, eased — no static cuts):** staggered fade-up **entrance** on
  open; a soft amber **tap "light-up" ripple** from the touch point on cards; the edit-
  mode hint **eases its height open/closed + fades** (which makes the cards + sheet rise/
  settle smoothly); **Edit ⇄ Done cross-fade**; chevron ⇄ grip fade. Keyframes live as
  plain classes in `app/globals.css` (`shortcut-in` / `shortcut-ripple` / `shortcut-fade`).

  New files: `components/shortcuts/{shortcutItems.ts, ShortcutItem.tsx,
  PlaceholderActionSheet.tsx, ShortcutsMenu.tsx}` + `lib/shortcutOrder.ts`;
  `components/navigation/bottom-nav.tsx` now renders `ShortcutsMenu`; `app/globals.css`
  gained the motion keyframes (shared-file change, Adrian-directed). No new
  tokens/colours/fonts, no schema/DB change. `tsc` + `npm run lint` clean; reviewed live
  via the dev-only `/preview` harness on localhost. Landed via the **PR flow** for
  CodeRabbit review (not a direct push).
- **Sydney region + honest PWA install + local toolchain (2026-06-09).** Moved the
  Vercel functions to **`syd1`** (new root `vercel.json` `{"regions":["syd1"]}`) to
  co-locate with the Sydney Supabase + the AU audience — warm app TTFB dropped from a
  steady **~330–480ms → ~210ms** (diagnosed by measurement: Supabase was always ~40ms
  = already Sydney; the lag was Vercel's `iad1`/US default). Resolves the "check
  region" backlog item. Recoloured the wordmark **"co" to amber** across all 7 spots.
  Rebuilt the **PWA install prompt** around what iOS actually allows — after two
  adversarially-verified research workflows (~60 sources) confirmed iOS has **no**
  programmatic Add-to-Home-Screen, `navigator.share()`'s sheet lacks the action
  (confirmed on Angus's phone), `app.link`/Branch is native-app deep-linking (not a
  PWA tool, not a push provider), and `.mobileconfig` profiles are worse + trust-toxic:
  removed the misleading share button, added **in-app-webview / non-Safari detection →
  "Open in Safari"** (rescues social-link traffic), iOS-26 "•••"-menu copy, and the
  "View More" step. Installed **`gh` + Vercel CLI** user-level (`~/.local/bin`);
  confirmed **`~/dev/trackd-co-app`** as the healthy off-iCloud canonical repo (all
  today's pushes ran from it, zero mmap errors). Detail in Session Notes 2026-06-09.
- **Add-to-Stack row controls + Radix import-bug fix (`feat/app-ui`, in the open PR
  to `main`, 2026-06-08).** Each **custom** compound's row now shows three
  right-aligned controls — a primary add-to-stack **+** (matches the catalogue rows;
  visual until the cycle feature lands), a smaller **edit** (opens the unchanged edit
  menu), and **delete** (same inline red confirm + per-user `localStorage` persistence
  as the edit menu); custom rows in search results get them too. Before that, fixed a
  **crash that took down the whole Add-to-Stack menu**: the earlier "code rabbit"
  commit (`42e08fb`) swapped the unified `radix-ui` dependency for the individual
  `@radix-ui/react-*` packages but left the `Dialog.Root` / `Slot.Root` namespace
  usage intact, so those resolved to `undefined` and every
  `sheet`/`dialog`/`tabs`/`scroll-area`/`button` threw "Element type is invalid" —
  fixed by switching the four wrappers to `import * as X` and `Button` to use `Slot`
  directly. `tsc` + `lint` + production build all clean. **Local dev unblocked:**
  restored the git-ignored `.env.local` (`NEXT_PUBLIC_SUPABASE_URL` +
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) — without it every Supabase-backed route
  500s locally (only `/preview`, which is outside the `(app)` auth shell, survives).
  Landing via a **PR** (CodeRabbit review) per the new flow, not a direct push.
- **Bottom nav + Add-to-Stack search (Adrian's lane, `feat/app-ui`, 2026-06-08).**
  Built the persistent **bottom navigation** (Home · Protocol · white **Plus** ·
  Progress · My Profile; route-driven amber/gray active state with a gray→amber
  fade; keyboard-aware hide; safe-area insets) and **integrated it into the merged
  auth shell** — rendered from `app/(app)/layout.tsx` with `userId` threaded in;
  Protocol/Progress/Profile placeholder pages added under `app/(app)/`; the Home tab
  points at Angus's real `/dashboard`. (Originally built under a parallel
  `app/(main)/` group on a pre-auth base; **reconciled onto current `main`** —
  dropped the duplicate `(main)` shell + placeholder dashboard to resolve the
  `/dashboard` collision with the auth lane.) The centre plus slides up the
  **Add to Stack** sheet (near-full-height card, drag-to-dismiss handle, Cancel +
  centred sans title). **Search is now wired to real data:** it filters the bundled
  **149-compound catalogue by name *and* aliases** (e.g. "deca"→Nandrolone
  Decanoate, "aromasin"→Exemestane, "npp"→Nandrolone Phenylpropionate); empty query
  shows a curated "Popular in comp prep" list + the user's saved compounds; no match
  shows "'[query]' not found". A **"Make your own"** option sits at the bottom of the
  list always → a form that saves a custom compound to **`localStorage` keyed per
  user** (`trackd.customCompounds.<uid>`), persisting on that device for that user.
  Custom compounds are **editable + deletable** (tap your compound → edit; delete is
  behind a confirm warning); **duplicate names are blocked** (vs catalogue + your
  own), name is capped at 80 chars, and a failed localStorage write surfaces a
  non-fatal notice. Form pickers are **on-brand dark "pill" selectors** (not native
  `<select>`, which can't be forced dark on mobile). The per-row "+" is visual for
  now (real "add to stack" needs the cycle feature).
- **Round-2 hardening of the Add-to-Stack sheet (2026-06-08, post-audit).** A
  6-dimension multi-agent audit (36 raw → 28 verified findings) drove: **8 distinct
  category dot hues** (`--cat-*` tokens in `globals.css`, documented in
  `ui-context.md`); **search icon = magnifier** (was a grid glyph); **generator now
  validates** category/unit/route/inventory and a **`prebuild` npm hook** regenerates
  `lib/compounds-catalogue.ts` on every build (CSV can't ship stale); `crypto.randomUUID`
  **fallback** (it throws over a plain-http LAN IP — i.e. on-phone QA — so "Make your
  own" would have broken); a **render guard** so a corrupt/unknown category can't crash
  the sheet; keyboard-hide now **gated on a focused editable element** (pinch-zoom can't
  hide the nav); **focus moves into the form** on open; bigger (~44px) drag target.
  `npm run build` + `npm run lint` clean; a dev-only **`/preview`** route (404s in prod)
  renders the nav + sheet without auth for review. **Not pushed/deployed.** NB: local
  run of the *real* signed-in app needs a `.env.local` (see below) — without it every
  Supabase-backed page 500s; `/preview` works without it.
- **Compounds catalogue bundled into the app (2026-06-08).** `lib/compounds-catalogue.ts`
  (generated, 149 compounds) is produced from `supabase/seed/compounds.csv` by
  `supabase/seed/build-compounds-data.mjs` — the CSV stays the single source of truth
  (same file that seeds the DB). Taxonomy/labels/option-lists live in the
  hand-authored `lib/compound-categories.ts`. The app reads this static module so the
  Add-to-Stack search works offline (PWA) with no auth/network dependency; swap to a
  live Supabase read later if the catalogue needs to update without a redeploy.
- Next.js 16 (App Router) + React 19 + Tailwind v4 starter scaffolded.
- Canonical schema authored: `supabase/trackd_schema_v0_4_2.sql` (16 tables,
  2 views) + `supabase/trackd_storage_policies.sql`.
- **Data model APPLIED + VERIFIED on the live project (2026-06-06).** Two tracked
  migrations via the Supabase MCP: `20260606042525_schema_v0_4_2` then
  `20260606042547_storage_policies_v0_4_2`. Post-apply verification passed:
  16 tables + 2 views (both `security_invoker=true`); RLS enabled on every table
  with policies present (profiles 3, rest `FOR ALL`); 16 enums; 7 functions;
  11 public triggers + the `on_auth_user_created` trigger on `auth.users`; the
  private `bloodwork` storage bucket (public=false, 10MB, PDF/image mimes) + its
  4 owner-scoped `storage.objects` policies. No errors.
- **Seed catalogues loaded + VERIFIED on the live project (2026-06-06).** Two
  tracked migrations via the MCP: `catalogue_enums_and_reference_ranges` then
  `seed_catalogues`. From Adrian's CSVs (now in `supabase/seed/`): **149 compounds,
  41 biomarkers, 4 IGF-1 reference ranges**. Adrian-approved schema deltas:
  `compound_category` extended with `sarm`/`thyroid`/`stimulant`, `dose_unit`
  extended with `g`, and a new **`reference_ranges`** table (age/sex-banded; NULL
  sex = any) for IGF-1's age-dependent ranges — stored only, not wired into
  interpretation. Biomarker unit mojibake (`Âµg/dL` → `µg/dL`, `10â¹/L` → `10⁹/L`,
  etc.) repaired on the way in. Seed is reproducible: edit the CSV → run
  `node supabase/seed/build-seed-sql.mjs` → idempotent `ON CONFLICT` inserts.
  Post-seed verification passed: counts exact, 0 rows with bad encoding, 0 null
  categories, all 4 ranges FK-linked to IGF-1, `reference_ranges` RLS on with a
  single read-only-to-authed policy. Live DB now **17 tables**.
- **Markers seed catalogue loaded + VERIFIED on the live project (2026-06-08).**
  Adrian's Markers CSV (`supabase/seed/markers.csv`, 36 markers) seeded the
  pre-existing `markers` table via a third tracked migration, `seed_markers` —
  built the same reproducible way as the other catalogues (CSV → extended
  `build-seed-sql.mjs` → idempotent `ON CONFLICT (name) DO UPDATE`; the generated
  `002_seed_catalogues.sql` now carries all three catalogues + ranges). **No
  schema change needed:** `marker_polarity` already = `{positive,negative,neutral}`,
  unlike compounds (which needed enum extensions). `tier_labels` are stored
  pipe-split into `text[]`. Post-seed verification passed: 36 rows
  (12 positive / 21 negative / 3 neutral; 14 default / 22 optional), 0 null/empty
  tier arrays, 0 empty names, 0 mojibake; RLS on with the **same single
  read-only-to-authed SELECT policy and no write policy** as `compounds` /
  `biomarkers` (confirmed by a side-by-side `pg_policies` check). Table count
  unchanged — `markers` was always one of the 18 tables; only its contents are new.
- **Legal documents stored in the DB (2026-06-06).** New `legal_documents` table
  (18th table) + `legal_doc_type` enum, added via two tracked migrations
  (`legal_documents_table`, `seed_legal_documents`; SQL in `supabase/legal/`).
  Holds the **Terms of Service (v0.2)**, **Privacy Policy (v0.1)**, and **Medical
  Disclaimer (v0.2)** text — stored verbatim, encoding mojibake repaired, Privacy
  Policy's inline "⚠ NOTE" drafting blocks retained (Adrian's instruction). All
  `is_beta = true`, `is_current = true`, `effective_date = NULL` ("set on launch").
  RLS on; **public read** (`anon` + `authenticated`, since signup shows them
  pre-auth), service-role-only writes. Verified: 3 rows, one current per type, no
  mojibake. **Store-only — NOT wired into signup.** Versioning/dating rule + the
  launch-day bump-to-1.0 procedure recorded in `architecture.md` → "Legal
  Documents"; launch checklist in `next-tasks.md`.
  **Reviewed + approved by both co-founders (2026-06-06)** — text signed off as-is;
  versions stay 0.2 / 0.1 / 0.2 (beta), with the bump to 1.0 + effective date still
  to happen at launch.
- **Supabase client layer wired (2026-06-06).** `@supabase/ssr` +
  `@supabase/supabase-js` installed; `lib/supabase/client.ts` (browser),
  `lib/supabase/server.ts` (server, async `cookies()` + try/catch write guard),
  `lib/supabase/middleware.ts` (`updateSession` — refresh-only, `getClaims()`),
  and root `proxy.ts` (Next 16's renamed-from-middleware hook) created.
  `.env.local` (git-ignored) holds the real URL + publishable key; `.env.example`
  committed. `npm run build` passes and shows `ƒ Proxy (Middleware)` with no
  deprecation warning. Pattern research-verified against installed versions +
  Supabase docs and adversarially checked for the auth-session footguns.
- **Deployed to Vercel + live on the custom domain (2026-06-06).** App imported to
  Vercel (project `trackd-co-app`), Production env vars set
  (`NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
  non-sensitive) and serving. Custom domain **https://trackdco.app** live and
  verified externally (DNS A `216.198.79.1`, HTTPS 200, valid SSL). First deploy
  500'd on missing build-time env vars — fixed by setting them and redeploying
  with build cache OFF (`NEXT_PUBLIC_` vars inline at build time).
- **Public landing shipped + live (2026-06-06).** App-style **First Run** onboarding
  merged `feat/landing` → `main` and verified live on https://trackdco.app (HTTP 200).
  Mobile-first swipeable carousel (hero → stack → site rotation → inventory) with
  product mini-mocks (placeholders for the real app UI), restrained gold accents, a
  2s auto-advance tour (snap-toggle for iOS), scroll-coupled parallax, and a
  "Continue with Google" CTA → `/login`. Desktop = "open on your phone" gate
  (mobile-only by intent). On-brand `/login` + `/terms` + `/privacy` placeholders.
  Built from a multi-lens design critique; CodeRabbit review applied (metadata/OG,
  a11y, no-404s). `app/layout.tsx` gained native wiring (`themeColor`, `colorScheme`
  dark, `viewport-fit: cover`); `updateSession` now **fails open** when Supabase env
  is unset (a missing/mis-scoped var can't 500 the whole site).
- **Brand icons wired into the app (2026-06-07).** Adrian's logo (1563×1563 PNG,
  master at `app/logo-source.png`) set as the site's icons via Next.js 16's `app/`
  file conventions: **`favicon.ico`** (48×48, replaces the old default Next.js favicon
  — browser tab), **`icon.png`** (512×512 — modern favicon + Android/PWA),
  **`apple-icon.png`** (180×180 — the iOS home-screen Apple Touch icon). All resized
  from the source with macOS `sips` (no ImageMagick/Pillow on the machine;
  `sips -s format ico` makes a valid single-size `.ico`). Verification each time: local
  dev server shows the rendered `<head>` carrying all three tags (`rel="icon"` ×2 +
  `rel="apple-touch-icon"`) with correct `sizes`/`type`, each icon URL returns HTTP
  200, and the served `apple-icon.png` is a byte-for-byte (SHA-256) match to disk.
  **Logo revised same day:** v1 was the "TrackdCo" wordmark (committed, pushed, and
  confirmed live on trackdco.app — prod URLs 200 + SHA-match); Adrian then swapped in
  the shorter **"Trackd"** wordmark (gold "d"), icons regenerated from the new master
  and re-verified locally. The "Trackd" mark fills the frame more, so it reads better
  at 16px tab size than the wordmark did. Pushing `main` is what deploys icons to
  trackdco.app; favicons cache hard, so seeing a change needs a private window (tab)
  or delete-and-re-add to Home Screen (Apple Touch icon).
- **Auth + app shell built — code complete, locally verified (2026-06-08).**
  Method = Google OAuth (`@supabase/ssr`, PKCE — verified against current Supabase
  docs). Shipped: `components/auth/google-sign-in-button.tsx` (`signInWithOAuth`),
  `app/auth/callback/route.ts` (`exchangeCodeForSession` + open-redirect guard on
  `next`), a real `/login` screen (replaced the placeholder), the one-time
  **18+/ToS gate** at `/welcome` (`gate-form.tsx` + `actions.ts` — server-side age
  validation ≥18, single acceptance covering all three docs, writes
  `date_of_birth`/`is_18_plus`/`tos_accepted_at`/`tos_version` to the user's own
  profile, ToS version read live from `legal_documents`), the guarded `(app)`
  route group (`layout.tsx` runs `getUser()` + the gate check) with an empty
  `/dashboard` and sign-out, the root redirect for logged-in users, and a PWA
  install prompt (`components/pwa/install-prompt.tsx`) + web manifest
  (`app/manifest.ts`) + Apple web-app meta. `lib/auth.ts` (`getSessionContext`) is
  the single source of truth for "passed the gate". The landing CTA now triggers
  real sign-in. Verified: `npm run build` + `npm run lint` clean; `/dashboard` and
  `/welcome` 307 → `/login` with no session; the three legal pages render verbatim
  from the DB. Live OAuth + RLS test still pending Google provider config (see In
  Progress).
- **Legal docs wired into signup + rendered from the DB (2026-06-08).** `/terms`,
  `/privacy`, `/medical-disclaimer` now render the current version verbatim from
  `legal_documents` via one shared `components/legal/legal-document.tsx`
  (replacing the "coming soon" placeholders); the gate links + records acceptance
  of all three. Reverses the prior "stored only — not wired into signup" note in
  `architecture.md` (updated).
- **API role grants applied — Data API now works (2026-06-08).** Discovered during
  verification that **no** `public` table was reachable by the API roles: `anon`
  and `authenticated` held only `REFERENCES/TRIGGER/TRUNCATE` (no SELECT/INSERT/
  UPDATE/DELETE), so every Data API call returned `42501 permission denied` —
  including the gate's `profiles` UPDATE and the legal-doc reads. Root cause: the
  schema/seed/legal migrations enabled RLS + policies but never granted table
  privileges to the PostgREST roles, and this project's Supabase defaults don't
  auto-grant. Fixed with the tracked `api_role_grants` migration (SQL in
  `supabase/grants/001_api_role_grants.sql`): `legal_documents` SELECT → anon +
  authenticated; catalogues SELECT → authenticated; user tables full DML →
  authenticated; `profiles` SELECT/INSERT/UPDATE; views SELECT → authenticated.
  RLS is unchanged and still the only row-level gate. Verified post-apply: anon
  reads `legal_documents` (200), anon is correctly denied the authed-only
  catalogues (42501), pages render.
- Context system written: `project-overview.md`, `architecture.md`,
  `code-standards.md`, `ai-workflow-rules.md`, `ui-context.md`.
- `ui-context.md` signed off by Adrian (co-founder) (2026-06-05): theme, colour tokens,
  typography, radius, layout, component library, and icons all locked.
- Design-system foundation wired (`npm run build` passes): all colour tokens in
  `app/globals.css` (`:root` + `@theme inline`); Geist + Geist Mono + Playfair
  Display (serif) via `next/font` in `app/layout.tsx`; shadcn/ui installed
  (`components.json`, `lib/utils.ts`, first `button` component) with its semantic
  tokens mapped onto the Trackd palette; Lucide installed. Deps added:
  class-variance-authority, clsx, tailwind-merge, lucide-react, tw-animate-css,
  radix-ui.
- **Supabase project provisioned** (project ref `boqqracwdpuisgvwbqlc`).
- **Supabase MCP connected + authenticated** (2026-06-06): `.mcp.json` points at
  the hosted Supabase MCP (database + docs features); OAuth completed; the
  database/docs tools are live. Confirmed working against the live project
  (`list_tables` → empty public schema, as expected before the schema is applied).
- **Supabase agent skills installed + committed** (commit `47bb76b`, 2026-06-06):
  `supabase` and `supabase-postgres-best-practices` installed via skills.sh into
  `.agents/skills/`, symlinked into `.claude/skills/` for Claude Code discovery,
  and pinned in `skills-lock.json`.

- **Auth — deployed + verified; Week-1 checkpoint essentially met (2026-06-08).**
  Built, Google OAuth set up, merged to `main`, live on trackdco.app, and
  **sign-in confirmed on both founders' phones** (Angus `admin@trackdco.app`,
  Adrian `adrianschimizzi1@gmail.com`). **RLS isolation VERIFIED with the two real
  accounts** (success criterion #3): simulating each user's `authenticated` JWT
  context, each saw only their own `profiles` + `cycles` row and never the other's;
  cross-user INSERT was blocked by the `WITH CHECK` policy (`42501`); all test data
  rolled back (0 rows persisted). Both ownership patterns proven (`id = auth.uid()`
  and `user_id = auth.uid()`); the two views are `security_invoker` so they inherit
  the same filtering (storage-bucket isolation to be checked once bloodwork uploads
  exist, wk3). Recorded in Completed.

## In Progress

- **App UI lanes.** **Angus + Claude — Profile & Settings: ✅ DONE** (Profile tab +
  Settings, unit-aware Height/Weight, page fade-up, Save→dashboard; landed direct on
  `main` and deployed to prod 2026-06-10; PR #2 closed, not merged). **Adrian + Claude —
  home + compound tracking: ✅ BUILT & merged to `main` (2026-06-10)** — the home
  dashboard, add-to-log, per-compound injection-site rotation, persisted dose logging,
  same-day clash flagging, and the detail/edit/archive/delete flow, all **device-local**
  (interim `localStorage`). **Next for this lane:** wire the device-local stack + dose
  logs to **real Postgres cycles / `protocol_compounds` / inventory** (the data model
  already exists), and reflow inventory maths from `v_inventory_math`. The deferred
  fade-to-all-tabs + a `/settings` nav link are shared-layout (`app/(app)/layout.tsx`)
  changes to fold in then.
- **Angus — marketing / audience warm-up (from 2026-06-10).** Now off the build and onto
  the **marketing plan**: restarting consistent, Trackd-optimised social posting to re-warm
  a **cold audience** (the socials have been quiet for a while) ahead of the 28 Jun beta.
  Will return to the build when it's in motion; next build task chosen then from where he +
  Adrian are. Details in `next-tasks.md` → "NOW (Angus) — audience warm-up".
- **Auth — effectively done; one tester-gating task left:** **publish the Google
  OAuth app** (Audience → Publish App) before any non-Test-user can sign in. Sign-in,
  the 18+/ToS gate, RLS isolation, and the branded PWA launch splash are all live +
  verified on both founders' phones.

## Tooling

- **Vercel plugin for coding agents installed (2026-06-06).** `vercel-plugin@vercel`
  v0.43.0 installed at **user scope** via `npx plugins add vercel/vercel-plugin
  --target claude-code` (Bun installed to `~/.bun` as its prerequisite — global
  `npm i -g` was blocked by `/usr/local` perms, so used the official `bun.sh`
  installer). Provides 26 Vercel skills, 3 specialist agents (`deployment-expert`,
  `performance-optimizer`, `ai-architect`), `/vercel-plugin:*` slash commands, an
  MCP server, and session-start hooks. Registered in `~/.claude/plugins/`. Loads
  on the next Claude Code session restart; the bundled MCP/CLI needs Vercel auth
  on first use of the deploy commands. NB: the no-`plugins`-tool conclusion from
  an earlier check was wrong — this is an official June-2026 Vercel release
  (docs: vercel.com/docs/agent-resources/vercel-plugin).

### Feature Specs

- **`Context/Feature Specs/01-design-system.md` — ✅ Complete (verified
  2026-06-06).** Implementation audited against the spec and `ui-context.md`:
  tokens in `app/globals.css` (`:root` + `@theme inline`) match `ui-context.md`
  exactly; fonts wired in `app/layout.tsx`; `components.json` config +
  `lib/utils.ts` `cn()` correct; shadcn semantic token map present and on-theme;
  deps and Lucide installed; `button` is the only primitive (further added
  incrementally per spec). All "Check When Done" items pass — no hardcoded hex
  outside `globals.css`, and `npm run build` passes.

## Open Questions

- DB-enforced cycle limits: left as an app-layer decision; tester behaviour
  decides post-beta. (Single-active-cycle index stays commented in the schema.)
- **Legal copy — parked edits inside the Privacy Policy (stored verbatim, not yet
  actioned per "store only").** Three items Adrian flagged in the source need a
  decision before launch: (1) §7 Data retention — Adrian asked Claude to state, in
  the section body, the two confirmed facts (deletion is requested via an in-app
  button; deletion completes within 30 days); the **backup retention window is
  still unconfirmed** and must be nailed down. (2) §9 Your rights — Adrian wants a
  clause that we comply with whatever data-protection law applies in the user's
  region (needs legal sign-off that this is sound). (3) §5/§10 — Supabase + Vercel
  **regions** must be named to complete the storage + international-transfers
  sections. These are intentionally untouched until Adrian directs the edits.

## Architecture Decisions

- **Vercel functions pinned to Sydney `syd1` (2026-06-09).** Root `vercel.json`
  `{"regions":["syd1"]}` sets the default function region; they were defaulting to
  `iad1` (US East) while Supabase + users are AU, so every SSR page paid a US
  round-trip plus US↔Sydney hops per auth/data call. Single region = Hobby-OK.
  Note: `preferredRegion` in code is NOT the lever (it only applies with
  `runtime='edge'`; the app is Node for `@supabase/ssr`). Revisit multi-region on Pro.
- **iOS PWA install is manual-only — no shortcut exists (2026-06-09).** Settled by
  two adversarially-verified research workflows: iOS has no programmatic
  Add-to-Home-Screen, `navigator.share()`'s sheet doesn't contain the action,
  `app.link`/Branch is native-app deep-linking (irrelevant to a PWA, and NOT a push
  provider), and `.mobileconfig` web-clip profiles are more friction + trust-toxic.
  So the install prompt's job is completion/clarity, never automation. **Push
  notifications (when built) = standard Web Push** (VAPID + service worker via
  `web-push`, or OneSignal/FCM); **iOS push needs the PWA installed to the home screen
  first**. Full reference in memory `pwa-install-and-push-reality`.
- **PostgREST role grants are explicit, RLS stays the only row gate (2026-06-08).**
  The Data API needs a table-level `GRANT` to `anon`/`authenticated` before RLS
  even runs; this project's Supabase defaults don't auto-grant, so grants are
  declared in `supabase/grants/001_api_role_grants.sql` (migration
  `api_role_grants`). Grants follow the documented access model (public-read legal
  docs, authed-read catalogues, authed full DML on user tables, no profile
  self-delete, view reads). They open the table; RLS still gates the rows.
  Consequence: **every new `public` table must ship its own grants** (or we set
  `ALTER DEFAULT PRIVILEGES`), else it 42501s on the API.
- **18+/ToS gate accepts all three legal docs in one consent (2026-06-08).**
  Angus's call: the single acceptance at `/welcome` covers Terms + Privacy +
  Medical Disclaimer (each linked), recorded as `tos_accepted_at` + `tos_version`
  (the ToS version, read live from `legal_documents`). Strongest coverage for a
  peptide/AAS tracker — the medical disclaimer is acknowledged up front. The gate
  is the authoritative app entry: `(app)` layout redirects to `/welcome` until
  `is_18_plus AND tos_accepted_at`.
- **`legal_documents` is a new (18th) table for versioned legal text (2026-06-06).**
  ToS / Privacy / Medical Disclaimer text now lives in the DB, one row per
  `(doc_type, version)` with `is_current` (partial unique index = one current per
  type). Same service-role-write model as the seed catalogues, but **read is public
  (`anon` + `authenticated`)** — a deliberate deviation from the authed-only
  catalogues, because signup must show the documents before an account exists
  (Adrian-approved). Stored only; not wired into signup. Versioning rule (whole
  numbers; bump all to 1.0 + freeze the date at launch; bump+re-date per change)
  lives in `architecture.md` → "Legal Documents".
- **Catalogue taxonomy extended to fit the seed, not the reverse (2026-06-06).**
  Adrian's compounds seed used 3 categories (`sarm`, `thyroid`, `stimulant`) and a
  unit (`g`) beyond the original v0.4.2 enums. Decision (Adrian): extend the enums
  via `ALTER TYPE ... ADD VALUE` rather than remap the data, preserving the seed's
  intended granularity. `g` is a catalogue *default_unit* pre-fill only and does
  not affect the inventory unit-family trigger (which still governs mg↔mcg vs iu on
  real inventory items; `v_inventory_math` does not convert grams).
- **`reference_ranges` is a new (17th) table for age-banded ranges (2026-06-06).**
  IGF-1 falls with age, which the flat male/female columns on `biomarkers` can't
  express. New service-role-write-only catalogue, same RLS as `biomarkers`. `sex`
  is nullable (NULL = any) rather than extending `sex_type`. Unique constraint uses
  `NULLS NOT DISTINCT` (PG15+) so NULL-sex rows still de-dupe on re-seed. Stored for
  reference only — **not** wired into interpretation (invariants 3 & 4); the IGF-1
  source data is explicitly flagged indicative/assay-dependent.
- **App is served at the root `trackdco.app`, not a subdomain (2026-06-06).**
  Angus's call — the app *is* the domain for now (no separate marketing site at
  the root). Reverses the earlier `app.trackdco.app` assumption. Apex domains
  can't use a CNAME, so DNS at Porkbun uses an A record (Vercel's IP) or an ALIAS
  → `cname.vercel-dns.com`; the Vercel "redirect apex to www" option is left OFF
  so the bare root serves the app directly.
- **Landing is a mobile-only, app-style onboarding (2026-06-06).** The public entry
  at trackdco.app is a swipeable "First Run" carousel built to feel like a native
  app, not a marketing page (founder direction). Desktop gets an "open on your
  phone" gate. Two `ui-context` nuances were relaxed *for the onboarding surface
  only*: (a) amber is used as a restrained recurring accent (progress fill,
  eyebrows, the "due" elements) rather than strictly once-per-screen — the in-app
  **health-data categorical / never-evaluative** invariant is untouched; (b) the
  feature cards are honest **placeholder mocks**, to be swapped for the real app
  screens once built. Also: `updateSession` now **fails open** when the Supabase
  env is unset, so a missing/mis-scoped var can't 500 the whole site (the real auth
  gate is `getUser()` in protected pages, so this is safe).
- **Stack is Next.js 16, not 14** — repo has `next@16.2.7`. APIs differ from
  older training data; read `node_modules/next/dist/docs/` before using a Next
  API you're unsure about (per `AGENTS.md`).
- **Next 16 renamed `middleware` → `proxy` (2026-06-06).** The root request hook
  is `proxy.ts` exporting `export async function proxy(request)`; a legacy
  `middleware.ts` still works but emits a build deprecation warning. The
  `runtime` option is not allowed in proxy files (proxy defaults to Node, fine
  for `@supabase/ssr`). Verified in the installed Next docs + build output.
- **Publishable key is the client key (2026-06-06).** App uses the new
  `sb_publishable_…` key via `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, not the
  legacy `anon` JWT / `NEXT_PUBLIC_SUPABASE_ANON_KEY` (deprecates end-2026). The
  server secret key (successor to `service_role`) will be `SUPABASE_SECRET_KEY`
  (server-only, no `NEXT_PUBLIC_`) — not yet provisioned. RLS gates all access,
  so the publishable key is browser-safe.
- **Auth-session refresh uses `getClaims()`, refresh-only for now.** `proxy.ts`
  delegates to `updateSession()`; no redirect guard until auth screens exist.
  Open item: confirm the project uses asymmetric JWT signing keys so
  `getClaims()` can verify locally — else fall back to `getUser()`.
- **Cycles are archived, never hard-deleted.** Confirmed 2026-06-05. The
  delete cascade (cycle → protocol compounds → inventory → dose logs) is kept
  for account deletion only; the app must archive via `is_active = false` and
  never expose a hard "Delete cycle". Now an invariant in `architecture.md`.
- **Schema reviewed before deploy (2026-06-05).** `trackd_schema_v0_4_2.sql`
  given a full read-through; verdict = sound. Pre-deploy refinements bumped it
  v0.4.1 → v0.4.2 (never deployed, so amended in place): UNIQUE on seed-catalogue
  names (compounds/biomarkers/markers); `handle_new_user()` profile insert made
  idempotent with `ON CONFLICT (id) DO NOTHING` so a trigger hiccup can't break
  signup; cycle archive-not-delete documented in-schema. Injection-site rotation
  confirmed fully covered by `injection_site` + `dose_logs` (visual is derived,
  nothing to store).
- Locked decisions and invariants live in `architecture.md` and
  `project-overview.md` (never store derived values; RLS on every table with
  `(SELECT auth.uid())`; categorical-not-evaluative health data; entitlement
  gates read `profiles.tier` only). Not repeated here — see those files.

## Session Notes

- 2026-06-09: **Plus-button Shortcuts menu built + iterated with Adrian** (spec
  `Context/Feature Specs/03-shortcuts-control-creation.md`, followed step-by-step, then
  refined live on `/preview`). A prior session had done Step 1 (`shortcutItems.ts`) +
  Step 2 (`ShortcutItem.tsx`) before crashing; resumed and built the rest
  (`PlaceholderActionSheet`, `ShortcutsMenu`, plus-button wiring, the reorder addition +
  `lib/shortcutOrder.ts`). Then iterated with Adrian over several rounds: **two-tier
  layout** (top circle quick-actions + bottom reorderable cards) from a MacroFactor
  reference; renamed items (Today's dose → "Log", Weight, Blood work) and re-iconed
  (`ListChecks`, `Scale`); sans (not serif) centred title; restrained **amber** accents;
  reorder trigger changed **long-press → a grey pencil "Edit" button** (more discoverable)
  with **tap-any-shortcut-to-finish**; Add-a-compound made reorderable (defaults bottom);
  and a full **motion pass** (staggered entrance, tap light-up ripple, eased edit-mode
  height/fade, Edit⇄Done cross-fade). Two deliberate judgement calls held throughout:
  (a) reach the **unchanged** Add-to-Stack flow by navigation, never refactoring it
  (protected); (b) **no new animation/drag dependency** — pointer drag + plain-CSS
  keyframes, given the touch-PWA + flaky-npm. Verified the Add-to-Stack **category dots
  are intact** (Adrian flagged them as possibly removed — they were never touched).
  `tsc` + `lint` clean throughout; **NB: don't run `npm run build` while `next dev` is up
  — they share `.next` and a concurrent build 500s with "Cannot find module page.js"**
  (the dev server stays healthy; just build with dev stopped). Landed via PR
  `feat/shortcuts-menu` for CodeRabbit review.
- 2026-06-09: **Perf (Sydney region), branding, toolchain, PWA-install honesty.**
  (1) **Amber wordmark** — "co" recoloured from muted grey to `--accent-amber` across
  all 7 wordmark spots (app shell, login, welcome, first-run, preview, legal, landing).
  (2) **Big perf win — Vercel functions moved `iad1`→`syd1`** via root `vercel.json`.
  Angus reported the app felt slow (sign-out, reload); measured it: warm app TTFB was a
  steady ~330–480ms from AU, but Supabase was ~40ms (already Sydney) — so the lag was
  Vercel running in US East. Pinned `syd1`; re-measured ~210ms warm + confirmed
  `x-vercel-id: sin1::syd1`. (3) **Toolchain** — installed `gh` 2.93 + Vercel CLI 54.10
  user-level (no Homebrew/sudo: npm global prefix → `~/.local`, PATH in `~/.zshrc`);
  **`~/dev/trackd-co-app` confirmed as the healthy canonical repo** (all pushes ran from
  it, no mmap errors). CLI auth still pending (Angus: `gh auth login` / `vercel login`).
  (4) **PWA install — researched then made honest.** Angus wanted a one-tap "Add to Home
  Screen" / asked about `app.link` (from a video). Two multi-agent research workflows
  (~60 sources, 3 fact-checkers each) confirmed: iOS gives a website **no** way to
  trigger/shortcut Add-to-Home-Screen; `navigator.share()` opens a sheet that lacks the
  action (verified on his phone — actions were Copy/Reading List/Amazon…);
  **`app.link` = Branch deep-linking for NATIVE apps**, not PWAs, and **not** a push
  provider; `.mobileconfig` profiles are worse + trust-toxic. Rebuilt the card to
  maximise completion: dropped the misleading share button; **detect in-app webviews
  (Instagram/TikTok/Facebook) + non-Safari iOS browsers → "Open in Safari"**; iOS-26
  "•••"-menu wording; added the "View More" step (per his screenshots). Android keeps
  real one-tap. All shipped + live. (5) **Push path banked** for later (memory
  `pwa-install-and-push-reality`): Web Push (VAPID + SW via `web-push`, or OneSignal);
  iOS push requires home-screen install first. Everything pushed direct to `main` (gh
  not yet authed for the PR flow); region/install changes are low-risk + user-requested.
- 2026-06-08 (cont.): **RLS verified, PWA splash, repo move, PR flow, parallel
  lanes started.** Sign-in confirmed on both founders' phones; **two-account RLS
  isolation VERIFIED** (each user sees only their own profiles/cycles rows;
  cross-user INSERT blocked by `WITH CHECK`; all test data rolled back) — success
  criterion #3 met. Shipped a branded **PWA launch splash**: 8 iOS
  apple-touch-startup-image PNGs (Trackd mark on #111110) + the legacy
  `apple-mobile-web-app-capable` meta Next 16 omits (the actual fix — iOS was
  ignoring the launch images without it), `start_url=/dashboard`, and an Android
  maskable icon — confirmed working on iOS. **Moved the repo out of iCloud** to
  `~/dev/trackd-co-app` (the `mmap`/stale-NFS git errors are gone; old `~/Documents`
  copy to be deleted). **Adopted a PR-based flow** so CodeRabbit reviews code before
  `main` (it only reviews PRs; the auth+splash work had bypassed it — PR #1's old
  findings were already addressed). Started the **parallel app-UI lanes**: Adrian on
  the core loop (`feat/app-ui`), Angus + Claude on **Profile & Settings**
  (`feat/settings`, **PR #2** — first PR in the new flow, in CodeRabbit review).
- 2026-06-08: **Auth deployed live + DOB picker improved.** Angus completed the
  Google OAuth dashboard setup; tested the full flow locally with a real account
  and it worked end-to-end (sign-in → `handle_new_user` trigger → gate → dashboard,
  all values written). Reworked the gate's date-of-birth field from a native
  calendar (paged month-by-month — brutal for a birthday) to Day/Month/Year
  dropdowns + hardened server date validation. Merged `feat/auth` → `main` and
  deployed to trackdco.app; verified in prod (manifest 200, route guards redirect,
  legal docs render from the DB, login button present). **The merge had to be run
  in a `/tmp` clone** — the local repo's git kept failing with `mmap`/stale-NFS
  errors (iCloud-synced `~/Documents`; permanent fix is to move the repo out of
  `~/Documents`). Remaining for the checkpoint: on-phone test, two-account RLS
  isolation, publish the Google app.
- 2026-06-08: **Markers catalogue seeded.** Adrian supplied the Markers CSV (36
  subjective-tracking markers — energy/libido/sleep/pumps… plus side-effects as
  negative-polarity markers). Added it as `supabase/seed/markers.csv`, extended
  `build-seed-sql.mjs` to emit a markers `INSERT` (pipe-split `tier_labels` →
  `text[]`, `TRUE`/`FALSE` → boolean), regenerated `002_seed_catalogues.sql`, and
  applied it to the live DB as the `seed_markers` tracked migration. No schema/enum
  change required (the `marker_polarity` enum already covered all values). Verified
  it's accessible exactly like the compounds + biomarkers catalogues: 36 rows, RLS
  on, single read-only-to-authed SELECT policy, no write policy (service-role-only).
  This closes the last open seed-catalogue item.
- 2026-06-08: **Auth + app shell built.** Verified the `@supabase/ssr` PKCE
  patterns against current Supabase docs (skill-driven), then built the whole
  flow: Google sign-in, `/auth/callback` exchange, the `/welcome` 18+/ToS gate
  (server-side age check; all-three-docs consent per Angus), the guarded `(app)`
  shell + empty `/dashboard` + sign-out, the root redirect, a PWA install prompt +
  manifest, and real legal-doc pages rendered from the DB. **Caught a live
  blocker during verification:** the Data API returned 42501 on every table — the
  API roles had no SELECT/DML grants (RLS + policies existed but the migrations
  never granted table privileges, and this project doesn't auto-grant). Applied
  the `api_role_grants` migration to fix it (RLS unchanged). `npm run build` +
  `lint` clean; guards + legal rendering verified. Remaining before the 11 Jun
  checkpoint: Angus's one-time Google OAuth dashboard setup, then the hard
  fresh-account test + two-account RLS isolation check.
- 2026-06-07: **Brand icons set, then logo swapped.** Adrian first supplied the
  "TrackdCo" logo; saved it as `app/logo-source.png` (master) and generated the three
  Next.js `app/` icons with `sips` (`favicon.ico` 48×48, `icon.png` 512×512,
  `apple-icon.png` 180×180). Committed → Adrian pushed → verified **live on
  trackdco.app** (prod head tags present, all icon URLs 200, served `apple-icon.png`
  SHA-256-matches disk). The "not showing" question afterward was just favicon caching,
  not a deploy fault. Adrian then **replaced the logo with the shorter "Trackd"
  wordmark (gold "d")**, overwriting `logo-source.png`; regenerated all three icons and
  re-verified locally the same way (new asset hashes, URLs 200, SHA-match). Committed to
  `main`; left unpushed pending Adrian's go-ahead (push = Vercel prod deploy).
- 2026-06-06: **Legal documents stored.** Adrian supplied the Terms of Service
  (v0.2), Privacy Policy (v0.1), and Medical Disclaimer (v0.2). Confirmed the
  approach with him first (public read; create + apply now), then added the
  `legal_documents` table + enum and seeded the three docs as two tracked
  migrations (SQL in `supabase/legal/`). Text stored verbatim with encoding
  mojibake repaired; Privacy Policy's inline "⚠ NOTE" blocks kept per his
  instruction. Store-only — not wired into signup. Recorded the versioning/dating
  rule (bump all to 1.0 + freeze date at launch; whole-number bumps + re-date per
  change; drop "beta" from filenames at release) in `architecture.md` and the
  launch checklist in `next-tasks.md`. Three Privacy-Policy edits Adrian flagged in
  the copy are parked as open questions until he directs them.
  Later same day: both co-founders reviewed the full text and **approved it as-is**
  — signed off at v0.2 / v0.1 / v0.2 (beta), pending the launch-day bump to 1.0.
- 2026-06-06: **Seed catalogues loaded.** Adrian supplied the Compounds,
  Biomarkers, and IGF-1 reference-range CSVs. Committed them (corrected) under
  `supabase/seed/` with a CSV→SQL generator, then applied two tracked migrations:
  enum extensions + the new `reference_ranges` table, then the seed data (149
  compounds / 41 biomarkers / 4 ranges). Confirmed before acting with Adrian and
  got explicit sign-off on the two schema deltas (extend enums; create
  `reference_ranges`). Fixed biomarker-unit mojibake in flight. Verified counts,
  encoding, RLS, and FK links. `markers` catalogue still to be built — spec handed
  to Adrian and parked in `next-tasks.md`.
- 2026-06-06: **App live on the custom domain.** Pointed `trackdco.app` (root) at
  the Vercel deploy — added an A record at Porkbun (host blank → `216.198.79.1`),
  deleted Porkbun's two parking records, left the Google Workspace MX + TXT
  intact. Verified externally: DNS resolves, HTTPS 200, valid SSL, page renders.
  Decision locked: app served on the bare root (not a subdomain). 7 Jun checkpoint
  hit a day early — Supabase live, schema applied, deploy proven, domain live.
- 2026-06-06: **Deployed to Vercel + installed the Vercel plugin.** Angus created
  the Vercel account (GitHub signup; both founders are abroad on travel data
  eSIMs, so SMS phone verification needed a workaround) and deployed — app is live
  on `*.vercel.app`. Then installed the official Vercel coding-agents plugin
  (`vercel-plugin@vercel` v0.43.0, user scope) after verifying `npx plugins add
  vercel/vercel-plugin` against Vercel's own docs — it's a real June-2026 release;
  an earlier in-session check had wrongly called the command fake. Bun installed
  as a prerequisite. Plugin loads on the next session restart. Next: confirm the
  deploy renders + point `app.trackdco.app`.
- 2026-06-06: **Supabase client layer wired.** Installed `@supabase/ssr` +
  `@supabase/supabase-js`; created browser/server/proxy clients + `updateSession`
  helper, `.env.local` (publishable key) + committed `.env.example`. Used a
  research → synthesise → adversarial-verify workflow because Next 16 broke the
  middleware API — it caught the `middleware` → `proxy` rename and confirmed the
  `getClaims()`/response-object pattern against installed types. `npm run build`
  passes (`ƒ Proxy (Middleware)`, no deprecation warning). Next: Vercel deploy.
- 2026-06-06: **Data model built.** Applied `trackd_schema_v0_4_2.sql` then
  `trackd_storage_policies.sql` to the live project as two tracked migrations via
  the MCP (`apply_migration`); full verification checklist passed (16 tables, 2
  views, RLS everywhere, private `bloodwork` bucket + 4 policies). The back end is
  now standing — next is wiring the app (clients + env + Vercel deploy).
- 2026-06-06: Supabase MCP wired up and authenticated; Supabase agent skills
  installed and pushed (commit `47bb76b`). Confirmed the live DB is still empty —
  the data model has not been applied yet. Split the tracking system: this file
  now records **state only**; all forward-looking steps moved to the new
  `Context/next-tasks.md`.
- 2026-06-05: `ui-context.md` completed and signed off — theme, tokens,
  typography, layout, shadcn/ui + Lucide locked and wired. Design system ready
  for the Week 1 auth screens.
- Timeline: Week 1 exit target 11 Jun; beta to 10–15 testers by 28 Jun.
