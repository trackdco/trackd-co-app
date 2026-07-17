# Spec — Quick-Actions FAB + Calculator Nav Slot

> Format follows the `01-design-system` house template. UI-only spec — no schema surface.

---

## Preflight

Complete all items and **report findings in the chat before writing any code.** Await founder go.

1. Read the canonical context files per `AGENTS.md` — at minimum `ui-context.md`, `architecture`, `code-standards`.
2. Locate the bottom nav component. List every slot verbatim: label, icon, route, and any special styling on the centre slot.
3. Locate the current plus/quick-add dropdown. **Enumerate every action verbatim: label, icon, destination route or handler.** Paste this list into the chat. This enumeration, minus any calculator action, is the canonical action set for the new menu — no other additions or removals (see D6).
4. Locate the reconstitution calculator. Report whether a standalone route already exists, or whether the component lives embedded inside the add-compound flow, and at what path(s). This determines Step 1's shape (see D5).
5. Confirm the installed `lucide-react` version exports `Calculator` (and whatever close/plus icons the design system already uses).
6. Check `ui-context.md` for existing tokens covering: scrim/overlay, elevated card surface, motion durations/easing, z-index scale. Reuse these — flag if any is missing rather than inventing values.
7. Note the repo's route-file convention (App Router) so the calculator route matches existing pages.

**Schema preflight: N/A** — deliberately skipped, this spec touches no data. If any step appears to require a schema change, stop: the spec is wrong or the step is out of scope.

---

## Goal

Move quick-add out of the bottom nav's centre slot into a floating action button pinned bottom-right, above the nav bar, fixed while the page scrolls. Tapping it opens a Pep-AI-style pop-up: the plus rotates into an X, a scrim dims the page, and a card with a grid of icon actions appears above the button. Every action currently in the dropdown carries over unchanged, with one deliberate exception: any calculator action is removed — its new permanent nav slot replaces it (D6).

The freed centre nav slot becomes **Calculator** (Lucide `Calculator` icon), a standard nav item opening the reconstitution calculator as a standalone page — promoting one of the four core differentiators to permanent nav real estate.

---

## Out of Scope

- Any change to the destination screens or flows the quick actions open. Actions navigate to exactly what they navigate to today.
- Any change to reconstitution calculator logic, inputs, or maths. This spec only gives it a route.
- New quick actions, or removing existing ones — except the calculator action, which D6 deliberately removes.
- Changes to any other nav slot (labels, icons, routes, order).
- Schema, RLS, grants, tier gating, notifications, offline/PWA work.
- Desktop-specific redesign — the shell keeps whatever responsive behaviour it has today.
- New design tokens. If a needed token is missing, flag it; don't invent.

---

## Design Decisions

**D1 — Interaction pattern (cloned from reference, restyled to house).** Closed state: circular FAB, Lucide `Plus`, pinned bottom-right. Open sequence on tap: (a) icon rotates 45° so the plus reads as an X, (b) a scrim fades in over the full viewport including the bottom nav, (c) a rounded card slides up + fades in (~180 ms, design-system easing), anchored above the FAB and spanning most of the viewport width with side margins. Card content: grid of actions, each a circular icon container with its label centred beneath. Tapping an action closes the menu and fires that action's existing destination. Tapping the X or the scrim reverses the animation. **All visual values — colour, radius, elevation, type, scrim opacity — come from `ui-context.md` tokens. Nothing visual is copied from the reference: no gradients, no heavy blur, no Pep AI palette.** Bloomberg restraint applies; icons are monochrome per the design system, no evaluative colour.

**D2 — Grid.** Three columns; rows wrap to fit however many actions preflight enumerates (reference shows 3×2). Labels may wrap to two lines, centre-aligned. Minimum 44 px touch targets.

