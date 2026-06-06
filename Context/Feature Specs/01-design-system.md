# 01 — Design System & UI Primitives

> Read `AGENTS.md` and `Context/ui-context.md` before starting.
> `ui-context.md` is the locked design truth (theme, tokens, type,
> radius, rules). This spec is the **build task** that stands that
> system up and keeps it extensible. Where this spec and a token
> value disagree, `ui-context.md` wins.

## Goal

Stand up the design-system foundation and shadcn/ui primitives so
every screen renders in the locked dark theme without per-component
styling.

## Status

The foundation is **already wired** (`npm run build` passes). This
spec is the source of truth for *how* it's set up and *how* to
extend it — not a greenfield checklist.

- [x] Colour tokens defined once in `app/globals.css` (`:root` +
      `@theme inline`).
- [x] Fonts wired in `app/layout.tsx` via `next/font`
      (Geist, Geist Mono, Playfair Display).
- [x] shadcn/ui installed and configured (`components.json`,
      `lib/utils.ts` `cn()` helper).
- [x] shadcn semantic tokens mapped onto the Trackd palette.
- [x] Lucide React installed.
- [x] First primitive added: `button`.
- [ ] Further primitives — added incrementally as features need them.

## Build Steps

### 1. Colour tokens (`app/globals.css`)

All tokens live **once** in `:root` (the only place raw hex may
appear — see `Context/code-standards.md`). Trackd is dark-only, so
there is no light theme. Token names match `ui-context.md` exactly.
Expose them to Tailwind v4 utilities via an `@theme inline` block so
each token is usable both as `var(--token)` and as a utility (e.g.
`bg-bg-surface`, `text-text-muted`, `border-border-strong`).

### 2. Fonts (`app/layout.tsx`)

Load via `next/font/google` and expose as CSS variables on `<html>`:

- Geist → `--font-geist-sans` (UI text, default body)
- Geist Mono → `--font-geist-mono` (code/mono)
- Playfair Display → `--font-display` (serif headings + wordmark)

Map them to `--font-sans` / `--font-mono` / `--font-display` in the
`@theme inline` block so `font-sans` / `font-mono` / `font-display`
utilities resolve.

### 3. shadcn/ui

Install and configure shadcn/ui on Tailwind v4. Required config
(`components.json`):

- `style: "new-york"`
- `baseColor: "neutral"`
- `cssVariables: true`
- `iconLibrary: "lucide"`
- `css: "app/globals.css"`, aliases under `@/components`, `@/lib`,
  `@/components/ui`, `@/lib/utils`, `@/hooks`

Create `lib/utils.ts` exporting the `cn()` helper (merges Tailwind
classes via `clsx` + `tailwind-merge`).

### 4. Map shadcn semantic tokens → Trackd palette

In `app/globals.css`, alias shadcn's semantic variables onto the
Trackd tokens so primitives render on-theme out of the box. Key
mappings:

| shadcn token   | Trackd token        |
| -------------- | ------------------- |
| `--background` | `--bg-base`         |
| `--foreground` | `--text-primary`    |
| `--card`       | `--bg-surface`      |
| `--popover`    | `--bg-surface-raised` |
| `--primary`    | `--accent-primary` (white) |
| `--secondary`  | `--bg-surface-raised` |
| `--muted`      | `--bg-surface-raised` |
| `--accent`     | `--accent-amber`    |
| `--destructive`| `--state-error`     |
| `--border` / `--input` | `--border-default` |
| `--ring`       | `--accent-amber`    |
| `--chart-1..5` | chart line / amber / green / muted / border-strong |
| `--sidebar*`   | surface / primary / amber / border equivalents |

The `--destructive` → `--state-*` mapping is **UI-only**. The
categorical-never-evaluative rule in `ui-context.md` still governs
health data — never style biomarkers or side effects with state
colours.

The `--radius` base (`1rem`) drives shadcn's `rounded-sm/md/lg/xl`
scale via `@theme inline`.

### 5. Icons

Install Lucide React (shadcn's default). Stroke-based only; sizes
per `ui-context.md` (`h-4 w-4` inline, `h-5 w-5` in buttons).

### 6. Dependencies

`class-variance-authority`, `clsx`, `tailwind-merge`,
`lucide-react`, `tw-animate-css`, `radix-ui`.

## Rules

- **Do not edit the generated `components/ui/*` files.** They are
  protected (see `ai-workflow-rules.md`). Theme **only** through the
  token map in `globals.css` — never by restyling a generated
  component.
- **Add components incrementally, as a feature needs them**
  (`npx shadcn@latest add <name>`). Do not bulk-install the whole
  set and do not hand-write primitives.
- **No hardcoded hex outside `globals.css`.** Use the tokens.

## Check When Done

- All components import without errors.
- `cn()` merges classes correctly.
- No default light styling appears anywhere.
- shadcn utilities (`bg-primary`, `bg-card`, `bg-accent`) render
  on-theme.
- `npm run build` passes.
