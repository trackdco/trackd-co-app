# UI Context

## Theme

Dark only. No light mode. The design language is a calm, editorial
dark interface — near-black backgrounds with subtly layered card
surfaces, generous spacing, and restrained colour. **White is the
primary accent** (primary text, primary actions, emphasis); a warm
**amber** is the secondary signature accent, reserved for
active/interactive state (due doses, current selection, key
metrics). High-contrast serif display type
pairs with a quiet sans-serif for UI labels, giving a premium
"clinical journal" feel rather than a neon technical one.

## Colors

Defined as CSS-variable tokens in `app/globals.css` (Tailwind v4
`@theme` block — see Styling Notes). All components must use these
tokens — **no hardcoded hex values** outside `globals.css`.

| Role             | CSS Variable           | Value                    |
| ---------------- | ---------------------- | ------------------------ |
| Page background  | `--bg-base`            | `#111110`                |
| Surface          | `--bg-surface`         | `#1C1C1A`                |
| Surface elevated | `--bg-surface-raised`  | `#242422`                |
| Surface input    | `--bg-input`           | `#2A2A28`                |
| Primary text     | `--text-primary`       | `#F0EFE9`                |
| Muted text       | `--text-muted`         | `#7A7A74`                |
| Subtle text      | `--text-subtle`        | `#4A4A46`                |
| Primary accent   | `--accent-primary`     | `#FFFFFF`                |
| Amber accent     | `--accent-amber`       | `#C8861A`                |
| Green accent     | `--accent-green`       | `#4ADE80`                |
| Border default   | `--border-default`     | `#2E2E2C`                |
| Border strong    | `--border-strong`      | `#3E3E3A`                |
| Chart line       | `--chart-line`         | `#6B7FD4`                |
| Chart fill       | `--chart-fill`         | `rgba(107,127,212,0.15)` |
| Overlay backdrop | `--overlay-backdrop`   | `rgba(0,0,0,0.70)`       |
| Error            | `--state-error`        | `#EF4444`                |
| Success          | `--state-success`      | `#4ADE80`                |
| Warning          | `--state-warning`      | `#F59E0B`                |

### Rule: state colours are for system/UI feedback ONLY

`--state-error` (red), `--state-success` (green), and
`--state-warning` (amber) are **strictly for UI and system
feedback** — e.g. a failed login, a save error, a successful save,
form validation. They must **never** be used to style **health
data**. Biomarker results and side-effect markers are presented
**categorically and neutrally** (below / within / above — never
high / bad / red, never good / green). Using red/green/amber to
imply a health value is "bad," "good," or "warning" violates the
"categorical, never evaluative" invariant in `architecture.md` and
is not permitted.

> ⚠️ Note: `--accent-green` and `--state-success` share the same
> value (`#4ADE80`). The same caution applies — green is for UI
> accent / system success only, never to signal a health value is
> "good." Chart colours (`--chart-line` / `--chart-fill`) are a
> neutral blue precisely so trend visuals stay non-evaluative.

## Typography

All three faces are wired in `app/layout.tsx` via `next/font` and
exposed as CSS variables, and mapped to Tailwind utilities
(`font-display`, `font-sans`, `font-mono`) in `app/globals.css`.

| Role          | Font             | Variable            | Status   |
| ------------- | ---------------- | ------------------- | -------- |
| Display/serif | Playfair Display | `--font-display`    | ✅ wired |
| UI text       | Geist            | `--font-geist-sans` | ✅ wired |
| Code/mono     | Geist Mono       | `--font-geist-mono` | ✅ wired |

**Notes**

- The large headings ("Good morning, Angus.") and the `trackd`
  wordmark use a high-contrast Didone-style serif. **Playfair
  Display** is the closest visual match to the screenshot and is now
  installed; swap it later if the exact intended face is known.
  Apply it with the `font-display` utility.
- UI text, labels, metadata, and buttons use the sans (Geist),
  which is also the default body font.

## Border Radius

Read from the screenshot's rounded cards, pills, and date chips.

| Context           | Class                                |
| ----------------- | ------------------------------------ |
| Inline / small UI | `rounded-full` (pills, date circles) |
| Cards / panels    | `rounded-2xl`                        |
| Modals / overlays | `rounded-3xl`                        |

## Component Library

**shadcn/ui on Tailwind v4** — installed. Components are copied into
`components/ui/` and owned in-repo, so they theme freely to this
custom dark look. Setup in place: `components.json` (new-york style,
neutral base, `lib/utils.ts` `cn()` helper), and `button` added as
the first component. Add more with `npx shadcn@latest add <name>`
rather than hand-writing them. `components/ui/**` is protected (see
`ai-workflow-rules.md`).

shadcn's semantic tokens are **mapped onto the Trackd palette** in
`app/globals.css` (e.g. `--primary` → `--accent-primary` white,
`--accent` → `--accent-amber`, `--card` → `--bg-surface`,
`--destructive` → `--state-error`). So shadcn utilities like
`bg-primary` / `bg-card` / `bg-accent` render on-theme out of the
box. The `--state-*` mapping is UI-only — the colour rule above
still applies to health data.

## Layout Patterns

- Mobile-first single column: vertically stacked sections on a
  near-black canvas with generous vertical rhythm (this is a PWA;
  the screenshot is the today-dashboard / protocol clock).
- Top app bar: wordmark left, icon actions (calendar, bell) right,
  no bottom border — separation comes from spacing.
- Horizontal date strip: 7-day row of circular day chips; the
  active day is outlined in the amber accent, others filled neutral.
- Metric cards: 2-up grid of surface cards (e.g. Compliance,
  Next Dose) with a muted uppercase label and a large value.
- List sections: a "TODAY'S PROTOCOL" header with a "View all"
  link, then stacked rows (item name + meta + status pill).
- Status pills: amber filled = actionable ("Due now"); outlined
  muted = resolved ("Logged"). These are UI-state colours, not
  health-data semantics.

## Styling Notes

- Tailwind **v4** (CSS-first). The colour tokens above are defined
  once in `:root` in `app/globals.css` (the only place hex may
  appear) and exposed to Tailwind via an `@theme inline` block, so
  every token is usable both as `var(--token)` and as a utility
  (e.g. `bg-bg-surface`, `text-text-muted`, plus the shadcn
  semantic utilities). The `--radius` scale drives `rounded-sm/md/lg/xl`.
- Surfaces layer by elevation: `--bg-base` (page) → `--bg-surface`
  (cards) → `--bg-surface-raised` (raised) → `--bg-input` (fields).
- Follow the border-radius scale above; no hardcoded hex outside
  `globals.css`.

## Icons

**Lucide React** — installed (shadcn's default icon set).
Stroke-based icons only. Sizes: `h-4 w-4` inline, `h-5 w-5` in
buttons.
