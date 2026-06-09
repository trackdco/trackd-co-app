# Bottom Navigation Bar

## Goal
Build the persistent bottom navigation bar for the Trackd mobile PWA — the main way users move between the app's primary sections. This is a skeleton: navigation and selected-state styling should work, but no data or real functionality is wired up yet. It will be refined in later chapters.

## Out of Scope
- Do NOT wire up any database, data fetching, or real functionality — the backend isn't connected yet.
- Do NOT build out the actual content of the Home, Protocol, Progress, or Profile screens. Each is a blank placeholder this round; we build them individually later (this includes the Home/dashboard — a blank placeholder for now).
- Do NOT make the "Add to Stack" menu functional. It opens and shows a title and a search bar only; the search does nothing yet.

- Do NOT create new shared/reusable components without flagging and asking us first.
- Do NOT introduce colours, fonts, or styles outside what `ui-context.md` defines.

## Design Decisions
Refer to `ui-context.md` for all styling — the amber accent, the gray unselected state, the title/heading font, spacing, and the treatment of the center plus. Do not hardcode any of these values; pull them from the file.

**Layout (left → right): two tabs, the plus, two tabs.**
1. Home — home icon (far left)
2. Protocol — needle/syringe icon (inner left, closer to the plus)
3. Center — white "plus" button
4. Progress — graph/chart icon (inner right, closer to the plus)
5. My Profile — profile/face icon (far right)

**States:**
- The four tabs (Home, Protocol, Progress, My Profile) use the gray unselected style from `ui-context.md`.
- The selected tab uses the amber accent from `ui-context.md`.
- On tap, the tapped tab turns amber and all others return to gray. Only one tab is selected at a time, driven by the current route.
- The white plus is NOT part of the selected/gray logic. It always stays white, regardless of which tab is active.
- On selection, add a subtle fade transition: the active icon eases from gray to amber. Keep it short and restrained, consistent with the restraint rules in `ui-context.md`.

**Behaviour:**
- The bar is persistent across all main screens — same position and appearance on each.
- Tapping a tab navigates to that section's screen.
- The center plus does NOT navigate. It opens an "Add to Stack" menu (dropdown/sheet) containing the heading "Add to Stack" and a search bar. Non-functional for now.
- Hide the bar when the on-screen keyboard opens; show it again when the keyboard is dismissed.
- Respect bottom safe-area insets (iPhone home indicator, Android gesture bar) so the bar sits above them and stays fully tappable.

## Implementation
Follow the project structure and conventions in `architecture.md` (Next.js App Router, mobile PWA, Vercel) and `code-standards.md`. The paths below are the proposed structure — adjust to match `architecture.md` if it differs.

**Work through this ONE STEP AT A TIME.** Implement a step, confirm it builds with no TypeScript or lint errors, then move to the next. Do not build everything at once. This is reinforced in `code-standards.md`.

1. Create the bottom nav component (e.g. `components/navigation/bottom-nav.tsx`). Render the five elements in order — Home, Protocol, Plus, Progress, My Profile — as two tabs, the center plus, then two tabs, using the icons noted in Design Decisions and styled per `ui-context.md`.
2. Add selected-state logic: read the current route to determine the active tab. Active = amber, others = gray, per `ui-context.md`. Exclude the white plus from this logic. Add the subtle gray→amber fade on the active icon.
3. Make the bar persistent by placing it in the main layout (e.g. a `app/(main)/layout.tsx` route group) so it renders across the Home, Protocol, Progress, and Profile screens.
4. Create the four placeholder route pages (e.g. `app/(main)/page.tsx` for Home, `app/(main)/protocol/page.tsx`, `app/(main)/progress/page.tsx`, `app/(main)/profile/page.tsx`). Each is a blank page that shows only its section title — "Home", "My Protocol", "Progress", "My Profile" — in the title font from `ui-context.md`. Set Home as the default/landing route of the group.
5. Wire each tab tap to navigate to its matching route.
6. Build the center plus so it opens an "Add to Stack" menu (e.g. `components/navigation/add-to-stack-menu.tsx`) with the heading "Add to Stack" and a non-functional search bar. The plus should be slightly elevated than the other tabs, but not elevated to the point where it's too far above them. 
7. Add keyboard-aware hiding (hide when the keyboard opens, restore on dismiss) and bottom safe-area inset handling.

**Deployment / preview:**
- Deploy to a Vercel preview subdomain so we can view and edit it from the subdomain URL. Confirm the preview deployment is live and share the link.

## Check When Done
- [ ] Bottom bar renders five elements in order: Home, Protocol, white Plus, Progress, My Profile (two tabs either side of the plus)
- [ ] The white plus always stays white — never turns amber or gray
- [ ] Tapping a tab turns it amber and returns the others to gray (one active at a time, driven by route)
- [ ] A subtle gray→amber fade plays on selection
- [ ] Tabs navigate to the correct placeholder screen, and the bar stays persistent across them
- [ ] Each placeholder page shows only its section title in the title font
- [ ] Home is the default/landing route
- [ ] The center plus opens the "Add to Stack" menu with a heading and a search bar (non-functional)
- [ ] The bar hides when the keyboard opens and returns when dismissed
- [ ] The bar respects bottom safe-area insets (iPhone home indicator, Android gesture bar)
- [ ] No new shared components created without flagging
- [ ] No TypeScript errors
- [ ] No lint errors
- [ ] Deployed to a Vercel preview subdomain and viewable
- [ ] Built step by step, each step verified before the next (per `code-standards.md`)