# Trackd — Plus Button "Shortcuts" Menu (Spec)

> **Run this the standard way.** Read the always-on context files first — `ai-workflow-rules.md`, `architecture.md`, `code-standards.md`, `ui-context.md`, `project-overview.md` — then implement **one step at a time, verifying each step before starting the next** (per `code-standards.md`). Do not batch the steps. If anything below conflicts with `ui-context.md`, `ui-context.md` wins.

---

## 1. Goal

Change the bottom-nav plus button so that, instead of opening the add-to-cycle sheet directly, it opens a styled **"Shortcuts"** menu inside the existing bottom sheet. The menu lists seven actions; **only "Add a compound" is wired to real functionality** (the existing add-to-cycle flow), and the other six open a single shared placeholder sheet so they can be linked to real sections later.

---

## 2. Out of Scope (do NOT build these)

- **Do NOT** build, design, or modify the actual sections behind the six placeholder items (Today's dose, Track your weight, Reconstitution calculator, Journal, Track your blood work, Calendar). They are placeholders only for now.
- **Do NOT** rebuild, refactor, restyle, or change the existing add-to-cycle flow (the current "Track your cycle" sheet content). Reuse it exactly as-is; only change *how it is reached*.
- **Do NOT** build the bottom sheet container, its slide-up animation, drag handle, or dismiss behaviour — these already exist. Only add the menu content inside it.
- **Do NOT** add any user/auth/compound database, persistence, state, or save logic for the placeholders. The placeholder text field is non-functional / visual only.
- **Do NOT** introduce new design tokens, colours, fonts, or spacing values. Use only what `ui-context.md` defines.
- **Do NOT** create new component primitives if `ui-context.md` already defines a suitable list-row / card primitive — compose from the existing one instead.
- **Do NOT** wire navigation, routing, or real handlers for any item except "Add a compound."

---

## 3. Design Decisions

**Authoritative reference: `ui-context.md`** (the "Obsidian" system — cool near-blacks, hairline borders, Playfair Display headings, amber accent with strict restraint, shadcn/Lucide outline icons). Everything in this section is subordinate to it.

**Visual intent:** take the *idea* from MacroFactor's Shortcuts sheet (a clean action menu in a bottom sheet) but **not** its minimalist look. Trackd's version should feel more substantial, sporty, and masculine — achieved through surface treatment, icon tiles, type weight, and generous spacing, all **within** the Obsidian tokens (never by overriding them).

**Layout** — a single vertical stack of full-width action cards (not MacroFactor's two-tier circle-row + thin-list split). Seven cards, in this fixed order:

1. Add a compound
2. Today's dose
3. Track your weight
4. Reconstitution calculator
5. Journal
6. Track your blood work
7. Calendar

**Card anatomy** — leading icon tile (rounded-square / "squircle", hairline border, subtle raised near-black fill) → title (Obsidian label/heading token, strong weight) → one-line subtitle (muted token) → trailing chevron. Each card is its own raised surface with a hairline border and comfortable padding. The larger touch targets and per-card surfaces are deliberately what makes this read less minimalist / more app-like than MacroFactor's thin rows.

**Header** — the sheet header reads **"Shortcuts"** with a close affordance. (The existing add-to-cycle view keeps its own "Track your cycle" title — leave it alone.)

**Accent restraint** — amber is used sparingly per `ui-context.md` (e.g. icon-stroke or pressed/active state only). **Do not** give "Add a compound" any primary/elevated emphasis; it is simply first in the list. Product note: adding compounds is a setup action, not the most-used one — most usage will be tracking — so it must not visually dominate.

**Icons** — shadcn / Lucide outline ("holo" / hairline) style as defined in `ui-context.md`. Proposed Lucide names below; **confirm against what's installed and against `ui-context.md`'s icon guidance**:

| Item | Proposed icon | Alt |
|---|---|---|
| Add a compound | `Pill` | — |
| Today's dose | `Syringe` | `Droplet` |
| Track your weight | `Weight` | `Scale` |
| Reconstitution calculator | `Calculator` | — |
| Journal | `NotebookPen` | `BookOpen` |
| Track your blood work | `ClipboardList` | `TestTube` |
| Calendar | `CalendarDays` | `Calendar` |

**Rough layout sketch** (structure only — not final styling):

```
┌─────────────────────────────────────┐
│            ▬▬  (drag handle)         │
│  Shortcuts                       ✕   │
├─────────────────────────────────────┤
│  ┌────┐  Add a compound          ›   │
│  │icon│  Add a new compound...       │
│  └────┘                              │
│  ┌────┐  Today's dose            ›   │
│  │icon│  Log, edit or delete...      │
│  └────┘                              │
│             ... 5 more cards ...     │
│  ┌────┐  Calendar                ›   │
│  │icon│  View your logged history    │
│  └────┘                              │
└─────────────────────────────────────┘
```

**Item behaviour:**

- **Add a compound** → opens the existing add-to-cycle flow ("Track your cycle"). Reuse the existing component; do not rebuild or modify it.
- **All six others** → open the shared `PlaceholderActionSheet` with that item's title (and, for Reconstitution calculator, a warning line).

**Suggested card subtitles** (copy is easily edited later):

- Add a compound — "Add a new compound to your cycle"
- Today's dose — "Log, edit or delete today's doses"
- Track your weight — "Record your bodyweight"
- Reconstitution calculator — "Work out your reconstitution"
- Journal — "Free-write and track how you feel"
- Track your blood work — "Enter and review your bloods"
- Calendar — "View your logged history"

**Reconstitution calculator warning copy** (shown on the placeholder now so it isn't forgotten — refine when the real calculator is built):

> "For personal tracking only — not medical or dosing advice. Always confirm any figure with a qualified medical professional before acting on it."

---

## 4. Implementation

Resolve all exact paths and imports from `architecture.md`; the paths below are **proposed** and should be adapted to the repo's actual structure and naming conventions. Build in this order, **verifying each step (renders correctly, no TypeScript/lint errors, matches Obsidian) before starting the next** (per `code-standards.md`).

**Step 1 — Item config.**
Create `src/components/shortcuts/shortcutItems.ts` (adapt path). Export a typed array, one entry per item: `{ id, title, subtitle, icon, action: 'route' | 'placeholder', warning?: string }`. This is the single source of truth for the menu — future linking is just swapping an item's `action`/handler. No UI in this file.
*Verify:* file type-checks; array has all 7 items in the order above; only `add-compound` has `action: 'route'`; only the calculator carries a `warning`.

**Step 2 — Card component.**
Create `src/components/shortcuts/ShortcutItem.tsx`. Props: `{ title, subtitle, icon, onPress }`. **If `ui-context.md` defines a list-row/card primitive, compose `ShortcutItem` from it**; otherwise build it as a thin new component using Obsidian tokens only (icon tile + title + subtitle + chevron, raised surface, hairline border). No business logic in here.
*Verify:* renders in isolation with dummy props; matches Obsidian styling; no lint/TS errors.

**Step 3 — Placeholder sheet.**
Create `src/components/shortcuts/PlaceholderActionSheet.tsx`. Props: `{ open, onClose, title, warning? }`. Renders: the passed title, **one non-functional text input** (visual only — no state, no save), an optional warning block shown only when `warning` is provided, and a close control. One reusable component used by all six placeholders. Match `ui-context.md` modal/sheet patterns.
*Verify:* opens/closes; shows the passed title; warning appears only when passed; nothing persists anywhere.

**Step 4 — Menu component.**
Create `src/components/shortcuts/ShortcutsMenu.tsx`. Maps `shortcutItems` → `ShortcutItem`s. On press: if `action === 'route'` and `id === 'add-compound'`, trigger the existing add-to-cycle flow; if `action === 'placeholder'`, open `PlaceholderActionSheet` with that item's `title` (and `warning` if present). Track which placeholder is open via local state only.
*Verify:* all 7 cards render in order with correct icons/labels; each placeholder opens with the right title; the calculator placeholder shows the warning.

**Step 5 — Wire into the existing sheet / plus button.**
Locate the existing bottom sheet and the plus-button trigger (resolve exact files from `architecture.md`). Change the sheet's default content to render `ShortcutsMenu` instead of the add-to-cycle UI, set the sheet header to "Shortcuts," and **preserve** the existing slide-up animation, drag handle, and dismiss behaviour. **Preserve** the existing add-to-cycle view and present it from the "Add a compound" item — navigate to it or swap the sheet's content, whichever matches the current structure. **Do not modify the add-to-cycle logic itself.**
*Verify:* plus button now opens the Shortcuts menu (not the old add screen); "Add a compound" reaches the unchanged add-to-cycle flow; the other six open the placeholder sheet; the sheet's dismiss still works.

---

## 5. Check When Done

- [ ] No new component primitives beyond `ShortcutsMenu`, `ShortcutItem`, `PlaceholderActionSheet`, and `shortcutItems.ts` (existing primitives reused where `ui-context.md` provides them).
- [ ] No new design tokens, colours, or fonts introduced — only `ui-context.md` values used.
- [ ] No TypeScript errors.
- [ ] No lint errors.
- [ ] Plus button opens the "Shortcuts" menu, not the old add-to-cycle screen.
- [ ] All 7 cards present, correct order, correct icons and labels.
- [ ] "Add a compound" opens the existing add-to-cycle flow, completely unchanged.
- [ ] The six placeholders each open the shared placeholder sheet with the correct title.
- [ ] Reconstitution calculator placeholder shows the warning line.
- [ ] Placeholder text field saves nothing; no DB / persistence / state added for it.
- [ ] Existing bottom-sheet slide-up, drag handle, and dismiss behaviour unchanged.
- [ ] Built one step at a time, each step verified before the next was started.

---

## 6. Addition — Reorder cards (long-press to rearrange)

> This section is **additive**. Sections 1–5 are unchanged. It introduces **one** deliberate, narrow exception to §2 (see scope note below); everything else in §2 still stands.

### Goal

Long-pressing any card puts the menu into a reorder mode where each card shows a grip handle and can be dragged up/down to rearrange. The chosen order is saved locally and restored next time the menu opens.

### Scope note — the one carve-out to §2

- **Allowed and required:** persisting **only the menu's card order** (an array of item ids) in local device storage.
- **Still out of scope (per §2):** no user/auth/cloud database, no persistence for the placeholder text inputs, no backend. The carve-out is the card order and nothing else.

### Design Decisions (additive — subordinate to `ui-context.md`)

- **Trigger:** long-press on any card enters reorder mode (matches "hold down on any of them").
- **In reorder mode:** every card shows a grip handle (the "three lines" — propose Lucide `GripVertical`; use `Menu` / `AlignJustify` if the literal horizontal-lines look is preferred, per `ui-context.md`). Cards become draggable; a card tap does nothing in this mode (no navigation, no placeholder). A subtle **"Done"** affordance appears in the sheet header (alongside or replacing the close) to exit.
- **Drag feedback:** the lifted card gets a subtle raise/shadow within Obsidian tokens; the others shift to make room. Keep it restrained — no flashy motion.
- **Exit:** tapping "Done" or dismissing the sheet exits reorder mode and commits the order; normal tap behaviour resumes.
- **Persistence:** save the ordered id array to local storage on exit (or on each drop). On mount, load and apply the saved order; if none exists, fall back to the default order in `shortcutItems.ts`. Unknown/newly added ids append in their default position.
- **All seven cards are reorderable** — nothing pinned.

### Implementation (continue the one-step-at-a-time, verify-before-next rule)

**Step 6 — Order persistence helper.**
Create `src/lib/shortcutOrder.ts` (adapt path per `architecture.md`). Two functions: load saved order (`string[]` of ids, or null) and save order. Use the project's existing local-storage mechanism (resolve from `architecture.md` — e.g. AsyncStorage / MMKV / localStorage). Add no new dependency if one already exists.
*Verify:* save → load round-trips; a missing key returns null cleanly.

**Step 7 — Reorder-aware card.**
Edit `ShortcutItem.tsx` to accept a `reordering: boolean` prop: when true, show the grip handle and disable `onPress`; when false, behave exactly as in §4. Do not change its default (non-reorder) appearance.
*Verify:* handle shows only in reorder mode; tap is inert in reorder mode; non-reorder behaviour identical to §4.

**Step 8 — Reorder in the menu.**
Edit `ShortcutsMenu.tsx`: add `reordering` state (false by default), enter on long-press, exit on "Done" / dismiss. Render the list via the project's drag-to-reorder approach (resolve from `architecture.md` / `ui-context.md`; if none exists, add one library consistent with the stack — e.g. RN: `react-native-draggable-flatlist`; web: dnd-kit or framer-motion `Reorder`). On reorder, update in-memory order; on exit, persist via the Step 6 helper; on mount, apply the saved order.
*Verify:* long-press enters mode and shows handles; drag reorders; "Done" exits and the new order survives a full close/reopen **and** an app restart.

**Step 9 — Gesture arbitration (the main gotcha).**
Ensure the card drag takes precedence over the sheet's drag-to-dismiss/pan while in reorder mode (e.g. disable or restrict the sheet's pan to its handle during reorder). Confirm the two gestures do not fight.
*Verify:* dragging a card mid-list never starts dismissing the sheet; the sheet still dismisses normally when not in reorder mode.

### Check When Done (reorder addition)

- [ ] Long-press on any card enters reorder mode; grip handles appear on all cards.
- [ ] Cards drag up/down to any position; all 7 are reorderable, none pinned.
- [ ] Tapping a card does nothing in reorder mode (no navigation, no placeholder).
- [ ] "Done" or dismissing the sheet exits reorder mode and commits the order.
- [ ] New order persists across a full close/reopen and an app restart.
- [ ] Only the card-order array is persisted — no user/cloud DB, no placeholder-input persistence (rest of §2 intact).
- [ ] Card drag does not conflict with the sheet's drag-to-dismiss.
- [ ] Default (non-reorder) menu appearance and behaviour from §1–§5 unchanged.
- [ ] No new TypeScript or lint errors.
- [ ] Built one step at a time, each verified before the next.