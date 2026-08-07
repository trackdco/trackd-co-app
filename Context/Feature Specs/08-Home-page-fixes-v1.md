# Spec — Home Dashboard & Profile

## Conventions
- Preserve existing names: log button "Track"; list "Today's Log" (or "[Weekday]'s Log" when a non-today day is selected); tabs Home / Protocol / + / Progress / Profile.
- Logging model: Today's Log rows are tap-to-log — tapping logs the scheduled dose at the current time and applies the logged state (A3). The full log-dose sheet (A1, A2, A4) is only for off-protocol / custom / edited entries.

## A — Home

**A1.** Log-dose sheet: do not auto-focus the amount field; no keypad on open. Show the preset amount as a value. Keypad appears only when the amount is tapped for a custom value; set `inputMode="decimal"` on that field.

**A2.** Log-dose sheet: the AMOUNT + TIME row must not overflow at 360–390px. Constrain TIME with a `max-width`; no horizontal overflow.

**A3.** Logged Today's Log row: row opacity ~0.5, tick fully opaque, tick fills flat amber (token from `ui-context.md`). No glow.

**A4.** Log time: evaluate at submit (`Date.now()`), not at sheet-open; display ticks each second. A manual time edit overrides and stops live-tracking; clearing it resumes live.

**A5.** Header: remove "Hello, [name]". Show a "Dashboard" title + date above the calendar. Title in Geist (sans), title-sized. Sticky block = title + date + calendar strip, pinned while content scrolls. Date follows the selected calendar day (today when today is selected).

**A6.** Group Today's Log by `compound_category` (its colour token); secondary sort by time. Presentation only, no schema change.

**A7.** Consistency element: adherence only — no streak language, points, rewards, or escalating/celebratory states. Past dates must not read "Upcoming"; label past / today / upcoming by position. Clamp range start to `cycle.start_date`; render nothing before day one.

**A8.** Reconstitution Calculator card: redesign. Must surface powder mg, BAC water mL, resulting concentration, mL per target dose. Maths unchanged (`v_inventory_math`).

**A9.** Remove the Archived section from the home page entirely (content moves to B1).

**A10.** + menu (Shortcuts) layout: a primary "Log a dose" action at the top, then one consistent grid — Add a compound, Journal, Weight, Blood work, Calculator, Calendar. The Weight tile is the only entry point to the weight view (C).

## B — Profile

**B1.** Archive becomes its own page, reachable from Profile alongside Settings / Terms / Privacy / Medical Disclaimer. Lists Archived + Active compounds with Archive / Reactivate (via `is_active`). No hard-delete.

**B3.** Profile picture: user can set/change the avatar from Profile. Backend: avatar storage bucket with owner-scoped RLS + grants (mirror the `bloodwork` bucket); client-side crop/resize; store the path on `profiles`.

**B4.** Input rules:
- Weight: 30–300 kg, up to 2 decimal places.
- Height: 110–250 cm, integer by default; a single decimal is tolerated (do not hard-block).
- Integer part ≤ 3 digits. Validate at input and at write.

**B5.** Rename the static profile weight field to "Starting weight".

**B6.** Sign out: a confirm step ("Sign out?" → Cancel / Confirm) on every entry point (home top-right link + Profile bottom button). The Profile bottom button is styled deep red (destructive token; add one if absent).

## C — Weight (spans home + menu)
- Remove the WEIGHT card from home; weight is reached only via + menu → Weight (A10).
- Weight view: full entry log; log today and back-date past days; retain Trend/Scale toggle.
- Table `weight_logs` (`id`, `profile_id`, `weight numeric(5,2)`, `logged_for date`, `created_at`). RLS wrapping `(SELECT auth.uid())`; explicit PostgREST grants. Unique `(profile_id, logged_for)` — one entry per day, last write wins.
- Bodyweight only (no body composition).
- Copy must not imply a paywall on weight.

## Backend to stand up first
- B3 — avatar storage bucket + policies + grants.
- C — `weight_logs` table + RLS + grants.