**D3 — FAB placement.** Rendered once in the authenticated app shell, so it appears on every screen that shows the bottom nav and nowhere else. `position: fixed`; offset = nav height + `env(safe-area-inset-bottom)` + a spacing token; right offset = spacing token. Z-index: above page content, above the bottom nav, below dialogs/toasts per the existing scale.

**D4 — Centre nav slot.** Becomes a standard nav item — identical styling, sizing, and active-state treatment to its siblings. Any raised/special styling the old plus trigger had is removed. Active state via route match on the calculator page.

**D5 — Standalone calculator page.** Mount the existing calculator component on its own route; zero logic changes. If preflight shows the component is coupled to add-compound state such that this isn't a lift-and-mount, **stop and report** — decoupling is its own spec, not a mid-build refactor.

**D6 — Action set is the preflight enumeration, minus the calculator.** If the enumeration includes a calculator/reconstitution action, exclude it from the new menu — the permanent Calculator nav slot (D4) is now its sole entry point, and duplicating it wastes a grid cell. Report the exclusion in the build chat so it's on the record. No other additions or removals.

**D7 — Motion, scroll, focus.** Respect `prefers-reduced-motion` (no rotation/slide; instant show/hide). Body scroll locked while open. Escape closes on hardware keyboards. Focus moves into the menu on open and returns to the FAB on close. FAB carries `aria-expanded` and a state-appropriate `aria-label` (e.g. "Open quick actions" / "Close quick actions").

**D8 — State.** Open/closed is local component state (`useState`). No persistence, no global store, no context provider unless the shell's structure genuinely forces one — flag if so.

---

## Implementation Steps

One step at a time; verify each before the next.

1. **Calculator route.** Create the standalone page per the repo's route convention (path named in preflight) and mount the existing calculator component — or, if a standalone route already exists, confirm it and skip creation. Verify: page loads, calculator fully functional, no logic diff.
2. **Nav swap.** Replace the centre slot with the Calculator nav item (D4). Remove the plus trigger from the nav. Leave the old dropdown component in place but unreferenced for now. Verify: nav renders correctly, active states work across all tabs, nothing else in the nav changed.
3. **FAB shell.** Build the FAB in the app shell: positioning, safe-area offset, z-index, rotation animation, open/close state, scrim. No menu content yet. Verify on a real phone: sits above the nav, clears the iOS home indicator, stays fixed during scroll.
4. **Quick-actions menu.** Build the card + grid (D1, D2), wire every enumerated action (minus the D6 calculator exclusion), implement all dismissal paths and D7 behaviours. Verify: each action reaches its identical destination.
5. **Remove dead code.** Delete the old dropdown component and any orphaned imports/handlers. Verify: clean build, grep confirms no references remain.
6. **Device pass + close-out.** Run the full acceptance list on both founders' phones (iOS Safari PWA install + Android). Update `progress-tracker.md`.

---

## Acceptance Criteria

- [ ] Centre nav slot shows Calculator with standard sibling styling; tap opens the standalone calculator page; active state highlights on that route.
- [ ] Calculator behaves identically to before — same component, no logic changes.
- [ ] FAB appears bottom-right on every screen with the bottom nav, and only those; stays fixed while scrolling; clears the iOS safe area.
- [ ] Tap FAB → plus rotates to X, scrim dims the full page, grid card animates in above the button.
- [ ] Every preflight-enumerated action except the excluded calculator action is present with correct label, icon, and destination; tapping one closes the menu and lands where the old dropdown did.
- [ ] No calculator entry appears in the quick-actions menu — the nav slot is its only entry point.
- [ ] Tap X or scrim → reverse animation, icon rotates back, scroll unlocks, focus returns to the FAB.
- [ ] Old dropdown code deleted; no orphan imports; build clean; no console errors.
- [ ] `prefers-reduced-motion` honoured; touch targets ≥ 44 px; `aria-expanded` correct in both states.
- [ ] Verified on both founders' phones (iOS PWA + Android).
- [ ] `progress-tracker.md` updated; any D5/D6 flags reported back to founder.